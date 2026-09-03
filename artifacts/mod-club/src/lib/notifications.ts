const MUTE_KEY = 'mod-club-chat-muted';
const DEVICE_KEY = 'mod-club-device-id';
const ASKED_KEY = 'mod-club-notify-prompt';

const NOTIFY_CHANNEL = 'mod-club-notify';

export type NotifyPayload = {
  type: 'giveaway' | 'chat' | 'winner' | 'admin';
  title: string;
  body: string;
  sender?: string;
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
}

export function wasNotifyPrompted() {
  return window.localStorage.getItem(ASKED_KEY) === 'true';
}

export function markNotifyPrompted() {
  window.localStorage.setItem(ASKED_KEY, 'true');
}

export function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function registerClubWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function requestNotifyPermission() {
  markNotifyPrompted();
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') {
    await registerClubWorker();
    return 'granted';
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    await registerClubWorker();
  }
  return result;
}

function playNotifySound() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.stop(context.currentTime + 0.3);
  } catch {
    /* ignore */
  }
}

export async function showLocalNotice(payload: NotifyPayload, options?: { sound?: boolean }) {
  if (payload.type === 'chat' && isChatMuted()) return;
  if (options?.sound !== false && (payload.type === 'admin' || (payload.type === 'chat' && !isChatMuted()))) {
    playNotifySound();
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker?.ready.catch(() => undefined);
  const data = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `${payload.type}-${payload.title}`,
    renotify: true,
    data: { url: '/' },
  };
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sender }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function startNotifyPolling(onRemote: (payload: NotifyPayload) => void) {
  let since = Date.now();
  const device = getDeviceId();
  let channel: BroadcastChannel | null = null;

  const deliver = async (event: NotifyPayload, fromPoll: boolean) => {
    if (fromPoll && event.sender && event.sender === device) return;
    onRemote(event);
    await showLocalNotice(event);
  };

  try {
    channel = new BroadcastChannel(NOTIFY_CHANNEL);
    channel.onmessage = (message) => {
      const event = message.data as NotifyPayload | undefined;
      if (!event?.title || !event.body) return;
      void deliver(event, false);
    };
  } catch {
    channel = null;
  }

  const tick = async () => {
    try {
      const response = await fetch(`/api/notify?since=${since}`);
      if (!response.ok) return;
      const data = (await response.json()) as { events?: Array<NotifyPayload & { at: number; sender?: string }> };
      for (const event of data.events ?? []) {
        since = Math.max(since, event.at);
        await deliver(event, true);
      }
    } catch {
      /* sessiz */
    }
  };

  const timer = window.setInterval(tick, 4000);
  void tick();
  return () => {
    window.clearInterval(timer);
    channel?.close();
  };
}
