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
import { installGitInitToast } from '@/lib/install-git-init-toast';
import { App } from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

// Electron-only: rewrite `/api/*` fetches to target the utility process. The
// renderer host (electron-vite dev server OR packaged file://) doesn't serve
// /api; the hocuspocus instance behind the bridge does. Must run BEFORE any
// component mounts so the first paint's `fetch('/api/documents')` lands in
// the right place. No-op in web / CLI distribution (okDesktop undefined).
if (typeof window !== 'undefined' && window.okDesktop?.config.apiOrigin) {
  installDesktopFetchRewrite({ apiOrigin: window.okDesktop.config.apiOrigin });
}

// Desktop-only: subscribe to the `git-init-notice` bridge event so the user
// sees a sonner toast when ensureProjectGit ran `git init` during boot (SPEC
// R5b / D10). Registered here (module-init, before React mount) so the IPC
// listener is in place before main fires the event on dom-ready. No-op in
// web / CLI distribution (window.okDesktop undefined).
if (typeof window !== 'undefined') {
  installGitInitToast({ bridge: window.okDesktop });
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
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
