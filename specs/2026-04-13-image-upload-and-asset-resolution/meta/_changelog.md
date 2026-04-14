# Changelog

Append-only process history.

## 2026-04-13 — Session 1 (Intake + partial Backlog)

- Worktree created at `.claude/worktrees/spec-image-uploads` on branch `spec/image-upload-handling` from `origin/main@b822fb2`.
- Grounding pass on content-filter, file-watcher, TipTap image extension. Confirmed: TipTap `Image` already in `sharedExtensions`; mdast `image` is a Tier A passthrough handler; content-filter already enforces `exclude > include`.
- Dispatched `/research` on markdown asset conventions. Persisted `evidence/markdown-asset-conventions.md`. Finding: sibling-co-located dominates markdown-first authoring tools; reference-driven inclusion is a build-time-only pattern that fails live-editor races.
- User pushback on sibling rule (D3 over-inclusion concern); resolved via hardcoded extension allowlist.
- User pointed to PR #41 (implement/image-upload). Read full diff. Persisted `evidence/pr41-current-state.md` with keep/change catalog.
- Reframed spec as a rework of PR #41, not greenfield. SCR updated.
- Locked: D1 (rework-of-PR-#41 framing), D2 (move UI out), D3 (sibling + hardcoded ext allowlist), D6 (sibling-only v1), D7 (editing-md-relative references).
- Still open: D4 (P0/P2 triage on 22 candidate OQs), D5 (project/deadline context), D8 (collision strategy specifics), D13 (MCP asset-write tool), D14 (undo policy), D16 (`content.uploadsDir` config key fate).
- Scaffolded `SPEC.md` + `meta/_changelog.md` + `evidence/` directory. Baseline commit stamped: `b822fb2`.

## 2026-04-13 — Session 1 (Audit + Assess)

- Spawned audit + design-challenge subagents in parallel against scaffolded SPEC.md.
- **Audit findings (9): 3H, 4M, 2L.** Persisted at `meta/audit-findings.md`.
- **Challenge findings (6): 2H, 3M, 1L.** Persisted at `meta/design-challenge.md`.
- **Applied (factual corrections):**
  - **H1-Audit (decision-implicating):** D15 retargeted from `safeContentPath` (which appends `.md`) to `isWithinContentDir` (already exists at `persistence.ts:50`). D15 now spells out 4-step normalize-and-check sequence.
  - **H3-Audit:** parentDocName normalization made explicit in D15 (reject abs/`..`/NUL).
  - **H2-Audit:** D4 priority counts corrected to 13 P0 + 8 P2 + 1 dup-merge = 22; full Q1-Q22 enumeration embedded in §11 with resolution status.
  - **M1-Audit:** D11 wording tightened — gitignore/exclude check ordered first explicitly.
  - **M3-Audit:** "ms-scale" replaced with "platform-dependent, typically <200ms" with Linux/macOS specifics.
  - **M4-Audit:** New decision row D17 added for upload response-shape change (bare filename).
  - **M3-Challenge (partial):** D11 changed from `Set<string>` (boolean) to `Map<string, number>` (refcount); A4 + A5 added documenting rename + hot-reload assumptions.
  - **L2-Audit:** NG6 trigger condition mirrored to §15.
  - Risks table (§14) gained two new rows: raw `.md` HTTP exposure (Med/Med pending Q23), parentDocName spoofing (Med/Low, mitigated by D15).
- **Surfaced to user (decision reopens):** Q23 (narrow sirv to assets only — H1-Challenge), Q24 (D7 reconsider — H2-Challenge), Q25 (D12 SVG reconsider — M4-Challenge), Q26 (staged-vs-all-at-once schedule call — M5-Challenge).
- **Skipped (cosmetic):** L1-Audit (decision-ID ordering), L6-Challenge (D14 wording sharpening).
- Confirmed sound by audit: PR #41 facts (busboy, 10MB, `openSync('wx')`, `uploadsDir` default, FileHandler wiring, MIME allowlist, scoped sirv mount), `Image` extension presence, `ContentFilter.isExcluded` semantics. Confirmed sound by challenge: D8 naming, D13 MCP deferral, FR11/FR12 security, core SCR.

## 2026-04-13 — Session 1 (Reopens resolved + Finalize)

- **Q23 → NO.** Filtered-sirv stays wide (no narrow to ASSET_EXTENSIONS). User direction: auth (currently absent system-wide) is the future gate; revisit when auth lands. Logged in §15 Future Work — Identified.
- **Q24 → Hybrid (option c).** D7 updated to shortest-path rule: bare filename when sibling, root-relative-with-`/` otherwise. Editor gains `shortestImageRef(asset, md)` helper. For uploads (always sibling per D6) this collapses to bare filename. Cross-dir helper present for future move/import flows.
- **Q25 → YES.** D12 updated: SVG accepted at storage. ASSET_EXTENSIONS += `'svg'`; ALLOWED_IMAGE_MIME_TYPES += `'image/svg+xml'`. Render via `<img src>` only (per HTML spec, scripts in SVG-as-img don't execute). Inline `<svg>` embedding remains forbidden in editor (Agent Constraints ASK_FIRST). Aligns with CLAUDE.md storage-fidelity precedent.
- **Q26 → All today.** Full §13 rework checklist ships in one PR (taking over #41). A3 benchmark added to acceptance-for-merge criteria.
- **Verify pass (Step 8):**
  - All decisions LOCKED or DIRECTED — no ASSUMED entries blocking.
  - All 1-way doors (D7, D9, D11, D12, D15, D16, D17) have evidence + user confirmation.
  - All Non-goals temporally tagged (NG1-NG6).
  - In Scope passes resolution-completeness gate: decisions made, deps named (no new beyond PR #41), architectural viability validated, integration confirmed, acceptance criteria verifiable, no dependency on Out-of-Scope items.
  - Quality bar must-haves satisfied. A3 (filter perf) is a tracked assumption with verification plan in acceptance criteria; A4 (rename = delete+create) is Med confidence with a planned watcher test; A5 (no hot-reload) is HIGH confidence by inspection.
- Status: **Approved** for Session 1. Spec ready for implementation against §13 checklist.
