# Evidence: Visual Editors & Component Registration Patterns (D5)

**Dimension:** D5 — Storybook-in-editor patterns + visual editor component registration
**Date:** 2026-04-14
**Sources:** Framer docs, Plasmic docs, Builder.io docs, MDXEditor docs, Webstudio GitHub

---

## Key files / pages referenced

- https://www.framer.com/developers/property-controls — Framer ControlType API
- https://docs.plasmic.app/learn/code-components-ref/ — Plasmic registerComponent API
- https://www.builder.io/c/docs/custom-components-input-types — Builder.io input types
- https://mdxeditor.dev/editor/docs/jsx — MDXEditor JsxComponentDescriptor
- https://mdxeditor.dev/editor/api/interfaces/JsxComponentDescriptor — MDXEditor API ref
- https://github.com/webstudio-is/webstudio — Webstudio source (AGPL)

---

## Findings

### Finding: Four convergent patterns for component registration across visual editors

**Confidence:** CONFIRMED
**Evidence:** Comparative analysis of Framer, Plasmic, Builder.io, MDXEditor, and Webstudio documentation

All five visual editors that support custom component registration use the SAME fundamental pattern:

1. **Single registration function/object** that maps a name → React component + prop schema
2. **Declarative prop schema** with type discriminators (string/number/boolean/enum/slot/etc.)
3. **Auto-generated controls** rendered from the prop schema
4. **Slot/children as a distinct prop type** (not treated the same as string/boolean)

```
Pattern:                    name → { Component, props: PropDef[], hasChildren }
Our spec (§9.2):           name → { Component, props: PropDef[], hasChildren, isInline }
Framer:                    addPropertyControls(Comp, { prop: { type: ControlType.X } })
Plasmic:                   registerComponent(Comp, { name, props: { prop: { type: 'X' } } })
Builder.io:                Builder.registerComponent(Comp, { name, inputs: [{ name, type }] })
MDXEditor:                 { name, kind, props: [{ name, type }], hasChildren, Editor }
Storybook:                 meta = { component: Comp, argTypes: { prop: { control: 'X' } } }
```

**Implications:** Our JsxComponentDescriptor is architecturally convergent with the industry. The naming is different (`props` vs `inputs` vs `controls`) but the shape is the same.

### Finding: Framer's ControlType is the richest prop type system among visual editors

**Confidence:** CONFIRMED
**Evidence:** https://www.framer.com/developers/property-controls

Framer supports 22+ control types including domain-specific ones:
- Standard: Boolean, String, Number, Enum, Color, Date, File, Object, Array
- Layout-specific: Padding, BorderRadius, Border, BoxShadow, Gap, Font, Cursor
- Framer-specific: ComponentInstance (slot), Transition, Link, ResponsiveImage, EventHandler, TrackingId

Key features our spec lacks but Framer has:
- `hidden(props)` — conditionally hide controls based on other prop values
- `optional` — makes any control removable (shows a checkbox + control)
- Nested `Object` controls with `subFields` — structured sub-property editing

**Implications:** Framer's `hidden(props)` is analogous to Storybook's `if` conditional. Both solve the "show `icon` only when `type` is 'warning'" pattern. This is a V1+ consideration for our spec.

### Finding: Plasmic has the most sophisticated slot system

**Confidence:** CONFIRMED  
**Evidence:** https://docs.plasmic.app/learn/code-components-ref/

Plasmic's `slot` type supports:
- `allowedComponents` — restrict which component types can fill a slot
- `defaultValue` — structured initial children (text, containers, component instances)
- `isRepeated` — for repeated rendering patterns
- `renderPropParams` — for render-prop slots with named parameters

This is significantly richer than our `hasChildren: boolean` binary. Our NG2 (multi-content-hole) acknowledges this gap.

### Finding: Builder.io auto-generates controls without TypeScript extraction

**Confidence:** CONFIRMED
**Evidence:** https://www.builder.io/c/docs/custom-components-input-types

Builder.io does NOT use react-docgen-typescript. The component author manually declares input types in the `inputs` array. This means:
- No build step for prop extraction
- No false positives/negatives from TS inference
- Trade-off: more boilerplate, but zero surprise

Builder.io supports 18 input types including `richText`/`html`, `code`, `json`, `reference` (cross-content links), `tags`, and `model` (embedded data models). These are CMS-aware types not relevant to our use case.

### Finding: MDXEditor's JsxComponentDescriptor is the DIRECT ancestor of our spec's design

**Confidence:** CONFIRMED
**Evidence:** https://mdxeditor.dev/editor/api/interfaces/JsxComponentDescriptor

MDXEditor's descriptor:
```typescript
interface JsxComponentDescriptor {
  Editor: ComponentType<JsxEditorProps>;  // custom editor component
  defaultExport?: boolean;
  hasChildren?: boolean;
  kind: "text" | "flow";                 // inline vs block
  name: null | string;                   // '*' for wildcard
  props: JsxPropertyDescriptor[];        // { name, type: 'string' | 'expression' }
  source?: string;                       // import path
}
```

Our spec's JsxComponentMeta (§9.2) adds:
- `isInline: boolean` (replaces MDXEditor's `kind: 'text' | 'flow'`)
- `isSelfClosing?: boolean`
- `icon`, `category`, `displayName`, `description`, `searchTerms`, `emptyChildName`
- Richer `PropDef` discriminated union (string/boolean/number/enum/reactnode vs MDXEditor's string/expression)
- Core/app split (JsxComponentMeta vs JsxComponentDescriptor) — MDXEditor couples them

MDXEditor's prop types are deliberately minimal (only `string` and `expression`) — the `GenericJsxEditor` renders text inputs for strings and raw expression editors for expressions. No boolean toggles, no enum dropdowns, no type-aware controls.

**Implications:** Our PropDef with typed variants (boolean→toggle, enum→dropdown, number→numeric) is a significant UX improvement over MDXEditor's two-type system. MDXEditor's `Editor` component escape hatch (custom editor per component) is more flexible but requires per-component code.

### Finding: Webstudio auto-generates arg types from TypeScript types
**Confidence:** INFERRED
**Evidence:** https://webstudio.is/blog/webstudios-architecture-an-overview

Webstudio "generates arg types from the component's TypeScript types" so configuration is minimal. Their `meta` object includes category, label, description, icon, and states (CSS pseudo-states like `:hover`, `:focus`).

The CSS-state system (`states: [{ selector: ':hover', label: 'Hover' }]`) is unique to Webstudio and not relevant to our use case (we're not building a CSS editor).

### Finding: No visual editor uses Storybook primitives under the hood
**Confidence:** CONFIRMED (negative search)
**Evidence:** Searched Framer, Builder.io, Plasmic, Webstudio, MDXEditor source/docs for any import of @storybook/* packages

None of these editors use Storybook's controls, argTypes, or any @storybook/* package. They all built their own prop-editing infrastructure. The patterns are convergent but the implementations are independent.

Reasons:
1. Storybook Controls are tightly coupled to Storybook's manager/preview architecture (iframe-based, separate process)
2. No `@storybook/controls-standalone` package exists
3. Storybook's "Portable Docs" concept (mentioned in docs) is aspirational, not shipped

**Implications:** There is no shortcut to "just use Storybook's controls." We must build our own PropPanel, which our spec already does. The patterns are well-established and convergent across the industry.

---

## Negative searches

* Searched npm for "storybook controls standalone" / "storybook controls headless" / "storybook controls embed" → No packages found
* Searched GitHub for repos importing @storybook/addon-controls in non-Storybook contexts → No meaningful results
* Searched for "Portable Docs storybook" → Feature mentioned in Storybook 7 docs blog as aspirational; no shipping timeline; not available in SB8

---

## Gaps / follow-ups

* Webstudio's auto-generation from TypeScript types — how exactly? Do they use react-docgen-typescript or a custom solution? Source code investigation needed.
* Framer's `hidden(props)` pattern — should we add conditional visibility to PropDef for V1+?
