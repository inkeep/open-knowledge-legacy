import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OkDesktopBridge, OkFindInPageResult } from '@/lib/desktop-bridge-types';

/**
 * Cmd/Ctrl+F find-in-page overlay — Electron-only. Browser builds rely on
 * Chromium's native find UI (Cmd+F is intercepted by the browser shell);
 * Electron suppresses it, so we provide our own bar that drives
 * `webContents.findInPage` via the desktop bridge.
 *
 * UX matches the platform-standard floating bar: top-right, query input,
 * "<active>/<total>" counter, prev/next arrows, close button. Enter advances
 * forward, Shift+Enter backward, Esc dismisses. Opens on the
 * `'find-in-page'` menu action fired by the Edit → Find… menu item.
 */
interface FindBarProps {
  bridge: OkDesktopBridge;
}

export function FindBar({ bridge }: FindBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<OkFindInPageResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to the menu action that opens the bar. The Edit → Find…
  // menu item fires `'find-in-page'`; main routes it to the focused
  // window so each window's bar opens independently.
  useEffect(() => {
    const unsubscribe = bridge.onMenuAction((action) => {
      if (action === 'find-in-page') {
        setOpen(true);
        // Defer focus so the input has mounted by the time we ask for it.
        // Selecting the existing query mirrors browser Cmd+F behavior —
        // hitting Cmd+F again pre-fills the last search and lets you type
        // a fresh one without manual Cmd+A.
        queueMicrotask(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    });
    return unsubscribe;
  }, [bridge]);

  // Subscribe to find results from main's `webContents.on('found-in-page')`
  // forwarder. Updates the X/Y counter; we render the latest result whether
  // or not it's the `finalUpdate` for that requestId — intermediate ordinals
  // are still meaningful for the user.
  useEffect(() => {
    const unsubscribe = bridge.find.onResult((next) => {
      setResult(next);
    });
    return unsubscribe;
  }, [bridge]);

  function close() {
    setOpen(false);
    setResult(null);
    void bridge.find.stop('clearSelection');
  }

  // Empty query → clear highlights without dismissing the bar. Non-empty →
  // start a fresh search (`findNext: false` resets the active match to 1
  // so typing a new query restarts at the first hit, matching Chrome's UX).
  function search(text: string, opts: { findNext: boolean; forward: boolean }) {
    if (text.length === 0) {
      setResult(null);
      void bridge.find.stop('clearSelection');
      return;
    }
    void bridge.find.start(text, {
      findNext: opts.findNext,
      forward: opts.forward,
    });
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setQuery(next);
    search(next, { findNext: false, forward: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      search(query, { findNext: true, forward: !event.shiftKey });
      return;
    }
  }

  if (!open) return null;

  // Counter rendering: empty input shows nothing; otherwise show "X/Y" or
  // "No results" once the result lands. Before the first result for the
  // current query the counter renders "—/—" so the slot doesn't reflow on
  // every keystroke.
  const counter = (() => {
    if (query.length === 0) return '';
    if (!result) return '—/—';
    if (result.matches === 0) return 'No results';
    return `${result.activeMatchOrdinal}/${result.matches}`;
  })();

  return (
    <search
      aria-label="Find in page"
      className="fixed top-2 right-2 z-50 flex items-center gap-1.5 rounded-lg border border-border bg-popover px-2 py-1.5 shadow-md"
    >
      <Input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        aria-label="Find in page"
        className="h-7 w-56"
      />
      <span aria-live="polite" className="min-w-16 text-xs text-muted-foreground tabular-nums">
        {counter}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => search(query, { findNext: true, forward: false })}
        disabled={query.length === 0}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => search(query, { findNext: true, forward: true })}
        disabled={query.length === 0}
        aria-label="Next match"
        title="Next match (Enter)"
      >
        <ChevronDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={close}
        aria-label="Close find"
        title="Close (Esc)"
      >
        <X />
      </Button>
    </search>
  );
}
