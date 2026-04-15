# Evidence: D8 — Cross-Cutting Synthesis

**Dimension:** Pattern space, prop editing UX taxonomy, relevance to in-editor component blocks
**Date:** 2026-04-14
**Sources:** Synthesis from D1–D7 evidence files + search results

---

## Findings

### Finding: Three distinct prop editing models exist across the tools surveyed
**Confidence:** CONFIRMED (by enumeration across D1–D7)
**Evidence:** Aggregated from D1 (Ladle), D3 (Playroom), D4 (React Cosmos), D5 (react-live), D6 (Sandpack)

```text
Model A — Declarative metadata controls (argTypes/args pattern):
  Tools: Ladle, Storybook (reference baseline)
  How: Author declares argTypes in story metadata; framework generates UI controls panel.
  Prop editing: Click controls in sidebar panel to change prop values.
  Innovation surface: performance (Ladle), multi-framework (Storybook).
  Limitation: requires manual argTypes unless TypeScript + react-docgen-typescript is active.

Model B — Code editor as the sole editing surface:
  Tools: Playroom, Sandpack, react-live / Docusaurus live code, react-styleguidist
  How: User edits JSX/code directly; live preview reflects changes immediately.
  Prop editing: Edit the prop value in the code text.
  Innovation surface: Playroom's multi-viewport/theme rendering; Sandpack's full npm bundler.
  Limitation: no discrete prop controls; editing experience quality depends on editor (autocomplete, etc.).

Model C — Hooks-as-controls (fixture inputs pattern):
  Tools: React Cosmos
  How: useFixtureInput/useFixtureSelect hooks inside fixture files generate Control Panel items.
  Prop editing: Controls panel updates → hook values → re-render.
  Auto-controls: Node fixtures get prop inputs automatically (zero-config).
  Innovation surface: React-idiomatic, test-first, library-not-framework.
  Limitation: hooks couple the component fixture to Cosmos; not portable to other tools.
```

**Implications:** No tool has converged on a fourth model: schema-driven declarative controls with live inline prop editing inside the document (what a component block system in an editor would need). All tools render components in a dedicated viewer pane, not inline in a content document.

---

### Finding: All tools use an out-of-document render target — none support in-document, inline component rendering with controls
**Confidence:** CONFIRMED
**Evidence:** Survey of all tools D1–D7

```text
Storybook: dedicated Canvas pane + Controls sidebar.
Ladle: dedicated Story pane + Controls panel.
Histoire: Story card + Controls slot (separate rendering context).
Playroom: full-screen multi-viewport iframe grid — no document embedding.
React Cosmos: Fixture preview iframe + Control Panel sidebar.
react-live/Docusaurus: LivePreview below/above LiveEditor — block-level in a documentation page 
  but NOT inline in a rich text document flow.
Sandpack: SandpackPreview iframe + SandpackCodeEditor — always a separate code+preview pair.
```

**Implications:** The in-editor component block use case (where a ProseMirror node renders a component preview with editable props inline in the document flow) is not served by any existing tool. The closest analogy is react-live's LivePreview embedded in a documentation page — but this still uses a static scope map, not a dynamic prop editing UI.

---

### Finding: Playroom's multi-viewport simultaneous rendering and zero-metadata registration are the patterns most adjacent to an in-editor use case
**Confidence:** INFERRED
**Evidence:** D3 (Playroom) + design documentation

```text
Zero-metadata: Component registration = named exports. No argTypes, no story metadata object.
Code-as-props: Prop editing = editing JSX text (most direct relationship between code and rendered output).
Snippet system: predefined JSX templates → closest existing analog to a "component block" 
  in a content document (insert → edit → preview).
useScope: inject runtime values without component-level declaration.
Multi-viewport: renders once per theme + viewport combination — 
  analogous to responsive preview in a docs editing context.
```

**Implications:** Playroom's snippet + JSX editor pattern is the closest published pattern to an in-editor component block system. The key gap: Playroom does not embed in a document — it IS the document. Bridging to an embedded node in a rich text editor would require adopting Playroom's JSX-eval approach while dropping its full-screen IDE model.

---

### Finding: Sandpack is the most viable rendering substrate for in-browser component preview with npm dependencies
**Confidence:** CONFIRMED
**Evidence:** D6 (Sandpack) + adoption data

```text
SandpackProvider + SandpackPreview = composable React component pair.
files prop: inject any component source code as virtual filesystem entries.
customSetup.dependencies: install any npm package via CDN.
Multiple SandpackPreview instances per Provider: independent previews for each component block.
2.75M monthly downloads: proven production embeddability.
Limitation: requires CDN (internet) for dependency resolution; component source must be 
  provided as virtual file strings (not pre-bundled).
```

**Implications:** For a component block system where components are npm-published and editable-code is part of the UX, Sandpack is the most direct building block. The key trade-off: Sandpack cannot pre-bundle locally-defined components for offline use without self-hosting the bundler.

---

### Finding: react-live is the most appropriate substrate for precompiled, scope-registered component previews without a bundler
**Confidence:** CONFIRMED
**Evidence:** D5 (react-live) + D7 (additional) + adoption data (1.28M/month)

```text
Sucrase transpilation: in-browser, no server, no CDN, works offline.
Scope whitelist: exactly the right model for a controlled set of documented components 
  (e.g., a design system's 30 components that can be used in content documents).
1.28M/month downloads: production-proven embeddability in docs.
LiveProvider + LivePreview as embeddable React components: drop into any layout.
Limitation: cannot import arbitrary npm packages — scope is a static object.
```

**Implications:** react-live is the right substrate for a closed-world component set (design system components registered at startup). Sandpack is the right substrate for open-world components (any npm package). These are different product decisions.

---

### Finding: No tool provides schema-driven form generation (JSON Schema → UI controls) for component props
**Confidence:** CONFIRMED
**Evidence:** D1–D7 negative searches

```text
Storybook argTypes: closest — developer declares type + options; framework generates input type.
  But argTypes schema is non-standard (not JSON Schema or OpenAPI).
React Cosmos useFixtureSelect: developer declares options array in hook call.
Histoire HstText/HstCheckbox: developer wires controls manually.
None of the tools generate controls from a JSON Schema / Zod / TypeScript interface 
  without developer authorship of the controls declaration.
```

**Implications:** The gap between "TypeScript props interface" and "live editing UI" is not fully automated in any tool. The best existing approaches are: react-docgen-typescript → argTypes (Storybook, partially Playroom autocomplete) and Node fixture auto-detection (React Cosmos, mechanism unclear).

---

## Gaps / follow-ups
- Whether React Cosmos's Node fixture prop auto-detection uses runtime inspection, static analysis, or both — this would clarify whether it could be repurposed for arbitrary component auto-controls
- Whether any tool in the design-token / Figma-to-code space (Supernova, Knapsack, Zeroheight) has implemented in-document component blocks with prop editing — adjacent territory not surveyed here
