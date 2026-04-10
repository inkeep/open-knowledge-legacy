# Evidence: Storybook argTypes and Controls Auto-Generation

**Dimension:** D1 — Storybook's argTypes and Controls auto-generation
**Date:** 2026-04-03
**Sources:** Storybook docs, GitHub issues/discussions, OSS source code, Michael Shilman gist

---

## Key files / pages referenced

- [Storybook Controls docs](https://storybook.js.org/docs/essentials/controls) — official type-to-control mapping
- [Storybook ArgTypes docs](https://storybook.js.org/docs/api/arg-types) — argTypes API reference
- [Storybook TypeScript docs](https://storybook.js.org/docs/configure/integration/typescript) — docgen configuration
- [Shilman gist on props handling](https://gist.github.com/shilman/036313ffa3af52ca986b375d90ea46b0) — react-docgen vs react-docgen-typescript tradeoffs
- [Storybook 8 announcement](https://storybook.js.org/blog/storybook-8/) — switch to react-docgen as default
- [#25686 QA Discussion](https://github.com/storybookjs/storybook/discussions/25686) — react-docgen as TS default QA
- [#26606 Tracking Issue](https://github.com/storybookjs/storybook/issues/26606) — react-docgen related issues umbrella
- [#28269 Performance Bug](https://github.com/storybookjs/storybook/issues/28269) — fast refresh slow with react-docgen-typescript since v8.1.0
- [#13551 ReactNode crash](https://github.com/storybookjs/storybook/issues/13551) — ReactNode type crashes controls
- [#24005 ReactNode object](https://github.com/storybookjs/storybook/issues/24005) — ReactNode renders as object control
- [#14798 Intersection types](https://github.com/storybookjs/storybook/issues/14798) — argTypes not generated for complex intersection types
- [#25492 Correlated unions](https://github.com/storybookjs/storybook/issues/25492) — intersection of correlated union types fails

---

## Findings

### Finding: Storybook extracts props via react-docgen (v8 default) or react-docgen-typescript (fallback)
**Confidence:** CONFIRMED
**Evidence:** [Storybook TypeScript docs](https://storybook.js.org/docs/configure/integration/typescript), [Storybook 8 announcement](https://storybook.js.org/blog/storybook-8/)

Storybook 8 switched the default docgen engine from react-docgen-typescript to react-docgen (Babel-based) for ~50% faster startup. The `component` annotation in CSF meta triggers auto-extraction. Configuration:

```javascript
// .storybook/main.js
export default {
  typescript: {
    reactDocgen: 'react-docgen', // default in v8
    // reactDocgen: 'react-docgen-typescript', // fallback for complex TS
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
    },
  },
};
```

Storybook 7 used react-docgen-typescript as default. The v8 switch was a deliberate performance tradeoff.

### Finding: Complete type-to-control mapping in Storybook
**Confidence:** CONFIRMED
**Evidence:** [Storybook Controls docs](https://storybook.js.org/docs/essentials/controls)

| Data Type | Control | Widget |
|---|---|---|
| boolean | `boolean` | Toggle switch |
| number | `number` | Numeric input with min/max/step |
| number | `range` | Slider |
| object | `object` | JSON editor |
| array | `object` | JSON editor |
| file | `file` | File input returning URL array |
| enum | `radio` | Radio button group |
| enum | `inline-radio` | Horizontal radio buttons |
| enum | `check` | Checkbox group (multi-select) |
| enum | `inline-check` | Horizontal checkboxes |
| enum | `select` | Dropdown |
| enum | `multi-select` | Multi-select dropdown |
| string | `text` | Text input |
| string | `color` | Color picker (inferred by regex: `/(background|color)$/i`) |
| string | `date` | Date picker (inferred by regex: `/Date$/`) |

Automatic regex matchers only work for color and date. All other mappings are inferred from the prop's TypeScript type.

### Finding: argTypes overrides allow complete customization
**Confidence:** CONFIRMED
**Evidence:** [Storybook ArgTypes docs](https://storybook.js.org/docs/api/arg-types)

Users can override auto-generated controls per-prop:

```typescript
const meta = {
  component: Button,
  argTypes: {
    variant: {
      control: 'select', // override from radio to select
      options: ['primary', 'secondary', 'ghost'],
    },
    onClick: { action: 'clicked' }, // mark as action, hide control
    children: { control: 'text' }, // force text control for ReactNode
    backgroundColor: { control: 'color' }, // explicit color picker
  },
};
```

Override hierarchy: story-level > component-level > project-level > auto-generated.

### Finding: React.ReactNode props are poorly handled — renders as JSON object editor
**Confidence:** CONFIRMED
**Evidence:** [#13551](https://github.com/storybookjs/storybook/issues/13551), [#24005](https://github.com/storybookjs/storybook/issues/24005)

ReactNode-typed props (including `children`) render as an object/JSON editor control by default. Entering arbitrary values can crash Storybook. JSX content cannot be synchronized between the Controls panel (manager) and the preview. The recommended workaround is to use primitive string args and convert in a custom render function.

### Finding: Storybook 8 react-docgen has critical limitations with imported types
**Confidence:** CONFIRMED
**Evidence:** [Shilman gist](https://gist.github.com/shilman/036313ffa3af52ca986b375d90ea46b0), [#26606](https://github.com/storybookjs/storybook/issues/26606)

react-docgen (Babel-based, v8 default) cannot resolve types imported from other files. Cross-file type definitions, VariantProps, intersection types with imported types — all fail silently. This was described as a "dealbreaker for most projects." Storybook 6 originally switched back to react-docgen-typescript because of this. In v8 the switch was re-attempted with the performance argument.

Tracked issues (#26606) revealed:
- Union type args shown as 'union' instead of individual values (#26407)
- Enum props can't display in controls (#26745)
- TypeScript decorator build errors (#26780)
- v7→v8 controls tab missing information (#26496)

9 of 10 tracked sub-issues were eventually resolved or marked "not planned."

### Finding: forwardRef and complex type patterns break both docgen engines
**Confidence:** CONFIRMED
**Evidence:** [#8881](https://github.com/storybookjs/storybook/issues/8881), [#14798](https://github.com/storybookjs/storybook/issues/14798), [#25492](https://github.com/storybookjs/storybook/issues/25492), [react-docgen #883](https://github.com/reactjs/react-docgen/issues/883)

Patterns that break:
- `forwardRef` + union types: union members get lost
- Intersection of correlated union types: args inferred as `never`
- Props extending `ComponentProps<T>` with `Pick`: argTypes not generated
- Complex generic intersections

react-docgen-typescript handles forwardRef (via `ForwardRefExoticComponent` detection) but has edge cases. react-docgen (Babel) has worse forwardRef support.

---

## Gaps / follow-ups

- Storybook v9 direction — any plans to improve docgen integration?
- How Storybook handles discriminated union types (show different props based on a discriminator value)
