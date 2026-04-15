# Evidence: Adjacent Projects Survey (D6)

**Dimension:** D6 — Storybook alternatives + adjacent component playground tools
**Date:** 2026-04-14
**Sources:** GitHub repos, npm registry, official docs for Ladle, Histoire, Playroom, React Cosmos, react-live, Sandpack

---

## Key files / pages referenced

- https://ladle.dev/docs/controls — Ladle controls documentation
- https://github.com/tajo/ladle — Ladle GitHub
- https://histoire.dev — Histoire official site
- https://github.com/seek-oss/playroom — Playroom GitHub
- https://reactcosmos.org/docs/fixtures/fixture-inputs — React Cosmos fixture inputs
- https://nearform.com/open-source/react-live/ — react-live API
- https://sandpack.codesandbox.io/docs — Sandpack documentation
- https://github.com/pmndrs/leva — Leva GUI controls

---

## Findings

### Finding: Three distinct prop editing philosophies exist across the landscape

**Confidence:** CONFIRMED
**Evidence:** Cross-tool analysis

**Model A — Declarative metadata controls (Ladle/Storybook):**
Author declares argTypes → framework generates UI controls panel. Prop editing: click controls sidebar.

**Model B — Code editor as editing surface (Playroom, Sandpack, react-live):**
Author edits JSX/code text → live preview updates. Prop editing: edit text in editor.

**Model C — Hooks-as-controls (React Cosmos):**
`useFixtureInput`/`useFixtureSelect` hooks → Control Panel auto-generates. Prop editing: interact with generated controls sidebar.

**No tool implements Model D — schema-driven inline prop editing** (component renders inline in document, props editable via form that floats near the component, schema derived from TypeScript prop types automatically). This is what our Component Blocks v2 spec builds.

### Finding: Ladle — Storybook drop-in with zero innovation on controls

**Confidence:** CONFIRMED
**Evidence:** ladle.dev docs + npm registry

| Metric | Value |
|---|---|
| Latest version | @ladle/react@5.1.1 (2025-11-04) |
| GitHub stars | 2,919 |
| Monthly downloads | 686,361 |

Ladle borrows everything from Storybook — CSF story format, args/argTypes schema, control type taxonomy. Differentiated entirely by build infrastructure (Vite + SWC instead of webpack, ~20x smaller bundle, 6.7x faster cold start).

**Critical gap:** Automatic argTypes generation from TypeScript prop types is an open feature request (GitHub issue #456) — NOT implemented. Manual declaration required.

**Relevance:** None for our use case. Same model as Storybook with less capability.

### Finding: Histoire — Vue/Svelte only, React never shipped

**Confidence:** CONFIRMED
**Evidence:** histoire.dev + GitHub discussion #199

Histoire supports only Vue 3 and Svelte. React support requested since 2022, never implemented. Official docs direct React users to Ladle.

**Relevance:** None — not a React tool.

### Finding: Playroom — closest conceptual analog to in-editor component blocks

**Confidence:** CONFIRMED
**Evidence:** https://github.com/seek-oss/playroom

| Metric | Value |
|---|---|
| Latest version | v1.2.2 (2026-03-30) |
| GitHub stars | 4,568 |
| Monthly downloads | 1,138,380 |

Playroom represents a distinct philosophy: **code-as-prop-editing**. Key features:
- **Zero-metadata registration:** Just `export { Button } from '../Button'`. No argTypes, no stories.
- **JSX evaluation:** Babel + preset-react, iframe-sandboxed. Editing JSX IS the prop editing experience.
- **TypeScript + react-docgen-typescript provides autocomplete hints** but NOT a UI controls panel.
- **Snippet system:** Predefined JSX code blocks insertable from a browser, with live previews across all themes/viewports — closest existing analog to component block insertion.
- **Multi-viewport:** Renders simultaneously across configured widths and themes.

**The key gap:** Playroom IS the document rather than embedding in one. It's a standalone full-screen IDE with no way to be a node in a ProseMirror document.

**Relevance:** High conceptual relevance, no direct technical reuse. Patterns worth adopting: zero-metadata registration, snippet-browser-with-live-preview for component insertion UX.

### Finding: React Cosmos — hooks-as-controls, most React-idiomatic approach

**Confidence:** CONFIRMED
**Evidence:** reactcosmos.org docs

| Metric | Value |
|---|---|
| Latest version | v7.2.0 (2026-03-05) |
| GitHub stars | 8,656 |
| Monthly downloads | 118,504 |

React Cosmos uses fixtures (not stories) and provides hooks-as-controls:
- `useFixtureInput('name', defaultValue)` → text/number/boolean/object input
- `useFixtureSelect('name', { options })` → dropdown
- Return value is `[value, setValue]` (useState-like)
- Node fixtures get automatic prop controls with zero configuration

**Relevance:** The hooks-as-controls pattern is architecturally interesting — component control metadata co-located with the component. However, Cosmos hooks only work inside Cosmos fixtures, not portable.

### Finding: react-live — best rendering substrate for closed-world component sets

**Confidence:** CONFIRMED
**Evidence:** react-live docs + npm

| Metric | Value |
|---|---|
| Latest version | v4.1.8 (2024-11-19) |
| GitHub stars | 4,604 |
| Monthly downloads | 1,282,929 |

react-live uses Sucrase for in-browser JSX evaluation. Key properties:
- Composable React components: `LiveProvider` → `LiveEditor` → `LivePreview` + `LiveError`
- Scope whitelist: all available components pre-registered
- Offline-capable, no CDN required
- No prop controls UI — code editor IS the editing surface

**Relevance:** High technical relevance as a rendering substrate. LiveProvider + LivePreview is directly embeddable in a React application (including ProseMirror NodeView). But no prop controls — we must build our own.

### Finding: Sandpack — best rendering substrate for open-world component sets

**Confidence:** CONFIRMED
**Evidence:** sandpack.codesandbox.io docs

| Metric | Value |
|---|---|
| Latest version | v2.20.0 (2025-02-14) |
| GitHub stars | 6,101 |
| Monthly downloads | 2,753,343 |

Sandpack provides full in-browser code execution with virtual filesystem and npm dependency resolution from CDN. Two runtimes: browser-compiled (React/Vue) and Nodebox (Next.js/Vite).

**Key limitation:** Requires internet access for CDN-based dependency resolution. Not offline-capable without self-hosted bundler.

**Relevance:** For open-world component rendering (arbitrary npm packages, user-authored components). Not relevant to our closed-world design system use case.

### Finding: Leva — closest to standalone prop controls panel

**Confidence:** CONFIRMED
**Evidence:** https://github.com/pmndrs/leva

| Metric | Value |
|---|---|
| GitHub stars | ~8,000 |
| Monthly downloads | ~230,000 |

Leva (`pmndrs/leva`) is a React-first GUI panel with `useControls` hook. Supports: number (slider), string, color, boolean, select, vector, image, custom controls. Can be embedded anywhere in a React app.

**Key limitation:** Hook-based (assumes single React tree). Would need significant adaptation for our per-NodeView architecture (separate React roots per component instance).

**Relevance:** Closest existing standalone controls library, but not usable without adaptation. Building our own PropPanel is the right call.

### Finding: Maintenance landscape is stratified

**Confidence:** CONFIRMED
**Evidence:** npm registry + GitHub activity

| Tool | Status | Last Release |
|---|---|---|
| Playroom | Active | 2026-03-30 |
| React Cosmos | Active | 2026-03-05 |
| Ladle | Active | 2025-11-04 |
| react-live | Slowing | 2024-11-19 |
| Sandpack | Maintenance lull | 2025-02-14 |
| Histoire | Repo active, React never shipped | 2024-04-09 |
| react-styleguidist | Legacy | ~2023 |
| Vitebook | Archived/Dead | — |
| StoryLite | Abandoned | — |

---

## Negative searches

* Searched for any tool that embeds component controls inline in a rich text document → No results
* Searched for "storybook controls react library standalone" → No standalone package exists
* Searched for tools combining CRDT + MDX + inline rendering + prop editing → No results

---

## Gaps / follow-ups

* React Cosmos's automatic prop detection mechanism for Node fixtures — how does it work under the hood?
* Sandpack's maintenance trajectory — CodeSandbox shifting to AI products may affect long-term viability
* Leva's plugin system for custom controls — could inform our PropPanel escape hatch design
