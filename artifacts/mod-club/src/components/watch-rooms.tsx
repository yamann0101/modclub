import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Crown, DoorOpen, Eye, EyeOff, Heart, Lock, Maximize2, Mic, MicOff, Minimize2, Pause, Play, Plus, Search, Settings, Shield, SkipBack, SkipForward, Sofa, Sparkles, UserX, Volume2, VolumeX, X } from 'lucide-react';
import { avatarFor } from '@/lib/club-store';
import {
  ackWatchSignals,
  claimWatchSeat,
  clearWatchChat,
  closeWatchRoom,
  createWatchRoom,
  fetchRooms,
  fetchWatchRoom,
  joinWatchRoom,
  kickWatchMember,
  leaveWatchRoom,
  muteWatchMember,
  pingWatchRoom,
  searchWatchYoutube,
  searchWatchRelated,
  requestCp,
  sendWatchChat,
  sendWatchSignal,
  setWatchHidden,
  setWatchHost,
  setWatchMedia,
  setWatchSettings,
  type PublicRoom,
  type RoomCard,
  type RoomMember,
  type SessionUser,
  type YoutubeHit,
} from '@/lib/club-api';

const SEATS = 8;
const HEART_GAPS = [
  { x: 25, y: 24 },
  { x: 50, y: 24 },
  { x: 75, y: 24 },
  { x: 25, y: 76 },
  { x: 50, y: 76 },
  { x: 75, y: 76 },
  { x: 12.5, y: 50 },
  { x: 37.5, y: 50 },
  { x: 62.5, y: 50 },
  { x: 87.5, y: 50 },
];
const SEAT_EMOJIS = [
  { id: 'kiss-r', mark: '😘', label: 'Sağ öpücük' },
  { id: 'kiss-l', mark: '😘', label: 'Sol öpücük' },
  { id: 'laugh', mark: '😂', label: 'Gülme' },
  { id: 'cry', mark: '😭', label: 'Ağlama' },
  { id: 'angry', mark: '😡', label: 'Kızgın' },
] as const;
const EMOJI_MS = 3000;
const FIREWORK_MS = 5000;
const FIREWORK_MAX_MS = 9_999_000;
const FIRE_KINDS = [
  { id: 'burst', label: 'Havai fişek', mark: '🎆' },
  { id: 'roses', label: 'Gül yağmuru', mark: '🌹' },
  { id: 'fire', label: 'Ateş', mark: '🔥' },
  { id: 'hearts', label: 'Kalp', mark: '❤️' },
  { id: 'rain', label: 'Yağmur', mark: '🌧️' },
] as const;
type FireKind = typeof FIRE_KINDS[number]['id'];
const COUPLE_GAPS = [
  { a: 0, b: 1, left: 0, top: 0 },
  { a: 1, b: 2, left: 25, top: 0 },
  { a: 2, b: 3, left: 50, top: 0 },
  { a: 4, b: 5, left: 0, top: 50 },
  { a: 5, b: 6, left: 25, top: 50 },
  { a: 6, b: 7, left: 50, top: 50 },
];

function sameUser(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function arePair(pairs: [string, string][] | undefined, left?: string, right?: string) {
  if (!left || !right || !pairs?.length) return false;
  return pairs.some(([a, b]) => (sameUser(a, left) && sameUser(b, right)) || (sameUser(a, right) && sameUser(b, left)));
}

function liveSeatEmoji(member: RoomMember | null, serverNow: number, receivedAt: number, now: number) {
  if (!member?.emoji || !member.emojiAt) return '';
  return serverNow + (now - receivedAt) - member.emojiAt < EMOJI_MS ? member.emoji : '';
}

const ICE: RTCConfiguration = {
  iceCandidatePoolSize: 8,
  iceTransportPolicy: 'all',
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

function forceSpeaker(record = false) {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = record ? 'play-and-record' : 'playback';
  } catch {
    /* safari only */
  }
}

function preferOpus(sdp = '') {
  return sdp.replace(
    /a=fmtp:(\d+) (.*)/g,
    (line, id, rest) => (rest.includes('useinbandfec') && !rest.includes('maxaveragebitrate')
      ? `a=fmtp:${id} ${rest};maxaveragebitrate=128000;stereo=0`
      : line),
  );
}

function localYoutubeId(value: string) {
  const text = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '').slice(0, 11);
    const fromQuery = url.searchParams.get('v');
    if (fromQuery && /^[a-zA-Z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
    const embed = url.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[1];
  } catch {
    /* not a url */
  }
  return '';
}

function roomHost(room: PublicRoom, username: string) {
  return room.owner === username || (room.hosts || []).includes(username);
}

function roomDrive(room: PublicRoom) {
  if (typeof room.you.drive === 'boolean') return room.you.drive;
  return (room.driver || room.owner) === room.you.username;
}

const MIC_AUDIO = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  googEchoCancellation: true,
  googNoiseSuppression: false,
  googAutoGainControl: true,
  googHighpassFilter: false,
  googAudioMirroring: false,
} as MediaTrackConstraints;

function playReactSound(kind: string) {
  try {
    const AudioEngine = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioEngine) return;
    const ctx = new AudioEngine();
    void ctx.resume();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    const tone = (type: OscillatorType, freq: number, at: number, dur: number, gain = 0.28, slide?: number) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + at + dur);
      amp.gain.setValueAtTime(0.0001, t0 + at);
      amp.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.018);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(amp);
      amp.connect(master);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.03);
    };
    const noise = (at: number, dur: number, gain: number, freq: number, type: BiquadFilterType = 'bandpass') => {
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(gain, t0 + at);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      src.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      src.start(t0 + at);
    };
    if (kind === 'laugh') {
      [0, 0.14, 0.28, 0.42, 0.56].forEach((at, i) => {
        tone('sawtooth', 240 + (i % 2) * 70, at, 0.12, 0.32, 160);
        tone('triangle', 420 + (i % 2) * 50, at + 0.02, 0.1, 0.18, 220);
        noise(at, 0.09, 0.22, 1400, 'highpass');
      });
    } else if (kind === 'kiss-r' || kind === 'kiss-l') {
      noise(0, 0.07, 0.38, 900, 'lowpass');
      tone('sine', 680, 0.02, 0.09, 0.28, 180);
      tone('triangle', 320, 0.05, 0.14, 0.22, 90);
      noise(0.08, 0.05, 0.16, 2200, 'bandpass');
    } else if (kind === 'angry') {
      noise(0, 0.22, 0.28, 180, 'lowpass');
      tone('square', 92, 0, 0.2, 0.26, 60);
      tone('sawtooth', 160, 0.12, 0.24, 0.22, 80);
      noise(0.2, 0.18, 0.2, 320, 'bandpass');
      tone('square', 70, 0.32, 0.28, 0.24, 48);
    } else if (kind === 'cry') {
      tone('sine', 480, 0, 0.34, 0.24, 190);
      tone('triangle', 390, 0.2, 0.38, 0.2, 150);
      noise(0.18, 0.22, 0.12, 2400, 'highpass');
      tone('sine', 320, 0.48, 0.46, 0.18, 110);
    }
    window.setTimeout(() => { void ctx.close(); }, 1800);
  } catch {
    /* no audio */
  }
}

function mapFilmVolume(slider: number) {
  const t = Math.max(0, Math.min(100, slider));
  if (t <= 0) return 0;
  return Math.max(1, Math.round(t * 0.92));
}

const ROOM_STAY = 'mc_watch_room';

function readStayRoom() {
  try { return sessionStorage.getItem(ROOM_STAY) || ''; } catch { return ''; }
}

function writeStayRoom(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ROOM_STAY, id);
    else sessionStorage.removeItem(ROOM_STAY);
  } catch {
    /* private mode */
  }
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: string | HTMLElement, opts: Record<string, unknown>) => YtPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YtPlayer = {
  loadVideoById: (id: string, start?: number) => void;
  cueVideoById: (id: string, start?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVideoData?: () => { video_id?: string };
  getIframe?: () => HTMLIFrameElement;
  setVolume: (value: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (value: number) => void;
  destroy: () => void;
};

function fileToCover(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Resim seç'));
      return;
    }
    const image = new Image();
    const blobUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Resim işlenemedi'));
        return;
      }
      const scale = Math.max(480 / image.width, 270 / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      context.drawImage(image, (480 - w) / 2, (270 - h) / 2, w, h);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('Resim okunamadı'));
    };
    image.src = blobUrl;
  });
}

function loadYoutube() {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(poll);
      resolve();
    };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      finish();
    };
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = finish;
      document.head.appendChild(script);
    }
    const poll = window.setInterval(() => {
      if (window.YT?.Player) finish();
    }, 200);
    window.setTimeout(finish, 3500);
  });
}

function createCinemaPlayer(box: HTMLElement, hooks: {
  onReady: () => void;
  onStateChange: (event: { data: number }) => void;
  onError: () => void;
}): YtPlayer {
  let inner: YtPlayer | null = null;
  let mode: 'yt' | 'frame' | '' = '';
  let gen = 0;
  let volume = 70;
  let muted = true;
  let destroyed = false;
  let ytTry = 0;
  const origin = (() => {
    try { return window.location.origin; } catch { return ''; }
  })();

  const applyVol = () => {
    if (!inner) return;
    inner.setVolume(volume);
    if (muted) inner.mute();
    else inner.unMute();
  };

  const clear = () => {
    try { inner?.destroy(); } catch { /* ignore */ }
    inner = null;
    box.innerHTML = '';
  };

  const embedSrc = (host: string, id: string, start: number) => {
    const originQ = origin ? `&origin=${encodeURIComponent(origin)}&widget_referrer=${encodeURIComponent(origin)}` : '';
    return `${host}/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&hl=tr&fs=0&iv_load_policy=3&controls=0&disablekb=1&start=${Math.max(0, Math.floor(start))}${originQ}`;
  };

  const attachFrame = (id: string, start: number, host: string, token: number) => {
    const iframe = document.createElement('iframe');
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('playsinline', 'true');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#000';
    iframe.src = embedSrc(host, id, start);
    clear();
    mode = 'frame';
    box.appendChild(iframe);
    const tell = (func: string, args: unknown[] = []) => {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    };
    iframe.addEventListener('load', () => tell('playVideo'));
    inner = {
      loadVideoById: (next: string, at = 0) => {
        iframe.src = embedSrc(host, next, at);
      },
      cueVideoById: (next: string, at = 0) => { inner?.loadVideoById(next, at); },
      playVideo: () => { tell('playVideo'); },
      pauseVideo: () => { tell('pauseVideo'); },
      seekTo: (seconds: number, _allow?: boolean) => { tell('seekTo', [seconds, true]); },
      getCurrentTime: () => start,
      getDuration: () => 0,
      getPlayerState: () => 1,
      getVideoData: () => ({ video_id: id }),
      setVolume: (value: number) => {
        volume = Math.max(0, Math.min(100, value));
        tell('setVolume', [volume]);
      },
      getVolume: () => volume,
      mute: () => { muted = true; tell('mute'); },
      unMute: () => { muted = false; tell('unMute'); },
      isMuted: () => muted,
      setPlaybackRate: () => undefined,
      destroy: () => { iframe.remove(); },
    };
    window.setTimeout(() => {
      if (token === gen && !destroyed) {
        try {
          inner?.playVideo();
          if (!muted) inner?.unMute();
        } catch { /* autoplay */ }
        hooks.onReady();
        hooks.onStateChange({ data: 1 });
      }
    }, 400);
  };

  const attachYoutube = async (id: string, start: number, token: number, host = 'https://www.youtube.com') => {
    try {
      await loadYoutube();
    } catch {
      /* iframe still plays in the viewer's country */
    }
    if (destroyed || token !== gen) return;
    if (!window.YT?.Player) {
      attachFrame(id, start, host, token);
      return;
    }
    clear();
    mode = 'yt';
    const holder = document.createElement('div');
    holder.style.cssText = 'width:100%;height:100%';
    box.appendChild(holder);
    let fell = false;
    let ready = false;
    const failHard = () => {
      if (fell || token !== gen) return;
      fell = true;
      window.clearTimeout(timer);
      hooks.onError();
    };
    const retryCookie = () => {
      if (token !== gen || destroyed) return;
      if (ytTry < 1) {
        ytTry = 1;
        window.clearTimeout(timer);
        const next = ++gen;
        void attachYoutube(id, start, next, 'https://www.youtube-nocookie.com');
        return;
      }
      failHard();
    };
    const timer = window.setTimeout(() => {
      if (ready || fell || token !== gen) return;
      fell = true;
      attachFrame(id, start, 'https://www.youtube.com', token);
    }, 4500);
    inner = new window.YT.Player(holder, {
      width: '100%',
      height: '100%',
      host,
      videoId: id,
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        hl: 'tr',
        cc_lang_pref: 'tr',
        start: Math.max(0, Math.floor(start)),
        iv_load_policy: 3,
        origin,
        widget_referrer: origin,
      },
      events: {
        onReady: () => {
          if (token !== gen || fell) return;
          ready = true;
          window.clearTimeout(timer);
          applyVol();
          try {
            inner?.unMute();
            inner?.seekTo(start, true);
            inner?.playVideo();
          } catch {
            /* autoplay */
          }
          hooks.onReady();
        },
        onStateChange: (event: { data: number }) => {
          if (token === gen && !fell) hooks.onStateChange(event);
        },
        onError: () => retryCookie(),
      },
    });
  };

  const load = (id: string, start = 0) => {
    if (mode === 'yt' && inner) {
      try {
        inner.loadVideoById(id, start);
        try { inner.playVideo(); } catch { /* autoplay */ }
        return;
      } catch {
        /* remount */
      }
    }
    ytTry = 0;
    const token = ++gen;
    void attachYoutube(id, start, token);
  };

  return {
    loadVideoById: (id: string, start = 0) => load(id, start),
    cueVideoById: (id: string, start = 0) => load(id, start),
    playVideo: () => { inner?.playVideo(); },
    pauseVideo: () => { inner?.pauseVideo(); },
    seekTo: (seconds: number, allow: boolean) => { inner?.seekTo(seconds, allow); },
    getCurrentTime: () => inner?.getCurrentTime() || 0,
    getDuration: () => inner?.getDuration() || 0,
    getPlayerState: () => inner?.getPlayerState() ?? 5,
    getVideoData: () => inner?.getVideoData?.() || { video_id: '' },
    setVolume: (value: number) => {
      volume = Math.max(0, Math.min(100, value));
      inner?.setVolume(volume);
    },
    getVolume: () => volume,
    mute: () => { muted = true; inner?.mute(); },
    unMute: () => { muted = false; inner?.unMute(); },
    isMuted: () => muted || Boolean(inner?.isMuted()),
    setPlaybackRate: (value: number) => { inner?.setPlaybackRate(value); },
    destroy: () => {
      destroyed = true;
      gen += 1;
      clear();
    },
  };
}

function fireBits(at: number, count: number) {
  const bits: { i: number; x: number; y: number; delay: number; size: number; dx: number; dy: number; mark: string }[] = [];
  let seed = (at || 1) >>> 0;
  for (let i = 0; i < count; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bits.push({
      i,
      x: (seed % 1000) / 10,
      y: ((seed >>> 10) % 1000) / 10,
      delay: ((seed >>> 20) % 28) / 10,
      size: 10 + (seed % 16),
      dx: ((seed % 71) - 35),
      dy: (((seed >>> 7) % 81) - 48),
      mark: '',
    });
  }
  return bits;
}

function RoomFireworks({ firework }: { firework: { text: string; kind?: string; ms?: number; at: number } }) {
  const kind = firework.kind === 'roses' || firework.kind === 'fire' || firework.kind === 'hearts' || firework.kind === 'rain'
    ? firework.kind
    : 'burst';
  const burst = kind === 'burst' ? 1.8 : kind === 'rain' ? 2.35 : 2.55;
  const count = kind === 'rain' ? 78 : kind === 'hearts' ? 60 : kind === 'roses' ? 48 : kind === 'fire' ? 40 : 52;
  const marks = kind === 'roses' ? ['🌹', '🥀', '🌺'] : kind === 'fire' ? ['🔥', '✨'] : kind === 'hearts' ? ['❤️', '💗', '💖', '💕'] : kind === 'rain' ? ['💧', '🌧️', '💦'] : ['✦'];
  const bits = fireBits(firework.at, count).map((bit, index) => ({
    ...bit,
    delay: (index % Math.max(8, Math.floor(count / 6))) * (burst / 8),
    mark: marks[index % marks.length],
    tone: bit.i % 6,
  }));
  return (
    <div className={`room-fireworks is-${kind}`} aria-hidden="true">
      {kind === 'burst' && bits.map((bit) => (
        <i
          key={bit.i}
          className={`room-spark tone-${bit.tone}`}
          style={{
            left: `${bit.x}%`,
            top: `${bit.y}%`,
            animationDelay: `${bit.delay}s`,
            animationDuration: `${burst}s`,
            ['--dx' as string]: `${bit.dx * 10}px`,
            ['--dy' as string]: `${bit.dy * 9}px`,
          }}
        />
      ))}
      {kind !== 'burst' && bits.map((bit) => (
        <span
          key={bit.i}
          className="room-fire-drop"
          style={{
            left: `${bit.x}%`,
            top: kind === 'fire' ? `${72 + (bit.y % 22)}%` : `${-18 - (bit.i % 24)}%`,
            fontSize: `${bit.size + (kind === 'hearts' || kind === 'rain' ? 10 : 5)}px`,
            animationDelay: `${bit.delay}s`,
            animationDuration: `${burst}s`,
          }}
        >
          {bit.mark}
        </span>
      ))}
      {kind === 'burst' && bits.filter((_, index) => index % 6 === 0).map((bit) => (
        <span
          key={`bloom-${bit.i}`}
          className="room-fire-bloom"
          style={{ left: `${bit.x}%`, top: `${bit.y}%`, animationDelay: `${bit.delay}s`, animationDuration: `${burst}s` }}
        />
      ))}
      {firework.text ? <strong className="room-fire-text">{firework.text}</strong> : null}
    </div>
  );
}

function RoomKissShow({ kiss }: { kiss: { fromNick: string; toNick: string; fromPhoto?: string; toPhoto?: string } }) {
  return (
    <div className="room-kiss-show" aria-hidden="true">
      <div className="room-kiss-pair">
        <div className="room-kiss-face is-left">
          <img src={avatarFor(kiss.fromNick, kiss.fromPhoto)} alt="" />
          <span className="room-kiss-eye" />
          <span className="room-kiss-brow" />
          <span className="room-kiss-mouth" />
        </div>
        <div className="room-kiss-face is-right">
          <img src={avatarFor(kiss.toNick, kiss.toPhoto)} alt="" />
          <span className="room-kiss-eye" />
          <span className="room-kiss-brow" />
          <span className="room-kiss-mouth" />
        </div>
        <span className="room-kiss-spark" />
      </div>
      <div className="room-kiss-hearts">
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </div>
      <strong>{kiss.fromNick} 💋 {kiss.toNick}</strong>
    </div>
  );
}

function cinemaTime(room: PublicRoom, receivedAt: number) {
  const atSend = room.playing
    ? room.position + Math.max(0, (room.serverNow - room.updatedAt) / 1000)
    : room.position;
  if (!room.playing) return Math.max(0, atSend);
  return Math.max(0, atSend + (Date.now() - receivedAt) / 1000);
}

export function WatchRoomsPage({
  user,
  listed = true,
  onBrowse,
  onExpand,
}: {
  user: SessionUser;
  listed?: boolean;
  onBrowse?: () => void;
  onExpand?: () => void;
}) {
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [open, setOpen] = useState<PublicRoom | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState('');
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinId, setJoinId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<YoutubeHit[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [talking, setTalking] = useState<string[]>([]);
  const [videoVol, setVideoVol] = useState(70);
  const [videoMuted, setVideoMuted] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [needStart, setNeedStart] = useState(false);
  const [cinemaKey, setCinemaKey] = useState(0);
  const [kbInset, setKbInset] = useState(0);
  const [kbFrame, setKbFrame] = useState<{ top: number; height: number } | null>(null);
  const [hideUntil, setHideUntil] = useState(user.hideUntil || 0);
  const [fireUntil, setFireUntil] = useState(user.fireUntil || 0);
  const [reactNow, setReactNow] = useState(0);
  const [focusField, setFocusField] = useState<'chat' | 'search' | null>(null);
  const [joinBanner, setJoinBanner] = useState('');
  const [joinStamp, setJoinStamp] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [pipPoint, setPipPoint] = useState<{ x: number; y: number } | null>(null);
  const [endCover, setEndCover] = useState(false);
  const [filmHud, setFilmHud] = useState(false);
  const [fireOpen, setFireOpen] = useState(false);
  const [fireText, setFireText] = useState('');
  const [fireKind, setFireKind] = useState<FireKind>('burst');
  const [fireSec, setFireSec] = useState(5);
  const [kissPick, setKissPick] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCover, setEditCover] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const localReact = useRef<{ id: string; at: number } | null>(null);
  const knownMembers = useRef<Set<string>>(new Set());
  const playerRef = useRef<YtPlayer | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cinemaHomeRef = useRef<HTMLDivElement | null>(null);
  const cinemaPip = useRef<Window | null>(null);
  const playerReady = useRef(false);
  const lastLoadAt = useRef(0);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lastVideo = useRef('');
  const bootVideo = useRef('');
  const roomRef = useRef<PublicRoom | null>(null);
  const receivedAtRef = useRef(Date.now());
  const lastRevRef = useRef(-1);
  const lastPushRef = useRef({ playing: false, position: 0, videoId: '', at: Date.now() });
  const pushingRef = useRef(false);
  const applyingCinema = useRef(false);
  const filmUnlocked = useRef(false);
  const nextQueue = useRef<YoutubeHit[]>([]);
  const nextBusy = useRef(false);
  const relatedBusy = useRef(false);
  const heardReact = useRef(new Set<string>());
  const pipDrag = useRef<{ ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);
  const hudTimer = useRef(0);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());
  const talkingRef = useRef(new Set<string>());
  const lastSpeakPing = useRef(false);
  const iceBag = useRef(new Map<string, RTCIceCandidateInit[]>());
  const makingOffer = useRef(new Set<string>());
  const audioCtx = useRef<AudioContext | null>(null);
  const speakerOnRef = useRef(true);
  const wantMicRef = useRef(false);
  const revivingMic = useRef(false);
  const pendingRevive = useRef(false);
  const leftRef = useRef(false);
  const reclaimAt = useRef(0);
  const hiddenAt = useRef(0);
  const resumeTimer = useRef(0);
  const levelGen = useRef(0);
  const chatBusy = useRef(false);
  const videoVolRef = useRef(70);
  const videoMutedRef = useRef(false);
  const voiceNodes = useRef(new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode; stream: MediaStream }>());
  videoVolRef.current = videoVol;
  videoMutedRef.current = videoMuted;

  const refreshList = async () => {
    try {
      const data = await fetchRooms();
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
      if (typeof data.hideUntil === 'number') setHideUntil(data.hideUntil);
      if (typeof data.fireUntil === 'number') setFireUntil(data.fireUntil);
    } catch {
      setNotice('Odalar alınamadı');
    }
  };

  useEffect(() => {
    if (!listed && !open) return;
    void refreshList();
    const timer = window.setInterval(() => {
      if (!open) void refreshList();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, listed]);

  useEffect(() => {
    const id = readStayRoom();
    if (!id) return;
    let live = true;
    void (async () => {
      try {
        const next = (await joinWatchRoom(id)).room;
        if (!live) return;
        adopt(next, true);
      } catch (err) {
        const code = (err as Error).message;
        if (code === 'password') {
          if (live) setJoinId(id);
          return;
        }
        writeStayRoom(null);
        if (live && code === 'banned') setNotice('Bu odadan atıldın');
      }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const tick = async () => {
      if (leftRef.current) return;
      try {
        const data = await fetchWatchRoom(open.id);
        if (!live || leftRef.current) return;
        roomRef.current = data.room;
        receivedAtRef.current = Date.now();
        setOpen(data.room);
        const player = playerRef.current;
        if (player && playerReady.current) {
          if (!roomDrive(data.room) || data.room.videoId !== lastVideo.current) followCinema(data.room, player);
        }
        if (data.signals.length) {
          await consumeSignals(data.room, data.signals);
          await ackWatchSignals(open.id, data.signals.map((item) => item.id));
        }
        await syncVoice(data.room);
      } catch (err) {
        if ((err as Error).message === 'banned' || (err as Error).message === 'member' || (err as Error).message === 'missing') {
          leftRef.current = true;
          teardownVoice();
          writeStayRoom(null);
          setMinimized(false);
          setOpen(null);
          setNotice((err as Error).message === 'banned' ? 'Odadan atıldın' : 'Oda kapandı');
        }
      }
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 400);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [open?.id]);

  useEffect(() => {
    document.body.classList.toggle('room-live', Boolean(open) && !minimized);
    if (open) forceSpeaker(wantMicRef.current);
    return () => document.body.classList.remove('room-live');
  }, [open, minimized]);

  useEffect(() => {
    if (!open) {
      setMinimized(false);
      return;
    }
    if (!listed) setMinimized(true);
  }, [listed]);

  useEffect(() => {
    if (!open) {
      setKbInset(0);
      setKbFrame(null);
      document.body.classList.remove('room-typing');
      return;
    }
    const syncKeyboard = () => {
      const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      const viewport = window.visualViewport;
      if (!typing || !viewport) {
        setKbInset(0);
        setKbFrame(null);
        return;
      }
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const openKb = inset > 80;
      setKbInset(openKb ? inset : 0);
      setKbFrame(openKb ? { top: viewport.offsetTop, height: viewport.height } : null);
      if (openKb) window.scrollTo(0, 0);
    };
    window.visualViewport?.addEventListener('resize', syncKeyboard);
    window.visualViewport?.addEventListener('scroll', syncKeyboard);
    window.addEventListener('resize', syncKeyboard);
    syncKeyboard();
    return () => {
      window.visualViewport?.removeEventListener('resize', syncKeyboard);
      window.visualViewport?.removeEventListener('scroll', syncKeyboard);
      window.removeEventListener('resize', syncKeyboard);
      document.body.classList.remove('room-typing');
    };
  }, [open]);

  useEffect(() => {
    document.body.classList.toggle('room-typing', kbInset > 0 && focusField === 'chat');
    if (kbInset > 0 && focusField === 'chat' && chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [kbInset, focusField]);

  useEffect(() => {
    knownMembers.current = new Set();
    setJoinBanner('');
    setFocusField(null);
  }, [open?.id]);

  useEffect(() => {
    if (!open) return;
    const names = new Set(open.members.map((member) => member.username));
    if (knownMembers.current.size === 0) {
      knownMembers.current = names;
      return;
    }
    const fresh = open.members.filter((member) => !knownMembers.current.has(member.username));
    knownMembers.current = names;
    if (!fresh.length) return;
    setJoinBanner(fresh[fresh.length - 1].nick);
    setJoinStamp(Date.now());
  }, [open?.id, open?.members]);

  useEffect(() => {
    if (!joinBanner) return;
    const timer = window.setTimeout(() => setJoinBanner(''), 3800);
    return () => window.clearTimeout(timer);
  }, [joinStamp, joinBanner]);

  useEffect(() => {
    if (!open) {
      localReact.current = null;
      return;
    }
    const timer = window.setInterval(() => {
      if (localReact.current && Date.now() - localReact.current.at >= EMOJI_MS) localReact.current = null;
      setReactNow(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [open?.id]);

  useEffect(() => {
    if (!open) {
      heardReact.current.clear();
      return;
    }
    for (const member of open.members) {
      if (!member.emoji || !member.emojiAt) continue;
      const key = `${member.username}:${member.emojiAt}`;
      if (heardReact.current.has(key)) continue;
      heardReact.current.add(key);
      if (member.username !== user.username) playReactSound(member.emoji);
    }
  }, [open?.members, open?.serverNow]);

  useEffect(() => {
    if (open?.kiss?.status !== 'live' || !open.kiss.at) return;
    playReactSound('kiss-r');
  }, [open?.kiss?.status, open?.kiss?.at]);

  useEffect(() => {
    if (!open) {
      playerReady.current = false;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
      lastVideo.current = '';
      lastRevRef.current = -1;
      bootVideo.current = '';
      setNeedStart(false);
      return;
    }
    roomRef.current = open;
    receivedAtRef.current = Date.now();
    lastPushRef.current = {
      playing: open.playing,
      position: open.position,
      videoId: open.videoId,
      at: Date.now(),
    };
    setNeedStart(false);
    setEndCover(false);
    let cancelled = false;
    void (async () => {
      let box = boxRef.current;
      for (let i = 0; i < 30 && !box && !cancelled; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 40));
        box = boxRef.current;
      }
      if (cancelled || !box) return;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
      playerReady.current = false;
      lastVideo.current = '';
      box.innerHTML = '';
      const room = roomRef.current;
      bootVideo.current = room?.videoId || '';
      const startAt = room?.videoId ? cinemaTime(room, receivedAtRef.current) : 0;
      const player = createCinemaPlayer(box, {
        onReady: () => {
          playerReady.current = true;
          const live = roomRef.current;
          const ready = playerRef.current;
          if (!ready || !live) return;
          if (live.videoId) {
            lastVideo.current = live.videoId;
            lastRevRef.current = live.mediaRev ?? 0;
            lastLoadAt.current = Date.now();
          }
          try {
            applyLocalVolume(ready);
            if (live.playing) {
              ready.unMute();
              ready.playVideo();
            } else ready.pauseVideo();
          } catch {
            if (!filmUnlocked.current) setNeedStart(Boolean(live.videoId));
          }
          window.setTimeout(() => {
            if (cancelled || filmUnlocked.current) return;
            if (roomRef.current?.videoId && roomRef.current.playing) setNeedStart(true);
          }, 1600);
        },
        onError: () => {
          const live = roomRef.current;
          setNotice('Bu video açılamadı, sıradaki açılıyor.');
          setEndCover(true);
          if (live?.you.host) void playNextVideo();
          else setNeedStart(true);
        },
        onStateChange: (event: { data: number }) => {
          const live = roomRef.current;
          const ready = playerRef.current;
          if (!live || !ready) return;
          if (event.data === 1) {
            filmUnlocked.current = true;
            applyLocalVolume(ready);
            setNeedStart(false);
            setEndCover(false);
            setFilmHud(false);
          }
          if (event.data === 0) {
            setEndCover(true);
            if (live.you.host) void playNextVideo();
            return;
          }
          if (applyingCinema.current) return;
          if (live.you.host && (event.data === 1 || event.data === 2)) {
            const playing = event.data === 1;
            if (document.hidden && event.data === 2) return;
            if (event.data === 2 && Date.now() - lastLoadAt.current < 2500) return;
            const time = ready.getCurrentTime?.() ?? 0;
            const target = cinemaTime(live, receivedAtRef.current);
            const drifted = Math.abs(time - target) > 1.4;
            if (playing === live.playing && !drifted) return;
            void claimCinema(live, ready, playing);
            return;
          }
          if (roomDrive(live)) return;
          if (!live.playing && event.data === 1) {
            try { ready.pauseVideo(); } catch { /* ignore */ }
            return;
          }
          if (live.playing && event.data === 2) {
            try { ready.playVideo(); } catch { /* blocked */ }
          }
          if (live.playing && (event.data === -1 || event.data === 5) && !filmUnlocked.current) {
            setNeedStart(true);
          }
        },
      });
      playerRef.current = player;
      if (room?.videoId) player.loadVideoById(room.videoId, startAt);
      else playerReady.current = true;
    })();
    return () => {
      cancelled = true;
      playerReady.current = false;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
      if (boxRef.current) boxRef.current.innerHTML = '';
    };
  }, [open?.id, cinemaKey]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      const room = roomRef.current;
      const player = playerRef.current;
      if (!room || !player || !playerReady.current) return;
      if (roomDrive(room)) {
        const localPlay = lastPushRef.current.playing;
        if (!room.playing && !localPlay) {
          followCinema(room, player);
        }
        if (!document.hidden) void pushOwnerClock(room, player);
      } else {
        followCinema(room, player);
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [open?.id]);

  useEffect(() => () => teardownVoice(), []);

  useEffect(() => {
    if (!open) return;
    const keepAlive = () => {
      if (leftRef.current) return;
      void pingWatchRoom(open.id).catch(() => undefined);
    };
    const resetChrome = () => {
      setKbInset(0);
      setKbFrame(null);
      setFocusField(null);
      setEndCover(false);
      pipDrag.current = null;
      try { chatInputRef.current?.blur(); } catch { /* ignore */ }
      try { (document.activeElement as HTMLElement | null)?.blur(); } catch { /* ignore */ }
      document.body.classList.remove('room-typing');
      window.scrollTo(0, 0);
    };
    const keepFilmPlaying = () => {
      const player = playerRef.current;
      const room = roomRef.current;
      if (!player || !room?.videoId || !room.playing) return;
      try {
        player.playVideo();
        if (!videoMutedRef.current && videoVolRef.current > 0) {
          player.unMute();
          applyLocalVolume(player);
        }
      } catch { /* os may still pause */ }
    };
    const restoreCinema = () => {
      const box = boxRef.current;
      const home = cinemaHomeRef.current;
      if (box && home && !home.contains(box)) home.appendChild(box);
      try { cinemaPip.current?.close(); } catch { /* ignore */ }
      cinemaPip.current = null;
    };
    const onHidden = () => {
      hiddenAt.current = Date.now();
      keepAlive();
      keepFilmPlaying();
    };
    const resumeRoom = () => {
      if (leftRef.current || document.hidden) return;
      resetChrome();
      keepAlive();
      restoreCinema();
      forceSpeaker(false);
      unlockAudio();
      const stamped = hiddenAt.current;
      hiddenAt.current = 0;
      const away = stamped ? Date.now() - stamped : 0;
      const room = roomRef.current;
      if (away > 1800) {
        try {
          for (const peer of peers.current.values()) peer.close();
        } catch { /* ignore */ }
        peers.current.clear();
        iceBag.current.clear();
        if (room) void syncVoice(room);
      } else if (room) {
        void syncVoice(room);
      }
      const player = playerRef.current;
      const reviveFilm = () => {
        if (!player || !playerReady.current || !room?.videoId) return;
        try {
          if (room.playing) {
            followCinema(room, player);
            player.playVideo();
          }
          if (!videoMutedRef.current && videoVolRef.current > 0) {
            player.unMute();
            applyLocalVolume(player);
          }
        } catch {
          /* keep existing iframe */
        }
      };
      reviveFilm();
      window.setTimeout(reviveFilm, 350);
      window.setTimeout(reviveFilm, 1200);
      window.setTimeout(() => {
        if (wantMicRef.current) forceSpeaker(true);
      }, 700);
      if (wantMicRef.current && (away > 400 || !micLive())) void reviveMic(true);
    };
    const onVisible = () => {
      window.clearTimeout(resumeTimer.current);
      resumeTimer.current = window.setTimeout(resumeRoom, 280);
    };
    const onVisibility = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('freeze', onHidden);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('focus', onVisible);
    const onDevices = () => {
      if (wantMicRef.current) void reviveMic(true);
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDevices);
    const watchdog = window.setInterval(() => {
      if (leftRef.current) return;
      keepAlive();
      if (document.hidden) {
        keepFilmPlaying();
        return;
      }
      if (!wantMicRef.current) return;
      if (!micLive()) void reviveMic(true);
    }, 1800);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('freeze', onHidden);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('focus', onVisible);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDevices);
      window.clearInterval(watchdog);
      window.clearTimeout(resumeTimer.current);
    };
  }, [open?.id]);

  useEffect(() => {
    const player = playerRef.current;
    if (player) applyLocalVolume(player);
  }, [videoVol, videoMuted]);

  useEffect(() => {
    const box = chatLogRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [open?.chats?.length]);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
    remoteAudio.current.forEach((audio) => {
      audio.muted = !speakerOn;
      audio.volume = 1;
      if (speakerOn) void audio.play().catch(() => undefined);
    });
  }, [speakerOn]);

  function adopt(room: PublicRoom, remount = false) {
    leftRef.current = false;
    writeStayRoom(room.id);
    roomRef.current = room;
    receivedAtRef.current = Date.now();
    lastPushRef.current = {
      playing: room.playing,
      position: room.position,
      videoId: room.videoId,
      at: Date.now(),
    };
    if (remount) {
      lastVideo.current = '';
      lastRevRef.current = -1;
      playerReady.current = false;
      setNeedStart(Boolean(room.videoId));
      setCinemaKey((value) => value + 1);
    }
    setOpen(room);
    if (room.you.micOn && !room.you.muted) {
      wantMicRef.current = true;
      void reviveMic(true);
    }
  }

  function followCinema(room: PublicRoom, player: YtPlayer) {
    if (!room.videoId || !playerReady.current) return;
    applyingCinema.current = true;
    window.setTimeout(() => { applyingCinema.current = false; }, 80);
    let state = -2;
    let time = 0;
    try {
      state = player.getPlayerState();
      time = player.getCurrentTime() ?? 0;
    } catch {
      return;
    }
    const target = cinemaTime(room, receivedAtRef.current);
    try {
      if (lastVideo.current !== room.videoId) {
        lastVideo.current = room.videoId;
        bootVideo.current = room.videoId;
        lastRevRef.current = room.mediaRev ?? 0;
        lastLoadAt.current = Date.now();
        setEndCover(false);
        player.mute();
        if (room.playing) {
          player.loadVideoById(room.videoId, target);
          try { player.playVideo(); } catch { /* autoplay */ }
          if (!filmUnlocked.current) setNeedStart(true);
        } else {
          player.cueVideoById(room.videoId, target);
          try { player.pauseVideo(); } catch { /* ignore */ }
        }
        return;
      }
      const rev = room.mediaRev ?? 0;
      if (rev !== lastRevRef.current) {
        lastRevRef.current = rev;
        if (state === 0) return;
        player.seekTo(target, true);
        if (room.playing) player.playVideo();
        else if (state === 1) player.pauseVideo();
        return;
      }
      if (!room.playing) {
        player.setPlaybackRate?.(1);
        if (state === 1) player.pauseVideo();
        if (Math.abs(time - room.position) > 0.35) player.seekTo(room.position, true);
        return;
      }
      if (state === 0 || state === 3) return;
      if (state === -1 || state === 5) {
        if (!filmUnlocked.current && Date.now() - lastLoadAt.current > 1500) setNeedStart(true);
        player.playVideo();
        return;
      }
      if (state === 2) player.playVideo();
      if (state !== 1) return;
      try {
        const dur = player.getDuration?.() || 0;
        if (dur > 8 && dur - time < 0.55) setEndCover(true);
      } catch {
        /* duration unknown */
      }
      const drift = time - target;
      if (Math.abs(drift) > 1.2) {
        player.setPlaybackRate?.(1);
        player.seekTo(target, true);
        return;
      }
      if (drift < -0.22) player.setPlaybackRate?.(1.08);
      else if (drift > 0.22) player.setPlaybackRate?.(0.94);
      else player.setPlaybackRate?.(1);
    } catch {
      if (room.playing && !filmUnlocked.current) setNeedStart(true);
    }
  }

  function applyLocalVolume(player: YtPlayer) {
    if (!wantMicRef.current) forceSpeaker(false);
    const slider = videoVolRef.current;
    const wantMute = videoMutedRef.current || slider <= 0;
    const meTalking = talkingRef.current.has(user.username);
    const duck = meTalking ? 0.88 : 1;
    const target = wantMute ? 0 : Math.max(1, Math.round(mapFilmVolume(slider) * duck));
    try {
      const now = player.getVolume?.();
      const mutedNow = player.isMuted?.();
      if (wantMute) {
        if (mutedNow !== true) player.mute();
        if (now !== 0) player.setVolume(0);
        return;
      }
      if (mutedNow) player.unMute();
      if (typeof now !== 'number' || Math.abs(now - target) >= 1) player.setVolume(target);
    } catch {
      /* player not ready */
    }
  }

  function startGuestVideo() {
    const player = playerRef.current;
    const room = roomRef.current;
    if (!player || !room?.videoId) return;
    unlockAudio();
    try {
      player.mute();
      if (room.playing) {
        player.loadVideoById(room.videoId, cinemaTime(room, receivedAtRef.current));
        player.playVideo();
        window.setTimeout(() => {
          try { player.unMute(); applyLocalVolume(player); } catch { /* ignore */ }
        }, 350);
      } else {
        player.cueVideoById(room.videoId, room.position);
        player.pauseVideo();
      }
      lastVideo.current = room.videoId;
      lastRevRef.current = room.mediaRev ?? 0;
      lastLoadAt.current = Date.now();
      window.setTimeout(() => applyLocalVolume(player), 500);
    } catch {
      setNeedStart(true);
      return;
    }
    setNeedStart(false);
  }

  async function pushOwnerClock(room: PublicRoom, player: YtPlayer) {
    if (document.hidden || !roomDrive(room)) return;
    const playingId = player.getVideoData?.()?.video_id;
    if (playingId && room.videoId && playingId !== room.videoId) return;
    const state = player.getPlayerState?.();
    if (state === 0 || state === 3 || state < 0 || pushingRef.current) return;
    const playing = state === 1;
    if (!playing && lastPushRef.current.playing && Date.now() - lastLoadAt.current < 2500) return;
    const time = player.getCurrentTime?.() ?? 0;
    const live = cinemaTime(room, receivedAtRef.current);
    const prev = lastPushRef.current;
    const expected = prev.playing ? prev.position + (Date.now() - prev.at) / 1000 : prev.position;
    const jumped = Math.abs(time - expected) > 1.2;
    if (!jumped && time < 1.2 && live > 4 && Date.now() - receivedAtRef.current < 5000) return;
    if (playing === prev.playing && !jumped && room.videoId === prev.videoId) return;
    pushingRef.current = true;
    lastPushRef.current = { playing, position: time, videoId: room.videoId, at: Date.now() };
    try {
      const next = await setWatchMedia(room.id, { playing, position: time });
      roomRef.current = next.room;
      receivedAtRef.current = Date.now();
      lastRevRef.current = next.room.mediaRev ?? lastRevRef.current;
      setOpen(next.room);
    } catch {
      /* keep last local clock */
    } finally {
      pushingRef.current = false;
    }
  }

  async function claimCinema(room: PublicRoom, player: YtPlayer, playing: boolean) {
    const time = player.getCurrentTime?.() ?? 0;
    lastPushRef.current = { playing, position: time, videoId: room.videoId, at: Date.now() };
    try {
      const next = await setWatchMedia(room.id, { playing, position: time, claim: true });
      roomRef.current = next.room;
      receivedAtRef.current = Date.now();
      lastRevRef.current = next.room.mediaRev ?? lastRevRef.current;
      setOpen(next.room);
    } catch {
      /* not host */
    }
  }

  async function playNextVideo() {
    const room = roomRef.current;
    if (!room?.you.host || nextBusy.current) return;
    nextBusy.current = true;
    setEndCover(true);
    try {
      let next = nextQueue.current.find((item) => item.id !== room.videoId) || null;
      if (next) nextQueue.current = nextQueue.current.filter((item) => item.id !== next?.id);
      if (!next && room.videoId) {
        const items = (await searchWatchRelated(room.videoId)).items || [];
        next = items.find((item) => item.id !== room.videoId) || null;
        nextQueue.current = items.filter((item) => item.id !== next?.id && item.id !== room.videoId);
      }
      if (next) await playHit(next);
      else setEndCover(false);
    } catch {
      setEndCover(false);
    } finally {
      nextBusy.current = false;
    }
  }

  function markTalk(name: string, on: boolean) {
    const bag = talkingRef.current;
    if (on === bag.has(name)) return;
    if (on) bag.add(name);
    else bag.delete(name);
    setTalking([...bag]);
    if (playerRef.current && playerReady.current) applyLocalVolume(playerRef.current);
    if (name === user.username && lastSpeakPing.current !== on && open) {
      lastSpeakPing.current = on;
      void pingWatchRoom(open.id, { speaking: on });
    }
  }

  function unlockAudio() {
    forceSpeaker(wantMicRef.current);
    try {
      if (audioCtx.current) void audioCtx.current.resume();
    } catch {
      /* no audio context */
    }
    remoteAudio.current.forEach((audio) => {
      audio.muted = !speakerOnRef.current;
      audio.volume = 1;
      void audio.play().catch(() => undefined);
    });
  }

  function watchLevel(name: string, stream: MediaStream) {
    if (name !== user.username) return;
    const gen = ++levelGen.current;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const context = audioCtx.current;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (gen !== levelGen.current) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (const value of buffer) sum += value;
        markTalk(name, sum / buffer.length > 14);
        requestAnimationFrame(loop);
      };
      void context.resume();
      loop();
    } catch {
      /* analyser not available */
    }
  }

  function micLive() {
    return Boolean(localStream.current?.getAudioTracks().some((track) => (
      track.readyState === 'live' && track.enabled && !track.muted
    )));
  }

  async function tuneAudioSender(peer: RTCPeerConnection) {
    const sender = peer.getSenders().find((item) => item.track?.kind === 'audio' || item.track === null);
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 128_000;
      await sender.setParameters(params);
    } catch {
      /* sender params locked */
    }
  }

  async function acquireMic() {
    localStream.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.onmute = null;
      track.stop();
    });
    localStream.current = null;
    forceSpeaker(true);
    const wait = (ms: number) => new Promise<MediaStream>((_, reject) => {
      window.setTimeout(() => reject(new Error('timeout')), ms);
    });
    let stream: MediaStream;
    try {
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: MIC_AUDIO, video: false }),
        wait(7000),
      ]);
    } catch {
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
        wait(5000),
      ]);
    }
    localStream.current = stream;
    const track = stream.getAudioTracks()[0];
    if (track) {
      try { await track.applyConstraints(MIC_AUDIO); } catch { /* device limits */ }
      try { track.contentHint = 'speech'; } catch { /* ignore */ }
      track.enabled = true;
      track.onended = () => {
        if (wantMicRef.current && !document.hidden) void reviveMic(true);
      };
      track.onmute = () => {
        if (wantMicRef.current && !document.hidden) void reviveMic(true);
      };
    }
    watchLevel(user.username, stream.clone());
  }

  async function applyMicToPeers(room: PublicRoom) {
    for (const [name, peer] of peers.current) {
      await attachLocal(peer);
      await tuneAudioSender(peer);
      if (peer.signalingState === 'stable') await renegotiate(room, name, peer);
    }
  }

  async function reviveMic(force = false) {
    const room = roomRef.current;
    if (!room || !wantMicRef.current || room.you.muted) return;
    if (revivingMic.current) {
      pendingRevive.current = true;
      return;
    }
    if (!force && micLive()) {
      unlockAudio();
      for (const peer of peers.current.values()) await attachLocal(peer);
      return;
    }
    if (force && micLive() && Date.now() - reclaimAt.current < 250) return;
    if (force) reclaimAt.current = Date.now();
    revivingMic.current = true;
    try {
      await acquireMic();
      await syncVoice(room);
      await applyMicToPeers(room);
      if (!leftRef.current) {
        const next = await pingWatchRoom(room.id, { micOn: true });
        setOpen(next.room);
      }
    } catch {
      setNotice('Mikrofon koptu. Mik aç-kapa yap.');
    } finally {
      revivingMic.current = false;
      if (pendingRevive.current) {
        pendingRevive.current = false;
        void reviveMic(true);
      }
    }
  }

  function bindRemoteAudio(name: string, stream: MediaStream) {
    let audio = remoteAudio.current.get(name);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('autoplay', '');
      audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;';
      document.body.appendChild(audio);
      remoteAudio.current.set(name, audio);
    }
    if (audio.srcObject !== stream) audio.srcObject = stream;
    audio.muted = !speakerOnRef.current;
    audio.volume = 1;
    forceSpeaker(wantMicRef.current);
    const setSink = (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
    if (setSink) void setSink.call(audio, 'default').catch(() => undefined);
    void audio.play().catch(() => undefined);
  }

  async function attachLocal(peer: RTCPeerConnection) {
    const stream = localStream.current;
    const track = stream?.getAudioTracks().find((item) => item.readyState === 'live') || null;
    const sender = peer.getSenders().find((item) => item.track?.kind === 'audio' || item.track === null);
    if (sender) {
      if (sender.track !== track) await sender.replaceTrack(track);
    } else if (track && stream) {
      peer.addTrack(track, stream);
    }
    await tuneAudioSender(peer);
  }

  async function flushIce(peer: RTCPeerConnection, name: string) {
    const bag = iceBag.current.get(name) || [];
    iceBag.current.delete(name);
    for (const candidate of bag) {
      try { await peer.addIceCandidate(candidate); } catch { /* stale */ }
    }
  }

  async function renegotiate(room: PublicRoom, peerName: string, peer: RTCPeerConnection) {
    if (peer.signalingState !== 'stable') return;
    makingOffer.current.add(peerName);
    try {
      const offer = await peer.createOffer({ offerToReceiveAudio: true, voiceActivityDetection: true });
      if (offer.sdp) offer.sdp = preferOpus(offer.sdp);
      await peer.setLocalDescription(offer);
      await sendWatchSignal(room.id, { to: peerName, type: 'offer', payload: offer });
    } finally {
      makingOffer.current.delete(peerName);
    }
  }

  async function consumeSignals(room: PublicRoom, signals: { id: string; from: string; type: 'offer' | 'answer' | 'ice'; payload: unknown }[]) {
    for (const signal of signals) {
      const peer = await ensurePeer(room, signal.from, false);
      try {
        if (signal.type === 'offer') {
          const polite = user.username.localeCompare(signal.from) > 0;
          const collision = makingOffer.current.has(signal.from) || peer.signalingState !== 'stable';
          if (collision && !polite) continue;
          if (collision && polite) {
            try { await peer.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit); } catch { /* safari */ }
          }
          await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          await flushIce(peer, signal.from);
          await attachLocal(peer);
          const answer = await peer.createAnswer();
          if (answer.sdp) answer.sdp = preferOpus(answer.sdp);
          await peer.setLocalDescription(answer);
          await sendWatchSignal(room.id, { to: signal.from, type: 'answer', payload: answer });
        } else if (signal.type === 'answer' && peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          await flushIce(peer, signal.from);
        } else if (signal.type === 'ice' && signal.payload) {
          if (peer.remoteDescription) await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
          else {
            const bag = iceBag.current.get(signal.from) || [];
            bag.push(signal.payload as RTCIceCandidateInit);
            iceBag.current.set(signal.from, bag);
          }
        }
      } catch {
        /* stale signal */
      }
    }
  }

  async function ensurePeer(room: PublicRoom, peerName: string, initiate: boolean) {
    const existing = peers.current.get(peerName);
    if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
      await attachLocal(existing);
      return existing;
    }
    existing?.close();
    const peer = new RTCPeerConnection(ICE);
    peers.current.set(peerName, peer);
    peer.addTransceiver('audio', { direction: 'sendrecv' });
    await attachLocal(peer);
    peer.onicecandidate = (event) => {
      if (event.candidate) void sendWatchSignal(room.id, { to: peerName, type: 'ice', payload: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      event.track.enabled = true;
      bindRemoteAudio(peerName, stream);
      unlockAudio();
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.iceConnectionState === 'failed') {
        try { peer.restartIce(); } catch { /* ignore */ }
        window.setTimeout(() => {
          if (peers.current.get(peerName) !== peer) return;
          const live = roomRef.current;
          if (!live) return;
          peers.current.delete(peerName);
          peer.close();
          void ensurePeer(live, peerName, user.username.localeCompare(peerName) < 0);
        }, 800);
      }
    };
    if (initiate) await renegotiate(room, peerName, peer);
    return peer;
  }

  async function syncVoice(room: PublicRoom) {
    const others = room.members.filter((member) => member.username !== user.username);
    const names = new Set(others.map((member) => member.username));
    for (const name of [...peers.current.keys()]) {
      if (!names.has(name)) {
        peers.current.get(name)?.close();
        peers.current.delete(name);
        iceBag.current.delete(name);
        const audio = remoteAudio.current.get(name);
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          audio.remove();
        }
        remoteAudio.current.delete(name);
        const node = voiceNodes.current.get(name);
        if (node) {
          try { node.source.disconnect(); node.gain.disconnect(); } catch { /* ignore */ }
          voiceNodes.current.delete(name);
        }
      }
    }
    for (const member of others) {
      const peer = peers.current.get(member.username);
      const dead = !peer || peer.connectionState === 'failed' || peer.connectionState === 'closed';
      if (dead) {
        await ensurePeer(room, member.username, user.username.localeCompare(member.username) < 0);
      } else {
        await attachLocal(peer);
      }
    }
    remoteAudio.current.forEach((audio) => {
      audio.muted = !speakerOnRef.current;
      audio.volume = 1;
      void audio.play().catch(() => undefined);
    });
  }

  function teardownVoice() {
    wantMicRef.current = false;
    levelGen.current += 1;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    voiceNodes.current.forEach((node) => {
      try { node.source.disconnect(); node.gain.disconnect(); } catch { /* ignore */ }
    });
    voiceNodes.current.clear();
    remoteAudio.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    remoteAudio.current.clear();
    iceBag.current.clear();
    makingOffer.current.clear();
    talkingRef.current.clear();
    setTalking([]);
    setPick(null);
  }

  async function toggleMic() {
    if (!open) return;
    unlockAudio();
    if (open.you.muted) {
      setNotice('Yönetici mikrofonunu kapattı');
      return;
    }
    if (!open.you.micOn) {
      try {
        wantMicRef.current = true;
        await syncVoice(open);
        await acquireMic();
        await applyMicToPeers(open);
        const next = await pingWatchRoom(open.id, { micOn: true });
        setOpen(next.room);
        if (playerRef.current) applyLocalVolume(playerRef.current);
      } catch {
        wantMicRef.current = false;
        setNotice('Mikrofon izni gerekli. Tarayıcıdan sese izin ver.');
      }
      return;
    }
    wantMicRef.current = false;
    levelGen.current += 1;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    markTalk(user.username, false);
    for (const peer of peers.current.values()) await attachLocal(peer);
    const next = await pingWatchRoom(open.id, { micOn: false, speaking: false });
    setOpen(next.room);
    if (playerRef.current) applyLocalVolume(playerRef.current);
  }

  function toggleSpeaker() {
    const next = !speakerOn;
    setSpeakerOn(next);
    speakerOnRef.current = next;
    unlockAudio();
    remoteAudio.current.forEach((audio) => {
      audio.muted = !next;
      audio.volume = 1;
      if (next) void audio.play().catch(() => undefined);
    });
  }

  async function sitOn(seat: number) {
    if (!open) return;
    const taken = open.members.find((member) => member.seat === seat);
    if (taken && taken.username !== user.username) {
      setNotice('Bu mik dolu');
      return;
    }
    try {
      setOpen((await claimWatchSeat(open.id, seat)).room);
    } catch (err) {
      setNotice((err as Error).message === 'taken' ? 'Bu mik dolu' : 'Mik değişmedi');
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await createWatchRoom({ title, cover, password: password || undefined });
      adopt(data.room, true);
      setCreateOpen(false);
      setTitle('');
      setCover('');
      setPassword('');
    } catch (err) {
      const code = (err as Error).message;
      setNotice(code === 'title' ? 'Oda başlığı yaz' : code === 'owned' ? 'Zaten bir odan var. Önce onu sil.' : 'Oda açılamadı');
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(room: RoomCard) {
    const owns = room.owner === user.username || room.creator === user.username;
    if (room.locked && !owns && user.role !== 'ADMIN') {
      setJoinId(room.id);
      return;
    }
    setBusy(true);
    try {
      adopt((await joinWatchRoom(room.id)).room, true);
    } catch (err) {
      const code = (err as Error).message;
      setNotice(code === 'full' ? 'Oda dolu' : code === 'banned' ? 'Bu odadan atıldın' : 'Odaya girilemedi');
    } finally {
      setBusy(false);
    }
  }

  async function confirmJoin() {
    if (!joinId) return;
    setBusy(true);
    try {
      adopt((await joinWatchRoom(joinId, joinPassword)).room, true);
      setJoinId(null);
      setJoinPassword('');
    } catch {
      setNotice('Şifre yanlış');
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    if (!open) return;
    leftRef.current = true;
    writeStayRoom(null);
    if (roomDrive(open) && playerRef.current && playerReady.current) {
      try {
        const time = playerRef.current.getCurrentTime() || open.position;
        const state = playerRef.current.getPlayerState();
        await setWatchMedia(open.id, { playing: state === 1, position: time });
      } catch {
        /* keep last cinema clock */
      }
    }
    teardownVoice();
    await leaveWatchRoom(open.id).catch(() => undefined);
    try { playerRef.current?.destroy(); } catch { /* ignore */ }
    playerRef.current = null;
    playerReady.current = false;
    lastVideo.current = '';
    lastRevRef.current = -1;
    setNeedStart(false);
    setCinemaKey((value) => value + 1);
    setMinimized(false);
    setOpen(null);
    filmUnlocked.current = false;
    void refreshList();
  }

  function shrinkRoom() {
    setMinimized(true);
    onBrowse?.();
  }

  function growRoom() {
    setMinimized(false);
    onExpand?.();
  }

  function flashFilmHud() {
    setFilmHud(true);
    window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setFilmHud(false), 2200);
  }

  async function launchFirework() {
    if (!open) return;
    try {
      adopt((await pingWatchRoom(open.id, { firework: { text: fireText.trim(), kind: fireKind, ms: Math.round(Math.max(1, fireSec) * 1000) } })).room);
      setFireOpen(false);
      setFireText('');
    } catch {
      setNotice('Havai fişek atılmadı');
    }
  }

  async function stopFirework() {
    if (!open) return;
    try {
      adopt((await pingWatchRoom(open.id, { firework: false })).room);
      setFireOpen(false);
    } catch {
      setNotice('Durdurulamadı');
    }
  }

  function onPipPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!minimized) {
      unlockAudio();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('.room-pip-bar button')) return;
    unlockAudio();
    const box = event.currentTarget.getBoundingClientRect();
    pipDrag.current = { ox: event.clientX - box.left, oy: event.clientY - box.top, x: box.left, y: box.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPipPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = pipDrag.current;
    if (!drag || !minimized) return;
    const nextX = event.clientX - drag.ox;
    const nextY = event.clientY - drag.oy;
    if (Math.hypot(nextX - drag.x, nextY - drag.y) > 8) drag.moved = true;
    if (!drag.moved) return;
    const width = event.currentTarget.offsetWidth;
    const height = event.currentTarget.offsetHeight;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    setPipPoint({
      x: Math.max(8, Math.min(maxX, nextX)),
      y: Math.max(8, Math.min(maxY, nextY)),
    });
  }

  function onPipPointerUp() {
    const moved = pipDrag.current?.moved;
    pipDrag.current = moved ? { ...pipDrag.current!, moved: true } : null;
    window.setTimeout(() => { pipDrag.current = null; }, 40);
  }

  async function onCloseRoom(id: string) {
    setBusy(true);
    try {
      writeStayRoom(null);
      if (open?.id === id) {
        leftRef.current = true;
        teardownVoice();
        try { playerRef.current?.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
        playerReady.current = false;
        lastVideo.current = '';
        setOpen(null);
        setMinimized(false);
        setCinemaKey((value) => value + 1);
      }
      await closeWatchRoom(id);
      setPick(null);
      void refreshList();
    } catch {
      setNotice('Oda silinemedi');
    } finally {
      setBusy(false);
    }
  }

  function mergeHits(extra: YoutubeHit[], base?: YoutubeHit[]) {
    setHits((current) => {
      const start = current.length ? current : (base || []);
      const seen = new Set(start.map((item) => item.id));
      const next = [...start];
      for (const item of extra) {
        if (!item.id || seen.has(item.id)) continue;
        seen.add(item.id);
        next.push(item);
      }
      return next.slice(0, 40);
    });
  }

  async function loadMoreHits(seed?: string) {
    const id = seed || hits[hits.length - 1]?.id || hits[0]?.id;
    if (!id || relatedBusy.current) return;
    relatedBusy.current = true;
    try {
      mergeHits((await searchWatchRelated(id)).items || []);
    } catch {
      /* ignore */
    } finally {
      relatedBusy.current = false;
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const direct = localYoutubeId(query);
    if (direct) {
      setHits([{ id: direct, title: 'YouTube video', thumb: `https://i.ytimg.com/vi/${direct}/hqdefault.jpg` }]);
      nextQueue.current = [];
      setNotice('');
      void loadMoreHits(direct);
      return;
    }
    setBusy(true);
    try {
      const items = (await searchWatchYoutube(query)).items;
      setHits(items);
      nextQueue.current = items;
      setNotice(items.length ? '' : 'Sonuç yok. YouTube linkini yapıştır.');
      if (items[0]) {
        relatedBusy.current = true;
        try {
          mergeHits((await searchWatchRelated(items[0].id)).items || [], items);
        } catch {
          /* ignore */
        } finally {
          relatedBusy.current = false;
        }
      }
    } catch {
      setNotice('Arama olmadı. YouTube linkini yapıştır.');
    } finally {
      setBusy(false);
    }
  }

  async function playHit(hit: YoutubeHit) {
    const room = roomRef.current || open;
    if (!room) return;
    lastVideo.current = hit.id;
    bootVideo.current = hit.id;
    nextQueue.current = nextQueue.current.filter((item) => item.id !== hit.id);
    adopt((await setWatchMedia(room.id, { videoId: hit.id, videoTitle: hit.title, playing: true, position: 0 })).room);
    lastRevRef.current = roomRef.current?.mediaRev ?? lastRevRef.current;
    lastLoadAt.current = Date.now();
    lastPushRef.current = { playing: true, position: 0, videoId: hit.id, at: Date.now() };
    applyingCinema.current = true;
    window.setTimeout(() => { applyingCinema.current = false; }, 400);
    if (playerRef.current && playerReady.current) {
      try {
        playerRef.current.loadVideoById(hit.id, 0);
        playerRef.current.unMute();
        playerRef.current.playVideo();
        setNeedStart(false);
      } catch {
        setCinemaKey((value) => value + 1);
      }
    } else {
      setCinemaKey((value) => value + 1);
    }
    setQuery('');
    void loadMoreHits(hit.id);
    setEndCover(false);
  }

  async function seekTo(next: number, playing = open?.playing ?? false) {
    if (!open) return;
    const time = Math.max(0, next);
    try {
      playerRef.current?.seekTo(time, true);
      if (playing) playerRef.current?.playVideo();
    } catch {
      /* player not ready */
    }
    lastPushRef.current = { playing, position: time, videoId: open.videoId, at: Date.now() };
    try {
      adopt((await setWatchMedia(open.id, { playing, position: time, claim: true })).room);
      lastRevRef.current = roomRef.current?.mediaRev ?? lastRevRef.current;
    } catch {
      /* keep local seek */
    }
  }

  async function seekBy(delta: number) {
    if (!open) return;
    const now = playerRef.current && playerReady.current ? playerRef.current.getCurrentTime() : open.position;
    await seekTo(now + delta, open.playing);
  }

  async function toggleHidden() {
    if (!open) return;
    try {
      adopt((await setWatchHidden(open.id, !open.hidden)).room);
      setNotice(open.hidden ? 'Oda tekrar görünür' : 'Oda gizlendi');
    } catch (err) {
      setNotice((err as Error).message === 'perk' ? 'Oda gizleme yetkin yok' : 'Oda gizlenemedi');
    }
  }

  async function toggleCp() {
    if (!open || !ownsOpen) return;
    try {
      adopt((await pingWatchRoom(open.id, { cpOn: !open.cpOn })).room);
    } catch {
      setNotice('CP açılmadı');
    }
  }

  async function askCp(username: string) {
    setPick(null);
    try {
      await requestCp(username);
      setNotice('Sevgili isteği gitti');
    } catch (err) {
      const code = (err as Error).message;
      setNotice(code === 'full' ? 'En fazla 3 CP olur' : code === 'taken' ? 'Bu kişiyle zaten CP’sin veya limiti doldu' : code === 'pending' ? 'Zaten istek var' : code === 'self' ? 'Kendine istek olmaz' : 'İstek gitmedi');
    }
  }

  async function askKiss(username: string) {
    if (!open) return;
    setPick(null);
    setKissPick(false);
    try {
      adopt((await pingWatchRoom(open.id, { kiss: username })).room);
      setNotice('Öpücük isteği gitti');
    } catch (err) {
      const code = (err as Error).message;
      setNotice(code === 'self' ? 'Kendine öpücük olmaz' : 'Öpücük gitmedi');
    }
  }

  async function answerKiss(accept: boolean) {
    if (!open) return;
    try {
      adopt((await pingWatchRoom(open.id, { kissAnswer: accept })).room);
    } catch {
      setNotice('Cevap gitmedi');
    }
  }

  async function sendSeatEmoji(id: string) {
    if (!open) return;
    if (open.you.seat < 0) {
      setNotice('Önce mikrofona otur');
      return;
    }
    const at = Date.now();
    localReact.current = { id, at };
    setReactNow(at);
    playReactSound(id);
    try {
      adopt((await pingWatchRoom(open.id, { emoji: id })).room);
    } catch {
      setNotice('Emoji gitmedi');
    }
  }

  async function submitChat() {
    if (!open || chatBusy.current) return;
    const text = chatText.trim();
    if (!text) return;
    chatBusy.current = true;
    try {
      adopt((await sendWatchChat(open.id, text)).room);
      setChatText('');
    } catch {
      setNotice('Mesaj gitmedi');
    } finally {
      chatBusy.current = false;
    }
  }

  function onChat(event: FormEvent) {
    event.preventDefault();
    void submitChat();
  }

  const seats = useMemo(() => {
    const map = new Map((open?.members || []).map((member) => [member.seat, member]));
    return Array.from({ length: SEATS }, (_, seat) => map.get(seat) || null);
  }, [open?.members]);

  const ownsOpen = Boolean(open && (open.you.owner || open.owner === user.username || open.creator === user.username));
  const canHideRooms = user.role === 'ADMIN' || hideUntil > Date.now();
  const canFire = Boolean(open && (open.you.host || user.role === 'ADMIN' || fireUntil > Date.now()));
  const mineId = rooms.find((room) => room.creator === user.username || room.owner === user.username)?.id;

  let roomPage: ReactNode = null;
  let settingsModal: ReactNode = null;
  if (open) {
    const iHost = Boolean(open.you.host);
    const fireMs = Math.min(FIREWORK_MAX_MS, Math.max(1_000, open.firework?.ms || FIREWORK_MS));
    const fireLive = Boolean(open.firework && open.serverNow + (Date.now() - receivedAtRef.current) - open.firework.at < fireMs + 400);
    const kissAsk = open.kiss?.status === 'ask' && open.kiss.to === user.username;
    const kissLive = open.kiss?.status === 'live' && open.serverNow + (Date.now() - receivedAtRef.current) - open.kiss.at < 5400;
    roomPage = (
      <div
        className={`page-view room-page ${minimized ? 'is-pip' : ''} ${!minimized && kbInset > 0 && focusField === 'chat' ? 'is-keyboard' : ''}`}
        onPointerDown={onPipPointerDown}
        onPointerMove={onPipPointerMove}
        onPointerUp={onPipPointerUp}
        onPointerCancel={onPipPointerUp}
        style={minimized && pipPoint
          ? { left: pipPoint.x, top: pipPoint.y, right: 'auto', bottom: 'auto' }
          : !minimized && kbInset > 0 && focusField === 'chat' && kbFrame
            ? { top: kbFrame.top, height: kbFrame.height, bottom: 'auto', paddingBottom: 0 }
            : undefined}
      >
        {fireLive && open.firework && (
          <RoomFireworks key={open.firework.at} firework={open.firework} />
        )}
        {kissLive && open.kiss && (
          <RoomKissShow key={`${open.kiss.from}-${open.kiss.at}`} kiss={open.kiss} />
        )}
        {kissAsk && open.kiss && (
          <div className="room-kiss-ask">
            <p><strong>{open.kiss.fromNick}</strong> sana öpücük istiyor</p>
            <div>
              <button type="button" onClick={() => void answerKiss(true)}>Kabul et</button>
              <button type="button" onClick={() => void answerKiss(false)}>Reddet</button>
            </div>
          </div>
        )}
        {joinBanner && (
          <div className="room-join-banner" key={joinStamp}>
            <span className="room-join-shine" aria-hidden="true" />
            <DoorOpen size={18} />
            <span>
              <strong>{joinBanner.toLocaleUpperCase('tr-TR')}</strong>
              <em>ODAYA GİRDİ</em>
            </span>
          </div>
        )}
        {ownsOpen && (
          <button type="button" className="room-kill" onClick={() => void onCloseRoom(open.id)}>
            Odayı sil
          </button>
        )}
        {((ownsOpen && canHideRooms) || user.role === 'ADMIN') && (
          <button type="button" className={`room-hide ${open.hidden ? 'is-on' : ''}`} onClick={() => void toggleHidden()}>
            {open.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {open.hidden ? 'Odayı göster' : 'Odayı gizle'}
          </button>
        )}
        {ownsOpen && (
          <button
            type="button"
            className="room-gear"
            onClick={() => {
              setEditTitle(open.title);
              setEditCover(open.cover || '');
              setEditPassword('');
              setClearPassword(false);
              setSettingsOpen(true);
            }}
          >
            <Settings size={14} /> Ayarlar
          </button>
        )}
        <button type="button" className="room-mini" onClick={minimized ? growRoom : shrinkRoom} aria-label={minimized ? 'Odayı büyüt' : 'Odayı küçült'}>
          {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
        </button>
        <button type="button" className="room-exit" onClick={() => void onLeave()} aria-label="Çık">
          <X size={18} />
        </button>

        <div className="room-stage">
          <div className="room-tv">
            <div ref={cinemaHomeRef} className="room-player-home">
              <div ref={boxRef} className="room-player" />
            </div>
            {!minimized && open.videoId && (
              <div
                className={`room-film-hud ${filmHud ? 'is-on' : ''}`}
                onClick={() => {
                  flashFilmHud();
                  if (!iHost) startGuestVideo();
                }}
              >
                {iHost && filmHud && (
                  <div className="room-film-tools" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        const nextPlaying = !open.playing;
                        if (nextPlaying) playerRef.current?.playVideo();
                        else playerRef.current?.pauseVideo();
                        const time = playerRef.current?.getCurrentTime() || open.position;
                        lastPushRef.current = { playing: nextPlaying, position: time, videoId: open.videoId, at: Date.now() };
                        void setWatchMedia(open.id, { playing: nextPlaying, position: time, claim: true }).then((data) => {
                          lastRevRef.current = data.room.mediaRev ?? lastRevRef.current;
                          adopt(data.room);
                        });
                        flashFilmHud();
                      }}
                    >
                      {open.playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      value={Math.max(0, Math.min(1000, Math.round((playerRef.current?.getCurrentTime?.() || open.position) / Math.max(1, playerRef.current?.getDuration?.() || open.position + 1) * 1000)))}
                      onChange={(event) => {
                        const duration = playerRef.current?.getDuration?.() || 0;
                        if (!duration) return;
                        void seekTo((Number(event.target.value) / 1000) * duration, open.playing);
                        flashFilmHud();
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {!iHost && !minimized && <div className="room-tv-lock" onClick={startGuestVideo} />}
            {minimized && !needStart && (
              <div
                className="room-pip-hit"
                onClick={() => { if (!pipDrag.current?.moved) growRoom(); }}
                role="button"
                aria-label="Odayı büyüt"
              />
            )}
            {endCover && (
              <div className="room-end-mask" aria-hidden="true">
                <span>Sıradaki</span>
              </div>
            )}
            {needStart && open.videoId && (
              <button type="button" className="room-tv-start" onClick={startGuestVideo}>
                <Play size={18} /> Videoyu aç
              </button>
            )}
            {!open.videoId && <div className="room-empty-tv">Yönetici YouTube’dan bir video açınca herkes aynı anda izler.</div>}
          </div>
          <div className="room-dock">
            <button type="button" className={`room-mic ${open.you.micOn ? 'is-on' : ''} ${open.you.muted ? 'is-off' : ''}`} onClick={() => void toggleMic()}>
              {open.you.micOn ? <Mic size={14} /> : <MicOff size={14} />}
              <span>{open.you.muted ? 'Susturuldu' : open.you.micOn ? 'Mik' : 'Mik'}</span>
            </button>
            <button type="button" className={`room-mic ${speakerOn ? 'is-on' : 'is-off'}`} onClick={toggleSpeaker}>
              {speakerOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>Ses</span>
            </button>
            {ownsOpen && (
              <button type="button" className={`room-mic room-cp ${open.cpOn ? 'is-on' : ''}`} onClick={() => void toggleCp()}>
                <Heart size={14} fill={open.cpOn ? 'currentColor' : 'none'} />
                <span>CP</span>
              </button>
            )}
            {canFire && (
              <button type="button" className={`room-mic room-fire ${fireOpen ? 'is-on' : ''}`} onClick={() => setFireOpen((value) => !value)}>
                <Sparkles size={14} />
                <span>Fişek</span>
              </button>
            )}
            {canFire && fireLive && (
              <button type="button" className="room-mic room-fire is-on" onClick={() => void stopFirework()}>
                <span>Durdur</span>
              </button>
            )}
          </div>
          {fireOpen && canFire && (
            <form
              className="room-fire-form"
              onSubmit={(event) => {
                event.preventDefault();
                void launchFirework();
              }}
            >
              <div className="room-fire-kinds">
                {FIRE_KINDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={fireKind === item.id ? 'is-on' : ''}
                    onClick={() => setFireKind(item.id)}
                  >
                    {item.mark} {item.label}
                  </button>
                ))}
              </div>
              <div className="room-fire-row">
                <input
                  value={fireText}
                  onChange={(event) => setFireText(event.target.value)}
                  maxLength={48}
                  placeholder="Yazı (isteğe bağlı, alta devam eder)"
                />
                <label className="room-fire-sec">
                  <span>Sn</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={fireSec}
                    onChange={(event) => setFireSec(Math.min(9999, Math.max(1, Number(event.target.value) || 5)))}
                  />
                </label>
                <button type="submit">Patlat</button>
                <button type="button" onClick={() => void stopFirework()}>Durdur</button>
                <button type="button" onClick={() => { setFireOpen(false); setFireText(''); }}>Vazgeç</button>
              </div>
            </form>
          )}
          <div className="room-vol">
            <button type="button" onClick={() => setVideoMuted((value) => !value)}>
              {videoMuted || videoVol === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={videoMuted ? 0 : videoVol}
              onChange={(event) => {
                const value = Number(event.target.value);
                setVideoVol(value);
                setVideoMuted(value === 0);
              }}
            />
            <span>{videoMuted ? 0 : videoVol}</span>
          </div>
          {iHost && (
            <form className="room-search" onSubmit={(event) => void onSearch(event)}>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setFocusField('search')}
                onBlur={() => setFocusField((value) => value === 'search' ? null : value)}
                placeholder="YouTube bağla: ara veya link yapıştır"
                inputMode="search"
                autoComplete="off"
              />
              <button type="submit" disabled={busy}>Ara</button>
              <div className="room-search-tools">
                <button type="button" onClick={() => {
                  const time = playerRef.current?.getCurrentTime() || open.position;
                  const nextPlaying = !open.playing;
                  if (nextPlaying) playerRef.current?.playVideo();
                  else playerRef.current?.pauseVideo();
                  lastPushRef.current = { playing: nextPlaying, position: time, videoId: open.videoId, at: Date.now() };
                  void setWatchMedia(open.id, { playing: nextPlaying, position: time, claim: true }).then((data) => {
                    lastRevRef.current = data.room.mediaRev ?? lastRevRef.current;
                    adopt(data.room);
                  });
                }}>
                  {open.playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button type="button" onClick={() => void seekBy(-10)}><SkipBack size={15} /></button>
                <button type="button" onClick={() => void seekBy(10)}><SkipForward size={15} /></button>
              </div>
            </form>
          )}
          {!iHost && <p className="room-follow">{open.videoTitle ? `Şu an: ${open.videoTitle}` : 'Yönetici video seçince senin ekranda da açılır.'}</p>}
          {hits.length > 0 && (
            <div
              className="room-hits"
              onScroll={(event) => {
                const box = event.currentTarget;
                if (box.scrollTop + box.clientHeight >= box.scrollHeight - 48) void loadMoreHits();
              }}
            >
              <button type="button" className="room-hits-clear" onClick={() => { setHits([]); setQuery(''); }}>Vazgeç</button>
              {hits.map((hit) => (
                <button key={hit.id} type="button" onClick={() => void playHit(hit)}>
                  <img src={hit.thumb} alt="" />
                  <span>{hit.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="room-couch">
          <div className="room-stage-floor">
            <div className="room-seats">
              {seats.map((member, seat) => {
                const owner = member?.username === open.owner;
                const admin = Boolean(member && roomHost(open, member.username));
                const live = Boolean(member && (member.speaking || talking.includes(member.username)));
                const canPick = Boolean(member && member.username !== user.username);
                const canManage = Boolean(iHost && canPick);
                const mineReact = member?.username === user.username && localReact.current && reactNow - localReact.current.at < EMOJI_MS
                  ? localReact.current.id
                  : '';
                const react = mineReact || liveSeatEmoji(member, open.serverNow, receivedAtRef.current, reactNow || Date.now());
                const reactMark = SEAT_EMOJIS.find((item) => item.id === react)?.mark || '';
                const frame = member?.title === 'PRENS' ? 'is-frame-prens'
                  : member?.title === 'PRENSES' ? 'is-frame-prenses'
                    : member?.title === 'REHANIN_HATUNU' ? 'is-frame-hatun'
                      : '';
                return (
                  <article
                    key={seat}
                    className={`mic-slot tone-${seat} ${member ? 'is-taken' : 'is-empty'} ${owner ? 'is-host' : admin ? 'is-admin' : ''} ${frame} ${live ? 'is-talk' : ''} ${canPick ? 'is-manage' : ''} ${react ? `is-react react-${react}` : ''} ${kissPick && canPick ? 'is-kiss-target' : ''} ${member && arePair(open.pairs, member.username, seats[seat + 1]?.username) ? 'is-couple-left' : ''} ${member && arePair(open.pairs, member.username, seats[seat - 1]?.username) ? 'is-couple-right' : ''}`}
                    onClick={() => {
                      if (!member) void sitOn(seat);
                      else if (kissPick && member.username !== user.username) void askKiss(member.username);
                      else if (canPick && (canManage || !arePair(open.pairs, user.username, member.username))) {
                        setPick((value) => value === member.username ? null : member.username);
                      }
                    }}
                  >
                    <div className="mic-ring">
                      {owner && !react && <span className="mic-wings" aria-hidden="true" />}
                      {live && !react && <span className="mic-waves" aria-hidden="true"><i /><i /><i /></span>}
                      <div className={`mic-avatar ${react ? 'is-react' : ''}`}>
                        {react ? (
                          <>
                            <span className="mic-react-face" key={`${member?.username}-${react}-${member?.emojiAt || localReact.current?.at || 0}`}>{reactMark}</span>
                            {(react === 'kiss-r' || react === 'kiss-l') && (
                              <span className="mic-react-kisses" aria-hidden>
                                <i>💋</i><i>💋</i><i>💋</i><i>💋</i>
                              </span>
                            )}
                            {react === 'laugh' && (
                              <span className="mic-react-ha" aria-hidden>
                                <i>ha</i><i>ha</i><i>ha</i>
                              </span>
                            )}
                            {react === 'cry' && (
                              <span className="mic-react-tears" aria-hidden>
                                <i /><i /><i /><i /><i />
                              </span>
                            )}
                            {react === 'angry' && (
                              <>
                                <span className="mic-react-steam" aria-hidden><i /><i /><i /></span>
                                <span className="mic-react-bang" aria-hidden>💢</span>
                              </>
                            )}
                          </>
                        ) : member ? <img src={avatarFor(member.nick, member.photo)} alt={member.nick} /> : <Mic size={18} />}
                      </div>
                      <span className="mic-ribbon">{
                        (member && (arePair(open.pairs, member.username, seats[seat + 1]?.username) || arePair(open.pairs, member.username, seats[seat - 1]?.username)))
                          ? 'Sevgili'
                          : owner ? 'Yönetici' : admin ? 'Admin' : member?.muted ? 'Susturuldu' : live ? 'Konuşuyor' : member ? `Mik ${seat + 1}` : 'Otur'
                      }</span>
                    </div>
                    <strong>{member ? member.nick : `Mik ${seat + 1}`}</strong>
                    {pick === member?.username && canPick && member && (
                      <div className="mic-menu" onClick={(event) => event.stopPropagation()}>
                        {!arePair(open.pairs, user.username, member.username) && (
                          <button type="button" onClick={() => void askCp(member.username)}>
                            <Heart size={13} /> Sevgili isteği
                          </button>
                        )}
                        <button type="button" onClick={() => void askKiss(member.username)}>
                          💋 Öpücük iste
                        </button>
                        {canManage && (
                          <>
                            <button type="button" onClick={() => { void muteWatchMember(open.id, member.username, !member.muted); setPick(null); }}>
                              <VolumeX size={13} /> {member.muted ? 'Sesi aç' : 'Sustur'}
                            </button>
                            {(!roomHost(open, member.username) || ownsOpen) && (
                              <button type="button" onClick={() => { void kickWatchMember(open.id, member.username); setPick(null); }}>
                                <UserX size={13} /> Odadan at
                              </button>
                            )}
                            {open.you.owner && (
                              <button type="button" onClick={() => { void setWatchHost(open.id, member.username, !roomHost(open, member.username)); setPick(null); }}>
                                <Shield size={13} /> {roomHost(open, member.username) ? 'Admin al' : 'Admin ver'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {COUPLE_GAPS.filter((gap) => arePair(open.pairs, seats[gap.a]?.username, seats[gap.b]?.username)).map((gap) => (
              <div key={`${gap.a}-${gap.b}`} aria-hidden>
                <div className="room-loveseat" style={{ left: `${gap.left}%`, top: `${gap.top}%` }}>
                  <span className="room-loveseat-sofa" />
                  <span className="room-loveseat-glow" />
                </div>
                <div className="room-loveseat is-fx" style={{ left: `${gap.left}%`, top: `${gap.top}%` }}>
                  <span className="room-loveseat-crown"><Crown size={16} /></span>
                  <span className="room-loveseat-heart">❤</span>
                  <i /><i /><i /><i /><i /><i />
                </div>
              </div>
            ))}
            {open.cpOn && (
              <div className="room-hearts" aria-hidden>
                {HEART_GAPS.flatMap((gap, gi) =>
                  [0, 1, 2].map((n) => (
                    <i
                      key={`${gi}-${n}`}
                      className="room-heart"
                      style={{
                        left: `${gap.x}%`,
                        top: `${gap.y}%`,
                        animationDelay: `${gi * 0.11 + n * 0.48}s`,
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="room-kiss-bar">
          <button type="button" className={`room-kiss-btn ${kissPick ? 'is-on' : ''}`} onClick={() => setKissPick((value) => !value)}>
            💋 Öp
          </button>
          {kissPick && <span>Öpmek için birine dokun</span>}
        </div>
        <div className="room-emoji-pack">
          {SEAT_EMOJIS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`room-emoji-item is-${item.id}`}
              onClick={() => void sendSeatEmoji(item.id)}
              title={item.label}
            >
              {item.id === 'kiss-l' && <small>←</small>}
              <span>{item.mark}</span>
              {item.id === 'kiss-r' && <small>→</small>}
            </button>
          ))}
        </div>
        <div className="room-chat">
          <div className="room-chat-log" ref={chatLogRef}>
            {(open.chats || []).map((row) => (
              <p key={row.id}><strong>{row.nick}</strong> {row.text}</p>
            ))}
            {!(open.chats || []).length && <p className="room-chat-empty">Yazışma burada görünür.</p>}
          </div>
          <form className="room-chat-form" onSubmit={onChat}>
            <input
              ref={chatInputRef}
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
              onFocus={() => {
                setFocusField('chat');
                window.scrollTo(0, 0);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  if (document.activeElement !== chatInputRef.current) {
                    setFocusField((value) => value === 'chat' ? null : value);
                  }
                }, 180);
              }}
              maxLength={240}
              placeholder="Mesaj yaz..."
              inputMode="text"
              enterKeyHint="send"
              autoComplete="off"
              autoCapitalize="sentences"
              autoCorrect="on"
            />
            <button
              type="submit"
              onPointerDown={(event) => {
                event.preventDefault();
                void submitChat();
              }}
            >
              Gönder
            </button>
            {iHost && (
              <button type="button" className="room-chat-clear" onClick={() => void clearWatchChat(open.id).then((data) => adopt(data.room))}>
                Temizle
              </button>
            )}
          </form>
        </div>
        {notice && <p className="room-note">{notice}</p>}
        {minimized && (
          <div className="room-pip-bar">
            <button type="button" onClick={growRoom} aria-label="Odayı büyüt"><Maximize2 size={14} /></button>
            <button type="button" className={open.you.micOn ? 'is-on' : ''} onClick={() => void toggleMic()} aria-label="Mikrofon">
              {open.you.micOn ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
            <button type="button" className={speakerOn ? 'is-on' : ''} onClick={toggleSpeaker} aria-label="Oda sesi">
              {speakerOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button type="button" onClick={() => void onLeave()} aria-label="Çık"><X size={14} /></button>
          </div>
        )}
      </div>
    );

    settingsModal = settingsOpen ? (
      <div className="room-modal">
        <form
          className="room-modal-card"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              setBusy(true);
              try {
                const next = await setWatchSettings(open.id, {
                  title: editTitle.trim(),
                  cover: editCover,
                  password: clearPassword ? '' : (editPassword.trim() ? editPassword : undefined),
                });
                adopt(next.room);
                setSettingsOpen(false);
                setEditPassword('');
                setClearPassword(false);
                void refreshList();
                setNotice('Oda ayarları kaydedildi');
              } catch {
                setNotice('Ayarlar kaydedilemedi');
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <h2>Oda ayarları</h2>
          <label>Başlık<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={48} /></label>
          <label>Oda resmi
            <input type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void fileToCover(file).then(setEditCover).catch((err) => setNotice((err as Error).message));
            }} />
          </label>
          {editCover && <img className="room-cover-preview" src={editCover} alt="" />}
          <label>Yeni şifre (boş bırakırsan değişmez)<input type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={clearPassword} onChange={(event) => setClearPassword(event.target.checked)} />
            Şifreyi kaldır
          </label>
          <div className="room-modal-actions">
            <button type="button" onClick={() => setSettingsOpen(false)}>Vazgeç</button>
            <button type="submit" disabled={busy || !editTitle.trim()}>Kaydet</button>
          </div>
        </form>
      </div>
    ) : null;

    if (!(minimized && listed)) return <>{roomPage}{settingsModal}</>;
  }

  if (!listed) return null;

  const listPage = (
    <div className="page-view desktop-shell mx-auto w-full px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-8">
      <div className="page-hero page-hero-games">
        <div>
          <p className="page-kicker">BİRLİKTE İZLE</p>
          <h1>Oda aç</h1>
          <p>Koltuklara otur, mikrofonu aç, aynı YouTube parçası herkese aynı anda gider.</p>
        </div>
        <Sofa size={48} />
      </div>
      <div className="room-list-bar">
        <button
          type="button"
          className="room-create-btn"
          onClick={() => {
            if (mineId) {
              setNotice('Zaten bir odan var. Önce onu sil.');
              return;
            }
            setCreateOpen(true);
          }}
        >
          <Plus size={16} /> Oda aç
        </button>
      </div>
      <div className="room-grid">
        {rooms.map((room) => {
          const king = room.skin === 'king';
          const vip = room.skin === 'vip';
          return (
          <article key={room.id} className={`room-card ${king ? 'is-king' : ''} ${vip ? 'is-vip' : ''}`}>
            <div className="room-card-cover">
              {room.cover ? <img src={room.cover} alt="" /> : king ? <Crown size={22} /> : <DoorOpen size={18} />}
              {room.locked && <span><Lock size={11} /></span>}
              {room.hidden && <em className="room-card-hidden">GİZLİ</em>}
            </div>
            <div className="room-card-body">
              <div className="room-card-meta">
                {king && <small className="room-card-official">OFFICIAL · KRALIN ODASI</small>}
                {vip && !king && <small className="room-card-vip">VIP ODA</small>}
                <h2>{king ? 'KRALIN ODASI' : room.title}</h2>
                <small>{room.ownerNick} · {room.watching} kişi{room.videoTitle ? ` · ${room.videoTitle}` : ''}{room.hidden ? ' · gizli' : ''}</small>
              </div>
              <div className="room-card-actions">
                <button type="button" disabled={busy} onClick={() => void onJoin(room)}>Gir</button>
                {(room.creator === user.username || room.owner === user.username) && (
                  <button type="button" className="room-card-kill" disabled={busy} onClick={() => void onCloseRoom(room.id)}>Sil</button>
                )}
              </div>
            </div>
          </article>
          );
        })}
        {!rooms.length && <p className="room-empty">Henüz oda yok. İlk odayı sen aç.</p>}
      </div>

      {createOpen && (
        <div className="room-modal">
          <form className="room-modal-card" onSubmit={(event) => void onCreate(event)}>
            <h2>Yeni oda</h2>
            <label>Başlık<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={48} /></label>
            <label>Kapak resmi
              <input type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void fileToCover(file).then(setCover).catch((err) => setNotice((err as Error).message));
              }} />
            </label>
            {cover && <img className="room-cover-preview" src={cover} alt="" />}
            <label>Oda şifresi (isteğe bağlı)<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <div className="room-modal-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>Vazgeç</button>
              <button type="submit" disabled={busy || !title.trim()}>Odayı aç</button>
            </div>
          </form>
        </div>
      )}

      {joinId && (
        <div className="room-modal">
          <form className="room-modal-card" onSubmit={(event) => { event.preventDefault(); void confirmJoin(); }}>
            <h2>Şifreli oda</h2>
            <label>Şifre<input type="password" value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} /></label>
            <div className="room-modal-actions">
              <button type="button" onClick={() => setJoinId(null)}>Vazgeç</button>
              <button type="submit" disabled={busy}>Gir</button>
            </div>
          </form>
        </div>
      )}
      {notice && <p className="room-note">{notice}</p>}
    </div>
  );

  return <>{listPage}{roomPage}{settingsModal}</>;
}
