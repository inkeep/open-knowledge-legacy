# Evidence: Mapping TypeScript Types to Editor Controls

**Dimension:** D4 — TypeScript type → editor control mapping (Synthesis)
**Date:** 2026-04-03
**Sources:** Storybook Controls docs, Webstudio PropMeta schema, Plasmic PropType enum, Builder.io input types, source code analysis

---

## Key files / pages referenced

- [Storybook Controls](https://storybook.js.org/docs/essentials/controls) — Storybook's mapping
- `webstudio/packages/sdk/src/schema/prop-meta.ts` — Webstudio's 21 control types
- `webstudio/packages/generate-arg-types/src/arg-types.ts` — Webstudio's auto-generation mapping
- [Builder.io input types](https://www.builder.io/c/docs/custom-components-input-types) — Builder.io's ~15 types
- [Plasmic code components ref](https://docs.plasmic.app/learn/code-components-ref/) — Plasmic's ~25 control types
- [Storybook ReactNode issues](https://github.com/storybookjs/storybook/issues/13551)

---

## Findings

### Finding: Cross-system consensus mapping exists for primitive types; divergence starts at complex types
**Confidence:** CONFIRMED
**Evidence:** Cross-referencing Storybook, Webstudio, Plasmic, Builder.io control type systems

**Universal consensus (all systems agree):**

| TypeScript Type | Control | Notes |
|---|---|---|
| `boolean` | Toggle | Universal across all systems |
| `number` | Numeric input | Some add range/slider variant |
| `string` | Text input | Default for unrecognized strings |
| `"a" \| "b" \| "c"` (string union ≤3) | Radio group | Webstudio threshold: ≤3 |
| `"a" \| "b" \| "c" \| ...` (string union >3) | Dropdown/select | Webstudio threshold: >3 |
| `string` with name matching `/color/i` | Color picker | Storybook + Webstudio use regex |

**Divergent handling:**

| TypeScript Type | Storybook | Webstudio | Plasmic | Builder.io |
|---|---|---|---|---|
| `React.ReactNode` | Object/JSON (broken) | Not a prop — contentModel | `slot` type | `richText` type |
| `object` / `Record<K,V>` | JSON editor | Ignored (dropped) | `object` with subFields | `object` with subFields |
| `any[]` / `Array<T>` | JSON editor | Ignored (dropped) | `object` | `list` with subFields |
| `() => void` (callbacks) | Action logger | Ignored | `eventHandler` | Hidden |
| `File` / URL string | `file` control | `file` with accept | `imageUrl` | `file` |
| `Date` / date string | `date` (UNIX timestamp) | Not supported | Not supported | `date` |

### Finding: React.ReactNode requires special treatment — NOT a standard prop control
**Confidence:** CONFIRMED
**Evidence:** [Storybook #13551](https://github.com/storybookjs/storybook/issues/13551), [#24005](https://github.com/storybookjs/storybook/issues/24005), Webstudio contentModel

React.ReactNode is TypeScript's most permissive render type — strings, numbers, JSX elements, arrays, fragments, null, undefined. Every system handles it differently:

- **Storybook:** Renders as JSON object editor. Crashes with arbitrary values. JSX cannot sync between manager and preview. Workaround: use string args + render function.
- **Webstudio:** NOT a prop at all. Children are structural (contentModel) — "rich-text" for inline editing, "instance" for component composition.
- **Plasmic:** `slot` prop type — renders a drop zone for child content.
- **Builder.io:** `richText` input type — renders a rich text editor (HTML output).

**For an MDX knowledge base editor:** ReactNode children should map to "rich content slot" — an inline editor area, not a text input or JSON editor. This is a structural concern, not a prop value.

### Finding: Callback/event handler props should be hidden or shown as action loggers
**Confidence:** CONFIRMED
**Evidence:** Storybook actions addon, Webstudio and Plasmic behavior

`onClick`, `onChange`, etc. have type `(event: E) => void`. These are meaningless in a static editor context:
- **Storybook:** `action()` — logs invocations, no control rendered
- **Webstudio:** Silently dropped by getArgType() (`case "function": return;`)
- **Plasmic:** `eventHandler` type — renders event binding UI
- **Builder.io:** Hidden from visual editor

**For MDX knowledge base:** Hide callback props entirely. MDX components are declarative content — event handlers are runtime concerns, not authoring concerns.

### Finding: Complex objects require nested forms or JSON editors — no system handles this well
**Confidence:** CONFIRMED
**Evidence:** All four systems' handling of object types

When a prop accepts `{ title: string; url: string; icon?: ReactNode }`:
- **Storybook:** JSON editor (raw text). No validation, no nested controls.
- **Webstudio:** Drops the prop entirely.
- **Plasmic:** `object` type with `fields` array — renders nested form. Most sophisticated approach.
- **Builder.io:** `object` type with `subFields` — similar nested form pattern.

The Plasmic/Builder.io pattern of declaring subFields is the right approach but requires manual schema definition — auto-extraction from TypeScript produces only the top-level type shape.

### Finding: The recommended control type set for an MDX knowledge base editor
**Confidence:** INFERRED
**Evidence:** Synthesis of all four systems, MDX component authoring requirements

| TypeScript Type | Recommended Control | Rationale |
|---|---|---|
| `boolean` | Toggle | Universal |
| `number` | Numeric input | Universal |
| `string` | Text input | Default |
| `string` (name matches color) | Color picker | Storybook/Webstudio pattern |
| `string` (name matches url/href/src) | URL input | Webstudio pattern |
| `string` (name matches src for images) | Asset picker | Webstudio file control |
| String union (≤5 options) | Radio/inline-radio | Compact visual |
| String union (>5 options) | Dropdown/select | Space efficient |
| `React.ReactNode` children | Rich text / slot zone | NOT a text input |
| `object` with known shape | Nested form (manual override) | Requires subField definition |
| `any[]` / `T[]` | Repeatable item editor | Builder.io list pattern |
| `() => void` callbacks | Hidden | Not relevant for content authoring |
| `React.CSSProperties` | Hidden or style editor | Not a content concern |
| Unrecognized complex type | Code/expression input | Escape hatch for advanced users |

---

## Gaps / follow-ups

- Expression values like `{chartData}` — need a "binding" or "expression" control type
- Discriminated union types — showing different prop panels based on a discriminator value
- How to handle `className` — hide? show as text? show as Tailwind class picker?
