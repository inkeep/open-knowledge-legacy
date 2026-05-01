
import { useEffect, useState } from 'react';

export type SettingsScope = 'project' | 'user';

export const SETTINGS_OPEN_HASH = '#settings';

interface SettingsRouteState {
  scope: SettingsScope | null;
  close: () => void;
  setScope: (next: SettingsScope) => void;
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

export function parseSettingsHash(hash: string): SettingsScope | null {
  const cleaned = hash.replace(/^#/, '');
  if (cleaned === 'settings' || cleaned === 'settings/project') return 'project';
  if (cleaned === 'settings/user') return 'user';
  return null;
}

export function settingsHash(scope: SettingsScope): string {
  return `#settings/${scope}`;
}

function readCurrentHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}

export function useSettingsRoute(): SettingsRouteState {
  const [scope, setScopeState] = useState<SettingsScope | null>(() =>
    parseSettingsHash(readCurrentHash()),
  );

  useEffect(() => {
    const onHashChange = () => {
      setScopeState(parseSettingsHash(readCurrentHash()));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const close = () => {
    if (typeof window === 'undefined') return;
    if (parseSettingsHash(readCurrentHash()) === null) return;
    window.history.back();
  };

  const setScope = (next: SettingsScope) => {
    if (typeof window === 'undefined') return;
    const nextHash = settingsHash(next);
    if (window.location.hash === nextHash) return;
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}${nextHash}`);
    setScopeState(next);
  };

  return { scope, close, setScope };
}
