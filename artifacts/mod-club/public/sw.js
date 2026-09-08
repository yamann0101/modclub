self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'MOD CLUB', body: '', url: '/', tag: `n-${Date.now()}`, type: 'admin' };
  try {
    const parsed = event.data ? event.data.json() : {};
    data = { ...data, ...parsed };
  } catch {
    try {
      const text = event.data ? event.data.text() : '';
      if (text) data.body = text;
    } catch { /* ignore */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MOD CLUB', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [220, 80, 220, 80, 320],
      silent: false,
      renotify: true,
      requireInteraction: data.type === 'admin',
      tag: data.tag || `n-${Date.now()}`,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && target) client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'notify') return;
  event.waitUntil(
    self.registration.showNotification(data.title || 'MOD CLUB', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [220, 80, 220],
      silent: false,
      tag: data.tag || 'mod-club',
      renotify: true,
    }),
  );
});
