# Evidence: Storybook Failure Modes & Lessons Learned (D7)

**Dimension:** D7 — Storybook failure modes in auto-generated prop controls + architectural lessons
**Date:** 2026-04-14
**Sources:** storybookjs/storybook GitHub issues/PRs/discussions, Storybook docs, maintainer posts

---

## Key files / pages referenced

- https://github.com/storybookjs/storybook/pull/11070 — Enum extraction fix PR
- https://github.com/storybookjs/storybook/issues/12028 — String literal union args override
- https://github.com/storybookjs/storybook/issues/14521 — Boolean | 'auto' produces toggle
- https://github.com/storybookjs/storybook/issues/13551 — ReactNode crashes Controls
- https://github.com/storybookjs/storybook/issues/17189 — Docs mode iframe limit
- https://github.com/storybookjs/storybook/issues/28269 — react-docgen-typescript HMR perf
- https://github.com/storybookjs/storybook/discussions/24344 — Theming 2.0 RFC
- https://github.com/storybookjs/storybook/discussions/15060 — Knobs → Controls deprecation
- https://github.com/storybookjs/storybook/issues/14014 — Name-based control inference revert
- https://github.com/storybookjs/storybook/issues/11822 — Date control UNIX timestamp bug
- https://github.com/storybookjs/storybook/issues/12078 — Nested object controls (3yr open)

---

## Findings

### Category 1: Enum Detection Failures

**Finding 1.1: Value-first inference degrades enum selects to text inputs**
**Confidence:** CONFIRMED
**Evidence:** Issue #12028

When a story's `.args` provides a value for a `'foo' | 'bar' | 'baz'` prop, Storybook switches the control from a `select` to a `text` input. Root cause: Storybook's control inference reads the *initial arg value type* (which is `string`) and overrides the inferred `enum` type.

**Lesson L1 for our PropPanel:** Be type-first, not value-first. If we infer from the current prop value rather than the prop's type definition, we will produce `text` inputs for enum slots that have a value set.

**Finding 1.2: `shouldExtractLiteralValuesFromEnum` fallback is a heuristic**
**Confidence:** CONFIRMED
**Evidence:** PR #11070

The enum extraction fix splits a raw type string on `|` and JSON-parses each token. This means enum inference is a **heuristic re-parse of a string**, not a type-system query. Edge cases: whitespace in values, nested unions, template literal types.

**Lesson L2:** Treat enum inference as a heuristic. Our build-registry.ts must validate extracted enum values, not blindly trust them.

**Finding 1.3: `as const` objects are not auto-detected as enums**
**Confidence:** CONFIRMED
**Evidence:** Discussion #31990

`Object.values(MY_CONST)` where `MY_CONST` is `as const` yields `unknown` in Storybook 9. No automated solution — manual `options` required.

**Lesson L15:** Our PropDef enum type must accept explicit `values` arrays, not only auto-extracted ones.

### Category 2: Union Type Failures

**Finding 2.1: `string | number` falls back to JSON editor**
**Confidence:** CONFIRMED
**Evidence:** Multiple issues including #25305

When SBType encounters a union of different primitives, it emits `{ name: 'union', value: [...] }`. No dedicated UI exists — defaults to JSON object editor.

**Finding 2.2: `boolean | 'auto'` produces a toggle, losing the literal option**
**Confidence:** CONFIRMED
**Evidence:** Issue #14521

Storybook's control inference maps boolean-containing unions to `boolean` first, yielding a toggle. The `'auto'` literal value is silently dropped. Workaround: manual `control: { type: 'radio' }, options: [true, false, 'auto']`.

**Lesson L3:** Boolean|string unions have no good single-widget representation. A radio/select with all options is the best known approach.

**Finding 2.3: `ReactNode | string` cannot be represented at all**
**Confidence:** CONFIRMED
**Evidence:** Issue #13551

ReactNode is not serializable. Any union containing ReactNode falls back to a JSON editor that crashes when non-JSON JSX is entered. The stable workaround is `mapping` (string key → ReactNode value), which requires hand-authored options.

### Category 3: ReactNode / Children Handling

**Finding 3.1: ReactNode props show a JSON editor that crashes**
**Confidence:** CONFIRMED
**Evidence:** Issues #13551, #11429

`React.ReactNode` props show a JSON object editor. If the story passes JSX as the arg, the editor shows a serialized JSON blob. If the user clears the field and types text, the component crashes because a text string is passed where a ReactNode structure is expected.

**Lesson L4:** ReactNode props cannot be auto-controlled. Hiding them from PropPanel and using content holes is the empirically validated correct decision. Our FR-11 is correct.

**Finding 3.2: `children: ReactNode` is frequently filtered out entirely**
**Confidence:** CONFIRMED
**Evidence:** Storybook docs + `skipChildrenPropWithoutDoc` default

Components with `children: ReactNode` but no JSDoc comment on `children` have no children control at all. This is silent and intentional — but the Storybook community arrived at "children belongs in the content, not in the controls panel" through trial and error.

### Category 4: Performance at Scale

**Finding 4.1: Docs mode hard-stops at ~5 visible iframes**
**Confidence:** CONFIRMED
**Evidence:** Issues #17189, #25046

Rendering many component instances simultaneously is fundamentally expensive. Storybook's docs mode with `inline: false` only loads viewport-visible stories. Even inline rendering causes noticeable lag with many stories on a single page.

**Lesson L9:** Simultaneously rendering N component instances requires lazy loading. Prop manifests must be pre-compiled, not extracted at render time.

**Finding 4.2: react-docgen-typescript adds seconds to hot-reload**
**Confidence:** CONFIRMED
**Evidence:** Issue #28269

The TypeScript compiler invocation per file is the root cause. Storybook's default switch to react-docgen was driven by this cost.

**Lesson for our spec:** Prop extraction must not run the TypeScript compiler at editor runtime. Build-time extraction (our approach) is correct.

### Category 5: Generic Components

**Finding 5.1: Generic `<T>` parameters are unresolvable by both docgen tools**
**Confidence:** CONFIRMED
**Evidence:** Community consensus + maintainer gist

Neither react-docgen nor react-docgen-typescript can resolve `T` without a concrete instantiation. `function List<T>({ items }: { items: T[] })` yields `items: T[]` in the props table.

**Lesson L5:** Generic type parameters are unresolvable statically. Degrade gracefully with a hidden row or text input.

**Finding 5.2: `forwardRef` is a documented failure mode**
**Confidence:** CONFIRMED
**Evidence:** Issue #15334 + Storybook docs

`React.forwardRef` combined with index types causes the entire argTypes table to fail to render. Closed "not planned."

**Lesson L6:** forwardRef components fail prop extraction with react-docgen; require react-docgen-typescript or wrapped typing.

### Category 6: Compound Components

**Finding 6.1: Components throw when rendered without parent provider**
**Confidence:** CONFIRMED
**Evidence:** Issues #8426, #9923

When a component calls `useContext(AccordionContext)` and no parent `<Accordion>` wraps it, it crashes. Storybook's isolation makes this the default failure mode for compound components.

**Lesson L8:** Compound components require explicit parent context wrappers. No static detection possible. Our JsxComponentMeta needs a `wrappers` declaration.

**Finding 6.2: `useContext` at story root doesn't receive decorator context**
**Confidence:** CONFIRMED
**Evidence:** Issue #10296

Decorator wraps the story's render output, not the story function itself. Only affects hooks, not `Context.Consumer`. Subtle distinction that catches component authors.

### Category 7: Dark Mode / Theming

**Finding 7.1: Storybook's Emotion-based theming is acknowledged as a mistake**
**Confidence:** CONFIRMED
**Evidence:** RFC #24344

The Emotion-based system controls addon chrome only, not the story canvas. Dark mode does not apply to Autodocs by default. The Theming 2.0 RFC proposes CSS custom properties + HTML classes — not yet shipped as of early 2026.

**Lesson L10:** CSS custom properties switchable at runtime are correct for dark/light theming; compiled Emotion tokens are not. Our `.dark` class approach (already in globals.css) is the right architecture.

### Category 8: Architecture Regrets

**Finding 8.1: Knobs → Controls — the first major rewrite**
**Confidence:** CONFIRMED
**Evidence:** PR #10834, Discussion #15060

Knobs required proprietary imports inline in story code (`import { text } from '@storybook/addon-knobs'`). This prevented auto-generation from type metadata. Controls replaced this with data-driven `args` system.

**Lesson:** Control definitions in story code (colocated imperative API) do not compose with type inference. Externalizing control definitions to the metadata layer enables auto-generation.

**Finding 8.2: Name-based control inference was reverted**
**Confidence:** CONFIRMED
**Evidence:** Issue #14014

A feature auto-inferred `color` and `date` control types based on prop name (regex matching). Caused unpredictable behavior and was reverted.

**Lesson L13:** Name-based inference for control types is fragile. Stick to type-based inference.

**Finding 8.3: Date control UNIX timestamp bug — known since v6, still unfixed**
**Confidence:** CONFIRMED
**Evidence:** Issue #11822

The `date` control converts its value to a UNIX timestamp (milliseconds integer) when the user changes it. Components expecting `Date` objects or ISO strings receive a number. Documented as "known limitation" with no fix shipped.

**Lesson L14:** If we expose a date control (V1+), normalize to the component's expected format explicitly.

**Finding 8.4: Nested object controls — 3-year open request**
**Confidence:** CONFIRMED
**Evidence:** Issues #12078, #16089

Storybook has never shipped first-party support for flattening object props into individual sub-controls. The `args` system is flat (`Record<string, primitive-or-serializable>`). Nested objects are representable but not individually controllable.

**Lesson L12:** Object/nested prop types have no good auto-generated sub-controls. Our P0 scope (string, boolean, number, enum, reactnode) avoids this problem.

---

## Cross-Cutting Lessons Summary

| # | Lesson | Source | Our Spec Decision |
|---|--------|--------|---|
| L1 | Type-first, not value-first control inference | #12028 | PropDef type determines control widget |
| L2 | Enum inference is a heuristic | PR #11070 | build-registry.ts validates extracted values |
| L3 | boolean\|string has no good widget | #14521 | P0: separate PropDef types, no unions |
| L4 | ReactNode cannot be auto-controlled | #13551 | FR-11: hide from PropPanel, use content holes |
| L5 | Generic `<T>` unresolvable statically | Community | Graceful degradation in build-registry |
| L8 | Compound components need explicit wrappers | #8426 | Need `wrappers` in JsxComponentMeta |
| L9 | N instances requires lazy loading | #17189 | Pre-compiled manifests, not runtime extraction |
| L10 | CSS custom properties for theming | RFC #24344 | Already using `.dark` class approach |
| L12 | No good nested object sub-controls | #12078 | P0 avoids with flat primitive PropDefs |
| L13 | Name-based control inference is fragile | #14014 | Type-based inference only |

---

## Negative searches

* Searched for "Storybook architecture regrets" / "Storybook lessons learned" → Most documented regrets relate to performance, not control design
* Searched for "Storybook controls accessibility audit" → No formal audit of the Controls panel itself; addon-a11y tests components, not Storybook's own UI

---

## Gaps / follow-ups

* Storybook's `if` conditional (conditional control visibility) — should our PropDef support `hidden(props)` for V1+?
* Accessibility of our PropPanel — Storybook's Controls panel is not a good benchmark; we should audit independently
