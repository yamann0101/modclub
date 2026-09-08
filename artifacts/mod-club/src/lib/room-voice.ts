type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  isAudioMuted: () => Promise<boolean>;
  dispose: () => void;
  addListener: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
  getIFrame: () => HTMLIFrameElement;
};

type JitsiApiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiApiCtor;
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

let loaders = new Map<string, Promise<JitsiApiCtor>>();

function loadExternalApi(domain: string) {
  const src = `https://${domain}/external_api.js`;
  const existing = (window as Window & { JitsiMeetExternalAPI?: JitsiApiCtor }).JitsiMeetExternalAPI;
  // meet.jit.si script sets window.JitsiMeetExternalAPI; reuse if same page already loaded one
  if (existing && loaders.has(domain)) return loaders.get(domain)!;
  if (loaders.has(domain)) return loaders.get(domain)!;
  const promise = new Promise<JitsiApiCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      const api = window.JitsiMeetExternalAPI;
      if (!api) {
        reject(new Error('jitsi_missing'));
        return;
      }
      resolve(api);
    };
    script.onerror = () => reject(new Error('jitsi_load'));
    document.head.appendChild(script);
  });
  loaders.set(domain, promise);
  return promise;
}

/** Her oda için ayrı kanal adı */
export function channelName(roomId: string) {
  const clean = String(roomId || 'lobby').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48) || 'lobby';
  return `modclub${clean}`;
}

/**
 * Discord/TS3 gibi: her oda = ayrı Jitsi ses kanalı (ücretsiz, keysız).
 * External API (gizli iframe) — lib-jitsi-meet'ten daha sağlam.
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
  private roomKey = '';
  private roomId = '';
  private hold: HTMLAudioElement | null = null;
  private box: HTMLDivElement | null = null;
  private api: JitsiApi | null = null;
  private lastSelfSpeak = false;
  private levelTimer = 0;
  private connectPromise: Promise<void> | null = null;

  constructor(opts: RoomVoiceOpts) {
    this.selfName = opts.selfName;
    this.selfNick = (opts.selfNick || opts.selfName).slice(0, 40);
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
    this.applySpeaker();
  }

  setSpeaker(on: boolean) {
    this.speaker = on;
    this.applySpeaker();
  }

  async connect(roomId: string) {
    if (this.dead) return;
    this.roomId = roomId;
    const key = channelName(roomId);
    if (this.joined && this.roomKey === key && this.api) {
      this.unlock();
      return;
    }
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.joinChannel(key).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async setMic(on: boolean) {
    if (this.dead) return this.wantMic;
    if (this.busy) return this.wantMic;
    this.busy = true;
    try {
      this.wantMic = on;
      this.unlock();
      if (!this.roomId) throw new Error('no_room');
      await this.connect(this.roomId);
      if (!this.api || !this.joined) throw new Error('voice_offline');

      // Mik izni / GUM — iframe içinde; önce unmute dene
      let muted = true;
      try { muted = await this.api.isAudioMuted(); } catch { muted = true; }
      if (on && muted) this.api.executeCommand('toggleAudio');
      if (!on && !muted) this.api.executeCommand('toggleAudio');

      // Bir kez daha doğrula
      window.setTimeout(() => {
        void this.api?.isAudioMuted().then((now) => {
          if (this.wantMic && now) this.api?.executeCommand('toggleAudio');
          if (!this.wantMic && !now) this.api?.executeCommand('toggleAudio');
        }).catch(() => undefined);
      }, 400);

      this.setTalk(this.selfName, on);
      return on;
    } catch {
      this.wantMic = false;
      this.setTalk(this.selfName, false);
      throw new Error('mic_denied');
    } finally {
      this.busy = false;
    }
  }

  destroy() {
    this.dead = true;
    this.wantMic = false;
    window.clearInterval(this.levelTimer);
    try { this.api?.dispose(); } catch { /* ignore */ }
    this.api = null;
    this.joined = false;
    if (this.box) {
      this.box.remove();
      this.box = null;
    }
    if (this.hold) {
      this.hold.pause();
      this.hold.remove();
      this.hold = null;
    }
    this.onTalking?.([]);
    this.setTalk(this.selfName, false);
  }

  private async joinChannel(key: string) {
    if (this.dead) return;
    this.busy = true;
    try {
      this.teardownApi();
      this.roomKey = key;
      this.unlock();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        /* mik izni sonra setMic ile istenir */
      }

      if (!this.box) {
        this.box = document.createElement('div');
        this.box.id = `modclub-voice-${key}`;
        this.box.setAttribute('aria-hidden', 'true');
        this.box.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1;';
        document.body.appendChild(this.box);
      }

      const openOn = async (domain: string) => {
        const ExternalAPI = await loadExternalApi(domain);
        if (this.box) this.box.innerHTML = '';
        const api = new ExternalAPI(domain, {
          roomName: key,
          width: 320,
          height: 180,
          parentNode: this.box,
          userInfo: { displayName: this.selfNick },
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            prejoinConfig: { enabled: false },
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableWelcomePage: false,
            requireDisplayName: false,
            enableClosePage: false,
            disableInviteFunctions: true,
            toolbarButtons: [],
            notifications: [],
            hideConferenceSubject: true,
            disableInitialGUM: false,
            startAudioOnly: true,
            p2p: { enabled: false },
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [],
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            MOBILE_APP_PROMO: false,
          },
        });
        this.api = api;
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('voice_join_timeout')), 20000);
          const onJoin = () => {
            window.clearTimeout(timer);
            api.removeListener('videoConferenceJoined', onJoin);
            api.removeListener('conferenceFailed', onFail);
            resolve();
          };
          const onFail = () => {
            window.clearTimeout(timer);
            api.removeListener('videoConferenceJoined', onJoin);
            api.removeListener('conferenceFailed', onFail);
            reject(new Error('voice_join'));
          };
          api.addListener('videoConferenceJoined', onJoin);
          api.addListener('conferenceFailed', onFail);
        });
      };

      try {
        await openOn('meet.jit.si');
      } catch {
        this.teardownApi();
        await openOn('8x8.vc');
      }

      if (this.dead) {
        this.teardownApi();
        return;
      }
      this.joined = true;
      this.applySpeaker();
      this.startLevels();
      if (this.wantMic && this.api) {
        try {
          const muted = await this.api.isAudioMuted();
          if (muted) this.api.executeCommand('toggleAudio');
        } catch { /* ignore */ }
      }
      this.unlock();
    } finally {
      this.busy = false;
    }
  }

  private teardownApi() {
    window.clearInterval(this.levelTimer);
    try { this.api?.dispose(); } catch { /* ignore */ }
    this.api = null;
    this.joined = false;
    if (this.box) this.box.innerHTML = '';
  }

  private applySpeaker() {
    // iframe sesini mümkün olduğunca kıs / aç
    const iframe = this.api?.getIFrame?.();
    if (iframe) {
      try {
        iframe.allow = 'camera; microphone; autoplay; display-capture; clipboard-write';
        // aynı origin değil; volume atanamaz — muted attribute dene
        (iframe as HTMLIFrameElement & { muted?: boolean }).muted = !this.speaker;
      } catch { /* ignore */ }
    }
    // Yerel hold her zaman küçük sesle speaker rotasını açık tutar
    this.playHold();
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
    if (name === this.selfName && this.lastSelfSpeak !== on) {
      this.lastSelfSpeak = on;
      this.onSpeakingSelf?.(on);
      this.onTalking?.(on ? [name] : []);
    }
  }

  private startLevels() {
    window.clearInterval(this.levelTimer);
    this.levelTimer = window.setInterval(() => {
      if (this.dead) return;
      this.setTalk(this.selfName, this.wantMic);
    }, 500);
  }
}
