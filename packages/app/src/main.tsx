import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initWebVitals } from '@/lib/perf';
import { installColdMountInstrumentation } from '@/lib/perf/cold-mount-instrumentation';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { App } from './App';

// Install cold-mount instrumentation BEFORE any editor module loads — the
// prototype patches must be in place before the first `new Editor(...)` call.
// Marks emit only in DEV/test; production `mark()` helper no-ops its collector
// push (per CLAUDE.md precedent #24). Controlled via `OK_COLD_MOUNT_INSTR` env
// flag on the Vite side for opt-out in case of overhead concerns.
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  installColdMountInstrumentation();
  initWebVitals();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

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
          <App />
        </TooltipProvider>
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
