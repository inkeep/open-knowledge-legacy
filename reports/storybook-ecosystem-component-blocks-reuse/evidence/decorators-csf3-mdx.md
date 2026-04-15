# Evidence: Decorators, CSF3, MDX3 Pipeline, @storybook/blocks (D3+D4)

**Dimension:** D3 — Decorator API + context-shimming patterns; D4 — CSF3/MDX3 compile pipeline + @storybook/blocks
**Date:** 2026-04-14
**Sources:** storybook.js.org/docs, storybookjs/storybook GitHub, @storybook/blocks source

---

## Key files / pages referenced

- https://storybook.js.org/docs/writing-stories/decorators — Decorator documentation
- https://storybook.js.org/docs/api/csf — CSF3 specification
- https://storybook.js.org/docs/writing-docs/autodocs — Autodocs (MDX3)
- https://storybook.js.org/docs/api/doc-blocks — @storybook/blocks API
- https://storybook.js.org/docs/writing-stories/play-function — Play functions

---

## Findings

### Finding: Decorator API has a three-level composition model

**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/writing-stories/decorators

Decorators are functions with signature:
```typescript
type DecoratorFunction = (
  Story: StoryFn,
  context: StoryContext
) => JSX.Element;
```

Three levels, applied outermost-first:
1. **Global** (`preview.ts`): `decorators: [(Story) => <ThemeProvider><Story /></ThemeProvider>]`
2. **Component/Meta** (`meta.decorators`): wraps all stories for a component
3. **Story** (`story.decorators`): wraps a single story

Wrapping order: global → component → story (outermost to innermost).

**Implications for our spec:** We don't have a decorator model — each component NodeView creates its own React root. The equivalent of decorators for us is the `wrappers` concept: if a component needs a parent context provider (e.g., AccordionItem needs Accordion), the component registration must declare it.

### Finding: Decorator pitfalls relevant to our architecture

**Confidence:** CONFIRMED
**Evidence:** Issues #8426, #9923, #10296

1. **useContext at story root doesn't receive decorator context** — decorator wraps the story's render OUTPUT, not the story function itself. Only affects hooks, not `Context.Consumer`.
2. **Compound components require explicit parent-context decorators** — no automatic detection of missing context. The failure is a runtime crash, not a static error.
3. **Decorator render order is counterintuitive** — `[DecA, DecB]` renders as `<DecA><DecB><Story/></DecB></DecA>`, not left-to-right nesting.
4. **Re-render isolation** — decorators re-render when args change, which can reset state in wrapper components.

### Finding: CSF3 is stories-as-plain-objects with meta/args/render/play

**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/api/csf

```typescript
// CSF3 canonical form
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  args: { label: 'Click me' },       // component-level defaults
  argTypes: { onClick: { action: 'clicked' } },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'primary' },       // story-level overrides
  render: (args) => <Button {...args} />,  // optional custom render
  play: async ({ canvasElement }) => {     // interaction test
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(canvas.getByRole('button')).toHaveTextContent('Clicked');
  },
};
```

Key aspects:
- Stories are plain objects (not functions as in CSF2)
- `args` at meta level provides defaults; story `args` overrides
- `render` is optional (default renders `<Component {...args} />`)
- `play` enables interaction testing (Testing Library + Vitest instrumented)

**Implications:** Our component registration model (JsxComponentMeta) fills a role similar to CSF3's `meta` — it declares defaults, prop types, and rendering behavior. But CSF3's multi-story model (many variants of one component) doesn't apply to our use case (each document instance is its own "story" with user-authored props).

### Finding: MDX3 compile pipeline in Storybook 8

**Confidence:** CONFIRMED
**Evidence:** Storybook docs + @mdx-js/mdx source

Pipeline: `micromark → mdast → hast → recma → @mdx-js/mdx → JavaScript module`

Storybook 8 uses MDX3 (not MDX2). Key change: MDX3 compiles to ESM with `import` statements, not CommonJS. Storybook's `@storybook/addon-docs` compiles `.mdx` files via a webpack/vite loader that:
1. Extracts `Meta` block to identify the component
2. Compiles remaining MDX to a React component
3. Wraps in `DocsContext` providing story/args/argTypes

This is NOT relevant to our use case — we don't compile MDX to JS modules. Our pipeline is `remark-parse → mdast → ProseMirror JSON` (parse direction) and `ProseMirror JSON → mdast → remark-stringify` (serialize direction). We never enter the hast/recma/JS compile stage.

### Finding: @storybook/blocks provides 16+ doc-block components

**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/api/doc-blocks

Key components:
| Block | Purpose | Our equivalent |
|---|---|---|
| `<ArgTypes>` | Prop types table | PropPanel |
| `<Controls>` | Interactive controls | PropPanel controls |
| `<Canvas>` | Story canvas with source | Component NodeView |
| `<Story>` | Render a story inline | Component render in PM |
| `<Description>` | Component description | component.description in meta |
| `<Source>` | Code snippet | Source mode (CodeMirror) |
| `<Primary>` | Primary story | N/A (we don't have stories) |
| `<Stories>` | All stories | N/A |
| `<Subtitle>` | Component subtitle | N/A |
| `<Title>` | Component title | N/A |
| `<Unstyled>` | Remove doc styling | N/A |
| `<Markdown>` | Render markdown | N/A (we ARE the markdown) |
| `<ColorPalette>` | Color swatches | N/A |
| `<IconGallery>` | Icon grid | N/A |
| `<Typeset>` | Typography samples | N/A |

These blocks are coupled to `DocsContext` (Storybook's internal context that provides story data). They cannot be used outside Storybook. "Portable Docs" was mentioned as aspirational in Storybook 7 blog but never shipped.

### Finding: Play functions enable component interaction testing

**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/writing-stories/play-function

Play functions use `@storybook/test` which wraps Testing Library + Vitest with instrumentation. The play function runs after the story renders and can:
- Click buttons, type text, select options
- Assert on DOM state
- Fire component events via `fn()` spies

This is NOT relevant to our PropPanel (we don't test component interactions in the editor). But the pattern of "render a component with specific args, then interact with it" is conceptually similar to our "render a component with current MDX props, let the user edit props in the PropPanel."

### Finding: Storybook's context-shimming via decorators is NOT directly applicable to ProseMirror NodeViews

**Confidence:** CONFIRMED
**Evidence:** Architecture analysis

Critical difference: Storybook renders each story in a **single React tree** (or iframe). Decorators provide context via standard React `<Provider>` wrapping.

Our architecture creates **separate React roots** per ProseMirror NodeView (`createRoot` per component instance). This means:
1. React context from a parent NodeView cannot reach a child NodeView (they're separate roots)
2. Shared context (theme, locale) must be injected at each `createRoot` call, not via decorator composition
3. The "compound component" problem (AccordionItem needing Accordion context) requires a different solution — either a wrapper component in the registration manifest, or context injection at the NodeView factory level

**Implications:** Our spec's FR-19 (ComponentErrorBoundary) is correct to wrap each component instance independently. We should add a `wrapper` field to JsxComponentMeta for compound component context injection, analogous to Storybook's story-level decorators but applied at the NodeView factory level.

---

## Negative searches

* Searched for "@storybook/blocks standalone" / "storybook blocks outside storybook" → No standalone usage possible; all blocks require DocsContext
* Searched for "storybook decorator standalone library" → No extraction exists; decorators are coupled to Storybook runtime

---

## Gaps / follow-ups

* Should our JsxComponentMeta include a `wrapper` field for compound component context injection?
* Storybook's `play` function pattern — could we adapt it for component preview testing in our editor? (Low priority)
