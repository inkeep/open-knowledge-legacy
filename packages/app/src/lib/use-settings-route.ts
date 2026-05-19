import { startTransition, useEffect, useState } from 'react';

export const SETTINGS_OPEN_HASH = '#settings';

interface SettingsRouteState {
  open: boolean;
  close: () => void;
}

interface ShortcutEventLike {
  target: { tagName?: string; isContentEditable?: boolean } | null;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  key: string;
}

export function isSettingsShortcut(e: ShortcutEventLike): boolean {
  const target = e.target;
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
    return false;
  }
  const modKey = e.metaKey || e.ctrlKey;
  return Boolean(modKey && !e.altKey && e.key === ',');
}

export function isSettingsHashOpen(hash: string): boolean {
  const cleaned = hash.replace(/^#/, '');
  return cleaned === 'settings';
}

function readCurrentHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}

export function useSettingsRoute(): SettingsRouteState {
  const [open, setOpen] = useState<boolean>(() => isSettingsHashOpen(readCurrentHash()));

  useEffect(() => {
    const onHashChange = () => {
      startTransition(() => {
        setOpen(isSettingsHashOpen(readCurrentHash()));
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const close = () => {
    if (typeof window === 'undefined') return;
    if (!isSettingsHashOpen(readCurrentHash())) return;
    window.history.back();
  };

  return { open, close };
}
