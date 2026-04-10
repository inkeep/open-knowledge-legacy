---
title: "React TypeScript Interfaces as Editor Schema: Prior Art, Implementation Patterns, and Lessons from Storybook, Webstudio, and Beyond"
description: "Evaluates using React component TypeScript interfaces as the schema definition for visual editor prop panels — how react-docgen-typescript extracts props, how Storybook and Webstudio auto-generate editing controls from types, what breaks, and what an MDX knowledge platform editor should adopt from their experience."
createdAt: 2026-04-03
updatedAt: 2026-04-03
subjects:
  - react-docgen-typescript
  - Storybook
  - Webstudio
  - Builder.io
  - Plasmic
  - TypeScript Compiler API
topics:
  - component prop extraction
  - visual editor prop panels
  - TypeScript to UI control mapping
  - auto-generated editing interfaces
---

# React TypeScript Interfaces as Editor Schema

**Purpose:** Determine whether React component TypeScript interfaces can serve as the single source of truth for auto-generating prop editing panels in an MDX knowledge platform editor — what prior art exists, what implementation patterns work, what breaks, and what override mechanisms are essential.

---

## Executive Summary

Using TypeScript interfaces as the schema for auto-generated prop panels is a proven pattern with a well-understood ceiling. Storybook has done this for 6+ years across millions of projects. Webstudio built a production visual editor on it. The approach works reliably for the 80% case — primitives (boolean toggles, numeric inputs, text fields) and string union types (dropdowns, radio groups). But every mature system that ships auto-extraction also ships an override layer, because TypeScript types encode *what a value is*, not *how an editor should interact with it*.

The critical tool is [react-docgen-typescript](https://github.com/styleguidist/react-docgen-typescript), which wraps the TypeScript Compiler API to extract structured prop metadata. It is the engine behind both Storybook's Controls (as a fallback) and Webstudio's entire prop panel system. The Babel-based alternative (react-docgen) is faster but cannot resolve imported types — a dealbreaker for any project using cross-file type definitions, which is effectively all of them.

**Key Findings:**

- **The hybrid model is the proven architecture:** Auto-extract from TypeScript for baseline controls, manual override files for editorial intent (string -> URL picker, string -> file uploader, conditional visibility). Webstudio's `.ws.ts` pattern is the reference implementation.
- **react-docgen-typescript is the correct extraction engine** with `shouldExtractValuesFromUnion: true` and `shouldRemoveUndefinedFromOptional: true`. Performance is manageable (~10-15s for 75 components with shared program).
- **React.ReactNode/children should NOT be a prop control** — it should be a structural content model (rich text slot or instance composition), as Webstudio does.
- **Five types break or produce poor UIs:** complex objects, callback functions, generic components, discriminated unions, and React.ReactNode. All require override handling.
- **Every system that started with "just extract from types" added manual overrides.** Builder.io and Plasmic went manual-only and their users subsequently requested auto-extract. The sweet spot is both.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Storybook's argTypes and Controls auto-generation | Deep | P0 |
| D2 | Webstudio's auto-extract + override model | Deep | P0 |
| D3 | react-docgen-typescript internals | Deep | P0 |
| D4 | Mapping TypeScript types to editor controls | Synthesis | P0 |
| D5 | Lessons learned and edge cases | Adversarial | P0 |
| D6 | Builder.io and Plasmic's manual registration | Moderate | P1 |

**Stance:** Factual with conclusions
**Non-goals:** Implementing the prop panel, MDX parser integration, live preview architecture, non-React frameworks

---

## Detailed Findings

### D1. Storybook's argTypes and Controls Auto-Generation

**Finding:** Storybook auto-generates editing controls by running a docgen engine against component source, then mapping extracted types to a fixed set of UI widgets. Storybook 8 switched the default from react-docgen-typescript to react-docgen (Babel) for ~50% faster startup, but this introduced critical limitations with cross-file types that make the Babel engine unsuitable for serious TypeScript projects.

**Evidence:** [evidence/storybook-argtypes-controls.md](evidence/storybook-argtypes-controls.md)

**How it works:**

1. Developer adds `component: MyComponent` to the CSF meta
2. Storybook runs the configured docgen engine (react-docgen or react-docgen-typescript)
3. Extracted prop types are converted to `argTypes` — a structured description of each prop's name, type, options, and default
4. The Controls addon renders widgets based on argType control type
5. Users can override any argType at the story, component, or project level

**The complete type-to-control mapping:**

| TypeScript Type | Storybook Control | Widget |
|---|---|---|
| `boolean` | `boolean` | Toggle |
| `number` | `number` / `range` | Input / Slider |
| `string` | `text` | Text input |
| String union | `select` / `radio` / `inline-radio` | Dropdown / Radio |
| `object` / `array` | `object` | JSON editor |
| String matching `/(background\|color)$/i` | `color` | Color picker |
| String matching `/Date$/` | `date` | Date picker |

Regex-based matchers (color, date) are the only "smart" inference beyond raw type. All other semantic meaning (URL, file path, rich text) must be added via argTypes overrides.

**Storybook 7 vs 8:** The key difference is the default docgen engine. Storybook 7 used react-docgen-typescript (full TypeScript compiler, slower but complete). Storybook 8 switched to react-docgen (Babel, faster but incomplete). Users can switch back via one line of config. The [Storybook 8 QA thread](https://github.com/storybookjs/storybook/discussions/25686) documented issues with the switch — default options being lost when any custom option is set, union types showing as 'union' instead of values.

**What Storybook handles poorly:**
- **React.ReactNode:** Renders as JSON object editor, crashes with arbitrary values ([#13551](https://github.com/storybookjs/storybook/issues/13551))
- **Imported types (react-docgen only):** Silently lost — a "dealbreaker for most projects"
- **forwardRef + union types:** Union members get lost ([react-docgen #883](https://github.com/reactjs/react-docgen/issues/883))
- **Intersection of correlated union types:** Args inferred as `never` ([#25492](https://github.com/storybookjs/storybook/issues/25492))
- **Complex objects:** JSON editor only — no nested form

**Implications for MDX editor:** Adopt Storybook's type-to-control mapping as the baseline. Use react-docgen-typescript (not Babel react-docgen). The argTypes override pattern maps directly to an override file system.

---

### D2. Webstudio's Auto-Extract + Override Model

**Finding:** Webstudio is the clearest reference implementation of the hybrid model. It runs react-docgen-typescript at build time to generate PropMeta records, then allows per-component `.ws.ts` override files that spread the auto-generated props and selectively replace controls. The PropMeta schema defines 21 control types, explicitly designed for Storybook compatibility.

**Evidence:** [evidence/webstudio-auto-extract-model.md](evidence/webstudio-auto-extract-model.md)

**Architecture (two-layer):**

```
Layer 1: Auto-extract at build time
  Component.tsx → react-docgen-typescript → __generated__/component.props.ts

Layer 2: Manual override
  component.ws.ts imports __generated__ props, spreads + overrides:
    props: { ...props, src: { control: "file", accept: "image/*" } }
```

**The `getArgType()` mapping function** (`packages/generate-arg-types/src/arg-types.ts`) makes pragmatic decisions:

- Enum threshold: <=3 options -> radio, >3 -> select
- Color detection: prop name regex `/(background|color)/i`, not type inspection
- Functions/symbols: silently dropped (no control rendered)
- Complex types: silently dropped (deliberate — avoids broken controls)
- aria-* props: cast to string text input
- `@types/react` declarations: filtered out entirely

**Override file pattern** (the `.ws.ts` convention):

```typescript
// image.ws.ts — auto-generated says src is "text", override to "file"
import { props } from "./__generated__/image.props";
export const meta: WsComponentMeta = {
  initialProps: ["id", "class", "src", "width", "height", "alt"],
  props: {
    ...props,
    src: { type: "string", control: "file", label: "Source", accept: "image/*" },
  },
};
```

The override is surgical — only the props that need better controls are redeclared. Everything else passes through from auto-generation.

**Children/slots:** Webstudio handles children as a `contentModel` on the component meta, NOT as a prop. The contentModel specifies: `"rich-text"` (inline text editing), `"instance"` (accepts child components), or a specific component name. This is a structural relationship, not a prop value.

**What Webstudio does NOT have:** Conditional prop visibility (no `showIf`/`hidden`), no custom control components, no nested object/array editing via subfields.

**Implications for MDX editor:** Adopt Webstudio's two-layer model. The `.ws.ts` pattern maps naturally to a `.meta.ts` or `.editor.ts` convention. Add conditional visibility (`hidden` callback from Plasmic) and consider adding nested form support for structured objects.

---

### D3. react-docgen-typescript Internals

**Finding:** react-docgen-typescript is a ~1000-line wrapper around the TypeScript Compiler API. It creates a full `ts.Program`, walks exported symbols to find React components, extracts props via `TypeChecker.getApparentProperties()`, and resolves union types into structured enum values. It uses one private TypeScript API (`getAllPossiblePropertiesOfTypes`) for intersection/union handling. Performance is dominated by `ts.createProgram()` — 400ms per file fresh, amortizable to ~10-15s for 75 components with a shared program.

**Evidence:** [evidence/react-docgen-typescript-internals.md](evidence/react-docgen-typescript-internals.md)

**TypeScript Compiler API features used:**

| API | Purpose |
|---|---|
| `ts.createProgram(files, options)` | Create compilation context |
| `program.getTypeChecker()` | Access type resolution |
| `type.getCallSignatures()` | Find function component props (first param) |
| `type.getConstructSignatures()` | Find class component props |
| `propsType.getApparentProperties()` | Enumerate all visible props |
| `propType.isUnion()` → `.types` | Extract union members |
| `type.isStringLiteral()` → `.value` | Get literal values |
| `prop.getFlags() & SymbolFlags.Optional` | Detect optional props |
| `symbol.getDocumentationComment()` | Extract JSDoc description |
| `symbol.getJsDocTags()` | Extract JSDoc tags (@default, @deprecated) |
| `checker.getAliasedSymbol()` | Resolve re-exports |
| `(checker as any).getAllPossiblePropertiesOfTypes()` | **Private API** — union/intersection props |

**The `shouldExtractValuesFromUnion` option** is the critical configuration. Without it, `"primary" | "secondary"` produces a flat string. With it, the same type produces structured enum values directly mappable to a dropdown.

**Performance profile:**

| Operation | Time |
|---|---|
| `ts.createProgram()` per file | ~400ms |
| Parser initialization | ~150ms |
| Single prop type resolution | <1ms |
| 75 components, fresh program each | ~40s |
| 75 components, shared program | ~10-15s |
| After optimization (reported) | ~9s |

**Incremental updates:** Not natively supported. The `parseWithProgramProvider` API allows reusing a program, but file change detection requires external watching. The recommended pattern: parse all on load, re-parse changed files with shared program on save.

**vs react-docgen (Babel):** react-docgen is ~2x faster but fundamentally limited — it uses Babel AST traversal, not TypeScript's type checker. It cannot resolve imported types, VariantProps, intersection types with imported members, or any type requiring cross-file resolution. The [fsImporter](https://github.com/reactjs/react-docgen) follows imports and re-parses files, but Babel cannot do type-level resolution.

**Known limitations of react-docgen-typescript:**
- Generics: `React.ComponentProps<T>` with unresolved T produces unhelpful types (partially fixed in PR #241)
- Private TypeScript API usage: `getAllPossiblePropertiesOfTypes` could break on TS upgrades
- Default values: JSDoc `@default` values parsed as strings even for booleans/numbers (Webstudio adds type coercion)
- TypeScript 7 risk: the Go rewrite (`tsgo`) will change or remove the Node.js Compiler API

**Implications for MDX editor:** Use react-docgen-typescript with `shouldExtractValuesFromUnion: true` and `shouldRemoveUndefinedFromOptional: true`. Implement shared program reuse. Abstract behind an interface for future TypeScript 7 migration. Consider running extraction at build time (like Webstudio) rather than on-demand.

---

### D4. Mapping TypeScript Types to Editor Controls

**Finding:** A cross-system analysis reveals strong consensus on primitive type mappings and fundamental divergence on complex types. The gap between "what TypeScript expresses" and "what an editor control needs" is bridgeable for primitives but requires manual override for anything involving editorial intent.

**Evidence:** [evidence/type-to-control-mapping.md](evidence/type-to-control-mapping.md)

**Universal consensus (all systems agree):**

| TypeScript Type | Control |
|---|---|
| `boolean` | Toggle |
| `number` | Numeric input |
| `string` | Text input |
| String union <=3 options | Radio group |
| String union >3 options | Dropdown |
| String with name matching `/color/i` | Color picker |

**Recommended mapping for an MDX knowledge base editor:**

| TypeScript Type | Control | Notes |
|---|---|---|
| `boolean` | Toggle | Universal |
| `number` | Numeric input | Add min/max/step from JSDoc |
| `string` | Text input | Default |
| `string` (name: color/background) | Color picker | Regex inference |
| `string` (name: url/href/src) | URL input | Name-based inference |
| `string` (name: src for images) | Asset/file picker | Override required |
| String union <=5 | Radio/inline-radio | Compact visual |
| String union >5 | Dropdown/select | Space efficient |
| `React.ReactNode` children | Rich text slot | NOT a text input — structural |
| `object` with known shape | Nested form | Manual override with subFields |
| `T[]` arrays | Repeatable item editor | Manual override with subFields |
| `() => void` callbacks | Hidden | Not relevant for content |
| `React.CSSProperties` | Hidden | Not a content concern |
| Unrecognized complex | Code/expression input | Escape hatch |

**React.ReactNode requires architectural treatment, not a control type.** Storybook renders it as a JSON editor (broken). Webstudio treats it as a structural content model. Plasmic renders a slot drop zone. Builder.io provides a rich text editor. For an MDX editor where components render as void nodes, ReactNode children should either be excluded (components take only primitive props) or rendered as an inline rich text editing area.

**Callback props should be hidden entirely.** MDX components are declarative content nodes — `onClick`, `onChange`, `onError` are runtime concerns with no editorial meaning. All four systems either hide or log callbacks.

---

### D5. Lessons Learned and Edge Cases

**Finding:** The auto-generation approach has five well-documented failure modes. Understanding these in advance is more valuable than the happy path, because the failures determine the override system design.

**Evidence:** [evidence/lessons-learned-edge-cases.md](evidence/lessons-learned-edge-cases.md)

**Failure Mode 1: Silent type dropping.** When `getArgType()` encounters a type it doesn't recognize, it returns nothing. The prop disappears from the panel. The user has no error, no warning, no indication that a prop exists but wasn't rendered. This is Webstudio's deliberate design choice (better no control than a broken control) but it creates a trust gap. *Mitigation:* Surface dropped props in a "developer info" section or dev console warning.

**Failure Mode 2: React.ReactNode renders as broken JSON editor.** Multiple open Storybook issues across 4+ years ([#13551](https://github.com/storybookjs/storybook/issues/13551), [#24005](https://github.com/storybookjs/storybook/issues/24005), [#12570](https://github.com/storybookjs/storybook/issues/12570)). Entering arbitrary values crashes. JSX cannot sync between panels. The Storybook team describes this as an unsolved problem. *Mitigation:* Treat ReactNode as a structural concern (content model), not a prop.

**Failure Mode 3: Cross-file type resolution (Babel engine only).** react-docgen (Babel) silently loses all type information imported from other files. This was called a ["dealbreaker for most projects"](https://gist.github.com/shilman/036313ffa3af52ca986b375d90ea46b0) by Storybook's lead maintainer. *Mitigation:* Use react-docgen-typescript exclusively. Never use the Babel engine.

**Failure Mode 4: Discriminated unions produce confusing UIs.** When props are `{ variant: "link"; href: string } | { variant: "button"; onClick: () => void }`, all props appear simultaneously. No system auto-generates conditional visibility from discriminated union types. *Mitigation:* Manual override with `hidden`/`showIf` callbacks.

**Failure Mode 5: Generic components produce unhelpful types.** `Select<UserType>`, `Table<RowData>` — the generic parameters resolve to their constraints or `T`, producing useless controls. *Mitigation:* Manual override for generic components.

**Types that look simple but cause problems:**

| Type Pattern | Problem | How It Manifests |
|---|---|---|
| `string \| undefined` | Produces `"string \| undefined"` | Broken control without `shouldRemoveUndefinedFromOptional` |
| `VariantProps<T> \| null` | `null` appears in enum options | Extra "null" option in dropdown |
| `[key: string]: unknown` | Index signature -> `string` | Useless text input |
| `T extends X ? A : B` | Conditional type resolved at extraction | May not match runtime type |
| Template literal types | Resolves to `string` | Loses structure (`text-${Size}`) |
| Branded types | Resolves to base type | Loses semantic brand (`string & { __brand: "URL" }`) |

**Performance at scale:** 75 components with shared program = ~10-15s (acceptable for project load). 200+ components = 30-60s (needs lazy extraction). Fast refresh regression in [Storybook v8.1.0](https://github.com/storybookjs/storybook/issues/28269) shows that per-save re-extraction must be incremental, not full-project.

**When manual overrides are needed (non-negotiable):**
1. String that should be a URL/file/color/code editor
2. Objects/arrays with known structure (need subFields)
3. Conditional prop visibility (discriminated unions)
4. Generic components
5. Props with editorial labels/descriptions different from code names
6. React.ReactNode children

**Implications for MDX editor:** Plan for overrides from day one. The auto-extraction layer produces the foundation; the override layer produces the editorial experience. Budget ~20% of component integration time for writing override files.

---

### D6. Builder.io and Plasmic: Manual Registration and What They Learned

**Finding:** Builder.io and Plasmic chose manual registration because the editorial experience requires information that TypeScript types cannot express — which props to show, how they should appear, conditional visibility, custom control components, and human-readable labels. Both systems' users have subsequently requested auto-extraction, validating that manual-only is too much friction. The optimal architecture is the hybrid model.

**Evidence:** [evidence/manual-registration-lessons.md](evidence/manual-registration-lessons.md)

**What manual registration provides that auto-extract does not:**

1. **Prop curation:** Only show relevant props (5 of 20, not all 20)
2. **Semantic control types:** TypeScript `string` -> the right widget (URL picker, color picker, file uploader, rich text editor, code editor)
3. **Conditional visibility:** `showIf`/`hidden` — show fields based on other field values
4. **Custom controls:** Arbitrary React components as editing UI
5. **Nested editing:** Object/array props with proper subField forms
6. **Slot definitions:** Where children go, what types are accepted, default content
7. **Editorial naming:** Human labels for non-developer editors
8. **Validation:** Beyond type checking — min/max, regex, custom validators

**Why manual-only is also wrong:** Builder.io's community [explicitly requested](https://ideas.builder.io/ideas/PROD-I-55) auto-extraction from TypeScript types. Plasmic's forum has a [thread](https://forum.plasmic.app/t/how-to-automatically-register-components-with-typescript-types/636) asking for the same. The maintenance burden of writing registration schemas for every component, and keeping them in sync with TypeScript interfaces, is a recognized pain point.

**The lesson for the MDX editor:** Adopt the hybrid model (Webstudio pattern) but extend it with Plasmic's conditional visibility and Builder.io's nested subField editing. The auto-extract layer removes boilerplate for primitives and enums. The override layer handles the 20% that requires editorial intent.

---

## Recommended Architecture for the MDX Knowledge Platform Editor

```
┌──────────────────────────────────────────────────────────┐
│              Build-Time Prop Extraction                    │
│                                                           │
│  Component.tsx  ──→  react-docgen-typescript               │
│                      (shouldExtractValuesFromUnion: true)  │
│                      (shouldRemoveUndefinedFromOptional)   │
│                 ──→  __generated__/component.props.ts      │
│                      (PropMeta records)                    │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│              Override Layer                                │
│                                                           │
│  component.editor.ts  (optional per-component)            │
│    import { props } from "./__generated__/component.props" │
│    export const editorMeta = {                            │
│      ...props,                                            │
│      src: { control: "file", accept: "image/*" },         │
│      variant: { control: "select", options: [...] },      │
│      children: { type: "richText" },                      │
│      target: { hidden: (p) => !p.href },                  │
│    }                                                      │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│              Editor Runtime                               │
│                                                           │
│  PropMeta ──→ Control Renderer                            │
│    boolean     → Toggle                                   │
│    number      → Numeric input                            │
│    string/text → Text input                               │
│    enum/select → Dropdown                                 │
│    enum/radio  → Radio group                              │
│    file        → Asset picker                             │
│    url         → URL input                                │
│    color       → Color picker                             │
│    code        → Code editor (Monaco/CodeMirror)          │
│    richText    → Inline rich text editor                  │
│    json        → JSON editor (escape hatch)               │
│    hidden      → Not rendered (callbacks, internals)      │
└──────────────────────────────────────────────────────────┘
```

**Prop filtering pipeline** (applied before rendering controls):

1. Exclude: `key`, `ref`, `className`, `style`, `children` (if handled as content model)
2. Exclude: props from `@types/react/index.d.ts` (aria/HTML attributes) unless component-specific
3. Exclude: callback props (`on*` pattern) unless override says otherwise
4. Exclude: internal prefixed props (`_`, `$`, `data-internal-*`)
5. Include: everything else, mapped by `getArgType()`

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **TypeScript 7 (tsgo) migration path:** The Go rewrite will change or remove the Node.js TypeScript Compiler API. react-docgen-typescript depends on `ts.createProgram` and `TypeChecker`. Timeline: mid-2026. Mitigation: abstract behind an interface now.
- **Expression values (`{chartData}`):** No system handles data binding/expression props well. May need a dedicated "expression" or "binding" control type for MDX components that accept dynamic data.
- **Discriminated union prop panels:** No system auto-generates conditional visibility. This remains a manual-override concern.

### Out of Scope (per Rubric)
- MDX parser integration with void node rendering
- Live preview architecture
- Non-React framework support
- Prop panel visual design/UX

---

## References

### Evidence Files
- [evidence/storybook-argtypes-controls.md](evidence/storybook-argtypes-controls.md) — Storybook's extraction pipeline, type mapping, overrides, v7/v8 differences
- [evidence/webstudio-auto-extract-model.md](evidence/webstudio-auto-extract-model.md) — Webstudio's two-layer model, getArgType(), PropMeta schema, .ws.ts pattern
- [evidence/react-docgen-typescript-internals.md](evidence/react-docgen-typescript-internals.md) — Parser internals, TypeScript API usage, performance, limitations
- [evidence/type-to-control-mapping.md](evidence/type-to-control-mapping.md) — Cross-system mapping synthesis, recommended control set
- [evidence/lessons-learned-edge-cases.md](evidence/lessons-learned-edge-cases.md) — Five failure modes, problematic types, performance at scale
- [evidence/manual-registration-lessons.md](evidence/manual-registration-lessons.md) — Builder.io/Plasmic approach, advantages of manual, hybrid model rationale

### External Sources
- [Storybook Controls documentation](https://storybook.js.org/docs/essentials/controls) — Official type-to-control reference
- [Storybook TypeScript configuration](https://storybook.js.org/docs/configure/integration/typescript) — Docgen engine configuration
- [react-docgen-typescript](https://github.com/styleguidist/react-docgen-typescript) — Primary extraction engine source
- [react-docgen](https://github.com/reactjs/react-docgen) — Babel-based alternative (not recommended)
- [Webstudio](https://github.com/webstudio-is/webstudio) — Reference implementation of hybrid model
- [Storybook react-docgen tracking issue #26606](https://github.com/storybookjs/storybook/issues/26606) — Known issues umbrella
- [Storybook v8 QA discussion #25686](https://github.com/storybookjs/storybook/discussions/25686) — react-docgen migration QA
- [Michael Shilman's react-docgen comparison gist](https://gist.github.com/shilman/036313ffa3af52ca986b375d90ea46b0) — Authoritative tradeoff analysis
- [Builder.io custom component input types](https://www.builder.io/c/docs/custom-components-input-types) — Manual registration API
- [Plasmic code components reference](https://docs.plasmic.app/learn/code-components-ref/) — Manual registration with advanced controls

### Related Research
- [component-prop-introspection-visual-editors/](../component-prop-introspection-visual-editors/) — Deeper coverage of TypeScript Language Server programmatic usage, Tailwind CSS class resolution, cva() variant extraction, third-party npm component editing, and visual prop creation UX across Figma/Plasmic/Builder.io
