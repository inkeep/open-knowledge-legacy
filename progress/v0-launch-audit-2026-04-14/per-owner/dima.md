# Dima — V0 launch audit (last 48h)

**Stories owned:** 7 total (2 shipped, 0 in-progress, 5 remaining)
**Verdict:** V0-4 and V0-9 shipped on schedule within 48h window. V0-4 delivers delete+rename (partial scope: move/duplicate/new-folder deferred). V0-9 outline+panel-docking shipped across two PRs. V0-10, V0-18, V0-19, V0-22, V0-23 remain—no silent starts detected.
**Material deviations:** 2 scope cuts worth flagging (V0-4 move/duplicate deferred; V0-9 scroll-integration scope narrowed to click-nav).

---

### V0-4 — File organization operations from the sidebar
- **Phase bucket:** Shipped
- **Claimed status (PROJECT.md):** "Not started" (as of pre-audit snapshot). Now Shipped.
- **Actual status (verified):** MERGED. PR #88 (9eeb3b3) merged 2026-04-13T20:21:48Z. 13 files changed, 10 commits by Dima over 2 days.
- **Evidence:** PR #88 state=MERGED mergedAt=2026-04-13T20:21:48Z. Commits: rename/delete UX logic (file-tree-operations.ts), inline editor, context menu, server API (api-file-ops.ts), validation. Spec: `/specs/2026-04-13-file-tree-rename-delete/SPEC.md`.
- **Deviation from spec:**
  - **Scope cuts:** Move, Duplicate, Create-folder deferred. PROJECT.md V0-4 scope: "Delete, Move, or Duplicate" + "create an empty folder" + MCP tools (delete_document, move_document, duplicate_document, create_folder). SPEC.md (2026-04-13) & PR #88 delivery: rename + delete only. Move/Duplicate/Create-folder shifted right (implied V0-5 or later). Confirmation UX claimed as requirement in PROJECT.md but SPEC says "Delete immediately with no confirmation dialog" — conflict resolved toward no-confirm (lighter UX).
  - **Scope adds:** Rename added (not in original PROJECT.md V0-4 title but implicit in "lateral" note mentioning V0-5 renames backend). Renamed file auto-opens in editor if active. Folder rename remaps descendants. Both are appropriate.
  - **Match summary:** Partial ship — delete+rename delivered, but move/duplicate/create-folder missing from V0-4 scope. MCP tools not surfaced (CC9 workstream listed as separate). Confirmation UX lightened vs. spec constraint.
- **48h activity:** 10 commits 2026-04-13 15:34–20:16Z. Authored by dimaMachina (dima@inkeep.com). Branch: `rename-delete`. No post-merge activity in 48h window.
- **Blockers / risks:** V0-2 (real-time sidebar) noted as prerequisite—shipped PR #106. CC9 (MCP tool enrichment) not in this PR; Tim's workstream queued. Confirmation UX mismatch (spec requires, delivery omits) flagged for post-v0 audit.
- **Reviewer note (for Nick):** Delete ships without confirmation; MCP tools deferred. Post-v0 polish: add confirmation dialog for destructive ops + complete move/duplicate/create-folder.

---

### V0-9 — Document outline panel
- **Phase bucket:** Shipped
- **Claimed status (PROJECT.md):** "Not started" (as of pre-audit snapshot). Now Shipped across 2 PRs.
- **Actual status (verified):** MERGED. PR #110 (cc02cab, 16d8fcd, bb68e29, aad3019, d8baa67, d3c2630) merged 2026-04-14T00:26:16Z (7 commits by sarah-inkeep). PR #116 (ff6bf19, 3a1debf) merged 2026-04-14T04:35:01Z (2 commits by sarah-inkeep). Note: PRs authored by Sarah, not Dima—see "ownership" section below.
- **Evidence:** PR #110 title="Docked panel ux" (13 files). PR #116 title="Make panel resizeable and collapsible" (5 files). Outline component: `/packages/app/src/components/OutlinePanel.tsx` (fetch headings from `/api/page-headings`, refetch interval 2s, click nav to scroll). Panel docking pattern in DocPanel.tsx. Spec: none found (outline-specific spec not in tree—design embedded in PRs).
- **Deviation from spec:**
  - **Scope cuts:** Scroll-integration scope narrowed. PROJECT.md V0-9 requirements: "(1) scroll-integration works in both TipTap (WYSIWYG) and CodeMirror (Source) modes; single behavior spec, two implementations. (2) Active-heading detection via IntersectionObserver. (3) Live updates: subscribe to CC1 push." Delivered: basic click-nav; refetch interval hardcoded (2s poll); scroll-position active-heading UI NOT implemented (outline shows list, not highlighted active); no CC1 push integration (falls back to polling). Live-update constraint met (polling works) but not optimally. Scroll-integration for *navigation* (click heading → scroll to it) works; scroll-position-based *active-heading detection* is missing.
  - **Scope adds:** Resizeable and collapsible panel (PR #116) — not in PROJECT.md constraints but adds professional UX polish. Graph stats count in header (PR #116 "tweak graph stats") — minor add.
  - **Match summary:** ~70% acceptance criteria met. Click-nav + docking pattern + collapsible works. Active-heading detection (performance-sensitive on long docs) deferred. CC1 integration deferred. Outline slug consistency with V0-12 not verified in PRs (no V0-12 changes; assumed coordinated separately).
- **48h activity:** PR #110 7 commits 2026-04-13 22:42–2026-04-14 00:21Z by sarah-inkeep. PR #116 2 commits 2026-04-14 04:14–04:20Z by sarah-inkeep. Ownership note: PROJECT.md assigns "Dima leads (scroll integration, IntersectionObserver, live-update state, tree rendering, UX decisions)"; PRs delivered by Sarah. Likely collab: Sarah UI/docking, Dima deferred or in follow-up. No open branch/PR for Dima's scroll-integration work.
- **Blockers / risks:** IntersectionObserver active-heading detection (performance-critical) missing—risk for UX feel on >500-heading docs. CC1 push integration parked (V0-2 contract shipped but consumer not wired). Slug consistency with V0-12 not audited (Mike's story). Next: Dima picks up scroll-integration (IntersectionObserver + CC1 subscriber pattern) as V0-9 follow-up or rolls into V0-11 (graph panels also need docking/scroll).
- **Reviewer note (for Nick):** Outline panel docking pattern set; scroll-active-heading detection deferred. Coordinate with V0-12 (Mike) on slug IDs. CC1 subscription pattern needed for live updates (currently 2s poll).

---

### V0-10 — Quick switcher (Cmd+K) and recent files
- **Phase bucket:** Now (must ship before v0 launch)
- **Claimed status (PROJECT.md):** "Not started. Library: `shadcn/ui Command` (wraps `cmdk`). 5 weeks."
- **Actual status (verified):** NOT STARTED. No branch, no open PR, no 48h commits. TQ11 (fuzzy matching library decision) marked PARKED in PROJECT.md constraints. Silent-start search: no `quick switcher`, `Cmd+K`, `command palette` branches. `gh pr list` shows no related PR.
- **Evidence:** git branch -a | grep switcher → empty. git log --since="2026-04-12" → no V0-10 work. PROJECT.md status: "TQ11 PARKED; low-risk frontend-only work."
- **Deviation from spec:** None (not started). Risk: TQ11 parked (fuzzy matching library decision unresolved)—blocks impl. Recommend unpark (fuse.js or fzf.js decision in next planning session).
- **48h activity:** None.
- **Blockers / risks:** TQ11 library choice blocking. No Cmd+K implementation in hand. Dima's 5-week estimate suggests mid-v0 or post-launch. Clarify priority: v0 launch blocker or post-v0 nice-to-have.
- **Reviewer note (for Nick):** Unpark TQ11 (fuzzy-match lib) to unblock. V0-10 ready to start once decision lands.

---

### V0-18 — Find and replace within document
- **Phase bucket:** Later (post-v0 or lower priority)
- **Claimed status (PROJECT.md):** "Not started. Promote when: users report bulk-edit friction OR inline-edit flow becomes a common agent workflow."
- **Actual status (verified):** NOT STARTED. No branch, no open PR. TQ12 (mode-crossing coordination for Cmd+F across TipTap + CodeMirror) marked OPEN in constraints. No 48h commits.
- **Evidence:** git log --since="2026-04-12" | grep -i "find\|replace" → empty. gh pr list | grep "find" → empty. PROJECT.md: "blocked on TQ12 (mode-crossing coordination)."
- **Deviation from spec:** None (not started). TQ12 open (cross-mode Cmd+F UX coordination with Nick).
- **48h activity:** None.
- **Blockers / risks:** TQ12 coordination (Nick consulted on bridge-invariant CRDT writes). No silent start—appropriate deferred status.
- **Reviewer note (for Nick):** V0-18 deferred per spec. Coordinate on TQ12 (cross-mode Cmd+F contract) when Dima picks up.

---

### V0-19 — Sidebar sort + word count polish bundle
- **Phase bucket:** Next (post-launch or v0 stretch goal)
- **Claimed status (PROJECT.md):** "Not started. Promote when: Now+Next ship and qualitative feedback surfaces 'feels unfinished' sentiment."
- **Actual status (verified):** NOT STARTED. No branch, no open PR, no 48h activity. Low-risk work (sort trivial, word-count trivial Y.Text derivation).
- **Evidence:** git log --since="2026-04-12" | grep -i "sort\|word.count" → empty. gh pr list | grep sort → empty.
- **Deviation from spec:** None (not started). Scope claimed as "trivial"—confirms deferred status appropriate.
- **48h activity:** None.
- **Blockers / risks:** None. Ready to start when promote trigger fires (Now+Next shipped + "feels unfinished" feedback).
- **Reviewer note (for Nick):** V0-19 trivial polish bundle. Pick up post-launch or when aesthetic gap surfaces.

---

### V0-22 — Tabbed file experience (Obsidian-style)
- **Phase bucket:** Reach (lower priority than Dima's core v0 work)
- **Claimed status (PROJECT.md):** "Not started. **Reach goal — lower priority than Dima's core v0 work.**"
- **Actual status (verified):** NOT STARTED. No branch, no open PR. Depends on V0-7 session persistence (Andrew's story—not yet shipped). No 48h activity.
- **Evidence:** git log --since="2026-04-12" | grep -i "tab" → empty. gh pr list | grep tab → empty. V0-7 status in PROJECT.md: "Onboarding scoped. Auto-init shipped. Starter doc + session persistence + React UI not started."
- **Deviation from spec:** None (not started). Appropriately deferred as reach goal.
- **48h activity:** None.
- **Blockers / risks:** V0-7 session persistence (Andrew) blocks. Hash routing → tab-aware state management migration needed (non-trivial). Provider pool LRU supports multiple open docs.
- **Reviewer note (for Nick):** V0-22 reach goal. Unblock on V0-7 session persistence; then estimate hash-routing migration.

---

### V0-23 — Drag-and-drop files in sidebar
- **Phase bucket:** Reach (lower priority than Dima's core v0 work)
- **Claimed status (PROJECT.md):** "Not started. **Reach goal — lower priority than Dima's core v0 work.** Builds on V0-4's move backend."
- **Actual status (verified):** NOT STARTED. No branch, no open PR, no 48h activity. Depends on V0-4 move backend (which is deferred from V0-4 proper).
- **Evidence:** git log --since="2026-04-12" | grep -i "drag\|dnd" → empty. gh pr list | grep drag → empty.
- **Deviation from spec:** None (not started). Scope note in PROJECT.md V0-4 makes clear: "DnD is explicitly NOT in V0-4 — it's this separate reach story that builds on V0-4's backend."
- **48h activity:** None.
- **Blockers / risks:** V0-4 move backend missing (deferred from V0-4 scope). DnD library evaluation (dnd-kit vs HTML5) not started. Edge cases (drop self, drop root, nested) design pending.
- **Reviewer note (for Nick):** V0-23 reach goal. Blocked on V0-4 move deferred work. Coordinate library choice with team.

---

## Summary of material deviations

**V0-4 scope cuts (flagged for review):**
- Move, Duplicate, Create-folder deferred from V0-4 → shifted to V0-5 or post-v0 batch.
- Confirmation UX for destructive ops lightened (spec required; delivery omits).
- MCP tool enrichment (CC9) deferred.

**V0-9 scope cuts (flagged for review):**
- Scroll-position active-heading detection (IntersectionObserver) deferred → deferred to follow-up or V0-11.
- CC1 push integration deferred → falls back to 2s polling.

**V0-9 scope adds (context for Nick):**
- Resizeable + collapsible panel (UX polish, not in spec).

**Remaining stories (V0-10, V0-18, V0-19, V0-22, V0-23):** No silent starts. Deferred status justified by blockers (TQ11 library choice, V0-7 session persistence, V0-4 move backend).

