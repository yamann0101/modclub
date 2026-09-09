const MUTE_KEY = 'mod-club-chat-muted';
const DEVICE_KEY = 'mod-club-device-id';
const ASKED_KEY = 'mod-club-notify-prompt';
const PUSH_KEY = 'mod-club-push-on';
const CHAT_READ_KEY = 'mod-club-chat-read';

const NOTIFY_CHANNEL = 'mod-club-notify';

export type NotifyPayload = {
  id?: string;
  type: 'giveaway' | 'chat' | 'winner' | 'admin' | 'guess';
  title: string;
  body: string;
  sender?: string;
  from?: string;
};

export function getDeviceId() {
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function isChatMuted() {
  return window.localStorage.getItem(MUTE_KEY) === 'true';
}

export function setChatMuted(muted: boolean) {
  window.localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
  void syncClubPush();
}

export function wasNotifyPrompted() {
  const raw = window.localStorage.getItem(ASKED_KEY);
  if (!raw) return false;
  if (raw === 'true') return true;
  const at = Number(raw);
  if (!Number.isFinite(at)) return true;
  // 8 saatte bir tekrar hatırlat (izin default ise)
  return Date.now() - at < 8 * 60 * 60 * 1000;
}

export function markNotifyPrompted() {
  window.localStorage.setItem(ASKED_KEY, String(Date.now()));
}

export function shouldAskNotify() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return false;
  if (Notification.permission === 'denied') return false;
  return !wasNotifyPrompted();
}

export function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function loadChatReadAt() {
  try {
    const raw = Number(window.localStorage.getItem(CHAT_READ_KEY));
    if (Number.isFinite(raw) && raw > 0) return raw;
  } catch { /* ignore */ }
  const now = Date.now();
  try { window.localStorage.setItem(CHAT_READ_KEY, String(now)); } catch { /* ignore */ }
  return now;
}

export function saveChatReadAt(value: number) {
  try { window.localStorage.setItem(CHAT_READ_KEY, String(value)); } catch { /* ignore */ }
}

export function hasClubPush() {
  return window.localStorage.getItem(PUSH_KEY) === '1';
}

export async function registerClubWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await registration.update().catch(() => undefined);
    return registration;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function syncClubPush() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const registration = await registerClubWorker();
  if (!registration) return false;
  try {
    await navigator.serviceWorker.ready;
    const data = await fetch('/api/notify/key', { credentials: 'include' }).then((res) => res.json()) as { key?: string };
    if (!data.key) return false;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
    }
    const ok = await fetch('/api/notify/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        deviceId: getDeviceId(),
        chatMuted: isChatMuted(),
      }),
    });
    if (ok.ok) {
      window.localStorage.setItem(PUSH_KEY, '1');
      return true;
    }
  } catch {
    window.localStorage.removeItem(PUSH_KEY);
  }
  return false;
}

export async function requestNotifyPermission() {
  markNotifyPrompted();
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return result;
  }
  await registerClubWorker();
  await syncClubPush();
  return 'granted';
}

function playNotifySound() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.1;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.38);
    oscillator.stop(context.currentTime + 0.4);
  } catch {
    /* ignore */
  }
}

function notifyTag(payload: NotifyPayload) {
  if (payload.id) return payload.type === 'chat' ? `chat-${payload.id}` : `${payload.type}-${payload.id}`;
  return payload.type === 'chat' ? `chat-${Date.now()}` : `${payload.type}-${payload.title}`;
}

export async function showLocalNotice(payload: NotifyPayload, options?: { sound?: boolean }) {
  if (payload.type === 'chat' && isChatMuted()) return;
  if (options?.sound !== false && (payload.type === 'admin' || payload.type === 'guess' || payload.type === 'chat')) {
    playNotifySound();
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker?.ready.catch(() => undefined);
  const data = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [240, 90, 240, 90, 360],
    silent: false,
    tag: notifyTag(payload),
    renotify: true,
    requireInteraction: payload.type === 'admin' || payload.type === 'chat',
    timestamp: Date.now(),
    data: { url: payload.type === 'chat' || payload.type === 'guess' ? '/?chat=1' : '/' },
  } as NotificationOptions;
  if (registration?.showNotification) {
    await registration.showNotification(payload.title, data);
    return;
  }
  new Notification(payload.title, data);
}

function postNotifyChannel(payload: NotifyPayload & { sender?: string; at?: number }) {
  try {
    const channel = new BroadcastChannel(NOTIFY_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    /* tarayıcı desteklemiyorsa yok say */
  }
}

export async function publishClubEvent(payload: NotifyPayload) {
  const sender = payload.sender ?? getDeviceId();
  if (payload.type !== 'chat') {
    await showLocalNotice(payload);
  }
  postNotifyChannel({ ...payload, sender, at: Date.now() });
  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sender }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type NotifyGate = {
  /** sohbet açık ve ekran görünürken chat bildirimi basma */
  shouldNotifyChat?: () => boolean;
};

export function startNotifyPolling(onRemote: (payload: NotifyPayload) => void, gate?: NotifyGate) {
  let since = Date.now();
  const device = getDeviceId();
  let channel: BroadcastChannel | null = null;

  const deliver = async (event: NotifyPayload) => {
    if (event.sender && event.sender === device) return;
    if (event.type === 'chat' && isChatMuted()) {
      onRemote(event);
      return;
    }
    onRemote(event);

    const chatOk = event.type !== 'chat' || !gate?.shouldNotifyChat || gate.shouldNotifyChat();
    if (!chatOk) return;

    const pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    // Push abonesi olsa bile: kilit/arka plan veya sohbet kapalıyken yerel OS bildirimi de bas
    // (aynı tag ile push ile birleşir — çift spam olmaz)
    if (pageHidden || !hasClubPush() || event.type === 'chat' || event.type === 'admin') {
      await showLocalNotice(event);
    }
  };

  try {
    channel = new BroadcastChannel(NOTIFY_CHANNEL);
    channel.onmessage = (message) => {
      const event = message.data as NotifyPayload | undefined;
      if (!event?.title || !event.body) return;
      void deliver(event);
    };
  } catch {
    channel = null;
  }

  const tick = async () => {
    try {
      const response = await fetch(`/api/notify?since=${since}`, { credentials: 'include' });
      if (!response.ok) return;
      const data = (await response.json()) as { events?: Array<NotifyPayload & { at: number; sender?: string; id?: string }> };
      for (const event of data.events ?? []) {
        since = Math.max(since, event.at);
        await deliver(event);
      }
    } catch {
      /* sessiz */
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncClubPush();
  };
  document.addEventListener('visibilitychange', onVisible);

  const timer = window.setInterval(tick, 2500);
  const pushTimer = window.setInterval(() => { void syncClubPush(); }, 45000);
  void tick();
  void syncClubPush();
  return () => {
    window.clearInterval(timer);
    window.clearInterval(pushTimer);
    document.removeEventListener('visibilitychange', onVisible);
    channel?.close();
  };
}
