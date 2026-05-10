import { useEffect } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export function useThemeBridge(
  bridge: OkDesktopBridge | undefined,
  themeValue: string | undefined,
): void {
  useEffect(() => {
    if (themeValue !== 'light' && themeValue !== 'dark' && themeValue !== 'system') return;
    if (!bridge) return;
    let cancelled = false;
    bridge
      .setThemeSource(themeValue)
      .catch((err: unknown) => {
        console.warn(
          JSON.stringify({
            event: 'theme-source-set-failed',
            themeValue,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      })
      .finally(() => {
        if (cancelled) return;
        const reducedTransparency = window.matchMedia(
          '(prefers-reduced-transparency: reduce)',
        ).matches;
        bridge.signalThemeApplied({ reducedTransparency });
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, themeValue]);

  useEffect(() => {
    if (!bridge) return;
    const mql = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const handler = (event: MediaQueryListEvent) => {
      bridge.signalThemeApplied({ reducedTransparency: event.matches });
    };
    mql.addEventListener('change', handler);
    return () => {
      mql.removeEventListener('change', handler);
    };
  }, [bridge]);
}
