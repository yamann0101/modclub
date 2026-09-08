export type VoiceSignal = {
  id: string;
  from: string;
  type: 'offer' | 'answer' | 'ice';
  payload: unknown;
};

type SendSignal = (to: string, type: VoiceSignal['type'], payload: unknown) => Promise<void>;

type RoomVoiceOpts = {
  selfName: string;
  sendSignal: SendSignal;
  onTalking?: (names: string[]) => void;
  onSpeakingSelf?: (on: boolean) => void;
};

const ICE: RTCConfiguration = {
  iceCandidatePoolSize: 4,
  iceTransportPolicy: 'all',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

function preferOpus(sdp = '') {
  return sdp.replace(
    /a=fmtp:(\d+) (.*)/g,
    (line, id, rest) => (rest.includes('useinbandfec') && !rest.includes('maxaveragebitrate')
      ? `a=fmtp:${id} ${rest};maxaveragebitrate=128000;stereo=0`
      : line),
  );
}

function silentWav() {
  const rate = 8000;
  const samples = rate;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

const HOLD_SRC = silentWav();

export class RoomVoice {
  private selfName: string;
  private sendSignal: SendSignal;
  private onTalking?: (names: string[]) => void;
  private onSpeakingSelf?: (on: boolean) => void;

  private peers = new Map<string, RTCPeerConnection>();
  private makingOffer = new Set<string>();
  private iceBag = new Map<string, RTCIceCandidateInit[]>();
  private remotes = new Map<string, HTMLAudioElement>();
  private local: MediaStream | null = null;
  private wantMic = false;
  private speaker = true;
  private busy = false;
  private dead = false;
  private hold: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private levelGen = 0;
  private talking = new Set<string>();
  private lastSelfSpeak = false;

  constructor(opts: RoomVoiceOpts) {
    this.selfName = opts.selfName;
    this.sendSignal = opts.sendSignal;
    this.onTalking = opts.onTalking;
    this.onSpeakingSelf = opts.onSpeakingSelf;
    this.ensureHold();
  }

  get micOn() {
    return this.wantMic;
  }

  get speakerOn() {
    return this.speaker;
  }

  get isBusy() {
    return this.busy;
  }

  unlock() {
    this.ensureHold();
    this.playHold();
    try { void this.ctx?.resume(); } catch { /* ignore */ }
    this.pumpRemotes();
  }

  setSpeaker(on: boolean) {
    this.speaker = on;
    this.pumpRemotes();
  }

  async setMic(on: boolean) {
    if (this.dead || this.busy) return this.wantMic;
    this.busy = true;
    try {
      this.wantMic = on;
      if (!on) {
        this.stopLocal();
        await this.pushLocalTrack();
        return false;
      }
      this.unlock();
      await this.openMic();
      await this.pushLocalTrack();
      return true;
    } catch {
      this.wantMic = false;
      this.stopLocal();
      await this.pushLocalTrack().catch(() => undefined);
      throw new Error('mic_denied');
    } finally {
      this.busy = false;
    }
  }

  async syncMembers(names: string[]) {
    if (this.dead) return;
    const live = new Set(names.filter((name) => name && name !== this.selfName));
    for (const name of [...this.peers.keys()]) {
      if (!live.has(name)) this.dropPeer(name);
    }
    for (const name of live) {
      if (this.peers.has(name)) continue;
      await this.createPeer(name, this.selfName.localeCompare(name) < 0);
    }
    this.pumpRemotes();
  }

  async handleSignals(signals: VoiceSignal[]) {
    if (this.dead) return;
    for (const signal of signals) {
      try {
        await this.consume(signal);
      } catch {
        /* stale */
      }
    }
  }

  destroy() {
    this.dead = true;
    this.wantMic = false;
    this.stopLocal();
    for (const name of [...this.peers.keys()]) this.dropPeer(name);
    this.peers.clear();
    this.iceBag.clear();
    this.makingOffer.clear();
    this.remotes.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    this.remotes.clear();
    if (this.hold) {
      this.hold.pause();
      this.hold.remove();
      this.hold = null;
    }
    try { void this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.setTalk(this.selfName, false);
    this.talking.clear();
    this.onTalking?.([]);
  }

  private ensureHold() {
    if (this.hold) return;
    const audio = document.createElement('audio');
    audio.src = HOLD_SRC;
    audio.loop = true;
    audio.volume = 0.01;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('autoplay', '');
    audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(audio);
    this.hold = audio;
  }

  private playHold() {
    if (!this.hold) return;
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch { /* safari */ }
    this.hold.muted = false;
    this.hold.volume = 0.01;
    void this.hold.play().catch(() => undefined);
  }

  private pumpRemotes() {
    this.playHold();
    this.remotes.forEach((audio) => {
      audio.muted = !this.speaker;
      audio.volume = 1;
      void audio.play().catch(() => undefined);
    });
  }

  private stopLocal() {
    this.levelGen += 1;
    this.local?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.local = null;
    this.setTalk(this.selfName, false);
  }

  private async openMic() {
    this.stopLocal();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS, video: false });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    if (!this.wantMic || this.dead) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('parked');
    }
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.enabled = true;
      try { track.contentHint = 'speech'; } catch { /* ignore */ }
      track.onended = () => {
        if (this.wantMic && !this.dead && !this.busy) {
          void this.setMic(true).catch(() => undefined);
        }
      };
    }
    this.local = stream;
    this.watchLevel(stream);
  }

  private localTrack() {
    return this.local?.getAudioTracks().find((track) => track.readyState === 'live') || null;
  }

  private async pushLocalTrack() {
    const track = this.localTrack();
    for (const [name, peer] of this.peers) {
      await this.attach(peer, track);
      // Renegotiate so the new mic track is actually offered to the peer.
      if (track && peer.connectionState !== 'closed' && peer.signalingState === 'stable') {
        await this.offer(name, peer);
      }
    }
  }

  private async attach(peer: RTCPeerConnection, track: MediaStreamTrack | null) {
    const sender = peer.getSenders().find((item) => item.track?.kind === 'audio')
      || peer.getSenders().find((item) => !item.track)
      || peer.getTransceivers().find((item) => item.receiver.track?.kind === 'audio')?.sender;
    if (sender) {
      if (sender.track !== track) await sender.replaceTrack(track);
      return;
    }
    if (track && this.local) peer.addTrack(track, this.local);
  }

  private async createPeer(name: string, initiate: boolean) {
    if (this.peers.has(name)) return;
    const peer = new RTCPeerConnection(ICE);
    this.peers.set(name, peer);
    peer.addTransceiver('audio', { direction: 'sendrecv' });
    await this.attach(peer, this.localTrack());

    peer.onicecandidate = (event) => {
      if (!event.candidate || this.dead) return;
      void this.sendSignal(name, 'ice', event.candidate.toJSON()).catch(() => undefined);
    };

    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      event.track.enabled = true;
      this.bindRemote(name, stream);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') this.pumpRemotes();
      if (peer.connectionState === 'failed') {
        window.setTimeout(() => {
          if (this.dead || this.peers.get(name) !== peer) return;
          this.dropPeer(name);
          void this.createPeer(name, this.selfName.localeCompare(name) < 0);
        }, 800);
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        this.pumpRemotes();
      }
    };

    if (initiate) await this.offer(name, peer);
  }

  private dropPeer(name: string) {
    const peer = this.peers.get(name);
    if (peer) {
      try { peer.close(); } catch { /* ignore */ }
      this.peers.delete(name);
    }
    this.iceBag.delete(name);
    this.makingOffer.delete(name);
    const audio = this.remotes.get(name);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      this.remotes.delete(name);
    }
    this.setTalk(name, false);
  }

  private bindRemote(name: string, stream: MediaStream) {
    let audio = this.remotes.get(name);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.setAttribute('autoplay', '');
      audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(audio);
      this.remotes.set(name, audio);
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
      track.onunmute = () => {
        const el = this.remotes.get(name);
        if (!el) return;
        if (el.srcObject !== stream) el.srcObject = stream;
        el.muted = !this.speaker;
        void el.play().catch(() => undefined);
      };
    });
    if (audio.srcObject !== stream) audio.srcObject = stream;
    audio.muted = !this.speaker;
    audio.volume = 1;
    void audio.play().catch(() => undefined);
    window.setTimeout(() => {
      const el = this.remotes.get(name);
      if (!el) return;
      el.muted = !this.speaker;
      void el.play().catch(() => undefined);
    }, 180);
  }

  private async flushIce(name: string, peer: RTCPeerConnection) {
    const bag = this.iceBag.get(name) || [];
    this.iceBag.delete(name);
    for (const candidate of bag) {
      try { await peer.addIceCandidate(candidate); } catch { /* stale */ }
    }
  }

  private async offer(name: string, peer: RTCPeerConnection) {
    if (peer.signalingState !== 'stable' || this.makingOffer.has(name)) return;
    this.makingOffer.add(name);
    try {
      const desc = await peer.createOffer({ offerToReceiveAudio: true });
      if (desc.sdp) desc.sdp = preferOpus(desc.sdp);
      await peer.setLocalDescription(desc);
      await this.sendSignal(name, 'offer', desc);
    } finally {
      this.makingOffer.delete(name);
    }
  }

  private async consume(signal: VoiceSignal) {
    const name = signal.from;
    let peer = this.peers.get(name);
    if (!peer || peer.connectionState === 'closed' || peer.connectionState === 'failed') {
      this.dropPeer(name);
      await this.createPeer(name, false);
      peer = this.peers.get(name);
    }
    if (!peer) return;

    if (signal.type === 'offer') {
      const polite = this.selfName.localeCompare(name) > 0;
      const collision = this.makingOffer.has(name) || peer.signalingState !== 'stable';
      if (collision && !polite) return;
      if (collision && polite) {
        try { await peer.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit); } catch { /* safari */ }
      }
      await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      await this.flushIce(name, peer);
      await this.attach(peer, this.localTrack());
      const answer = await peer.createAnswer();
      if (answer.sdp) answer.sdp = preferOpus(answer.sdp);
      await peer.setLocalDescription(answer);
      await this.sendSignal(name, 'answer', answer);
      return;
    }

    if (signal.type === 'answer' && peer.signalingState === 'have-local-offer') {
      await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      await this.flushIce(name, peer);
      return;
    }

    if (signal.type === 'ice' && signal.payload) {
      if (peer.remoteDescription) {
        try { await peer.addIceCandidate(signal.payload as RTCIceCandidateInit); } catch { /* stale */ }
      } else {
        const bag = this.iceBag.get(name) || [];
        bag.push(signal.payload as RTCIceCandidateInit);
        this.iceBag.set(name, bag);
      }
    }
  }

  private setTalk(name: string, on: boolean) {
    const had = this.talking.has(name);
    if (on === had) return;
    if (on) this.talking.add(name);
    else this.talking.delete(name);
    this.onTalking?.([...this.talking]);
    if (name === this.selfName && this.lastSelfSpeak !== on) {
      this.lastSelfSpeak = on;
      this.onSpeakingSelf?.(on);
    }
  }

  private watchLevel(stream: MediaStream) {
    const gen = ++this.levelGen;
    try {
      const AudioEngine = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioEngine) return;
      if (!this.ctx) this.ctx = new AudioEngine();
      const context = this.ctx;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (gen !== this.levelGen || this.dead) {
          try { source.disconnect(); } catch { /* ignore */ }
          return;
        }
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value;
        this.setTalk(this.selfName, this.wantMic && sum / buffer.length > 18);
        requestAnimationFrame(loop);
      };
      void context.resume();
      loop();
    } catch {
      /* analyser unavailable */
    }
  }
}
