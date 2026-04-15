---
title: "Storybook Ecosystem Survey — Component Blocks v2 Reuse Assessment"
description: "End-to-end survey of the Storybook ecosystem (core, addons, community, adjacent projects) identifying utilities, patterns, and primitives analogous to what the Component Blocks v2 spec builds. Covers reuse decisions, pattern adoption, failure-mode lessons, and spec amendments."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - Storybook 8.x
  - argTypes
  - Controls addon
  - react-docgen-typescript
  - CSF3
  - MDX3
  - Framer propertyControls
  - Plasmic registerComponent
  - Builder.io
  - MDXEditor
  - Ladle
  - Playroom
  - React Cosmos
  - react-live
  - Sandpack
  - Leva
topics:
  - component registration patterns
  - prop editing architecture
  - visual editor controls
  - type extraction
  - component playground tools
  - failure modes
---

# Storybook Ecosystem Survey — Component Blocks v2 Reuse Assessment

**Purpose:** Identify what to reuse, what to learn from, and what to explicitly NOT reuse from the Storybook ecosystem and adjacent projects, in the context of the Component Blocks v2 spec (`specs/2026-04-14-component-blocks-v2/SPEC.md`).

---

## §1 Executive Summary

The Storybook ecosystem and the Component Blocks v2 spec solve convergent problems with fundamentally different architectures. Both map component names to prop schemas, auto-generate editing controls from type metadata, and handle serialization of prop values. But Storybook renders components in isolated iframes/panels with a single React tree, while our spec renders components inline in a collaborative CRDT-backed ProseMirror document with separate React roots per NodeView.

**Reuse directly (0 packages):** Nothing from Storybook can be extracted as a standalone library. Controls, argTypes, @storybook/blocks, and decorators are all tightly coupled to Storybook's manager/preview iframe architecture. No `@storybook/controls-standalone` package exists. [HIGH]

**Learn from / pattern-copy (5 patterns):** (1) The PropDef discriminated union is architecturally convergent with Storybook's SBType — our design is validated. (2) Storybook's `if` conditional for showing/hiding controls based on other prop values — worth considering for V1+. (3) The `control: false` pattern for explicitly disabling controls on specific props. (4) react-docgen-typescript with `shouldExtractLiteralValuesFromEnum: true` — already adopted in our build-registry.ts. (5) Function/callback props handled separately from value props (our FR-11 = Storybook's Actions addon separation). [HIGH]

**Explicitly NOT reuse (3 anti-patterns):** (1) Storybook's value-first control inference — degrades enum selects to text inputs when args are set (Issue #12028). Our PropPanel must be type-first. (2) Name-based control type inference (regex matching `color`/`date` in prop names) — reverted by Storybook as fragile (Issue #14014). (3) Emotion-based compiled tokens for theming — Storybook's own Theming 2.0 RFC acknowledges this was wrong; CSS custom properties are correct (our `.dark` class approach is right). [HIGH]

**Top 3 actionable recommendations:**
1. Add a `wrappers` field to `JsxComponentMeta` for compound component context injection — Storybook's decorator-required-for-compound-components is the universal failure mode across all visual editors.
2. Ensure build-registry.ts emits diagnostics for known react-docgen-typescript failure patterns (Omit/Pick, forwardRef, generics) rather than silently producing empty PropDef arrays.
3. Consider `hidden(props)` conditional visibility on PropDef for V1+ — convergent across Framer, Plasmic, and Storybook.

---

## §2 Per-Primitive Mapping Table

| Our Spec Primitive | Spec Reference | Storybook Equivalent | Verdict | Reasoning |
|---|---|---|---|---|
| **PropDef discriminated union** (string/boolean/number/enum/reactnode) | §9.2 `PropDef` | `SBType` hierarchy (boolean/string/number/enum/array/object/union/intersection + `ArgType.control`) | **Pattern-copy** [HIGH] | Same discriminated-union shape. SBType has 14+ types; our 5 are the right P0 scope. Storybook's extras (color, date, range, file, object) are V1+ candidates. |
| **JsxComponentMeta** (name→Component+props+hasChildren) | §9.2 | CSF3 `Meta<T>` (component+args+argTypes+decorators) | **Pattern-copy** [HIGH] | Same fundamental shape. All 5 visual editors surveyed (Framer, Plasmic, Builder.io, MDXEditor, Webstudio) independently converge on this pattern. Our core/app split (JsxComponentMeta vs JsxComponentDescriptor) is cleaner than MDXEditor's coupled `JsxComponentDescriptor`. |
| **PropPanel** (auto-generated controls from PropDef) | FR-6, FR-7, FR-8, FR-9 | `@storybook/addon-controls` + `inferControls.ts` | **Learn-from** [HIGH] | Cannot reuse — Controls is coupled to Storybook's manager/preview iframe. Must build our own. The type→control mapping (boolean→toggle, enum→dropdown, number→numeric input, string→text) is identical. |
| **Descriptor registry** (name→descriptor lookup with wildcard) | §9.2 `getDescriptor()` | CSF3 meta + Storybook component index | **Pattern-copy** [HIGH] | Same concept: runtime lookup by component name. Our wildcard `'*'` fallback is cleaner than Storybook's behavior (which just doesn't render unknown components). MDXEditor also has wildcard support. |
| **sourceDirty / γ serialization** | §9.4, FR-14 | Storybook args (controlled/uncontrolled modes) | **Learn-from** [MEDIUM] | Conceptual parallel: Storybook's controlled args = our dirty state (structured attrs are authority); uncontrolled = our pristine (source is authority). Different implementation — Storybook uses URL serialization; we use sourceRaw/mdast reconstruction. |
| **build-registry.ts** (react-docgen-typescript extraction) | §9.2 | `@storybook/react/docgenHandler.ts` + `inferControls.ts` | **Pattern-copy** [HIGH] | Both use react-docgen-typescript with `shouldExtractLiteralValuesFromEnum: true`. Our build-time extraction (not runtime) avoids Storybook's 400-900ms/file HMR penalty. |
| **FR-11: hide function/ReactNode from PropPanel** | FR-11 | Actions addon (separate from Controls); ReactNode → JSON editor (broken) | **Pattern-copy** [HIGH] | Storybook arrived at the same conclusion empirically: function props use Actions addon (not Controls), ReactNode has no good control widget (Issues #13551, #11429). Our FR-11 is independently validated. |
| **FR-14a: default attrs ladder** | FR-14a | `args` precedence: defaultProps → meta.args → story.args | **Learn-from** [MEDIUM] | Different mechanism. Storybook has story-level defaults (story.args); we need insertion-time defaults. Our ladder (defaultValue → first enum → false/0/'') is appropriate for our use case. |
| **FR-19: ComponentErrorBoundary** | FR-19 | Storybook ErrorBoundary (per-story, in manager) | **Pattern-copy** [HIGH] | Same pattern: per-instance error boundary. Storybook wraps each story; we wrap each NodeView render. Our per-NodeView granularity (separate React roots) means the blast radius is inherently contained. |
| **NodeView rendering** (separate React root per component) | §9.7, §9.8 | Storybook Canvas (iframe or inline in docs) | **Diverge** [HIGH] | Architecture is fundamentally different. Storybook: one React tree per story. Our spec: separate `createRoot` per ProseMirror NodeView. Storybook's decorator/context model cannot work across separate React roots. |
| **Block UX** (SideMenu, drag handle, slash insert) | §9.10, FR-15–FR-18 | No equivalent (Storybook has no document/editor context) | **N/A** [HIGH] | Storybook is not a document editor — no drag handle, no slash-command insertion, no side menu. Closest prior art is WordPress Gutenberg's block inserter. |
| **Dirty-tracking observer plugin** | §9.4.1 | No equivalent | **Novel** [HIGH] | The transaction-origin-aware dirty-tracking pattern (skip sync-from-text, sync-from-tree, agent-write origins) is specific to our dual-representation CRDT bridge. No Storybook analogue exists. |

---

## §3 Ecosystem Survey

### Storybook Core (8.x)

| Package | Purpose | Reuse Potential | Status |
|---|---|---|---|
| `@storybook/addon-controls` | Interactive prop controls panel | **None** — coupled to manager/preview iframe | Active |
| `@storybook/addon-actions` | Function prop logging | **None** — coupled to Storybook runtime | Active |
| `@storybook/blocks` (16+ components) | Doc blocks (ArgTypes, Canvas, Controls, Story, etc.) | **None** — all require `DocsContext` | Active |
| `react-docgen-typescript` | TypeScript prop extraction | **Direct reuse** — already in our build-registry.ts | Active (community) |
| `react-docgen` | Lightweight AST-based prop extraction | **Not recommended** — can't follow cross-file imports | Active |
| `@storybook/csf` | CSF story format types | **None** — story-oriented, not document-oriented | Active |
| `@storybook/test` | Testing Library + Vitest instrumented | **None** — testing, not editing | Active |

### Adjacent Projects — Component Playgrounds

| Tool | Stars | Downloads/mo | Prop Editing Model | Relevance |
|---|---|---|---|---|
| **Playroom** (SEEK) | 4,568 | 1,138,380 | Code-as-editing (JSX text) | **High conceptual** — zero-metadata registration, snippet browser with live previews |
| **React Cosmos** | 8,656 | 118,504 | Hooks-as-controls (`useFixtureInput`) | **Moderate** — most React-idiomatic, auto prop detection for Node fixtures |
| **react-live** (Nearform) | 4,604 | 1,282,929 | Code-as-editing (Sucrase JSX eval) | **High technical** — embeddable rendering substrate for closed-world component sets |
| **Sandpack** (CodeSandbox) | 6,101 | 2,753,343 | Code-as-editing (virtual FS + CDN) | **Low** — open-world rendering; CDN dependency rules out offline use |
| **Ladle** | 2,919 | 686,361 | Declarative metadata (identical to Storybook) | **None** — Storybook clone with faster build |
| **Histoire** | 3,533 | 353,753 | Vue reactive controls | **None** — Vue/Svelte only, React never shipped |
| **Leva** (pmndrs) | ~8,000 | ~230,000 | Hooks (`useControls`) | **Low** — closest standalone controls library but hook-based (needs single React tree) |

**Evidence:** [evidence/adjacent-projects.md](evidence/adjacent-projects.md)

### Visual Editors — Component Registration Patterns

| Editor | Registration API | Type Vocab Size | Auto-extract from TS? | Custom Renderer? |
|---|---|---|---|---|
| **Framer** | `addPropertyControls(Comp, {...})` | 22 types | No | No |
| **Plasmic** | `registerComponent(Comp, {...})` | 16 types + `custom` | No | Yes (React component) |
| **Builder.io** | `Builder.registerComponent(Comp, {...})` | ~18 types | No | No |
| **MDXEditor** | `JsxComponentDescriptor` object | 2 types (string/expression) | No | Yes (Editor component) |
| **Webstudio** | `WsComponentMeta` + generated `.props` files | ~10 types | Yes (build-time) | No |
| **Keystatic** | `inline({schema: {...}})` / `block({schema: {...}})` | ~10 types | No | No |
| **WordPress Gutenberg** | `registerBlockType(name, {...})` | ~8 types | No | Yes (InspectorControls) |
| **Storybook** | `meta: Meta<T>` + argTypes | 10+ types | Yes (react-docgen-typescript) | Yes (addon) |

**Key finding [HIGH]:** All 8 editors independently converge on the same pattern: `name → { Component, props: PropDef[], hasChildren }`. Our JsxComponentMeta is architecturally convergent. **Storybook is the only system that auto-extracts prop types from TypeScript** — every other system requires explicit developer registration. Our hybrid approach (build-time TypeScript extraction with manual override) combines the best of both.

**No editor uses Storybook primitives under the hood [HIGH].** All built their own prop-editing infrastructure independently. No `@storybook/controls-standalone` package exists. Storybook's "Portable Docs" concept is aspirational, not shipped.

**Evidence:** [evidence/visual-editors-component-registration.md](evidence/visual-editors-component-registration.md), [evidence/storybook-in-editor-cms-patterns.md](evidence/storybook-in-editor-cms-patterns.md)

---

## §4 Storybook-in-Editor Patterns

### No production integration embeds Storybook Controls in a rich text editor [HIGH]

Extensive search across CMSes, visual editors, and documentation tools found zero cases of Storybook's Controls panel being embedded inside a content editor. The reasons are structural:

1. **Storybook Controls requires DocsContext** — a React context that provides story data, component metadata, and the args state machine. This context is created by Storybook's runtime and cannot be materialized outside it.
2. **Manager/preview iframe architecture** — Controls live in the "manager" frame; the component renders in a separate "preview" frame. Communication is via postMessage. This two-process model doesn't map to inline ProseMirror NodeView rendering.
3. **No standalone extraction** — `@storybook/addon-controls` imports from `@storybook/manager-api`, `@storybook/components`, and `@storybook/theming` — all Storybook-internal packages with circular dependencies on the runtime.

### What editors actually build instead

Every editor that provides component prop editing builds its own:

| Editor | Control Surface | UI Pattern | React Root Model |
|---|---|---|---|
| **MDXEditor** | Inline popup (GenericJsxEditor) | Click component → text input popup | Single React tree (Lexical) |
| **WordPress Gutenberg** | Sidebar (InspectorControls) | Select block → sidebar fields | Single React tree |
| **TinaCMS** | Sidebar (contextual editing) | Select component → sidebar panel | Single React tree |
| **Sanity** | Modal (click to open) | Click inline block → modal with fields | Single React tree |
| **Keystatic** | Inline form (in document) | Component replaced by form fields | Single React tree |
| **Plasmic** | Right panel (prop controls) | Select component → right panel | Single React tree |
| **Our spec** | Floating Radix popover (block) / anchored popover (inline) | Click component → popover with controls | **Separate React root per NodeView** |

**Our spec's separate-React-root-per-NodeView architecture is unique** among all surveyed editors. This has implications:
- React context from a parent component's NodeView cannot reach a child component's NodeView (separate roots)
- Shared context (theme, locale) must be injected at each `createRoot` call
- The "compound component" problem (AccordionItem needing Accordion context) requires a `wrappers` declaration in the descriptor, not decorator composition

**Evidence:** [evidence/decorators-csf3-mdx.md](evidence/decorators-csf3-mdx.md), [evidence/storybook-in-editor-cms-patterns.md](evidence/storybook-in-editor-cms-patterns.md)

---

## §5 Concrete Spec Amendments Recommended

### Amendment 1: Add `wrappers` to JsxComponentMeta [HIGH confidence, HIGH priority]

**Source:** Storybook decorator failure mode (Issues #8426, #9923) + all visual editors independently solving the same problem.

Compound components (AccordionItem, TabsContent, etc.) crash when rendered without their parent context provider. Storybook requires per-story decorators; every visual editor requires some form of wrapper declaration. Our spec currently has no mechanism for this.

```typescript
// Proposed addition to JsxComponentMeta
export interface JsxComponentMeta {
  // ... existing fields ...
  wrappers?: React.ComponentType<{ children: React.ReactNode }>[];
  // Applied outermost-first at NodeView createRoot time
}
```

This is the equivalent of Storybook's story-level decorators but applied at the NodeView factory level.

### Amendment 2: Add build-registry diagnostics for known extraction failures [HIGH confidence, MEDIUM priority]

**Source:** react-docgen-typescript failure modes (Omit/Pick, forwardRef, generics, path aliases).

When `build-registry.ts` extracts an empty PropDef array for a component that clearly has props (heuristic: non-trivial TypeScript interface), it should emit a diagnostic warning rather than silently registering empty. Known patterns to detect:
- `forwardRef` wrapper (Storybook Issue #15334)
- `Omit<>`/`Pick<>` utility types (Issue #14798)
- Generic `<T>` parameters (community consensus: unresolvable)

### Amendment 3: Consider `hidden(props)` conditional visibility for V1+ [MEDIUM confidence, LOW priority]

**Source:** Convergent across Framer (`hidden(props)`), Plasmic (`hidden: (props) => !props.hasEnd`), Storybook (`if: { arg: 'type', eq: 'warning' }`).

Pattern: show `icon` control only when `type !== 'info'`. Three independent implementations suggest this is a real UX need. Not P0 — add to spec as V1+ consideration.

### Amendment 4: Add `control: false` override to PropDef [MEDIUM confidence, LOW priority]

**Source:** Storybook's `argTypes.propName.control: false` pattern.

Some props should be extractable by react-docgen-typescript but explicitly hidden from the PropPanel (e.g., internal-only props, className, ref). Current spec has no mechanism to suppress a specific prop from the auto-generated panel.

---

## §6 Lessons Learned from Storybook's Known Failure Modes

### Lesson 1: Be type-first, not value-first for control inference [HIGH]

**Source:** Storybook Issue #12028

When Storybook infers control type from the current arg *value* rather than the prop's *type definition*, enum selects degrade to text inputs. A `'primary' | 'secondary'` prop with `args: { variant: 'primary' }` shows a text input because `typeof 'primary'` is `string`.

**Our defense:** PropDef's `type` field is the authority for control rendering. The current prop value determines the input's *value*, not its *widget type*. This is already correct in our spec.

### Lesson 2: Enum inference is a heuristic, not a guarantee [HIGH]

**Source:** Storybook PR #11070, Discussion #31990

react-docgen-typescript's enum extraction splits the raw type string on `|` and JSON-parses each token. Edge cases: `as const` objects, computed enum members, template literal types. Our build-registry.ts should validate extracted enum values and fall back to a text input with a diagnostic if extraction produces suspicious results.

### Lesson 3: ReactNode props cannot be auto-controlled [HIGH]

**Source:** Storybook Issues #13551, #11429

Storybook shows a JSON editor for ReactNode props. The editor crashes when users type text (string ≠ ReactNode). Storybook's children prop is frequently silently filtered out. The community empirically arrived at "children belongs in the content, not in the controls panel."

**Our defense:** FR-11 hides ReactNode from PropPanel and uses content holes instead. This is independently validated by Storybook's failure.

### Lesson 4: N simultaneous component instances require lazy loading [HIGH]

**Source:** Storybook Issues #17189, #25046, #28269

Storybook's docs mode hard-stops at ~5 visible iframe stories. Even inline rendering causes lag with many instances. react-docgen-typescript adds 400-900ms per file to HMR.

**Our defense:** Build-time prop manifest extraction (not runtime). Lazy descriptor loading when first instance appears in document. Pre-compiled registry, not per-render TypeScript compilation.

### Lesson 5: Name-based control inference is fragile [HIGH]

**Source:** Storybook Issue #14014 (shipped then reverted)

Auto-inferring `color` picker for props named `*color*` caused unpredictable behavior. The feature was reverted. Type-based inference is strictly more reliable.

**Our defense:** PropDef type determines the control widget. No name-based heuristics.

### Lesson 6: CSS custom properties for theming, not compiled tokens [HIGH]

**Source:** Storybook Theming 2.0 RFC (Discussion #24344)

Storybook's Emotion-based theme system controls addon chrome only, not story canvas. Dark mode doesn't apply to Autodocs. The Theming 2.0 RFC proposes CSS custom properties + HTML classes — acknowledging Emotion was the wrong choice.

**Our defense:** Already using `.dark` class approach with Tailwind CSS custom properties in `globals.css`. This is correct.

### Lesson 7: The Knobs→Controls migration lesson [MEDIUM]

**Source:** Storybook PR #10834, Discussion #15060

Storybook's original Knobs addon required `import { text } from '@storybook/addon-knobs'` inline in story code — coupling control definitions to story code. Controls replaced this with data-driven `args`/`argTypes` in metadata, enabling auto-generation from types.

**Our lesson:** Control definitions must live in the descriptor metadata layer (JsxComponentMeta), not in component code or rendering code. This is already correct in our spec.

**Evidence:** [evidence/failure-modes-lessons.md](evidence/failure-modes-lessons.md)

---

## §7 What This Research Did NOT Cover and Why

### Not covered: Storybook 9 / Storybook 10 roadmap

Storybook 9 was in active development at the time of this research. Breaking changes to the argTypes/controls system may exist in unreleased versions. Coverage limited to Storybook 8.x stable (the current production version).

### Not covered: react-docgen-typescript internal implementation

We confirmed the tool's external behavior and known failure modes but did not audit its source code. Our build-registry.ts wraps it as a black box — internal implementation details don't affect our architecture.

### Not covered: Webstudio's TypeScript extraction mechanism

Webstudio auto-generates prop types from TypeScript at build time into `__generated__/*.props` files. Whether this uses react-docgen-typescript or a custom tool is not confirmed from public documentation. Source code investigation (AGPL) could clarify.

### Not covered: Leva/Tweakpane as PropPanel rendering substrates

Leva (`pmndrs/leva`) is the closest existing "standalone controls panel" library. We identified it as hook-based (requiring a single React tree), making it architecturally incompatible with our per-NodeView separate React roots. A deeper investigation of Leva's plugin API for custom controls could inform our PropPanel's escape hatch design.

### Not covered: Accessibility audit of Storybook's Controls panel

Storybook's a11y efforts focus on `@storybook/addon-a11y` (testing components), not on the Controls panel itself. The Controls panel's ARIA markup quality is not formally documented. Our PropPanel should be independently audited, not benchmarked against Storybook.

### Not covered: Server-side rendering of component previews

Tools like Next.js Server Components, Remix RSC, and Astro islands could theoretically provide a different rendering substrate for component previews. Not relevant to our current architecture (client-side ProseMirror + React NodeViews).

### Not covered: Design token tooling adjacency

Supernova, Knapsack, Zeroheight, and similar design-system infrastructure tools may have implemented in-document component blocks with prop editing. These were out of scope (they are design-system management tools, not content editors).

---

## Research Rubric

| Dimension | Priority | Depth | Status |
|---|---|---|---|
| D1: argTypes + Controls — prop extraction, auto-generation, serialization | P0 | Deep | Complete |
| D2: react-docgen-typescript pitfalls, extraction limits, community complaints | P0 | Deep | Complete |
| D3: Decorator API + context-shimming patterns | P0 | Moderate | Complete |
| D4: CSF3/MDX3 compile pipeline + @storybook/blocks | P0 | Moderate | Complete |
| D5: Storybook-in-editor patterns + visual editor component registration | P0 | Deep | Complete |
| D6: Adjacent projects (Ladle, Playroom, Histoire, React Cosmos, etc.) | P0 | Deep | Complete |
| D7: Storybook failure modes in auto-generated prop controls | P0 | Deep | Complete |

---

## Evidence Files

- [evidence/argtypes-controls.md](evidence/argtypes-controls.md) — D1: Storybook argTypes schema, control types, function prop handling, defaults
- [evidence/react-docgen-pitfalls.md](evidence/react-docgen-pitfalls.md) — D2: Extraction failures, Omit/Pick, forwardRef, performance, community complaints
- [evidence/decorators-csf3-mdx.md](evidence/decorators-csf3-mdx.md) — D3+D4: Decorator API, CSF3 format, MDX3 pipeline, @storybook/blocks
- [evidence/visual-editors-component-registration.md](evidence/visual-editors-component-registration.md) — D5: Framer, Plasmic, Builder.io, MDXEditor, Webstudio convergent patterns
- [evidence/storybook-in-editor-cms-patterns.md](evidence/storybook-in-editor-cms-patterns.md) — D5 supplement: CMS editors, standalone controls, Leva, gap analysis
- [evidence/adjacent-projects.md](evidence/adjacent-projects.md) — D6: Ladle, Histoire, Playroom, React Cosmos, react-live, Sandpack
- [evidence/failure-modes-lessons.md](evidence/failure-modes-lessons.md) — D7: 10 categories of failure modes, 15 cross-cutting lessons

---

## References

### Primary Sources
- [Storybook ArgTypes API](https://storybook.js.org/docs/api/arg-types)
- [Storybook Controls Addon](https://storybook.js.org/docs/essentials/controls)
- [Storybook TypeScript Integration](https://storybook.js.org/docs/configure/integration/typescript)
- [Storybook Decorators](https://storybook.js.org/docs/writing-stories/decorators)
- [Framer Property Controls](https://www.framer.com/developers/property-controls)
- [Plasmic Code Components Ref](https://docs.plasmic.app/learn/code-components-ref/)
- [Builder.io Custom Components](https://www.builder.io/c/docs/custom-components-input-types)
- [MDXEditor JSX Docs](https://mdxeditor.dev/editor/docs/jsx)
- [Keystatic Content Components](https://keystatic.com/docs/content-components)

### GitHub Issues (Failure Modes)
- [#12028 — String literal union args override](https://github.com/storybookjs/storybook/issues/12028)
- [#14521 — Boolean | 'auto' produces toggle](https://github.com/storybookjs/storybook/issues/14521)
- [#13551 — ReactNode crashes Controls](https://github.com/storybookjs/storybook/issues/13551)
- [#11429 — ReactNode text node support](https://github.com/storybookjs/storybook/issues/11429)
- [#17189 — Docs iframe rendering limit](https://github.com/storybookjs/storybook/issues/17189)
- [#28269 — react-docgen-typescript HMR perf](https://github.com/storybookjs/storybook/issues/28269)
- [#14014 — Name-based inference revert](https://github.com/storybookjs/storybook/issues/14014)
- [#14798 — Omit/Pick drops props](https://github.com/storybookjs/storybook/issues/14798)
- [PR #11070 — Enum extraction fix](https://github.com/storybookjs/storybook/pull/11070)
- [Discussion #24344 — Theming 2.0 RFC](https://github.com/storybookjs/storybook/discussions/24344)
- [Discussion #15060 — Knobs deprecation](https://github.com/storybookjs/storybook/discussions/15060)

### Related Research
- [reports/cms-custom-components-landscape/](../cms-custom-components-landscape/) — 12 CMS platforms' custom component patterns (different angle: CMS-native vs developer tooling)
