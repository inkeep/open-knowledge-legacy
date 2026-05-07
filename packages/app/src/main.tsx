import { initFrontendTelemetry } from './telemetry';

initFrontendTelemetry();

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NavigatorApp } from '@/components/NavigatorApp';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/lib/desktop-bridge-types';
import { installDesktopFetchRewrite } from '@/lib/desktop-fetch';
import { installDeepLinkListener } from '@/lib/install-deep-link-listener';
import { installMcpConsentListener } from '@/lib/mcp-consent-store';
import { initWebVitals } from '@/lib/perf';
import { installColdMountInstrumentation } from '@/lib/perf/cold-mount-instrumentation';
import { installUpdateNoticesBridge } from '@/lib/update-notices-store';
import { App } from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'react-medium-image-zoom/dist/styles.css';
import 'katex/dist/katex.min.css';
import './globals.css';

if (typeof window !== 'undefined' && window.okDesktop?.config.apiOrigin) {
  installDesktopFetchRewrite({ apiOrigin: window.okDesktop.config.apiOrigin });
}

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installColdMountInstrumentation();
  initWebVitals();
}

installUpdateNoticesBridge();

if (typeof window !== 'undefined') {
  installDeepLinkListener({ bridge: window.okDesktop });
}

if (typeof window !== 'undefined') {
  installMcpConsentListener({ bridge: window.okDesktop });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

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
        <Toaster richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
