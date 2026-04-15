# Evidence: D1 — Ladle

**Dimension:** Ladle (tajo/ladle) — Vite-native Storybook alternative architecture, controls system, maintenance
**Date:** 2026-04-14
**Sources:** https://ladle.dev/docs/, https://ladle.dev/docs/controls, https://ladle.dev/blog/introducing-ladle/, https://api.github.com/repos/tajo/ladle, https://registry.npmjs.org/@ladle/react/latest, https://api.npmjs.org/downloads/point/last-month/@ladle/react

---

## Key files / pages referenced
- https://ladle.dev/docs/ — Overview, React-only, Vite-based
- https://ladle.dev/docs/controls — argTypes, control types, hierarchy
- https://api.github.com/repos/tajo/ladle — Stars, last push, releases
- https://registry.npmjs.org/@ladle/react/latest — v5.1.1, Sept 2025 publish timestamp
- https://api.npmjs.org/downloads/point/last-month/@ladle/react — monthly downloads

---

## Findings

### Finding: Ladle is a direct Storybook drop-in for React, Vite-native, ~20x smaller bundle
**Confidence:** CONFIRMED
**Evidence:** https://ladle.dev (official docs) + LogRocket comparison article https://blog.logrocket.com/ladle-storybook-performance-project-sizes/

```text
"Storybook 6.4 outputs 5.1MB of assets, Ladle only 250KB, almost 20x smaller."
"Ladle outperformed Storybook: 1.2s cold start vs 8s, <500ms hot reload vs 2s."
Built on Vite + SWC (SWC is now the default compiler replacing Babel).
```

**Implications:** Ladle's architectural innovation is entirely in the build/serve layer — Vite replaces webpack. The story format, args, argTypes are intentionally borrowed from Storybook CSF.

---

### Finding: Ladle's controls system uses args + argTypes — explicit/manual only, no automatic TypeScript prop extraction
**Confidence:** CONFIRMED
**Evidence:** https://ladle.dev/docs/controls + GitHub issue https://github.com/tajo/ladle/issues/456 ("Auto generate Controls from Typescript types")

```text
Controls: Radio/Inline-radio, Select/Multi-select, Check/Inline-check, Range, Boolean, Text (implicit for strings).
ArgTypes specify enumerated options. Args define default values.
"Ladle detects args / argTypes and provides the Control UI."
Three-tier hierarchy: per-story > file-level > global (.ladle/components.tsx).
GitHub issue #456: auto-generation from TypeScript types is an open feature request — NOT yet implemented.
```

**Implications:** Ladle requires manual argTypes declaration (same as Storybook's story-level approach). No automatic prop inference from TypeScript types as of v5.1.1. This is a regression vs Storybook's react-docgen-typescript integration.

---

### Finding: Ladle uses Storybook CSF story format — same *.stories.tsx naming and export convention
**Confidence:** CONFIRMED
**Evidence:** https://ladle.dev/docs/stories

```text
"Stories should use *.stories.jsx or *.stories.tsx naming conventions."
Exports are components; default export carries metadata (title, storyName, meta).
Story metadata (storyName, title, meta) must be static — no computed values.
```

**Implications:** Ladle is a runtime/build replacement for Storybook, not a format innovator. Stories written for one are largely portable to the other.

---

### Finding: Ladle maintenance status — active, v5.1.1 released Nov 2025, 686K monthly downloads
**Confidence:** CONFIRMED
**Evidence:** GitHub API response (last pushed: Dec 20 2025) + npm registry

```text
GitHub: 2,919 stars, 114 forks, last pushed 2025-12-20, 37 open issues, MIT license
npm: @ladle/react@5.1.1 published ~Sep 2025 (Unix ms 1762222299860)
Latest release: @ladle/react@5.1.1, 2025-11-04
Monthly downloads (Mar 15–Apr 13 2026): 686,361
Usage: 335 Uber projects with 15,896 stories (official blog)
```

**Implications:** Actively maintained, significant production adoption (Uber). Not at risk of abandonment.

---

### Finding: Ladle has no add-on ecosystem — no accessibility, visual regression, or Chromatic equivalent
**Confidence:** CONFIRMED
**Evidence:** https://ladle.dev/blog/introducing-ladle/ + comparison articles

```text
"Storybook has an ecosystem that Ladle can't match: accessibility testing, visual regression, Chromatic, Figma integration, 200+ addons."
Ladle is intentionally scoped: "basic prop controls only" vs "full controls with auto-generated args."
```

**Implications:** Trade-off is explicit — Ladle optimizes for speed at the cost of ecosystem depth.

---

## Negative searches
- Searched: Ladle React adapter for non-React frameworks → NOT FOUND (React-only by design)
- Searched: Ladle automatic TypeScript prop extraction → NOT FOUND (open feature request #456)

---

## Gaps / follow-ups
- Ladle v5 changelog specifics beyond v5.1.1 patch (middleware refactor) — not critical for report
