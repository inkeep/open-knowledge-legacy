import { useLayoutEffect, useRef, useState } from 'react';

interface TabsProps {
  id?: string;
  children?: React.ReactNode;
}

interface TabSummary {
  index: number;
  label: string;
  panelId: string | null;
}

const TABS_SELECTOR = '[data-component-type="tabs"]';
const RENDERER_SELECTOR = '[data-node-view-content-react] > .react-renderer';

function readTabSlots(root: HTMLElement): TabSummary[] {
  const ownerTabs = root.closest(TABS_SELECTOR);
  if (!ownerTabs) return [];
  const all = Array.from(root.querySelectorAll<HTMLElement>(RENDERER_SELECTOR));
  const ours = all.filter((r) => r.parentElement?.closest(TABS_SELECTOR) === ownerTabs);
  return ours.map((r, i) => {
    const tabEl = r.querySelector<HTMLElement>('[data-tab-label]');
    const fromAttr = tabEl?.getAttribute('data-tab-label');
    const label = fromAttr?.trim() || `Tab ${i + 1}`;
    const panelId = tabEl?.getAttribute('data-tab-id') ?? null;
    return { index: i, label, panelId };
  });
}

export function Tabs({ id, children }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [labels, setLabels] = useState<TabSummary[]>([]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const prevLabelCountRef = useRef(0);

  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const next = readTabSlots(root);
    setLabels((prev) => {
      if (prev.length !== next.length) return next;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].label !== next[i].label || prev[i].panelId !== next[i].panelId) return next;
      }
      return prev;
    });
  });

  useLayoutEffect(() => {
    if (labels.length > prevLabelCountRef.current && labels.length > 0) {
      setActiveIndex(labels.length - 1);
    }
    prevLabelCountRef.current = labels.length;
  }, [labels.length]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const resolveHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      if (id && hash === id) {
        setActiveIndex(0);
        return;
      }
      const root = contentRef.current;
      if (!root) return;
      const slots = readTabSlots(root);
      const idx = slots.findIndex((s) => s.panelId === hash);
      if (idx < 0) return;
      setActiveIndex(idx);
      queueMicrotask(() => {
        const el = root.ownerDocument.getElementById(hash);
        el?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    };
    resolveHash();
    window.addEventListener('hashchange', resolveHash);
    return () => window.removeEventListener('hashchange', resolveHash);
  });

  const safeActive =
    labels.length === 0 ? 0 : Math.min(Math.max(activeIndex, 0), labels.length - 1);

  const handleStripKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (labels.length === 0) return;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (safeActive + 1) % labels.length;
    else if (e.key === 'ArrowLeft') nextIndex = (safeActive - 1 + labels.length) % labels.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = labels.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    setActiveIndex(nextIndex);
    const buttons = stripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  };

  return (
    <div className="tabs" id={id}>
      <div
        ref={stripRef}
        role="tablist"
        aria-label={id ? `Tabs: ${id}` : 'Tabs'}
        className="tabs-strip"
        contentEditable={false}
        onKeyDown={handleStripKeyDown}
      >
        {labels.map((s) => {
          const tabButtonId = s.panelId ? `${s.panelId}-tab` : undefined;
          return (
            <button
              key={s.index}
              id={tabButtonId}
              type="button"
              role="tab"
              className="tabs-strip-pill"
              data-active={s.index === safeActive}
              aria-selected={s.index === safeActive}
              aria-controls={s.panelId ?? undefined}
              tabIndex={s.index === safeActive ? 0 : -1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setActiveIndex(s.index)}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div ref={contentRef} className="tabs-content" data-active-index={safeActive}>
        {children}
      </div>
    </div>
  );
}
