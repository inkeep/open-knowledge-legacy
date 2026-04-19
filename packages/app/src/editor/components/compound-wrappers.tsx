/**
 * Editor-local compound component wrappers for Tabs/Tab and Accordion/AccordionItem.
 *
 * These replace direct fumadocs-ui compound imports because fumadocs compound
 * components rely on React Context (via Radix's createContextScope) which doesn't
 * cross TipTap's NodeView portal boundaries. Each child NodeView renders as a
 * sibling React portal — not a descendant of the parent's React subtree.
 *
 * Radix's createContextScope creates closure-scoped BaseContext objects that are
 * NOT accessible from outside the module (verified:
 * @radix-ui/react-context/dist/index.js lines 57-93). No API exists to extract
 * the BaseContext from the closure. fumadocs TabsContext is module-internal
 * (line 7 of fumadocs-ui/dist/components/tabs.js), also not exported.
 *
 * These wrappers pattern-copy the fumadocs visual structure using the same CSS
 * classes (served by the --color-fd-* variable bridge in globals.css) while
 * managing compound state via DOM data-attributes on the PM-owned DOM (parent
 * writes `data-active-tab` on its root; children read it from their closest
 * ancestor). This is the SPEC §9.15.7 R1 Fallback-2 pattern-copy path —
 * chosen because Radix's closure-scoped Contexts cannot be bridged without
 * modifying Radix itself. A full Context Bridge Registry (editor-scoped
 * store + bridgeId PluginState + useSyncExternalStore subscription) was
 * prototyped but not adopted; see evidence/deferred-invariants-and-perf.md
 * for the deletion rationale.
 *
 * Leaf components (Callout, Card, Steps, Step, etc.) remain as direct fumadocs-ui
 * imports (full D12 fidelity) — they have no compound context dependency.
 */

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

// ─── EditorTabs ───────────────────────────────────────────────────────────────
// Parent wrapper for <Tabs> blocks. Manages active tab state and renders the
// trigger bar. Children are rendered via NodeViewContent (TipTap portal).
// Active tab value is communicated to children via CSS data attributes on the
// PM DOM — child Tab NodeViews read `data-active-tab` from their closest
// ancestor `.editor-tabs-root`.

export function EditorTabs({
  items,
  defaultIndex = 0,
  children,
}: {
  items?: string[];
  defaultIndex?: number;
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Derive tab items reactively from DOM children — NOT from a one-time
  // props.items snapshot. This ensures the trigger bar updates when Tabs
  // are added/removed via "Add Tab" or slash command.
  const [derivedItems, setDerivedItems] = useState<string[]>(items ?? []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const deriveFromDOM = () => {
      const panels = root.querySelectorAll('.editor-tab-content');
      if (panels.length === 0) return; // children not mounted yet
      const values = Array.from(panels).map(
        (p, i) => (p as HTMLElement).getAttribute('data-value') || `tab-${i}`,
      );
      setDerivedItems((prev) => {
        // Only update if the values actually changed (avoid infinite re-render)
        if (prev.length === values.length && prev.every((v, i) => v === values[i])) return prev;
        return values;
      });
    };

    // Derive after a short delay (children mount asynchronously via TipTap portals)
    const timeout = setTimeout(deriveFromDOM, 50);
    // Re-derive on DOM mutations (child add/remove via createChildNode)
    const observer = new MutationObserver(deriveFromDOM);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  const tabItems = derivedItems.length > 0 ? derivedItems : (items ?? []);
  const defaultValue = escapeValue(tabItems[defaultIndex] ?? tabItems[0] ?? '');

  // Activate the default tab panel on mount
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !defaultValue) return;
    for (const panel of root.querySelectorAll('.editor-tab-content')) {
      panel.setAttribute(
        'data-state',
        panel.getAttribute('data-value') === defaultValue ? 'active' : 'inactive',
      );
    }
  }, [defaultValue]);

  return (
    <div
      ref={rootRef}
      className="editor-tabs-root flex flex-col rounded-xl border bg-fd-secondary my-4"
      data-active-tab={defaultValue}
    >
      {/* Tab trigger bar — chrome, not user content. `contentEditable={false}`
          tells PM this subtree isn't editable; `onMouseDown stopPropagation`
          stops PM's root mousedown handler from placing the caret "inside
          <Tabs>" (the nearest editable location, which lands at the Tabs
          content boundary where only jsxComponent children are legal).
          Without both, clicking a tab label drops the caret in an invalid
          position and the next keystroke is rejected by TypedChildrenGuard. */}
      {tabItems.length > 0 && (
        <div
          role="tablist"
          className="flex gap-3.5 text-fd-secondary-foreground overflow-x-auto px-4 not-prose"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {tabItems.map((item, idx) => {
            const value = escapeValue(item);
            const triggerId = `editor-tab-trigger-${value}`;
            const panelId = `editor-tab-panel-${value}`;
            const isActive = value === defaultValue;
            return (
              <button
                key={item}
                type="button"
                id={triggerId}
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                className="editor-tab-trigger inline-flex items-center gap-2 whitespace-nowrap text-fd-muted-foreground border-b border-transparent py-2 text-sm font-medium transition-colors hover:text-fd-accent-foreground data-[state=active]:border-fd-primary data-[state=active]:text-fd-primary"
                data-value={value}
                data-state={isActive ? 'active' : 'inactive'}
                onKeyDown={(e) => {
                  // WAI-ARIA Authoring Practices: arrow-key navigation between
                  // siblings in a tablist. Home/End jump to first/last.
                  if (
                    e.key !== 'ArrowLeft' &&
                    e.key !== 'ArrowRight' &&
                    e.key !== 'Home' &&
                    e.key !== 'End'
                  ) {
                    return;
                  }
                  e.preventDefault();
                  const triggers = e.currentTarget
                    .closest('[role="tablist"]')
                    ?.querySelectorAll<HTMLButtonElement>('.editor-tab-trigger');
                  if (!triggers || triggers.length === 0) return;
                  let targetIdx = idx;
                  if (e.key === 'ArrowLeft')
                    targetIdx = (idx - 1 + triggers.length) % triggers.length;
                  else if (e.key === 'ArrowRight') targetIdx = (idx + 1) % triggers.length;
                  else if (e.key === 'Home') targetIdx = 0;
                  else if (e.key === 'End') targetIdx = triggers.length - 1;
                  triggers[targetIdx]?.focus();
                  triggers[targetIdx]?.click();
                }}
                onClick={(e) => {
                  const root = e.currentTarget.closest('.editor-tabs-root');
                  if (!root) return;
                  root.setAttribute('data-active-tab', value);
                  for (const trigger of root.querySelectorAll<HTMLElement>('.editor-tab-trigger')) {
                    const active = trigger.getAttribute('data-value') === value;
                    trigger.setAttribute('data-state', active ? 'active' : 'inactive');
                    trigger.setAttribute('aria-selected', String(active));
                    trigger.setAttribute('tabindex', active ? '0' : '-1');
                  }
                  for (const panel of root.querySelectorAll('.editor-tab-content')) {
                    panel.setAttribute(
                      'data-state',
                      panel.getAttribute('data-value') === value ? 'active' : 'inactive',
                    );
                  }
                }}
              >
                {item}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab content — rendered via NodeViewContent (PM children) */}
      {children}
    </div>
  );
}

// ─── EditorTab ────────────────────────────────────────────────────────────────
// Child wrapper for <Tab> blocks. Reads active state from parent DOM.
// Inactive panels use data-[state=inactive]:hidden (display:none) — this is a
// documented exemption from Precedent #24: standard tab UX hides inactive panels;
// content is accessible by clicking the tab trigger, not permanently hidden.

export function EditorTab({ value, children }: { value?: string; children?: ReactNode }) {
  const escaped = value ? escapeValue(value) : '';
  const panelId = escaped ? `editor-tab-panel-${escaped}` : undefined;
  const triggerId = escaped ? `editor-tab-trigger-${escaped}` : undefined;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={triggerId}
      className="editor-tab-content p-4 text-[0.9375rem] bg-fd-background rounded-xl prose-no-margin data-[state=inactive]:hidden"
      data-value={escaped}
      data-state="inactive"
    >
      {children}
    </div>
  );
}

// ─── EditorAccordions ─────────────────────────────────────────────────────────
// Parent wrapper for <Accordions> blocks.

export function EditorAccordions({
  type = 'single',
  children,
}: {
  type?: 'single' | 'multiple';
  children?: ReactNode;
}) {
  return (
    <div
      className="editor-accordions-root flex flex-col rounded-lg border bg-fd-card text-fd-card-foreground my-4 divide-y divide-fd-border"
      data-accordion-type={type}
    >
      {children}
    </div>
  );
}

// ─── EditorAccordion ──────────────────────────────────────────────────────────
// Child wrapper for <Accordion> (AccordionItem) blocks.
//
// Uses `useState` for the open/closed flag (keeps React semantics in sync with
// the `data-state` attribute read by CSS) and React 19's `useId` to bridge the
// trigger button and content panel with `aria-controls` / `aria-labelledby` —
// the minimum WAI-ARIA contract for an accordion pattern so screen readers can
// announce expanded/collapsed state correctly. React Compiler disallows
// reading `ref.current` during render, so `useId` is the correct primitive
// here rather than a `useRef` + module counter.

export function EditorAccordion({ title, children }: { title?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(true);
  const itemRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const state = open ? 'open' : 'closed';

  return (
    <div ref={itemRef} className="editor-accordion-item" data-state={state}>
      <h3 className="flex">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 p-4 text-start text-sm font-medium transition-all [&[data-state=open]>svg]:rotate-180"
          data-state={state}
          onClick={() => {
            const next = !open;
            // For single-type parents, close other items. The sibling state
            // is still tracked via data-state on the DOM (each child has its
            // own useState hook, but since we only need the parent to enforce
            // single-selection, DOM read is sufficient — this mirrors how
            // fumadocs-ui's Radix-backed accordion coordinates).
            const root = itemRef.current?.closest('.editor-accordions-root');
            if (next && root?.getAttribute('data-accordion-type') === 'single') {
              for (const other of root.querySelectorAll('.editor-accordion-item')) {
                if (other === itemRef.current) continue;
                other.setAttribute('data-state', 'closed');
                const otherBtn = other.querySelector('button');
                if (otherBtn) {
                  otherBtn.setAttribute('data-state', 'closed');
                  otherBtn.setAttribute('aria-expanded', 'false');
                }
                const otherContent = other.querySelector('.editor-accordion-content');
                if (otherContent) otherContent.setAttribute('data-state', 'closed');
              }
            }
            setOpen(next);
          }}
        >
          <span className="flex-1">{title ?? 'Accordion'}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 transition-transform duration-200"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      {/* `<section>` is the WAI-ARIA-equivalent semantic element for a
          named region — Biome's `lint/a11y/useSemanticElements` enforces
          the swap. aria-labelledby makes the trigger's text the accessible
          name; an AT announces "Accordion {title}, expanded" on focus. */}
      <section
        id={contentId}
        aria-labelledby={triggerId}
        className="editor-accordion-content text-sm data-[state=closed]:hidden"
        data-state={state}
      >
        <div className="p-4 pt-0 prose-no-margin">{children}</div>
      </section>
    </div>
  );
}

function escapeValue(v: string): string {
  return v.toLowerCase().replace(/\s+/g, '-');
}
