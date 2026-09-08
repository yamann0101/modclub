type JitsiTrack = {
  getType: () => string;
  isLocal: () => boolean;
  isMuted: () => boolean;
  mute: () => Promise<void> | void;
  unmute: () => Promise<void> | void;
  attach: (el: HTMLElement) => HTMLElement;
  detach: (el?: HTMLElement) => void;
  dispose: () => Promise<void> | void;
  getParticipantId: () => string;
  addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

type JitsiConference = {
  join: (password?: string) => void;
  leave: () => Promise<void> | void;
  myUserId: () => string;
  setDisplayName: (name: string) => void;
  addTrack: (track: JitsiTrack) => Promise<void> | void;
  removeTrack: (track: JitsiTrack) => Promise<void> | void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type JitsiConnection = {
  connect: () => void;
  disconnect: () => void;
  initJitsiConference: (name: string, options: Record<string, unknown>) => JitsiConference;
  addEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

type JitsiMeetJSApi = {
  init: (options?: Record<string, unknown>) => void;
  setLogLevel: (level: unknown) => void;
  createLocalTracks: (options: Record<string, unknown>) => Promise<JitsiTrack[]>;
  JitsiConnection: new (appId: string | null, token: string | null, options: Record<string, unknown>) => JitsiConnection;
  events: {
    connection: Record<string, string>;
    conference: Record<string, string>;
    track: Record<string, string>;
  };
  logLevels: { ERROR: unknown };
};

declare global {
  interface Window {
    JitsiMeetJS?: JitsiMeetJSApi;
  }
}

type RoomVoiceOpts = {
  selfName: string;
  selfNick?: string;
  onTalking?: (names: string[]) => void;
  onSpeakingSelf?: (on: boolean) => void;
};

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

let loader: Promise<JitsiMeetJSApi> | null = null;

function loadJitsi() {
  if (window.JitsiMeetJS) return Promise.resolve(window.JitsiMeetJS);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/libs/lib-jitsi-meet.min.js';
    script.async = true;
    script.onload = () => {
      if (!window.JitsiMeetJS) {
        reject(new Error('jitsi_missing'));
        return;
      }
      resolve(window.JitsiMeetJS);
    };
    script.onerror = () => reject(new Error('jitsi_load'));
    document.head.appendChild(script);
  });
  return loader;
}

function channelName(roomId: string) {
  const clean = roomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 48) || 'lobby';
  return `modclub${clean}`;
}

/**
 * Discord/TS3 tarzı tek ses kanalı.
 * Ücretsiz public Jitsi SFU (meet.jit.si) — API key yok.
 */
export class RoomVoice {
  private selfName: string;
  private selfNick: string;
  private onTalking?: (names: string[]) => void;
  private onSpeakingSelf?: (on: boolean) => void;

  private wantMic = false;
  private speaker = true;
  private busy = false;
  private dead = false;
  private joined = false;
  private hold: HTMLAudioElement | null = null;
  private connection: JitsiConnection | null = null;
  private conference: JitsiConference | null = null;
  private localTrack: JitsiTrack | null = null;
  private remotes = new Map<string, { track: JitsiTrack; audio: HTMLAudioElement }>();
  private talking = new Set<string>();
  private lastSelfSpeak = false;
  private levelTimer = 0;
  private roomKey = '';
  private connectAt = 0;

  constructor(opts: RoomVoiceOpts) {
    this.selfName = opts.selfName;
    this.selfNick = opts.selfNick || opts.selfName;
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
    this.pumpRemotes();
  }

  setSpeaker(on: boolean) {
    this.speaker = on;
    this.pumpRemotes();
  }

  /** Odaya girince çağır: mik izni + ses kanalına bağlan */
  async connect(roomId: string) {
    if (this.dead) return;
    const key = channelName(roomId);
    if (this.joined && this.roomKey === key) {
      this.unlock();
      return;
    }
    if (this.busy) return;
    if (this.roomKey === key && Date.now() - this.connectAt < 8000) return;
    this.connectAt = Date.now();
    this.busy = true;
    try {
      await this.disconnectSoft();
      this.roomKey = key;
      this.unlock();
      const JitsiMeetJS = await loadJitsi();
      JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
      JitsiMeetJS.init({
        disableAudioLevels: false,
        disableAEC: false,
        disableNS: false,
        disableAGC: false,
      });

      // Tarayıcıdan mik izni — odaya girerken bir kez
      await this.ensureMicPermission(JitsiMeetJS);

      await new Promise<void>((resolve, reject) => {
        const connection = new JitsiMeetJS.JitsiConnection(null, null, {
          hosts: {
            domain: 'meet.jit.si',
            muc: 'conference.meet.jit.si',
          },
          serviceUrl: 'wss://meet.jit.si/xmpp-websocket',
          enableWebsocketResume: true,
          clientNode: 'https://modclub.app',
        });
        this.connection = connection;

        const onOk = () => {
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onOk);
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onFail);
          resolve();
        };
        const onFail = (err: unknown) => {
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onOk);
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onFail);
          reject(err || new Error('voice_connect'));
        };
        connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onOk);
        connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onFail);
        connection.connect();
      });

      if (this.dead || !this.connection) return;

      const conference = this.connection.initJitsiConference(key, {
        openBridgeChannel: true,
        startSilent: false,
        p2p: { enabled: false },
        enableLayerSuspension: true,
        channelLastN: 12,
      });
      this.conference = conference;
      conference.setDisplayName(this.selfNick.slice(0, 40));

      conference.on(JitsiMeetJS.events.conference.TRACK_ADDED, (track) => {
        void this.onRemoteTrack(track as JitsiTrack);
      });
      conference.on(JitsiMeetJS.events.conference.TRACK_REMOVED, (track) => {
        this.dropRemote(track as JitsiTrack);
      });
      conference.on(JitsiMeetJS.events.conference.USER_LEFT, (id) => {
        this.dropRemoteByUser(String(id));
      });
      conference.on(JitsiMeetJS.events.conference.CONFERENCE_LEFT, () => {
        this.joined = false;
      });

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('voice_join_timeout')), 20000);
        conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => {
          window.clearTimeout(timer);
          resolve();
        });
        conference.on(JitsiMeetJS.events.conference.CONFERENCE_FAILED, (err) => {
          window.clearTimeout(timer);
          reject(err || new Error('voice_join'));
        });
        conference.join();
      });

      this.joined = true;
      this.startLevels();
      if (this.wantMic) await this.publishMic(true);
      this.unlock();
    } finally {
      this.busy = false;
    }
  }

  async setMic(on: boolean) {
    if (this.dead || this.busy) return this.wantMic;
    this.busy = true;
    try {
      this.wantMic = on;
      this.unlock();
      if (!this.joined) {
        return on;
      }
      await this.publishMic(on);
      return on;
    } catch {
      this.wantMic = false;
      throw new Error('mic_denied');
    } finally {
      this.busy = false;
    }
  }

  destroy() {
    this.dead = true;
    this.wantMic = false;
    window.clearInterval(this.levelTimer);
    void this.disconnectSoft();
    if (this.hold) {
      this.hold.pause();
      this.hold.remove();
      this.hold = null;
    }
    this.talking.clear();
    this.onTalking?.([]);
    this.setTalk(this.selfName, false);
  }

  private async disconnectSoft() {
    window.clearInterval(this.levelTimer);
    try {
      if (this.localTrack) {
        try { await this.conference?.removeTrack(this.localTrack); } catch { /* ignore */ }
        try { await this.localTrack.dispose(); } catch { /* ignore */ }
        this.localTrack = null;
      }
    } catch { /* ignore */ }
    for (const id of [...this.remotes.keys()]) this.dropRemoteByUser(id);
    try { await this.conference?.leave(); } catch { /* ignore */ }
    this.conference = null;
    try { this.connection?.disconnect(); } catch { /* ignore */ }
    this.connection = null;
    this.joined = false;
  }

  private async ensureMicPermission(JitsiMeetJS: JitsiMeetJSApi) {
    try {
      const tracks = await JitsiMeetJS.createLocalTracks({
        devices: ['audio'],
        firePermissionPromptIsShownEvent: true,
      });
      await Promise.all(tracks.map((track) => Promise.resolve(track.dispose())));
    } catch {
      // getUserMedia ile bir kez daha dene
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  private async publishMic(on: boolean) {
    const JitsiMeetJS = await loadJitsi();
    if (!this.conference) return;

    if (!on) {
      if (this.localTrack) {
        try { await this.localTrack.mute(); } catch { /* ignore */ }
        try { await this.conference.removeTrack(this.localTrack); } catch { /* ignore */ }
        try { await this.localTrack.dispose(); } catch { /* ignore */ }
        this.localTrack = null;
      }
      this.setTalk(this.selfName, false);
      return;
    }

    if (this.localTrack) {
      try { await this.localTrack.unmute(); } catch { /* ignore */ }
      return;
    }

    const tracks = await JitsiMeetJS.createLocalTracks({
      devices: ['audio'],
      firePermissionPromptIsShownEvent: true,
    });
    const audio = tracks.find((track) => track.getType() === 'audio');
    for (const track of tracks) {
      if (track !== audio) await Promise.resolve(track.dispose());
    }
    if (!audio) throw new Error('mic_denied');
    if (!this.wantMic || this.dead) {
      await Promise.resolve(audio.dispose());
      return;
    }
    this.localTrack = audio;
    await this.conference.addTrack(audio);
  }

  private async onRemoteTrack(track: JitsiTrack) {
    if (track.isLocal() || track.getType() !== 'audio') return;
    const id = track.getParticipantId();
    this.dropRemoteByUser(id);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('autoplay', '');
    audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(audio);
    track.attach(audio);
    audio.muted = !this.speaker;
    audio.volume = 1;
    void audio.play().catch(() => undefined);
    this.remotes.set(id, { track, audio });
    this.pumpRemotes();
  }

  private dropRemote(track: JitsiTrack) {
    if (track.getType() !== 'audio') return;
    this.dropRemoteByUser(track.getParticipantId());
  }

  private dropRemoteByUser(id: string) {
    const item = this.remotes.get(id);
    if (!item) return;
    try { item.track.detach(item.audio); } catch { /* ignore */ }
    item.audio.pause();
    item.audio.remove();
    this.remotes.delete(id);
    this.setTalk(id, false);
  }

  private pumpRemotes() {
    this.playHold();
    this.remotes.forEach(({ audio }) => {
      audio.muted = !this.speaker;
      audio.volume = 1;
      void audio.play().catch(() => undefined);
    });
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

  private startLevels() {
    window.clearInterval(this.levelTimer);
    this.levelTimer = window.setInterval(() => {
      if (this.dead) return;
      this.setTalk(this.selfName, Boolean(this.wantMic && this.localTrack && !this.localTrack.isMuted()));
    }, 400);
  }
}
