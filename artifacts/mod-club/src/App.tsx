import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bell, CalendarDays, Camera, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, Coins, Crown, Dices, Download, Film, Flame, Gamepad2, Gem, Gift, Home as HomeIcon, KeyRound, LayoutDashboard, Link2, LockKeyhole, LogOut, Menu, MessageCircle, MessageSquare, Megaphone, MicOff, Moon, MoreVertical, Palette, Paperclip, PanelRightOpen, Plus, Reply, Search, Send, Server, Settings, Shield, ShieldCheck, Smile, Sparkles, Star, Store, Sun, Ticket, Timer, Trash2, Trees, Trophy, UserRound, Users, UsersRound, Volume2, VolumeX, Wand2, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ClubLogo, ClubWordmark } from '@/components/club-logo';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fetchPublicSetup, saveServerSetup } from '@/lib/setup-client';
import { adminWallet, buyVipPack, deleteClubUser, endGuessGame, fetchClub, fetchMe, loginUser, logoutUser, patchClub, patchClubUser, patchMe, registerUser, rouletteBet, rouletteHere, startGuessGame, submitGuess, type PublicGuessGame, type PublicRoulette, type SessionUser } from '@/lib/club-api';
import { CasinoRouletteStage, CHIP_ICON, playCountdown, playWin } from '@/components/roulette-wheel';
import { RouletteTable } from 'react-casino-roulette';
import { usePwaInstall } from '@/lib/pwa-install';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import type { Banner, ChatTimeout, ClubAccount, ContentCard, CosmeticTitle, Giveaway } from '@/lib/club-store';
import { DEFAULT_BANNERS, activeChatTimeout, applyColorMode, avatarFor, formatCountdown, formatMuteRemaining, giveawayStatus, loadColorMode, nickKey, storeColorMode, type ClubNotice, type ColorMode } from '@/lib/club-store';
import { getDeviceId, isChatMuted, markNotifyPrompted, publishClubEvent, registerClubWorker, requestNotifyPermission, setChatMuted as persistChatMute, startNotifyPolling, wasNotifyPrompted } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const queryClient = new QueryClient();

const quickItems: { label: string; sublabel: string; icon: LucideIcon; tone: string }[] = [
  { label: 'SOHBET', sublabel: 'Sesli odalara katıl', icon: MessageCircle, tone: 'violet' },
  { label: 'DUYURULAR', sublabel: 'Son duyuruları gör', icon: Megaphone, tone: 'amber' },
  { label: 'OYUNLAR', sublabel: 'Oyna, kazan, eğlen', icon: Gamepad2, tone: 'sky' },
  { label: 'TOPLULUK', sublabel: 'Üyelerle tanış', icon: UsersRound, tone: 'mint' },
  { label: 'AFİŞLER', sublabel: 'Etkinlik afişleri', icon: Ticket, tone: 'pink' },
];

const slides = DEFAULT_BANNERS;

const announcements = [
  { id: 'announcement-1', tag: 'ETKİNLİK', title: 'Haftalık Etkinlik Takvimi Yayında!', copy: 'Bu haftanın turnuva ve etkinlik programı yayınlandı.', time: '2 saat önce', icon: Gift, color: 'violet' },
  { id: 'announcement-2', tag: 'ÖNEMLİ', title: 'Önemli: Kuralları Okumayı Unutmayın!', copy: 'Topluluk kuralları güncellendi, lütfen gözden geçir.', time: '5 saat önce', icon: AlertTriangle, color: 'amber' },
  { id: 'announcement-3', tag: 'ÖDÜL', title: 'Yeni Ödüller Seni Bekliyor!', copy: 'Sezon ödülleri ve çekiliş havuzu yenilendi.', time: '1 gün önce', icon: Star, color: 'mint' },
];

const newsItems = [
  { id: 'news-1', tag: 'YENİ', title: "MOD CLUB'da Yeni Sezon Heyecanı!", time: '2 saat önce', comments: 12, tone: 'violet', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=720&q=80' },
  { id: 'news-2', tag: 'ÖNE ÇIKAN', title: 'Büyük Turnuva Bu Hafta!', time: '5 saat önce', comments: 24, tone: 'amber', image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=720&q=80' },
  { id: 'news-3', tag: 'DUYURU', title: 'Sunucu Güncellemesi', time: '1 gün önce', comments: 8, tone: 'sky', image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=720&q=80' },
];

const events = [
  { id: 'event-1', date: '12 Haziran', time: '20:00', category: 'TURNUVA', title: '5v5 Turnuvası', copy: 'Rekabetçi 5v5, ödüllü final.', tone: 'purple', day: '12', month: 'HAZ', status: 'Yaklaşıyor' },
  { id: 'event-2', date: '15 Haziran', time: '19:30', category: 'QUIZ', title: 'Ödüllü Bilgi Yarışması', copy: 'Bilgini test et, ödülünü kap.', tone: 'blue', day: '15', month: 'HAZ', status: 'Kayıtta' },
  { id: 'event-3', date: '18 Haziran', time: '21:00', category: 'ETKİNLİK', title: 'Topluluk Gecesi', copy: 'Sohbet, müzik ve birlikte oyun.', tone: 'green', day: '18', month: 'HAZ', status: 'Açık' },
  { id: 'event-4', date: '23 Haziran', time: '18:30', category: 'OYUN', title: 'Özel Oyun Gecesi', copy: 'Ödüllü özel maçlar.', tone: 'rose', day: '23', month: 'HAZ', status: 'Yaklaşıyor' },
];

type ChatMessage = {
  id: string;
  author: string;
  initials: string;
  avatar: string;
  photo: string;
  message: string;
  time: string;
  mine?: boolean;
  role?: string;
  title?: string;
  kind?: 'text' | 'winner' | 'mute' | 'guess-start' | 'guess-round' | 'guess-end';
  replyTo?: { author: string; message: string };
  winner?: string;
  prizeTitle?: string;
  prizeText?: string;
  prizeImage?: string;
  giveawayId?: string;
  mutedBy?: string;
  muteLabel?: string;
  winners?: { nick: string; at: number; ms: number }[];
  at?: number;
};

function isSystemChat(message: Pick<ChatMessage, 'kind'>) {
  return Boolean(message.kind && message.kind !== 'text');
}

const chatEmojis = ['😀', '😂', '😍', '🔥', '👏', '🎮', '🎉', '💜', '🙌', '🤝', '😎', '❤️'];

const initialManagedPages = [
  { name: 'Ana Sayfa', description: 'Banner, duyurular ve topluluk özeti', enabled: true },
  { name: 'Etkinlikler', description: 'Turnuvalar ve yaklaşan etkinlikler', enabled: true },
  { name: 'Menü', description: 'Topluluk araçları ve hızlı erişim', enabled: true },
  { name: 'Profil', description: 'Üye profili ve hesap ayarları', enabled: true },
];

type UserSession = SessionUser;

function displayNick(session: Pick<UserSession, 'nick' | 'name' | 'username'>) {
  return session.nick?.trim() || session.name?.trim() || session.username;
}

function resolveSession(session: UserSession): UserSession {
  return session;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

async function saveUserAppId(session: UserSession, appId: string) {
  return patchMe({ appId });
}

async function saveUserNick(session: UserSession, nickValue: string) {
  try {
    const next = await patchMe({ nick: nickValue.trim() });
    return { session: next };
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'nick_taken') return { error: 'Bu nick kullanımda' as const };
    return { error: 'Nick kaydedilemedi' as const };
  }
}

async function saveUserPhoto(session: UserSession, photo: string) {
  return patchMe({ photo });
}

function yetkiLabel(role?: string, title?: string, vip = false) {
  if (role === 'ADMIN') return title ? `Lider · ${title}` : 'Lider';
  if (role === 'MODERATOR') return title ? `Yetkili · ${title}` : 'Yetkili';
  if (vip) return title ? `VIP · ${title}` : 'VIP';
  if (title === 'ELDER' || title === 'ASSTN') return title;
  return 'Üye';
}

function isLiveVip(vipUntil?: number | null, now = Date.now()) {
  return Boolean(vipUntil && vipUntil > now);
}

function fileToAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Resim seç'));
      return;
    }
    const image = new Image();
    const blobUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Resim işlenemedi'));
        return;
      }
      const edge = Math.min(image.width, image.height);
      const sx = (image.width - edge) / 2;
      const sy = (image.height - edge) / 2;
      context.drawImage(image, sx, sy, edge, edge, 0, 0, size, size);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('Resim okunamadı'));
    };
    image.src = blobUrl;
  });
}

function formatNoticeTime(at: number) {
  const diff = Date.now() - at;
  if (diff < 60_000) return 'şimdi';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk`;
  return new Date(at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function resetClubSession() {
  void logoutUser();
}

function PwaInstallChip() {
  const { visible, install, iosHint, hideHint } = usePwaInstall();
  if (!visible) return null;
  return (
    <div className="relative flex flex-col items-end">
      <button type="button" data-testid="button-pwa-install" onClick={() => void install()} className="pwa-install-btn" aria-label="Telefonuna yükle">
        <Download size={12} strokeWidth={2.4} />
        Yükle
      </button>
      {iosHint && (
        <p className="pwa-install-hint">
          Telefona eklemek için tarayıcı menüsünden <strong>Ana Ekrana Ekle</strong> de. iPhone’da Paylaş → Ana Ekrana Ekle.
          <button type="button" onClick={hideHint} className="ml-1 font-bold underline">Tamam</button>
        </p>
      )}
    </div>
  );
}

function LoginScreen({ onLogin, onReset }: { onLogin: (session: UserSession) => void; onReset?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [adminHint, setAdminHint] = useState('');

  useEffect(() => {
    void fetchPublicSetup().then((data) => {
      if (data?.adminUsername) setAdminHint(data.adminUsername);
    });
  }, []);

  const requestInstallReset = () => {
    resetClubSession();
    if (onReset) {
      onReset();
      return;
    }
    window.location.assign('/');
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    const loginName = username.trim();
    const typedPassword = password.trim();
    const typedNick = nick.trim();
    if (loginName.length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalı.');
      return;
    }
    if (typedPassword.length < 4) {
      setError('Şifre en az 4 karakter olmalı.');
      return;
    }

    try {
      if (mode === 'register') {
        if (typedNick.length < 2) {
          setError('Uygulamadaki gerçek nickini gir. Sohbette bu nick görünür.');
          return;
        }
        const session = await registerUser(loginName, typedPassword, typedNick);
        onLogin(session);
        return;
      }
      const session = await loginUser(loginName, typedPassword);
      onLogin(session);
    } catch (err) {
      const code = (err as Error).message;
      if (code === 'exists') setError('Bu kullanıcı adı zaten kayıtlı. Giriş yapmayı dene.');
      else if (code === 'nick_taken') setError('Bu nick kullanımda.');
      else if (code === 'admin_username') setError('Bu kullanıcı adı admin hesabına ait. Giriş ekranından devam et.');
      else if (code === 'invalid_credentials') setError('Kullanıcı adı veya şifre hatalı.');
      else setError('Sunucuya bağlanılamadı. Postgres ve Railway servisinin açık olduğundan emin ol.');
    }
  };

  return (
    <div className="login-page grain flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6">
      <div className="fixed right-3 top-3 z-40 sm:right-5 sm:top-5"><PwaInstallChip /></div>
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <div className="login-panel relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 shadow-[0_30px_100px_rgba(43,13,79,.2)] lg:grid-cols-[1.05fr_.95fr]">
        <div className="login-brand relative hidden min-h-[42rem] overflow-hidden p-8 text-white lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
          <div className="login-orbit login-orbit-one" /><div className="login-orbit login-orbit-two" />
          <ClubLogo className="club-logo-hero relative z-10" />
        </div>
        <div className="flex min-h-0 flex-col justify-center p-6 sm:p-10 lg:min-h-[38rem] lg:p-14">
          <div className="mb-8 flex items-center justify-between gap-3">
            <ClubLogo size={72} className="club-logo-mark size-[4.5rem] lg:hidden" />
          </div>
          <div className="mb-8"><p className="font-mono text-[.62rem] font-bold tracking-[.18em] text-[hsl(var(--primary))]">{mode === 'login' ? 'ÜYE GİRİŞİ' : 'YENİ HESAP'}</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">{mode === 'login' ? 'Hoş geldin.' : 'Kayıt ol.'}</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{mode === 'login' ? 'Kullanıcı adın ve şifrenle gir. Sohbette uygulamadaki nickin görünür.' : 'Kullanıcı adı giriş içindir. Uygulamadaki gerçek nickini ayrı yaz.'}</p></div>
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-[hsl(var(--muted)/.55)] p-1 text-xs font-bold">
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className={`h-10 rounded-lg ${mode === 'login' ? 'bg-white text-[hsl(var(--primary))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>Giriş yap</button>
            <button type="button" onClick={() => { setMode('register'); setError(''); }} className={`h-10 rounded-lg ${mode === 'register' ? 'bg-white text-[hsl(var(--primary))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>Kayıt ol</button>
          </div>
          <form onSubmit={submitAuth} className="grid gap-4">
            <label className="login-label">Kullanıcı adı<div className="relative"><UserRound className="login-field-icon" size={17} /><input autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); setError(''); }} placeholder="Giriş için kullanıcı adın" className="login-field" /></div></label>
            {mode === 'register' && (
              <label className="login-label">Uygulamadaki gerçek nick<div className="relative"><Sparkles className="login-field-icon" size={17} /><input value={nick} onChange={(event) => { setNick(event.target.value); setError(''); }} placeholder="Sohbette görünecek nick" className="login-field" /></div><span className="login-help">Uyarı: Buraya uygulamadaki gerçek nickini yaz. Üye listesi, sohbet ve çekilişte yalnızca bu nick görünür.</span></label>
            )}
            <label className="login-label">Şifre<div className="relative"><KeyRound className="login-field-icon" size={17} /><input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Şifren" className="login-field" /></div></label>
            {error && (
              <div className="grid gap-2 rounded-lg bg-[#fff0f1] px-3 py-2">
                <p role="alert" className="text-xs font-semibold text-[#c54d5b]">{error}</p>
              </div>
            )}
            <button type="submit" className="login-submit">{mode === 'login' ? 'MOD CLUB’a giriş yap' : 'Hesabı oluştur'} <ArrowRight size={17} /></button>
          </form>
          <div className="login-admin-note"><strong>Admin girişi:</strong> {adminHint ? <>kullanıcı adı <b>{adminHint}</b></> : <>önce kurulum sihirbazını tamamla.</>}</div>
          <button type="button" onClick={requestInstallReset} className="mt-3 text-xs font-bold text-[hsl(var(--primary))] hover:underline">Giriş bilgilerini temizle</button>
        </div>
      </div>
    </div>
  );
}

function EventsPage({ events, joinedEvents, onToggle }: { events: { id: string; date: string; time: string; category: string; title: string; copy: string; tone: string }[]; joinedEvents: string[]; onToggle: (id: string) => void }) {
  return <div className="page-view"><div className="page-hero page-hero-events"><div><p className="page-kicker">MOD CLUB TAKVİMİ</p><h1>Etkinlikler</h1><p>Topluluğunla birlikte oynayacağın yeni anları keşfet.</p></div><CalendarDays size={48} /></div><div className="mb-5 flex items-end justify-between"><div><p className="page-kicker">YAKLAŞANLAR</p><h2 className="font-display text-xl font-bold">Seni bekleyen etkinlikler</h2></div><span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-[.62rem] font-bold text-[hsl(var(--primary))]">{joinedEvents.length} katılım</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => { const joined = joinedEvents.includes(event.id); return <article key={event.id} className={`overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-white ${event.tone === 'purple' ? 'shadow-[0_12px_35px_rgba(137,60,216,.1)]' : ''}`}><div className={`relative flex h-32 items-end justify-between overflow-hidden p-4 ${event.tone === 'purple' ? 'bg-[linear-gradient(135deg,#5c1e91,#b24af4)]' : event.tone === 'rose' ? 'bg-[linear-gradient(135deg,#9d286d,#ef6aa9)]' : event.tone === 'blue' ? 'bg-[linear-gradient(135deg,#2567a9,#65b8ec)]' : 'bg-[linear-gradient(135deg,#258b68,#82d59c)]'}`}><span className="rounded-full bg-white/20 px-2 py-1 font-mono text-[.5rem] font-bold text-white">{event.category}</span><span className="font-display text-5xl font-bold text-white/25">{event.id.slice(-1)}</span></div><div className="p-4"><h3 className="font-display text-base font-bold">{event.title}</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{event.copy}</p><div className="mt-4 flex flex-wrap gap-3 text-[.62rem] font-semibold text-[hsl(var(--muted-foreground))]"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{event.date}</span><span className="inline-flex items-center gap-1"><Clock3 size={13} />{event.time}</span></div><button onClick={() => onToggle(event.id)} className={`mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold ${joined ? 'bg-[#e2f6e8] text-[#2c9650]' : 'bg-[hsl(var(--foreground))] text-white hover:bg-[hsl(var(--primary))]'}`}>{joined && <Check size={14} />}{joined ? 'Katıldın' : 'Katıl'}</button></div></article>; })}</div></div>;
}

function StorePage({ coins, vipUntil, now, busy, onBuy }: { coins: number; vipUntil?: number | null; now: number; busy: boolean; onBuy: (pack: '7' | '30') => void }) {
  const vip = isLiveVip(vipUntil, now);
  const left = vip && vipUntil ? Math.max(0, vipUntil - now) : 0;
  const days = Math.ceil(left / 86400000);
  return (
    <div className="page-view">
      <div className="page-hero page-hero-games">
        <div>
          <p className="page-kicker">MAĞAZA</p>
          <h1>Mağaza</h1>
          <p>Uygulama coin’inle VIP al. Sohbette ve rulette ismin ayrı durur.</p>
        </div>
        <Store size={48} />
      </div>
      <div className="wallet-card">
        <span className="grid size-11 place-items-center rounded-2xl bg-[#f5e6a6] text-[#8a6a12]"><Coins size={22} /></span>
        <div>
          <p className="text-[.62rem] font-extrabold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Cüzdan</p>
          <p className="font-display text-2xl font-bold">{coins} coin</p>
        </div>
        <span className={vip ? 'ml-auto rounded-full bg-[#f5e6a6] px-3 py-1 text-[.62rem] font-extrabold text-[#8a6a12]' : 'ml-auto rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-[.62rem] font-extrabold text-[hsl(var(--muted-foreground))]'}>{vip ? `VIP · ${days} gün` : 'VIP yok'}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="store-pack">
          <p className="font-mono text-[.55rem] font-extrabold tracking-[.14em] text-amber-200">VIP</p>
          <h2 className="mt-1 font-display text-xl font-bold">7 gün</h2>
          <p className="mt-1 text-xs text-white/70">Renkli isim, VIP rozeti, rulette kazanan kartı.</p>
          <button type="button" disabled={busy || coins < 500} onClick={() => onBuy('7')} className="guess-btn-primary mt-4 w-full">500 coin</button>
        </article>
        <article className="store-pack store-pack-long">
          <p className="font-mono text-[.55rem] font-extrabold tracking-[.14em] text-amber-200">VIP</p>
          <h2 className="mt-1 font-display text-xl font-bold">30 gün</h2>
          <p className="mt-1 text-xs text-white/70">Aynı VIP görünümü, daha uzun süre.</p>
          <button type="button" disabled={busy || coins < 1500} onClick={() => onBuy('30')} className="guess-btn-primary mt-4 w-full">1500 coin</button>
        </article>
      </div>
    </div>
  );
}

const TABLE_BET_KINDS = new Set<string | number>(['STRAIGHT_UP', 'RED', 'BLACK', 'ODD', 'EVEN', '1_TO_18', '19_TO_36', '0', 0]);

function serverBetToTableId(bet: { kind: string; number?: number }) {
  if (bet.kind === 'straight') return bet.number === 0 ? '0' : String(bet.number);
  if (bet.kind === 'red') return 'RED';
  if (bet.kind === 'black') return 'BLACK';
  if (bet.kind === 'odd') return 'ODD';
  if (bet.kind === 'even') return 'EVEN';
  if (bet.kind === 'low') return '1_TO_18';
  if (bet.kind === 'high') return '19_TO_36';
  return null;
}

function buildTableBets(allBets: { kind: string; number?: number }[]) {
  const out: Record<string, { icon: string }> = {};
  for (const bet of allBets) {
    const id = serverBetToTableId(bet);
    if (id) out[id] = { icon: CHIP_ICON };
  }
  return out;
}

function tableBetToApi(bet: string | number, payload: string[]) {
  if (bet === '0' || bet === 0) return { kind: 'straight', number: 0 };
  if (bet === 'STRAIGHT_UP') return { kind: 'straight', number: Number(payload[0]) };
  if (bet === 'RED') return { kind: 'red' };
  if (bet === 'BLACK') return { kind: 'black' };
  if (bet === 'ODD') return { kind: 'odd' };
  if (bet === 'EVEN') return { kind: 'even' };
  if (bet === '1_TO_18') return { kind: 'low' };
  if (bet === '19_TO_36') return { kind: 'high' };
  return null;
}

function GamesPage({
  room,
  coins,
  nick,
  now,
  busy,
  chip,
  onChip,
  onBet,
}: {
  room: PublicRoulette | null;
  coins: number;
  nick: string;
  now: number;
  busy: boolean;
  chip: number;
  onChip: (value: number) => void;
  onBet: (kind: string, number?: number) => void;
}) {
  const status = room?.status || 'betting';
  const left = status === 'betting'
    ? Math.max(0, Math.ceil(((room?.bettingEndsAt || 0) - now) / 1000))
    : status === 'spinning'
      ? Math.max(0, Math.ceil(((room?.spinEndsAt || 0) - now) / 1000))
      : Math.max(0, Math.ceil(((room?.settledUntil || 0) - now) / 1000));
  const mine = (room?.bets || []).filter((item) => item.nick === nick);
  const allBets = room?.bets || [];
  const prevStatusRef = useRef(status);
  const countdownRef = useRef(-1);
  const [tableNote, setTableNote] = useState('');

  useEffect(() => {
    if (status === 'betting' && left <= 5 && left > 0 && left !== countdownRef.current) {
      countdownRef.current = left;
      playCountdown();
    }
    if (status !== 'betting') countdownRef.current = -1;
  }, [status, left]);

  useEffect(() => {
    if (prevStatusRef.current === 'spinning' && status === 'settled' && (room?.winners || []).length > 0) {
      playWin();
    }
    prevStatusRef.current = status;
  }, [status, room?.winners]);

  const tableBets = buildTableBets(allBets);

  const handleTableBet = ({ bet, payload }: { bet: string | number; payload: string[]; id: string }) => {
    if (status !== 'betting' || busy || coins < chip) return;
    if (!TABLE_BET_KINDS.has(bet)) {
      setTableNote('Sadece tek sayı, kırmızı/siyah, tek/çift ve 1–18 / 19–36 desteklenir.');
      return;
    }
    setTableNote('');
    const mapped = tableBetToApi(bet, payload);
    if (!mapped) return;
    if (mapped.kind === 'straight') onBet('straight', mapped.number);
    else onBet(mapped.kind);
  };
  return (
    <div className="page-view roulette-page">
      <div className="roulette-header">
        <div className="roulette-meta">
          <span className="roulette-badge"><Users size={13} /> {room?.players || 0}</span>
          <span className="roulette-badge">Tur {room?.round || 1}</span>
          <span className="roulette-badge roulette-badge-coin"><Coins size={13} /> {coins}</span>
        </div>
        <div className={`roulette-status ${status === 'betting' ? 'is-betting' : status === 'spinning' ? 'is-spinning' : 'is-settled'}`}>
          {status === 'betting' ? <><Timer size={15} /> Bahis {left}s</> : status === 'spinning' ? 'Çark dönüyor…' : room?.result === 0 ? '0 yeşil!' : `Sonuç: ${room?.result}`}
        </div>
      </div>
      <CasinoRouletteStage
        phase={status}
        result={room?.result}
        round={room?.round || 1}
      />
      <div className="roulette-chips-bar">
        {[10, 50, 100, 500].map((value) => (
          <button key={value} type="button" onClick={() => onChip(value)} className={`roulette-chip-btn ${chip === value ? 'is-on' : ''}`}>
            <span className="roulette-chip-icon" />{value}
          </button>
        ))}
      </div>
      {tableNote && <p className="roulette-table-note">{tableNote}</p>}
      <div className="roulette-table-wrap">
        <RouletteTable bets={tableBets} onBet={handleTableBet} />
      </div>
      {mine.length > 0 && (
        <div className="roulette-my-bets">
          {mine.map((item, i) => (
            <span key={i} className="roulette-my-chip">{item.kind === 'straight' ? item.number : item.kind} · {item.amount}</span>
          ))}
        </div>
      )}
      {(room?.winners || []).length > 0 && status !== 'betting' && (
        <div className="roulette-winners-flow">
          <p className="roulette-winners-title"><Trophy size={15} /> Kazananlar</p>
          <div className="roulette-winners-list">
            {room?.winners.map((winner, i) => (
              <div key={`${winner.nick}-${i}`} className={`roulette-winner-card ${winner.vip ? 'is-vip' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>
                <span className="rw-name">{winner.nick}</span>
                {winner.vip && <span className="rw-vip">VIP</span>}
                <span className="rw-payout">+{winner.payout}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuPage({ onAdmin, onLogout, onOpen }: { onAdmin: () => void; onLogout: () => void; onOpen: (page: string) => void }) {
  const items = [
    { title: 'Film İzle', copy: 'Önerilen siteleri aç, açıklamayı oku.', icon: Film, page: 'Film İzle' },
    { title: 'Uygulama İndir', copy: 'Topluluk uygulamalarını gör ve indir.', icon: Download, page: 'Uygulama İndir' },
    { title: 'Topluluk keşfi', copy: 'Yeni ekip arkadaşları ve odalar bul.', icon: UsersRound, page: 'Topluluk' },
    { title: 'Duyurular', copy: 'MOD CLUB haberlerini ve güncellemeleri gör.', icon: Megaphone },
    { title: 'Sohbet', copy: 'Canlı sohbeti aç.', icon: MessageCircle, page: 'Sohbet' },
    { title: 'Mağaza', copy: 'Coin ile VIP satın al.', icon: Store, page: 'Mağaza' },
    { title: 'Ayarlar', copy: 'Hesap ve uygulama tercihlerini düzenle.', icon: Settings, page: 'Hesap ayarları' },
  ];
  return <div className="page-view"><div className="page-hero page-hero-menu"><div><p className="page-kicker">KULÜP ARAÇLARI</p><h1>Menü</h1><p>MOD CLUB deneyimini kendi akışına göre yönet.</p></div><Menu size={48} /></div><div className="grid gap-3 sm:grid-cols-2">{items.map(({ title, copy, icon: Icon, page }) => <button key={title} onClick={() => page ? onOpen(page) : window.alert(`${title} yakında açılıyor`)} className="menu-link-card"><span className="grid size-11 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Icon size={20} /></span><span className="flex-1 text-left"><strong>{title}</strong><small>{copy}</small></span><ChevronRight size={17} /></button>)}<button onClick={onAdmin} className="menu-link-card border-[hsl(var(--primary)/.2)] bg-[hsl(var(--secondary)/.55)]"><span className="grid size-11 place-items-center rounded-xl bg-[hsl(var(--primary))] text-white"><Shield size={20} /></span><span className="flex-1 text-left"><strong>Admin paneli</strong><small>Üyeleri, çekilişleri, film ve uygulamaları yönet.</small></span><ChevronRight size={17} /></button></div><button onClick={onLogout} className="mt-8 flex h-12 items-center justify-center gap-2 rounded-xl border border-[#f2c9d0] bg-[#fff5f6] text-sm font-bold text-[#c44b5a]"><LogOut size={17} />Çıkış yap</button></div>;
}

function CommunityPage() {
  return (
    <div className="page-view">
      <div className="page-hero page-hero-menu">
        <div><p className="page-kicker">ÜYELER</p><h1>Topluluk</h1><p>Yeni ekip arkadaşları ve odalar burada toplanacak.</p></div>
        <UsersRound size={48} />
      </div>
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-6 text-sm text-[hsl(var(--muted-foreground))]">Topluluk keşfi yakında. Şimdilik sohbet ve etkinliklerden devam edebilirsin.</div>
    </div>
  );
}

function ContentCardsPage({ title, kicker, copy, items, actionLabel }: { title: string; kicker: string; copy: string; items: ContentCard[]; actionLabel: string }) {
  return (
    <div className="page-view">
      <div className="page-hero page-hero-menu">
        <div><p className="page-kicker">{kicker}</p><h1>{title}</h1><p>{copy}</p></div>
        {title === 'Film İzle' ? <Film size={48} /> : <Download size={48} />}
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-white p-8 text-center">
          <p className="text-sm font-bold">Henüz içerik yok</p>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Admin panelinden resim, link ve açıklama ekleyebilir.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-white">
              <div className="relative h-36 overflow-hidden bg-[linear-gradient(135deg,#3b1468,#8b2ce4)]">
                {item.image ? <img src={item.image} alt={item.title} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-white/70">{title === 'Film İzle' ? <Film size={36} /> : <Download size={36} />}</span>}
              </div>
              <div className="p-4">
                <h3 className="font-display text-base font-bold">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.description || 'Açıklama eklenmedi.'}</p>
                <button
                  type="button"
                  onClick={() => { if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer'); }}
                  disabled={!item.link}
                  className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[hsl(var(--foreground))] text-xs font-bold text-white hover:bg-[hsl(var(--primary))] disabled:opacity-40"
                >
                  {actionLabel} <Link2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const RANK_STYLE = {
  admin: { tag: 'lider', Left: Crown, Right: Flame, NameL: Zap, NameR: Sparkles },
  elder: { tag: 'elder', Left: Gem, Right: Trees, NameL: Star, NameR: Sparkles },
  asstn: { tag: 'asstn', Left: Star, Right: Wand2, NameL: Sparkles, NameR: Zap },
} as const;

const ADMIN_MUTE_OPTIONS = [
  { label: '10 dakika', ms: 10 * 60 * 1000 },
  { label: '1 saat', ms: 60 * 60 * 1000 },
  { label: '6 saat', ms: 6 * 60 * 60 * 1000 },
  { label: '1 gün', ms: 24 * 60 * 60 * 1000 },
  { label: '1 hafta', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Kalıcı', ms: 1000 * 60 * 60 * 24 * 365 * 10 },
] as const;

function displayRankKind(role?: string, title?: CosmeticTitle | string) {
  if (role === 'ADMIN') return 'admin' as const;
  if (role === 'MODERATOR') return 'mod' as const;
  if (title === 'ELDER') return 'elder' as const;
  if (title === 'ASSTN') return 'asstn' as const;
  return null;
}

function RankedName({ name, role, title, appId, size = 'sm', align = 'start', onDark = false, muted = false, revealId = false, vip = false }: { name: string; role?: string; title?: CosmeticTitle | string; appId?: string; size?: 'sm' | 'lg'; align?: 'start' | 'end'; onDark?: boolean; muted?: boolean; revealId?: boolean; vip?: boolean }) {
  const [idOpen, setIdOpen] = useState(false);
  const kind = displayRankKind(role, title);
  const idLine = revealId && idOpen ? <small className="rank-app-id">{appId ? `ID ${appId}` : 'ID yok'}</small> : null;
  const nameProps = revealId
    ? { role: 'button' as const, tabIndex: 0, onClick: () => setIdOpen((open) => !open), title: 'Uygulama ID’sini görmek için dokun' }
    : {};
  if (!kind) {
    return (
      <span
        className={`${vip ? 'rank-name rank-name-vip' : ''} ${size === 'lg' ? 'font-display text-2xl font-bold' : onDark ? 'text-[.68rem] font-bold text-white' : 'text-[.6rem] font-bold text-[hsl(var(--primary))]'}`}
        {...nameProps}
      >
        {vip && <small className="rank-tag">vip</small>}
        {name}
        {idLine}
        {muted && <small className="rank-muted">susturuldu</small>}
      </span>
    );
  }

  const glyph = size === 'lg' ? 15 : 10;
  const fancy = kind === 'mod' ? null : RANK_STYLE[kind];
  const LeftIcon = fancy?.Left;
  const RightIcon = fancy?.Right;
  const NameLIcon = fancy?.NameL;
  const NameRIcon = fancy?.NameR;

  return (
    <span className={`rank-name rank-name-${kind} ${vip ? 'is-vip' : ''} ${align === 'end' ? 'is-end' : ''} ${size === 'lg' ? 'is-lg' : ''} ${onDark ? 'on-dark' : ''}`} {...nameProps}>
      {fancy && LeftIcon && RightIcon ? (
        <span className="rank-tag-row">
          <LeftIcon className="rank-glyph rank-glyph-crown" size={glyph} strokeWidth={2.6} aria-hidden="true" />
          <small className="rank-tag">{fancy.tag}</small>
          <RightIcon className="rank-glyph rank-glyph-flame" size={glyph} strokeWidth={2.6} aria-hidden="true" />
        </span>
      ) : (
        <small className="rank-tag">yetkili</small>
      )}
      <span className="rank-name-text">
        {NameLIcon && <NameLIcon className="rank-glyph rank-glyph-bolt" size={size === 'lg' ? 16 : 11} strokeWidth={2.6} aria-hidden="true" />}
        <span className="rank-name-label">{name}</span>
        {NameRIcon && <NameRIcon className="rank-glyph rank-glyph-spark" size={size === 'lg' ? 14 : 10} strokeWidth={2.4} aria-hidden="true" />}
        {size === 'lg' && (
          <>
            <i className="rank-smoke" aria-hidden="true" />
            <i className="rank-smoke rank-smoke-two" aria-hidden="true" />
            {kind === 'admin' && (
              <>
                <i className="rank-spark rank-spark-one" aria-hidden="true" />
                <i className="rank-spark rank-spark-two" aria-hidden="true" />
                <i className="rank-spark rank-spark-three" aria-hidden="true" />
              </>
            )}
          </>
        )}
      </span>
      {muted && <small className="rank-muted">susturuldu</small>}
      {idLine}
    </span>
  );
}

function ProfilePage({ session, onLogout, onSession, onNotice }: { session: UserSession; onLogout: () => void; onSession: (session: UserSession) => void; onNotice: (text: string) => void }) {
  const user = resolveSession(session);
  const nick = displayNick(user);
  const photo = avatarFor(nick, user.photo);
  const [appIdDraft, setAppIdDraft] = useState(user.appId || '');
  const [nickDraft, setNickDraft] = useState(nick);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const saveId = async (event: FormEvent) => {
    event.preventDefault();
    const value = appIdDraft.trim();
    if (!value) {
      onNotice('Uygulama ID’si zorunlu. Profilinden gir.');
      return;
    }
    onSession(await saveUserAppId(user, value));
    onNotice('Uygulama ID’sin kaydedildi');
  };

  const saveNick = async (event: FormEvent) => {
    event.preventDefault();
    const value = nickDraft.trim();
    if (value.length < 2) {
      onNotice('Nick en az 2 karakter olmalı');
      return;
    }
    const result = await saveUserNick(user, value);
    if ('error' in result && result.error) {
      onNotice(result.error);
      return;
    }
    onSession(result.session);
    onNotice('Nickin güncellendi');
  };

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const nextPhoto = await fileToAvatar(file);
      onSession(await saveUserPhoto(user, nextPhoto));
      onNotice('Profil resmi güncellendi');
    } catch {
      onNotice('Resim yüklenemedi. Başka bir görsel dene.');
    }
  };

  return (
    <div className="page-view">
      <div className="page-hero page-hero-profile">
        <div><p className="page-kicker">HESABIN</p><h1>Profil</h1><p>Resmini, nickini ve ID’ni buradan düzenle.</p></div>
        <UserRound size={48} />
      </div>
      <div className="profile-card overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-white">
        <div className="profile-cover" />
        <div className="relative px-5 pb-6 sm:px-8">
          <div className="relative -mt-12 w-fit">
            <img src={photo} alt={`${nick} profil fotoğrafı`} className="size-24 rounded-3xl border-4 border-[hsl(var(--background))] object-cover shadow-xl" />
            <button type="button" data-testid="button-edit-photo" aria-label="Profil resmini değiştir" onClick={() => photoInputRef.current?.click()} className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md">
              <Camera size={15} />
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void pickPhoto(event)} />
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2><RankedName name={nick} role={user.role} title={user.title} size="lg" vip={isLiveVip(user.vipUntil)} /></h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Giriş: @{user.username}</p>
              <p className="mt-1 text-xs font-bold text-[hsl(var(--primary))]">{yetkiLabel(user.role, user.title, isLiveVip(user.vipUntil))}</p>
              <p className="mt-1 text-xs font-extrabold text-amber-600">{user.coins ?? 0} coin</p>
              <p className="mt-1 font-mono text-[.7rem] font-bold text-[hsl(var(--primary))]">{user.appId ? `ID ${user.appId}` : 'Uygulama ID’si henüz girilmedi'}</p>
            </div>
            <button onClick={onLogout} className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:text-[#c44b5a]"><LogOut size={15} />Çıkış yap</button>
          </div>
          <form onSubmit={saveNick} className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4">
            <label className="grid gap-2 text-xs font-bold">
              Kullanıcı nicki
              <input
                data-testid="input-profile-nick"
                value={nickDraft}
                onChange={(event) => setNickDraft(event.target.value)}
                placeholder="Sohbette görünecek nick"
                className="h-11 rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-sm font-normal outline-none focus:border-[hsl(var(--primary))]"
              />
            </label>
            <button type="submit" data-testid="button-save-nick" className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[hsl(var(--foreground))] px-4 text-xs font-bold text-white hover:bg-[hsl(var(--primary))]">Nicki kaydet</button>
          </form>
          <form onSubmit={saveId} className="mt-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4">
            <label className="grid gap-2 text-xs font-bold">
              Uygulama ID
              <input
                data-testid="input-app-id"
                value={appIdDraft}
                onChange={(event) => setAppIdDraft(event.target.value)}
                placeholder="Uygulamadaki ID’ni yaz"
                className="h-11 rounded-xl border border-[hsl(var(--border))] bg-white px-3 text-sm font-normal outline-none focus:border-[hsl(var(--primary))]"
              />
            </label>
            <p className="mt-2 text-[.65rem] leading-relaxed text-[hsl(var(--muted-foreground))]">Sohbete yazmak için zorunlu. Nick görünür; ID resme veya nicke dokununca açılır.</p>
            <button type="submit" data-testid="button-save-app-id" className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[hsl(var(--foreground))] px-4 text-xs font-bold text-white hover:bg-[hsl(var(--primary))]">ID’yi kaydet</button>
          </form>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="profile-stat"><strong>28</strong><span>Etkinlik</span></div>
            <div className="profile-stat"><strong>1.248</strong><span>MOD puanı</span></div>
            <div className="profile-stat"><strong>12</strong><span>Rozet</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ session, colorMode, onColorMode, onOpenProfile }: { session: UserSession; colorMode: ColorMode; onColorMode: (mode: ColorMode) => void; onOpenProfile: () => void }) {
  const user = resolveSession(session);
  const nick = displayNick(user);
  return (
    <div className="page-view">
      <div className="page-hero page-hero-menu">
        <div><p className="page-kicker">HESAP</p><h1>Hesap ayarları</h1><p>Görünümü değiştir, uygulama ID’sini ve hesabını yönet.</p></div>
        <Settings size={48} />
      </div>
      <div className="grid gap-3">
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4 sm:p-5">
          <p className="font-mono text-[.58rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">GÖRÜNÜM</p>
          <h2 className="mt-1 font-display text-lg font-bold">Gece / gündüz</h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Tüm sayfalar bu ayarı kullanır.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" data-testid="button-theme-light" onClick={() => onColorMode('light')} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${colorMode === 'light' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'}`}><Sun size={16} />Gündüz</button>
            <button type="button" data-testid="button-theme-dark" onClick={() => onColorMode('dark')} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${colorMode === 'dark' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'}`}><Moon size={16} />Gece</button>
          </div>
        </section>
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4 sm:p-5">
          <p className="font-mono text-[.58rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">KİMLİK</p>
          <h2 className="mt-1 font-display text-lg font-bold">{nick}</h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Giriş: @{user.username}</p>
          <p className="mt-3 rounded-xl bg-[hsl(var(--muted)/.5)] px-3 py-2 font-mono text-xs font-bold">{user.appId ? `Uygulama ID: ${user.appId}` : 'Uygulama ID’si yok — sohbet için profilinden gir.'}</p>
          <button type="button" onClick={onOpenProfile} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 text-xs font-bold hover:border-[hsl(var(--primary)/.4)] hover:text-[hsl(var(--primary))]"><KeyRound size={14} />Profilde ID düzenle</button>
        </section>
      </div>
    </div>
  );
}

function WrenchIcon({ size = 20, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a4.5 4.5 0 0 0-5.9 5.9L3.5 17.5a2.12 2.12 0 1 0 3 3l5.3-5.3a4.5 4.5 0 0 0 5.9-5.9l-2.6 2.6-3-3 2.6-2.6Z" /><path d="m16 16 5 5" /></svg>;
}

function SwipeReplyRow({ onReply, children }: { onReply: () => void; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; locked?: 'h' | 'v' } | null>(null);
  const offsetRef = useRef(0);

  const finish = (next: number) => {
    if (next >= 56) onReply();
    setDragging(false);
    setOffset(0);
    offsetRef.current = 0;
    startRef.current = null;
  };

  return (
    <div
      className={`chat-swipe ${dragging ? 'is-drag' : ''}`}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        startRef.current = { x: event.clientX, y: event.clientY };
        offsetRef.current = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = startRef.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.locked) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          start.locked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        }
        if (start.locked !== 'h') return;
        const next = Math.max(0, Math.min(84, dx));
        offsetRef.current = next;
        setDragging(true);
        setOffset(next);
      }}
      onPointerUp={() => finish(offsetRef.current)}
      onPointerCancel={() => finish(0)}
    >
      <span className={`chat-swipe-icon ${offset > 28 ? 'is-on' : ''}`} aria-hidden="true"><Reply size={15} /></span>
      <div className={`chat-swipe-row ${dragging ? 'is-drag' : ''}`} style={{ transform: `translate3d(${offset}px,0,0)` }}>
        {children}
      </div>
    </div>
  );
}

function makeWinnerCard(item: Giveaway): ChatMessage {
  return {
    id: `winner-${item.id}`,
    kind: 'winner',
    author: 'MOD CLUB',
    initials: 'MC',
    avatar: 'bg-[#3b1468] text-white',
    photo: '/logo.png',
    message: `${item.winner} kazandı`,
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    winner: item.winner,
    prizeTitle: item.title,
    prizeText: item.prizeText,
    prizeImage: item.prizeImage,
    giveawayId: item.id,
    at: Date.now(),
  };
}

function Home({ session, onLogout, onSession }: { session: UserSession; onLogout: () => void; onSession: (session: UserSession) => void }) {
  const [slide, setSlide] = useState(0);
  const [selectedQuick, setSelectedQuick] = useState('SOHBET');
  const [activeNav, setActiveNav] = useState('Ana Sayfa');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('chat') === '1');
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [chatMuted, setChatMutedOn] = useState(() => typeof window !== 'undefined' && isChatMuted());
  const [notifyPromptOpen, setNotifyPromptOpen] = useState(() => typeof window !== 'undefined' && !wasNotifyPrompted() && 'Notification' in window && Notification.permission === 'default');
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [muteTarget, setMuteTarget] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ClubAccount[]>([]);
  const [timeouts, setTimeouts] = useState<ChatTimeout[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [banners, setBanners] = useState<Banner[]>(slides);
  const [adminPanelOpen, setAdminPanelOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1');
  const [adminSection, setAdminSection] = useState('Genel Bakış');
  const [adminUsers, setAdminUsers] = useState<{ id: string; name: string; nick: string; email: string; role: string; status: string; photo: string; username: string }[]>([]);
  const [managedPages, setManagedPages] = useState(initialManagedPages);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerCopy, setBannerCopy] = useState('');
  const [bannerHasButton, setBannerHasButton] = useState(true);
  const [broadcastTitle, setBroadcastTitle] = useState('Duyuru');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastLog, setBroadcastLog] = useState<{ id: string; title: string; body: string; at: number }[]>([]);
  const [ticker, setTicker] = useState<{ id: string; title: string; body: string } | null>(null);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [films, setFilms] = useState<ContentCard[]>([]);
  const [apps, setApps] = useState<ContentCard[]>([]);
  const [giveawayOpen, setGiveawayOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [giveawayTitle, setGiveawayTitle] = useState('');
  const [giveawayPrize, setGiveawayPrize] = useState('');
  const [giveawayImage, setGiveawayImage] = useState('');
  const [giveawayWhen, setGiveawayWhen] = useState('');
  const [filmTitle, setFilmTitle] = useState('');
  const [filmCopy, setFilmCopy] = useState('');
  const [filmImage, setFilmImage] = useState('');
  const [filmLink, setFilmLink] = useState('');
  const [appTitle, setAppTitle] = useState('');
  const [appCopy, setAppCopy] = useState('');
  const [appImage, setAppImage] = useState('');
  const [appLink, setAppLink] = useState('');
  const [colorMode, setColorMode] = useState<ColorMode>(() => (typeof window !== 'undefined' ? loadColorMode() : 'dark'));
  const [notices, setNotices] = useState<ClubNotice[]>([]);
  const [chatReadAt, setChatReadAt] = useState(0);
  const user = resolveSession(session);
  const nick = displayNick(user);
  const myPhoto = avatarFor(nick, user.photo);
  const isAdmin = user.role === 'ADMIN';
  const isModerator = user.role === 'MODERATOR';
  const canMuteStaff = isAdmin || isModerator;
  const selfMute = activeChatTimeout(timeouts, nick, now);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<typeof announcements[number] | null>(null);
  const [guessGame, setGuessGame] = useState<PublicGuessGame | null>(null);
  const [guessSetupOpen, setGuessSetupOpen] = useState(false);
  const [guessEndOpen, setGuessEndOpen] = useState(false);
  const [guessMin, setGuessMin] = useState('1');
  const [guessMax, setGuessMax] = useState('20');
  const [guessSecret, setGuessSecret] = useState('');
  const [guessSeconds, setGuessSeconds] = useState('10');
  const [guessNumber, setGuessNumber] = useState('');
  const [guessBusy, setGuessBusy] = useState(false);
  const guessStatusRef = useRef<PublicGuessGame['status'] | null>(null);
  const [roulette, setRoulette] = useState<PublicRoulette | null>(null);
  const [walletCoins, setWalletCoins] = useState(session.coins ?? 0);
  const [walletVip, setWalletVip] = useState(session.vipUntil ?? 0);
  const [storeBusy, setStoreBusy] = useState(false);
  const [rouletteChip, setRouletteChip] = useState(10);
  const [chatProfile, setChatProfile] = useState<{ nick: string; photo: string; role?: string; title?: string; appId?: string; vip?: boolean } | null>(null);
  const [joinedEvents, setJoinedEvents] = useState<string[]>([]);
  const [notice, setNotice] = useState(`Hoş geldin, ${displayNick(session)}`);
  const openGiveaways = giveaways.filter((item) => giveawayStatus(item, now) === 'open');
  const liveGiveaway = openGiveaways[0];

  const currentSlide = banners[slide % banners.length] ?? slides[0];
  const upcomingEvents = useMemo(() => events.slice(0, 4), []);

  const changeSlide = (direction: number) => {
    setSlide((current) => (current + direction + banners.length) % banners.length);
  };

  const handleQuickSelect = (label: string) => {
    setSelectedQuick(label);
    if (label === 'SOHBET') {
      setChatOpen(true);
      setNotice('Canlı sohbet açık');
      return;
    }
    if (label === 'OYUNLAR') {
      handleNav('Oyunlar');
      return;
    }
    if (label === 'TOPLULUK') {
      handleNav('Topluluk');
      return;
    }
    if (label === 'DUYURULAR') {
      setNotice('Duyurular listeleniyor');
      return;
    }
    setNotice(`${label.toLocaleLowerCase('tr-TR')} alanına göz atıyorsun`);
  };

  const handleNav = (label: string) => {
    if (label === 'Sohbet') {
      setMenuOpen(false);
      setChatOpen(true);
      return;
    }
    if (label === 'Film izle' || label === 'Film İzle') {
      setMenuOpen(false);
      setChatOpen(false);
      setActiveNav('Film İzle');
      setNotice('Film izle açık');
      return;
    }
    if (label === 'Mağaza') {
      setMenuOpen(false);
      setChatOpen(false);
      setActiveNav('Mağaza');
      setNotice('Mağaza açık');
      return;
    }
    setChatOpen(false);
    setChatProfile(null);
    if (label === 'Menü') {
      setMenuOpen((open) => !open);
      return;
    }
    setMenuOpen(false);
    setActiveNav(label);
    if (label === 'Ana Sayfa') {
      setNotice('Ana sayfaya döndün');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (label === 'Profil') {
      setNotice('Profilini düzenle, uygulama ID’sini buradan gir');
      return;
    }
    if (label === 'Hesap ayarları') {
      setNotice('Hesap ayarları açık');
      return;
    }
    setNotice(`${label} alanına geçtin`);
  };

  const changeColorMode = (mode: ColorMode) => {
    storeColorMode(mode);
    setColorMode(mode);
    setNotice(mode === 'dark' ? 'Gece görünümü açık' : 'Gündüz görünümü açık');
  };

  const applySnapshot = (data: Awaited<ReturnType<typeof fetchClub>>) => {
    setBanners(data.banners?.length ? data.banners : slides);
    setGiveaways(data.giveaways || []);
    setFilms(data.films || []);
    setApps(data.apps || []);
    setTimeouts(data.timeouts || []);
    setNotices(data.notices || []);
    setAccounts(data.accounts || []);
    setAdminUsers((data.accounts || []).map((account) => ({
      id: account.username,
      username: account.username,
      name: account.nick,
      nick: account.nick,
      email: '',
      role: account.role,
      status: 'Çevrimiçi',
      photo: avatarFor(account.nick, account.photo),
    })));
    const feed = (data.chat || []) as ChatMessage[];
    setChatMessages(feed.map((message) => ({
      ...message,
      mine: isSystemChat(message) ? false : message.author === nick,
    })));
    const nextGame = data.guessGame || null;
    const prevStatus = guessStatusRef.current;
    guessStatusRef.current = nextGame?.status ?? null;
    setGuessGame(nextGame);
    if (nextGame?.status === 'ended' && (prevStatus === 'playing' || prevStatus === 'revealed')) {
      setGuessEndOpen(true);
    }
    if (nextGame?.status === 'playing') setGuessEndOpen(false);
    setRoulette(data.roulette || null);
    setWalletCoins(data.me?.coins ?? 0);
    setWalletVip(data.me?.vipUntil ?? 0);
    if (data.me) {
      onSession({
        ...session,
        coins: data.me.coins ?? 0,
        vipUntil: data.me.vipUntil ?? undefined,
        photo: data.me.photo || session.photo,
        nick: data.me.nick || session.nick,
        title: data.me.title || session.title,
        appId: data.me.appId || session.appId,
      });
    }
  };

  const pushNotice = (title: string, body: string) => {
    const item: ClubNotice = { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, body, at: Date.now(), read: false };
    setNotices((current) => {
      const next = [item, ...current].slice(0, 40);
      void patchClub({ notices: next });
      return next;
    });
  };

  const markNoticesRead = () => {
    setNotices((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      void patchClub({ notices: next });
      return next;
    });
    setNotice('Tüm bildirimler okundu');
  };

  const clearNotices = () => {
    void patchClub({ notices: [] });
    setNotices([]);
    setNotice('Bildirimler silindi');
  };

  const openNotice = (id: string) => {
    setNotices((current) => {
      const next = current.map((item) => item.id === id ? { ...item, read: true } : item);
      void patchClub({ notices: next });
      return next;
    });
  };

  const unreadNoticeCount = notices.filter((item) => !item.read).length;
  const unreadChatCount = chatMessages.filter((message) => Boolean(message.at) && !message.mine && message.author !== nick && (message.at as number) > chatReadAt).length;

  const showTicker = (title: string, body: string) => {
    setTicker({ id: `t-${Date.now()}`, title, body });
  };

  useEffect(() => {
    if (!ticker) return;
    const timer = window.setTimeout(() => setTicker(null), 14000);
    return () => window.clearTimeout(timer);
  }, [ticker]);

  const toggleJoin = (eventId: string) => {
    const joined = joinedEvents.includes(eventId);
    setJoinedEvents((items) => joined ? items.filter((id) => id !== eventId) : [...items, eventId]);
    setNotice(joined ? 'Etkinlikten ayrıldın' : 'Etkinliğe katılımın alındı');
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (guessGame?.status === 'playing') setChatOpen(true);
  }, [guessGame?.status, guessGame?.round]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const data = await fetchClub();
        if (!cancelled) applySnapshot(data);
      } catch {
        /* oturum yoksa login */
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), guessGame?.status === 'playing' || activeNav === 'Oyunlar' ? 1000 : 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nick, guessGame?.status, activeNav]);

  useEffect(() => {
    void registerClubWorker();
    const stop = startNotifyPolling((event) => {
      if (event.type !== 'chat') pushNotice(event.title, event.body);
      if (event.type === 'admin' || event.type === 'guess') showTicker(event.title, event.body);
      if (event.type === 'chat') setNotice(event.body);
      if (event.type === 'guess') {
        setNotice(event.body);
        setChatOpen(true);
        void fetchClub().then(applySnapshot).catch(() => undefined);
      }
      if (event.type === 'giveaway' || event.type === 'winner') {
        setNotice(event.body);
        void fetchClub().then(applySnapshot).catch(() => undefined);
      }
    });
    return stop;
  }, []);

  const toggleChatMute = () => {
    const next = !chatMuted;
    persistChatMute(next);
    setChatMutedOn(next);
    setNotice(next ? 'Sohbet sessizde. Ses ve bildirim gitmez.' : 'Sohbet bildirimleri açık.');
  };

  const allowPhoneNotify = async () => {
    const result = await requestNotifyPermission();
    setNotifyPromptOpen(false);
    setNotice(result === 'granted' ? 'Telefon bildirimleri açık.' : 'Bildirim izni verilmedi.');
  };

  useEffect(() => {
    if (!chatOpen) return;
    const pinBottom = () => {
      const node = chatScrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    };
    const syncKeyboard = () => {
      const viewport = window.visualViewport;
      const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      setKeyboardInset(inset > 80 ? inset : 0);
      requestAnimationFrame(pinBottom);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.visualViewport?.addEventListener('resize', syncKeyboard);
    window.visualViewport?.addEventListener('scroll', syncKeyboard);
    window.addEventListener('resize', syncKeyboard);
    syncKeyboard();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener('resize', syncKeyboard);
      window.visualViewport?.removeEventListener('scroll', syncKeyboard);
      window.removeEventListener('resize', syncKeyboard);
    };
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
    if (chatOpen) {
      const stamped = Date.now();
      setChatReadAt(stamped);
    }
  }, [chatOpen, chatMessages]);

  useEffect(() => {
    setChatMessages((current) => current.map((message) => ({
      ...message,
      mine: isSystemChat(message) ? false : message.author === nick,
    })));
  }, [nick]);

  useEffect(() => {
    setChatMessages((current) => {
      let next = current;
      for (const item of giveaways) {
        if (!item.winner) continue;
        if (next.some((entry) => entry.id === `winner-${item.id}`)) continue;
        next = [...next, makeWinnerCard(item)];
      }
      return next;
    });
  }, [giveaways]);

  const canMuteAuthor = (message: ChatMessage) => {
    if (!canMuteStaff || isSystemChat(message)) return false;
    if (message.author === nick) return false;
    if (message.role === 'ADMIN') return false;
    if (!isAdmin && message.role === 'MODERATOR') return false;
    return true;
  };

  const applyMute = (author: string, ms: number, label: string) => {
    const nextTimeouts = [...timeouts.filter((item) => nickKey(item.nick) !== nickKey(author)), { nick: author, until: Date.now() + ms, by: nick, label }];
    setTimeouts(nextTimeouts);
    void patchClub({ timeouts: nextTimeouts });
    setMuteTarget(null);
    const muteMessage: ChatMessage = {
      id: `mute-${author}-${Date.now()}`,
      kind: 'mute',
      author: 'MOD CLUB',
      initials: 'MC',
      avatar: 'bg-[#3b1468] text-white',
      photo: '/logo.png',
      message: `${author} ${label} susturuldu`,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      mutedBy: nick,
      muteLabel: label,
      winner: author,
      at: Date.now(),
    };
    setChatMessages((current) => {
      const next = [...current, muteMessage];
      void patchClub({ chat: next.map(({ mine: _mine, ...rest }) => rest) });
      return next;
    });
    setNotice(`${author} ${label} susturuldu`);
  };

  const liftMute = (author: string) => {
    const nextTimeouts = timeouts.filter((item) => nickKey(item.nick) !== nickKey(author));
    setTimeouts(nextTimeouts);
    void patchClub({ timeouts: nextTimeouts });
    setMuteTarget(null);
    setNotice(`${author} susturması kaldırıldı`);
  };

  const startMute = (author: string) => {
    if (isModerator && !isAdmin) {
      applyMute(author, 60 * 60 * 1000, '1 saat');
      return;
    }
    setMuteTarget((current) => current === author ? null : author);
  };

  const openChatProfile = (message: ChatMessage) => {
    const account = accounts.find((item) => nickKey(item.nick) === nickKey(message.author) || nickKey(item.username) === nickKey(message.author));
    const profileNick = account?.nick || message.author;
    setChatProfile({
      nick: profileNick,
      photo: avatarFor(profileNick, message.mine ? myPhoto : account?.photo || message.photo),
      role: account?.role || message.role,
      title: account?.title || message.title,
      appId: account?.appId || undefined,
      vip: isLiveVip(account?.vipUntil),
    });
  };

  const sendChat = () => {
    const message = chatText.trim();
    if (!message) return;
    if (!user.appId) {
      setNotice('Sohbete yazmak için profilinden uygulama ID’sini gir');
      setChatOpen(false);
      handleNav('Profil');
      return;
    }
    const timeout = activeChatTimeout(timeouts, nick);
    if (timeout) {
      setNotice(`Susturuldun. Kalan: ${formatMuteRemaining(timeout.until)}`);
      return;
    }
    setChatMessages((current) => {
      const next = [...current, {
        id: `chat-${Date.now()}`,
        author: nick,
        initials: nick.slice(0, 2).toUpperCase(),
        avatar: 'bg-[#a15be9] text-white',
        photo: myPhoto,
        message,
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        mine: true,
        role: user.role === 'ADMIN' ? 'ADMIN' : user.role === 'MODERATOR' ? 'MODERATOR' : undefined,
        title: user.title === 'ELDER' || user.title === 'ASSTN' ? user.title : undefined,
        replyTo: replyTo ? { author: replyTo.author, message: replyTo.message } : undefined,
        at: Date.now(),
      }];
      void patchClub({ chat: next.map(({ mine: _mine, ...rest }) => rest) });
      return next;
    });
    setChatText('');
    setReplyTo(null);
    setEmojiPickerOpen(false);
    setNotice('Mesajın topluluğa gönderildi');
    void publishClubEvent({
      type: 'chat',
      title: 'Yeni sohbet',
      body: `${nick}: ${message}`,
      sender: getDeviceId(),
    });
  };

  const clearChatHistory = () => {
    if (!window.confirm('Tüm sohbet geçmişi silinsin mi? Bu işlem geri alınamaz.')) return;
    setChatMessages([]);
    void patchClub({ chat: [] });
    setReplyTo(null);
    setNotice('Sohbet geçmişi admin tarafından silindi');
  };

  const guessPlaying = guessGame?.status === 'playing';
  const guessRevealed = guessGame?.status === 'revealed';
  const guessLive = guessPlaying || guessRevealed;
  const guessLeft = guessPlaying ? Math.max(0, Math.ceil((guessGame.endsAt - now) / 1000)) : 0;
  const alreadyGuessed = Boolean(guessGame?.attempted?.some((item) => nickKey(item) === nickKey(nick)));
  const guessTop = (guessGame?.scores || []).slice(0, 5);

  const launchGuessRound = async () => {
    const min = Math.floor(Number(guessMin));
    const max = Math.floor(Number(guessMax));
    const secret = Math.floor(Number(guessSecret));
    const seconds = Math.floor(Number(guessSeconds) || 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 99 || min > max) {
      setNotice('Aralık 1–99 arasında olmalı');
      return;
    }
    if (!Number.isFinite(secret) || secret < min || secret > max) {
      setNotice('Gizli sayı seçilen aralıkta olmalı');
      return;
    }
    setGuessBusy(true);
    try {
      const data = await startGuessGame({ min, max, secret, seconds });
      applySnapshot(data);
      setGuessSetupOpen(false);
      setGuessNumber('');
      setGuessSecret('');
      setChatOpen(true);
      setNotice('Sayı tahmini oyunu başlıyor');
      showTicker('Sayı tutmaca', 'Sayı tahmini oyunu başlıyor');
      void publishClubEvent({
        type: 'guess',
        title: 'Sayı tutmaca',
        body: 'Sayı tahmini oyunu başlıyor',
        sender: getDeviceId(),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setNotice(code === 'busy' ? 'Önce bu turu bitir' : code === 'range' ? 'Sayı aralık dışında' : 'Oyun başlatılamadı');
    } finally {
      setGuessBusy(false);
    }
  };

  const sendGuessNumber = async () => {
    const value = Math.floor(Number(guessNumber));
    if (!Number.isFinite(value)) {
      setNotice('Bir sayı yaz');
      return;
    }
    setGuessBusy(true);
    try {
      const data = await submitGuess(value);
      applySnapshot(data);
      setGuessNumber('');
      setNotice('Tahminin gönderildi');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setNotice(code === 'used' ? 'Bu turda zaten yazdın' : code === 'range' ? 'Sayı aralık dışında' : 'Süre doldu');
    } finally {
      setGuessBusy(false);
    }
  };

  const finishGuessSession = async () => {
    setGuessBusy(true);
    try {
      const data = await endGuessGame();
      applySnapshot(data);
      setGuessSetupOpen(false);
      setGuessEndOpen(true);
      setNotice('Oyun sonu');
    } catch {
      setNotice('Oyun bitirilemedi');
    } finally {
      setGuessBusy(false);
    }
  };

  const purchaseVip = async (pack: '7' | '30') => {
    setStoreBusy(true);
    try {
      applySnapshot(await buyVipPack(pack));
      setNotice('VIP alındı');
    } catch (err) {
      setNotice((err as Error).message === 'coins' ? 'Yeterli coin yok' : 'VIP alınamadı');
    } finally {
      setStoreBusy(false);
    }
  };

  const sendRouletteBet = async (kind: string, number?: number) => {
    setStoreBusy(true);
    try {
      applySnapshot(await rouletteBet({ kind, number, amount: rouletteChip }));
      setNotice('Bahis alındı');
    } catch (err) {
      const code = (err as Error).message;
      setNotice(code === 'coins' ? 'Yeterli coin yok' : code === 'closed' ? 'Bahis kapandı' : 'Bahis yapılamadı');
    } finally {
      setStoreBusy(false);
    }
  };

  useEffect(() => {
    if (activeNav !== 'Oyunlar') return;
    void rouletteHere().then(applySnapshot).catch(() => undefined);
    const timer = window.setInterval(() => { void rouletteHere().then(applySnapshot).catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [activeNav, nick]);

  const sendAdminBroadcast = async () => {
    const title = broadcastTitle.trim() || 'Duyuru';
    const body = broadcastBody.trim();
    if (!body) {
      setNotice('Bildirim yazmalısın');
      return;
    }
    setBroadcastSending(true);
    showTicker(title, body);
    pushNotice(title, body);
    setBroadcastLog((current) => [{ id: `b-${Date.now()}`, title, body, at: Date.now() }, ...current].slice(0, 8));
    const ok = await publishClubEvent({ type: 'admin', title, body });
    setBroadcastSending(false);
    setBroadcastBody('');
    setNotice(ok ? 'Bildirim tüm cihazlara gönderildi' : 'Sunucuya ulaşılamadı. Bildirim bu cihazda gösterildi.');
  };

  const addBanner = () => {
    const title = bannerTitle.trim();
    const copy = bannerCopy.trim();
    if (!title || !copy) {
      setNotice('Banner başlığı ve açıklaması gerekli');
      return;
    }
    const next = [...banners, {
      id: `banner-${Date.now()}`,
      eyebrow: 'YENİ DUYURU',
      title,
      accent: 'MOD CLUB',
      rest: '',
      copy,
      action: 'Keşfet',
      hasButton: bannerHasButton,
    }];
    setBanners(next);
    void patchClub({ banners: next });
    setBannerTitle('');
    setBannerCopy('');
    setNotice('Yeni banner yayınlandı');
  };

  const persistGiveaways = (items: Giveaway[]) => {
    setGiveaways(items);
    void patchClub({ giveaways: items });
  };

  const joinGiveaway = (id: string) => {
    const target = giveaways.find((item) => item.id === id);
    if (!target || giveawayStatus(target, now) !== 'open') {
      setNotice('Şu anda katılabileceğin aktif çekiliş yok');
      return;
    }
    if (target.participants.includes(nick)) {
      setNotice('Bu çekilişe zaten katıldın');
      return;
    }
    persistGiveaways(giveaways.map((item) => item.id === id ? { ...item, participants: [...item.participants, nick] } : item));
    setNotice(`${nick} çekilişe katıldı`);
  };

  const addGiveaway = () => {
    const title = giveawayTitle.trim();
    const prizeText = giveawayPrize.trim();
    const announceAt = giveawayWhen ? new Date(giveawayWhen).toISOString() : '';
    if (!title || !announceAt || Number.isNaN(new Date(announceAt).getTime())) {
      setNotice('Çekiliş adı ve bitiş tarihi gerekli');
      return;
    }
    if (new Date(announceAt).getTime() <= Date.now()) {
      setNotice('Bitiş tarihi gelecekte olmalı.');
      return;
    }
    persistGiveaways([...giveaways, {
      id: `giveaway-${Date.now()}`,
      title,
      prizeText,
      prizeImage: giveawayImage.trim(),
      announceAt,
      participants: [],
    }]);
    setGiveawayTitle('');
    setGiveawayPrize('');
    setGiveawayImage('');
    setGiveawayWhen('');
    void publishClubEvent({
      type: 'giveaway',
      title: 'Yeni çekiliş',
      body: `${title} başladı. Süre bitince kazanan otomatik açıklanır.`,
    });
    setNotice('Çekiliş yayınlandı. Süre dolunca kazanan otomatik açıklanır.');
  };

  const addContentCard = (kind: 'film' | 'app') => {
    const title = (kind === 'film' ? filmTitle : appTitle).trim();
    const description = (kind === 'film' ? filmCopy : appCopy).trim();
    const image = (kind === 'film' ? filmImage : appImage).trim();
    const link = (kind === 'film' ? filmLink : appLink).trim();
    if (!title || !link) {
      setNotice('Başlık ve link gerekli');
      return;
    }
    const next: ContentCard = { id: `${kind}-${Date.now()}`, title, description, image, link };
    if (kind === 'film') {
      const items = [...films, next];
      setFilms(items);
      void patchClub({ films: items });
      setFilmTitle('');
      setFilmCopy('');
      setFilmImage('');
      setFilmLink('');
      setNotice('Film kartı eklendi');
      return;
    }
    const items = [...apps, next];
    setApps(items);
    void patchClub({ apps: items });
    setAppTitle('');
    setAppCopy('');
    setAppImage('');
    setAppLink('');
    setNotice('Uygulama kartı eklendi');
  };

  return (
    <div className="mod-app grain min-h-[100dvh] pb-28">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.9)] backdrop-blur-xl">
        <div className="desktop-shell mx-auto flex h-[4.25rem] w-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button data-testid="button-menu" aria-label="Menüyü aç" onClick={() => setMenuOpen((open) => !open)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))]">
              <Menu size={21} strokeWidth={2.1} />
            </button>
            <button data-testid="button-logo-home" onClick={() => handleNav('Ana Sayfa')} className="flex min-w-0 items-center" aria-label="MOD CLUB">
              <ClubWordmark />
            </button>
          </div>

          <div className="relative flex items-center gap-1 sm:gap-2">
            {searchOpen && (
              <label className="absolute right-24 top-14 z-10 flex w-[min(16rem,calc(100vw-2rem))] items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2.5 shadow-xl">
                <Search size={17} className="text-[hsl(var(--muted-foreground))]" />
                <input data-testid="input-search" autoFocus placeholder="Toplulukta ara..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]" />
              </label>
            )}
            <button data-testid="button-search" aria-label="Ara" onClick={() => setSearchOpen((open) => !open)} className="hidden size-11 place-items-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] sm:grid"><Search size={19} /></button>
            <span className="wallet-chip"><Coins size={13} />{walletCoins}</span>
            <PwaInstallChip />
            <button
              type="button"
              data-testid="button-theme-toggle"
              aria-label={colorMode === 'dark' ? 'Gündüz görünümüne geç' : 'Gece görünümüne geç'}
              onClick={() => changeColorMode(colorMode === 'dark' ? 'light' : 'dark')}
              className="theme-toggle"
            >
              <span className={colorMode === 'light' ? 'is-on' : ''}><Sun size={13} strokeWidth={2.3} /></span>
              <span className={colorMode === 'dark' ? 'is-on' : ''}><Moon size={13} strokeWidth={2.3} /></span>
            </button>
            <button
              type="button"
              data-testid="button-join-giveaway"
              onClick={() => setGiveawayOpen(true)}
              className={cn(
                'giveaway-chip relative hidden h-9 items-center gap-1.5 overflow-hidden rounded-full px-2.5 pl-1 text-[11px] font-bold tracking-tight transition-all sm:inline-flex',
                liveGiveaway ? 'giveaway-chip-live' : 'giveaway-chip-idle hover:border-violet-200 hover:text-violet-700',
              )}
              aria-disabled={!liveGiveaway}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full',
                  liveGiveaway ? 'bg-white/20 text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                )}
                aria-hidden="true"
              >
                <Gift size={13} strokeWidth={2.1} />
              </span>
              <span className="leading-none whitespace-nowrap">Çekilişe Katıl</span>
              {liveGiveaway && <small className="hidden font-mono text-[10px] font-bold tracking-wide text-white/80 sm:inline">{formatCountdown(new Date(liveGiveaway.announceAt).getTime(), now)}</small>}
            </button>
            <div className="relative">
              <button data-testid="button-notifications" aria-label="Bildirimleri aç" onClick={() => setNotificationsOpen((open) => !open)} className="grid size-11 place-items-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"><Bell size={19} /></button>
              {unreadNoticeCount > 0 && <span className="absolute right-1 top-1 grid min-w-[1.05rem] place-items-center rounded-full bg-[hsl(var(--primary))] px-1 font-mono text-[.58rem] font-bold text-white">{unreadNoticeCount > 99 ? '99+' : unreadNoticeCount}</span>}
              {notificationsOpen && (
                <div data-testid="panel-notifications" className="absolute right-0 top-14 z-20 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-white shadow-2xl">
                  <div className="flex items-center justify-between gap-2 px-4 pt-4">
                    <strong className="font-display text-sm">Bildirimler</strong>
                    {unreadNoticeCount > 0 && <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[.65rem] font-bold text-[hsl(var(--primary))]">{unreadNoticeCount} yeni</span>}
                  </div>
                  <div className="mt-3 flex gap-2 px-4">
                    <button type="button" data-testid="button-notices-read-all" onClick={markNoticesRead} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[hsl(var(--secondary))] text-[.62rem] font-bold text-[hsl(var(--primary))]"><CheckCheck size={13} />Tümünü okundu</button>
                    <button type="button" data-testid="button-notices-clear" onClick={clearNotices} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#fff5f6] text-[.62rem] font-bold text-[#c44b5a]"><Trash2 size={13} />Tümünü sil</button>
                  </div>
                  <div className="mt-2 max-h-72 overflow-y-auto px-2 pb-2">
                    {notices.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">Bildirim yok</p>
                    ) : notices.map((item, index) => (
                      <button data-testid={`button-notification-${index}`} key={item.id} onClick={() => { openNotice(item.id); setNotice(item.body); }} className="flex w-full gap-2 rounded-xl px-3 py-3 text-left hover:bg-[hsl(var(--muted))]">
                        <span className={`mt-1 size-1.5 shrink-0 rounded-full ${item.read ? 'bg-[hsl(var(--border))]' : 'bg-[hsl(var(--primary))]'}`} />
                        <span className="min-w-0">
                          <strong className="block text-[.7rem]">{item.title}</strong>
                          <span className="mt-0.5 block text-[.62rem] text-[hsl(var(--muted-foreground))]">{item.body}</span>
                          <span className="mt-1 block font-mono text-[.5rem] text-[hsl(var(--muted-foreground))]">{formatNoticeTime(item.at)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button data-testid="button-profile" aria-label="Profili aç" onClick={() => handleNav('Profil')} className="relative grid size-10 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#26104b,#9d42f5)] text-white shadow-md shadow-violet-200/50"><img src={myPhoto} alt={`${nick} profil fotoğrafı`} className="size-full object-cover" /><span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-[#56d47e]" /></button>
          </div>
        </div>
      </header>
        {menuOpen && (
          <>
            <button type="button" className="nav-drawer-backdrop" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)} />
            <aside data-testid="panel-menu" className="nav-drawer">
              <div className="nav-drawer-head">
                <img src={myPhoto} alt="" className="size-12 rounded-2xl object-cover ring-2 ring-white/30" />
                <div className="min-w-0 flex-1">
                  <strong className="truncate font-display text-base">{nick}</strong>
                  <small>{user.appId ? `ID ${user.appId}` : 'Uygulama ID’si yok'}</small>
                </div>
                <button type="button" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)} className="grid size-9 place-items-center rounded-xl text-white/80 hover:bg-white/10"><X size={18} /></button>
              </div>
              <div className="nav-drawer-list flex-1">
                {([
                  { label: 'Ana Sayfa', icon: HomeIcon, testid: 'button-menu-home' },
                  { label: 'Etkinlikler', icon: CalendarDays, testid: 'button-menu-events' },
                  { label: 'Oyunlar', icon: Gamepad2, testid: 'button-menu-games' },
                  { label: 'Sohbet', icon: MessageCircle, testid: 'button-menu-chat' },
                  { label: 'Film İzle', icon: Film, testid: 'button-menu-films' },
                  { label: 'Mağaza', icon: Store, testid: 'button-menu-store' },
                  { label: 'Uygulama İndir', icon: Download, testid: 'button-menu-apps' },
                  { label: 'Topluluk', icon: UsersRound, testid: 'button-menu-community' },
                  { label: 'Profil', icon: UserRound, testid: 'button-menu-profile' },
                  { label: 'Hesap ayarları', icon: Settings, testid: 'button-menu-settings' },
                ] as const).map(({ label, icon: Icon, testid }) => (
                  <button key={label} data-testid={testid} type="button" onClick={() => handleNav(label)} className={`nav-drawer-item ${activeNav === label ? 'is-on' : ''}`}>
                    <span className="nav-drawer-icon"><Icon size={16} /></span>
                    {label}
                  </button>
                ))}
                <button type="button" data-testid="button-menu-theme" onClick={() => changeColorMode(colorMode === 'dark' ? 'light' : 'dark')} className="nav-drawer-item">
                  <span className="nav-drawer-icon">{colorMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span>
                  {colorMode === 'dark' ? 'Gündüz görünümü' : 'Gece görünümü'}
                </button>
                {isAdmin && (
                  <button data-testid="button-menu-admin" type="button" onClick={() => { setAdminPanelOpen(true); setMenuOpen(false); }} className="nav-drawer-item">
                    <span className="nav-drawer-icon"><Shield size={16} /></span>
                    Admin paneli
                  </button>
                )}
              </div>
              <div className="nav-drawer-foot">
                <button type="button" onClick={onLogout} className="nav-drawer-item text-[#c44b5a]">
                  <span className="nav-drawer-icon bg-[#fff5f6] text-[#c44b5a]"><LogOut size={16} /></span>
                  Çıkış yap
                </button>
              </div>
            </aside>
          </>
        )}

       {activeNav === 'Ana Sayfa' ? <main className="desktop-shell mx-auto w-full px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <section className="home-hero relative isolate overflow-hidden rounded-[1.35rem]">
          <div className="home-hero-glow" aria-hidden="true" />
          <div className="relative z-10 flex min-h-[11.5rem] items-center justify-between gap-3 px-5 py-5 sm:min-h-[14rem] sm:px-8">
            <div className="min-w-0 max-w-[18rem] sm:max-w-[24rem]">
              <span className="home-hero-badge">{currentSlide.eyebrow}</span>
              <h1 className="mt-3 font-display text-[clamp(1.35rem,4.4vw,2.35rem)] font-extrabold leading-[1.05] tracking-[-.05em]">
                {currentSlide.title} <span>{currentSlide.accent}</span> {currentSlide.rest}
              </h1>
              <p className="home-hero-copy mt-2 text-[.72rem] leading-relaxed sm:text-[.8rem]">{currentSlide.copy}</p>
              {currentSlide.hasButton && (
                <button data-testid="button-hero-action" onClick={() => setNotice(`${currentSlide.action} seçildi`)} className="home-hero-cta mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-extrabold">
                  {currentSlide.action} <ChevronRight size={14} />
                </button>
              )}
            </div>
            <div className="home-hero-emblem relative shrink-0">
              <ClubLogo size={148} className="club-logo-mark size-[4.25rem] sm:size-[8.5rem]" />
            </div>
          </div>
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {banners.map((item, index) => (
              <button data-testid={`button-slide-dot-${index}`} aria-label={`${index + 1}. banner`} key={item.id} onClick={() => setSlide(index)} className={`h-1.5 rounded-full transition-all ${slide === index ? 'home-hero-dot-on' : 'home-hero-dot'}`} />
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[.72rem] font-extrabold tracking-[.12em] text-[hsl(var(--muted-foreground))]">HIZLI ERİŞİM</h2>
          </div>
          <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-5 sm:gap-3">
            {quickItems.map(({ label, sublabel, icon: Icon, tone }) => (
              <button data-testid={`button-quick-${label.toLowerCase()}`} key={label} onClick={() => handleQuickSelect(label)} className={`home-quick min-w-[6.6rem] flex-1 rounded-2xl px-2.5 py-3 text-center sm:min-w-0 ${selectedQuick === label ? 'is-on' : ''}`}>
                <span className={`home-quick-icon ${tone}`}><Icon size={20} strokeWidth={2.15} /></span>
                <span className="mt-2 block text-[.62rem] font-extrabold tracking-wide">{label}</span>
                <span className="mt-0.5 block truncate text-[.5rem] text-[hsl(var(--muted-foreground))]">{sublabel}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><CalendarDays size={15} className="text-[hsl(var(--primary))]" /><h2 className="font-display text-[.78rem] font-extrabold tracking-[.08em]">HABERLER</h2></div>
            <button data-testid="button-see-all-news" onClick={() => setNotice('Tüm haberler görüntüleniyor')} className="flex items-center gap-0.5 text-[.65rem] font-bold text-[hsl(var(--primary))]">Tümü <ChevronRight size={13} /></button>
          </div>
          <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-1">
            {newsItems.map((item) => (
              <article key={item.id} className="home-news-card min-w-[11.5rem] overflow-hidden rounded-2xl sm:min-w-[13rem]">
                <div className={`home-news-cover ${item.tone}`}>
                  <img src={item.image} alt="" loading="lazy" />
                  <span className={`home-news-tag ${item.tone}`}>{item.tag}</span>
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-[.72rem] font-extrabold leading-snug">{item.title}</h3>
                  <div className="mt-2 flex items-center justify-between text-[.55rem] text-[hsl(var(--muted-foreground))]">
                    <span>{item.time}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare size={11} />{item.comments}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><Megaphone size={15} className="text-[hsl(var(--primary))]" /><h2 className="font-display text-[.78rem] font-extrabold tracking-[.08em]">DUYURULAR</h2></div>
            <button data-testid="button-see-all-announcements" onClick={() => setNotice('Tüm duyurular görüntüleniyor')} className="flex items-center gap-0.5 text-[.65rem] font-bold text-[hsl(var(--primary))]">Tümü <ChevronRight size={13} /></button>
          </div>
          <div className="grid gap-2">
            {announcements.map(({ id, title, copy, time, icon: Icon, color }) => (
              <button data-testid={`button-${id}`} key={id} onClick={() => setSelectedAnnouncement(announcements.find((item) => item.id === id) ?? null)} className="home-announce">
                <span className={`home-announce-icon ${color}`}><Icon size={16} /></span>
                <span className="min-w-0 flex-1 text-left">
                  <strong className="block truncate text-[.72rem]">{title}</strong>
                  <small className="mt-0.5 block truncate text-[.58rem] text-[hsl(var(--muted-foreground))]">{copy}</small>
                </span>
                <span className="shrink-0 text-right">
                  <small className="block text-[.52rem] text-[hsl(var(--muted-foreground))]">{time}</small>
                  <ChevronRight size={14} className="ml-auto mt-1 text-[hsl(var(--muted-foreground))]" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><CalendarDays size={15} className="text-[hsl(var(--primary))]" /><h2 className="font-display text-[.78rem] font-extrabold tracking-[.08em]">ETKİNLİKLER</h2></div>
            <button data-testid="button-see-all-events" onClick={() => handleNav('Etkinlikler')} className="flex items-center gap-0.5 text-[.65rem] font-bold text-[hsl(var(--primary))]">Tümü <ChevronRight size={13} /></button>
          </div>
          <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-1">
            {upcomingEvents.slice(0, 3).map((event) => (
              <article data-testid={`card-${event.id}`} key={event.id} className="home-event-card min-w-[13.5rem]">
                <div className="home-event-date">
                  <strong>{event.day}</strong>
                  <span>{event.month}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[.78rem] font-extrabold">{event.title}</h3>
                  <p className="mt-1 inline-flex items-center gap-1 text-[.58rem] text-[hsl(var(--muted-foreground))]"><Clock3 size={11} />{event.time}</p>
                  <span className={`home-event-status mt-2 ${event.tone}`}>{event.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
       </main> : <main className="desktop-shell mx-auto w-full px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-8">{activeNav === 'Etkinlikler' ? <EventsPage events={upcomingEvents} joinedEvents={joinedEvents} onToggle={toggleJoin} /> : activeNav === 'Oyunlar' ? <GamesPage room={roulette} coins={walletCoins} nick={nick} now={now} busy={storeBusy} chip={rouletteChip} onChip={setRouletteChip} onBet={sendRouletteBet} /> : activeNav === 'Mağaza' ? <StorePage coins={walletCoins} vipUntil={walletVip} now={now} busy={storeBusy} onBuy={purchaseVip} /> : activeNav === 'Menü' ? <MenuPage onAdmin={() => setAdminPanelOpen(true)} onLogout={onLogout} onOpen={handleNav} /> : activeNav === 'Film İzle' ? <ContentCardsPage title="Film İzle" kicker="SİNEMA" copy="Adminin eklediği siteleri Aç butonuyla yeni sekmede aç." items={films} actionLabel="Aç" /> : activeNav === 'Uygulama İndir' ? <ContentCardsPage title="Uygulama İndir" kicker="UYGULAMALAR" copy="Resim, link ve açıklaması olan uygulamaları buradan indir." items={apps} actionLabel="İndir" /> : activeNav === 'Topluluk' ? <CommunityPage /> : activeNav === 'Hesap ayarları' ? <SettingsPage session={session} colorMode={colorMode} onColorMode={changeColorMode} onOpenProfile={() => handleNav('Profil')} /> : <ProfilePage session={session} onLogout={onLogout} onSession={onSession} onNotice={setNotice} />}</main>}

      {!chatOpen && (
        <button
          data-testid="button-floating-chat"
          aria-label="Canlı sohbeti aç"
          title="Canlı sohbet"
          onClick={() => setChatOpen(true)}
          className="pulse-orb chat-fab fixed bottom-[6.4rem] right-4 z-30 grid size-[3.35rem] place-items-center text-white transition-transform hover:scale-105 sm:right-6 lg:bottom-7"
        >
          <MessageCircle size={22} strokeWidth={2.3} />
          {unreadChatCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-[#ee4e84] px-1 font-mono text-[.58rem] font-bold text-white shadow-sm">{unreadChatCount > 99 ? '99+' : unreadChatCount}</span>}
          <span className="chat-fab-label">Sohbet et</span>
        </button>
      )}

      <nav className="club-nav">
        <div className="club-nav-inner">
          {([
            { label: 'Ana Sayfa', icon: HomeIcon },
            { label: 'Film izle', icon: Film },
            { label: 'Menü', icon: Zap, orb: true },
            { label: 'Oyunlar', icon: Gamepad2 },
            { label: 'Mağaza', icon: Store },
          ] as { label: string; icon: LucideIcon; orb?: boolean }[]).map(({ label, icon: Icon, orb }) => {
            const active = orb ? menuOpen : label === 'Film izle' ? activeNav === 'Film İzle' : activeNav === label;
            return (
              <button
                data-testid={`button-nav-${label.toLowerCase().replace(' ', '-')}`}
                key={label}
                onClick={() => handleNav(label)}
                className={`club-nav-btn ${active ? 'is-on' : ''} ${orb ? 'is-orb' : ''}`}
              >
                {orb ? (
                  <span className="nav-menu-orb">
                    <Icon size={26} strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                )}
                {!orb && <span>{label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {adminPanelOpen && (
        <div data-testid="panel-admin" className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-5">
          <div className="admin-panel mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-[1.35rem] border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-2xl sm:min-h-[calc(100dvh-2.5rem)]">
            <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <ClubLogo size={36} className="club-logo-mark size-9" />
                <div className="min-w-0">
                  <p className="font-mono text-[.52rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">YÖNETİM</p>
                  <h2 className="font-display text-base font-bold">Admin paneli</h2>
                </div>
              </div>
              <button data-testid="button-close-admin" aria-label="Admin panelini kapat" onClick={() => setAdminPanelOpen(false)} className="grid size-9 place-items-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                <X size={17} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[13.5rem_1fr]">
              <aside className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 lg:border-b-0 lg:border-r">
                <div className="hide-scrollbar flex gap-1.5 overflow-x-auto lg:flex-col">
                  {(['Genel Bakış', 'Bildirimler', 'Kullanıcılar', 'Bannerlar', 'Çekilişler', 'Filmler', 'Uygulamalar', 'Sayfalar'] as const).map((section) => (
                    <button
                      key={section}
                      onClick={() => setAdminSection(section)}
                      className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold lg:w-full ${adminSection === section ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}`}
                    >
                      {section === 'Genel Bakış' ? <LayoutDashboard size={15} /> : section === 'Bildirimler' ? <Bell size={15} /> : section === 'Kullanıcılar' ? <Users size={15} /> : section === 'Bannerlar' ? <Megaphone size={15} /> : section === 'Çekilişler' ? <Gift size={15} /> : section === 'Filmler' ? <Film size={15} /> : section === 'Uygulamalar' ? <Download size={15} /> : <PanelRightOpen size={15} />}
                      {section}
                    </button>
                  ))}
                </div>
              </aside>

              <section className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {adminSection === 'Genel Bakış' && (
                  <div className="space-y-5">
                    <div>
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">KONTROL</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Özet</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="admin-stat-card"><UsersRound size={16} className="text-[hsl(var(--primary))]" /><strong>12.548</strong><span>Toplam üye</span></div>
                      <div className="admin-stat-card"><Gift size={16} className="text-[hsl(var(--primary))]" /><strong>{giveaways.length}</strong><span>Çekiliş</span></div>
                      <div className="admin-stat-card"><ShieldCheck size={16} className="text-[hsl(var(--primary))]" /><strong>{openGiveaways.length}</strong><span>Açık çekiliş</span></div>
                    </div>
                    <div className="grid gap-2">
                      <button onClick={() => setAdminSection('Bildirimler')} className="admin-action-card"><Bell size={18} className="text-[hsl(var(--primary))]" /><span><strong>Bildirim gönder</strong><small>Tüm cihazlara kayan duyuru</small></span><ChevronRight size={16} /></button>
                      <button onClick={() => setAdminSection('Çekilişler')} className="admin-action-card"><Gift size={18} className="text-[hsl(var(--primary))]" /><span><strong>Çekilişler</strong><small>Tarih, ödül ve kazanan</small></span><ChevronRight size={16} /></button>
                      <button onClick={() => setAdminSection('Filmler')} className="admin-action-card"><Film size={18} className="text-[hsl(var(--primary))]" /><span><strong>Film İzle</strong><small>Site, açıklama ve link</small></span><ChevronRight size={16} /></button>
                      <button onClick={() => setAdminSection('Uygulamalar')} className="admin-action-card"><Download size={18} className="text-[hsl(var(--primary))]" /><span><strong>Uygulama İndir</strong><small>Resim, açıklama ve indirme</small></span><ChevronRight size={16} /></button>
                      <button onClick={() => setAdminSection('Bannerlar')} className="admin-action-card"><Megaphone size={18} className="text-[hsl(var(--primary))]" /><span><strong>Bannerlar</strong><small>Ana sayfa duyuruları</small></span><ChevronRight size={16} /></button>
                    </div>
                    <div className="admin-note"><strong>Not</strong><span>Çekiliş süre bitince kazanan otomatik seçilir. Sohbette nick görünür, ID nicke dokununca açılır.</span></div>
                  </div>
                )}

                {adminSection === 'Bildirimler' && (
                  <div>
                    <div className="mb-4">
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">DUYURU</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Bildirim gönder</h3>
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Yazdığın metin tüm açık cihazlarda kayarak görünür. Bildirim izni varsa telefona da gider.</p>
                    </div>
                    <form
                      onSubmit={(event) => { event.preventDefault(); void sendAdminBroadcast(); }}
                      className="mb-4 grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
                    >
                      <input
                        data-testid="input-broadcast-title"
                        value={broadcastTitle}
                        onChange={(event) => setBroadcastTitle(event.target.value)}
                        placeholder="Başlık (ör. Duyuru)"
                        maxLength={80}
                        className="admin-field"
                      />
                      <textarea
                        data-testid="input-broadcast-body"
                        value={broadcastBody}
                        onChange={(event) => setBroadcastBody(event.target.value)}
                        placeholder="Tüm üyelere gidecek mesajı yaz..."
                        maxLength={280}
                        rows={4}
                        className="admin-field admin-area"
                      />
                      <p className="text-[.58rem] font-semibold text-[hsl(var(--muted-foreground))]">{broadcastBody.length}/280</p>
                      <button type="submit" data-testid="button-broadcast-send" disabled={broadcastSending} className="admin-btn">
                        <Send size={15} />{broadcastSending ? 'Gönderiliyor...' : 'Bildirim gönder'}
                      </button>
                    </form>
                    {broadcastLog.length > 0 && (
                      <div className="grid gap-2">
                        {broadcastLog.map((item) => (
                          <div key={item.id} className="admin-row">
                            <span className="grid size-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Bell size={16} /></span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold">{item.title}</p>
                              <p className="mt-0.5 text-[.62rem] text-[hsl(var(--muted-foreground))]">{item.body}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {adminSection === 'Kullanıcılar' && (
                  <div>
                    <div className="mb-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">ÜYELER</p>
                        <h3 className="mt-1 font-display text-xl font-bold">Kullanıcılar</h3>
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">ELDER / ASSTN yalnızca görsel unvandır.</p>
                      </div>
                      <span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-1 text-[.65rem] font-bold text-[hsl(var(--primary))]">{adminUsers.length}</span>
                    </div>
                    <div className="grid gap-2">
                      {adminUsers.map((member) => {
                        const account = accounts.find((item) => nickKey(item.username) === nickKey(member.username) || nickKey(item.nick) === nickKey(member.nick));
                        const memberTitle = account?.title;
                        return (
                          <div key={member.id} className="admin-row">
                            <img src={member.photo} alt="" className="size-10 rounded-full object-cover" />
                            <div className="min-w-[8rem] flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <RankedName name={member.nick} role={member.role} title={memberTitle ?? undefined} size="sm" onDark={colorMode === 'dark'} vip={isLiveVip(account?.vipUntil, now)} />
                                <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 font-mono text-[.48rem] font-bold text-[hsl(var(--muted-foreground))]">{member.role}</span>
                              </div>
                              <p className="mt-0.5 text-[.62rem] text-[hsl(var(--muted-foreground))]">@{member.nick} · {account?.coins ?? 0} coin</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button type="button" onClick={() => { void adminWallet(member.username, 'give', 100).then(applySnapshot); setNotice(`${member.nick} +100 coin`); }} className="rounded-lg border border-[hsl(var(--border))] px-2 py-1.5 text-[.55rem] font-bold">+100</button>
                              <button type="button" onClick={() => { void adminWallet(member.username, 'take', 100).then(applySnapshot); setNotice(`${member.nick} −100 coin`); }} className="rounded-lg border border-[hsl(var(--border))] px-2 py-1.5 text-[.55rem] font-bold">−100</button>
                              <button type="button" onClick={() => { void adminWallet(member.username, 'reset').then(applySnapshot); setNotice(`${member.nick} cüzdanı sıfırlandı`); }} className="rounded-lg border border-[hsl(var(--border))] px-2 py-1.5 text-[.55rem] font-bold">Sıfırla</button>
                              <select value={memberTitle || ''} onChange={(event) => { const next = event.target.value as CosmeticTitle | ''; void patchClubUser(member.username, { title: next || null }).then(applySnapshot); setNotice(next ? `${member.nick} artık ${next}` : `${member.nick} unvanı kaldırıldı`); }} className="admin-field h-8 w-[6.5rem] px-2 text-[.58rem] font-bold">
                                <option value="">Unvan yok</option>
                                <option value="ELDER">ELDER</option>
                                <option value="ASSTN">ASSTN</option>
                              </select>
                              {member.role !== 'ADMIN' && (
                                <button onClick={() => { const role = member.role === 'ÜYE' ? 'MODERATOR' : 'ÜYE'; void patchClubUser(member.username, { role }).then(applySnapshot); }} className="rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-[.58rem] font-bold text-[hsl(var(--foreground))]">
                                  {member.role === 'ÜYE' ? 'Yetkili yap' : 'Üyeye çevir'}
                                </button>
                              )}
                              <button aria-label={`${member.name} kullanıcısını sil`} onClick={() => { void deleteClubUser(member.username).then(applySnapshot); }} className="grid size-8 place-items-center rounded-lg text-[hsl(var(--destructive))]"><Trash2 size={15} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {adminSection === 'Bannerlar' && (
                  <div>
                    <div className="mb-4">
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">İÇERİK</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Bannerlar</h3>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); addBanner(); }} className="mb-4 grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                      <input value={bannerTitle} onChange={(event) => setBannerTitle(event.target.value)} placeholder="Başlık" className="admin-field" />
                      <input value={bannerCopy} onChange={(event) => setBannerCopy(event.target.value)} placeholder="Kısa açıklama" className="admin-field" />
                      <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))]">
                        <input type="checkbox" checked={bannerHasButton} onChange={(event) => setBannerHasButton(event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                        Buton göster
                      </label>
                      <button type="submit" className="admin-btn"><Plus size={15} />Banner ekle</button>
                    </form>
                    <div className="grid gap-2">
                      {banners.map((banner) => (
                        <div key={banner.id} className="admin-row">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{banner.title} <span className="font-normal text-[hsl(var(--primary))]">{banner.accent}</span></p>
                            <p className="mt-0.5 truncate text-[.62rem] text-[hsl(var(--muted-foreground))]">{banner.copy}</p>
                          </div>
                          <button disabled={banners.length === 1} aria-label={`${banner.title} bannerını sil`} onClick={() => { const items = banners.filter((item) => item.id !== banner.id); setBanners(items); setSlide((current) => Math.min(current, Math.max(0, items.length - 1))); void patchClub({ banners: items }); setNotice('Banner kaldırıldı'); }} className="grid size-9 place-items-center rounded-lg text-[hsl(var(--destructive))] disabled:opacity-30"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminSection === 'Çekilişler' && (
                  <div>
                    <div className="mb-4">
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">ÖDÜL</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Çekilişler</h3>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); addGiveaway(); }} className="mb-4 grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:grid-cols-2">
                      <input value={giveawayTitle} onChange={(event) => setGiveawayTitle(event.target.value)} placeholder="Çekiliş adı" className="admin-field" />
                      <input value={giveawayPrize} onChange={(event) => setGiveawayPrize(event.target.value)} placeholder="Ödül" className="admin-field" />
                      <input value={giveawayImage} onChange={(event) => setGiveawayImage(event.target.value)} placeholder="Ödül resmi linki" className="admin-field" />
                      <input type="datetime-local" value={giveawayWhen} onChange={(event) => setGiveawayWhen(event.target.value)} className="admin-field" />
                      <button type="submit" className="admin-btn sm:col-span-2"><Plus size={15} />Çekiliş yayınla</button>
                    </form>
                    <div className="grid gap-2">
                      {giveaways.map((item) => (
                        <div key={item.id} className="admin-row">
                          {item.prizeImage ? <img src={item.prizeImage} alt="" className="size-12 rounded-xl object-cover" /> : <div className="grid size-12 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Gift size={18} /></div>}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{item.title}</p>
                            <p className="mt-0.5 text-[.62rem] text-[hsl(var(--muted-foreground))]">{item.prizeText || 'Ödül yok'} · {item.participants.length} katılım{item.winner ? ` · ${item.winner}` : ''}</p>
                          </div>
                          <button aria-label={`${item.title} çekilişini sil`} onClick={() => persistGiveaways(giveaways.filter((current) => current.id !== item.id))} className="grid size-9 place-items-center rounded-lg text-[hsl(var(--destructive))]"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminSection === 'Filmler' && (
                  <div>
                    <div className="mb-4">
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">İÇERİK</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Film İzle</h3>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); addContentCard('film'); }} className="mb-4 grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:grid-cols-2">
                      <input value={filmTitle} onChange={(event) => setFilmTitle(event.target.value)} placeholder="Film / site adı" className="admin-field" />
                      <input value={filmLink} onChange={(event) => setFilmLink(event.target.value)} placeholder="Site linki" className="admin-field" />
                      <input value={filmImage} onChange={(event) => setFilmImage(event.target.value)} placeholder="Kapak resmi" className="admin-field" />
                      <input value={filmCopy} onChange={(event) => setFilmCopy(event.target.value)} placeholder="Açıklama" className="admin-field" />
                      <button type="submit" className="admin-btn sm:col-span-2"><Plus size={15} />Film kartı ekle</button>
                    </form>
                    <div className="grid gap-2">
                      {films.map((item) => (
                        <div key={item.id} className="admin-row">
                          <span className="grid size-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Film size={16} /></span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-bold">{item.title}</p><p className="truncate text-[.62rem] text-[hsl(var(--muted-foreground))]">{item.link}</p></div>
                          <button aria-label={`${item.title} sil`} onClick={() => { const items = films.filter((current) => current.id !== item.id); setFilms(items); void patchClub({ films: items }); }} className="grid size-9 place-items-center rounded-lg text-[hsl(var(--destructive))]"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminSection === 'Uygulamalar' && (
                  <div>
                    <div className="mb-4">
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">İÇERİK</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Uygulama İndir</h3>
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); addContentCard('app'); }} className="mb-4 grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:grid-cols-2">
                      <input value={appTitle} onChange={(event) => setAppTitle(event.target.value)} placeholder="Uygulama adı" className="admin-field" />
                      <input value={appLink} onChange={(event) => setAppLink(event.target.value)} placeholder="İndirme linki" className="admin-field" />
                      <input value={appImage} onChange={(event) => setAppImage(event.target.value)} placeholder="Uygulama resmi" className="admin-field" />
                      <input value={appCopy} onChange={(event) => setAppCopy(event.target.value)} placeholder="Açıklama" className="admin-field" />
                      <button type="submit" className="admin-btn sm:col-span-2"><Plus size={15} />Uygulama ekle</button>
                    </form>
                    <div className="grid gap-2">
                      {apps.map((item) => (
                        <div key={item.id} className="admin-row">
                          <span className="grid size-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Download size={16} /></span>
                          <div className="min-w-0 flex-1"><p className="text-sm font-bold">{item.title}</p><p className="truncate text-[.62rem] text-[hsl(var(--muted-foreground))]">{item.link}</p></div>
                          <button aria-label={`${item.title} sil`} onClick={() => { const items = apps.filter((current) => current.id !== item.id); setApps(items); void patchClub({ apps: items }); }} className="grid size-9 place-items-center rounded-lg text-[hsl(var(--destructive))]"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {adminSection === 'Sayfalar' && (
                  <div>
                    <div className="mb-4">
                      <p className="font-mono text-[.55rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">GÖRÜNÜM</p>
                      <h3 className="mt-1 font-display text-xl font-bold">Sayfalar</h3>
                    </div>
                    <div className="grid gap-2">
                      {managedPages.map((page) => (
                        <div key={page.name} className="admin-row">
                          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
                            {page.name === 'Ana Sayfa' ? <HomeIcon size={16} /> : page.name === 'Etkinlikler' ? <CalendarDays size={16} /> : page.name === 'Menü' ? <Menu size={16} /> : <UserRound size={16} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{page.name}</p>
                            <p className="text-[.62rem] text-[hsl(var(--muted-foreground))]">{page.description}</p>
                          </div>
                          <button role="switch" aria-checked={page.enabled} onClick={() => setManagedPages((pages) => pages.map((item) => item.name === page.name ? { ...item, enabled: !item.enabled } : item))} className={`relative h-7 w-12 rounded-full p-1 ${page.enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}>
                            <span className={`block size-5 rounded-full bg-[hsl(var(--primary-foreground))] shadow-sm transition-transform ${page.enabled ? 'translate-x-5' : ''}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {giveawayOpen && <div data-testid="panel-giveaways" className="fixed inset-0 z-50 grid place-items-center bg-[#160c29]/45 p-4 backdrop-blur-sm" onClick={() => setGiveawayOpen(false)}>
        <div className="max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/50 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between">
            <div><p className="font-mono text-[.57rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">ÇEKİLİŞLER</p><h2 className="mt-1 font-display text-xl font-bold">Çekilişe katıl</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Katılım son ana kadar açık. Süre bitince kazanan otomatik açıklanır.</p></div>
            <button type="button" aria-label="Çekilişleri kapat" onClick={() => setGiveawayOpen(false)} className="grid size-9 place-items-center rounded-lg bg-[hsl(var(--muted))]"><X size={17} /></button>
          </div>
          {giveaways.length === 0 ? <p className="rounded-xl bg-[hsl(var(--muted)/.5)] p-4 text-sm text-[hsl(var(--muted-foreground))]">Admin henüz çekiliş açmadı. Buton o zaman aktif olur.</p> : (
            <div className="grid gap-3">
              {giveaways.map((item) => {
                const status = giveawayStatus(item, now);
                const joined = item.participants.includes(nick);
                const announceAt = new Date(item.announceAt).getTime();
                return (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.25)]">
                    {item.prizeImage && <img src={item.prizeImage} alt={item.title} className="h-32 w-full object-cover" />}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.prizeText || 'Ödül açıklaması yok'}</p></div>
                        <span className="rounded-full bg-white px-2 py-1 font-mono text-[.5rem] font-bold text-[hsl(var(--primary))]">{item.participants.length} kişi</span>
                      </div>
                      <p className="mt-3 text-[.62rem] font-semibold text-[hsl(var(--muted-foreground))]">
                        {status === 'open' && <>Kalan süre: {formatCountdown(announceAt, now)}</>}
                        {status === 'announced' && <>Kazanan: <strong className="text-[hsl(var(--foreground))]">{item.winner || 'Katılım yok'}</strong></>}
                      </p>
                      <button type="button" disabled={status !== 'open' || joined} onClick={() => joinGiveaway(item.id)} className="giveaway-join-btn mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold tracking-wide disabled:opacity-40">
                        <Gift size={15} />{joined ? 'Katıldın' : status === 'open' ? 'Çekilişe Katıl' : 'Açıklandı'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>}

      {selectedAnnouncement && <div data-testid="modal-announcement" className="fixed inset-0 z-50 grid place-items-center bg-[#160c29]/45 p-4 backdrop-blur-sm" onClick={() => setSelectedAnnouncement(null)}><div className="w-full max-w-md rounded-2xl border border-white/50 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-start justify-between"><div><span className="font-mono text-[.57rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">{selectedAnnouncement.tag}</span><h2 className="mt-1 font-display text-xl font-bold">{selectedAnnouncement.title}</h2></div><button data-testid="button-close-announcement" aria-label="Duyuruyu kapat" onClick={() => setSelectedAnnouncement(null)} className="grid size-9 place-items-center rounded-lg bg-[hsl(var(--muted))]"><X size={17} /></button></div><p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{selectedAnnouncement.copy}</p><button data-testid="button-announcement-done" onClick={() => { setSelectedAnnouncement(null); setNotice('Duyuru okundu olarak işaretlendi'); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--foreground))] py-3 text-sm font-bold text-white">Anladım <Check size={16} /></button></div></div>}

      {chatOpen && <div data-testid="panel-chat" className={`chat-sheet ${keyboardInset > 0 ? 'is-keyboard' : ''}`} style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}>
        {chatProfile && (
          <div className="chat-profile-overlay" onClick={() => setChatProfile(null)}>
            <div className="chat-profile-card" data-testid="card-chat-profile" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-label="Profil kartını kapat" onClick={() => setChatProfile(null)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-[hsl(var(--muted-foreground))]"><X size={16} /></button>
              <img src={chatProfile.photo} alt="" className="mx-auto size-20 rounded-full object-cover ring-4 ring-[hsl(var(--secondary))]" />
              <p className="mt-3 text-[.58rem] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Takma ad</p>
              <p className="mt-0.5 font-display text-lg font-bold">{chatProfile.nick}</p>
              <p className="mt-3 text-[.58rem] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">ID</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-[hsl(var(--primary))]">{chatProfile.appId || 'ID yok'}</p>
              <p className="mt-3 text-[.58rem] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Yetki</p>
              <p className="mt-0.5 text-sm font-extrabold">{yetkiLabel(chatProfile.role, chatProfile.title, chatProfile.vip)}</p>
            </div>
          </div>
        )}
        <div className={`flex shrink-0 items-center justify-between px-4 py-3 text-white ${guessLive ? 'bg-[linear-gradient(105deg,#0f172a,#4c1d95,#7c3aed)]' : 'bg-[linear-gradient(105deg,#281043,#6820ae)]'}`}>
          <div className="flex min-w-0 items-center gap-3"><ClubLogo size={44} className="club-logo-mark size-11 shrink-0" /><div className="min-w-0"><p className="truncate font-display text-sm font-bold">{guessLive ? 'Oyun modu' : 'Sohbet'}</p><p className="text-[.63rem] text-white/65">{guessLive ? `Tur ${guessGame?.round} · ${guessGame?.min}–${guessGame?.max}${guessPlaying ? ` · ${guessLeft} sn` : ''}` : '2.548 üye · 184 çevrimiçi'}</p></div></div>
          <div className="flex items-center gap-0.5">{canMuteStaff && !guessPlaying && <button type="button" data-testid="button-guess-setup" aria-label="Sayı tutmaca başlat" onClick={() => setGuessSetupOpen((open) => !open)} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><Dices size={16} /></button>}{canMuteStaff && guessLive && <button type="button" data-testid="button-guess-end" aria-label="Oyunu bitir" onClick={() => void finishGuessSession()} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-red-400/20 hover:text-white"><Trophy size={16} /></button>}{isAdmin && <button data-testid="button-delete-chat-history" aria-label="Tüm sohbet geçmişini sil" onClick={clearChatHistory} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-red-400/20 hover:text-white"><Trash2 size={16} /></button>}<button type="button" data-testid="button-chat-mute-panel" aria-label={chatMuted ? 'Sohbet bildirimlerini aç' : 'Sessize al'} onClick={toggleChatMute} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white">{chatMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><button data-testid="button-chat-more" aria-label="Sohbet seçenekleri" onClick={() => setNotice('Sohbet seçenekleri')} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><MoreVertical size={18} /></button><button data-testid="button-close-chat" aria-label="Sohbeti kapat" onClick={() => { setChatProfile(null); setGuessSetupOpen(false); setChatOpen(false); }} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><X size={18} /></button></div>
        </div>
        {guessSetupOpen && canMuteStaff && (
          <form className="guess-setup shrink-0" onSubmit={(event) => { event.preventDefault(); void launchGuessRound(); }}>
            <div className="flex items-center justify-between">
              <p className="font-display text-[.78rem] font-extrabold">Sayı tutmaca</p>
              <button type="button" aria-label="Kurulumu kapat" onClick={() => setGuessSetupOpen(false)} className="grid size-7 place-items-center rounded-lg text-[hsl(var(--muted-foreground))]"><X size={14} /></button>
            </div>
            <p className="mt-1 text-[.58rem] leading-relaxed text-[hsl(var(--muted-foreground))]">Önce aralığı yaz, sonra gizli sayıyı gir. Süre varsayılan 10 saniye.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[.68rem] font-extrabold text-[hsl(var(--muted-foreground))]">En az<input type="number" min={1} max={99} inputMode="numeric" value={guessMin} onChange={(event) => setGuessMin(event.target.value)} className="guess-field" /></label>
              <label className="grid gap-1 text-[.68rem] font-extrabold text-[hsl(var(--muted-foreground))]">En çok<input type="number" min={1} max={99} inputMode="numeric" value={guessMax} onChange={(event) => setGuessMax(event.target.value)} className="guess-field" /></label>
              <label className="grid gap-1 text-[.68rem] font-extrabold text-[hsl(var(--muted-foreground))]">Gizli sayı<input type="number" min={1} max={99} inputMode="numeric" value={guessSecret} onChange={(event) => setGuessSecret(event.target.value)} className="guess-field" placeholder={`${guessMin}–${guessMax}`} /></label>
              <label className="grid gap-1 text-[.68rem] font-extrabold text-[hsl(var(--muted-foreground))]">Süre (sn)<input type="number" min={5} max={60} inputMode="numeric" value={guessSeconds} onChange={(event) => setGuessSeconds(event.target.value)} className="guess-field" /></label>
            </div>
            <button type="submit" disabled={guessBusy} className="guess-btn-primary mt-3 disabled:opacity-50"><Dices size={15} /> Oyunu başlat</button>
          </form>
        )}
        <div ref={chatScrollRef} data-testid="chat-messages" className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4 flex justify-center"><span className="rounded-full bg-white/80 px-3 py-1 font-mono text-[.52rem] font-bold tracking-[.12em] text-[hsl(var(--muted-foreground))] shadow-sm">BUGÜN</span></div>
          <div className="space-y-3">
            {chatMessages.length === 0 ? <div className="flex min-h-full flex-col items-center justify-center py-10 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-white text-[hsl(var(--primary))] shadow-sm"><Trash2 size={22} /></div><p className="mt-3 text-xs font-bold">Sohbet geçmişi temizlendi</p><p className="mt-1 max-w-[15rem] text-[.65rem] leading-relaxed text-[hsl(var(--muted-foreground))]">Yeni bir mesaj göndererek sohbeti yeniden başlatabilirsin.</p></div> : chatMessages.map((message) => {
              if (message.kind === 'winner') {
                return (
                  <article key={message.id} className="giveaway-win-card mx-auto w-[min(100%,18rem)] overflow-hidden rounded-2xl border border-amber-300/70 bg-[linear-gradient(160deg,#1a0b2e,#3b1468_55%,#6b21a8)] text-white shadow-[0_12px_28px_rgba(88,28,135,.35)]">
                    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                      <Gift size={14} className="text-amber-300" />
                      <span className="font-mono text-[.5rem] font-extrabold tracking-[.16em] text-amber-200">ÇEKİLİŞ SONUCU</span>
                    </div>
                    {message.prizeImage && <img src={message.prizeImage} alt="" className="h-24 w-full object-cover" />}
                    <div className="px-3 py-3">
                      <p className="text-[.58rem] font-bold uppercase tracking-[.12em] text-amber-200/90">Kazanan</p>
                      <p className="mt-0.5 font-display text-lg font-bold leading-none">{message.winner}</p>
                      <p className="mt-2 text-[.68rem] text-white/80">{message.prizeTitle}</p>
                      <p className="mt-1 text-[.72rem] font-extrabold text-amber-200">{message.prizeText || 'Ödül'}</p>
                    </div>
                  </article>
                );
              }
              if (message.kind === 'mute') {
                const left = message.winner ? activeChatTimeout(timeouts, message.winner, now) : null;
                return (
                  <div key={message.id} className="mx-auto flex w-[min(100%,18rem)] items-start gap-2 rounded-2xl border border-rose-200 bg-[#fff5f6] px-3 py-2 text-[#9f1239]">
                    <MicOff size={14} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[.68rem] font-extrabold">{message.winner} susturuldu</p>
                      <p className="mt-0.5 text-[.58rem] leading-relaxed text-[#be123c]/80">{message.muteLabel} · {message.mutedBy}{left ? ` · kalan ${formatMuteRemaining(left.until, now)}` : ''}</p>
                    </div>
                  </div>
                );
              }
              if (message.kind === 'guess-start') {
                return (
                  <article key={message.id} className="guess-card guess-card-start mx-auto w-[min(100%,19rem)]">
                    <div className="flex items-center gap-2">
                      <span className="guess-card-icon"><Dices size={15} /></span>
                      <div>
                        <p className="font-mono text-[.5rem] font-extrabold tracking-[.16em] text-violet-200">SAYI TAHMİNİ</p>
                        <p className="font-display text-[.92rem] font-bold leading-tight">Sayı tahmini oyunu başlıyor</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <span className="guess-chip">Aralık {message.prizeTitle}</span>
                      <span className="guess-chip">{message.muteLabel || '10 sn'}</span>
                    </div>
                  </article>
                );
              }
              if (message.kind === 'guess-round') {
                const ranks = [...(message.winners || [])].sort((a, b) => a.at - b.at);
                return (
                  <article key={message.id} className="guess-card guess-card-round mx-auto w-[min(100%,19rem)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[.5rem] font-extrabold tracking-[.16em] text-amber-200">TUR SONUCU</p>
                      <span className="guess-chip">Cevap {message.prizeText}</span>
                    </div>
                    {ranks.length === 0 ? (
                      <p className="mt-3 font-display text-lg font-bold">Kimse bilemedi</p>
                    ) : (
                      <ol className="mt-3 space-y-1.5">
                        {ranks.map((winner, index) => (
                          <li key={`${winner.nick}-${winner.at}`} className="guess-rank">
                            <span className="guess-rank-n">{index + 1}</span>
                            <span className="min-w-0 truncate font-extrabold">{winner.nick}</span>
                            <span className="ml-auto font-mono text-[.58rem] text-white/70">{(winner.ms / 1000).toFixed(1)} sn</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                );
              }
              if (message.kind === 'guess-end') {
                const board = [...(message.winners || [])].sort((a, b) => (a.ms || 0) - (b.ms || 0));
                return (
                  <article key={message.id} className="guess-card guess-card-end mx-auto w-[min(100%,19rem)]">
                    <div className="flex items-center gap-2">
                      <span className="guess-card-icon gold"><Trophy size={15} /></span>
                      <div>
                        <p className="font-mono text-[.5rem] font-extrabold tracking-[.16em] text-amber-200">OYUN SONU</p>
                        <p className="font-display text-[.92rem] font-bold leading-tight">En çok kazananlar</p>
                      </div>
                    </div>
                    {board.length === 0 ? (
                      <p className="mt-3 text-[.72rem] text-white/75">Bu oyunda kazanan olmadı</p>
                    ) : (
                      <ol className="mt-3 space-y-1.5">
                        {board.map((winner) => (
                          <li key={`${winner.nick}-${winner.ms}`} className="guess-rank">
                            <span className="guess-rank-n">{winner.ms}</span>
                            <span className="min-w-0 truncate font-extrabold">{winner.nick}</span>
                            <span className="ml-auto text-[.62rem] font-extrabold text-amber-200">{winner.at} kez</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                );
              }
              const authorMuted = Boolean(activeChatTimeout(timeouts, message.author, now));
              const authorAccount = accounts.find((item) => nickKey(item.nick) === nickKey(message.author));
              const authorTitle = message.title || authorAccount?.title;
              return (
                <SwipeReplyRow key={message.id} onReply={() => { setReplyTo(message); chatInputRef.current?.focus(); }}>
                <div className={`group flex items-end gap-2 ${message.mine ? 'justify-end' : 'justify-start'}`}>
                  {!message.mine && <button type="button" aria-label={`${message.author} profil kartı`} onClick={() => openChatProfile(message)} className={`grid size-7 shrink-0 place-items-center overflow-hidden rounded-full font-mono text-[.52rem] font-bold ${message.avatar}`}><img src={avatarFor(message.author, message.photo)} alt="" className="size-full object-cover" /></button>}
                  <div className={`relative max-w-[82%] ${message.mine ? 'items-end' : 'items-start'}`}>
                    {!message.mine && <div className="mb-1 ml-1"><RankedName name={message.author} role={message.role} title={authorTitle ?? undefined} appId={authorAccount?.appId || undefined} muted={authorMuted} revealId vip={isLiveVip(authorAccount?.vipUntil, now)} /></div>}
                    <div className={`rounded-2xl px-3 py-2 shadow-sm ${message.mine ? 'rounded-br-md bg-[linear-gradient(135deg,#8b35e4,#6a22c2)] text-white' : 'rounded-bl-md border border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))]'}`}>
                      {message.mine && <div className="mb-1 flex justify-end"><RankedName name={message.author} role={message.role} title={authorTitle ?? undefined} appId={user.appId} align="end" onDark muted={authorMuted} revealId vip={isLiveVip(walletVip, now)} /></div>}
                      {message.replyTo && <div className={`mb-2 rounded-lg border-l-2 px-2 py-1.5 text-[.6rem] ${message.mine ? 'border-white/60 bg-white/10 text-white/75' : 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`}><strong className="block text-[.56rem]">{message.replyTo.author}</strong><span className="line-clamp-1">{message.replyTo.message}</span></div>}
                      <p className="text-[.72rem] leading-relaxed">{message.message}</p>
                      <div className={`mt-1 flex items-center justify-end gap-1 text-[.51rem] ${message.mine ? 'text-white/65' : 'text-[hsl(var(--muted-foreground))]'}`}><span>{message.time}</span>{message.mine && <CheckCheck size={13} />}</div>
                    </div>
                    <div className={`absolute -bottom-3 flex gap-1 ${message.mine ? '-left-16' : '-right-16'}`}>
                      <button type="button" onClick={() => setReplyTo(message)} className="grid size-7 place-items-center rounded-full border border-[hsl(var(--border))] bg-white text-[hsl(var(--muted-foreground))] opacity-0 shadow-sm transition-opacity hover:text-[hsl(var(--primary))] group-hover:opacity-100" aria-label={`${message.author} mesajını yanıtla`}><Reply size={13} /></button>
                      {canMuteAuthor(message) && (
                        <span className="relative">
                          <button type="button" onClick={() => { const live = activeChatTimeout(timeouts, message.author); if (live) liftMute(message.author); else startMute(message.author); }} className="grid size-7 place-items-center rounded-full border border-rose-200 bg-white text-[#be123c] opacity-0 shadow-sm transition-opacity hover:bg-rose-50 group-hover:opacity-100" aria-label={activeChatTimeout(timeouts, message.author) ? `${message.author} susturmasını kaldır` : `${message.author} kullanıcısını sustur`}><MicOff size={13} /></button>
                          {isAdmin && muteTarget === message.author && (
                            <div className="absolute bottom-8 right-0 z-20 w-36 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-white py-1 shadow-lg">
                              {ADMIN_MUTE_OPTIONS.map((option) => (
                                <button key={option.label} type="button" onClick={() => applyMute(message.author, option.ms, option.label)} className="block w-full px-3 py-1.5 text-left text-[.62rem] font-bold hover:bg-rose-50">{option.label}</button>
                              ))}
                            </div>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {message.mine && <button type="button" aria-label={`${message.author} profil kartı`} onClick={() => openChatProfile(message)} className={`grid size-7 shrink-0 place-items-center overflow-hidden rounded-full font-mono text-[.52rem] font-bold ${message.avatar}`}><img src={myPhoto} alt="" className="size-full object-cover" /></button>}
                </div>
                </SwipeReplyRow>
              );
            })}
          </div>
          <div className="mt-5 flex justify-center"><span className="rounded-full bg-[#fff4d9] px-3 py-1 text-[.57rem] font-semibold text-[#9c761b]">Sağa kaydırarak cevapla</span></div>
        </div>
        {guessPlaying && (
          <form className="guess-live shrink-0" onSubmit={(event) => { event.preventDefault(); void sendGuessNumber(); }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-display text-base font-extrabold">Sayıyı yaz</p>
                <p className="text-[.72rem] text-white/80">{guessGame?.min}–{guessGame?.max} arası · {guessLeft} sn</p>
              </div>
              <span className="guess-timer"><Timer size={13} />{guessLeft}</span>
            </div>
            {alreadyGuessed ? (
              <p className="mt-3 rounded-xl bg-white/10 px-3 py-2.5 text-center text-[.7rem] font-extrabold">Tahminin alındı, süre bitince sonuç gelir</p>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <input type="number" inputMode="numeric" min={guessGame?.min} max={guessGame?.max} value={guessNumber} onChange={(event) => setGuessNumber(event.target.value)} placeholder={`${guessGame?.min}–${guessGame?.max}`} className="guess-live-input" />
                <button type="submit" disabled={guessBusy || !guessNumber.trim()} className="guess-send disabled:opacity-40"><Send size={16} /></button>
              </div>
            )}
          </form>
        )}
        {guessRevealed && canMuteStaff && (
          <div className="guess-next shrink-0">
            <p className="text-[.62rem] font-bold text-[hsl(var(--muted-foreground))]">Tur bitti{guessGame?.answer ? ` · cevap ${guessGame.answer}` : ''}. Yeni tur veya oyun sonu.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setGuessSetupOpen(true)} className="guess-btn-primary flex-1">Yeni tur</button>
              <button type="button" onClick={() => void finishGuessSession()} className="guess-btn-ghost flex-1">Oyunu bitir</button>
            </div>
          </div>
        )}
        {!guessPlaying && replyTo && <div className="flex shrink-0 items-center gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-3 py-2"><Reply size={15} className="shrink-0 text-[hsl(var(--primary))]" /><div className="min-w-0 flex-1 border-l-2 border-[hsl(var(--primary))] pl-2"><p className="text-[.59rem] font-bold text-[hsl(var(--primary))]">{replyTo.author} yanıtlanıyor</p><p className="truncate text-[.63rem] text-[hsl(var(--muted-foreground))]">{replyTo.message}</p></div><button type="button" aria-label="Yanıtlamayı iptal et" onClick={() => setReplyTo(null)} className="grid size-7 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-white"><X size={14} /></button></div>}
        {!guessPlaying && <div className="relative shrink-0 border-t border-[hsl(var(--border))] bg-white p-2.5">
          {emojiPickerOpen && <div data-testid="panel-emoji-picker" className="absolute bottom-[4.35rem] left-2 z-10 grid w-[min(18rem,calc(100vw-2rem))] grid-cols-6 gap-1 rounded-2xl border border-[hsl(var(--border))] bg-white p-2.5 shadow-[0_12px_35px_rgba(56,25,107,.18)]">{chatEmojis.map((emoji) => <button type="button" key={emoji} onClick={() => { setChatText((current) => `${current}${emoji}`); chatInputRef.current?.focus(); }} className="grid size-9 place-items-center rounded-lg text-xl transition-colors hover:bg-[hsl(var(--muted))]">{emoji}</button>)}</div>}
          {selfMute ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[#fff5f6] px-3 py-2.5 text-[#9f1239]">
              <MicOff size={16} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[.7rem] font-extrabold">Susturuldun</p>
                <p className="text-[.58rem]">{selfMute.label} · kalan {formatMuteRemaining(selfMute.until, now)}</p>
              </div>
            </div>
          ) : !user.appId ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[hsl(var(--secondary))] px-3 py-2.5">
              <KeyRound size={16} className="shrink-0 text-[hsl(var(--primary))]" />
              <div className="min-w-0 flex-1">
                <p className="text-[.7rem] font-extrabold">Sohbet için uygulama ID’si gerekli</p>
                <p className="text-[.58rem] text-[hsl(var(--muted-foreground))]">Profilinden uygulamanın içindeki ID’ni gir.</p>
              </div>
              <button type="button" onClick={() => { setChatOpen(false); handleNav('Profil'); }} className="rounded-lg bg-[hsl(var(--primary))] px-2.5 py-1.5 text-[.6rem] font-bold text-white">Profil</button>
            </div>
          ) : (
          <form className="flex items-end gap-1.5" onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
            <button type="button" aria-label="Dosya ekle" onClick={() => setNotice('Dosya ekleme yakında')} className="grid size-10 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--primary))]"><Paperclip size={18} /></button>
            <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-2xl bg-[hsl(var(--muted)/.7)] px-3 py-1"><textarea ref={chatInputRef} data-testid="input-chat" rows={1} value={chatText} onChange={(event) => setChatText(event.target.value)} onFocus={() => { requestAnimationFrame(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } }} placeholder="Mesaj yaz..." className="chat-input max-h-24 min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1.5 leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))]" /><button type="button" aria-label="Emoji seç" onClick={() => setEmojiPickerOpen((open) => !open)} className="grid size-8 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><Smile size={18} /></button></div>
            <button data-testid="button-send-chat" aria-label="Mesaj gönder" type="submit" disabled={!chatText.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-white shadow-md shadow-violet-200 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35"><Send size={16} /></button>
          </form>
          )}
          <p className="mt-1 hidden pl-12 text-[.52rem] text-[hsl(var(--muted-foreground))] sm:block">{selfMute ? 'Susturma bitince yazabilirsin' : 'Enter gönderir · Shift + Enter yeni satır'}</p>
        </div>}
      </div>}

      {guessEndOpen && guessGame?.status === 'ended' && (
        <div className="guess-overlay" onClick={() => setGuessEndOpen(false)}>
          <div className="guess-overlay-card" data-testid="card-guess-end" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Kapat" onClick={() => setGuessEndOpen(false)} className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-white/70"><X size={16} /></button>
            <span className="guess-card-icon gold mx-auto"><Trophy size={18} /></span>
            <p className="mt-3 font-mono text-[.55rem] font-extrabold tracking-[.18em] text-amber-200">OYUN SONU</p>
            <h2 className="mt-1 font-display text-2xl font-bold">En çok kazananlar</h2>
            {guessTop.length === 0 ? (
              <p className="mt-4 text-sm text-white/70">Bu oyunda kimse kazanamadı</p>
            ) : (
              <ol className="mt-5 space-y-2">
                {guessTop.map((item, index) => (
                  <li key={item.nick} className="guess-rank">
                    <span className="guess-rank-n">{index + 1}</span>
                    <span className="min-w-0 truncate font-extrabold">{item.nick}</span>
                    <span className="ml-auto text-[.68rem] font-extrabold text-amber-200">{item.wins} kez</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {ticker && (
        <div className="club-ticker" data-testid="ticker-broadcast" role="status" aria-live="polite">
          <span className="club-ticker-icon" aria-hidden="true"><Bell size={14} /></span>
          <div className="club-ticker-mask">
            <div className="club-ticker-track">
              <span><strong>{ticker.title}</strong> {ticker.body}</span>
              <span aria-hidden="true"><strong>{ticker.title}</strong> {ticker.body}</span>
            </div>
          </div>
          <button type="button" data-testid="button-ticker-close" aria-label="Kayan bildirimi kapat" onClick={() => setTicker(null)} className="club-ticker-close">
            <X size={14} />
          </button>
        </div>
      )}

      {notifyPromptOpen && (
        <div className="fixed inset-x-3 bottom-[5.5rem] z-[45] mx-auto max-w-md rounded-2xl border border-violet-200 bg-white p-4 shadow-[0_18px_50px_rgba(76,29,149,.22)] sm:bottom-8">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#a02bf3,#6321ca)] text-white"><Bell size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Telefon bildirimleri</p>
              <p className="mt-1 text-[.72rem] leading-relaxed text-[hsl(var(--muted-foreground))]">Çekiliş açılınca ve sohbette mesaj gelince tüm telefonlara bildirim gitsin. Arka planda da çalışır.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void allowPhoneNotify()} className="rounded-xl bg-[hsl(var(--primary))] px-3 py-2 text-[.68rem] font-bold text-white">İzin ver</button>
                <button type="button" onClick={() => { markNotifyPrompted(); setNotifyPromptOpen(false); }} className="rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-[.68rem] font-bold text-[hsl(var(--muted-foreground))]">Şimdi değil</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const installSteps = ['Hoş geldin', 'Veritabanı kurulumu', 'Admin hesabı', 'MOD CLUB ayarları', 'Tema seçimi', 'Kurulum tamamlandı'];

function InstallWizard({ onInstalled }: { onInstalled?: (session?: UserSession | null) => void }) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [clubName, setClubName] = useState('MOD CLUB');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [theme, setTheme] = useState('electric');
  const [error, setError] = useState('');

  const finishInstall = async () => {
    if (adminPassword.trim() !== adminPasswordConfirm.trim()) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    try {
      const saved = await saveServerSetup({
        clubName: clubName.trim() || 'MOD CLUB',
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword: adminPassword.trim(),
        theme,
      });
      onInstalled?.(saved.me || {
        username: saved.adminUsername,
        nick: saved.adminName,
        name: saved.adminName,
        role: 'ADMIN',
      });
      setStep(5);
    } catch {
      setError('Kurulum kaydedilemedi. Railway’de Postgres bağlı mı?');
    }
  };

  const enterApp = () => {
    setLocation('/');
  };

  const canContinue = step !== 2 || (adminName.trim().length > 1 && adminEmail.includes('@') && adminUsername.trim().length >= 3 && adminPassword.trim().length >= 4 && adminPassword === adminPasswordConfirm);
  return (
    <div className="install-page grain min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-10">
      <div className="install-card mx-auto w-full max-w-5xl overflow-visible rounded-[2rem] border border-[hsl(var(--border))] bg-white shadow-[0_24px_80px_rgba(81,38,145,.12)]">
        <div className="grid lg:grid-cols-[.75fr_1.25fr]">
          <aside className="install-aside p-6 text-white sm:p-10 lg:p-12">
            <button onClick={() => setLocation('/')} className="text-left" aria-label="MOD CLUB"><ClubLogo size={72} className="club-logo-mark size-[4.5rem]" /></button>
            <div className="mt-14 lg:mt-24"><p className="font-mono text-[.62rem] font-bold tracking-[.18em] text-[#dba9ff]">KURULUM SİHİRBAZI</p><h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.8rem)] font-bold leading-[.95] tracking-[-.07em]">Kulübünü<br /><span className="text-[#c25aff]">enerjiyle</span> başlat.</h1><p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">Birkaç kısa adımda MOD CLUB deneyimini kendi topluluğun için hazırla.</p></div>
            <div className="mt-12 hidden space-y-3 lg:block">{installSteps.map((label, index) => <div key={label} className={`flex items-center gap-3 text-xs ${index === step ? 'font-bold text-white' : index < step ? 'text-[#d49dff]' : 'text-white/40'}`}><span className={`grid size-7 place-items-center rounded-full border text-[.65rem] ${index < step ? 'border-[#b858ff] bg-[#9e3be5]' : index === step ? 'border-white bg-white/15' : 'border-white/20'}`}>{index < step ? <Check size={14} /> : index + 1}</span>{label}</div>)}</div>
          </aside>
          <section className="p-6 sm:p-10 lg:p-14">
            <div className="mb-8 flex items-center justify-between lg:hidden"><span className="font-mono text-[.62rem] font-bold tracking-[.16em] text-[hsl(var(--muted-foreground))]">ADIM {step + 1} / 6</span><div className="h-1.5 w-28 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${((step + 1) / installSteps.length) * 100}%` }} /></div></div>
            {step === 0 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Sparkles size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 01</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Hoş geldin.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">MOD CLUB, üyeler, bannerlar ve sohbeti Postgres sunucusunda tutar. Kurulum yaklaşık iki dakika sürer.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-4"><Server size={18} className="text-[hsl(var(--primary))]" /><p className="mt-3 text-sm font-bold">Sunucuda kalıcı</p><p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Veriler tarayıcıda değil, PostgreSQL’de durur.</p></div><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-4"><ShieldCheck size={18} className="text-[hsl(var(--primary))]" /><p className="mt-3 text-sm font-bold">Güvenli başlangıç</p><p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Admin hesabın kurulunca sihirbaz kilitlenir.</p></div></div></div>}
            {step === 1 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#e8f1ff] text-[#4b86dc]"><Server size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 02</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Postgres hazır.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Railway Postgres bağlandığında tablolar otomatik kurulur. Variable yazmana gerek yok.</p><div className="mt-8 flex items-center gap-3 rounded-xl border border-[#ccebd5] bg-[#f0fcf4] p-4 text-sm font-semibold text-[#2f9650]"><Check size={18} /> Veritabanı bağlantısı bekleniyor, kuruluma devam edebilirsin</div></div>}
            {step === 2 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#fff0d8] text-[#d48a1b]"><UserRound size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 03</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Admin hesabını oluştur.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Kulübünü yönetmek için ilk yönetici bilgilerini gir.</p><div className="mt-7 grid gap-4"><label className="grid gap-2 text-xs font-bold">Ad soyad<input value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="Örn. Ece Yılmaz" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label><label className="grid gap-2 text-xs font-bold">E-posta<input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@modclub.com" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label><label className="grid gap-2 text-xs font-bold">Kullanıcı adı<input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} placeholder="admin" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label><label className="grid gap-2 text-xs font-bold">Şifre<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="En az 4 karakter" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label><label className="grid gap-2 text-xs font-bold">Şifre tekrar<input type="password" value={adminPasswordConfirm} onChange={(event) => setAdminPasswordConfirm(event.target.value)} placeholder="Şifreyi tekrar yaz" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label>{adminPasswordConfirm.length > 0 && adminPassword.trim() !== adminPasswordConfirm.trim() && <p className="text-xs font-semibold text-[#c54d5b]">Şifreler eşleşmiyor.</p>}</div></div>}
            {step === 3 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#f1e2ff] text-[#913be0]"><Palette size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 04</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Kulübünü tanımla.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Üyelerin göreceği kulüp adını belirle.</p><label className="mt-7 grid gap-2 text-xs font-bold">Kulüp adı<input value={clubName} onChange={(event) => setClubName(event.target.value)} className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label></div>}
            {step === 4 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#fce5f3] text-[#d44397]"><Palette size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 05</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Enerjini seç.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">MOD CLUB’ın temel görünümünü belirle. Bunu daha sonra ayarlardan değiştirebilirsin.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => setTheme('electric')} className={`rounded-2xl border p-4 text-left transition-all ${theme === 'electric' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] ring-2 ring-[hsl(var(--primary)/.15)]' : 'border-[hsl(var(--border))]'}`}><span className="mb-5 block h-16 rounded-xl bg-[linear-gradient(135deg,#18052e,#9e36ed)]" /><p className="text-sm font-bold">Electric Violet</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Varsayılan MOD enerjisi</p></button><button onClick={() => setTheme('midnight')} className={`rounded-2xl border p-4 text-left transition-all ${theme === 'midnight' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] ring-2 ring-[hsl(var(--primary)/.15)]' : 'border-[hsl(var(--border))]'}`}><span className="mb-5 block h-16 rounded-xl bg-[linear-gradient(135deg,#071125,#1c5b9e)]" /><p className="text-sm font-bold">Midnight Blue</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Daha sakin topluluk modu</p></button></div></div>}
            {step === 5 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#e0f7e8] text-[#2caa5a]"><Check size={30} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[#2caa5a]">HAZIR</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">MOD CLUB yayında.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Kurulum tamamlandı. Üyeler, sohbet ve çekilişler Postgres’te kalıcı durur.</p><div className="mt-8 flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4 text-sm"><LockKeyhole size={18} className="text-[hsl(var(--primary))]" /><span><strong className="block">Kurulum kilitlendi</strong><small className="text-xs text-[hsl(var(--muted-foreground))]">Ayarların sunucuda kaydedildi.</small></span></div></div>}
            {error && <p className="mt-6 text-xs font-semibold text-[#c54d5b]">{error}</p>}
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-6"><button onClick={() => step > 0 && setStep((current) => current - 1)} className={`min-h-11 rounded-xl px-3 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] ${step === 0 ? 'invisible' : ''}`}>Geri</button>{step < 5 ? <button disabled={!canContinue} onClick={() => step === 4 ? void finishInstall() : setStep((current) => current + 1)} className="flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--foreground))] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{step === 4 ? 'Kurulumu tamamla' : 'Devam et'} <ChevronRight size={16} /></button> : <button onClick={enterApp} className="flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5">Kulübe gir <ChevronRight size={16} /></button>}</div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const [gate, setGate] = useState<'loading' | 'wizard' | 'app'>('loading');
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await fetchPublicSetup();
      if (cancelled) return;
      if (!remote?.installed) {
        setGate('wizard');
        return;
      }
      const me = remote.me || await fetchMe();
      if (cancelled) return;
      setSession(me);
      setGate('app');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    void logoutUser();
    setSession(null);
  };

  const handleReset = () => {
    void logoutUser();
    setSession(null);
  };

  if (gate === 'loading') {
    return (
      <div className="login-page grain grid min-h-[100dvh] place-items-center px-4">
        <ClubLogo size={112} className="club-logo-mark size-28" />
      </div>
    );
  }

  if (gate === 'wizard') {
    return (
      <InstallWizard
        onInstalled={(next) => {
          if (next) setSession(next);
          setGate('app');
        }}
      />
    );
  }

  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/">
          {session ? <Home session={session} onLogout={handleLogout} onSession={setSession} /> : <LoginScreen onLogin={setSession} onReset={handleReset} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    applyColorMode(loadColorMode());
    void registerClubWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;