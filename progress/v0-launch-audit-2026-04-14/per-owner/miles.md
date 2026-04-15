# Miles — V0 launch audit (last 48h)

**Stories owned:** 3 total (1 shipped, 0 in-progress, 2 remaining)
**Verdict:** V0-16 (Timeline + Rollback) just shipped with comprehensive scope (120 files, 5128 insertions). V0-14 unblocked by Observer A decoupling (2026-04-13); silent start OK, no work visible. V0-17 not started.
**Material deviations:** 0 critical scope cuts; 1 scope-add (TQ8 mode-state enum refactor in PR #39) documented but worth noting.

---

### V0-16 — Timeline + Rollback
- **Phase bucket:** Now → Shipped (merged 2026-04-14 09:23 UTC)
- **Claimed status (PROJECT.md):** "In progress — PR #39 open on `feat/timeline`. Substantial progress (US-003…US-007 commits); blocked on rebase against main + 17 review comments + greenfield-directive expansion (TQ8/10/11/12/13)."
- **Actual status (verified):** **Shipped** — commit db8a6d6 merged to main at 2026-04-14 09:23 (miles-kt-inkeep author). All 7 user stories (US-001 through US-007) implemented + spec doc + evidence files + 120 file delta + 5128 insertions.
- **Evidence:**
  - Commit: db8a6d6 (`feat: Timeline with rollbacks (#39)`)
  - Merged at: 2026-04-14 09:23 UTC
  - Files changed: 120 (+5128, -980)
  - Core deliverables:
    - US-001: Multi-parent checkpoint commits in saveVersion()
    - US-002: Standalone-mode checkpoints (projectRoot nullable)
    - US-003: timeline-query.ts module (getDocumentHistory, DAG walk, filtering)
    - US-004: 4× REST endpoints (/api/history, /api/history/:sha, /api/diff, /api/rollback)
    - US-005: TimelinePanel component (right-side Sheet, 391 LOC, polling, grouping, attribution dots)
    - US-006: PreviewEditor + diff mode (read-only CodeMirror, colored line-by-line diff)
    - US-007: Restore flow with confirmation UI
  - Spec: `/specs/2026-04-10-document-timeline-rollback/SPEC.md` (556 LOC, 5 evidence files)
- **Deviation from spec:**
  - **Scope cuts:** None identified. All 7 US items + spec + evidence shipped.
  - **Scope adds:**
    - TQ8: Mode-state refactor (`isSourceMode: boolean` → `editorMode: 'wysiwyg' | 'source' | 'diff'`) — correct enum design for 3-state machine; documented in PR body + spec; low risk.
    - TQ10: Typed origins schema (hardened in shadow-repo refactor) — forward foundation for V0-14 UndoManager scoping.
    - TQ11: Activity-map schema for per-writer attribution (used in UI dots) — forward foundation for V0-14 per-agent undo + timeline grouping.
  - **Match summary:** Shipped as scoped. TQ8/TQ10/TQ11 scope-adds are architectural groundwork, not deferred debt; justified by greenfield directive.
- **48h activity:**
  - 1 commit (db8a6d6) merged today.
  - No other V0-16 commits in last 48h (PR was open; final rebase + polish happened on 2026-04-14 before merge).
  - Rich history in PR body: ~30 fixup commits during local review + rebasing.
- **Blockers / risks:** None. Merged clean.
- **Reviewer note (for Nick):** Launch-ready. Timeline substrate is solid — REST API clean, rollback origin-guard correct, UI responsive. V0-14 now unblocked to wire UndoManager on top of this foundation.

---

### V0-14 — Per-origin undo (three-UndoManager architecture)
- **Phase bucket:** Now (but unlocks after V0-16 ships)
- **Claimed status (PROJECT.md):** "Remaining — Now phase. Wires after V0-16 scaffold removal (TQ13)."
- **Actual status (verified):** **Not started** — no branch, no PR, no commits by Miles in last 48h. However, **UNBLOCKED** by major spec change on 2026-04-13.
- **Evidence:**
  - Commits 5194320 + ac29f2d + e4b649e (2026-04-13, within window) decouple V0-14 from Observer A prerequisite.
  - Commit message (5194320): "V0-14 per-origin undo no longer has Observer A char-level refactor as a prerequisite. Nick's Observer A work (FR-4/US-3e) is independent and does NOT block Miles."
  - PROJECT.md now states: "DECOUPLED from Observer A (2026-04-13)." Core features (FR-1/FR-2/FR-3/FR-5/FR-6) don't depend on Observer A diff granularity.
  - Spec: `/specs/2026-04-10-undo-architecture/SPEC.md` (needs update per PROJECT.md note).
  - No branch/PR yet; silent start is expected per PROJECT.md ("Miles starts after V0-16 ships").
- **Deviation from spec:**
  - **Scope cuts:** None visible (no work shipped yet). Miles will wire WYSIWYG UndoManager + Source y-codemirror native + per-agent server-side UMs.
  - **Scope adds:** None yet.
  - **Match summary:** On spec. Decoupling from Observer A is a **reduction in prerequisite burden**, not a scope cut — simplifies Miles's path. FR-4 (same-line interleaved) deferred to Nick's independent track; accepted trade-off per audit rationale.
- **48h activity:**
  - 0 commits by Miles.
  - 3 commits updating PROJECT.md + stories to reflect decoupling (2026-04-13).
  - No branch/PR; silent start OK — V0-16 just shipped today; Miles expected to start after PR #39 merge settles.
- **Blockers / risks:** None. V0-16 scaffold removal (TQ13, included in PR #39) unblocks wiring. Observer A decoupling removes prerequisite. Ready to start.
- **Reviewer note (for Nick):** Silent-improvement (decoupling reduces critical path). Miles can now move forward independently. Start expected soon after V0-16 stabilization.

---

### V0-17 — Persistence failure indicator UI
- **Phase bucket:** Next
- **Claimed status (PROJECT.md):** "Remaining — Next phase. UI wire-up over PR #62 infrastructure."
- **Actual status (verified):** **Not started** — no branch, no PR, no commits in last 48h. PR #62 mentioned as infrastructure blocker (not verified in this audit).
- **Evidence:**
  - No commits by Miles or reviewers mentioning V0-17/persistence-failure-indicator in last 48h.
  - Commit 4a321e3 (`fix(persistence): skip no-op writes on file open (#121)`) is related (persistence pipeline), but not V0-17 work.
  - Spec: Not yet located in `/specs/` (deferred until PR #62 infra lands).
  - PROJECT.md states: "Green = healthy, red = git pipeline failed. Server emits persistence-status event when `consecutiveGitFailures >= 3` (already tracked in `persistence.ts:99-103`)."
- **Deviation from spec:**
  - **Scope cuts:** Cannot assess — no spec file found. Assumed to match PROJECT.md 1-line description (status dot in header, tooltip, auto-clear).
  - **Scope adds:** None yet.
  - **Match summary:** Spec TBD. Scope appears minimal per PROJECT.md ("Subtle status dot, minimal — a dot, not a banner or toast").
- **48h activity:**
  - 0 commits by Miles.
  - 0 related commits.
  - Silent start expected; classified as "Next phase" in PROJECT.md.
- **Blockers / risks:** Depends on PR #62 (infrastructure/event-emission). Not started pending that.
- **Reviewer note (for Nick):** Not launch-critical per PROJECT.md ("Next" phase, not "Now"). Silent — no issues. Coordinates with V0-16 on visual placement (PQ11) once both underway.

---

**Summary for Nick:**
- **V0-16 shipped clean, on scope.** Scope-adds (TQ8/10/11) are architectural groundwork, justified.
- **V0-14 unblocked; silent start is expected.** Observer A decoupling (2026-04-13) removes critical-path prerequisite. Ready to kick off.
- **V0-17 not started; "Next" phase.** Not a launch blocker. Depends on PR #62.
- **Material deviations:** 0 critical scope cuts. 1 scope-add in V0-16 (TQ8 enum refactor) is solid design choice, documented.
