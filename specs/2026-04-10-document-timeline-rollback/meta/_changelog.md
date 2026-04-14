# Changelog

## 2026-04-10 — Session 1: Intake + Scaffold

- Created spec from user seed: "shadow repo commit tracking enables a timeline of edits with rollback"
- Completed problem framing (SCR) + stress test
- Locked decisions D1-D7 from user input:
  - D1: Append-only rollback
  - D2: Rollback through CRDT
  - D3: Right-side collapsible panel
  - D4: All recovery modes, time-based is MVP wedge
  - D5: Agent undo deferred
  - D6: WIP expandable relative to checkpoints
  - D7: Per-writer attribution coloring in scope
- Identified critical open question: WIP ref preservation across Save Versions (Q1)
- Scaffolded SPEC.md, evidence/, meta/
- Starting world model investigation

## 2026-04-10 — Session 1: Investigation + Design

### Key discoveries
- **Q1 resolved:** WIP commits already preserved via checkpoint ancestry (shadow-repo.ts L491-504). No code change needed for single-writer case.
- **Multi-parent checkpoint verified:** Octopus merge commits work correctly with `git log`, `git show`, file filtering. ~10 line change preserves ALL writer chains. Key subtlety: must use `--full-history` flag.
- **Rollback composes from existing code:** `updateYFragment` + `setReconciledBase` + `stripFrontmatter` — same path as external-change handler. No new infrastructure.
- **UI fits cleanly:** Sheet component (right side), trigger in EditorHeader, `diff` library already in deps.

### Decisions locked
- D8: Preview-first restore UX (LOCKED)
- D9: Restore does NOT auto-checkpoint (LOCKED)
- D10: Timeline queries use `--full-history --author-date-order` (LOCKED)
- D11: Multi-parent checkpoint commits (DIRECTED, pending user final call)

### Open questions resolved
- Q1-Q6 all resolved via investigation
- Q7 (multi-parent scope) pending user decision
- Q8 (date lib) deferred to implementation (P2)

### Artifacts updated
- SPEC.md: user journeys (§5), requirements (§6), NFRs, success metrics (§7), current state (§8), full proposed solution (§9) with architecture diagram, API design, UI design
- evidence/: wip-ref-preservation.md, rollback-code-path.md, ui-architecture.md, multi-parent-checkpoint.md

## 2026-04-10 — Session 1: Freeze

### Decisions locked
- D11: Multi-parent checkpoint LOCKED (user confirmed after seeing attribution detail)
- D12: History API supports type/author/excludeAuthor filtering (LOCKED)

### Adversarial review findings addressed
- **BLOCKER fixed:** No-checkpoint rendering specified (FR16) — flat WIP list when zero checkpoints exist
- **BLOCKER fixed:** Rollback to non-existent file returns 404 (FR4 updated with `git cat-file -e` guard)
- **GAP fixed:** skipStoreHooks clarified — rollback uses raw string origin, L1 fires normally, registerWrite prevents watcher loop
- **GAP fixed:** Client observer safety documented — remote transactions skip bidirectional observers
- **GAP fixed:** Live refresh added (FR14) — poll on 10s interval while panel visible
- **GAP fixed:** UI states specified (FR15) — loading, empty, error, preview loading, rollback error
- **GAP fixed:** Zero-WIP orphan checkpoint — falls back to latest checkpoint ref as parent (FR13 updated)
- **GAP fixed:** Standalone mode limitation acknowledged — WIP-only timeline, added to risks + future work
- **GAP fixed:** Read lock clarification — implementation note added
- **GAP fixed:** TREESAME flag note — implementation note: never use --simplify-merges
- **NIT noted:** Duplicate parent dedup (FR13), cursor pagination (future work), frontmatter cache (test coverage)

### Artifacts updated
- SPEC.md: FR4 (rollback guards), FR13 (dedup + fallback), FR14-FR16 (new), implementation notes section, risks, future work, agent constraints (§16)

### Standalone checkpoints scoped in
- User questioned why checkpoints don't work in standalone mode
- Traced `saveVersion()`: steps 2+3 (shadow checkpoint + WIP reset) don't need a project repo — only step 1 (project commit) does
- Added FR17: standalone `saveVersion()` skips project commit, creates shadow-only checkpoint with `refs/checkpoints/<branch>/<shadow-sha>` naming
- D13 LOCKED
- Removed standalone limitation from risks; updated implementation notes
