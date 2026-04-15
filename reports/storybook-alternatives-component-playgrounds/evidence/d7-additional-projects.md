# Evidence: D7 — Additional Projects

**Dimension:** Additional relevant projects — react-styleguidist, react-showroom, Vitebook, StoryLite, component-playground (deprecated)
**Date:** 2026-04-14
**Sources:** GitHub APIs, npm registry, search results

---

## Key files / pages referenced
- https://api.github.com/repos/styleguidist/react-styleguidist — 11,154 stars, last pushed Jan 2025
- https://api.github.com/repos/malcolm-kee/react-showroom — 46 stars, last pushed Feb 2026
- https://github.com/vitebook/vitebook — archived, no longer maintained
- https://github.com/itsjavi/storylite — experimental, limited bandwidth Feb 2025

---

## Findings

### Finding: react-styleguidist — 11K stars but declining maintenance; last release 13.1.4 in 2023
**Confidence:** CONFIRMED
**Evidence:** GitHub API + npm registry + search results

```text
GitHub: 11,154 stars, 1,420 forks, last pushed 2025-01-07, 246 open issues
Monthly downloads (Mar 15–Apr 13 2026): 251,416
"Latest version 13.1.4 last published a year ago" (as of search date ~2025).
"2 open source maintainers collaborating; 139 other projects using react-styleguidist."
Architecture: Markdown files alongside components; props extracted via react-docgen.
Distinctive feature: living style guide — Markdown examples become editable playgrounds.
```

**Implications:** react-styleguidist pioneered the "Markdown alongside components" documentation pattern. It pre-dates Storybook's dominance. Its architecture (Markdown + react-docgen prop extraction + live code blocks) is more similar to Docusaurus live code than to Storybook stories. The declining maintenance (last real release 2023, 246 open issues) makes it a legacy reference point rather than an active alternative.

---

### Finding: react-showroom — 46 stars, recent pushes Feb 2026, auto-generates controls from prop definitions
**Confidence:** CONFIRMED (low adoption, architecturally notable)
**Evidence:** GitHub API + react-showroom.js.org

```text
GitHub: 46 stars, 1 fork, last pushed 2026-02-17
Description: "Document React components by declaring props definition and writing markdown."
"Automatically extracts props from component definitions and provides sensible default controls 
  without manual configuration."
"Attempts to infer controls based on the props definition."
Edit code / add comments on specific examples with shareable URLs, no backend required.
SSR-friendly: site can be pre-rendered at build time.
Supports: TypeScript (TSX/TS), JavaScript (JSX/JS), HTML.
```

**Implications:** react-showroom's automatic prop extraction without argTypes declaration is architecturally notable (similar to React Cosmos's Node fixture auto-detection). However, with 46 stars and 1 fork, it has negligible adoption and cannot be considered a production-ready option. Useful as evidence that automatic prop extraction is technically feasible in the React ecosystem.

---

### Finding: Vitebook — archived, original author redirected users to Histoire
**Confidence:** CONFIRMED
**Evidence:** GitHub search results + archive notices

```text
"Vitebook is currently archived and no longer maintained by its original developer."
"For users seeking a Storybook alternative powered by Vite, Histoire is recommended by the original Vitebook author."
Architecture before archival: Vite-powered, multi-framework (Vue, React, Svelte).
```

**Implications:** Vitebook demonstrates the graveyard risk for Storybook alternatives without a large commercial backer. Its users migrated to Histoire (Vue) or Ladle (React).

---

### Finding: StoryLite — experimental, CSF 3.0 compatible, limited maintenance bandwidth as of Feb 2025
**Confidence:** CONFIRMED
**Evidence:** GitHub search results + project README

```text
"Lightweight (36 KB minified, 10KB min+gzip) with few dependencies."
"Interoperable with StoryBook's CSF 3.0 format."
"Built-in addons: dark mode, mobile view, grid, outline, maximize, open in new tab."
Project status (2025-02-01): "maintainer has no buffer to work on this project."
Controls panel: "planned as a must-have for future versions" — NOT yet implemented.
```

**Implications:** StoryLite is a proof-of-concept, not a production alternative. The CSF 3.0 compatibility is its distinguishing technical feature. No active maintenance.

---

### Finding: component-playground (Formidable Labs) — officially abandoned as of 2023
**Confidence:** CONFIRMED
**Evidence:** search results + npm advisory

```text
"Formidable Labs is no longer maintaining component-playground and is no longer responding 
  to issues or pull requests unless they relate to security concerns."
Latest version: 3.2.1, last published 7 years ago.
Architecture: used babel-standalone for transpilation (pre-Sucrase era).
Replaced by react-live (also by Formidable, now NearForm).
```

**Implications:** component-playground is historically significant as the predecessor to react-live. Its abandonment and replacement establishes react-live as Formidable's continued investment in this space.

---

### Finding: react-styleguidist pioneered automatic prop extraction via react-docgen — this pattern predates Storybook's argTypes
**Confidence:** INFERRED
**Evidence:** Architecture comparison across search results + react-styleguidist.js.org

```text
react-styleguidist uses react-docgen (static AST analysis) for prop extraction from PropTypes and TypeScript.
Storybook later adopted react-docgen-typescript for its autodocs / argTypes generation.
Playroom adopted react-docgen-typescript for editor autocompletion (but not a controls panel).
The pattern: static source analysis → prop metadata → UI controls generation.
```

**Implications:** The react-docgen approach to prop extraction has been proven to work in production (11K star project). Its limitation is that it requires PropTypes or TypeScript annotations on the component — not arbitrary component discovery. This is the same technical constraint that makes fully automatic prop controls hard without TypeScript.

---

## Negative searches
- Searched: "component explorer" npm active 2024 2025 → primarily yielded legacy projects or aggregator lists
- Searched: "prop editor" npm standalone active 2024 2025 → no notable standalone prop editor packages found
- Searched: "react controls" npm standalone active 2025 → no notable packages beyond the ones surveyed

---

## Gaps / follow-ups
- styleguidist maintainer activity — whether the project could receive a v14 update or if it's effectively in maintenance-only mode
