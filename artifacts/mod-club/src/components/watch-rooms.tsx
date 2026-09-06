import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { DoorOpen, Heart, Lock, Mic, MicOff, Pause, Play, Plus, Search, Shield, SkipBack, SkipForward, Smile, Sofa, UserX, Volume2, VolumeX, X } from 'lucide-react';
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
  sendWatchChat,
  sendWatchSignal,
  setWatchHost,
  setWatchMedia,
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

function liveSeatEmoji(member: RoomMember | null, serverNow: number, receivedAt: number, now: number) {
  if (!member?.emoji || !member.emojiAt) return '';
  return serverNow + (now - receivedAt) - member.emojiAt < EMOJI_MS ? member.emoji : '';
}

const ICE: RTCConfiguration = {
  iceCandidatePoolSize: 4,
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

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
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  });
}

function cinemaTime(room: PublicRoom, receivedAt: number) {
  const atSend = room.playing
    ? room.position + Math.max(0, (room.serverNow - room.updatedAt) / 1000)
    : room.position;
  if (!room.playing) return Math.max(0, atSend);
  return Math.max(0, atSend + (Date.now() - receivedAt) / 1000);
}

export function WatchRoomsPage({ user }: { user: SessionUser }) {
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
  const [videoVol, setVideoVol] = useState(80);
  const [videoMuted, setVideoMuted] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [needStart, setNeedStart] = useState(false);
  const [cinemaKey, setCinemaKey] = useState(0);
  const [kbInset, setKbInset] = useState(0);
  const [packOpen, setPackOpen] = useState(false);
  const [reactNow, setReactNow] = useState(0);
  const [focusField, setFocusField] = useState<'chat' | 'search' | null>(null);
  const [joinBanner, setJoinBanner] = useState('');
  const localReact = useRef<{ id: string; at: number } | null>(null);
  const seenJoinAt = useRef(0);
  const playerRef = useRef<YtPlayer | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
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
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());
  const talkingRef = useRef(new Set<string>());
  const lastSpeakPing = useRef(false);
  const iceBag = useRef(new Map<string, RTCIceCandidateInit[]>());
  const makingOffer = useRef(new Set<string>());
  const audioCtx = useRef<AudioContext | null>(null);
  const speakerOnRef = useRef(true);

  const refreshList = async () => {
    try {
      setRooms((await fetchRooms()).rooms);
    } catch {
      setNotice('Odalar alınamadı');
    }
  };

  useEffect(() => {
    void refreshList();
    const timer = window.setInterval(() => {
      if (!open) void refreshList();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const tick = async () => {
      try {
        const data = await fetchWatchRoom(open.id);
        if (!live) return;
        roomRef.current = data.room;
        receivedAtRef.current = Date.now();
        setOpen(data.room);
        if (!data.room.you.host && data.room.videoId && data.room.videoId !== bootVideo.current) {
          bootVideo.current = data.room.videoId;
          lastVideo.current = '';
          lastRevRef.current = -1;
          playerReady.current = false;
          setNeedStart(true);
          setCinemaKey((value) => value + 1);
        } else {
          const player = playerRef.current;
          if (player && playerReady.current) {
            if (!data.room.you.host || (!pushingRef.current && (data.room.mediaRev ?? 0) !== lastRevRef.current)) {
              followCinema(data.room, player);
            }
          }
        }
        if (data.signals.length) {
          await consumeSignals(data.room, data.signals);
          await ackWatchSignals(open.id, data.signals.map((item) => item.id));
        }
        await syncVoice(data.room);
      } catch (err) {
        if ((err as Error).message === 'banned' || (err as Error).message === 'member' || (err as Error).message === 'missing') {
          teardownVoice();
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
    document.body.classList.toggle('room-live', Boolean(open));
    return () => document.body.classList.remove('room-live');
  }, [open]);

  useEffect(() => {
    if (!open) {
      setKbInset(0);
      document.body.classList.remove('room-typing');
      return;
    }
    const syncKeyboard = () => {
      const viewport = window.visualViewport;
      const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      setKbInset(inset > 80 ? inset : 0);
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
    if (kbInset > 0 && focusField === 'chat') {
      requestAnimationFrame(() => {
        chatInputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
        if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
      });
    }
  }, [kbInset, focusField]);

  useEffect(() => {
    if (!open) {
      seenJoinAt.current = 0;
      setJoinBanner('');
      setFocusField(null);
      return;
    }
    seenJoinAt.current = Math.max(seenJoinAt.current, open.lastJoin?.at || Date.now());
  }, [open?.id]);

  useEffect(() => {
    const join = open?.lastJoin;
    if (!join || join.at <= seenJoinAt.current) return;
    seenJoinAt.current = join.at;
    setJoinBanner(join.nick);
    const timer = window.setTimeout(() => setJoinBanner(''), 3200);
    return () => window.clearTimeout(timer);
  }, [open?.lastJoin?.at, open?.lastJoin?.nick]);

  useEffect(() => {
    if (!open) {
      localReact.current = null;
      setPackOpen(false);
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
    setNeedStart(Boolean(open.videoId));
    let cancelled = false;
    void (async () => {
      let box = boxRef.current;
      for (let i = 0; i < 30 && !box && !cancelled; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 40));
        box = boxRef.current;
      }
      if (cancelled || !box) return;
      await loadYoutube();
      if (cancelled || !box || !window.YT) return;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
      playerReady.current = false;
      lastVideo.current = '';
      box.innerHTML = '';
      const node = document.createElement('div');
      node.style.width = '100%';
      node.style.height = '100%';
      box.appendChild(node);
      const room = roomRef.current;
      bootVideo.current = room?.videoId || '';
      const startAt = room?.videoId ? Math.floor(cinemaTime(room, receivedAtRef.current)) : 0;
      playerRef.current = new window.YT.Player(node, {
        width: '100%',
        height: '100%',
        videoId: room?.videoId || undefined,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 0,
          iv_load_policy: 3,
          origin: window.location.origin,
          controls: room?.you.host ? 1 : 0,
          disablekb: room?.you.host ? 0 : 1,
          autoplay: room?.playing ? 1 : 0,
          start: startAt,
          mute: 1,
        },
        events: {
          onReady: () => {
            playerReady.current = true;
            const player = playerRef.current;
            const live = roomRef.current;
            if (!player || !live) return;
            if (live.videoId) {
              lastVideo.current = live.videoId;
              lastRevRef.current = live.mediaRev ?? 0;
              lastLoadAt.current = Date.now();
            }
            try {
              player.mute();
              if (live.videoId && live.playing) {
                player.seekTo(cinemaTime(live, receivedAtRef.current), true);
                player.playVideo();
              } else if (live.videoId) {
                player.cueVideoById(live.videoId, cinemaTime(live, receivedAtRef.current));
              }
            } catch {
              setNeedStart(Boolean(live.videoId));
            }
          },
          onStateChange: (event: { data: number }) => {
            const live = roomRef.current;
            const player = playerRef.current;
            if (!live || !player) return;
            if (event.data === 1) {
              applyLocalVolume(player);
              setNeedStart(false);
            }
            if (live.you.host) {
              if (document.hidden && event.data === 2) return;
              if (event.data === 1 || event.data === 2) void pushOwnerClock(live, player);
              return;
            }
            if (live.playing && (event.data === 2 || event.data === 0)) {
              try { player.playVideo(); } catch { /* blocked */ }
            }
            if (live.playing && (event.data === -1 || event.data === 5)) {
              setNeedStart(true);
            }
          },
        },
      });
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
      if (room.you.host) {
        if (!pushingRef.current && (room.mediaRev ?? 0) !== lastRevRef.current) followCinema(room, player);
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
      void pingWatchRoom(open.id).catch(() => undefined);
    };
    const onHidden = () => {
      keepAlive();
    };
    const onVisible = () => {
      keepAlive();
      const room = roomRef.current;
      const player = playerRef.current;
      if (!room || !player || !playerReady.current) return;
      followCinema(room, player);
      if (room.playing && room.videoId) {
        try {
          player.seekTo(cinemaTime(room, receivedAtRef.current), true);
          player.playVideo();
        } catch {
          setNeedStart(true);
        }
      }
    };
    const onVisibility = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('freeze', onHidden);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('freeze', onHidden);
      window.removeEventListener('pageshow', onVisible);
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
      if (speakerOn) void audio.play().catch(() => undefined);
    });
  }, [speakerOn]);

  function adopt(room: PublicRoom, remount = false) {
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
  }

  function followCinema(room: PublicRoom, player: YtPlayer) {
    if (!room.videoId || !playerReady.current) return;
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
        if (!room.you.host && room.videoId !== bootVideo.current) {
          bootVideo.current = room.videoId;
          setNeedStart(true);
          setCinemaKey((value) => value + 1);
          return;
        }
        lastVideo.current = room.videoId;
        bootVideo.current = room.videoId;
        lastRevRef.current = room.mediaRev ?? 0;
        lastLoadAt.current = Date.now();
        player.mute();
        if (room.playing) player.loadVideoById(room.videoId, target);
        else player.cueVideoById(room.videoId, target);
        try { player.playVideo(); } catch { /* autoplay */ }
        if (room.playing && !room.you.host) setNeedStart(true);
        return;
      }
      const rev = room.mediaRev ?? 0;
      if (rev !== lastRevRef.current) {
        lastRevRef.current = rev;
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
      if (state === 3) return;
      if (state === -1 || state === 5) {
        if (Date.now() - lastLoadAt.current > 1500) setNeedStart(true);
        player.playVideo();
        return;
      }
      if (state === 0 || state === 2) player.playVideo();
      if (state !== 1) return;
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
      if (room.playing) setNeedStart(true);
    }
  }

  function applyLocalVolume(player: YtPlayer) {
    try {
      player.setVolume(videoVol);
      if (videoMuted || videoVol === 0) player.mute();
      else player.unMute();
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
      player.loadVideoById(room.videoId, cinemaTime(room, receivedAtRef.current));
      player.playVideo();
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
    if (document.hidden) return;
    const state = player.getPlayerState?.();
    if (state === 3 || state < 0 || pushingRef.current) return;
    const playing = state === 1;
    if (!playing && room.playing && state === 2) return;
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

  function markTalk(name: string, on: boolean) {
    const bag = talkingRef.current;
    if (on === bag.has(name)) return;
    if (on) bag.add(name);
    else bag.delete(name);
    setTalking([...bag]);
    if (name === user.username && lastSpeakPing.current !== on && open) {
      lastSpeakPing.current = on;
      void pingWatchRoom(open.id, { speaking: on });
    }
  }

  function unlockAudio() {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      void audioCtx.current.resume();
    } catch {
      /* no audio context */
    }
    remoteAudio.current.forEach((audio) => {
      audio.muted = !speakerOnRef.current;
      void audio.play().catch(() => undefined);
    });
  }

  function watchLevel(name: string, stream: MediaStream) {
    if (name !== user.username) return;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const context = audioCtx.current;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
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

  function bindRemoteAudio(name: string, stream: MediaStream) {
    let audio = remoteAudio.current.get(name);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('autoplay', '');
      audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;';
      document.body.appendChild(audio);
      remoteAudio.current.set(name, audio);
    }
    if (audio.srcObject !== stream) audio.srcObject = stream;
    audio.muted = !speakerOnRef.current;
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
      const offer = await peer.createOffer();
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
      bindRemoteAudio(peerName, stream);
      unlockAudio();
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.iceConnectionState === 'failed') {
        try { peer.restartIce(); } catch { /* ignore */ }
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
      void audio.play().catch(() => undefined);
    });
  }

  function teardownVoice() {
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
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
        await syncVoice(open);
        localStream.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        watchLevel(user.username, localStream.current);
        for (const [name, peer] of peers.current) {
          await attachLocal(peer);
          await renegotiate(open, name, peer);
        }
        const next = await pingWatchRoom(open.id, { micOn: true });
        setOpen(next.room);
      } catch {
        setNotice('Mikrofon izni gerekli. Tarayıcıdan sese izin ver.');
      }
      return;
    }
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    markTalk(user.username, false);
    for (const peer of peers.current.values()) await attachLocal(peer);
    const next = await pingWatchRoom(open.id, { micOn: false, speaking: false });
    setOpen(next.room);
  }

  function toggleSpeaker() {
    const next = !speakerOn;
    setSpeakerOn(next);
    speakerOnRef.current = next;
    unlockAudio();
    remoteAudio.current.forEach((audio) => {
      audio.muted = !next;
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
    if (room.locked && !owns) {
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
    teardownVoice();
    await leaveWatchRoom(open.id).catch(() => undefined);
    try { playerRef.current?.destroy(); } catch { /* ignore */ }
    playerRef.current = null;
    playerReady.current = false;
    lastVideo.current = '';
    lastRevRef.current = -1;
    setNeedStart(false);
    setCinemaKey((value) => value + 1);
    setOpen(null);
    void refreshList();
  }

  async function onCloseRoom(id: string) {
    setBusy(true);
    try {
      if (open?.id === id) {
        teardownVoice();
        try { playerRef.current?.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
        playerReady.current = false;
        lastVideo.current = '';
        setOpen(null);
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

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const direct = localYoutubeId(query);
    if (direct) {
      setHits([{ id: direct, title: 'YouTube video', thumb: `https://i.ytimg.com/vi/${direct}/hqdefault.jpg` }]);
      setNotice('');
      return;
    }
    setBusy(true);
    try {
      const items = (await searchWatchYoutube(query)).items;
      setHits(items);
      setNotice(items.length ? '' : 'Sonuç yok. YouTube linkini yapıştır.');
    } catch {
      setNotice('Arama olmadı. YouTube linkini yapıştır.');
    } finally {
      setBusy(false);
    }
  }

  async function playHit(hit: YoutubeHit) {
    if (!open) return;
    lastVideo.current = hit.id;
    bootVideo.current = hit.id;
    adopt((await setWatchMedia(open.id, { videoId: hit.id, videoTitle: hit.title, playing: true, position: 0 })).room);
    lastRevRef.current = roomRef.current?.mediaRev ?? lastRevRef.current;
    if (playerRef.current && playerReady.current) playerRef.current.loadVideoById(hit.id, 0);
    else {
      setNeedStart(true);
      setCinemaKey((value) => value + 1);
    }
    setHits([]);
    setQuery('');
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
      adopt((await setWatchMedia(open.id, { playing, position: time })).room);
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

  async function toggleCp() {
    if (!open) return;
    try {
      adopt((await pingWatchRoom(open.id, { cpOn: !open.cpOn })).room);
    } catch {
      setNotice('CP açılmadı');
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
    setPackOpen(false);
    setReactNow(at);
    try {
      adopt((await pingWatchRoom(open.id, { emoji: id })).room);
    } catch {
      setNotice('Emoji gitmedi');
    }
  }

  async function onChat(event: FormEvent) {
    event.preventDefault();
    if (!open || !chatText.trim()) return;
    try {
      adopt((await sendWatchChat(open.id, chatText)).room);
      setChatText('');
    } catch {
      setNotice('Mesaj gitmedi');
    }
  }

  const seats = useMemo(() => {
    const map = new Map((open?.members || []).map((member) => [member.seat, member]));
    return Array.from({ length: SEATS }, (_, seat) => map.get(seat) || null);
  }, [open?.members]);

  const ownsOpen = Boolean(open && (open.you.owner || open.owner === user.username || open.creator === user.username));
  const mineId = rooms.find((room) => room.creator === user.username || room.owner === user.username)?.id;

  if (open) {
    const iHost = Boolean(open.you.host);
    return (
      <div
        className={`page-view room-page ${kbInset > 0 && focusField === 'chat' ? 'is-keyboard' : ''}`}
        onPointerDown={unlockAudio}
        style={kbInset > 0 ? { paddingBottom: kbInset } : undefined}
      >
        {joinBanner && (
          <div className="room-join-banner">{joinBanner.toLocaleUpperCase('tr-TR')} ODAYA GİRDİ</div>
        )}
        {ownsOpen && (
          <button type="button" className="room-kill" onClick={() => void onCloseRoom(open.id)}>
            Odayı sil
          </button>
        )}
        <button type="button" className="room-exit" onClick={() => void onLeave()} aria-label="Çık">
          <X size={18} />
        </button>

        <div className="room-stage">
          <div className="room-tv">
            <div ref={boxRef} className="room-player" />
            {!iHost && <div className="room-tv-lock" onClick={startGuestVideo} />}
            {needStart && open.videoId && (
              <button type="button" className="room-tv-start" onClick={startGuestVideo}>
                <Play size={18} /> Videoyu aç
              </button>
            )}
            {!open.videoId && <div className="room-empty-tv">Yönetici YouTube’dan bir video açınca herkes aynı anda izler.</div>}
          </div>
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
              <button type="button" onClick={() => {
                const time = playerRef.current?.getCurrentTime() || open.position;
                if (open.playing) playerRef.current?.pauseVideo();
                else playerRef.current?.playVideo();
                void setWatchMedia(open.id, { playing: !open.playing, position: time }).then((data) => {
                  lastRevRef.current = data.room.mediaRev ?? lastRevRef.current;
                  adopt(data.room);
                });
              }}>
                {open.playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button type="button" onClick={() => void seekBy(-10)}><SkipBack size={15} /></button>
              <button type="button" onClick={() => void seekBy(10)}><SkipForward size={15} /></button>
            </form>
          )}
          {!iHost && <p className="room-follow">{open.videoTitle ? `Şu an: ${open.videoTitle}` : 'Yönetici video seçince senin ekranda da açılır.'}</p>}
          {hits.length > 0 && (
            <div className="room-hits">
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
                const canPick = iHost && member && member.username !== user.username;
                const mineReact = member?.username === user.username && localReact.current && reactNow - localReact.current.at < EMOJI_MS
                  ? localReact.current.id
                  : '';
                const react = mineReact || liveSeatEmoji(member, open.serverNow, receivedAtRef.current, reactNow || Date.now());
                const reactMark = SEAT_EMOJIS.find((item) => item.id === react)?.mark || '';
                return (
                  <article
                    key={seat}
                    className={`mic-slot tone-${seat} ${member ? 'is-taken' : 'is-empty'} ${owner ? 'is-host' : admin ? 'is-admin' : ''} ${live ? 'is-talk' : ''} ${canPick ? 'is-manage' : ''} ${react ? `is-react react-${react}` : ''}`}
                    onClick={() => {
                      if (!member) void sitOn(seat);
                      else if (canPick) setPick((value) => value === member.username ? null : member.username);
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
                                <i>💋</i><i>💋</i><i>💋</i>
                              </span>
                            )}
                            {react === 'cry' && <span className="mic-react-tears" aria-hidden><i /><i /><i /></span>}
                            {react === 'angry' && <span className="mic-react-steam" aria-hidden><i /><i /></span>}
                          </>
                        ) : member ? <img src={avatarFor(member.nick, member.photo)} alt={member.nick} /> : <Mic size={18} />}
                      </div>
                      <span className="mic-ribbon">{owner ? 'Yönetici' : admin ? 'Admin' : member?.muted ? 'Susturuldu' : live ? 'Konuşuyor' : member ? `Mik ${seat + 1}` : 'Otur'}</span>
                    </div>
                    <strong>{member ? member.nick : `Mik ${seat + 1}`}</strong>
                    {pick === member?.username && canPick && member && (
                      <div className="mic-menu" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => { void muteWatchMember(open.id, member.username, !member.muted); setPick(null); }}>
                          <VolumeX size={13} /> {member.muted ? 'Sesi aç' : 'Sustur'}
                        </button>
                        <button type="button" onClick={() => { void kickWatchMember(open.id, member.username); setPick(null); }}>
                          <UserX size={13} /> Odadan at
                        </button>
                        {open.you.owner && (
                          <button type="button" onClick={() => { void setWatchHost(open.id, member.username, !roomHost(open, member.username)); setPick(null); }}>
                            <Shield size={13} /> {roomHost(open, member.username) ? 'Admin al' : 'Admin ver'}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
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
        <div className="room-dock">
          <button type="button" className={`room-mic ${open.you.micOn ? 'is-on' : ''} ${open.you.muted ? 'is-off' : ''}`} onClick={() => void toggleMic()}>
            {open.you.micOn ? <Mic size={16} /> : <MicOff size={16} />}
            {open.you.muted ? 'Susturuldu' : open.you.micOn ? 'Mik açık' : 'Mik aç'}
          </button>
          <button type="button" className={`room-mic ${speakerOn ? 'is-on' : 'is-off'}`} onClick={toggleSpeaker}>
            {speakerOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            {speakerOn ? 'Oda sesi açık' : 'Oda sesi kapalı'}
          </button>
          <button type="button" className={`room-mic room-cp ${open.cpOn ? 'is-on' : ''}`} onClick={() => void toggleCp()}>
            <Heart size={16} fill={open.cpOn ? 'currentColor' : 'none'} />
            CP
          </button>
          <button type="button" className={`room-mic room-emoji-btn ${packOpen ? 'is-on' : ''}`} onClick={() => setPackOpen((value) => !value)}>
            <Smile size={16} />
            Emoji
          </button>
        </div>
        {packOpen && (
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
        )}
        <div className="room-chat">
          <div className="room-chat-log" ref={chatLogRef}>
            {(open.chats || []).map((row) => (
              <p key={row.id}><strong>{row.nick}</strong> {row.text}</p>
            ))}
            {!(open.chats || []).length && <p className="room-chat-empty">Yazışma burada görünür.</p>}
          </div>
          <form className="room-chat-form" onSubmit={(event) => void onChat(event)}>
            <input
              ref={chatInputRef}
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
              onFocus={() => {
                setFocusField('chat');
                requestAnimationFrame(() => {
                  chatInputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
                });
              }}
              onBlur={() => setFocusField((value) => value === 'chat' ? null : value)}
              maxLength={240}
              placeholder="Mesaj yaz..."
              inputMode="text"
              autoComplete="off"
            />
            <button type="submit">Gönder</button>
            {iHost && (
              <button type="button" className="room-chat-clear" onClick={() => void clearWatchChat(open.id).then((data) => adopt(data.room))}>
                Temizle
              </button>
            )}
          </form>
        </div>
        {notice && <p className="room-note">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="page-view">
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
        {rooms.map((room) => (
          <article key={room.id} className="room-card">
            <div className="room-card-cover">
              {room.cover ? <img src={room.cover} alt="" /> : <DoorOpen size={18} />}
              {room.locked && <span><Lock size={11} /></span>}
            </div>
            <div className="room-card-body">
              <div className="room-card-meta">
                <h2>{room.title}</h2>
                <small>{room.ownerNick} · {room.watching} kişi{room.videoTitle ? ` · ${room.videoTitle}` : ''}</small>
              </div>
              <div className="room-card-actions">
                <button type="button" disabled={busy} onClick={() => void onJoin(room)}>Gir</button>
                {(room.creator === user.username || room.owner === user.username) && (
                  <button type="button" className="room-card-kill" disabled={busy} onClick={() => void onCloseRoom(room.id)}>Sil</button>
                )}
              </div>
            </div>
          </article>
        ))}
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
}
