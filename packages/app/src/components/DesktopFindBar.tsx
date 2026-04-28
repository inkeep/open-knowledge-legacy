import { useEffect, useRef, useState } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

const MATCH_HIGHLIGHT = 'ok-desktop-find-match';
const CURRENT_HIGHLIGHT = 'ok-desktop-find-current';

interface DesktopFindBarProps {
  bridge: OkDesktopBridge;
}

type HighlightRegistry = {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
};

type HighlightGlobal = {
  new (...ranges: Range[]): unknown;
};

function getHighlightSupport(): { registry: HighlightRegistry; Highlight: HighlightGlobal } | null {
  const css = globalThis.CSS as (typeof CSS & { highlights?: HighlightRegistry }) | undefined;
  const HighlightCtor = (globalThis as typeof globalThis & { Highlight?: HighlightGlobal })
    .Highlight;
  if (!css?.highlights || !HighlightCtor) return null;
  return { registry: css.highlights, Highlight: HighlightCtor };
}

function isMacOs() {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function isFindShortcut(e: KeyboardEvent) {
  return e.key.toLowerCase() === 'f' && (isMacOs() ? e.metaKey : e.ctrlKey) && !e.altKey;
}

function collectRanges(query: string): Range[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const element = node.parentNode instanceof Element ? node.parentNode : null;
      if (!element) return NodeFilter.FILTER_REJECT;
      if (
        element.closest(
          '[data-ok-desktop-find-bar], script, style, input, textarea, select, button',
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const ranges: Range[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? '';
    const haystack = text.toLocaleLowerCase();
    let from = haystack.indexOf(needle);
    while (from !== -1) {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + query.length);
      ranges.push(range);
      from = haystack.indexOf(needle, from + Math.max(query.length, 1));
    }
    node = walker.nextNode();
  }
  return ranges;
}

function scrollRangeIntoView(range: Range) {
  const rect = range.getBoundingClientRect();
  const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (isVisible) return;
  const container =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentNode
      : range.startContainer;
  if (container instanceof Element) {
    container.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
}

function paintHighlights(ranges: readonly Range[], currentIndex: number) {
  const support = getHighlightSupport();
  if (!support) return;
  support.registry.delete(MATCH_HIGHLIGHT);
  support.registry.delete(CURRENT_HIGHLIGHT);
  if (ranges.length === 0) return;

  support.registry.set(MATCH_HIGHLIGHT, new support.Highlight(...ranges));
  const current = ranges[currentIndex];
  if (current) {
    support.registry.set(CURRENT_HIGHLIGHT, new support.Highlight(current));
    scrollRangeIntoView(current);
  }
}

function clearHighlights() {
  const support = getHighlightSupport();
  support?.registry.delete(MATCH_HIGHLIGHT);
  support?.registry.delete(CURRENT_HIGHLIGHT);
}

export function DesktopFindBar({ bridge }: DesktopFindBarProps) {
  'use no memo'
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rangesRef = useRef<Range[]>([]);
  const openFindRef = useRef<() => void>(() => {});
  const refreshSearchRef = useRef<(nextQuery: string, nextIndex: number) => void>(() => {});
  const stepRef = useRef<(delta: number) => void>(() => {});

  openFindRef.current = () => {
    setOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  refreshSearchRef.current = (nextQuery: string, nextIndex: number) => {
    const ranges = collectRanges(nextQuery);
    rangesRef.current = ranges;
    const boundedIndex =
      ranges.length === 0 ? 0 : ((nextIndex % ranges.length) + ranges.length) % ranges.length;
    setMatchCount(ranges.length);
    setCurrentIndex(boundedIndex);
    paintHighlights(ranges, boundedIndex);
  };

  stepRef.current = (delta: number) => {
    if (rangesRef.current.length === 0) return;
    refreshSearchRef.current(query, currentIndex + delta);
  };

  useEffect(() => {
    const unsubscribe = bridge.onMenuAction((action) => {
      if (action === 'focus-search') openFindRef.current();
    });
    return unsubscribe;
  }, [bridge]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isFindShortcut(e)) {
        e.preventDefault();
        openFindRef.current();
      } else if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (open && e.key === 'Enter') {
        e.preventDefault();
        stepRef.current(e.shiftKey ? -1 : 1);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      clearHighlights();
      return;
    }
    refreshSearchRef.current(query, 0);
    return clearHighlights;
  }, [open, query]);

  if (!open) return null;

  return (
    <div
      data-ok-desktop-find-bar
      className="fixed top-3 right-3 z-50 flex items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-foreground shadow-lg"
    >
      <style>{`
        ::highlight(${MATCH_HIGHLIGHT}) { background: color-mix(in srgb, Highlight 35%, transparent); }
        ::highlight(${CURRENT_HIGHLIGHT}) { background: Highlight; color: HighlightText; }
      `}</style>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find"
        className="h-7 w-52 rounded-sm border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        aria-label="Find in page"
      />
      <span className="min-w-12 text-center text-muted-foreground text-xs">
        {query ? `${matchCount === 0 ? 0 : currentIndex + 1}/${matchCount}` : ''}
      </span>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm hover:bg-accent"
        onClick={() => stepRef.current(-1)}
        aria-label="Previous match"
      >
        Prev
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm hover:bg-accent"
        onClick={() => stepRef.current(1)}
        aria-label="Next match"
      >
        Next
      </button>
      <button
        type="button"
        className="rounded px-2 py-1 text-sm hover:bg-accent"
        onClick={() => setOpen(false)}
        aria-label="Close find"
      >
        Done
      </button>
    </div>
  );
}
