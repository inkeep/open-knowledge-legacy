# Evidence: D5 — Docusaurus Live Code / react-live

**Dimension:** Docusaurus theme-live-codeblock + react-live — scope registration, JSX evaluation, limitations
**Date:** 2026-04-14
**Sources:** https://docusaurus.io/docs/markdown-features/code-blocks, https://docusaurus.io/docs/api/themes/@docusaurus/theme-live-codeblock, https://nearform.com/open-source/react-live/, https://api.github.com/repos/FormidableLabs/react-live, https://api.npmjs.org/downloads/point/last-month/react-live

---

## Key files / pages referenced
- https://docusaurus.io/docs/markdown-features/code-blocks#interactive-code-editor — Live blocks activation syntax
- https://docusaurus.io/docs/api/themes/@docusaurus/theme-live-codeblock — Theme configuration
- GitHub search result: react-live npm (sucrase transpiler, scope prop mechanism)
- GitHub API: react-live 4,604 stars, last pushed 2025-01-09

---

## Findings

### Finding: react-live evaluates JSX via Sucrase (not Babel) — transpiles in-browser, no server required
**Confidence:** CONFIRMED
**Evidence:** npm search result: "react-live ships with Sucrase and doesn't currently support configuring the transpiler"

```text
"React-live takes your code and transpiles it with Sucrase, and the transpiled code is then rendered 
 in the preview component (LivePreview), which does a fake mount if the code is a React component."
Sucrase architecture: in-browser, ~10x faster than Babel for JSX (no type-checking).
react-live ships with Sucrase — cannot swap transpiler.
Alternative: component-playground (Formidable Labs, now abandoned) used babel-standalone.
```

**Implications:** Sucrase-based evaluation means react-live is fast and lightweight but the transpiler is not configurable. TypeScript type-checking during evaluation is not possible. Error messages may differ from Babel.

---

### Finding: react-live component scope is an explicit whitelist — all custom components must be pre-registered
**Confidence:** CONFIRMED
**Evidence:** npm documentation + Docusaurus docs + egghead.io lesson reference

```text
"Only React is injected into scope by default."
"scope prop on LiveProvider: pass an object containing the components you want to make available."
Example: const scope = { MyButton }; <LiveProvider scope={scope} code={code}>
"To use hooks provided by React in React Live, either use React.useState or set up scope 
 so that useState is provided separately."
"It is not possible to import components directly from the react-live code editor — 
 you have to define available imports upfront."
```

**Implications:** react-live has a closed-world component model. Every component available in the live editor must be pre-registered in the scope object. This is a design choice that matches Docusaurus's documentation use case (controlled, audited component sets) but limits general-purpose use where arbitrary imports are needed.

---

### Finding: react-live API — LiveProvider / LiveEditor / LivePreview / LiveError composable components
**Confidence:** CONFIRMED
**Evidence:** npm documentation + Formidable Labs (nearform) docs

```text
LiveProvider: root component; accepts code (string), scope (object), language, noInline, disabled, theme.
LiveEditor: CodeMirror/PrismJS-powered code input; controlled by LiveProvider context.
LivePreview: renders the transpiled + evaluated output.
LiveError: displays compilation/runtime errors.
Modular: can compose these independently within a LiveProvider.
noInline prop: required when code spans multiple components (requires explicit render() call).
```

**Implications:** Headless composable architecture — consumers control layout entirely. This is the correct model for embedding live code into arbitrary UIs.

---

### Finding: Docusaurus theme-live-codeblock wraps react-live with a ReactLiveScope swizzle pattern for custom component injection
**Confidence:** CONFIRMED
**Evidence:** https://docusaurus.io/docs/markdown-features/code-blocks#interactive-code-editor

```text
Activated by: fenced code block with ```jsx live (or ```tsx live).
Default: all React imports available. Custom components: NOT available unless swizzled.
Swizzle command: creates src/theme/ReactLiveScope/index.js.
ReactLiveScope exports an object: { React, ...customComponents }
"It is not possible to import components directly from the react-live code editor."
playgroundPosition config: position of the preview (top or bottom of editor).
noInline option: supported for multi-component code.
```

**Implications:** Docusaurus's integration of react-live is a documentation-first use case. The swizzle pattern makes component injection a one-time global registration, not per-block. Any component needed in live blocks must be in ReactLiveScope. This is exactly the pattern used by most "component block" systems in documentation tools.

---

### Finding: react-live maintenance status — v4.1.8 released Nov 2024, moderate activity
**Confidence:** CONFIRMED
**Evidence:** GitHub API + npm registry

```text
GitHub: 4,604 stars, 254 forks, last pushed 2025-01-09, 27 open issues
Latest release: react-live@4.1.8, 2024-11-19
Monthly downloads (Mar 15–Apr 13 2026): 1,282,929 — highest single-package monthly download count surveyed
@docusaurus/theme-live-codeblock monthly downloads: 145,176
```

**Implications:** react-live is the most widely used library in this survey by monthly downloads (~1.3M/month). Its maintenance cadence has slowed (last push Jan 2025) but Formidable/Nearform has transferred to NearForm and still maintains it. The high download count is driven by Docusaurus adoption (every Docusaurus site using live code blocks pulls this).

---

## Negative searches
- Searched: react-live automatic prop controls, controls panel → NOT FOUND (react-live is a code editor, not a controls UI)
- Searched: react-live configurable transpiler (swapping Sucrase) → NOT FOUND (hardcoded per npm docs)

---

## Gaps / follow-ups
- react-live v5 roadmap — is NearForm planning any major evolution? No evidence found.
- Whether the Docusaurus live codeblock theme's noInline is exposed via frontmatter or only as a code fence attribute
