import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { DoorOpen, Lock, Mic, MicOff, Pause, Play, Plus, Search, SkipBack, SkipForward, Sofa, UserX, VolumeX, X } from 'lucide-react';
import { avatarFor } from '@/lib/club-store';
import {
  ackWatchSignals,
  createWatchRoom,
  fetchRooms,
  fetchWatchRoom,
  joinWatchRoom,
  kickWatchMember,
  leaveWatchRoom,
  muteWatchMember,
  pingWatchRoom,
  searchWatchYoutube,
  sendWatchSignal,
  setWatchMedia,
  type PublicRoom,
  type RoomCard,
  type SessionUser,
  type YoutubeHit,
} from '@/lib/club-api';

const SEATS = 8;

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
  getPlayerState: () => number;
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

function expectedTime(room: PublicRoom) {
  const extra = room.playing ? Math.max(0, (Date.now() - room.updatedAt) / 1000) : 0;
  return Math.max(0, room.position + extra);
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
  const playerRef = useRef<YtPlayer | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastVideo = useRef('');
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef(new Map<string, HTMLAudioElement>());

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
        setOpen(data.room);
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
    const timer = window.setInterval(() => { void tick(); }, 1200);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [open?.id]);

  useEffect(() => {
    if (!open) {
      playerRef.current?.destroy();
      playerRef.current = null;
      lastVideo.current = '';
      return;
    }
    let cancelled = false;
    void loadYoutube().then(() => {
      if (cancelled || !hostRef.current || playerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin, controls: open.you.owner ? 1 : 0 },
        events: {
          onReady: () => applyRoom(open),
          onStateChange: (event: { data: number }) => {
            if (!open.you.owner || !playerRef.current) return;
            if (event.data === 1) void setWatchMedia(open.id, { playing: true, position: playerRef.current.getCurrentTime() });
            if (event.data === 2) void setWatchMedia(open.id, { playing: false, position: playerRef.current.getCurrentTime() });
          },
        },
      });
    });
    return () => { cancelled = true; };
  }, [open?.id, open?.you.owner]);

  useEffect(() => {
    if (open) applyRoom(open);
  }, [open?.videoId, open?.playing, open?.position, open?.updatedAt, open?.you.owner]);

  useEffect(() => {
    if (!open?.you.owner || !open.playing) return;
    const timer = window.setInterval(() => {
      const time = playerRef.current?.getCurrentTime();
      if (typeof time === 'number') void setWatchMedia(open.id, { playing: true, position: time });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [open?.id, open?.you.owner, open?.playing]);

  useEffect(() => () => teardownVoice(), []);

  function applyRoom(room: PublicRoom) {
    const player = playerRef.current;
    if (!player || !room.videoId) return;
    const target = expectedTime(room);
    if (lastVideo.current !== room.videoId) {
      lastVideo.current = room.videoId;
      if (room.playing) player.loadVideoById(room.videoId, target);
      else player.cueVideoById(room.videoId, target);
      return;
    }
    if (room.you.owner) return;
    const now = player.getCurrentTime?.() ?? 0;
    if (Math.abs(now - target) > 2) player.seekTo(target, true);
    const state = player.getPlayerState?.();
    if (room.playing && state !== 1) player.playVideo();
    if (!room.playing && state === 1) player.pauseVideo();
  }

  async function consumeSignals(room: PublicRoom, signals: { id: string; from: string; type: 'offer' | 'answer' | 'ice'; payload: unknown }[]) {
    for (const signal of signals) {
      const peer = await ensurePeer(room, signal.from, false);
      try {
        if (signal.type === 'offer') {
          await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await sendWatchSignal(room.id, { to: signal.from, type: 'answer', payload: answer });
        } else if (signal.type === 'answer') {
          await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        } else if (signal.type === 'ice' && signal.payload) {
          await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
        }
      } catch {
        /* stale signal */
      }
    }
  }

  async function ensurePeer(room: PublicRoom, peerName: string, initiate: boolean) {
    const existing = peers.current.get(peerName);
    if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') return existing;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peers.current.set(peerName, peer);
    localStream.current?.getTracks().forEach((track) => peer.addTrack(track, localStream.current as MediaStream));
    peer.onicecandidate = (event) => {
      if (event.candidate) void sendWatchSignal(room.id, { to: peerName, type: 'ice', payload: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      let audio = remoteAudio.current.get(peerName);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        remoteAudio.current.set(peerName, audio);
      }
      audio.srcObject = event.streams[0];
    };
    if (initiate) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendWatchSignal(room.id, { to: peerName, type: 'offer', payload: offer });
    }
    return peer;
  }

  async function syncVoice(room: PublicRoom) {
    const others = room.members.filter((member) => member.username !== user.username && member.micOn && !member.muted);
    const names = new Set(others.map((member) => member.username));
    for (const name of peers.current.keys()) {
      if (!names.has(name)) {
        peers.current.get(name)?.close();
        peers.current.delete(name);
        remoteAudio.current.get(name)?.pause();
        remoteAudio.current.delete(name);
      }
    }
    if (!room.you.micOn || room.you.muted) return;
    for (const member of others) {
      if (!peers.current.has(member.username) && user.username.localeCompare(member.username) < 0) {
        await ensurePeer(room, member.username, true);
      }
    }
  }

  function teardownVoice() {
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    peers.current.forEach((peer) => peer.close());
    peers.current.clear();
    remoteAudio.current.forEach((audio) => audio.pause());
    remoteAudio.current.clear();
  }

  async function toggleMic() {
    if (!open) return;
    if (open.you.muted) {
      setNotice('Yönetici mikrofonunu kapattı');
      return;
    }
    if (!open.you.micOn) {
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        peers.current.forEach((peer) => {
          localStream.current?.getTracks().forEach((track) => peer.addTrack(track, localStream.current as MediaStream));
        });
        await pingWatchRoom(open.id, true);
      } catch {
        setNotice('Mikrofon izni gerekli');
      }
      return;
    }
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    await pingWatchRoom(open.id, false);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await createWatchRoom({ title, cover, password: password || undefined });
      setOpen(data.room);
      setCreateOpen(false);
      setTitle('');
      setCover('');
      setPassword('');
    } catch (err) {
      setNotice((err as Error).message === 'title' ? 'Oda başlığı yaz' : 'Oda açılamadı');
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(room: RoomCard) {
    if (room.locked) {
      setJoinId(room.id);
      return;
    }
    setBusy(true);
    try {
      setOpen((await joinWatchRoom(room.id)).room);
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
      setOpen((await joinWatchRoom(joinId, joinPassword)).room);
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
    playerRef.current?.destroy();
    playerRef.current = null;
    setOpen(null);
    void refreshList();
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      setHits((await searchWatchYoutube(query)).items);
    } catch {
      setNotice('YouTube araması olmadı');
    } finally {
      setBusy(false);
    }
  }

  async function playHit(hit: YoutubeHit) {
    if (!open) return;
    await setWatchMedia(open.id, { videoId: hit.id, videoTitle: hit.title, playing: true, position: 0 });
    setHits([]);
    setQuery('');
  }

  async function seekBy(delta: number) {
    if (!open || !playerRef.current) return;
    const next = Math.max(0, playerRef.current.getCurrentTime() + delta);
    playerRef.current.seekTo(next, true);
    await setWatchMedia(open.id, { playing: open.playing, position: next });
  }

  const seats = useMemo(() => {
    const map = new Map((open?.members || []).map((member) => [member.seat, member]));
    return Array.from({ length: SEATS }, (_, seat) => map.get(seat) || null);
  }, [open?.members]);

  if (open) {
    return (
      <div className="page-view room-page">
        <div className="room-top">
          <button type="button" className="room-back" onClick={() => void onLeave()}>
            <X size={16} /> Çık
          </button>
          <div>
            <p className="page-kicker">CANLI ODA</p>
            <h1>{open.title}</h1>
            <small>{open.locked ? 'Şifreli' : 'Açık'} · yönetici {open.ownerNick}</small>
          </div>
          <button type="button" className={`room-mic ${open.you.micOn ? 'is-on' : ''} ${open.you.muted ? 'is-off' : ''}`} onClick={() => void toggleMic()}>
            {open.you.micOn ? <Mic size={16} /> : <MicOff size={16} />}
            {open.you.muted ? 'Susturuldu' : open.you.micOn ? 'Mikrofon açık' : 'Mikrofon'}
          </button>
        </div>

        <div className="room-stage">
          <div className="room-tv">
            <div ref={hostRef} className="room-player" />
            {!open.videoId && <div className="room-empty-tv">Yönetici YouTube’dan bir video açınca herkes aynı anda izler.</div>}
          </div>
          {open.you.owner && (
            <form className="room-search" onSubmit={(event) => void onSearch(event)}>
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="YouTube bağla: ara veya link yapıştır" />
              <button type="submit" disabled={busy}>Ara</button>
              <button type="button" onClick={() => void setWatchMedia(open.id, { playing: !open.playing, position: playerRef.current?.getCurrentTime() || open.position })}>
                {open.playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button type="button" onClick={() => void seekBy(-10)}><SkipBack size={15} /></button>
              <button type="button" onClick={() => void seekBy(10)}><SkipForward size={15} /></button>
            </form>
          )}
          {!open.you.owner && <p className="room-follow">{open.videoTitle ? `Şu an: ${open.videoTitle}` : 'Yönetici video seçince senin ekranda da açılır.'}</p>}
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
          <p className="page-kicker">KOLTUKLAR</p>
          <div className="room-seats">
            {seats.map((member, seat) => (
              <article key={seat} className={`room-seat ${member ? 'is-taken' : ''} ${member?.username === open.owner ? 'is-host' : ''}`}>
                {member ? (
                  <>
                    <img src={avatarFor(member.nick, member.photo)} alt={member.nick} />
                    <strong>{member.nick}</strong>
                    <em>{member.username === open.owner ? 'Yönetici' : `Koltuk ${seat + 1}`}</em>
                    <span className={`room-seat-mic ${member.micOn ? 'is-on' : ''} ${member.muted ? 'is-off' : ''}`}>
                      {member.muted ? <VolumeX size={12} /> : member.micOn ? <Mic size={12} /> : <MicOff size={12} />}
                    </span>
                    {open.you.owner && member.username !== user.username && (
                      <div className="room-seat-admin">
                        <button type="button" onClick={() => void muteWatchMember(open.id, member.username, !member.muted)}>
                          <VolumeX size={13} /> {member.muted ? 'Aç' : 'Sustur'}
                        </button>
                        <button type="button" onClick={() => void kickWatchMember(open.id, member.username)}>
                          <UserX size={13} /> At
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <span>Boş koltuk</span>
                )}
              </article>
            ))}
          </div>
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
        <button type="button" className="room-create-btn" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Oda aç
        </button>
      </div>
      <div className="room-grid">
        {rooms.map((room) => (
          <article key={room.id} className="room-card">
            <div className="room-card-cover">
              {room.cover ? <img src={room.cover} alt="" /> : <DoorOpen size={28} />}
              {room.locked && <span><Lock size={12} /> Şifreli</span>}
            </div>
            <div className="room-card-body">
              <h2>{room.title}</h2>
              <small>{room.ownerNick} · {room.watching} kişi</small>
              {room.videoTitle && <p>{room.videoTitle}</p>}
              <button type="button" disabled={busy} onClick={() => void onJoin(room)}>Gir</button>
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
