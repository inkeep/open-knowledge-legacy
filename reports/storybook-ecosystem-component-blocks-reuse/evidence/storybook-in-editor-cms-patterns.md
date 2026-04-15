# Evidence: Storybook-in-Editor & CMS Component Patterns (D5 supplement)

**Dimension:** D5 — Storybook-in-editor patterns + CMS component editing approaches
**Date:** 2026-04-14
**Sources:** Official docs for TinaCMS, Sanity, Keystatic, Payload CMS, WordPress Gutenberg, Leva, Portable Stories API

---

## Key files / pages referenced

- https://tina.io/blog/tina-supports-mdx — TinaCMS MDX support
- https://www.sanity.io/docs/developer-guides/add-inline-blocks-to-portable-text-editor — Sanity inline blocks
- https://keystatic.com/docs/content-components — Keystatic content components
- https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest — Portable Stories
- https://github.com/pmndrs/leva — Leva GUI controls library
- https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/ — Gutenberg blocks

---

## Findings

### Finding: TinaCMS — schema-first MDX editing with sidebar controls

**Confidence:** CONFIRMED
**Evidence:** TinaCMS docs + blog

TinaCMS (2022) provides MDX component editing via schema-defined templates:

```typescript
// In schema.ts
{
  type: 'rich-text',
  name: 'body',
  templates: [{
    name: 'Callout',
    label: 'Callout',
    fields: [
      { type: 'string', name: 'type', options: ['warning', 'error', 'default'] },
      { type: 'string', name: 'text' }
    ]
  }]
}
```

Non-technical editors insert components from a menu; TinaCMS shows configured fields in a sidebar panel. Schema-first, not react-docgen-first. Rendered live alongside the editor.

**Implications:** TinaCMS validates our approach — schema-driven field types that auto-generate form controls, applied to MDX. Their sidebar placement (not inline) is the key difference from our PropPanel popover approach.

### Finding: Sanity Portable Text — inline blocks with schema-driven modals

**Confidence:** CONFIRMED
**Evidence:** Sanity docs

Sanity supports inline blocks — custom typed objects embedded within Portable Text. Adding an inline block triggers a modal with schema-driven fields. The schema approach:

```typescript
{
  name: 'blockContent',
  type: 'array',
  of: [{
    type: 'block',
    of: [{ type: 'authorReference', type: 'reference', to: [{type: 'author'}] }]
  }]
}
```

Any Sanity field type (string, number, color, image, reference) becomes a form control in the modal. The component is NOT rendered live in the editor — it appears as an opaque object, and clicking opens the form.

**Implications:** Sanity's modal-based approach is the alternative to our popover-based PropPanel. Modal is simpler but breaks editing flow; popover keeps the user in the document context.

### Finding: Keystatic — the most MDX-native CMS approach

**Confidence:** CONFIRMED
**Evidence:** Keystatic docs (Thinkmill)

Keystatic (from Thinkmill, creators of Keystone) has five component placement types: `wrapper`, `block`, `inline`, `mark`, `repeating`. Each has a `schema` object using Keystatic's field system:

```typescript
StatusBadge: inline({
  label: 'StatusBadge',
  schema: {
    status: fields.select({
      label: 'Status',
      options: [
        { label: 'To do', value: 'todo' },
        { label: 'In Progress', value: 'in-progress' },
      ],
      defaultValue: 'todo'
    }),
  }
})
```

Known limitation: mark components did not correctly load/save props (GitHub issue #1122 as of May 2024).

**Implications:** Keystatic's component type taxonomy (`wrapper`, `block`, `inline`, `mark`, `repeating`) is richer than our binary `isInline: boolean`. Their `wrapper` and `repeating` types are interesting for future consideration but outside P0 scope.

### Finding: WordPress Gutenberg — most battle-tested implementation

**Confidence:** CONFIRMED
**Evidence:** Block editor docs

Gutenberg's `registerBlockType` with `InspectorControls` in the sidebar is the most production-tested implementation of "rich text editor with component prop panels." 50+ built-in block types demonstrate the scale possible with this architecture.

Blocks define `attributes` (schema), and the `edit` React component renders `InspectorControls` with `@wordpress/components` form elements (TextControl, ToggleControl, SelectControl, ColorPicker, RangeControl, etc.). No auto-generation from TypeScript — all explicit.

**Implications:** Gutenberg validates that the pattern scales to dozens of component types with many prop controls each. Their explicit-not-auto-generated approach is what most visual editors independently converge on.

### Finding: No project has successfully extracted Storybook Controls as a standalone library

**Confidence:** CONFIRMED
**Evidence:** npm search + GitHub search

No npm package extracts Storybook's controls panel as an embeddable React component usable outside Storybook. The architecture (manager-preview channel, addon-kit, postMessage communication) makes extraction non-trivial.

**Storybook Portable Stories API** (`composeStories`, `composeStory`): Added in SB 8.1 for testing contexts (Vitest, Jest, Playwright CT). Allows executing stories with full lifecycle hooks outside Storybook's runtime. Does NOT expose an interactive controls panel.

**Supernova.io Storybook Integration** (May 2025): Built a custom interactive playground around embedded Storybook content — this is Supernova's own UI wrapping Storybook iframe content, with their own controls layer on top. NOT embedding Storybook's native controls panel.

### Finding: Leva is the closest thing to "standalone Storybook controls"

**Confidence:** CONFIRMED
**Evidence:** https://github.com/pmndrs/leva

**Leva** (`pmndrs/leva`): React-first GUI panel (dat.GUI replacement) with `useControls` hook. ~230k weekly npm downloads.

Supports: number (slider), string, color, boolean, select, vector, image, custom controls. Can be embedded anywhere in a React app.

```typescript
const { color, size, visible } = useControls({
  color: '#ff0000',
  size: { value: 10, min: 0, max: 100, step: 1 },
  visible: true,
})
```

This is API-first (no argTypes import, no type extraction). It's a general-purpose React GUI panel, not a Storybook derivative.

**Implications:** Leva is the closest existing library to a "standalone prop controls panel." However, it's hook-based (assumes a single React tree) and would need significant adaptation for our per-NodeView architecture (separate React roots per component instance). Building our own PropPanel is the right call.

### Finding: The cross-cutting pattern all editors independently invented

**Confidence:** CONFIRMED
**Evidence:** Comparative analysis across all surveyed systems

Every system independently arrived at the same architecture:
1. A **component descriptor** (registration object with name, prop types, etc.)
2. A **schema-driven UI generator** that maps prop types to form controls
3. A **custom escape hatch** allowing arbitrary React as a control renderer

| System | Type vocab size | Custom renderer? | Auto-extract from TS? |
|---|---|---|---|
| Framer | 22 types | No | No |
| Plasmic | 16 types + `custom` | Yes | No |
| Builder.io | ~18 types | No | No |
| Keystatic | ~10 types | No | No |
| TinaCMS | ~10 types | No | No |
| MDXEditor | 2 types (string/expression) | Yes (Editor) | No |
| Storybook | 10+ types | Yes (addon) | Yes |
| Gutenberg | ~8 types | Yes (InspectorControls) | No |
| Leva | ~8 types | Yes (plugin) | No |

**Storybook is the ONLY system that auto-extracts prop types from TypeScript.** Every other system requires explicit developer registration. This validates our hybrid approach: build-time TypeScript extraction for developer experience, but always allowing explicit manual PropDef overrides.

### Finding: The specific combination Open Knowledge builds is novel

**Confidence:** CONFIRMED
**Evidence:** No surveyed system combines all five

The combination of CRDT-collaborative + MDX rich text + inline React component rendering + live auto-generated prop editing panels does not exist in any surveyed system.

Closest partial overlaps:
- **MDXEditor**: JSX descriptors but minimal prop panel (2 types only)
- **TinaCMS**: MDX component editing but sidebar-only (not inline live preview)
- **Keystatic**: MDX components with inline preview but no live collaborative CRDT
- **Plasmic**: Richest prop panel system but is a page builder, not document editor
- **WordPress Gutenberg**: Most production-tested but block-based (no markdown/MDX layer)

---

## Negative searches

* Searched npm for "storybook controls standalone" / "storybook controls headless" / "storybook controls embed" → No packages found
* Searched for Storybook Portable Docs → Feature mentioned as aspirational, never shipped
* Searched for any CMS using Storybook primitives under the hood → None found

---

## Gaps / follow-ups

* Leva's plugin system for custom controls — could inform our PropPanel escape hatch design
* Keystatic's 5-type component taxonomy — should we support `wrapper` and `repeating` beyond P0?
