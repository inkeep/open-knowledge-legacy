## Changelog

### 2026-04-13 — Initial seed
Created from audit run in-session on 2026-04-12 covering four collaboration/co-editing capabilities (Timeline & Rollback, Per-origin Undo, Live Presence, Suggestions). Grounded in user scenarios Nick surfaced during review of merged code + PR #39 + undo/presence specs. Prepared as a prioritization artifact for Miles — not a committed bet.

Audit inputs:
- PROJECT.md Items table (PQ1, PQ11, TQ1, TQ25, S5, S6, CC1, CC2)
- PR #39 (feat/timeline) + its spec + review threads
- specs/2026-04-10-undo-architecture/SPEC.md
- specs/2026-04-08-presence-awareness-ux/SPEC.md
- /reports/auto-persistence-version-history-patterns/
- Current merged code on main (HEAD = 39fcd87 at audit time)

### 2026-04-13 — PQ4 decided; branching UX + inline suggestions parked together
Nick's call: the "how does a human review and manage what the agent proposes" experience — covering both inline suggestions (Area D) and branching/draft-review UX (PROJECT.md PQ9, CC4) — is deferred to a dedicated holistic design pass. These are two implementations of one product question. Area D collapses from "decision required" to "parked"; section-level diff follow-up re-homed to that future design space. Audit scope narrows to Areas A (Timeline), B (Undo), C (Presence) — all independent of the deferred design space.

### 2026-04-13 — Sequencing locked; Area C reframed; diff view approach decided; library landscape added
Decisions locked:
- **D5 (sequencing):** Path A — ship PR #39 first, then Area B (undo).
- **D1 (timeline scope):** per-doc now; cross-doc folds into deferred branching/review bundle.
- **D2 (diff view):** Source-mode diff view (not a separate PreviewEditor). Line-level with intra-line highlighting. Rendered WYSIWYG diff is [NOT NOW]. PQ11 Claim B (section-level rationale) superseded; PQ11 Claim A (no inline suggest mode) stands. Candidate library: `@pierre/diffs`.
- **D7/Area B reframe:** Observer A character-level diff reclassified from "prerequisite for undo" to "correctness improvement for US-3e (same-line concurrent) edge case." Path to ship US-3a/b/c/d unblocked without the refactor.
- **D8/Area C reframe:** cursor rendering dropped (skeuomorphic for agents). US-5b removed and superseded by US-5f (agent pass summary per file, served via Area A's Source-mode diff view). Near-term Area C work = verify agent flash fires + reconcile Source/WYSIWYG behavior divergence.

Added:
- New user scenario US-5f (agent pass summary per file).
- Library landscape section §11 with pointers: `@pierre/diffs`, `react-diff-viewer-continued`, `jsdiff`, `diff2html`, `prosemirror-changeset`, `prosemirror-recreate-steps`, `Y.Snapshot`.
- Three open implementation mechanics (Q-trigger, Q-layout, Q-exit) for Source-mode diff view.

Items remaining open:
- D6 (rollback + undo origin interaction) — decide before undo work starts.
- D7 confirmation (accept US-3e known gap?).
- Q-trigger / Q-layout / Q-exit / Q-branch-switch — implementation-level, TBD.
- TQ2 (flash verification + reconciliation) — near-term Area C work.
- TQ3 (`@pierre/diffs` spike) — near-term PR #39 follow-up.

### 2026-04-13 — Deep research + codebase exploration folded in
5 parallel tracks completed:
1. Codebase ground truth (flash divergence verified; agent-write granularity analyzed; `undo_agent_edit`/`redo_agent_edit` MCP tools confirmed to exist; rollback mechanics documented; Observer A scope quantified; mode state verified)
2. Undo + time-machine conventions (8 products surveyed; Google Docs is the lone outlier putting restore on Cmd+Z stack)
3. Review-mode UX (zero human-collab tools auto-switch; Cursor auto-apply backlash documented; Tesler/NN/g principles)
4. Collaborator-edit visibility (zero products flash whole-doc; Linear retreated from high-frequency signaling; WCAG accessibility requirements)
5. Agent-pass + MCP time-machine (industry converges on "prompt = unit"; history is human territory in mainstream tools; Rewind-MCP + statecli are rare community precedent)

Synthesis stored as §12 in STORY.md with per-item briefs and full citations.

**Decisions updated with research grounding:**
- D6 (rollback + undo) — strongly backed by §12.1
- D7 (US-3e acceptance) — stakes lowered per §12.2 codebase findings
- Q-trigger / Q-exit — strongly backed by §12.3/12.4
- Flash reconciliation — strongly backed by §12.5
- D3 (MCP rollback) — stakes lowered; `undo_agent_edit`/`redo_agent_edit` already ship

**New items added:**
- D9 (agent-pass grouping definition) — three-tier framing
- D10 (pre-rollback safety checkpoint) — Figma two-checkpoints pattern
- D11 (rollback activity-map broadcast) — prior art convention
- TQ6 (US-3e frequency stress test)
- TQ7 (`prefers-reduced-motion` for flash)

Previously open: XQ1 marked **Completed** — PROJECT.md PQ1 + PQ11 Claim B both annotated 2026-04-13.

### 2026-04-13 — Greenfield directive applied; scope expanded; 2 decisions shifted
Nick directive: this is greenfield; no deferred tech debt; optimize for architecturally-best / most-correct per evidence + clean maintainable codebase + best product experience. Don't optimize for expediency or scope.

**Decisions shifted:**
- **D7 FLIPPED** — Observer A character-level refactor now prerequisite for shipping undo (was: accept US-3e gap + queue char-level). Shipping Cmd+Z with a known edge case in the product's core scenario is deferred tech debt in a foundational primitive. 60 LOC + strong test infra makes the refactor bounded. Do it right.
- **D9 SHIFTED** — session-id required parameter on MCP write tools (was: hybrid session-id optional + idle-gap fallback). We own the MCP contract; set the precedent. Soft contracts with fallback invite future inconsistency.
- **D6, D10, D11** refined with generic primitives and typed origins (not shifted in direction).

**Items reclassified from post-merge follow-up to pre-merge / prerequisite:**
- D3 MCP `rollback_to_version` tool (pre-merge in PR #39, TQ15)
- TQ4 PreviewEditor → SourceEditor fold (pre-merge, now TQ9)
- Q-layout both inline + side-by-side (not inline-first)
- TQ5 Observer A character-level (Area B prerequisite, not follow-up)
- Flash reconciliation via shared primitive extraction (TQ12)
- Broken agent-undo scaffold removal pre-PR-#39-merge (TQ13)
- Mode-state refactor to enum (TQ8)
- Activity-map schema refactor (TQ11)
- Origin constants unified to typed `LocalTransactionOrigin` (TQ10)
- `safetyCheckpoint` generic primitive (TQ14)
- Session-id required parameter (TQ16)

**New §13 section added** documenting the directive, the decision impact matrix, items-back-in-scope, and the architectural precedents this work sets (typed origins, generic primitives, structured event schemas, shared computation per-surface rendering, contract-first MCP, enum mode state, remove-don't-ship-broken).

**Net effect:** PR #39 scope expanded meaningfully. Area B scope includes char-level refactor as prerequisite. Both tracks can parallelize since they touch different files.

### 2026-04-13 — Identity/boundary untangled; D9 re-revised (3rd pivot); D12 added
MCP harness lifecycle research (§14) revealed: sessionId is NOT conversation-turn-scoped in any major harness (Claude Code = per CLI process, Claude Desktop = per app launch, Cursor = per project open). This invalidated the "session-id required" D9 recommendation.

Nick's insight: identity of the coding agent is a LONG-LIVED concern (and that's correct), distinct from pass-boundary grouping (SHORT-LIVED). The prior analysis conflated these.

**Untangled into two separate decisions:**
- **D9 (pass boundary):** RE-REVISED → (e) product-native user-action-bounded grouping as primary; optional `session_id?` enrichment for clients with turn semantics. 3rd pivot on this decision. Prior versions: (g) hybrid → (b) session-id required → (e) product-native. Each pivot was grounded in evidence that the prior was wrong.
- **D12 (agent identity, NEW):** build `AgentIdentity` from MCP connection primitives — connectionId (UUID for stdio, `extra.sessionId` for HTTP) + `clientInfo.name/version` + optional `agent_label`. Long-lived, stable across conversations within one process. Replaces hardcoded `DEFAULT_AGENT_ID`.

**Additions:**
- §14 "MCP session lifecycle research + identity/boundary untangling" — documents the research, the untangling rationale, AgentIdentity struct, pass-grouping pseudocode, per-agent UndoManager implications, timeline composition, and citations.
- D12 row in §5 decisions table
- PQ12 in Items table (agent identity mechanism)
- TQ17 (AgentIdentity composition)
- TQ18 (remove hardcoded DEFAULT_AGENT_ID)
- 8th architectural precedent in §13: "separate long-lived identity from short-lived session concerns"

**Updated:**
- D9 in §5 re-revised to (e) with full rationale chain
- PQ9 in Items table updated
- TQ16 revised — session_id params now OPTIONAL enrichment, not required
- Area B step 6 — per-agent UndoManagers scoped by connectionId
- §6 Area B sequencing — D12/TQ17/TQ18 added to scope
- §13 greenfield matrix D9 row updated + D12 row added
- §13 items-back-in-scope table — hardcoded DEFAULT_AGENT_ID entry added

### 2026-04-13 — R7 dropped; ownership documented; precedents promoted to AGENTS.md
**R7 (observer modal pause/resume) DROPPED.** Analysis showed pause/resume would introduce stale-baseline bugs: paused observers miss remote XmlFragment changes from other tabs or agents, causing `lastSyncedXmlMd` staleness → content destruction on resume. Current architecture (both observers run, origin guards handle everything, baselines refresh on every transaction) is already correct. Concrete problems R7 was meant to fix are actually R5/R6 (addressed by TQ5).

**Ownership split documented (§15):**
- Nick: TQ5 (Observer A char-level), TQ6 (stress test), bridge-matrix undo-invariant tests — starting now, zero-coordination
- Miles: everything else (PR #39 expanded scope + remaining Area B). Miles reads STORY.md directly for handoff.
- Two minimal coordination points (typed origin constants, per-agent origin guards)

**Architectural precedents promoted to AGENTS.md** (symlinked as CLAUDE.md). 8 precedents from §13 added under "Conventions → Architectural precedents" section. Now repo-wide governance, not just this audit.

### 2026-04-13 — Coherency audit: 11 stale references + 2 inconsistencies fixed
Systematic read of full STORY.md identified artifacts of iterative editing where earlier sections weren't updated when later rounds changed decisions:

1. §6 dependency graph: rewrote to show parallel Nick/Miles tracks + greenfield prerequisite model (was: pre-greenfield with R7 active + Observer A optional)
2. §6 alternatives: updated Path B rationale + noted parallel tracks is the chosen model
3. §3 Area B root-cause table: R7 row annotated as DROPPED
4. §4 D3: updated from "DEMOTED" to "BACK IN SCOPE" under greenfield
5. §4 D4 header: added "(= §5 D6)" cross-ref to resolve numbering collision
6. §5 D3 row: updated to match §4 + §13
7. §3 Area B scaffold removal: updated timing from "during undo rebuild" to "pre-PR-#39-merge" per TQ13/§13
8. Items table TQ4: marked superseded by TQ9
9. Items table TQ5: status changed from "Recommended" to "Decided"; notes updated to reflect prerequisite + Nick ownership
10. §9 Forward: removed stale cursor-rendering reference
11. §5 Q-layout: updated from "ship (a), follow-up (b)" to "ship both under greenfield"
12. §2 headline: updated US-5b to DROPPED
13. §3 L3: updated from "idle-gap heuristic" to "product-native user-action-bounded + D12 connectionId"

Also updated PQ3 in Items table from "Demoted" to "Back in scope." Architectural precedents already in AGENTS.md from prior update.

### 2026-04-13 — D7 re-revised (4th pivot): Miles's undo decoupled from Observer A
First-principles re-examination: which undo features actually depend on Observer A diff granularity?

**Finding: core undo (FR-1/FR-2/FR-3/FR-5/FR-6) does NOT depend on Observer A.**
- FR-1 (WYSIWYG Cmd+Z): Y.UndoManager on XmlFragment → Observer A propagates revert. Correct at any diff granularity.
- FR-2 (Source Cmd+Z): y-codemirror native UM. Observer A not in path.
- FR-3 (Agent undo): Server-side UM + syncTextToFragment. Observer A skips (origin guard).
- FR-5 (Reactive state): Unrelated.
- FR-6 (Cross-mode): UM coordination, not Observer A.
Only FR-4 (same-line interleaved / US-3e) depends on Observer A. And per prior research, char-level alone doesn't fix it — root cause is CRDT Item origin-laundering (delete+reinsert overwrites agent Items from 'agent-write' to 'sync-from-tree').

**D7 re-revised:** from "prerequisite" → "independent track, decoupled from Miles's undo."
**TQ5 scope expanded:** from "char-level diff (~60 LOC)" → "origin-aware diff (deeper fix per prior research)."
**Miles unblocked:** ships FR-1/FR-2/FR-3/FR-5/FR-6 with zero Observer A dependency.

Updated: §3 Area B (full rewrite), §5 D7, §6 dependency graph + sequencing, §7 non-goals, §8 Items (PQ7, TQ5), §9 Context forward, §13 greenfield D7 row + items-back-in-scope, §15 ownership split (full rewrite — zero coordination needed).

Prior D7 pivot history: (a) accept gap → (b) char-level prerequisite (greenfield) → (b) independent track (first-principles re-exam). Each pivot grounded in evidence that the prior was wrong.
