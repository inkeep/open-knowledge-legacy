# Changelog — mastra-speakeasy-cli-install-recommendations

## 2026-04-20 — initial research pass

- Initial report landed covering D1-D7 (install-page ordering, distribution channels, dlx vs permanent, pinning/upgrade, first-run/auth/scaffolding, CI, bin ergonomics).
- **D8 (in-product browser preview handoff) dropped mid-run** at user request. W3 subagent was killed after confirming `.claude/launch.json` existed; partial findings discarded. Rubric table + Limitations section in REPORT.md reflect the descoping. The dropped slot was later renumbered to `~~DX~~` to free `D8` for the postinstall-binaries extension.
- Audit (Step 5b, via general-purpose subagent) returned ship-ready with two medium-severity findings, both resolved via surgical edits:
  - **M1** — Added `0700` directory mode alongside `0600` file mode for Mastra credentials in D5 finding.
  - **M2** — Split `cursor-global` out from the generic "Cursor" label in both Executive Summary and D5 finding to match the actual `--mcp <editor>` enum.
- Low-severity audit items (L1-L5, phrasing nits) left unchanged — cosmetic only.

## 2026-04-20 — extension: D8 postinstall-binaries + D9 telemetry + 1P synthesis

- **Scope widened at user request** to add two deep-dive dimensions and a 1P Conclusions section. The prior dropped-D8 label (in-product browser) is renumbered in the rubric as `~~DX~~` so the new D8 slot cleanly holds postinstall-binaries.
- **D8 — Postinstall-binary distribution patterns** — deep dive covering the four patterns (optionalDeps per-platform, postinstall CDN download, napi-rs validator, single-file bundling). Key primary sources: esbuild npm/package.json + install.ts fallback chain, Bun + turbo + @swc/core package.json, Prisma DeepWiki, Electron install.js + docs, sharp issue #3750, Bun issue #29120. Evidence file: `evidence/d8-postinstall-binaries.md`.
- **D9 — CLI + desktop telemetry patterns** — deep dive covering 13 tools (Mastra, Speakeasy, Next.js, Astro, Vercel CLI, Homebrew, Turborepo, Prisma, Storybook, VS Code, Cursor, Vite, gh). Turborepo identified as gold-standard (only surveyed tool honoring `DO_NOT_TRACK`); VS Code 4-level `telemetry.telemetryLevel` identified as reference for desktop granularity; Mastra confirmed below industry bar. Evidence file: `evidence/d9-telemetry.md`.
- **New section: "Application to Open Knowledge (Conclusions, 1P)"** — explicitly 1P at user request. Grounded in `specs/2026-04-11-electron-desktop-app/SPEC.md` (Draft; gating V0-20) and `projects/v0-launch/PROJECT.md`. Key decisions mapped against D1-D9 evidence; 8 ranked recommendations; what to copy/avoid from each peer.
- Stance note added to REPORT.md clarifying that D1-D9 remain Factual / 3P while the new Application section is Conclusions / 1P — a future reader can use D1-D9 for a different product without inheriting the open-knowledge-specific synthesis.
- **Cross-cutting patterns extended** to 9 items (added #6 Pattern A trajectory, #7 no-Electron-via-npm, #8 telemetry quality 10× spread, #9 Obsidian zero-default alignment with Electron spec NG3).
- Frontmatter updated: `updatedAt: 2026-04-20`; subjects + topics extended to reflect the new dimensions.
- Audit for the extended report NOT yet run (pending this changelog + commit). Recommended as a follow-up before the PR lands.

### Artifact layout after extension

```
reports/mastra-speakeasy-cli-install-recommendations/
├── REPORT.md                                           (D1-D9 + Application to Open Knowledge)
├── evidence/
│   ├── d1-install-page.md
│   ├── d2-distribution-channels.md
│   ├── d3-one-shot-vs-permanent.md
│   ├── d4-pinning-and-upgrade.md
│   ├── d5-first-run-auth-scaffolding.md
│   ├── d6-ci-patterns.md
│   ├── d7-short-name-bin.md
│   ├── d8-postinstall-binaries.md                      (new)
│   └── d9-telemetry.md                                 (new)
└── meta/
    ├── _changelog.md                                   (this file)
    ├── audit-findings.md                               (initial pass only; extension not yet audited)
    └── runs/
        └── 2026-04-20-initial/
            └── RUN.md
```
