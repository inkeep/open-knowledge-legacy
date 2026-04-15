# Evidence: argTypes + Controls (D1)

**Dimension:** D1 — argTypes + Controls — prop extraction, auto-generation, serialization
**Date:** 2026-04-14
**Sources:** storybook.js.org/docs, storybookjs/storybook GitHub, npm registry

---

## Key files / pages referenced

- https://storybook.js.org/docs/api/arg-types — ArgTypes API reference
- https://storybook.js.org/docs/essentials/controls — Controls addon documentation
- https://storybook.js.org/docs/essentials/actions — Actions addon (callback props)
- https://storybook.js.org/docs/configure/integration/typescript — TypeScript integration config
- https://github.com/storybookjs/storybook/pull/23825 — react-docgen 6.0 upgrade PR
- https://github.com/storybookjs/storybook/discussions/25686 — react-docgen as default QA discussion

---

## Findings

### Finding: Storybook 8.x uses react-docgen (NOT react-docgen-typescript) as the default
**Confidence:** CONFIRMED
**Evidence:** [Storybook 8 blog](https://storybook.js.org/blog/storybook-8/) + [TypeScript docs](https://storybook.js.org/docs/configure/integration/typescript)

Storybook 8 switched the default from `react-docgen-typescript` to `react-docgen` for ~50% faster startup. The lighter analysis is "good enough for virtually all components." Users opt back via:
```ts
// .storybook/main.ts
typescript: { reactDocgen: 'react-docgen-typescript' }
```

**Implications for our spec:** Our build-registry.ts uses react-docgen-typescript explicitly with `shouldExtractLiteralValuesFromEnum: true` — this is the correct choice for our use case since we need accurate enum detection. Storybook's default switch was a performance tradeoff we don't face (we run at build time, not per-request).

### Finding: Storybook's control type mapping is richer than our PropDef
**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/essentials/controls

Storybook supports 14+ control types:

| Data Type | Control Types |
|-----------|---------------|
| boolean | `boolean` (toggle) |
| number | `number` (input), `range` (slider) |
| string | `text`, `color` (picker), `date` (datepicker) |
| enum | `radio`, `inline-radio`, `select`, `multi-select`, `check`, `inline-check` |
| object | `object` (JSON editor) |
| array | `object` (JSON editor) |
| file | `file` (URL array) |

Our PropDef supports: `string` (text input), `boolean` (toggle), `number` (numeric input), `enum` (dropdown), `reactnode` (hidden/content hole).

**Key gap:** Storybook has `color`, `date`, `range`, `radio`, `multi-select`, `file`, and JSON object editor. Our spec deliberately keeps the surface minimal for P0. The question is whether we need a `control` override field in PropDef (like Storybook's `control: { type: 'color' }`) for V1+.

### Finding: Function/callback props use Actions addon (separate from Controls)
**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/essentials/actions

Storybook handles function props via a SEPARATE addon (`@storybook/addon-actions`), not Controls. Pattern:
- `args: { onClick: fn() }` — uses `fn()` from `storybook/test` to create a mock
- Automatic pattern matching: `parameters: { actions: { argTypesRegex: '^on.*' } }` auto-creates actions for `on*` props
- Actions log in a dedicated panel; controls panel does NOT show function inputs

**Implications:** Our FR-11 decision to hide function types from PropPanel is correct and aligns with Storybook's approach. The pattern match (`/^on/`) for auto-detection of callbacks is a useful pattern to adopt.

### Finding: Storybook's argTypes schema has richer metadata than our PropDef
**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/api/arg-types

```typescript
{
  [key: string]: {
    control?: ControlType | { type: ControlType; /* config */ } | false;
    description?: string;
    if?: Conditional;           // conditional visibility based on other args
    mapping?: { [key: string]: any };  // map simple values to complex objects
    name?: string;
    options?: string[];
    table?: {
      category?: string;       // group in table
      defaultValue?: { summary: string; detail?: string };
      disable?: boolean;
      subcategory?: string;
      type?: { summary?: string; detail?: string };
    };
    type?: SBType | SBScalarType['name'];
  }
}
```

Key features we DON'T have:
- `if` conditional — show/hide a control based on another arg's value
- `mapping` — map simple values to complex objects (e.g., map `'primary'` to a theme object)
- `table.category` / `table.subcategory` — group controls
- `control: false` — explicitly disable a control for a specific arg

### Finding: Storybook's args default precedence
**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/writing-stories/args

Precedence order (lowest to highest):
1. Component's `defaultProps` / destructuring defaults
2. `meta.args` (component-level defaults)
3. `story.args` (story-level overrides)

Our FR-14a ladder: `descriptor.props[i].defaultValue` → first enum → `false`/`0`/`''`. The Storybook ladder is simpler because stories define complete arg sets; we need defaults for insertion.

### Finding: Controlled vs uncontrolled args DO map to our sourceDirty concept
**Confidence:** INFERRED
**Evidence:** https://sandroroth.com/blog/storybook-controlled-components/

Storybook distinguishes "controlled mode" (args drive the value, `updateArgs()` called on change) from "uncontrolled mode" (component manages own state). In controlled mode, args are the source of truth — changes via Controls update the story.

Our `sourceDirty` distinction (pristine = sourceRaw authority, edited = reconstruction) is the storage-layer equivalent. When pristine, the source file is the "uncontrolled" authority; when dirty, structured attrs are the "controlled" authority.

### Finding: Storybook serializes args to URL query strings with limitations
**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/essentials/controls

> "Non-primitive values cannot be fully represented in URL parameters, affecting the ability to share and deep link to such a state."

Dates serialize as UNIX timestamps (known bug). Objects/arrays don't round-trip through URLs.

**Implications:** Our MDX serialization (γ pattern) is more sophisticated — we reconstruct full mdast nodes. Storybook's URL serialization is not relevant to our use case.

---

## Negative searches

* Searched for "controls standalone library" / "@storybook/controls reuse outside storybook" → No standalone controls library exists. Controls are deeply coupled to Storybook's manager/preview architecture.
* Searched for "@storybook/blocks reuse outside storybook" → "Portable Docs" feature mentioned as future work but not shipped.

---

## Gaps / follow-ups

* Storybook's `if` conditional (show/hide controls based on other args) — relevant for our container+child patterns? E.g., show Callout `icon` only when `type !== 'info'`?
* Storybook's `mapping` concept — could be useful for mapping enum display values to internal values?
