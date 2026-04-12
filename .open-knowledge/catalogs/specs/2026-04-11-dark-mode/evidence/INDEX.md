---
title: evidence
description: ""
generated: true
schema_version: 1
---

## Articles

- **[CodeMirror 6 dark theme — options for SourceEditor](specs/2026-04-11-dark-mode/evidence/codemirror-dark-theme.md)** — Survey of dark-theme packages compatible with the SourceEditor's basicSetup + markdown configuration.
- **[Dark-mode CSS and component gap inventory](specs/2026-04-11-dark-mode/evidence/gap-inventory.md)** — Exhaustive list of every surface in packages/app that will not theme correctly when `.dark` is applied, with file:line, severity, and proposed fix.
- **[Existing dark-mode token infrastructure in packages/app](specs/2026-04-11-dark-mode/evidence/current-state-tokens.md)** — Catalog of `.dark` token block, `@custom-variant` setup, and existing `dark:` utility usage already present in the editor SPA before this spec.
- **[FOUC prevention strategy for Vite SPA](specs/2026-04-11-dark-mode/evidence/vite-spa-fouc.md)** — How to prevent flash-of-light-content when loading the editor SPA with a dark theme preference, given there is no SSR.
- **[Reference implementation — @inkeep/agents agents-manage-ui dark mode](specs/2026-04-11-dark-mode/evidence/reference-impl-agents-manage-ui.md)** — How the reference Next.js app does dark mode (next-themes provider config + theme-toggle component) and what we mirror vs adapt for the Vite SPA.
