import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __mcPwa?: { event: BeforeInstallPromptEvent | null };
  }
}

export function isPwaInstalled() {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches;
  const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return standalone || iosStandalone;
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroidDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

function savedPrompt() {
  return window.__mcPwa?.event || null;
}

export function usePwaInstall() {
  const [installed, setInstalled] = useState(() => isPwaInstalled());
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => savedPrompt());
  const [guide, setGuide] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    if (isPwaInstalled()) {
      setInstalled(true);
      return;
    }

    const take = () => {
      const event = savedPrompt();
      if (event) setDeferred(event);
    };
    take();

    const onPrompt = (event: Event) => {
      event.preventDefault();
      const next = event as BeforeInstallPromptEvent;
      if (window.__mcPwa) window.__mcPwa.event = next;
      setDeferred(next);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setGuide(null);
      if (window.__mcPwa) window.__mcPwa.event = null;
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const timer = window.setInterval(take, 800);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearInterval(timer);
    };
  }, []);

  const install = async () => {
    const event = deferred || savedPrompt();
    if (event) {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setDeferred(null);
      if (window.__mcPwa) window.__mcPwa.event = null;
      setGuide(null);
      return;
    }
    if (isIosDevice()) {
      setGuide('ios');
      return;
    }
    setGuide('android');
  };

  return {
    visible: !installed,
    installed,
    guide,
    ios: isIosDevice(),
    android: isAndroidDevice(),
    install,
    hideGuide: () => setGuide(null),
  };
}
