---
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-desktop": patch
---

chore(licensing): ship `THIRD_PARTY_NOTICES.md` in npm tarball + Electron `.app`

Adds a reproducible attribution pipeline for the published `@inkeep/open-knowledge` CLI tarball and the `@inkeep/open-knowledge-desktop` Electron app. Both bundle source from MIT/ISC/BSD/Apache-2.0 deps and OFL-1.1 fonts; the new `THIRD_PARTY_NOTICES.md` at repo root is the committed source-of-truth and ships under each artifact:

- npm CLI tarball — copied to `packages/cli/dist/THIRD_PARTY_NOTICES.md` via the existing `build:assets` step (already covered by `files: ["dist", …]`).
- Electron desktop — `electron-builder.yml` `extraResources` places it at `Open Knowledge.app/Contents/Resources/THIRD_PARTY_NOTICES.md` (alongside electron-builder's auto-generated `LICENSE` + `LICENSES.chromium.html`).

The closure walker (`scripts/generate-third-party-notices.mjs`) is deterministic (byte-stable sort, no timestamps) and the committed file is drift-checked against the resolved dep tree by `bun run check`, `bun run check:full:parallel`, and the `lint` job in `.github/workflows/ci.yml`.
