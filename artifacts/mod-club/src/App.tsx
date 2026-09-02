import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Bell, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, Gamepad2, Home as HomeIcon, ImagePlus, LockKeyhole, Menu, MessageCircle, Megaphone, MoreVertical, Palette, Paperclip, PanelRightOpen, Phone, Reply, Search, Send, Server, ShieldCheck, Smile, Sparkles, Trophy, UserRound, UsersRound, Video, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

const quickItems: { label: string; sublabel: string; icon: LucideIcon; tone: string }[] = [
  { label: 'SOHBET', sublabel: 'Sesli odalara katıl', icon: MessageCircle, tone: 'violet' },
  { label: 'DUYURULAR', sublabel: 'Son duyuruları gör', icon: Megaphone, tone: 'amber' },
  { label: 'OYUNLAR', sublabel: 'Oyna, kazan, eğlen', icon: Gamepad2, tone: 'sky' },
  { label: 'TOPLULUK', sublabel: 'Üyelere tanış', icon: UsersRound, tone: 'mint' },
  { label: 'AFİŞLER', sublabel: 'Etkinlik afişlerini gör', icon: Trophy, tone: 'pink' },
];

const slides = [
  { eyebrow: 'YENİ SEZON', title: 'MOD CLUB', accent: 'SEZON 2', rest: 'BAŞLADI!', copy: 'Turnuvalar, ödüller ve daha fazlası seni bekliyor!', action: 'Hemen Katıl' },
  { eyebrow: 'TOPLULUK GÜNÜ', title: 'BİRLİKTE', accent: 'DAHA GÜÇLÜYÜZ', rest: '', copy: 'Yeni arkadaşlar, yeni oyunlar ve unutulmaz anlar.', action: 'Keşfet' },
  { eyebrow: 'HAFTANIN MEYDAN OKUMASI', title: 'SAHNE', accent: 'SENİN!', rest: '', copy: 'Skorunu yükselt, topluluk sıralamasında yerini al.', action: 'Sıralamayı Gör' },
];

const announcements = [
  { id: 'announcement-1', tag: 'YENİ', title: 'Yeni Özellik Geldi', copy: 'Sesli odalarda artık yeni efektler ve rozetler var!', icon: Zap, color: 'violet' },
  { id: 'announcement-2', tag: 'ÖNEMLİ', title: 'Bakım Çalışması', copy: 'Sunucular 02.06.2024 03:00 - 06:00 arası bakımda olacaktır.', icon: WrenchIcon, color: 'amber' },
  { id: 'announcement-3', tag: 'DUYURU', title: 'Turnuva Kayıtları', copy: 'Büyük turnuva kayıtları başladı! Hemen takımını kur ve katıl.', icon: Trophy, color: 'sky' },
];

const events = [
  { id: 'event-1', date: '18 Haziran 2024', time: '20:00', category: 'TURNUVA', title: 'BÜYÜK TURNUVA', copy: '50.000 TL ÖDÜL HAVUZU', tone: 'purple' },
  { id: 'event-2', date: '20 Haziran 2024', time: '21:00', category: 'ETKİNLİK', title: 'MÜZİK PARTİSİ', copy: 'DJ Performansı & Eğlence', tone: 'rose' },
  { id: 'event-3', date: '20 Haziran 2024', time: '19:00', category: 'ÖZEL OYUN', title: 'ÖZEL OYUN GECESİ', copy: 'Ödüllü Özel Maçlar', tone: 'blue' },
  { id: 'event-4', date: '23 Haziran 2024', time: '18:30', category: 'QUIZ', title: 'ÖDÜLLÜ QUIZ', copy: 'Bilgini test et, ödülünü kap!', tone: 'green' },
];

type ChatMessage = {
  id: string;
  author: string;
  initials: string;
  avatar: string;
  message: string;
  time: string;
  mine?: boolean;
  replyTo?: { author: string; message: string };
};

const initialChatMessages: ChatMessage[] = [
  { id: 'chat-1', author: 'Mert Kaya', initials: 'MK', avatar: 'bg-[#d8b2ff] text-[#63329c]', message: 'Herkese selam! Bu akşamki turnuva için takımlar hazır mı?', time: '19:42' },
  { id: 'chat-2', author: 'Sude Y.', initials: 'SY', avatar: 'bg-[#ffc4d8] text-[#b13d6b]', message: 'Ben hazırım, birazdan takım odasına geçiyorum.', time: '19:44' },
  { id: 'chat-3', author: 'Arda Demir', initials: 'AD', avatar: 'bg-[#bfe0ff] text-[#2e6fae]', message: 'Son slot için bir kişi daha arıyoruz. Katılmak isteyen var mı?', time: '19:46' },
  { id: 'chat-4', author: 'Ece', initials: 'ED', avatar: 'bg-[#a15be9] text-white', message: 'Ben varım! Özel oyun gecesi için de plan yapalım.', time: '19:48', mine: true },
  { id: 'chat-5', author: 'Mert Kaya', initials: 'MK', avatar: 'bg-[#d8b2ff] text-[#63329c]', message: 'Harika, seni takıma ekliyorum. Oda 10 dakika sonra açık.', time: '19:49' },
];

const chatEmojis = ['😀', '😂', '😍', '🔥', '👏', '🎮', '🎉', '💜', '🙌', '🤝', '😎', '❤️'];

function WrenchIcon({ size = 20, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a4.5 4.5 0 0 0-5.9 5.9L3.5 17.5a2.12 2.12 0 1 0 3 3l5.3-5.3a4.5 4.5 0 0 0 5.9-5.9l-2.6 2.6-3-3 2.6-2.6Z" /><path d="m16 16 5 5" /></svg>;
}

function Home() {
  const [slide, setSlide] = useState(0);
  const [selectedQuick, setSelectedQuick] = useState('SOHBET');
  const [activeNav, setActiveNav] = useState('Ana Sayfa');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('chat') === '1');
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<typeof announcements[number] | null>(null);
  const [joinedEvents, setJoinedEvents] = useState<string[]>([]);
  const [notice, setNotice] = useState('Hoş geldin, Ece');

  const currentSlide = slides[slide];
  const upcomingEvents = useMemo(() => events.slice(0, 4), []);

  const changeSlide = (direction: number) => {
    setSlide((current) => (current + direction + slides.length) % slides.length);
  };

  const handleQuickSelect = (label: string) => {
    setSelectedQuick(label);
    setNotice(`${label.toLocaleLowerCase('tr-TR')} alanına göz atıyorsun`);
  };

  const handleNav = (label: string) => {
    setActiveNav(label);
    if (label === 'Ana Sayfa') {
      setNotice('Ana sayfaya döndün');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (label === 'Profil') {
      setNotice('Profil alanı yakında seninle');
      return;
    }
    setNotice(`${label} alanına geçtin`);
  };

  const toggleJoin = (eventId: string) => {
    const joined = joinedEvents.includes(eventId);
    setJoinedEvents((items) => joined ? items.filter((id) => id !== eventId) : [...items, eventId]);
    setNotice(joined ? 'Etkinlikten ayrıldın' : 'Etkinliğe katılımın alındı');
  };

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chatOpen, chatMessages]);

  const sendChat = () => {
    const message = chatText.trim();
    if (!message) return;
    setChatMessages((current) => [...current, {
      id: `chat-${Date.now()}`,
      author: 'Ece',
      initials: 'ED',
      avatar: 'bg-[#a15be9] text-white',
      message,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      mine: true,
      replyTo: replyTo ? { author: replyTo.author, message: replyTo.message } : undefined,
    }]);
    setChatText('');
    setReplyTo(null);
    setEmojiPickerOpen(false);
    setNotice('Mesajın topluluğa gönderildi');
  };

  return (
    <div className="mod-app grain min-h-[100dvh] pb-24">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.9)] backdrop-blur-xl">
        <div className="desktop-shell mx-auto flex h-[4.25rem] w-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button data-testid="button-menu" aria-label="Menüyü aç" onClick={() => setMenuOpen((open) => !open)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))]">
              <Menu size={21} strokeWidth={2.1} />
            </button>
            <button data-testid="button-logo-home" onClick={() => handleNav('Ana Sayfa')} className="flex items-center gap-1.5 text-left">
              <span className="font-display text-[1.35rem] font-bold tracking-[-.08em] text-[hsl(var(--primary))]">MOD</span>
              <span className="font-display text-[1.18rem] font-bold tracking-[-.07em]">CLUB</span>
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
            <div className="relative">
              <button data-testid="button-notifications" aria-label="Bildirimleri aç" onClick={() => setNotificationsOpen((open) => !open)} className="grid size-11 place-items-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"><Bell size={19} /></button>
              <span className="absolute right-1 top-1 grid size-[1.05rem] place-items-center rounded-full bg-[hsl(var(--primary))] font-mono text-[.58rem] font-bold text-white">3</span>
              {notificationsOpen && (
                <div data-testid="panel-notifications" className="absolute right-0 top-14 z-20 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-[hsl(var(--border))] bg-white p-4 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between"><strong className="font-display text-sm">Bildirimler</strong><span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[.65rem] font-bold text-[hsl(var(--primary))]">3 yeni</span></div>
                  {['Turnuva kaydın tamamlandı.', 'MOD CLUB puanın yükseldi.', 'Yeni bir sohbet odası açıldı.'].map((item, index) => <button data-testid={`button-notification-${index}`} key={item} onClick={() => setNotice(item)} className="flex w-full gap-2 border-t border-[hsl(var(--border))] py-3 text-left text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]" />{item}</button>)}
                </div>
              )}
            </div>
            <button data-testid="button-profile" aria-label="Profili aç" onClick={() => handleNav('Profil')} className="relative grid size-10 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#26104b,#9d42f5)] text-white shadow-md shadow-violet-200/50"><span className="font-display text-sm font-bold">ED</span><span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-[#56d47e]" /></button>
          </div>
        </div>
        {menuOpen && <div data-testid="panel-menu" className="absolute left-4 top-[4.7rem] z-20 w-56 rounded-2xl border border-[hsl(var(--border))] bg-white p-2 shadow-2xl sm:left-6 lg:left-[max(2rem,calc((100vw-1340px)/2))]"><button data-testid="button-menu-community" onClick={() => { handleNav('Topluluk'); setMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-[hsl(var(--muted))]"><UsersRound size={17} className="text-[hsl(var(--primary))]" />Topluluk keşfi</button><button data-testid="button-menu-settings" onClick={() => { setNotice('Ayarlar alanı yakında seninle'); setMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-[hsl(var(--muted))]"><PanelRightOpen size={17} className="text-[hsl(var(--primary))]" />Hesap ayarları</button></div>}
      </header>

      <main className="desktop-shell mx-auto w-full px-4 pb-10 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4 reveal">
          <div>
            <p data-testid="text-welcome" className="mb-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">{notice}</p>
            <h1 className="font-display text-[clamp(1.55rem,3vw,2.05rem)] font-bold leading-tight tracking-[-.055em]">Bugün ne yapmak<br className="sm:hidden" /> istersin?</h1>
          </div>
          <button data-testid="button-see-all-home" onClick={() => setNotice('Tüm aktiviteler listeleniyor')} className="hidden items-center gap-1 text-xs font-bold text-[hsl(var(--primary))] sm:flex">Tümünü Gör <ChevronRight size={15} /></button>
        </div>

        <section className="hero-energy relative isolate min-h-[13rem] overflow-hidden rounded-[1.25rem] text-white shadow-[0_18px_45px_rgba(69,21,125,.22)] sm:min-h-[16rem] lg:min-h-[18rem]">
          <div className="absolute inset-0 opacity-30" style={{ background: 'repeating-linear-gradient(155deg, transparent 0 30px, rgba(255,255,255,.08) 31px 32px, transparent 33px 70px)' }} />
          <div className="hero-silhouette hidden sm:block" />
          <div className="hero-copy flex min-h-[13rem] w-[78%] flex-col justify-center px-6 py-6 sm:min-h-[16rem] sm:w-[62%] sm:px-10 lg:min-h-[18rem] lg:px-14">
            <p className="mb-3 font-mono text-[.58rem] font-bold tracking-[.2em] text-[#d8a8ff] sm:text-[.65rem]">{currentSlide.eyebrow}</p>
            <h2 className="font-display text-[clamp(1.35rem,4vw,2.45rem)] font-bold leading-[.96] tracking-[-.06em]">{currentSlide.title}<br /><span className="text-[#bf56ff]">{currentSlide.accent}</span>{currentSlide.rest && <> <span>{currentSlide.rest}</span></>}</h2>
            <p className="mt-3 max-w-[20rem] text-[.69rem] leading-relaxed text-white/70 sm:text-xs">{currentSlide.copy}</p>
            <button data-testid="button-hero-action" onClick={() => setNotice(`${currentSlide.action} seçildi`)} className="mt-4 flex w-fit items-center gap-2 rounded-lg bg-[linear-gradient(105deg,#a329ff,#6d20d8)] px-4 py-2.5 text-xs font-bold shadow-lg shadow-purple-950/30 transition-transform hover:-translate-y-0.5">{currentSlide.action}<ChevronRight size={15} /></button>
          </div>
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">{slides.map((item, index) => <button data-testid={`button-slide-dot-${index}`} aria-label={`${index + 1}. banner`} key={item.eyebrow} onClick={() => setSlide(index)} className={`h-1.5 rounded-full transition-all ${slide === index ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`} />)}</div>
          <button data-testid="button-banner-previous" aria-label="Önceki banner" onClick={() => changeSlide(-1)} className="absolute left-2 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:left-4"><ChevronLeft size={17} /></button>
          <button data-testid="button-banner-next" aria-label="Sonraki banner" onClick={() => changeSlide(1)} className="absolute right-2 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:right-4"><ChevronRight size={17} /></button>
        </section>

        <section className="mt-7 reveal reveal-delay-1">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-bold tracking-[-.02em]">Hızlı Erişim</h2><span className="font-mono text-[.6rem] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{selectedQuick}</span></div>
          <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-5 sm:gap-3">
            {quickItems.map(({ label, sublabel, icon: Icon, tone }) => <button data-testid={`button-quick-${label.toLowerCase()}`} key={label} onClick={() => handleQuickSelect(label)} className={`quick-card min-w-[7.5rem] flex-1 rounded-xl border px-3 py-3.5 text-center sm:min-w-0 ${selectedQuick === label ? 'border-[hsl(var(--primary)/.35)] bg-[hsl(var(--secondary))] shadow-sm' : 'border-[hsl(var(--border))] bg-white'}`}>
              <span className={`mx-auto mb-2 grid size-10 place-items-center rounded-xl ${tone === 'violet' ? 'bg-[#ead7ff] text-[#8739df]' : tone === 'amber' ? 'bg-[#ffedc8] text-[#e5a01c]' : tone === 'sky' ? 'bg-[#d7e9ff] text-[#4483e3]' : tone === 'mint' ? 'bg-[#d9f5de] text-[#4aae6b]' : 'bg-[#ffd9ef] text-[#e44da5]'}`}><Icon size={21} strokeWidth={2.2} /></span>
              <span className="block text-[.64rem] font-bold tracking-wide">{label}</span><span className="mt-1 block truncate text-[.56rem] text-[hsl(var(--muted-foreground))]">{sublabel}</span>
            </button>)}
          </div>
        </section>

        <section className="mt-7 rounded-2xl border border-[hsl(var(--border))] bg-white p-4 shadow-[0_8px_24px_rgba(77,46,128,.04)] sm:p-5 reveal reveal-delay-2">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative grid size-[4.2rem] shrink-0 place-items-center rounded-2xl bg-[radial-gradient(circle_at_35%_30%,#d4aaff,#8f36e7_67%,#6025ae)] text-white shadow-lg shadow-purple-200"><Sparkles className="absolute -right-2 -top-2 text-[#b85aff]" size={18} /><Trophy size={28} strokeWidth={1.7} /></div>
              <div><p className="font-mono text-[.58rem] font-bold tracking-[.13em] text-[hsl(var(--muted-foreground))]">TOPLULUK</p><h2 className="mt-1 font-display text-base font-bold">BİRLİKTE DAHA GÜÇLÜYÜZ!</h2><p className="mt-1 max-w-[22rem] text-[.68rem] leading-relaxed text-[hsl(var(--muted-foreground))]">Binlerce üye ile sohbet et, turnuvalara katıl, ödülleri kazan!</p><div className="mt-2 flex items-center gap-2"><div className="flex -space-x-1.5">{['A','B','C','D'].map((letter, index) => <span data-testid={`avatar-member-${index}`} key={letter} className={`grid size-5 place-items-center rounded-full border-2 border-white font-mono text-[.48rem] font-bold text-white ${['bg-[#32204e]','bg-[#bc5d81]','bg-[#e39a50]','bg-[#647ac5]'][index]}`}>{letter}</span>)}</div><span className="text-[.6rem] font-bold text-[hsl(var(--muted-foreground))]">+2.5K bugün aktif</span></div></div>
            </div>
            <div className="grid grid-cols-2 gap-7 border-t border-[hsl(var(--border))] pt-4 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0"><div><p className="text-[.57rem] font-bold text-[hsl(var(--muted-foreground))]">AKTİF ÜYE</p><strong className="font-display text-xl tracking-[-.06em]">12.548</strong><span className="ml-1 text-[.58rem] font-bold text-[#42a96a]">↑ 12%</span></div><div><p className="text-[.57rem] font-bold text-[hsl(var(--muted-foreground))]">BUGÜNKÜ AKTİVİTE</p><strong className="font-display text-xl tracking-[-.06em]">3.245</strong><span className="ml-1 text-[.58rem] font-bold text-[#42a96a]">↑ 8%</span></div></div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <section className="reveal reveal-delay-2">
            <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Megaphone size={16} className="text-[hsl(var(--primary))]" /><h2 className="font-display text-sm font-bold">DUYURULAR</h2></div><button data-testid="button-see-all-announcements" onClick={() => setNotice('Tüm duyurular görüntüleniyor')} className="flex items-center gap-1 text-[.65rem] font-bold text-[hsl(var(--primary))]">Tümünü Gör <ChevronRight size={14} /></button></div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {announcements.map(({ id, tag, title, copy, icon: Icon, color }) => <button data-testid={`button-${id}`} key={id} onClick={() => setSelectedAnnouncement(announcements.find((item) => item.id === id) ?? null)} className="group rounded-xl border border-[hsl(var(--border))] bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-100/70"><div className="mb-3 flex items-start justify-between"><span className={`rounded px-1.5 py-1 font-mono text-[.48rem] font-bold ${color === 'violet' ? 'bg-[#eadbff] text-[#8739df]' : color === 'amber' ? 'bg-[#fff0d2] text-[#cb8e0d]' : 'bg-[#dcecff] text-[#4684dd]'}`}>{tag}</span><span className={`grid size-8 place-items-center rounded-lg ${color === 'violet' ? 'bg-[#efe3ff] text-[#8e43db]' : color === 'amber' ? 'bg-[#fff0d2] text-[#d89817]' : 'bg-[#e1efff] text-[#508bdd]'}`}><Icon size={17} /></span></div><h3 className="text-xs font-bold">{title}</h3><p className="mt-1 line-clamp-2 text-[.62rem] leading-relaxed text-[hsl(var(--muted-foreground))]">{copy}</p><span className="mt-3 inline-flex items-center gap-1 text-[.59rem] font-bold text-[hsl(var(--primary))] opacity-0 transition-opacity group-hover:opacity-100">Detayı aç <ChevronRight size={12} /></span></button>)}
            </div>
          </section>

          <section className="reveal reveal-delay-3">
            <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays size={16} className="text-[hsl(var(--primary))]" /><h2 className="font-display text-sm font-bold">YAKLAŞAN ETKİNLİKLER</h2></div><button data-testid="button-see-all-events" onClick={() => setNotice('Tüm etkinlikler görüntüleniyor')} className="flex items-center gap-1 text-[.65rem] font-bold text-[hsl(var(--primary))]">Tüm Etkinlikler <ChevronRight size={14} /></button></div>
            <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-2">
              {upcomingEvents.map((event) => { const joined = joinedEvents.includes(event.id); return <article data-testid={`card-${event.id}`} key={event.id} className={`min-w-[14.5rem] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-white sm:min-w-[16rem] lg:min-w-0 ${event.tone === 'purple' ? 'bg-[linear-gradient(135deg,#f1e6ff,#fbf8ff)]' : event.tone === 'rose' ? 'bg-[linear-gradient(135deg,#fff0f8,#fffafe)]' : event.tone === 'blue' ? 'bg-[linear-gradient(135deg,#edf5ff,#f8fbff)]' : 'bg-[linear-gradient(135deg,#effbf3,#fafffb)]'}`}><div className="relative h-20 overflow-hidden p-3"><div className="absolute -right-2 -top-10 size-28 rounded-full border-[14px] border-white/40 opacity-70" /><span className={`relative rounded px-1.5 py-1 font-mono text-[.48rem] font-bold ${event.tone === 'purple' ? 'bg-[#dfc7ff] text-[#7434c2]' : event.tone === 'rose' ? 'bg-[#ffcce8] text-[#c73d88]' : event.tone === 'blue' ? 'bg-[#cfe2ff] text-[#3c77ce]' : 'bg-[#cfeeda] text-[#31894f]'}`}>{event.category}</span><div className="absolute bottom-2 right-3 text-[2.6rem] font-display font-bold leading-none text-white/70">{event.id.slice(-1)}</div></div><div className="p-3"><h3 className="font-display text-[.72rem] font-bold">{event.title}</h3><p className="mt-1 text-[.61rem] text-[hsl(var(--muted-foreground))]">{event.copy}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-[.52rem] font-semibold text-[hsl(var(--muted-foreground))]"><span className="inline-flex items-center gap-1"><CalendarDays size={11} />{event.date}</span><span className="inline-flex items-center gap-1"><Clock3 size={11} />{event.time}</span></div><button data-testid={`button-join-${event.id}`} onClick={() => toggleJoin(event.id)} className={`mt-3 flex min-h-9 w-full items-center justify-center gap-1 rounded-lg text-[.62rem] font-bold transition-colors ${joined ? 'bg-[#dff5e6] text-[#2e9650]' : 'bg-[hsl(var(--foreground))] text-white hover:bg-[hsl(var(--primary))]'}`}>{joined && <Check size={13} />}{joined ? 'Katıldın' : 'Katıl'}</button></div></article>; })}
            </div>
          </section>
        </div>
      </main>

      <button data-testid="button-floating-chat" aria-label="Sohbeti aç" onClick={() => setChatOpen(true)} className="pulse-orb fixed bottom-[5.7rem] right-4 z-30 grid size-12 place-items-center rounded-full bg-[linear-gradient(145deg,#a02bf3,#6321ca)] text-white shadow-[0_8px_25px_rgba(117,36,218,.4)] transition-transform hover:scale-105 sm:right-6 lg:bottom-7"><MessageCircle size={22} /><span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#ee4e84] font-mono text-[.53rem] font-bold text-white">5</span></button>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-[hsl(var(--border)/.9)] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(54,27,101,.07)] backdrop-blur-xl">
        <div className="mx-auto flex h-[4.35rem] max-w-[40rem] items-center justify-around px-2">
          {([{ label: 'Ana Sayfa', icon: HomeIcon }, { label: 'Sohbet', icon: MessageCircle }, { label: 'Enerji', icon: Zap }, { label: 'Oyunlar', icon: Gamepad2 }, { label: 'Profil', icon: UserRound }]).map(({ label, icon: Icon }) => <button data-testid={`button-nav-${label.toLowerCase().replace(' ', '-')}`} key={label} onClick={() => label === 'Enerji' ? setNotice('Enerji merkezindesin') : handleNav(label)} className={`relative flex min-w-[3.5rem] flex-col items-center justify-center gap-1 text-[.55rem] font-bold transition-colors ${activeNav === label ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{label === 'Enerji' ? <span className="grid size-11 -translate-y-3 place-items-center rounded-full bg-[linear-gradient(145deg,#a02bf3,#6321ca)] text-white shadow-[0_7px_18px_rgba(117,36,218,.35)]"><Icon size={21} fill="currentColor" /></span> : <Icon size={18} strokeWidth={activeNav === label ? 2.5 : 1.8} />}{label !== 'Enerji' && <span>{label}</span>}{label === 'Enerji' && <span className="-mt-2">ENERJİ</span>}{activeNav === label && label !== 'Enerji' && <span className="absolute -bottom-1 size-1 rounded-full bg-[hsl(var(--primary))]" />}</button>)}
        </div>
      </nav>

      {selectedAnnouncement && <div data-testid="modal-announcement" className="fixed inset-0 z-50 grid place-items-center bg-[#160c29]/45 p-4 backdrop-blur-sm" onClick={() => setSelectedAnnouncement(null)}><div className="w-full max-w-md rounded-2xl border border-white/50 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-start justify-between"><div><span className="font-mono text-[.57rem] font-bold tracking-[.14em] text-[hsl(var(--primary))]">{selectedAnnouncement.tag}</span><h2 className="mt-1 font-display text-xl font-bold">{selectedAnnouncement.title}</h2></div><button data-testid="button-close-announcement" aria-label="Duyuruyu kapat" onClick={() => setSelectedAnnouncement(null)} className="grid size-9 place-items-center rounded-lg bg-[hsl(var(--muted))]"><X size={17} /></button></div><p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{selectedAnnouncement.copy}</p><button data-testid="button-announcement-done" onClick={() => { setSelectedAnnouncement(null); setNotice('Duyuru okundu olarak işaretlendi'); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--foreground))] py-3 text-sm font-bold text-white">Anladım <Check size={16} /></button></div></div>}

      {chatOpen && <div data-testid="panel-chat" className="fixed bottom-[5.7rem] right-2 z-40 flex h-[min(38rem,calc(100dvh-8rem))] w-[min(25rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[1.35rem] border border-[hsl(var(--border))] bg-white shadow-[0_18px_60px_rgba(55,22,104,.25)] sm:bottom-7 sm:right-6">
        <div className="flex shrink-0 items-center justify-between bg-[linear-gradient(105deg,#281043,#6820ae)] px-4 py-3 text-white">
          <div className="flex min-w-0 items-center gap-3"><div className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/20"><UsersRound size={19} /><span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#54208b] bg-[#63dd89]" /></div><div className="min-w-0"><p className="truncate font-display text-sm font-bold">MOD Sohbet</p><p className="text-[.63rem] text-white/65">2.548 üye · 184 çevrimiçi</p></div></div>
          <div className="flex items-center gap-0.5"><button data-testid="button-chat-video" aria-label="Görüntülü görüşme" onClick={() => setNotice('Görüntülü görüşme yakında')} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><Video size={17} /></button><button data-testid="button-chat-call" aria-label="Sesli görüşme" onClick={() => setNotice('Sesli görüşme yakında')} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><Phone size={17} /></button><button data-testid="button-chat-more" aria-label="Sohbet seçenekleri" onClick={() => setNotice('Sohbet seçenekleri')} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><MoreVertical size={18} /></button><button data-testid="button-close-chat" aria-label="Sohbeti kapat" onClick={() => setChatOpen(false)} className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"><X size={18} /></button></div>
        </div>
        <div ref={chatScrollRef} data-testid="chat-messages" className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4 flex justify-center"><span className="rounded-full bg-white/80 px-3 py-1 font-mono text-[.52rem] font-bold tracking-[.12em] text-[hsl(var(--muted-foreground))] shadow-sm">BUGÜN</span></div>
          <div className="space-y-3">
            {chatMessages.map((message) => <div key={message.id} className={`group flex items-end gap-2 ${message.mine ? 'justify-end' : 'justify-start'}`} onPointerDown={(event) => { event.currentTarget.dataset.startX = String(event.clientX); }} onPointerUp={(event) => { const startX = Number(event.currentTarget.dataset.startX ?? event.clientX); if (event.clientX - startX > 45) setReplyTo(message); }}>
              {!message.mine && <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-[.52rem] font-bold ${message.avatar}`}>{message.initials}</span>}
              <div className={`relative max-w-[82%] ${message.mine ? 'items-end' : 'items-start'}`}>
                {!message.mine && <p className="mb-1 ml-1 text-[.58rem] font-bold text-[hsl(var(--primary))]">{message.author}</p>}
                <div className={`rounded-2xl px-3 py-2 shadow-sm ${message.mine ? 'rounded-br-md bg-[linear-gradient(135deg,#8b35e4,#6a22c2)] text-white' : 'rounded-bl-md border border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))]'}`}>
                  {message.replyTo && <div className={`mb-2 rounded-lg border-l-2 px-2 py-1.5 text-[.6rem] ${message.mine ? 'border-white/60 bg-white/10 text-white/75' : 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'}`}><strong className="block text-[.56rem]">{message.replyTo.author}</strong><span className="line-clamp-1">{message.replyTo.message}</span></div>}
                  <p className="text-[.72rem] leading-relaxed">{message.message}</p>
                  <div className={`mt-1 flex items-center justify-end gap-1 text-[.51rem] ${message.mine ? 'text-white/65' : 'text-[hsl(var(--muted-foreground))]'}`}><span>{message.time}</span>{message.mine && <CheckCheck size={13} />}</div>
                </div>
                <button type="button" onClick={() => setReplyTo(message)} className={`absolute -bottom-3 ${message.mine ? '-left-8' : '-right-8'} grid size-7 place-items-center rounded-full border border-[hsl(var(--border))] bg-white text-[hsl(var(--muted-foreground))] opacity-0 shadow-sm transition-opacity hover:text-[hsl(var(--primary))] group-hover:opacity-100`} aria-label={`${message.author} mesajını yanıtla`}><Reply size={13} /></button>
              </div>
              {message.mine && <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-[.52rem] font-bold ${message.avatar}`}>{message.initials}</span>}
            </div>)}
          </div>
          <div className="mt-5 flex justify-center"><span className="rounded-full bg-[#fff4d9] px-3 py-1 text-[.57rem] font-semibold text-[#9c761b]">Kaydırarak veya oka basarak cevapla</span></div>
        </div>
        {replyTo && <div className="flex shrink-0 items-center gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-3 py-2"><Reply size={15} className="shrink-0 text-[hsl(var(--primary))]" /><div className="min-w-0 flex-1 border-l-2 border-[hsl(var(--primary))] pl-2"><p className="text-[.59rem] font-bold text-[hsl(var(--primary))]">{replyTo.author} yanıtlanıyor</p><p className="truncate text-[.63rem] text-[hsl(var(--muted-foreground))]">{replyTo.message}</p></div><button type="button" aria-label="Yanıtlamayı iptal et" onClick={() => setReplyTo(null)} className="grid size-7 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-white"><X size={14} /></button></div>}
        <div className="relative shrink-0 border-t border-[hsl(var(--border))] bg-white p-2.5">
          {emojiPickerOpen && <div data-testid="panel-emoji-picker" className="absolute bottom-[4.35rem] left-2 z-10 grid w-[min(18rem,calc(100vw-2rem))] grid-cols-6 gap-1 rounded-2xl border border-[hsl(var(--border))] bg-white p-2.5 shadow-[0_12px_35px_rgba(56,25,107,.18)]">{chatEmojis.map((emoji) => <button type="button" key={emoji} onClick={() => { setChatText((current) => `${current}${emoji}`); chatInputRef.current?.focus(); }} className="grid size-9 place-items-center rounded-lg text-xl transition-colors hover:bg-[hsl(var(--muted))]">{emoji}</button>)}</div>}
          <form className="flex items-end gap-1.5" onSubmit={(event) => { event.preventDefault(); sendChat(); }}>
            <button type="button" aria-label="Dosya ekle" onClick={() => setNotice('Dosya ekleme yakında')} className="grid size-10 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--primary))]"><Paperclip size={18} /></button>
            <button type="button" aria-label="Görsel ekle" onClick={() => setNotice('Görsel paylaşımı yakında')} className="hidden size-10 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--primary))] sm:grid"><ImagePlus size={18} /></button>
            <div className="flex min-h-10 min-w-0 flex-1 items-end rounded-2xl bg-[hsl(var(--muted)/.7)] px-3 py-1"><textarea ref={chatInputRef} data-testid="input-chat" rows={1} value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } }} placeholder="Mesaj yaz..." className="max-h-24 min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[.72rem] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))]" /><button type="button" aria-label="Emoji seç" onClick={() => setEmojiPickerOpen((open) => !open)} className="grid size-8 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><Smile size={18} /></button></div>
            <button data-testid="button-send-chat" aria-label="Mesaj gönder" type="submit" disabled={!chatText.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-white shadow-md shadow-violet-200 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35"><Send size={16} /></button>
          </form>
          <p className="mt-1 hidden pl-12 text-[.52rem] text-[hsl(var(--muted-foreground))] sm:block">Enter gönderir · Shift + Enter yeni satır</p>
        </div>
      </div>}
    </div>
  );
}

const installSteps = ['Hoş geldin', 'Veritabanı kurulumu', 'Admin hesabı', 'MOD CLUB ayarları', 'Tema seçimi', 'Kurulum tamamlandı'];

function InstallWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [clubName, setClubName] = useState('MOD CLUB');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [theme, setTheme] = useState('electric');
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('mod-club-installed') === 'true');

  const finishInstall = () => {
    window.localStorage.setItem('mod-club-installed', 'true');
    window.localStorage.setItem('mod-club-settings', JSON.stringify({ clubName, adminName, adminEmail, theme }));
    setInstalled(true);
    setStep(5);
  };

  if (installed) {
    return (
      <div className="install-page grain min-h-[100dvh] px-4 py-8 sm:px-6">
        <div className="install-card mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col justify-center rounded-[2rem] border border-[hsl(var(--border))] bg-white p-6 shadow-[0_24px_80px_rgba(81,38,145,.12)] sm:p-10">
          <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-[#e0f7e8] text-[#2caa5a]"><ShieldCheck size={32} /></div>
          <p className="font-mono text-[.65rem] font-bold tracking-[.18em] text-[hsl(var(--primary))]">MOD CLUB KURULUMU</p>
          <h1 className="mt-2 font-display text-[clamp(2rem,5vw,3.25rem)] font-bold tracking-[-.07em]">Kurulum kilitli.</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Bu MOD CLUB kurulumu daha önce tamamlandı. Güvenliğin için kurulum sihirbazı tekrar çalıştırılamaz.</p>
          <button onClick={() => setLocation('/')} className="mt-8 flex min-h-12 w-fit items-center gap-2 rounded-xl bg-[hsl(var(--foreground))] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5">Ana sayfaya dön <ChevronRight size={16} /></button>
        </div>
      </div>
    );
  }

  const canContinue = step !== 2 || (adminName.trim().length > 1 && adminEmail.includes('@'));
  return (
    <div className="install-page grain min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-10">
      <div className="install-card mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[hsl(var(--border))] bg-white shadow-[0_24px_80px_rgba(81,38,145,.12)]">
        <div className="grid lg:grid-cols-[.75fr_1.25fr]">
          <aside className="install-aside p-6 text-white sm:p-10 lg:p-12">
            <button onClick={() => setLocation('/')} className="flex items-center gap-1 text-left"><span className="font-display text-xl font-bold tracking-[-.08em] text-[#d98cff]">MOD</span><span className="font-display text-lg font-bold tracking-[-.07em]">CLUB</span></button>
            <div className="mt-14 lg:mt-24"><p className="font-mono text-[.62rem] font-bold tracking-[.18em] text-[#dba9ff]">KURULUM SİHİRBAZI</p><h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.8rem)] font-bold leading-[.95] tracking-[-.07em]">Kulübünü<br /><span className="text-[#c25aff]">enerjiyle</span> başlat.</h1><p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">Birkaç kısa adımda MOD CLUB deneyimini kendi topluluğun için hazırla.</p></div>
            <div className="mt-12 hidden space-y-3 lg:block">{installSteps.map((label, index) => <div key={label} className={`flex items-center gap-3 text-xs ${index === step ? 'font-bold text-white' : index < step ? 'text-[#d49dff]' : 'text-white/40'}`}><span className={`grid size-7 place-items-center rounded-full border text-[.65rem] ${index < step ? 'border-[#b858ff] bg-[#9e3be5]' : index === step ? 'border-white bg-white/15' : 'border-white/20'}`}>{index < step ? <Check size={14} /> : index + 1}</span>{label}</div>)}</div>
          </aside>
          <section className="p-6 sm:p-10 lg:p-14">
            <div className="mb-8 flex items-center justify-between lg:hidden"><span className="font-mono text-[.62rem] font-bold tracking-[.16em] text-[hsl(var(--muted-foreground))]">ADIM {step + 1} / 6</span><div className="h-1.5 w-28 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${((step + 1) / installSteps.length) * 100}%` }} /></div></div>
            {step === 0 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Sparkles size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 01</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Hoş geldin.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">MOD CLUB, topluluğunu tek bir yerde buluşturmak için hazır. Kurulum yaklaşık iki dakika sürer.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-4"><Server size={18} className="text-[hsl(var(--primary))]" /><p className="mt-3 text-sm font-bold">Bağımsız yapı</p><p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Herhangi bir platforma bağlı kalmadan çalışır.</p></div><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] p-4"><ShieldCheck size={18} className="text-[hsl(var(--primary))]" /><p className="mt-3 text-sm font-bold">Güvenli başlangıç</p><p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Ayarlarını yalnızca senin cihazında saklar.</p></div></div></div>}
            {step === 1 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#e8f1ff] text-[#4b86dc]"><Server size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 02</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Veritabanı hazır.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Bağımsız kurulum için yerel veri alanı oluşturuldu. İstersen daha sonra sunucu ayarlarından harici bir PostgreSQL bağlantısına geçebilirsin.</p><div className="mt-8 flex items-center gap-3 rounded-xl border border-[#ccebd5] bg-[#f0fcf4] p-4 text-sm font-semibold text-[#2f9650]"><Check size={18} /> Yerel veri alanı bağlantısı başarılı</div></div>}
            {step === 2 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#fff0d8] text-[#d48a1b]"><UserRound size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 03</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Admin hesabını oluştur.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Kulübünü yönetmek için ilk yönetici bilgilerini gir.</p><div className="mt-7 grid gap-4"><label className="grid gap-2 text-xs font-bold">Ad soyad<input value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="Örn. Ece Yılmaz" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label><label className="grid gap-2 text-xs font-bold">E-posta<input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@modclub.com" className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label></div></div>}
            {step === 3 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#f1e2ff] text-[#913be0]"><Palette size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 04</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Kulübünü tanımla.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Üyelerin göreceği kulüp adını belirle.</p><label className="mt-7 grid gap-2 text-xs font-bold">Kulüp adı<input value={clubName} onChange={(event) => setClubName(event.target.value)} className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] px-4 text-sm font-normal outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.15)]" /></label></div>}
            {step === 4 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#fce5f3] text-[#d44397]"><Palette size={27} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[hsl(var(--primary))]">ADIM 05</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">Enerjini seç.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">MOD CLUB’ın temel görünümünü belirle. Bunu daha sonra ayarlardan değiştirebilirsin.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => setTheme('electric')} className={`rounded-2xl border p-4 text-left transition-all ${theme === 'electric' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] ring-2 ring-[hsl(var(--primary)/.15)]' : 'border-[hsl(var(--border))]'}`}><span className="mb-5 block h-16 rounded-xl bg-[linear-gradient(135deg,#18052e,#9e36ed)]" /><p className="text-sm font-bold">Electric Violet</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Varsayılan MOD enerjisi</p></button><button onClick={() => setTheme('midnight')} className={`rounded-2xl border p-4 text-left transition-all ${theme === 'midnight' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] ring-2 ring-[hsl(var(--primary)/.15)]' : 'border-[hsl(var(--border))]'}`}><span className="mb-5 block h-16 rounded-xl bg-[linear-gradient(135deg,#071125,#1c5b9e)]" /><p className="text-sm font-bold">Midnight Blue</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Daha sakin topluluk modu</p></button></div></div>}
            {step === 5 && <div className="wizard-step"><div className="grid size-14 place-items-center rounded-2xl bg-[#e0f7e8] text-[#2caa5a]"><Check size={30} /></div><p className="mt-8 font-mono text-[.65rem] font-bold tracking-[.16em] text-[#2caa5a]">HAZIR</p><h2 className="mt-2 font-display text-3xl font-bold tracking-[-.06em] sm:text-4xl">MOD CLUB yayında.</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Kurulum tamamlandı. Artık topluluğunu büyütmeye ve ilk etkinliğini oluşturmaya hazırsın.</p><div className="mt-8 flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4 text-sm"><LockKeyhole size={18} className="text-[hsl(var(--primary))]" /><span><strong className="block">Kurulum kilitlendi</strong><small className="text-xs text-[hsl(var(--muted-foreground))]">Ayarların güvenle kaydedildi.</small></span></div></div>}
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-6"><button onClick={() => step === 0 ? setLocation('/') : setStep((current) => current - 1)} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">{step === 0 ? 'Çıkış' : 'Geri'}</button>{step < 5 ? <button disabled={!canContinue} onClick={() => step === 4 ? finishInstall() : setStep((current) => current + 1)} className="flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--foreground))] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{step === 4 ? 'Kurulumu tamamla' : 'Devam et'} <ChevronRight size={16} /></button> : <button onClick={() => setLocation('/')} className="flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5">Ana sayfaya geç <ChevronRight size={16} /></button>}</div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary resetKey={useLocation()[0]}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/install" component={InstallWizard} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
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