# Accordion — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/accordion.js`

## Architecture

Direct wrapper around `@radix-ui/react-accordion`:
- `Accordions` → `AccordionPrimitive.Root`
- `Accordion` → `AccordionPrimitive.Item` containing `AccordionPrimitive.Header` + `AccordionPrimitive.Trigger` + `AccordionPrimitive.Content`

## Children handling — CRITICAL

### `Accordions` component (accordion.js:10-29)
```js
export const Accordions = forwardRef(({ type = 'single', className, defaultValue, ...props }, ref) => {
    // ... state setup ...
    return (
      _jsx(AccordionPrimitive.Root, {
        type: type,
        ref: composedRef,
        value: value,
        onValueChange: setValue,
        collapsible: type === 'single' ? true : undefined,
        className: cn('divide-y divide-fd-border overflow-hidden rounded-lg border bg-fd-card', className),
        ...props  // <-- PASSES children via props spread
      })
    );
});
```

**Key finding:** `Accordions` does NOT filter children. It passes `...props` (including `children`) directly to `AccordionPrimitive.Root`. Radix Accordion Root expects `AccordionPrimitive.Item` children but does NOT validate child types — it uses React context for value/toggle state.

### `Accordion` component (accordion.js:31-45)
```js
export const Accordion = forwardRef(({ title, className, id, value = String(title), children, ...props }, ref) => {
    return (_jsxs(AccordionPrimitive.Item, {
      ref: ref,
      value: value,
      className: cn('scroll-m-24', className),
      ...props,
      children: [
        _jsxs(AccordionPrimitive.Header, { /* trigger UI */ }),
        _jsx(AccordionPrimitive.Content, {
          className: "overflow-hidden data-[state=closed]:animate-fd-accordion-up data-[state=open]:animate-fd-accordion-down",
          children: _jsx("div", {
            className: "px-4 pb-2 text-[0.9375rem] prose-no-margin",
            children: children  // <-- USER CHILDREN GO HERE
          })
        })
      ]
    }));
});
```

**Key finding:** User-provided `children` are rendered inside `AccordionPrimitive.Content` > `<div>`. No type checking, no filtering.

## In-Editor Behavior Prediction

### With NodeViewWrapper wrapping Accordion children:

```
<Accordions>
  <NodeViewWrapper>  ← PM NodeView div
    <Accordion title="Item 1">content 1</Accordion>
  </NodeViewWrapper>
  <NodeViewWrapper>  ← PM NodeView div
    <Accordion title="Item 2">content 2</Accordion>
  </NodeViewWrapper>
</Accordions>
```

**Radix Accordion Item discovery:** `@radix-ui/react-accordion` uses React context for value management, NOT DOM child introspection. `AccordionPrimitive.Item` registers itself with the Root via context when it mounts. The NodeViewWrapper div between Root and Item is transparent to this mechanism.

**Prediction: WORKS** ✅

1. `Accordions` passes children through — NodeViewWrapper divs rendered as extra DOM nodes ✅
2. Each `Accordion` creates an `AccordionPrimitive.Item` that registers via context ✅
3. Expand/collapse toggling should work — Radix state management is context-based ✅
4. CSS animations (`animate-fd-accordion-up/down`) work on the content div ✅

**Caveats:**
- The `divide-y` CSS on Accordions root creates visual separators between direct children. NodeViewWrapper divs are the direct children now, so dividers appear around wrappers, not directly between accordion items. Visual gap may be slightly different.
- URL hash-based auto-open (accordion.js:15-24) uses `document.getElementById(id)` + `element.contains(selected)` — this traverses DOM, so NodeViewWrapper doesn't break it.

## Confidence: HIGH

Radix Accordion is context-based, not DOM-position-based. NodeViewWrapper divs are transparent to the value management. CSS border/divider styling may need minor adjustment.
