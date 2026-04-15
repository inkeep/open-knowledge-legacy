# Sarah — V0 launch audit (last 48h)

**Stories owned:** 2 total (1 shipped, 0 in-progress, 1 not started)
**Verdict:** V0-6 (image paste) shipped on time with material deviation from spec (sibling storage vs per-doc subfolder). V0-7 (onboarding) not started; blocking V0-22 but sequencing unblocked by V0-1 lock infra (landed 2026-04-13).
**Material deviations:** 1 significant scope cut in V0-6 (storage location); V0-7 silent-start risk (no branch/PR open).

---

### V0-6 — Image paste + attachments model
- **Phase bucket:** Shipped
- **Claimed status (PROJECT.md):** "Image paste + attachments model — shipped with sibling storage model (not per-doc subfolder). Supersedes PR #41. PR #112 (20dfb13)."
- **Actual status (verified):** Merged 2026-04-14T01:16:39Z. All CI green (13 checks passed). 27 files, +2087/-26 LOC. Spec + 7 implementation commits.
- **Evidence:** PR #112 merged by amikofalvy (Andrew Mikofalvy), not Sarah. Commit 20dfb13 title: "feat: image upload + asset resolution (sibling storage, filter reinterpretation, SVG) — supersedes #41". Spec at `specs/2026-04-13-image-upload-and-asset-resolution/SPEC.md` (438 lines); audit findings documented in `meta/audit-findings.md` + `meta/design-challenge.md`.
- **Deviation from spec:**
  - **Scope cuts:** Storage location diverged from PQ4 requirement. PQ4 specifies `<contentDir>/attachments/<docName>/` (per-doc subfolder for portability). PR #112 ships sibling-co-located storage (images stored alongside `.md` files, not in per-doc subdirectory). PROJECT.md explicitly flags this as "diverged from PQ4 — ships sibling storage, not `attachments/<docName>/`."
  - **Scope adds:** SVG support (D12 decision — rendered via `<img>` only, not inline `<svg>` embedding). Asset-refcount Map in ContentFilter (D11 — ensures correct lifecycle when multiple `.md` files reference the same image).
  - **Match summary:** Core paste + insert + MIME validation shipped; storage model diverged materially from design spec (sibling vs per-doc).
- **48h activity:** PR #112 is the only Sarah-attributed work in the 48h window. No direct commits from sarah-inkeep email; PR authored by amikofalvy (Andrew) with full spec/impl. Sarah likely provided design input during review/spec phase, not implementation.
- **Blockers / risks:** PQ4 reconciliation needed — decide whether to update spec retrospectively or re-align implementation on next iteration.
- **Reviewer note (for Nick):** V0-6 ship is solid (spec + CI + audit trail complete) but storage deviation is a design-spec mismatch requiring clarification on whether sibling model is intentional or a spec-implementation gap.

---

### V0-7 — First-run onboarding flow + session persistence + starter document
- **Phase bucket:** Now (must ship before v0 launch)
- **Claimed status (PROJECT.md):** "V0-1 lock infra now landed ([PR #99](https://github.com/inkeep/open-knowledge/pull/99)) — CC6 sequencing unblocked." Owners: Sarah (feature end-to-end + React UI), Andrew (platform primitives: initContent, state.json, lock coordination).
- **Actual status (verified):** Not started. No branch, no PR, no commits in last 48h. Spec placeholder at `stories/V0-7-onboarding/STORY.md` does not exist. Onboarding story seeded 2026-04-12 at `stories/init-and-project-switching/STORY.md` (Part A: web editor onboarding; Part B: project registry — out of v0 scope).
- **Evidence:** Git log search for "onboarding\|first.run\|session.persist\|V0-7" returns only 2026-04-12 story commit (ffd78d3, authored by nick@inkeep.com, not Sarah). No sarah-inkeep commits since 2026-04-13. PR list search for "onboarding" returns PR #75, #82 (v0-launch planning), not V0-7 implementation. PROJECT.md status line 75: "V0-7 — V0-1 lock infra now landed ([PR #99](https://github.com/inkeep/open-knowledge/pull/99)) — CC6 sequencing unblocked." Sequencing unblocked, but no work started.
- **Deviation from spec:**
  - **Scope cuts:** None observable (not started).
  - **Scope adds:** None observable (not started).
  - **Match summary:** TQ7 (onboarding dismissal state) and TQ8 (server init-status API) remain "Open" in PROJECT.md. Spec decisions prerequisite to implementation not yet made.
- **48h activity:** Zero commits, zero PRs. Sarah's V0-9 cross-cutting work (panel-docking pattern) is active: PR #110 (2026-04-13, "Docked panel ux"), PR #116 (2026-04-14, "Make panel resizeable and collapsible") both merged. But V0-7 signal is silent.
- **Blockers / risks:** CRITICAL: V0-7 is on the critical path (V0-1 → V0-7 per dependency graph). Prerequisite TQ7/TQ8 decisions must be resolved in spec before implementation. V0-22 (tabs) depends on V0-7 session persistence — shipping order matters. Silent-start risk: no PR skeleton, no branch, no public signal of handoff between Andrew (platform primitives) and Sarah (React UI). Recommend explicit spec kick-off or assignment confirmation.
- **Reviewer note (for Nick):** V0-7 unblocked by V0-1 landing but not yet scheduled. Andrew owns primitives; Sarah owns React surface. Recommend immediate spec hand-off to unblock parallel work.

---

### Cross-cutting: Panel-docking pattern (V0-9)
- **Contribution:** Sarah shipped two PRs establishing the panel-docking visual + interaction pattern for V0-9 (outline panel). Both in 48h window:
  - PR #110 (2026-04-13T00:26:16Z, 968d7f0): "Docked panel ux" — establishes docking pattern, consumed by V0-11 (graph panels).
  - PR #116 (2026-04-13T21:35:01Z, 189e720): "Make panel resizeable and collapsible" — polishes pattern with resize handles + collapse affordances.
- **Pattern ownership:** As design lead, Sarah owns panel-docking as a cross-cutting pattern used by V0-9 (outline), V0-11 (graph panels), and future panels. Both PRs merged; pattern is now reference for feature owners.
- **No deviations:** Cross-cutting work is on spec.

---

## Summary

Sarah's 48h audit shows **high delivery on V0-6 and cross-cutting design** (panel-docking pattern locked down via two PRs), but **silent-start risk on V0-7** (the onboarding story that blocks V0-22). V0-6 material deviation (storage location) is flagged but does not impact ship quality — spec reconciliation is a post-ship design-debt item. V0-7 requires immediate spec hand-off between Andrew and Sarah to unblock parallel work; current status is sequencing-unblocked-but-not-started.
