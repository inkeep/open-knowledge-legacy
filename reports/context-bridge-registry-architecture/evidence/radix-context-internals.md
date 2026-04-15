# Radix UI Context Internals

Evidence file for context-bridge-registry-architecture report.
Source: `node_modules/@radix-ui/react-*` in Open Knowledge worktree, April 2026.

---

## 1. @radix-ui/react-context Package

**Claim:** Radix's context package is a thin wrapper around `React.createContext` with scope support. It provides zero cross-tree or cross-portal capabilities.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/@radix-ui/react-context/dist/index.mjs`

The package exports two functions:

### 1a. `createContext(rootComponentName, defaultContext)`

```js
// index.mjs:4-19
function createContext2(rootComponentName, defaultContext) {
  const Context = React.createContext(defaultContext);
  const Provider = (props) => {
    const { children, ...context } = props;
    const value = React.useMemo(() => context, Object.values(context));
    return jsx(Context.Provider, { value, children });
  };
  Provider.displayName = rootComponentName + "Provider";
  function useContext2(consumerName) {
    const context = React.useContext(Context);
    if (context) return context;
    if (defaultContext !== void 0) return defaultContext;
    throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
  }
  return [Provider, useContext2];
}
```

This is `React.createContext` with:
- Auto-memoized provider value (via `useMemo` keyed on `Object.values(context)`)
- Named error messages when context is missing
- Returns `[Provider, useHook]` tuple

### 1b. `createContextScope(scopeName, createContextScopeDeps)`

```js
// index.mjs:20-56
function createContextScope(scopeName, createContextScopeDeps = []) {
  let defaultContexts = [];
  function createContext3(rootComponentName, defaultContext) {
    const BaseContext = React.createContext(defaultContext);
    const index = defaultContexts.length;
    defaultContexts = [...defaultContexts, defaultContext];
    const Provider = (props) => {
      const { scope, children, ...context } = props;
      const Context = scope?.[scopeName]?.[index] || BaseContext;
      const value = React.useMemo(() => context, Object.values(context));
      return jsx(Context.Provider, { value, children });
    };
    // ...
    function useContext2(consumerName, scope) {
      const Context = scope?.[scopeName]?.[index] || BaseContext;
      const context = React.useContext(Context);
      // ...
    }
    return [Provider, useContext2];
  }
  // ...
}
```

Scope support allows composing contexts across Radix primitives (e.g., Accordion composes Collapsible's scope). The `scope` prop is an object mapping `scopeName -> Context[]`. This is purely for allowing a parent primitive to inject its own Context instances into a child primitive, NOT for cross-portal bridging.

**Implication for context bridging:** The entire `@radix-ui/react-context` package delegates to `React.createContext` / `React.useContext`. These follow React's tree hierarchy. When a component renders inside a React portal, it is disconnected from its parent's React tree Context -- the portal creates a new tree branch at the portal target. Radix does nothing to work around this. Every Radix component that uses `useTabsContext`, `useAccordionContext`, etc. will throw "must be used within" errors if rendered inside a portal that detaches from the provider.

---

## 2. @radix-ui/react-tabs

**Claim:** Tabs uses a single React Context containing value state + callbacks. No DOM-level tracking. Pure Context dependency.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/@radix-ui/react-tabs/dist/index.mjs`

### Context creation

```js
// index.mjs:16-20
var [createTabsContext, createTabsScope] = createContextScope(TABS_NAME, [
  createRovingFocusGroupScope
]);
var useRovingFocusGroupScope = createRovingFocusGroupScope();
var [TabsProvider, useTabsContext] = createTabsContext(TABS_NAME);
```

One context: `TabsContext`. Composes `RovingFocusGroupScope` for keyboard navigation.

### Context value shape (provided by Tabs root)

```js
// index.mjs:40-49 (TabsProvider props)
{
  scope: __scopeTabs,
  baseId: useId(),          // string - stable ID for aria relationships
  value: value,             // string - currently active tab value
  onValueChange: setValue,  // (value: string) => void
  orientation: orientation, // 'horizontal' | 'vertical'
  dir: direction,           // 'ltr' | 'rtl'
  activationMode: activationMode, // 'automatic' | 'manual'
}
```

### Consumer usage

- **TabsList** (line 66-91): reads `context.orientation`, `context.dir` for aria attrs. Also uses `useRovingFocusGroupScope` for keyboard navigation scope.
- **TabsTrigger** (line 93-143): reads `context.baseId` (for aria IDs), `context.value` (to compute `isSelected`), `context.onValueChange` (click/key handlers), `context.activationMode` (focus behavior).
- **TabsContent** (line 145-178): reads `context.baseId` (for aria IDs), `context.value` (to determine `isSelected`), `context.orientation`.

### RovingFocusGroup dependency

TabsList wraps its children in `RovingFocusGroup.Root`, and each TabsTrigger is wrapped in `RovingFocusGroup.Item`. RovingFocusGroup uses Collection (see section 5). This means Tabs has an *indirect* dependency on Collection for keyboard navigation.

**Implication for context bridging:** If TabsTrigger is rendered in a portal (detached from Tabs), it will fail:
1. `useTabsContext` throws -- no TabsProvider above it
2. `useRovingFocusGroupScope` fails -- no roving focus provider
3. Even if context were bridged, Collection tracking would fail (see section 5)

For TabsContent in a portal: same `useTabsContext` failure, but TabsContent does NOT participate in Collection or RovingFocusGroup, so only the single TabsContext needs bridging.

---

## 3. @radix-ui/react-accordion

**Claim:** Accordion uses FOUR nested Contexts plus Collection plus Collapsible scope. Most complex context nesting of the three.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/@radix-ui/react-accordion/dist/index.mjs`

### Context creation

```js
// index.mjs:18-23
var [Collection, useCollection, createCollectionScope] = createCollection(ACCORDION_NAME);
var [createAccordionContext, createAccordionScope] = createContextScope(ACCORDION_NAME, [
  createCollectionScope,
  createCollapsibleScope
]);
var useCollapsibleScope = createCollapsibleScope();
```

### Four distinct contexts

1. **AccordionValueContext** (line 33):
   ```js
   var [AccordionValueProvider, useAccordionValueContext] = createAccordionContext(ACCORDION_NAME);
   // Shape: { value: string[], onItemOpen: (v) => void, onItemClose: (v) => void }
   ```

2. **AccordionCollapsibleContext** (line 34-36):
   ```js
   var [AccordionCollapsibleProvider, useAccordionCollapsibleContext] = createAccordionContext(
     ACCORDION_NAME, { collapsible: false }
   );
   // Shape: { collapsible: boolean }
   ```

3. **AccordionImplContext** (line 99):
   ```js
   var [AccordionImplProvider, useAccordionContext] = createAccordionContext(ACCORDION_NAME);
   // Shape: { disabled: boolean, direction: string, orientation: 'vertical' | 'horizontal' }
   ```

4. **AccordionItemContext** (line 191):
   ```js
   var [AccordionItemProvider, useAccordionItemContext] = createAccordionContext(ITEM_NAME);
   // Shape: { open: boolean, disabled: boolean, triggerId: string }
   ```

### Nesting structure

```
Accordion (root)
  Collection.Provider          -- Collection context
    AccordionValueProvider     -- value + onItemOpen/onItemClose
      AccordionCollapsibleProvider  -- collapsible flag
        AccordionImplProvider  -- disabled, direction, orientation
          Collection.Slot      -- Collection slot ref
            <div>              -- actual DOM

AccordionItem
  AccordionItemProvider        -- open, disabled, triggerId
    CollapsiblePrimitive.Root  -- Collapsible context (scope-injected)

AccordionTrigger
  Collection.ItemSlot          -- registers in Collection
    CollapsiblePrimitive.Trigger

AccordionContent
  CollapsiblePrimitive.Content
```

### Consumer dependencies

- **AccordionItem**: reads AccordionContext (orientation), AccordionValueContext (value array), uses CollapsibleScope
- **AccordionHeader**: reads AccordionContext (orientation), AccordionItemContext (open, disabled)
- **AccordionTrigger**: reads AccordionContext (orientation), AccordionItemContext (open, triggerId), AccordionCollapsibleContext (collapsible), CollapsibleScope. Registers in Collection.
- **AccordionContent**: reads AccordionContext (orientation), AccordionItemContext (triggerId), CollapsibleScope

### Keyboard navigation via Collection

```js
// index.mjs:105-111 (AccordionImpl)
const getItems = useCollection(__scopeAccordion);
// ...
const triggerCollection = getItems().filter((item) => !item.ref.current?.disabled);
const triggerIndex = triggerCollection.findIndex((item) => item.ref.current === target);
```

Arrow key handling uses `getItems()` from Collection to find triggers for focus management. This is the legacy Collection (querySelectorAll-based, see section 5).

**Implication for context bridging:** Accordion is the hardest to bridge. Five contexts (4 Accordion + 1 Collapsible) must all be present. Collection tracking must work. Each AccordionItem creates its own AccordionItemContext + Collapsible scope. If AccordionContent were portaled away from AccordionItem, it would lose both AccordionItemContext and CollapsibleContext.

---

## 4. @radix-ui/react-collapsible

**Claim:** Collapsible uses a single React Context for open/close state.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/@radix-ui/react-collapsible/dist/index.mjs`

### Context creation

```js
// index.mjs:14-16
var [createCollapsibleContext, createCollapsibleScope] = createContextScope(COLLAPSIBLE_NAME);
var [CollapsibleProvider, useCollapsibleContext] = createCollapsibleContext(COLLAPSIBLE_NAME);
```

### Context value shape

```js
// index.mjs:33-41 (CollapsibleProvider props)
{
  scope: __scopeCollapsible,
  disabled: boolean,
  contentId: string,        // useId() for aria-controls
  open: boolean,
  onOpenToggle: () => void, // toggles open state
}
```

### Consumer usage

- **CollapsibleTrigger** (line 56-75): reads `context.contentId`, `context.open`, `context.disabled`, `context.onOpenToggle`
- **CollapsibleContent** (line 78-84): reads `context.open` (for Presence), then **CollapsibleContentImpl** reads `context.open`, `context.disabled`, `context.contentId`

### No Collection, no DOM queries

Collapsible is a simple open/close primitive. No Collection tracking, no querySelectorAll, no ref registration. Pure Context.

**Implication for context bridging:** Simplest to bridge of the three. Single context with 4 properties. If CollapsibleContent is portaled, bridging one context is sufficient. No DOM-ordering concerns.

---

## 5. @radix-ui/react-collection -- CRITICAL ANALYSIS

**Claim:** Collection uses BOTH React Context (for registration) AND DOM-level queries (for ordering). The legacy version uses `querySelectorAll`; the new version uses `compareDocumentPosition`. Both rely on DOM nesting being correct.

**Confidence:** CONFIRMED

**Evidence:** `node_modules/@radix-ui/react-collection/dist/index.mjs`

### Two implementations coexist

The file exports both:
- `createCollection` -- legacy (used by Accordion, RovingFocusGroup)
- `unstable_createCollection` -- new OrderedDict-based version

### Legacy Collection (createCollection)

#### Context shape

```js
// index.mjs:12-14
var [CollectionProviderImpl, useCollectionContext] = createCollectionContext(
  PROVIDER_NAME,
  { collectionRef: { current: null }, itemMap: new Map() }
);
```

Shape: `{ collectionRef: RefObject<HTMLElement>, itemMap: Map<RefObject, ItemData> }`

#### Item registration (React Context)

```js
// index.mjs:37-49
const CollectionItemSlot = React.forwardRef((props, forwardedRef) => {
  const { scope, children, ...itemData } = props;
  const ref = React.useRef(null);
  const composedRefs = useComposedRefs(forwardedRef, ref);
  const context = useCollectionContext(ITEM_SLOT_NAME, scope);
  React.useEffect(() => {
    context.itemMap.set(ref, { ref, ...itemData });
    return () => void context.itemMap.delete(ref);
  });
  return jsx(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
});
```

Items register in Context via `context.itemMap.set(ref, data)`. This requires React Context access -- **breaks across portals**.

#### Item ordering (DOM-level querySelectorAll)

```js
// index.mjs:51-63
function useCollection(scope) {
  const context = useCollectionContext(name + "CollectionConsumer", scope);
  const getItems = React.useCallback(() => {
    const collectionNode = context.collectionRef.current;
    if (!collectionNode) return [];
    const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
    const items = Array.from(context.itemMap.values());
    const orderedItems = items.sort(
      (a, b) => orderedNodes.indexOf(a.ref.current) - orderedNodes.indexOf(b.ref.current)
    );
    return orderedItems;
  }, [context.collectionRef, context.itemMap]);
  return getItems;
}
```

**Key finding:** `getItems()` does `collectionNode.querySelectorAll('[data-radix-collection-item]')` on the DOM tree, then sorts the registered items by their DOM order. This means:

1. **Registration** requires React Context (breaks across portals)
2. **Ordering** requires DOM containment under `collectionNode` (`querySelectorAll` only finds descendants)

If an item is rendered in a React portal but the portal target is inside the same DOM subtree as the collection root, the querySelectorAll would still find it. But the React Context registration would fail first.

### New Collection (unstable_createCollection / createCollection2)

```js
// index.mjs:385-510
```

#### Context shape

```js
// index.mjs:388-397
{
  collectionElement: null,        // HTMLElement | null
  collectionRef: { current: null }, // composed ref callback
  collectionRefObject: { current: null }, // raw ref
  itemMap: new OrderedDict(),     // OrderedDict (extends Map)
  setItemMap: () => void 0        // state setter for itemMap
}
```

#### Item registration

```js
// index.mjs:455-489
React.useEffect(() => {
  const itemData2 = memoizedItemData;
  setItemMap((map) => {
    if (!element) return map;
    if (!map.has(element)) {
      map.set(element, { ...itemData2, element });
      return map.toSorted(sortByDocumentPosition);
    }
    return map.set(element, { ...itemData2, element }).toSorted(sortByDocumentPosition);
  });
  return () => {
    setItemMap((map) => {
      if (!element || !map.has(element)) return map;
      map.delete(element);
      return new OrderedDict(map);
    });
  };
}, [element, memoizedItemData, setItemMap]);
```

#### Item ordering

```js
// index.mjs:524-528
function sortByDocumentPosition(a, b) {
  return !a[1].element || !b[1].element ? 0 : isElementPreceding(a[1].element, b[1].element) ? -1 : 1;
}
function isElementPreceding(a, b) {
  return !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING);
}
```

The new version uses `compareDocumentPosition` instead of `querySelectorAll`. This means ordering works across portals (since `compareDocumentPosition` works on any two DOM nodes regardless of parent-child relationship). BUT registration still goes through React Context via `setItemMap` from `useCollectionContext`.

#### MutationObserver

```js
// index.mjs:416-426
React2.useEffect(() => {
  if (!collectionElement) return;
  const observer = getChildListObserver(() => {});
  observer.observe(collectionElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}, [collectionElement]);
```

The new version sets up a MutationObserver on the collection root for childList changes. The callback is currently a no-op (`() => {}`), suggesting this is infrastructure for future reactivity to DOM changes.

### Which version do Tabs/Accordion use?

Accordion (line 18): `var [Collection, useCollection, createCollectionScope] = createCollection(ACCORDION_NAME);` -- **legacy**

RovingFocusGroup (used by Tabs, line 18): `var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);` -- **legacy**

Both use the legacy `createCollection` with `querySelectorAll`-based ordering.

**Implication for context bridging:** Collection is a dual-mechanism system:
1. React Context for registration -- BREAKS across portals
2. DOM queries for ordering -- would work across portals IF registration worked

For our use case (component blocks in TipTap NodeView portals), Collection registration will fail because CollectionItemSlot calls `useCollectionContext` which requires being inside a CollectionProvider in the React tree. Even if we bridge the parent Context (Tabs, Accordion), the Collection Context is a separate context that also needs bridging.

---

## 6. Radix DOM-level Registration Summary

**Claim:** Radix does NOT use DOM-level registration (refs tracked in a Set) alongside Context in a way that would independently work across portals. All registration paths go through React Context first.

**Confidence:** CONFIRMED

**Evidence:** All components analyzed above.

The only DOM-level operations are:
1. **Legacy Collection** `querySelectorAll('[data-radix-collection-item]')` -- for ordering after React Context registration
2. **New Collection** `compareDocumentPosition` -- for ordering after React Context registration
3. **New Collection** `MutationObserver` on collection root -- currently no-op callback
4. **RovingFocusGroup** `CustomEvent` dispatch on the group DOM element (`ENTRY_FOCUS`) -- for entry focus behavior
5. **Collapsible** `getBoundingClientRect` -- for measuring content height/width animations

None of these provide an alternative registration path that bypasses React Context. Every component's primary state communication flows through `React.createContext` / `React.useContext`.

**Implication for context bridging:** There is no "escape hatch" in Radix that would let portaled children participate in their parent's compound component automatically. A context bridge is the only viable approach. The bridge must forward ALL contexts that the child depends on, including Collection contexts and composed scope contexts.

---

## 7. Complete Context Inventory for Bridging

### Tabs (minimal bridge for TabsContent only)

| Context | Provider | Consumer | Values needed |
|---------|----------|----------|---------------|
| TabsContext | Tabs (root) | TabsContent | `baseId`, `value`, `orientation` |

TabsContent does NOT use Collection or RovingFocusGroup. Only TabsTrigger does (via TabsList). So if we only need to bridge content panels (not triggers), one context suffices.

### Accordion (bridge for AccordionContent)

| Context | Provider | Consumer | Values needed |
|---------|----------|----------|---------------|
| AccordionImplContext | AccordionImpl | AccordionContent | `orientation` |
| AccordionItemContext | AccordionItem | AccordionContent | `triggerId` |
| CollapsibleContext | Collapsible (via AccordionItem) | CollapsibleContent (inside AccordionContent) | `open`, `disabled`, `contentId` |

AccordionContent delegates to CollapsiblePrimitive.Content which reads CollapsibleContext. The scope injection (`useCollapsibleScope`) creates scope-specific Context instances, making bridging harder -- you need the exact same Context object reference.

### Collapsible (bridge for CollapsibleContent)

| Context | Provider | Consumer | Values needed |
|---------|----------|----------|---------------|
| CollapsibleContext | Collapsible | CollapsibleContent | `open`, `disabled`, `contentId` |

Single context. Simplest bridge target.

---

## 8. Scope System Implications for Bridging

**Claim:** Radix's scope system creates fresh `React.createContext()` instances per scope, making it impossible to bridge contexts by reference unless you capture the exact Context object from the scope.

**Confidence:** CONFIRMED

**Evidence:** `react-context/dist/index.mjs:42-53`

```js
const createScope = () => {
  const scopeContexts = defaultContexts.map((defaultContext) => {
    return React.createContext(defaultContext);
  });
  return function useScope(scope) {
    const contexts = scope?.[scopeName] || scopeContexts;
    return React.useMemo(
      () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
      [scope, contexts]
    );
  };
};
```

When Accordion creates a Collapsible scope via `createCollapsibleScope()`, it gets a DIFFERENT set of React.Context objects than standalone Collapsible uses. The Provider selects which Context to use based on the `scope` prop:

```js
const Context = scope?.[scopeName]?.[index] || BaseContext;
```

This means a naive bridge that re-creates `<CollapsibleProvider>` around portaled content would use the BaseContext, not the scope-injected one. The bridge must either:
1. Capture the scope object from the parent and pass it through, or
2. Intercept the context values at consumption time rather than re-providing them

**Implication:** A generic "bridge all Radix contexts" approach is not feasible. Each compound component needs its own bridge configuration that understands which contexts and scopes are in play.
