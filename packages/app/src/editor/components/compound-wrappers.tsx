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
 * managing compound state via the Context Bridge store for parent→child
 * communication across portal boundaries.
 *
 * Leaf components (Callout, Card, Steps, Step, etc.) remain as direct fumadocs-ui
 * imports (full D12 fidelity) — they have no compound context dependency.
 */

import { type ReactNode, useEffect, useRef } from 'react';

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
  // Resolve initial items from props or derive from children
  const tabItems = items ?? [];
  const defaultValue = escapeValue(tabItems[defaultIndex] ?? tabItems[0] ?? '');
  const rootRef = useRef<HTMLDivElement>(null);

  // Activate the default tab panel on mount — child Tab NodeViews render in
  // separate portals with data-state="inactive" default. This effect walks
  // the DOM to set the matching panel active after children mount.
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
      className="editor-tabs-root flex flex-col overflow-hidden rounded-xl border bg-fd-secondary my-4"
      data-active-tab={defaultValue}
    >
      {/* Tab trigger bar */}
      {tabItems.length > 0 && (
        <div className="flex gap-3.5 text-fd-secondary-foreground overflow-x-auto px-4 not-prose">
          {tabItems.map((item) => (
            <button
              key={item}
              type="button"
              className="editor-tab-trigger inline-flex items-center gap-2 whitespace-nowrap text-fd-muted-foreground border-b border-transparent py-2 text-sm font-medium transition-colors hover:text-fd-accent-foreground data-[state=active]:border-fd-primary data-[state=active]:text-fd-primary"
              data-value={escapeValue(item)}
              data-state={escapeValue(item) === defaultValue ? 'active' : 'inactive'}
              onClick={(e) => {
                const root = e.currentTarget.closest('.editor-tabs-root');
                if (!root) return;
                const val = escapeValue(item);
                root.setAttribute('data-active-tab', val);
                // Update all triggers
                for (const trigger of root.querySelectorAll('.editor-tab-trigger')) {
                  trigger.setAttribute(
                    'data-state',
                    trigger.getAttribute('data-value') === val ? 'active' : 'inactive',
                  );
                }
                // Update all tab content panels
                for (const panel of root.querySelectorAll('.editor-tab-content')) {
                  panel.setAttribute(
                    'data-state',
                    panel.getAttribute('data-value') === val ? 'active' : 'inactive',
                  );
                }
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {/* Tab content — rendered via NodeViewContent (PM children) */}
      {children}
    </div>
  );
}

// ─── EditorTab ────────────────────────────────────────────────────────────────
// Child wrapper for <Tab> blocks. Reads active state from parent DOM.

export function EditorTab({ value, children }: { value?: string; children?: ReactNode }) {
  const escaped = value ? escapeValue(value) : '';

  return (
    <div
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

export function EditorAccordion({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="editor-accordion-item" data-state="closed">
      <h3 className="flex">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 p-4 text-start text-sm font-medium transition-all [&[data-state=open]>svg]:rotate-180"
          data-state="closed"
          onClick={(e) => {
            const item = e.currentTarget.closest('.editor-accordion-item');
            if (!item) return;
            const current = item.getAttribute('data-state');
            const next = current === 'open' ? 'closed' : 'open';

            // For single type, close other items
            const root = item.closest('.editor-accordions-root');
            if (root?.getAttribute('data-accordion-type') === 'single') {
              for (const other of root.querySelectorAll('.editor-accordion-item')) {
                if (other !== item) {
                  other.setAttribute('data-state', 'closed');
                  const otherBtn = other.querySelector('button');
                  if (otherBtn) otherBtn.setAttribute('data-state', 'closed');
                  const otherContent = other.querySelector('.editor-accordion-content');
                  if (otherContent) otherContent.setAttribute('data-state', 'closed');
                }
              }
            }

            item.setAttribute('data-state', next);
            e.currentTarget.setAttribute('data-state', next);
            const content = item.querySelector('.editor-accordion-content');
            if (content) content.setAttribute('data-state', next);
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
      <div
        className="editor-accordion-content overflow-hidden text-sm data-[state=closed]:hidden"
        data-state="closed"
      >
        <div className="p-4 pt-0 prose-no-margin">{children}</div>
      </div>
    </div>
  );
}

function escapeValue(v: string): string {
  return v.toLowerCase().replace(/\s+/g, '-');
}
