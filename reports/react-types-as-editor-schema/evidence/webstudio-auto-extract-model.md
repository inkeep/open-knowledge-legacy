# Evidence: Webstudio's Auto-Extract + Override Model

**Dimension:** D2 — Webstudio's auto-extract + override model
**Date:** 2026-04-03
**Sources:** webstudio-is/webstudio OSS repo (cloned), Webstudio architecture blog

---

## Key files / pages referenced

- `packages/generate-arg-types/src/arg-types.ts` — the `getArgType()` function that maps TS types to controls
- `packages/generate-arg-types/src/cli.ts` — CLI that runs react-docgen-typescript at build time
- `packages/sdk/src/schema/prop-meta.ts` — PropMeta Zod schema (21 control types)
- `packages/sdk/src/schema/component-meta.ts` — WsComponentMeta schema
- `packages/sdk-components-react/src/image.ws.ts` — example override file
- `packages/sdk-components-react/src/link.ws.ts` — example override file
- `packages/sdk-components-react/src/__generated__/image.props.ts` — example auto-generated props
- [Webstudio Architecture Overview](https://webstudio.is/blog/webstudios-architecture-an-overview)

---

## Findings

### Finding: Webstudio uses a two-layer model — auto-extract at build time + manual `.ws.ts` overrides
**Confidence:** CONFIRMED
**Evidence:** `packages/generate-arg-types/src/cli.ts` (lines 56-57, 98)

Layer 1: The `@webstudio-is/generate-arg-types` package runs react-docgen-typescript at build time with these options:

```typescript
const options = {
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
};
```

It parses each component file, generates `__generated__/<component>.props.ts` files containing PropMeta records. Uses `withCustomConfig()` to load the project tsconfig.

Layer 2: Each component has a `.ws.ts` file that imports auto-generated props and can override specific controls:

```typescript
// image.ws.ts
import { props } from "./__generated__/image.props";
export const meta: WsComponentMeta = {
  props: {
    ...props, // spread auto-generated
    src: { // override: text input → file picker
      type: "string",
      control: "file",
      label: "Source",
      required: false,
      accept: "image/*",
    },
  },
};
```

### Finding: Webstudio's getArgType() maps TS types to controls with smart heuristics
**Confidence:** CONFIRMED
**Evidence:** `packages/generate-arg-types/src/arg-types.ts` (lines 58-141)

The mapping function handles:

| TypeScript type (from react-docgen-typescript) | Webstudio control | Widget |
|---|---|---|
| `boolean` / `Booleanish` | `boolean` | Toggle |
| `number` | `number` | Numeric input |
| `string` | `text` | Text input |
| `string` matching `/color/i` in prop name | `color` | Color picker |
| `enum` with ≤3 options | `radio` | Radio group |
| `enum` with >3 options | `select` | Dropdown |
| `string \| number \| readonly string[]` | `text` | Text input |
| `string \| number` | `number` or `text` | Depends on default value |
| `function` | *ignored* | Not rendered |
| `symbol` | *ignored* | Not rendered |
| `role` or `aria-*` props | `text` | Text input (cast complex aria types) |
| All other complex types | *ignored* | Not rendered |

Key design decisions:
- Enum threshold of 3 for radio vs select
- Color detection by prop name regex, not by type
- Functions and symbols silently dropped
- Complex types silently dropped (no JSON editor fallback)

### Finding: Webstudio's PropMeta schema defines 21 control types, designed for Storybook compatibility
**Confidence:** CONFIRMED
**Evidence:** `packages/sdk/src/schema/prop-meta.ts` (lines 1-217)

```
tag, number, range, text, resource, code, codetext, color, boolean,
radio, inline-radio, select, multi-select, check, inline-check,
file, url, json, date, action, textContent, animationAction
```

Comment in source: "We want to have the same list of controls as Storybook (with some additions)". The schema is Zod-validated at runtime. Each control type defines: type (the data type), control (the widget), required, defaultValue, description, and type-specific fields (options for select/radio, accept for file, language for code, rows for text).

### Finding: Webstudio's component meta includes content model, states, and initialProps
**Confidence:** CONFIRMED
**Evidence:** `packages/sdk/src/schema/component-meta.ts` (lines 73-90)

WsComponentMeta schema includes:
- `category` — one of: general, typography, media, animations, data, forms, localization, radix, xml, other, hidden, internal
- `contentModel` — defines what children are accepted: "instance" (any instance), "rich-text", or specific component names
- `states` — CSS pseudo-state selectors (`:hover`, `:focus`, `[aria-current=page]`)
- `initialProps` — which props are always visible in the panel
- `props` — Record<string, PropMeta> — the override layer

### Finding: Webstudio handles children/slots via contentModel, NOT as a prop
**Confidence:** CONFIRMED
**Evidence:** `packages/sdk/src/schema/component-meta.ts` (lines 51-69)

Children are modeled as a structural relationship (contentModel), not as a prop. The `children` array in contentModel specifies what types of content a component accepts:
- `"instance"` — accepts other component instances
- `"rich-text"` — can be edited as rich text inline
- Specific component name — accepts only that component type

This is fundamentally different from treating `children: React.ReactNode` as a prop with a text editor control. Webstudio treats it as a structural/compositional concern.

### Finding: Filtering removes internal props, aria attributes, and data-ws-* attributes
**Confidence:** CONFIRMED
**Evidence:** `packages/generate-arg-types/src/arg-types.ts` (lines 17-30)

The pipeline excludes:
- Props starting with `data-ws-` (Webstudio builder internals)
- Props starting with `$webstudio` or `$` (internal markers)
- Props excluded via CLI `--exclude` flag
- Props declared in `@types/react/index.d.ts` (all aria attributes)

This prevents flooding the prop panel with 200+ inherited HTML/ARIA attributes.

---

## Gaps / follow-ups

- Webstudio doesn't have conditional prop visibility (Plasmic's `hidden` callback pattern)
- No custom control escape hatch — only the 21 predefined control types
- The Component Editor feature (visual prop creation) is backlogged (Issue #2646)
