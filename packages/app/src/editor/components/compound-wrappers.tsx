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
 * bridging state across NodeView portals via DOM `data-*` attributes on the
 * PM-owned DOM: the parent writes `data-active-tab` / `data-accordion-open` on
 * its root, and each child reads its closest ancestor in a `useSyncExternalStore`
 * subscription (MutationObserver → snapshot). This is the SPEC §9.15.7 R1
 * Fallback-2 pattern-copy path — chosen because Radix's closure-scoped Contexts
 * cannot be bridged without modifying Radix itself. A full Context Bridge
 * Registry (editor-scoped store + bridgeId PluginState + useSyncExternalStore
 * subscription) was prototyped but not adopted; see
 * evidence/deferred-invariants-and-perf.md for the deletion rationale.
 *
 * **State ownership (React-owned, DOM-reflected).** The parent component owns
 * the active tab / open accordion item in `useState` and RENDERS the `data-*`
 * attributes into JSX. Click handlers call `setState`; the DOM reflects React
 * state, not the other way around. Previous iterations used imperative
 * `setAttribute` from click handlers — but a subsequent re-render (triggered by
 * sibling mutations, MutationObserver callbacks, parent re-renders) would
 * re-derive `isActive` from a STABLE `defaultValue` and snap the DOM back,
 * clobbering the user's selection. Owning state in React and deriving the
 * `data-*` attribute from it means every re-render preserves the selection.
 *
 * Leaf components (Callout, Card, Steps, Step, etc.) remain as direct fumadocs-ui
 * imports (full D12 fidelity) — they have no compound context dependency.
 *
 * **Re-evaluation trigger.** The pattern-copy approach scales to the two
 * compound families shipped here (Tabs, Accordions). Re-evaluate extraction
 * to a Context Bridge Registry primitive (per
 * `reports/context-bridge-registry-architecture/REPORT.md`) when ANY of:
 *
 *   1. A 3rd compound family lands (e.g. Files-as-compound, or a user-
 *      authored compound component).
 *   2. NG13 "user-authored compound descriptors" unblocks and we need
 *      a generic context-bridge path for arbitrary React Context providers.
 *   3. The DOM `data-*` contract below grows to > 4 keys or crosses more
 *      than 2 NodeView portal boundaries.
 *
 * Today: 2 families × 2 shared attrs (`data-active-tab`,
 * `data-accordion-open`) × 1 portal boundary. Adding a third family is
 * ~150 LoC of copy-paste against this file; evaluating the Context Bridge
 * primitive at that point is worth it.
 */

import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

// ─── DOM-attr subscription primitive ──────────────────────────────────────────
// `useSyncExternalStore` over a MutationObserver lets a child NodeView react to
// a DOM `data-*` attribute set by an ancestor without prop drilling (which is
// blocked by the portal boundary). Reads are snapshot-stable between events
// so React Compiler's equality memo works unchanged.

function useAncestorAttr(
  elementRef: React.RefObject<HTMLElement | null>,
  ancestorSelector: string,
  attrName: string,
): string | null {
  // React Compiler memoizes these function identities automatically — no
  // `useCallback` wrapper required. `useSyncExternalStore` relies on
  // identity-stability to avoid resubscribing on every render; the
  // compiler provides that without explicit memo hooks.
  const subscribe = (notify: () => void) => {
    const el = elementRef.current;
    if (!el) return () => {};
    const ancestor = el.closest(ancestorSelector);
    if (!ancestor) return () => {};
    const observer = new MutationObserver(notify);
    observer.observe(ancestor, { attributes: true, attributeFilter: [attrName] });
    return () => observer.disconnect();
  };
  const getSnapshot = () => {
    const el = elementRef.current;
    if (!el) return null;
    return el.closest(ancestorSelector)?.getAttribute(attrName) ?? null;
  };
  // getServerSnapshot is required by useSyncExternalStore's API shape even
  // though the editor doesn't run under SSR today — hydration-mismatch class
  // bugs would otherwise wait in ambush when/if SSR lands.
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

// ─── EditorTabs ───────────────────────────────────────────────────────────────
// Parent wrapper for <Tabs> blocks. Owns active-tab state in React (not DOM).
// Children render as sibling portals and subscribe to `data-active-tab` via the
// useAncestorAttr hook.

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

  // Controlled active-tab state. `initialActive` is derived from `defaultIndex`
  // once at mount; subsequent tab additions/removals DO NOT snap the active
  // tab back to the default — React preserves whatever the user selected.
  // `activeValue === null` means "fall back to initial default," applied in
  // `resolvedActive` below so a cleared-and-re-rendered derivedItems set can
  // still produce a valid active tab.
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const initialDefault = escapeValue(tabItems[defaultIndex] ?? tabItems[0] ?? '');
  // If the user explicitly selected a tab AND that tab is still in the list,
  // use it. Otherwise fall back to initialDefault (pointing at the current
  // first / defaultIndex tab).
  const resolvedActive =
    activeValue !== null && tabItems.some((t) => escapeValue(t) === activeValue)
      ? activeValue
      : initialDefault;

  return (
    <div
      ref={rootRef}
      className="editor-tabs-root flex flex-col rounded-xl border bg-fd-secondary my-4"
      data-active-tab={resolvedActive}
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
            const isActive = value === resolvedActive;
            return (
              // React-Compiler-safe: `key` keyed on the derived `value` so
              // duplicate-label tabs don't collide (previous `key={item}` was
              // a bug when two tabs had the same raw label).
              <button
                key={value}
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
                  let targetIdx = idx;
                  if (e.key === 'ArrowLeft')
                    targetIdx = (idx - 1 + tabItems.length) % tabItems.length;
                  else if (e.key === 'ArrowRight') targetIdx = (idx + 1) % tabItems.length;
                  else if (e.key === 'Home') targetIdx = 0;
                  else if (e.key === 'End') targetIdx = tabItems.length - 1;
                  const targetValue = escapeValue(tabItems[targetIdx] ?? '');
                  setActiveValue(targetValue);
                  // Move focus to the newly-active trigger.
                  const tablist = e.currentTarget.closest('[role="tablist"]');
                  const nextTrigger = tablist?.querySelector<HTMLButtonElement>(
                    `.editor-tab-trigger[data-value="${CSS.escape(targetValue)}"]`,
                  );
                  nextTrigger?.focus();
                }}
                onClick={() => setActiveValue(value)}
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
// Child wrapper for <Tab> blocks. Subscribes to the parent's `data-active-tab`
// attr via useAncestorAttr and derives `data-state` from React state rather
// than imperative DOM mutation. Inactive panels use `data-[state=inactive]:hidden`
// (display:none) — this is a documented exemption from Precedent #28: standard
// tab UX hides inactive panels; content is accessible by clicking the tab
// trigger, not permanently hidden.

export function EditorTab({ value, children }: { value?: string; children?: ReactNode }) {
  const escaped = value ? escapeValue(value) : '';
  const panelId = escaped ? `editor-tab-panel-${escaped}` : undefined;
  const triggerId = escaped ? `editor-tab-trigger-${escaped}` : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const activeTab = useAncestorAttr(panelRef, '.editor-tabs-root', 'data-active-tab');
  // Default to 'inactive' so SSR / first-paint doesn't briefly show every
  // panel. The parent's mount effect will have written `data-active-tab`
  // before the child's first paint.
  const state = activeTab !== null && activeTab === escaped ? 'active' : 'inactive';

  // When `value` is absent (malformed Tab in user content), there is no
  // trigger to derive `aria-labelledby` from. Fall back to a stable
  // `aria-label` so the tabpanel still has an accessible name and axe-core
  // `tabpanel-name` doesn't fail — the panel is visible and focusable, so
  // the role demands an accessible name regardless of authoring state.
  const hasValue = Boolean(escaped);
  return (
    <div
      ref={panelRef}
      id={panelId}
      role="tabpanel"
      aria-labelledby={hasValue ? triggerId : undefined}
      aria-label={hasValue ? undefined : 'Unnamed tab panel'}
      className="editor-tab-content p-4 text-[0.9375rem] bg-fd-background rounded-xl prose-no-margin data-[state=inactive]:hidden"
      data-value={escaped}
      data-state={state}
    >
      {children}
    </div>
  );
}

// ─── EditorAccordions ─────────────────────────────────────────────────────────
// Parent wrapper for <Accordions> blocks. Owns single-item state in React so
// that `type="single"` accordions can only have one item open at a time. In
// `type="multiple"` mode each child manages its own open state (the default
// local accordion behavior) — the parent's `data-accordion-open` attr stays
// empty so children fall back to their local toggle logic.

const ACCORDIONS_ROOT_CLASS = 'editor-accordions-root';

export function EditorAccordions({
  type = 'single',
  children,
}: {
  type?: 'single' | 'multiple';
  children?: ReactNode;
}) {
  // `openId` is the stable `useId` of the child whose panel is currently open
  // in single-mode. Null means "none open." In multiple-mode this stays null
  // and children self-toggle.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <AccordionsCtx.Provider value={{ type, openId, setOpenId }}>
      <div
        className={`${ACCORDIONS_ROOT_CLASS} flex flex-col rounded-lg border bg-fd-card text-fd-card-foreground my-4 divide-y divide-fd-border`}
        data-accordion-type={type}
        data-accordion-open={openId ?? ''}
      >
        {children}
      </div>
    </AccordionsCtx.Provider>
  );
}

// React Context crosses the NodeView portal boundary within this module
// because we own both sides (the wrapper and the child). Radix's module-
// private Context is what the Fallback-2 path avoided; a local Context whose
// Provider and Consumer are both defined here is fine — the portal boundary
// only blocks contexts whose Provider lives in a different module.
// (`createContext` + `use` are imported via the top-level React statement.)

interface AccordionsCtxShape {
  type: 'single' | 'multiple';
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const AccordionsCtx = createContext<AccordionsCtxShape | null>(null);

// ─── EditorAccordion ──────────────────────────────────────────────────────────
// Child wrapper for <Accordion> (AccordionItem) blocks.
//
// State coordination (Finding 3 fix): in `type="single"` mode the PARENT holds
// `openId`. The child reads `ctx.openId === myId` to decide if it's open; the
// click handler calls `ctx.setOpenId(myId | null)` to toggle. This means
// opening one item AUTOMATICALLY closes its siblings via React re-render —
// no `setAttribute` on sibling DOM, no stale React state.
//
// `type="multiple"` mode falls back to a local `useState(true)` so each item
// can be opened/closed independently (matching Radix's multiple-mode semantics).
//
// React 19's `useId` bridges the trigger button and content panel with
// `aria-controls` / `aria-labelledby` — the minimum WAI-ARIA contract for an
// accordion pattern.

export function EditorAccordion({ title, children }: { title?: string; children?: ReactNode }) {
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const ctx = use(AccordionsCtx);

  // Local state used ONLY in multiple-mode or when the item is rendered
  // outside an EditorAccordions wrapper. In single-mode, parent `openId`
  // is the source of truth.
  const [localOpen, setLocalOpen] = useState(true);

  const isSingle = ctx?.type === 'single';
  const open = isSingle ? ctx.openId === baseId : localOpen;
  const state = open ? 'open' : 'closed';

  const toggle = () => {
    if (isSingle) {
      ctx.setOpenId(open ? null : baseId);
    } else {
      setLocalOpen((v) => !v);
    }
  };

  return (
    <div className="editor-accordion-item" data-state={state}>
      <h3 className="flex">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 p-4 text-start text-sm font-medium transition-all [&[data-state=open]>svg]:rotate-180"
          data-state={state}
          onClick={toggle}
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
