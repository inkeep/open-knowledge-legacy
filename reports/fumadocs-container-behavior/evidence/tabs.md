# Tabs — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/tabs.js`
**Unstyled layer:** `node_modules/fumadocs-ui/dist/components/tabs.unstyled.js`

## Architecture

Three-layer stack:
1. `@radix-ui/react-tabs` (Primitive) — accessed via `tabs.unstyled.js`
2. `tabs.unstyled.js` — adds groupId persistence (localStorage/sessionStorage), hash-anchor sync, cross-tab sync via `listeners` Map
3. `tabs.js` — styled layer; adds `TabsContext`, `useCollectionIndex`, `escapeValue`

## Children filtering mechanism — CRITICAL

### `Tabs` component (tabs.js:18-26)
```js
export function Tabs({ ref, className, items, label, defaultIndex = 0, defaultValue = items ? escapeValue(items[defaultIndex]) : undefined, ...props }) {
    const [value, setValue] = useState(defaultValue);
    const collection = useMemo(() => [], []);
    return (_jsxs(Unstyled.Tabs, {
      ...,
      children: [
        items && (/* TabsList with triggers from items array */),
        _jsx(TabsContext.Provider, {
          value: useMemo(() => ({ items, collection }), [collection, items]),
          children: props.children  // <-- PASSES CHILDREN THROUGH
        })
      ]
    }));
}
```

**Key finding:** `Tabs` does NOT filter children. It passes `props.children` directly into a `TabsContext.Provider`. The filtering is done by Radix `TabsContent` visibility.

### `Tab` component (tabs.js:27-35)
```js
export function Tab({ value, ...props }) {
    const { items } = useTabContext();  // <-- REQUIRES TabsContext
    const resolved = value ?? items?.at(useCollectionIndex());
    if (!resolved)
        throw new Error('Failed to resolve tab `value`...');
    return (_jsx(TabsContent, { value: escapeValue(resolved), ...props, children: props.children }));
}
```

**Key finding:** `Tab` uses `useTabContext()` which throws if not inside `<Tabs>`. The `useCollectionIndex()` hook uses `useId()` + a mutable array to track render order. `Tab` does NOT check sibling types — it only needs context.

### `TabsContent` (tabs.js:36-38)
```js
export function TabsContent({ value, className, ...props }) {
    return (_jsx(Unstyled.TabsContent, {
      value: value,
      forceMount: true,
      className: cn('... data-[state=inactive]:hidden', className),
      ...props,
      children: props.children
    }));
}
```

**Key finding:** Uses `forceMount: true` + CSS `data-[state=inactive]:hidden`. All tabs are always mounted in DOM but hidden via CSS. This is GOOD for editor use — all content is in the DOM.

### Unstyled `TabsContent` (tabs.unstyled.js:82-88)
```js
export function TabsContent({ value, ...props }) {
    const { valueToIdMap } = useTabContext();
    if (props.id) { valueToIdMap.set(value, props.id); }
    return (_jsx(Primitive.TabsContent, { value: value, ...props, children: props.children }));
}
```

Delegates to `@radix-ui/react-tabs` `TabsContent`.

## In-Editor Behavior Prediction

### With NodeViewWrapper wrapping Tab children:

When our editor renders:
```
<Tabs items={['Tab 1', 'Tab 2']}>
  <NodeViewWrapper>  ← PM NodeView div
    <Tab value="Tab 1">content 1</Tab>
  </NodeViewWrapper>
  <NodeViewWrapper>  ← PM NodeView div  
    <Tab value="Tab 2">content 2</Tab>
  </NodeViewWrapper>
</Tabs>
```

**Prediction: WORKS with caveats**

1. `Tabs` passes children through to `TabsContext.Provider` — NodeViewWrapper divs are transparent here ✅
2. Each `Tab` inside NodeViewWrapper calls `useTabContext()` — context propagates through DOM wrappers ✅
3. `useCollectionIndex()` uses React render order — NodeViewWrapper doesn't break this ✅
4. Radix `TabsContent` uses `forceMount: true` + CSS hiding — works regardless of wrapper DOM ✅

**BUT:**
- Tab switching (clicking tab triggers) requires the `Tabs` component's `value`/`onValueChange` state to work. In the editor, user can interact with tab triggers.
- If `items` prop isn't provided, `Tab` falls back to `useCollectionIndex()` which should still work through wrappers.

### Without `items` prop (auto-detection mode):
If Tabs doesn't receive `items`, no TabsList is rendered. Tab order detection via `useCollectionIndex` still works because it uses React context, not DOM position.

## Confidence: HIGH

Tabs is the most complex P0 container, but it delegates to Radix primitives that use React context (not DOM introspection). NodeViewWrapper divs should be transparent to the context chain.

**Primary risk:** CSS specificity conflicts between fumadocs Tailwind classes and our editor styles. The `forceMount: true` + `data-[state=inactive]:hidden` pattern means all tab panels are in DOM — if our editor CSS overrides the `hidden` state, all tabs would show simultaneously (which is actually OK for editor UX).
