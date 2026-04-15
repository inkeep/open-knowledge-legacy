# Evidence: Radix Collection Hook Portal Behavior

**Dimension:** D10 / D13 — Radix Collection hook cross-portal behavior analysis
**Date:** 2026-04-14
**Sources:** `node_modules/@radix-ui/react-collection/dist/index.mjs`, `node_modules/@radix-ui/react-tabs/dist/index.mjs`, `node_modules/fumadocs-ui/dist/components/tabs.js`

---

## Key files referenced

- `node_modules/@radix-ui/react-collection/dist/index.mjs` — Collection hook implementation (legacy + unstable)
- `node_modules/@radix-ui/react-context/dist/index.mjs` — Radix `createContextScope` utility
- `node_modules/@radix-ui/react-tabs/dist/index.mjs` — Radix Tabs compound component
- `node_modules/fumadocs-ui/dist/components/tabs.js` — fumadocs Tabs wrapper (styled, uses `TabsContext`)
- `node_modules/fumadocs-ui/dist/components/tabs.unstyled.js` — fumadocs Tabs unstyled (wraps Radix Tabs, adds `TabsContext`)

---

## Findings

### Finding 1: Radix Collection uses BOTH React Context AND DOM queries — dual mechanism

**Confidence:** CONFIRMED
**Evidence:** `@radix-ui/react-collection/dist/index.mjs:9-64` (legacy) + `:385-509` (unstable v2)

The legacy Collection (`createCollection`) at lines 9-64 works as follows:
1. `CollectionProvider` creates a React Context containing `{ collectionRef: RefObject, itemMap: Map }` (line 14)
2. `CollectionItemSlot` registers itself via `useEffect` into the context's `itemMap` (lines 43-46)
3. `useCollection` uses `querySelectorAll('[data-radix-collection-item]')` on the DOM to ORDER items (line 56)

The v2 Collection (`unstable_createCollection`) at lines 385-509:
1. Uses `CollectionContextProvider` with `{ collectionElement, collectionRef, itemMap: OrderedDict, setItemMap }` (lines 427-437)
2. `CollectionItemSlot` registers via `setItemMap` state updater (lines 468-489)
3. Items are sorted by `sortByDocumentPosition` using `compareDocumentPosition` (lines 524-528)
4. A `MutationObserver` on `childList: true, subtree: true` watches for DOM changes (lines 416-426)

**Both versions require React Context access (for `itemMap`) AND DOM nesting (for ordering).** Context bridge alone does NOT solve Collection — items must also be DOM-ordered.

**Implications:**
- Bridging Context only gets us halfway for Collection-based components
- The DOM ordering mechanism (`querySelectorAll` / `compareDocumentPosition`) works correctly even across portals because **portals preserve DOM nesting** (React docs confirm this)
- The Context mechanism breaks across portals (items can't register into the parent's `itemMap` without context bridge)
- **If we bridge the Collection Context, DOM ordering will work natively** because TipTap preserves DOM nesting via `contentDOM`

### Finding 2: Radix Tabs does NOT use Collection hook directly

**Confidence:** CONFIRMED
**Evidence:** `@radix-ui/react-tabs/dist/index.mjs:1-200`

Radix Tabs uses `createContextScope` from `@radix-ui/react-context` (line 6-7, 16-20). It creates `TabsProvider` and `useTabsContext` scoped context (line 20). There is NO import of `@radix-ui/react-collection` in the Tabs implementation.

The context shape provided by `TabsProvider` (line 41-49):
```typescript
{
  baseId: string,        // useId() — stable per instance
  value: string,         // current active tab value
  onValueChange: (v: string) => void,
  orientation: 'horizontal' | 'vertical',
  dir: Direction,
  activationMode: 'automatic' | 'manual'
}
```

`TabsTrigger` and `TabsContent` both call `useTabsContext` (lines 96, 148) — pure React Context consumption. No DOM queries.

**Implications:**
- For Radix Tabs, Context bridge alone IS sufficient — no Collection hook involved
- TabsContent checks `value === context.value` for activation (line 151) — only needs the context value
- TabsTrigger calls `context.onValueChange(value)` on interaction — needs the context callback

### Finding 3: fumadocs adds a SECOND Context layer on top of Radix Tabs

**Confidence:** CONFIRMED
**Evidence:** `fumadocs-ui/dist/components/tabs.js:4-12`, `tabs.unstyled.js:3-22`

fumadocs creates two separate TabsContext instances:

**Layer 1 — `tabs.unstyled.js:16`:** `TabsContext = createContext(null)` with shape `{ valueToIdMap: Map<string, string> }`. Provided at line 80. Consumed by `TabsContent` for anchor hash mapping (lines 82-88).

**Layer 2 — `tabs.js:7`:** `TabsContext = createContext(null)` with shape `{ items: string[] | undefined, collection: string[] }`. Provided at line 25. Consumed by `Tab` component for auto-indexing via `useCollectionIndex()` (lines 45-58).

**Both layers throw on null** — `tabs.js:9-11` and `tabs.unstyled.js:19-21` throw `Error('You must wrap your component in <Tabs>')`.

**Implications:**
- A Context bridge for fumadocs Tabs must propagate BOTH:
  1. Radix's internal `TabsProvider` context (from `createContextScope`)
  2. fumadocs' custom `TabsContext` (items + collection)
  3. fumadocs unstyled `TabsContext` (valueToIdMap)
- The Radix scoped context uses `createContextScope` which injects scope via `__scopeTabs` prop — this is a React Context under the hood, just wrapped
- Total: 3 React Contexts to bridge for a single Tabs compound component

### Finding 4: fumadocs `useCollectionIndex` uses mutable array via React Context — NOT safe for naive bridging

**Confidence:** CONFIRMED
**Evidence:** `fumadocs-ui/dist/components/tabs.js:20,45-58`

```javascript
const collection = useMemo(() => [], []);  // line 20: mutable array, stable reference
// ...
TabsContext.Provider value={useMemo(() => ({ items, collection }), [collection, items])}
// ...
function useCollectionIndex() {  // line 45
  const key = useId();
  const { collection } = useTabContext();
  useEffect(() => {
    return () => {
      const idx = collection.indexOf(key);
      if (idx !== -1) collection.splice(idx, 1);
    };
  }, [key, collection]);
  if (!collection.includes(key)) collection.push(key);  // MUTATES the shared array
  return collection.indexOf(key);
}
```

This implements Headless UI-inspired render-order indexing:
1. Each `Tab` calls `useCollectionIndex()` during render
2. The hook pushes a `useId()` key into the shared `collection` array (mutable push, line 56)
3. Returns the index of that key in the array
4. Cleanup removes the key on unmount (line 49-52)

**Implications:**
- This mechanism works ONLY if `Tab` components share the same `collection` array reference via Context
- If Context is bridged (descendant NodeView re-provides the same context value), the `collection` array reference IS shared — bridging works for this pattern
- However: the `push` during render violates React's render-purity expectations. React Compiler may flag this. This is fumadocs' code, not ours — we inherit the constraint.
- The order of `collection.push` depends on React render order — which with portals may differ from DOM order. This is a pre-existing fumadocs concern, not introduced by our bridging.

### Finding 5: fumadocs Accordion uses Radix AccordionPrimitive directly — NO custom context

**Confidence:** CONFIRMED
**Evidence:** `fumadocs-ui/dist/components/accordion.js:1-45`

fumadocs `Accordions` wraps `AccordionPrimitive.Root` (line 28). `Accordion` wraps `AccordionPrimitive.Item` (line 31). Uses `AccordionPrimitive.Header`, `.Trigger`, `.Content`.

No custom Context created by fumadocs for Accordion — it relies entirely on Radix Accordion's internal context (`createContextScope` pattern). Radix Accordion's context contains `{ type, value, onValueChange, collapsible, disabled }` for Root and `{ value }` for Item.

**Implications:**
- For Accordion, we need to bridge only Radix's internal scoped contexts
- Simpler than Tabs (no additional fumadocs context layer)
- But Radix Accordion DOES use Collection hook (for keyboard nav between items) — need to verify

### Finding 6: fumadocs Files/Folder uses Radix Collapsible — stateless container, no compound context

**Confidence:** CONFIRMED
**Evidence:** `fumadocs-ui/dist/components/files.js:1-18`

`Files` is a plain `<div>` wrapper (line 10). `File` is a static display component. `Folder` uses `Collapsible` from Radix (line 17) with local `useState(defaultOpen)` — each Folder is self-contained with its own open/close state.

There is NO parent→child context in the Files/Folder pattern. Each `Folder` is independent — no compound component relationship.

**Implications:**
- Files/Folder does NOT need a Context bridge
- Each Folder's Collapsible state is local — works independently across portals
- The only component in this group that might need bridging is if a user nests a `Folder` inside a custom parent that provides context — but stock fumadocs doesn't

### Finding 7: Radix `createContextScope` is standard React.createContext with scope composition

**Confidence:** CONFIRMED
**Evidence:** `@radix-ui/react-context/dist/index.mjs:1-81`

`createContextScope` (line 20) creates a React Context per call and stores them in a `defaultContexts` array (line 25). The `scope` prop allows overriding which Context instance to use (line 28-34). Without scope override, it falls back to the `BaseContext` created by `React.createContext` (line 23).

The Provider (line 26-31) renders `<Context.Provider value={...}>`. The consumer hook (line 32-39) calls `React.useContext(Context)`.

**This is 100% standard React Context under the hood.** No custom subscription mechanism, no cross-tree capability. The scope system only allows component composition (e.g., using Tabs inside Dialog), not cross-portal propagation.

**Implications:**
- Radix's context WILL break across NodeView portal boundaries — confirmed
- A Context bridge that re-provides the same React Context values in descendant NodeViews IS the correct solution
- The scope composition system means we may need to bridge the correct scope-specific Context objects, not just the values

---

## Critical summary for architecture decision

| Component | Contexts to bridge | Collection hook? | DOM queries? | Bridge complexity |
|---|---|---|---|---|
| fumadocs Tabs | 3 (Radix TabsProvider + fumadocs TabsContext + fumadocs unstyled TabsContext) | No (Radix Tabs doesn't use Collection) | No | Medium |
| fumadocs Accordion | 1-2 (Radix AccordionRoot + AccordionItem contexts) | Possibly (for keyboard nav) | No | Low-Medium |
| fumadocs Files/Folder | 0 (each Folder is self-contained) | No | No | None needed |
| Radix Collapsible | 1 (CollapsibleContext — but local per Folder) | No | No | None needed |

**The key insight: fumadocs Tabs is the hardest case (3 contexts), but it does NOT use Radix Collection hook.** Accordion might use Collection for keyboard focus management between items, but fumadocs wraps it with its own structure that may bypass Collection. Files/Folder needs no bridging at all.

---

## Negative searches

- Searched Radix Tabs source for `collection` import → NOT FOUND. Tabs does not use Collection.
- Searched fumadocs Accordion for custom `createContext` → NOT FOUND. No fumadocs-level context; pure Radix delegation.
- Searched fumadocs Files for `createContext` or `useContext` → NOT FOUND. No context needed.

---

## Gaps / follow-ups

- **Radix Accordion Collection usage:** Need to verify whether `@radix-ui/react-accordion` imports `@radix-ui/react-collection`. If yes, keyboard navigation between AccordionItems in a bridged context may break.
- **Scope object shape for bridging:** The `__scopeTabs` prop in Radix carries a scope object that maps to specific React Context instances. A bridge needs to propagate the correct scope-specific Context, not just raw values. Need to investigate whether we can capture and re-provide the scope.
