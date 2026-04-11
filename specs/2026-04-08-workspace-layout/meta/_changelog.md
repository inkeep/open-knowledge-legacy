---
name: Workspace layout spec — changelog
description: Append-only process history for the init_spike → packages/* migration spec
---

## 2026-04-08 — Spec scaffolded

- Session goal: migrate init_spike from nested folder to traditional workspace setup, modeled on ~/agents and ~/openbolts.
- Baseline commit stamped: `fa3dd17` (docs: mark presence/awareness as shipped, PR #7).
- Two prior `/explore` passes provided the world model — persisted to `evidence/` as structured files rather than re-investigating.
- Intake decision: openbolts-flavored bun workspace is the recommended shape (D1); swept docs/ into scope (D2); AGENTS.md/CLAUDE.md strategy locked to root-canonical + symlink (D6). Editor package name left as Q1 for user judgment.
- Closed prior-explore unknowns before scaffolding:
  - ~/agents has NO root tsconfig (each package self-contained) — confirmed via `find`
  - docs/ ↔ init_spike cross-imports: zero (both directions grep empty)
  - No turbo.json anywhere in open-knowledge today
  - AGENTS.md/CLAUDE.md status in open-knowledge: neither exists at root; only `init_spike/CLAUDE.md` as a real file (not symlink). Both template repos keep AGENTS.md real + CLAUDE.md as symlink at root only, no per-package files.
- 7 open questions extracted, all P0. First decision batch prepared for user.

## 2026-04-08 — Paused pending PR #10

- Discovered PR #10 (`spec: CLI packaging as @inkeep/open-knowledge`, branch `spec/cli-packaging`) already proposes the `packages/*` workspace migration as part of a larger 4-package restructure (`core`/`server`/`cli`/`app`) to ship a global npm CLI.
- PR #10 answers Q1 (editor → `packages/app`), fixes the `persistence.ts:26` latent bug via R2.4 (content dir from config), and fixes hardcoded port 5173 via R1.8 (window.location-derived WS URL).
- PR #10 gaps this spec uniquely covers — to reassess after PR #10 merges:
  - CI workflow rewrite (PR #10's Agent Constraints put `.github/` out of scope, self-contradictory with S1)
  - Husky hook coverage after biome exclusion removal
  - `.gitignore:16` path update (`init_spike/content/test-doc.md`)
  - Root `biome.jsonc:33` `!init_spike` exclusion removal
  - `init_spike/package.json:55-58` codemirror `overrides` migration to root
  - Task runner (turbo) decision — PR #10 is silent
  - Root tsconfig.json strategy — PR #10 leaves ambiguous
  - AGENTS.md/CLAUDE.md strategy: PR #10 proposes per-package split (R1.7, S10); this spec's D6 proposes root-canonical + symlink (template-backed by ~/agents and ~/openbolts). Disagreement to surface post-merge.
  - `feat/init-spike` CI branch filter removal
- Decision: pause this spec. Do not finalize, do not ship. Revisit after PR #10 merges to turn the surviving delta into a cleanup PR or review comments.
- Status: PAUSED.
