---
title: Static Site Prior Art
description: External prior-art findings for static publishing engines and search options relevant to Open Knowledge static-site publishing.
created: 2026-04-28
last-updated: 2026-04-28
---

# Static Site Prior Art

## Findings

### Next.js static export

Confidence: CONFIRMED

The current Next.js docs describe static export via `output: 'export'`; `next build` generates static HTML files per route, and output can be hosted by any web server that serves static HTML/CSS/JS assets.

Source: https://nextjs.org/docs/pages/guides/static-exports

Implication: the existing Fumadocs/Next docs app could potentially be adapted for static export, but static-export limitations must be validated against the chosen routing/search features.

### Fumadocs static export

Confidence: CONFIRMED

Fumadocs documents compatibility with Next.js static export by setting `output: 'export'`. Its static search guidance notes that default Orama route-handler search is not compatible with static export and needs static search mode.

Source: https://v14.fumadocs.dev/docs/ui/static-export

Implication: Fumadocs is plausible for a framework-template option, but search behavior needs explicit configuration and testing.

### Docusaurus static output

Confidence: CONFIRMED

Docusaurus deployment docs state that it emits static files into a `build` directory and that the generated site can be hosted by static hosts such as GitHub Pages.

Source: https://docusaurus.io/docs/deployment

Implication: Docusaurus is mature docs prior art, but adopting it would introduce a separate docs framework and content model into this monorepo.

### Astro markdown and Starlight

Confidence: CONFIRMED

Astro docs describe markdown files in `src/pages` as automatically generating routes and recommend content collections for richer markdown/MDX workflows. Starlight positions itself as an Astro documentation theme with navigation, search, internationalization, SEO, typography, code highlighting, and dark mode.

Sources: https://docs.astro.build/en/guides/markdown-content/ and https://starlight.astro.build/

Implication: Astro/Starlight is a strong static-first candidate, but it would add a new framework family to Open Knowledge.

### Pagefind static search

Confidence: CONFIRMED

Pagefind describes a workflow where it indexes generated static HTML and adds a static search bundle. Its docs claim a 10,000-page site can have a total network payload under 300 kB including the library.

Source: https://pagefind.app/

Implication: Pagefind is a promising search candidate for framework-agnostic static output, but its binary/package behavior under Bun/Node 24 and the repo's packaging constraints still need verification.
