export type PublicSetup = {
  installed: boolean;
  clubName: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
  theme: string;
};

export function isLocalApp() {
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function cachePublicSetup(data: PublicSetup) {
  const current = (() => {
    try {
      const raw = window.localStorage.getItem('mod-club-settings');
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  })();
  window.localStorage.setItem('mod-club-installed', 'true');
  window.localStorage.setItem('mod-club-settings', JSON.stringify({
    clubName: data.clubName || current.clubName || 'MOD CLUB',
    adminName: data.adminName || current.adminName || '',
    adminEmail: data.adminEmail || current.adminEmail || '',
    adminUsername: data.adminUsername || current.adminUsername || '',
    adminPassword: current.adminPassword || '',
    theme: data.theme || current.theme || 'electric',
  }));
}

export async function fetchPublicSetup(): Promise<PublicSetup | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const response = await fetch('/api/setup', { signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return null;
    return (await response.json()) as PublicSetup;
  } catch {
    return null;
  }
}

export async function saveServerSetup(settings: {
  clubName: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  theme: string;
}) {
  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error('setup_failed');
  }
  return (await response.json()) as PublicSetup;
}

export async function loginServerAdmin(username: string, password: string) {
  try {
    const response = await fetch('/api/setup/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { username: string; nick: string; name: string; role: 'ADMIN' };
  } catch {
    return null;
  }
}
