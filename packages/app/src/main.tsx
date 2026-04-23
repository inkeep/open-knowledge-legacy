import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NavigatorApp } from '@/components/NavigatorApp';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
// Side-effect import to load the `Window.okDesktop?` global augmentation.
import '@/lib/desktop-bridge-types';
import { installDesktopFetchRewrite } from '@/lib/desktop-fetch';
import { installDeepLinkListener } from '@/lib/install-deep-link-listener';
import { installGitInitToast } from '@/lib/install-git-init-toast';
import { initWebVitals } from '@/lib/perf';
import { installColdMountInstrumentation } from '@/lib/perf/cold-mount-instrumentation';
import { installUpdateNoticesBridge } from '@/lib/update-notices-store';
import { App } from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
// react-medium-image-zoom ships structural CSS (modal positioning, dialog
// backdrop, zoom animation gated on prefers-reduced-motion internally). Must
// be imported once globally so the Image component's click-to-zoom works
// without each consumer re-importing (US-006 / FR-18 / D-MF3).
import 'react-medium-image-zoom/dist/styles.css';
import './globals.css';

// Electron-only: rewrite `/api/*` fetches to target the utility process. The
// renderer host (electron-vite dev server OR packaged file://) doesn't serve
// /api; the hocuspocus instance behind the bridge does. Must run BEFORE any
// component mounts so the first paint's `fetch('/api/documents')` lands in
// the right place. No-op in web / CLI distribution (okDesktop undefined).
if (typeof window !== 'undefined' && window.okDesktop?.config.apiOrigin) {
  installDesktopFetchRewrite({ apiOrigin: window.okDesktop.config.apiOrigin });
}

// Install cold-mount instrumentation BEFORE any editor module loads — the
// prototype patches must be in place before the first `new Editor(...)` call.
// Marks emit only in DEV/test; production `mark()` helper no-ops its collector
// push (per CLAUDE.md precedent #24). Controlled via `OK_COLD_MOUNT_INSTR` env
// flag on the Vite side for opt-out in case of overhead concerns.
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installColdMountInstrumentation();
  initWebVitals();
}

// Desktop-only: subscribe to the `git-init-notice` bridge event so the user
// sees a sonner toast when ensureProjectGit ran `git init` during boot (SPEC
// R5b / D10). Registered here (module-init, before React mount) so the IPC
// listener is in place before main fires the event on dom-ready. No-op in
// web / CLI distribution (window.okDesktop undefined).
if (typeof window !== 'undefined') {
  installGitInitToast({ bridge: window.okDesktop });
}

// Desktop-only: attach the M3 update-notice bridge subscribers at module-init
// time (BEFORE React mounts) so IPC events fired before first render aren't
// dropped, AND so renderer remounts don't detach the subscribers. The
// module-level store in `update-notices-store` buffers notices; the
// `<UpdateNotices />` component reads them via `useSyncExternalStore`.
// No-op in web/CLI distribution (window.okDesktop undefined).
installUpdateNoticesBridge();

// Desktop-only: subscribe to the `ok:deep-link` bridge event so an
// `openknowledge://` URL routed to this window updates the hash to open the
// target doc (M4 US-007). Module-init registration mirrors the git-init-toast
// pattern — listener must be in place before the event can fire.
if (typeof window !== 'undefined') {
  installDeepLinkListener({ bridge: window.okDesktop });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Electron Navigator-mode branch (D24 revised): when the desktop preload has
// flagged `mode: 'navigator'`, render the lightweight launcher UI instead of
// the full editor shell. CLI / web distribution: window.okDesktop is undefined,
// so this is always the editor (`App`) path.
const isNavigator = typeof window !== 'undefined' && window.okDesktop?.config.mode === 'navigator';

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="ok-theme-v1"
      >
        <TooltipProvider>
          {isNavigator && window.okDesktop ? <NavigatorApp bridge={window.okDesktop} /> : <App />}
        </TooltipProvider>
        {/*
         * Sonner toaster for ad-hoc status/error toasts (clone dialog, file
         * tree, etc.). M3 auto-update notices are NOT routed here — they live
         * in the sidebar footer via <UpdateNotices /> for a persistent home
         * that matches their permanent-until-clicked semantics.
         */}
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
