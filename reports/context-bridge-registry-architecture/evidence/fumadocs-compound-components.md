# fumadocs Compound Component Context Internals

Evidence file for context-bridge-registry-architecture report.
Source: `node_modules/fumadocs-ui/dist/components/` in Open Knowledge worktree, April 2026.

---

## 1. fumadocs Tabs

**Claim:** fumadocs Tabs has TWO layers: a styled layer (`tabs.js`) with its own `TabsContext`, wrapping an unstyled layer (`tabs.unstyled.js`) with a different `TabsContext`, which in turn wraps Radix `@radix-ui/react-tabs`.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/fumadocs-ui/dist/components/tabs.js` and `tabs.unstyled.js`

### Architecture (three-layer nesting)

```
fumadocs Tabs (tabs.js)
  Unstyled.Tabs (tabs.unstyled.js)
    Radix Primitive.Tabs (@radix-ui/react-tabs)
      Radix TabsProvider (TabsContext from @radix-ui/react-context)
    fumadocs TabsContext.Provider (unstyled layer -- { valueToIdMap })
  fumadocs TabsContext.Provider (styled layer -- { items, collection })
```

### Layer 1: Styled Tabs (`tabs.js`)

#### Context creation

```js
// tabs.js:7-8
const TabsContext = createContext(null);
function useTabContext() {
    const ctx = useContext(TabsContext);
    if (!ctx)
        throw new Error('You must wrap your component in <Tabs>');
    return ctx;
}
```

#### Context value shape

```js
// tabs.js:25 (inside Tabs component)
TabsContext.Provider value: useMemo(() => ({ items, collection }), [collection, items])
```

| Property | Type | Source | Purpose |
|----------|------|--------|---------|
| `items` | `string[] \| undefined` | Props | List of tab names (simple mode) |
| `collection` | `string[]` (mutable array) | `useMemo(() => [], [])` | Tracks render order of Tab children via `useCollectionIndex` |

#### `useCollectionIndex()` -- Headless UI-inspired render-order tracking

```js
// tabs.js:45-58
function useCollectionIndex() {
    const key = useId();
    const { collection } = useTabContext();
    useEffect(() => {
        return () => {
            const idx = collection.indexOf(key);
            if (idx !== -1)
                collection.splice(idx, 1);
        };
    }, [key, collection]);
    if (!collection.includes(key))
        collection.push(key);
    return collection.indexOf(key);
}
```

**Key finding:** This is a mutable array pattern. The `collection` array is created once via `useMemo(() => [], [])` and mutated in place. Each `Tab` child that doesn't pass an explicit `value` prop calls `useCollectionIndex()` which:

1. Gets a stable `useId()` key
2. Pushes it into `collection` array during render (synchronous, not in effect)
3. On cleanup (effect return), splices it out
4. Returns the index

This pattern depends on render order matching desired tab order. It works because React renders children in JSX order.

**Implication for context bridging:** If `Tab` components are rendered in portals, `useCollectionIndex` would:
1. Fail at `useTabContext()` -- no provider in the portal's React tree
2. Even if bridged, render order in portals is not guaranteed to match source order (portals render independently)
3. The mutable array mutation during render is a React anti-pattern that only works because of predictable render ordering

#### Consumer: `Tab` component

```js
// tabs.js:27-35
export function Tab({ value, ...props }) {
    const { items } = useTabContext();
    const resolved = value ??
        items?.at(useCollectionIndex());
    if (!resolved)
        throw new Error('Failed to resolve tab `value`, please pass a `value` prop to the Tab component.');
    return (_jsx(TabsContent, { value: escapeValue(resolved), ...props }));
}
```

`Tab` reads:
- `items` from TabsContext (to resolve value by index)
- If no explicit `value`, uses `useCollectionIndex()` to infer from render order

**If `value` is always explicitly provided**, `Tab` only needs `items` from context (and only to validate -- it could work without it).

#### Consumer: `TabsContent` (styled layer)

```js
// tabs.js:36-38
export function TabsContent({ value, className, ...props }) {
    return (_jsx(Unstyled.TabsContent, { value: value, forceMount: true, /* ... */ }));
}
```

`TabsContent` does NOT read from the fumadocs TabsContext. It just passes through to the unstyled layer. The `forceMount: true` + `data-[state=inactive]:hidden` pattern means ALL tab panels are always in the DOM (hidden via CSS), not conditionally rendered.

### Layer 2: Unstyled Tabs (`tabs.unstyled.js`)

#### Context creation

```js
// tabs.unstyled.js:16-22
const TabsContext = createContext(null);
function useTabContext() {
    const ctx = useContext(TabsContext);
    if (!ctx)
        throw new Error('You must wrap your component in <Tabs>');
    return ctx;
}
```

**This is a DIFFERENT `TabsContext` than the styled layer's.** Same variable name, different module, different `createContext()` call.

#### Context value shape

```js
// tabs.unstyled.js:80
TabsContext.Provider value: useMemo(() => ({ valueToIdMap }), [valueToIdMap])
```

| Property | Type | Source | Purpose |
|----------|------|--------|---------|
| `valueToIdMap` | `Map<string, string>` | `useMemo(() => new Map(), [])` | Maps tab value -> DOM id for anchor/hash navigation |

#### Consumer: `TabsContent` (unstyled layer)

```js
// tabs.unstyled.js:82-88
export function TabsContent({ value, ...props }) {
    const { valueToIdMap } = useTabContext();
    if (props.id) {
        valueToIdMap.set(value, props.id);
    }
    return (_jsx(Primitive.TabsContent, { value: value, ...props }));
}
```

Reads `valueToIdMap` from unstyled TabsContext. Mutates it during render (`valueToIdMap.set(value, props.id)`) -- another mutable-during-render pattern.

#### Group synchronization (`listeners` Map)

```js
// tabs.unstyled.js:6-15
const listeners = new Map();
function addChangeListener(id, listener) {
    const list = listeners.get(id) ?? [];
    list.push(listener);
    listeners.set(id, list);
}
function removeChangeListener(id, listener) {
    const list = listeners.get(id) ?? [];
    listeners.set(id, list.filter((item) => item !== listener));
}
```

**Key finding:** fumadocs uses a MODULE-LEVEL `listeners` Map for tab group synchronization (`groupId` prop). When one Tabs instance changes value, ALL Tabs instances with the same `groupId` are notified. This is NOT React Context -- it's a module-level event bus.

```js
// tabs.unstyled.js:68-79
if (groupId) {
    listeners.get(groupId)?.forEach((item) => {
        item(v);
    });
    if (persist)
        localStorage.setItem(groupId, v);
    else
        sessionStorage.setItem(groupId, v);
} else {
    setValue(v);
}
```

**Implication for context bridging:** The `groupId` synchronization is module-level and would work across portals automatically (same JS module, same Map). But the fumadocs TabsContext (both layers) and the Radix TabsContext still need bridging for proper rendering.

### Layer 3: Radix Tabs (underneath)

The unstyled layer wraps Radix `Primitive.Tabs` which provides its own `TabsProvider` with `{ baseId, value, onValueChange, orientation, dir, activationMode }`. See `radix-context-internals.md` section 2.

### Complete context stack for a Tab child

A `Tab` component rendered inside fumadocs `Tabs` must have access to:

1. **fumadocs styled TabsContext** -- `{ items, collection }`
2. **fumadocs unstyled TabsContext** -- `{ valueToIdMap }`
3. **Radix TabsContext** -- `{ baseId, value, onValueChange, orientation, dir, activationMode }`
4. **Radix RovingFocusGroup contexts** (only if TabsTrigger, not needed for content)

---

## 2. fumadocs Accordion

**Claim:** fumadocs Accordion is a thin styled wrapper around Radix Accordion. It adds NO custom Context. All context dependency is from Radix.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/fumadocs-ui/dist/components/accordion.js`

### Implementation

```js
// accordion.js:10-29
export const Accordions = forwardRef(({ type = 'single', className, defaultValue, ...props }, ref) => {
    const rootRef = useRef(null);
    const [value, setValue] = useState(/* ... */);
    // hash-based auto-open logic
    return (
        _jsx(AccordionPrimitive.Root, { type, ref, value, onValueChange: setValue, /* ... */ })
    );
});
```

```js
// accordion.js:31-45
export const Accordion = forwardRef(({ title, className, id, value = String(title), children, ...props }, ref) => {
    return (
        _jsxs(AccordionPrimitive.Item, { ref, value, children: [
            _jsxs(AccordionPrimitive.Header, { /* ... */ children: [
                _jsxs(AccordionPrimitive.Trigger, { /* ... */ }),
                id ? _jsx(CopyButton, { id }) : null
            ]}),
            _jsx(AccordionPrimitive.Content, { children: _jsx("div", { children }) })
        ]})
    );
});
```

### Context dependency

fumadocs `Accordions` and `Accordion` create NO custom React Context. They are purely styled wrappers. All context requirements come from Radix:

| Radix Context | Needed by | Values |
|---------------|-----------|--------|
| AccordionValueContext | AccordionItem (inside Accordion) | `value[]`, `onItemOpen`, `onItemClose` |
| AccordionCollapsibleContext | AccordionTrigger | `collapsible` |
| AccordionImplContext | AccordionItem, Header, Trigger, Content | `disabled`, `orientation`, `direction` |
| AccordionItemContext | AccordionHeader, Trigger, Content | `open`, `disabled`, `triggerId` |
| CollapsibleContext | CollapsibleContent (inside AccordionContent) | `open`, `disabled`, `contentId` |
| CollectionContext | AccordionTrigger (for keyboard nav) | `collectionRef`, `itemMap` |

### Hash-based auto-open

```js
// accordion.js:14-25
useEffect(() => {
    const id = window.location.hash.substring(1);
    const element = rootRef.current;
    if (!element || id.length === 0) return;
    const selected = document.getElementById(id);
    if (!selected || !element.contains(selected)) return;
    const value = selected.getAttribute('data-accordion-value');
    if (value)
        setValue((prev) => (typeof prev === 'string' ? value : [value, ...prev]));
}, []);
```

Uses DOM queries (`document.getElementById`, `element.contains`, `getAttribute`) for hash-based auto-open. This is a DOM-level pattern that would work across portals if the accordion header has the right `id` and `data-accordion-value` attributes.

**Implication for context bridging:** Since fumadocs Accordion adds no custom context, bridging Accordion is purely a Radix bridging problem. The fumadocs layer is transparent. However, this also means all the Radix complexity (4 contexts + Collection + Collapsible scope) applies in full.

---

## 3. fumadocs Files (Folder/File)

**Claim:** fumadocs Files uses NO custom React Context. Each Folder is an independent Collapsible instance with local state.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/fumadocs-ui/dist/components/files.js`

### Implementation

```js
// files.js:9-11
export function Files({ className, ...props }) {
    return (_jsx("div", { className: cn('not-prose rounded-md border bg-fd-card p-2', className), ...props }));
}
```

`Files` is a plain styled `<div>`. No context provider.

```js
// files.js:12-14
export function File({ name, icon = _jsx(FileIcon, {}), className, ...rest }) {
    return (_jsxs("div", { className: cn(itemVariants({ className })), ...rest, children: [icon, name] }));
}
```

`File` is a plain styled `<div>`. No context consumption.

```js
// files.js:15-18
export function Folder({ name, defaultOpen = false, ...props }) {
    const [open, setOpen] = useState(defaultOpen);
    return (_jsxs(Collapsible, { open, onOpenChange: setOpen, ...props, children: [
        _jsxs(CollapsibleTrigger, { /* ... */ children: [icon, name] }),
        _jsx(CollapsibleContent, { children: _jsx("div", { children: props.children }) })
    ]}));
}
```

Each `Folder` creates its own independent Collapsible with local `useState(defaultOpen)`. No shared context between folders, no registration pattern.

### Context dependency

| Context | Source | Needed by |
|---------|--------|-----------|
| CollapsibleContext | Radix (via fumadocs ui/collapsible wrapper) | CollapsibleTrigger, CollapsibleContent inside each Folder |

The fumadocs `Collapsible` wrapper (`ui/collapsible.js`) is itself a thin layer:

```js
// ui/collapsible.js:6-7
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
```

Direct re-exports of Radix primitives with styled CollapsibleContent.

**Implication for context bridging:** Files/Folder is the simplest case. No compound-component context to bridge. Each Folder is self-contained. If a Folder is rendered in a portal, it works autonomously because all state is local. The only context dependency is the Radix Collapsible context WITHIN the Folder itself, which is already self-provided.

---

## 4. fumadocs Callout

**Claim:** fumadocs Callout uses NO React Context. Pure composition via children slots.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/fumadocs-ui/dist/components/callout.js`

```js
export function Callout({ children, title, ...props }) {
    return (_jsxs(CalloutContainer, { ...props, children: [
        title && _jsx(CalloutTitle, { children: title }),
        _jsx(CalloutDescription, { children: children })
    ]}));
}
```

All components (`Callout`, `CalloutContainer`, `CalloutTitle`, `CalloutDescription`) are plain styled divs. No context, no refs, no registration. Type-based styling uses CSS custom properties (`--callout-color`).

**Implication for context bridging:** None needed. Works in any render tree position.

---

## 5. fumadocs Steps

**Claim:** fumadocs Steps uses NO React Context. Pure CSS-based styling.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/fumadocs-ui/dist/components/steps.js`

```js
export function Steps({ children }) {
    return _jsx("div", { className: "fd-steps", children: children });
}
export function Step({ children }) {
    return _jsx("div", { className: "fd-step", children: children });
}
```

Purely CSS class-based. No JavaScript state, no context, no refs.

**Implication for context bridging:** None needed.

---

## 6. DOM-Level Queries in fumadocs Components

**Claim:** fumadocs components use DOM-level queries only for hash-based navigation, not for parent-child communication.

**Confidence:** CONFIRMED

**Evidence:**

1. **Accordion** (accordion.js:14-25): `document.getElementById(hash)` + `element.contains(selected)` + `getAttribute('data-accordion-value')` -- for auto-opening accordion items based on URL hash

2. **Unstyled Tabs** (tabs.unstyled.js:49-60): `window.location.hash` + `tabsRef.current?.scrollIntoView()` -- for hash-based tab selection

3. **Unstyled Tabs** (tabs.unstyled.js:62-66): `window.history.replaceState` -- for updating URL hash on tab change

None of these are used for parent-child state communication. All parent-child communication flows through React Context (fumadocs's own or Radix's).

---

## 7. Summary: Context Bridge Requirements per Component

### Components needing NO bridge (self-contained)

| Component | Reason |
|-----------|--------|
| `Files` | Plain `<div>` wrapper |
| `File` | Plain `<div>` |
| `Folder` | Self-contained Collapsible with local state |
| `Callout` | Plain composition, no context |
| `Steps` / `Step` | Pure CSS classes |

### Components needing context bridge

| Component | Contexts to bridge | Complexity |
|-----------|-------------------|------------|
| fumadocs `Tab` (content panel) | 3 contexts (fumadocs styled + unstyled + Radix Tabs) | Medium |
| fumadocs `Accordion` (item) | 5+ contexts (all Radix: Value, Collapsible-flag, Impl, Item, Collapsible) + Collection | High |

### Simplification opportunity

If component blocks always provide explicit `value` props to `Tab` children (bypassing `useCollectionIndex`), the fumadocs styled TabsContext can be avoided. The bridge would only need:
1. Unstyled TabsContext `{ valueToIdMap }` -- or skip if no hash navigation needed
2. Radix TabsContext `{ baseId, value, onValueChange, orientation, dir, activationMode }`

For Accordion, if each AccordionItem is self-contained (trigger + content together), no bridge is needed -- the item provides its own AccordionItemContext and Collapsible internally. The bridge is only needed if AccordionContent is separated from AccordionItem across a portal boundary.

---

## 8. Mutation-During-Render Patterns

**Claim:** fumadocs uses mutable-state-during-render patterns that are fragile under portals and React concurrent mode.

**Confidence:** CONFIRMED

**Evidence:**

1. **`useCollectionIndex`** (tabs.js:55-56):
   ```js
   if (!collection.includes(key))
       collection.push(key);
   return collection.indexOf(key);
   ```
   Mutates a mutable array during render. Works only because React renders children sequentially in the current reconciler.

2. **`TabsContent` valueToIdMap** (tabs.unstyled.js:84-85):
   ```js
   if (props.id) {
       valueToIdMap.set(value, props.id);
   }
   ```
   Mutates a Map during render.

**Implication for context bridging:** These patterns assume sequential render order. In a portal, render order is decoupled from source order. If we need `useCollectionIndex` to work in portaled Tab components, we must either:
1. Always provide explicit `value` props (bypassing the collection mechanism)
2. Build a custom registration mechanism that doesn't depend on render order

Explicit `value` props is strongly preferred.
