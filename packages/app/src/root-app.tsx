import { lazy, type ReactNode, Suspense } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { App } from './App';

export function loadNavigatorAppModule() {
  return import('@/components/NavigatorApp');
}

const LazyNavigatorApp = lazy(async () => {
  const mod = await loadNavigatorAppModule();
  return { default: mod.NavigatorApp };
});

export function isNavigatorDesktopBridge(
  bridge?: OkDesktopBridge | null,
): bridge is OkDesktopBridge {
  return bridge?.config.mode === 'navigator';
}

interface RootAppProps {
  bridge?: OkDesktopBridge | null;
  navigatorFallback?: ReactNode;
}

export function RootApp({ bridge = globalThis.okDesktop, navigatorFallback = null }: RootAppProps) {
  if (!isNavigatorDesktopBridge(bridge)) {
    return <App />;
  }

  return (
    <Suspense fallback={navigatorFallback}>
      <LazyNavigatorApp bridge={bridge} />
    </Suspense>
  );
}
