/**
 * Hash-based routing for the Settings pane (D54 / FR-1 / US-009).
 *
 * Recognized hash forms:
 *   `#settings`             → workspace tab (canonical synonym for `#settings/workspace`)
 *   `#settings/workspace`   → workspace tab
 *   `#settings/user`        → user tab
 *
 * Closing the pane navigates back via `history.back()` so the prior doc hash
 * is restored when settings was opened from a doc view. If the prior history
 * entry isn't part of this session (deep link), `history.back()` exits the
 * SPA — accepted v0 trade-off; users can press Forward to return.
 *
 * Sibling pattern to `NavigationHandler` and `InstallInClaudeDesktopTrigger`
 * in `App.tsx`: hash IS the route state; entry points (Cmd-,, App menu, etc.)
 * mutate the hash; this hook reads it.
 */

import { useEffect, useState } from 'react';

export type SettingsScope = 'workspace' | 'user';

interface SettingsRouteState {
  /** The active sub-tab when the pane is open; `null` when the pane is closed. */
  scope: SettingsScope | null;
  /** Close the pane via `history.back()`. No-op when the pane is closed. */
  close: () => void;
  /** Switch sub-tab while the pane is open; updates the hash without adding history. */
  setScope: (next: SettingsScope) => void;
}

export function parseSettingsHash(hash: string): SettingsScope | null {
  const cleaned = hash.replace(/^#/, '');
  if (cleaned === 'settings' || cleaned === 'settings/workspace') return 'workspace';
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
    // Use replaceState to switch sub-tabs without polluting history — the
    // user pressing Back should return to the prior doc view, not the
    // prior sub-tab.
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}${nextHash}`);
    setScopeState(next);
  };

  return { scope, close, setScope };
}
