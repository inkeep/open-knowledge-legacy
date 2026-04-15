# Evidence: D3 — Playroom

**Dimension:** Playroom (seek-oss/playroom) — JSX prototyping mechanics, prop editing, component discovery, in-editor relevance
**Date:** 2026-04-14
**Sources:** https://github.com/seek-oss/playroom/blob/master/README.md, https://api.github.com/repos/seek-oss/playroom, https://api.npmjs.org/downloads/point/last-month/playroom, https://www.npmjs.com/package/playroom, GitHub issue search

---

## Key files / pages referenced
- https://github.com/seek-oss/playroom/blob/master/README.md — Full architecture, config, snippet system
- https://github.com/seek-oss/playroom/blob/master/src/Playroom/RenderCode/RenderCode.js — JSX evaluation (source)
- GitHub API: v1.2.2 released 2026-03-30, 4,568 stars

---

## Findings

### Finding: Playroom renders live JSX through Babel + preset-env/preset-react in a sandboxed iframe — no server required
**Confidence:** CONFIRMED
**Evidence:** GitHub README + search for RenderCode.js + npm semver (sucrase experimental branch)

```text
"zero-install code-oriented design environment, built into a standalone bundle"
Default: "project code run through Babel + preset-env + preset-react" for JSX support.
iframeSandbox option: sets sandbox attribute on Playroom's iframe (minimum allow-scripts).
Code evaluation happens inside sandboxed iframes for isolation.
npm evidence: experimental sucrase-transpile branch exists 
  (package version "0.0.0-sucrase-transpile-20231102215437"), suggesting migration work in progress.
RenderCode.js: wraps user code in a Fragment to compile, extracts errors as tooltip markers.
```

**Implications:** Playroom's execution model is iframe-sandboxed Babel-compiled JSX. No server-side bundling. The sucrase experimental branch suggests a potential migration to faster client-side transpilation similar to react-live.

---

### Finding: Component registration is entirely via a components export file — no per-component metadata required
**Confidence:** CONFIRMED
**Evidence:** https://github.com/seek-oss/playroom README

```text
"Components are defined in a designated file specified by the components config option."
"The file must export either a single object or named exports."
Example: export { default as Text } from '../Text'; or export { Button } from '../Button';
No story files, no argTypes, no metadata required — just export the component.
playroom.config.js: components, outputPath, themes, widths, snippets, frameComponent, scope, port.
```

**Implications:** Zero-metadata component registration. Playroom discovers components via named exports, not per-component declaration. This is the most frictionless registration model among the tools surveyed.

---

### Finding: Playroom has NO prop controls panel — the only editing surface is the JSX code editor
**Confidence:** CONFIRMED
**Evidence:** GitHub README + search results ("Playroom no prop controls panel")

```text
"Design with code" — the interface is a JSX editor, not a controls panel.
TypeScript support: react-docgen-typescript used for "better autocompletion in the Playroom editor"
  but the result is editor autocomplete, NOT a generated UI controls panel.
Snippets: predefined JSX code blocks (name, code, description, optional group) with live previews.
  These are insertable code templates, not parametrized prop controls.
No args, no argTypes, no controls panel in any Playroom release.
```

**Implications:** Playroom represents a fundamentally different philosophy from Storybook/Ladle — props are edited by directly editing JSX code, not through UI form controls. The TypeScript integration improves the editing experience (autocomplete) but doesn't add a controls UI layer. This is the most relevant design for a code-first, in-editor experience.

---

### Finding: Playroom's useScope hook and Frame Component enable provider injection without story-level metadata
**Confidence:** CONFIRMED
**Evidence:** https://github.com/seek-oss/playroom README

```text
scope option → file that exports useScope Hook → returns extra variables available in JSX runtime.
Example: import useTheme → return { useTheme } → theme variables accessible in all rendered JSX.
frameComponent: custom React component wrapping all rendered code; receives theme, themeName, 
  frameSettings, children props → enables ThemeProvider wrapping.
frameSettings: per-frame boolean toggles (RTL, debug modes) without affecting URL or persisting state.
```

**Implications:** Provider injection is handled at a global/framework level, not per-component. This avoids story-level decorator boilerplate.

---

### Finding: Playroom renders simultaneously across multiple themes and screen sizes — multi-viewport by default
**Confidence:** CONFIRMED
**Evidence:** GitHub README + seek-oss documentation

```text
"renders simultaneously across multiple themes and screen sizes"
widths: [320, 768, 1024] — multiple viewports rendered in parallel iframes.
themes: object map of theme names to theme values — all themes rendered simultaneously.
Snippet browser shows "live previews across themes and viewports as you navigate the list."
```

**Implications:** Multi-viewport simultaneous rendering is Playroom's signature UX innovation — no Storybook equivalent without addons.

---

### Finding: Playroom maintenance status — v1.2.2 released 2026-03-30, actively maintained
**Confidence:** CONFIRMED
**Evidence:** GitHub API + npm registry

```text
GitHub: 4,568 stars, 186 forks, last pushed 2026-03-30, 41 open issues
npm: playroom@1.2.2, latest release 2026-03-30
Monthly downloads (Mar 15–Apr 13 2026): 1,138,380
Requires Node.js 18.12.0+, supports React 18 and 19.
```

**Implications:** Actively maintained by SEEK (Australian tech company). Strong adoption signal (1.1M monthly downloads). React 19 support confirmed.

---

## Negative searches
- Searched: Playroom controls panel, prop editor UI, argTypes equivalent → NOT FOUND (by design — code-editor only)
- Searched: Playroom server-side rendering, SSR → NOT FOUND (client-side iframe-based)

---

## Gaps / follow-ups
- Exact RenderCode.js evaluation mechanism (Function constructor vs eval) — source file returned 404, documented from search results only
- Whether sucrase migration branch has been merged as of v1.2.2
