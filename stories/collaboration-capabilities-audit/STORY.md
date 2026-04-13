# Collaboration Capabilities Audit: Prioritization Brief

**Last verified:** 2026-04-13
**Prepared for:** Miles (decision-maker)
**Provenance:** In-session audit (2026-04-12) of merged code on `main` (HEAD = `39fcd87`), PR #39 (`feat/timeline`), and the related draft specs (`specs/2026-04-10-undo-architecture/`, `specs/2026-04-08-presence-awareness-ux/`). Cross-referenced against PROJECT.md Items table and S5/S6 story definitions.

---

## How to read this document

Four capability areas, all in the "real-time human+AI co-editing" theme that PROJECT.md treats as the core differentiator (S5, PQ1). Each is in a radically different lifecycle state — this is NOT a menu of four equal-weight stories to pick from. It's an inventory of what's already shipped, what's in flight, what's blocked, and what's never been planned, structured so you can decide where to invest next.

**Current state across the four areas:**

| Area | State | Primary artifact |
|---|---|---|
| A. Timeline & Rollback | In-flight PR, approved-with-suggestions, stale vs main | PR #39 (feat/timeline) |
| B. Per-origin Undo (Cmd+Z self / others) | Spike-quality scaffold shipped; spec'd as architecturally broken; implementation blocked | `specs/2026-04-10-undo-architecture/SPEC.md` |
| C. Live Collaboration Presence | Working baseline (avatars, agent flash, identity); cursor/typing indicators deferred | `specs/2026-04-08-presence-awareness-ux/SPEC.md` |
| D. Suggestions / Tracked Changes | **PARKED** — PQ11 holds for now; lives in a combined "agent-proposal review experience" design space with branching UX (draft-review, PQ9). Revisit together, not piecemeal. | PROJECT.md PQ11, PQ9 |

**Scoping decision (2026-04-13):** The "how does a human review and manage what the agent proposes" experience — covering both inline suggestions (Area D) and branching/draft UX (PROJECT.md PQ9, CC4) — is deferred to a dedicated design pass. These are two implementations of one product question and should be rationalized together. Everything else in this audit (Areas A, B, C) is scoped to single-branch co-editing and is independent of that future design work.

**Greenfield directive (2026-04-13, Nick):** This is a greenfield project. No deferred tech debt. Optimize for (1) architecturally-best / most-correct per evidence — what two staff engineers would argue for, (2) clean maintainable code that sets the right precedents, (3) best product experience without over-engineering. Don't optimize for expediency / scope. See §13 for the items-back-in-scope under this directive and the updated recommendations it produced.

**The question for you:** given the states above and the user scenarios in §1, which area earns the next investment, and in what order?

The brief builds bottom-up: user scenarios → current capability to serve them → per-area detail → cross-cutting decisions → recommended sequence. You can skim to §6 if you want the answer before the reasoning.

---

## 1. User scenarios driving this audit

Concrete user-observable behaviors. Every capability in §3 is evaluated against "does this enable user scenario US-N?"

### US-1: Timeline-based recovery
**"I accidentally ruined my document. I want to scroll back through history and restore an earlier version."**

- **1a (Recent rewind):** User pastes garbage, realizes 30 seconds later, opens timeline, picks the entry from before the paste, confirms restore.
- **1b (Checkpoint restore):** User edited freely for 30 minutes, decides "that whole session was wrong," opens timeline, restores the last named "Save Version."
- **1c (External overwrite recovery):** VS Code overwrote the file with stale content. Timeline shows "upstream — 2 min ago" at the top. User restores their last WIP entry before the overwrite.

### US-2: Async review after the agent ran
**"The agent worked while I was away. I want to see what it did and accept or push back on specific pieces."**

- **2a (Activity feed):** User opens editor in the morning, sees a list of files the agent touched overnight with timestamps and summaries.
- **2b (Per-file diff review):** User clicks one of the agent's overnight changes, sees a side-by-side or inline diff, scrolls through what changed.
- **2c (Selective revert):** User agrees with 3 of agent's 5 changes, reverts 2 of them without touching the others.

> This is the scenario PROJECT.md S5 centers on: *"you open the product after Claude ran overnight, see an activity feed of what changed with visual diffs."* None of the current code delivers it.

### US-3: Cmd+Z for my own edit
**"I typed a typo, I press Cmd+Z, my typo disappears — and the agent's edits are not affected."**

- **3a (WYSIWYG):** User presses Cmd+Z in TipTap, last character(s) they typed revert.
- **3b (Source mode):** User presses Cmd+Z in CodeMirror, last source edit reverts.
- **3c (Cross-mode):** User types in WYSIWYG, switches to Source, presses Cmd+Z — the WYSIWYG edit undoes, and the change is visible in Source.
- **3d (Interleaved with agent):** User types on line 5, agent writes on line 12. Cmd+Z only affects line 5.
- **3e (Same-line concurrent):** User types "Hello" on line 5, agent appends " World" on line 5. Cmd+Z undoes only the user's characters.

### US-4: Cmd+Z for the agent's edit
**"The agent just wrote something I don't want. I want to revert its last write while keeping what I've been typing."**

- **4a (From editor):** User clicks "Undo agent edit" button, agent's last transaction reverts, user's concurrent edits preserved.
- **4b (From MCP):** Agent calls `undo_agent_edit` tool to self-correct after realizing its write was wrong.
- **4c (Stack behavior):** Repeated agent undo walks back through the agent's sequence of writes, one at a time.

### US-5: See the agent working live
**"I can see the agent as a participant — what it's doing and what it just wrote."**

- **5a (Avatar bar):** User sees agent's avatar + name in a top-bar participant list.
- **~~5b (Cursor in editor)~~:** ~~Colored caret for agent.~~ **DROPPED 2026-04-13 (Nick):** Agents don't "focus" — they batch-write. A blinking fake cursor is a skeuomorphic UX. Superseded by US-5f.
- **5c (Typing indicator):** User sees a "Claude is typing…" signal before the agent's text appears.
- **5d (Activity flash):** Lines the agent just wrote briefly highlight so the user notices them.
- **5e (Which file):** User sees in the sidebar which file(s) the agent is currently working on.
- **5f (Agent pass summary per file, NEW 2026-04-13):** *"The agent just finished a pass on this file. Show me what changed — all of it, as a reviewable unit."* Served by clicking a timeline entry (or a post-write affordance) → editor flips to **Source mode with diff view**. Extends naturally to cross-file agent passes when the deferred branching/review bundle opens.

### US-6: Accept/reject agent suggestions inline
**"The agent proposes edits as reviewable suggestions (green/red inline) and I accept or reject each one."**

- Google-Docs-style suggestion mode. Every agent write is a proposal until the human accepts.

> **PARKED 2026-04-13 (Nick):** PQ11 holds. Lives in the combined "agent-proposal review experience" design space with branching/draft UX (PQ9, CC4). Revisit together in a dedicated design pass.

---

## 2. Which scenarios work today

Terse matrix. "Works" means a user can complete the scenario end-to-end with merged code on `main` as of 2026-04-13.

| Scenario | On `main` today | With PR #39 merged | With undo spec built |
|---|---|---|---|
| US-1a (Recent rewind) | ❌ no UI, no API | ✅ timeline panel + preview + restore | ✅ |
| US-1b (Checkpoint restore) | ❌ `saveVersion` exists but no UI | ✅ | ✅ |
| US-1c (External overwrite recovery) | ❌ `upstream` commits exist, no UI | ✅ entries show "upstream" author | ✅ |
| US-2a (Activity feed cross-doc) | ❌ | ❌ (PR #39 is per-document) | ❌ |
| US-2b (Per-file diff review) | ❌ | ✅ unified diff per file | ✅ |
| US-2c (Selective revert) | ❌ | ⚠️ only whole-version restore | ❌ (not addressed) |
| US-3a (Cmd+Z in WYSIWYG) | ❌ `StarterKit.undoRedo: false` | ❌ | ✅ FR-1 |
| US-3b (Cmd+Z in Source) | ❌ | ❌ | ✅ FR-2 |
| US-3c (Cross-mode Cmd+Z) | ❌ | ❌ | ✅ FR-6 |
| US-3d (Interleaved different lines) | ❌ | ❌ | ✅ FR-3 |
| US-3e (Same-line concurrent) | ❌ + leaks ~257 chars | ❌ | ✅ FR-4 (requires char-level Observer A) |
| US-4a (Undo agent edit from button) | ⚠️ works but leaks zombie content on same-line edits | ⚠️ unchanged | ✅ FR-3 (fixes leak) |
| US-4b (MCP `undo_agent_edit`) | ⚠️ endpoint exists; undo spec says scaffold should be removed | ⚠️ unchanged | ✅ FR-7 |
| US-4c (Stack of agent undos) | ⚠️ works but same leaks | ⚠️ unchanged | ✅ |
| US-5a (Avatar bar) | ✅ `PresenceBar.tsx` | ✅ | ✅ |
| ~~US-5b~~ (Cursor) | — | — | — (**DROPPED** — superseded by US-5f) |
| US-5c (Typing indicator) | ❌ | ❌ | ❌ (presence spec, deferred) |
| US-5d (Activity flash) | ⚠️ **implemented both surfaces, unverified, behavior divergent** (WYSIWYG: last/first 3 blocks; Source: all lines; zero tests) | ⚠️ unchanged | ⚠️ unchanged |
| US-5e (Agent's current file in sidebar) | ❌ | ❌ | ❌ (presence spec, deferred) |
| **US-5f (Agent pass summary per file)** | ❌ | ✅ (via timeline entry → Source-mode diff view) | ✅ |
| US-6 (Inline suggestions) | — | — | — (**PARKED** with branching/review bundle) |

**Headline reading:**
- Only **US-5a and US-5d** (avatar bar + agent flash) work on `main` today.
- **PR #39 unblocks 4 scenarios** (US-1a, 1b, 1c, 2b) and partially serves US-2c.
- **The undo spec unblocks 7 scenarios** (US-3a–e, US-4a fix, US-4c fix) but is blocked on an Observer A refactor.
- **US-2a (cross-doc activity feed)** — S5's headline scenario — is served by nothing currently planned.
- ~~US-5b~~ (cursor — **DROPPED**), US-5c (typing), US-5e (which-file) — parked; superseded by US-5f for agent case.
- **US-6** is closed by PQ11.

---

## 3. Per-capability detail

### Area A — Timeline & Rollback

**State:** In-flight PR #39 (`feat/timeline`), author Miles, +2,979 / -184 lines, 22 files, approved-with-suggestions. 17 pending inline recommendations (minor: `ok` field consistency, a11y, NaN handling). Branch diverged from `main` at `1dd65a0`; needs rebase across #61, #62, #65, #71.

**Scenarios served:** US-1a, 1b, 1c (fully), US-2b (fully), US-2c (partially — whole-version restore only), **US-5f (via Source-mode diff view — see "Diff view approach" below).**

**What it contains:**
- Server: `timeline-query.ts` (237 + 250 test), 4 HTTP endpoints (`/api/history`, `/api/history/:sha`, `/api/diff`, `/api/rollback`)
- Server: multi-parent checkpoint commits in `saveVersion()` (FR13), standalone-mode checkpoints (FR17)
- Client: `TimelinePanel.tsx` (394 lines, right-side Sheet, 10s polling), `PreviewEditor.tsx` (line-level unified diff in read-only CodeMirror), restore flow with inline confirmation

**Load-bearing items flagged for PR #39 scope** (see §4 for detail; all have §12 research backing):
- **L1 Diff view approach** — **DECIDED 2026-04-13 (Nick):** Source-mode diff view. Line-level with intra-line highlighting. Rendered WYSIWYG diff [NOT NOW]. Library candidate: `@pierre/diffs` (§11). PreviewEditor.tsx likely folds into SourceEditor.tsx.
- **L2 Rollback + undo origin interaction** — decision still needed (§5 D6). Research strongly backs "rollback NOT tracked by UndoManager" (§12).
- **L3 "Agent pass" access pattern (US-5f)** — product-native user-action-bounded grouping (contiguous agent-origin WIPs between user edits, grouped by AgentIdentity.connectionId per D12). Optional `session_id?` enrichment from clients that have turn semantics. See §5 D9 + §14.
- **L4 Pre-rollback safety checkpoint + rollback activity broadcast** (NEW 2026-04-13 from research) — emit WIP commit capturing pre-rollback state (Figma's two-checkpoints-around-restore pattern) and emit an activity-map entry with `'rollback'` origin so collaborators see the rollback as a discrete event. Addresses the "lost my last 5 minutes" failure mode documented across products. Small server-side additions; decision needed (§5 D10, D11).
- **Diff view three sub-mechanics** (Q-trigger / Q-layout / Q-exit — see §5) — strongly backed by research (§12): explicit entry + explicit exit + read-only during review.

**Demoted from deviation list (were flagged; now dismissed):**
- ~~MCP surface for timeline~~ — additive, add later.
- ~~Branch-switch refresh~~ — with branching UX parked, becomes hygiene only.
- ~~Polling vs reactive refresh~~ — acceptable tech debt; matches existing code pattern.
- ~~Git vocabulary / standalone ref naming~~ — polish.

**What's needed to ship (expanded under greenfield directive §13):**
- Rebase onto main (non-trivial: touches `api-extension.ts`, `shadow-repo.ts`, `standalone.ts` — all of which have changed in #62)
- Address the 17 pending review comments
- **Architectural precedent items (§13):** mode-state enum (TQ8); PreviewEditor fold (TQ9); typed origin constants (TQ10); activity-map schema refactor (TQ11); shared flash primitive (TQ12); broken undo scaffold removal (TQ13); `safetyCheckpoint` generic primitive (TQ14); `rollback_to_version` MCP tool (TQ15)
- **Decision implementation:** D6(b) rollback not tracked; D10(e-generic) safety checkpoint; D11(a-structured) broadcast; Q-trigger(b) / Q-exit(c) / Q-branch-switch(a); Q-layout — both inline + side-by-side via `@pierre/diffs` (TQ3 pre-merge)
- Flash reconciliation (TQ2) via shared primitive; `prefers-reduced-motion` (TQ7); Playwright E2E for flash

---

### Area B — Per-origin Undo (Cmd+Z self / others)

**State:** Spike-quality scaffold shipped in an earlier PR (#7). Spec (`specs/2026-04-10-undo-architecture/SPEC.md`, Draft, baseline `cee96da`) documents the scaffold as architecturally broken across 5 interlocking failure modes.

**Scenarios served today:** US-4a (with known content-leak bug), US-4b (same), US-4c (same). US-3a–e all ❌.

**What's broken** (per the spec §1):
1. **R4:** Users cannot undo their own edits — `StarterKit.configure({ undoRedo: false })` disables native ProseMirror undo, no Y.UndoManager replacement wired for the user side.
2. **R5:** Agent undo leaks ~257 chars of zombie content per cycle — Observer A's serialize→diff→apply cycle origin-launders agent CRDT Items from `'agent-write'` to `'sync-from-tree'`.
3. **R6:** Sub-line concurrent edits → silent data loss (same root cause as R5).
4. ~~**R7:** Both observers run unconditionally.~~ **DROPPED** — current origin-guard architecture is already correct. See §15 for rationale.
5. **R8:** Markdown round-trip normalization silently rewrites content on every agent write.

**DECOUPLED 2026-04-13: Miles's undo does NOT depend on Observer A diff granularity.**

First-principles re-examination of which undo features depend on Observer A:

| Undo feature | Depends on Observer A diff granularity? | Why |
|---|---|---|
| FR-1: User Cmd+Z in WYSIWYG | **No** | Y.UndoManager on XmlFragment reverts directly; Observer A propagates the revert to Y.Text — correct at any diff granularity |
| FR-2: User Cmd+Z in Source | **No** | y-codemirror's native UM on Y.Text; Observer A not in this path |
| FR-3: Agent undo | **No** | Server-side UM + syncTextToFragment; Observer A skips (origin guard on 'sync-from-text') |
| **FR-4: Same-line interleaved** | **Yes** | This is R5/R6. But per prior research, char-level diff alone doesn't fix it — root cause is origin-laundering (delete+reinsert overwrites agent Items with 'sync-from-tree' origin). Full fix needs origin-aware diff. |
| FR-5: Reactive undo state | **No** | Event-driven canUndo/canRedo |
| FR-6: Cross-mode undo | **No** | UM coordination, not Observer A |

**Miles ships FR-1/FR-2/FR-3/FR-5/FR-6 — the entire core undo architecture — with zero Observer A dependency.** FR-4 (US-3e, same-line interleaved) is the one feature that needs Observer A work, and it needs the deeper origin-aware fix, not just char-level diff.

**Path to ship Cmd+Z (Miles, no Observer A dependency):**
1. Wire WYSIWYG UndoManager on Y.XmlFragment → **US-3a, 3c, 3d unblocked**
2. Enable y-codemirror's native UM for Y.Text → **US-3b unblocked**
3. Server-side per-agent UndoManagers scoped by `AgentIdentity.connectionId` (D12/TQ18) → **US-4a/b/c clean, multi-agent-correct**
4. Optional `session_id?` + `parent_session_id?` + `agent_label?` on agent write MCP tools (D9/TQ16)
5. **FR-4 / US-3e (same-line interleaved):** Independent correctness track (Nick). Requires origin-aware diff, not just char-level. See §15 for the separate spec.

**Scaffold removal (TQ13, pre-PR-#39-merge per greenfield §13):** Existing `AgentUndoButton`, server undo endpoints, and MCP tools removed BEFORE PR #39 merges — better to ship no-undo than confidently-broken-undo (precedent #7). `AGENT_WRITE_ORIGIN` constant stays — load-bearing for observer origin guards.

**Why this still matters:** US-3 (Cmd+Z for self) is the most fundamental editor operation. Currently users cannot undo their own typos. The decoupling means Miles can ship Cmd+Z FASTER — no waiting on Observer A work.

---

### Area C — Live Collaboration Presence

**State:** Partial baseline on `main`. Avatar bar is verified-working; agent flash is implemented-but-unverified. Spec (`specs/2026-04-08-presence-awareness-ux/SPEC.md`, Draft) covers the missing detail features; reframed 2026-04-13.

**Scenarios served today:**
- ✅ US-5a (Avatar bar) — `packages/app/src/presence/PresenceBar.tsx` + `use-presence.ts` + `identity.ts`
- ⚠️ **US-5d (Activity flash) — unverified.** Implemented in both surfaces, behavior divergent, **zero test coverage.**
  - **WYSIWYG:** Inline `useEffect` in `TiptapEditor.tsx:154`. Targets last-3 blocks (append) or first-3 (prepend) via `data-agent-flash-state` + CSS `:nth-last-child(-n+3)`. Staggered 30ms per block, 2s animation. Explicit test hooks (`window.__agentFlashState`, `data-agent-flash-*` attributes, custom events) — **nothing consumes them.**
  - **Source (CodeMirror):** `packages/app/src/editor/plugins/agent-flash-source.ts` wired via `createAgentFlashSourceExtension`. **Flashes every line in the document** (`from: 0, to: docLength`) — not targeted. On a 500-line file this lights up the whole screen.
  - **Gap to address before claiming baseline sufficient:** (1) verify flash fires end-to-end in both modes (Playwright E2E or `agent-sim --rapid 5` dogfooding), (2) reconcile the Source "flash all" vs WYSIWYG "flash last 3" divergence.

**Scenarios NOT served:**
- ~~US-5b (Cursor rendering)~~ — **DROPPED.** Agents don't focus; skeuomorphic. Superseded by US-5f served via Area A (Source-mode diff view).
- ❌ US-5c (Typing indicator) — no keystroke-level activity tracking.
- ❌ US-5e (Agent's current file in sidebar) — no per-file presence in the file tree.
- ⚠️ **US-5f (Agent pass summary per file) — served by Area A's Source-mode diff view, not by Area C.** This is the reframe: the capability humans want ("see what the agent did") lives in the timeline/diff surface, not in presence-as-cursors.

**Reframed investment posture:**
- **Cursor rendering dropped.** Previously presented as highest-impact Area C investment; the agent case dissolves under US-5f's correct framing.
- **Activity flash verification + reconciliation** becomes the near-term Area C work. Research (§12) makes the direction definitive: **reconcile to WYSIWYG's targeted-blocks pattern in both surfaces.** Zero surveyed products flash the whole document on a collaborator edit; Source's "flash every line" is an outlier across the entire landscape studied. Plus add: `prefers-reduced-motion` handling (WCAG 2.3.3), Playwright E2E verification, doc-size fallback.
- **Typing indicator + file-level presence** stay parked. Low impact per effort relative to US-5f's Area-A-served scenario.

**Why this matters (reframed):** PQ1's original framing (*"AI cursor, sidebar presence, activity feed, origin shading, 'AI is typing' indicator"*) needs a minor update: "AI cursor" was a human-model artifact. The actual product value — *showing the user what the agent did* — is served by Area A's diff view (US-5f), not by presence cursors. PQ1 should note that the AI-cursor expectation is superseded.

**Risk profile:** Low. With cursor rendering dropped, Area C becomes a small verification task (flash works? flash behavior consistent?) rather than a build.

---

### Area D — Suggestions / Tracked Changes

**State:** Zero code. PQ11 (LOCKED) says "not needed." No branch, no spec, no story.

**Scenarios served:** US-6 explicitly closed.

**PQ11's reasoning** (verbatim from PROJECT.md):
> *"Agents don't make per-word/per-line suggestions — they rewrite sections or files in batches. Google Docs-style inline suggestions are a UX mismatch for agent output. Co-edit (live on main, batch undo via trackedOrigins) + draft review (section-level diffs, accept/reject per-article) covers the actual interaction pattern. No suggest mode needed. Review UX should show section-level diffs, not line-level — a fully rewritten section as line diff is just red/green noise."*

**Ecosystem context:** TipTap has a paid Pro "Tracked Changes" extension ($149–999/mo, marked unstable, not OSS). No credible open-source alternative for ProseMirror. Custom implementation is estimated at 2–4 engineer-months.

**Implied direction per PQ11:** The capability US-6 wants is *section-level draft review*, not inline suggestions. That capability is Area A's job (PR #39's diff/restore flow) extended to section granularity, not a separate suggestions feature. This is a plausible reading of PQ11 and, if correct, means Area D is subsumed by Area A's future work (NG8: "rich rendered diff preview," noted in PR #39's future-work list).

**Decision required:** Is PQ11 still the position? Either confirm (Area D stays dead and §5 drops US-6 from the radar) or reopen (Area D becomes a real story and US-6 has to be weighed). §5 decision D4.

---

## 4. PR #39 deviations from PROJECT.md vision

Below are the deviations surfaced during the audit, restated as decisions for Miles. Severity is "impact if shipped as-is." None are hard blockers — all are scope or policy calls.

### D1. Document-scoped vs. project-level timeline — MEDIUM
**Observation.** PR #39 scopes to single-document history; every endpoint requires `docName`. NG3 (cross-document) and NG7 ("what changed since I was last here") are explicitly deferred.

**Tension.** S5's headline scenario US-2a (*"open the product after Claude ran overnight, see an activity feed of what changed with visual diffs"*) is a cross-document view. PR #39 does not serve it, and does not plan toward it.

**Decision.** (a) Accept — ship per-doc, build cross-doc later as a separate surface. (b) Defer merge — expand PR #39's scope to include a cross-doc aggregation view. (c) Reframe — split into two surfaces (per-doc panel + cross-doc activity feed) with shared infrastructure.

**Recommendation.** (a) — ship per-doc. Cross-doc is a different UX affordance (inbox-like) and bundling delays both. But demand that the API design of `timeline-query.ts` leave room for a future `?docName=*` or equivalent, so we don't repaint the infrastructure later.

### D2. Diff view approach — DECIDED 2026-04-13
**Observation.** PR #39's `PreviewEditor.tsx` renders `createTwoFilesPatch` output (git-style unified diff, green/red line coloring) in a read-only CodeMirror. No intra-line highlighting, no side-by-side, no syntax coloring. PQ11 Claim B says diffs should be *"section-level, not line-level"* — citing "red/green noise on rewritten sections."

**Reframe (2026-04-13).** PQ11 bundles two claims. Claim A (no Google-Docs-style inline suggest mode — agents do batch rewrites) stays LOCKED. Claim B (rationale that therefore diffs should be "section-level") was not stress-tested against the GitHub-style enriched-line-level alternative. The "red/green noise" concern is addressed by intra-line word-level highlighting + syntax-colored source + optional side-by-side layout — not by abstracting above line granularity. **Claim B superseded.**

**Decided approach:** **Source-mode diff view.** Clicking a timeline entry (or a post-agent-write affordance) flips the editor to Source mode with diff rendering. Line-level base, intra-line highlighting as enrichment. Rendered WYSIWYG diff is [NOT NOW]. PreviewEditor.tsx likely folds into SourceEditor.tsx as a diff-mode capability (raise during PR #39 review). Library candidate: `@pierre/diffs` — spike to evaluate as a follow-up (see §6, §10). Three sub-mechanics (Q-trigger, Q-layout, Q-exit) are implementation-level, tracked in §5.

### D3. MCP surface for timeline — BACK IN SCOPE (greenfield §13)
**Originally demoted** to post-merge follow-up. **Pulled back into PR #39 scope** under greenfield directive (§13, TQ15): `rollback_to_version` MCP tool ships pre-merge. Symmetric with existing MCP-exposed history pattern (`undo_agent_edit` / `redo_agent_edit` already ship as MCP tools).

### D4. Rollback origin not reconciled with undo architecture — STILL OPEN (= §5 D6)
**Observation.** Rollback uses `origin: 'rollback-apply'` — a new origin not accounted for by the future undo architecture. Whether a rollback transaction should be undoable via Cmd+Z is unspecified.

**Tension.** When Area B's undo lands, a rollback transaction either enters the user's WYSIWYG UndoManager stack (Cmd+Z undoes the restore — surprising for a confirmation-gated action) or doesn't (Cmd+Z only undoes subsequent typed characters; to reverse a restore, user goes back through the timeline).

**Decision.** (a) Rollback tracked by user's UndoManager. (b) Rollback NOT tracked by any UndoManager. (c) Defer.

**Recommendation.** (b). Rollback is a deliberate confirmation-gated coarse action. Mixing with fine-grained undo is dissonant. Decide now so the undo implementation inherits the answer.

### D5–D8 — DEMOTED (not load-bearing)
- **D5 (polling vs reactive):** ship polling, consolidate later. Not a merge blocker.
- **D6 (branch-switch refresh):** with branching UX parked, hygiene-only. Cheap one-line fix if included; otherwise fine to defer.
- **D7 (git vocabulary):** polish pass.
- **D8 (standalone ref naming):** edge case, document as known gap.

---

## 5. Decisions required from Miles

The actionable list. Each decision blocks or shapes a chunk of work in §6.

| ID | Decision | Options | Status / Recommendation |
|---|---|---|---|
| **D1** | Timeline scope: per-doc vs cross-doc vs both | (a) per-doc now (b) expand PR #39 (c) split surfaces | **DECIDED 2026-04-13 (Nick):** (a) — ship per-doc. Cross-doc folds into deferred branching/review bundle. |
| **D2** | Diff view approach | (a) line-level unified (current) (b) Source-mode diff view with intra-line highlighting (c) rendered WYSIWYG diff | **DECIDED 2026-04-13 (Nick):** (b) — Source-mode diff. `@pierre/diffs` candidate library. Rendered WYSIWYG diff [NOT NOW]. See §11. |
| **D3** | MCP tools for timeline | (a) none (b) full (c) rollback-only | **BACK IN SCOPE under greenfield (§13):** `rollback_to_version` pre-merge in PR #39 (TQ15). Symmetric with existing `undo_agent_edit`/`redo_agent_edit` MCP tools. |
| **D4** | Is PQ11 ("no suggest mode") still correct? | (a) confirm (b) reopen | **DECIDED 2026-04-13 (Nick):** PQ11 holds. Area D + branching UX parked together. |
| **D5** | Sequencing path | (A) ship-close-first (B) fix-broken-first (hybrid/parallel) | **DECIDED 2026-04-13 (Nick):** Path A — PR #39 first, then Area B. |
| **D6** | Rollback + undo origin interaction | (a) rollbacks undoable (b) rollbacks NOT tracked by any UndoManager (c) defer | **Open. Research (§12) strongly backs (b):** 7 of 8 products surveyed (Figma, Notion, VS Code Timeline, Dropbox Paper, Coda, Word, Obsidian) treat restore as coarse action outside per-user Cmd+Z stack. Only Google Docs bridges them. Decide before undo work starts. |
| **D7** | Observer A diff + origin correctness | (a) prerequisite for undo impl (b) independent correctness track, decoupled from undo (c) not needed | **RE-REVISED 2026-04-13 after first-principles re-examination: (b) independent track.** Prior (a) "prerequisite" conflated "prerequisite to FR-4" with "prerequisite to undo." Core undo features (FR-1/FR-2/FR-3/FR-5/FR-6) do NOT depend on Observer A. Only FR-4 (same-line interleaved, US-3e) does — and per prior research, char-level alone doesn't fix it (root cause is origin-laundering). Nick works on the deeper origin-aware fix independently; Miles ships undo without waiting. |
| **D8** | Presence investment | (a) cursor + typing + file-level (b) cursor only (c) drop cursor; verify flash; park others | **Reframed 2026-04-13:** (c). Cursor dropped (US-5f supersedes). Near-term: **reconcile Source flash to WYSIWYG's targeted pattern (§12.5: zero products flash whole-doc), extract shared flash primitive (§13), add `prefers-reduced-motion` + E2E verification**. |
| **D9** | Pass boundary grouping (**UNTANGLED 2026-04-13 from identity**, see D12) | (a) idle-gap heuristic (b) session-id required (c) Yjs captureTimeout (d) user-action-bounded (e) hybrid: product-native default + optional client enrichment | **RE-REVISED 2026-04-13 after MCP harness lifecycle research: (e) hybrid.** Prior (b) "session-id required" was invalidated by research (§14): **MCP sessionId is NOT conversation-turn scoped in any major harness** (Claude Code = per CLI process; Claude Desktop = per app launch; Cursor = per project open). Requiring a session-id parameter asks clients to provide something they can't. **Primary grouping: product-native user-action-bounded** — contiguous `'agent-write'`-origin WIP commits between user edits, grouped by AgentIdentity.connectionId (D12). **Optional enrichment:** `session_id?` + `parent_session_id?` on write tools for clients that DO have turn semantics. Matches greenfield "set the right precedent": use MCP primitives for what they're good at (identity — long-lived, D12) and product-native for what the protocol can't provide (turn boundaries). |
| **D10** | Pre-rollback safety checkpoint | (a) emit before rollback (b) don't (c) conditional on destructiveness (e) always emit with distinct origin + label | **Recommendation: (e) refined under greenfield directive (§13) to a GENERIC `safetyCheckpoint({ action, context })` primitive, not rollback-specific.** Rollback is the first caller; future coarse actions (apply-draft, etc.) use the same primitive. Matches Figma's two-checkpoints-around-restore pattern (§12.1). Names for extensibility; "sets the right precedent." |
| **D11** | Rollback activity-map broadcast | (a) emit activity entry with distinct origin (b) silent rollback (current) | **Recommendation: (a) refined under greenfield directive (§13) — emit via STRUCTURED activity-map schema refactor.** Current shape `{ agentId, timestamp, type, description }` is under-structured. Refactor now (few consumers today) to `{ actor: AgentIdentity (D12), timestamp, action: {kind, metadata}, visibility: {flash, feed} }` so rollback / agent-write / future coarse actions dispatch cleanly. Use distinct visual treatment (cool-blue pulse vs warm-orange flash) to signal "revert" vs "new write." |
| **D12** | Agent identity mechanism (**NEW — untangled from D9, 2026-04-13**) | (a) hardcoded DEFAULT_AGENT_ID (current) (b) connection-level identity from MCP primitives (c) fully client-provided | **NEW decision, 2026-04-13. Recommendation: (b) — build `AgentIdentity` from MCP connection primitives.** Three layers: (1) **connectionId** — generated UUID per stdio connection at initialize, or `extra.sessionId` for HTTP/SSE. Long-lived (spans conversations); stable handle for grouping, coloring, undo scoping. (2) **`clientInfo.name + version`** — read from MCP initialize handshake. Human-readable harness name ("claude-code", "cursor-mcp"). (3) **Optional `agent_label`** — user-provided in `.mcp.json` config for explicit naming ("research-agent", "refactor-agent"). **Key insight: identity is long-lived and that's correct** — the same Claude Code process IS the same actor across all its conversations. Short-lived pass boundaries (D9) are a separate concern. See §14 for the untangling rationale. |
| **Q-trigger** | Source-mode diff view activator | (a) explicit timeline click (b) explicit + post-write affordance (c) auto-switch | **Open.** Recommendation: (b). |
| **Q-layout** | Source-mode diff layout | (a) inline unified (b) side-by-side (c) toggle | **Updated under greenfield (§13):** ship BOTH (a) and (b) from day one via `@pierre/diffs` (TQ3 pre-merge). Don't ship half. |
| **Q-exit** | Exit flow when user switches to WYSIWYG during diff view | (a) silent auto-exit (b) refuse + message (c) WYSIWYG button disabled in review; explicit "Exit preview" | **Open.** Recommendation: (c). |
| **Q-branch-switch** | Timeline panel on branch change | (a) re-fetch on branch-change event (b) defer | **Open.** Cheap hygiene; recommend (a). |

---

## 6. Dependency graph + recommended sequencing

### Dependency graph (updated 2026-04-13)

```
┌──────────────────────────────────────────────────────┐
│ INDEPENDENT TRACK: Nick (Observer A correctness)     │
│ Origin-aware diff for FR-4/US-3e (same-line          │
│ interleaved). Separate spec. Delivers FR-4 when      │
│ ready. Does NOT block Miles.                         │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ MILES TRACK 1: PR #39 (Area A — Timeline)            │
│ PR #39 rebase + expanded scope (§13):                │
│   TQ8 mode enum, TQ9 PreviewEditor fold,             │
│   TQ10 typed origins, TQ11 activity schema,          │
│   TQ12 flash primitive, TQ13 scaffold removal,       │
│   TQ14 safetyCheckpoint, TQ15 rollback MCP,          │
│   TQ3 @pierre/diffs, TQ2 flash reconciliation,       │
│   TQ7 prefers-reduced-motion, D6/D10/D11/D12,        │
│   Q-trigger/Q-exit/Q-layout/Q-branch-switch          │
│   → US-1a, 1b, 1c, 2b, 5f                           │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ MILES TRACK 2: Area B — Undo (NO Observer A dep)     │
│ 1. Wire WYSIWYG UndoManager on Y.XmlFragment         │
│ 2. y-codemirror native UM for Y.Text                 │
│ 3. Per-agent server-side UMs (D12/TQ17/TQ18)         │
│ 4. Cmd+Z keyboard wiring in both modes               │
│ 5. D9(e) pass boundary grouping in timeline queries  │
│   → US-3a/b/c/d, US-4a/b/c — all clean              │
│   → US-3e (same-line) ships when Nick's track lands  │
│   → R7 DROPPED (origin guards already correct)       │
└──────────────────────────────────────────────────────┘

Parked (deferred bundle): cross-doc timeline, cross-file
agent-pass view, inline suggestions (Area D), branching/
draft UX (PQ9, CC4), rendered WYSIWYG diff.
```

**Read:** Nick and Miles are fully decoupled. Miles ships undo (FR-1/FR-2/FR-3/FR-5/FR-6) without waiting on Observer A. Nick's origin-aware diff delivers FR-4/US-3e independently. The prior "prerequisite" framing conflated FR-4 with the entire undo architecture — re-examined 2026-04-13.

### Recommended sequence — Path A (DECIDED 2026-04-13)

**Weights three things:** (1) user-impact per unit work, (2) finishing what's in flight, (3) architecture alignment.

**1. Ship PR #39 (Area A) — expanded scope under greenfield directive.** Rebase + review-comment cleanup, PLUS the full set of no-deferred-tech-debt items:

**Architecture + product-experience (§13-aligned):**
- Mode state refactored to enum (`'wysiwyg' | 'source' | 'diff'`) — boolean is insufficient for the state machine
- PreviewEditor.tsx folded into SourceEditor.tsx as a diff-mode capability — no parallel editor components
- Origin constants unified: all origins as typed `LocalTransactionOrigin` objects (fix the `'rollback-apply'` raw-string smell)
- Activity-map entry schema refactored to structured form per D11 (before we have more consumers)
- Shared flash primitive extracted — both WYSIWYG and Source consume `computeFlashTargets(activityEntry) → LineRange[]`
- Broken agent-undo scaffold removed (AgentUndoButton, endpoints, `undo_agent_edit` / `redo_agent_edit` MCP tools) — better to have no undo than confidently-broken undo

**Decisions landing:**
- D6(b) — rollback not tracked by any UndoManager; `'rollback-apply'` becomes a typed origin
- D10(e-generic) — `safetyCheckpoint({ action, context })` primitive, rollback as first caller
- D11(a-structured) — activity-map broadcast via refactored schema, distinct visual (cool-blue pulse)
- D3 — `rollback_to_version` MCP tool landed alongside the other tools (ships in PR #39, not follow-up)
- Q-trigger(b), Q-exit(c), Q-branch-switch(a) wired per research recommendations
- Q-layout — **ship BOTH inline unified AND side-by-side** via `@pierre/diffs` (TQ3 pre-merge, not follow-up)
- Agent flash reconciliation (TQ2) — targeted pattern in both surfaces via shared primitive
- `prefers-reduced-motion` (TQ7) + Playwright E2E for flash

**2. Undo (Area B) — Miles, NO Observer A dependency.** Core undo ships independently:
- Wire WYSIWYG UndoManager on Y.XmlFragment → FR-1 (US-3a/3c/3d)
- Enable y-codemirror's native UM for Y.Text → FR-2 (US-3b)
- Per-agent server-side UMs (D12/TQ17/TQ18) → FR-3 (US-4a/b/c)
- Cmd+Z keyboard wiring in both modes
- ~~Modal observer architecture (R7)~~ **DROPPED**
- **FR-4 / US-3e (same-line interleaved): NOT in Miles's scope.** Ships when Nick's independent origin-aware diff track lands.
- Three-UndoManager wiring (WYSIWYG Y.XmlFragment + Source y-codemirror native + server agent)
- Cmd+Z keyboard wiring in both modes
- **D12 AgentIdentity** (TQ17/TQ18): build identity from MCP connection primitives; remove hardcoded `DEFAULT_AGENT_ID`; per-agent awareness in PresenceBar; per-agent UndoManager scoping
- **D9(e) pass boundary** via product-native user-action-bounded grouping (primary) + optional `session_id?` / `parent_session_id?` / `agent_label?` enrichment on write tools (TQ16)
- Lands US-3a/b/c/d/e AND US-4a/b/c clean — no known edge cases ship

**Parallelization opportunity:** Observer A character-level refactor is in a separate file (`observers.ts`) and can run in parallel with PR #39's rebase. If capacity permits, the two tracks run simultaneously — Area B doesn't wait on Area A's merge.

**Parked / deferred to agent-proposal-review-experience bundle:**
- Cross-doc timeline + cross-file agent-pass view (S5 async review)
- Inline suggestions (Area D, US-6)
- Branching/draft-review UX (PQ9, CC4)
- Rendered WYSIWYG diff

**Parked with lower priority:**
- Presence typing indicator (US-5c), file-level presence (US-5e). Revisit if flash verification surfaces clear gaps.

### Alternatives considered and NOT chosen

- **Path B (fix-broken-first, serialized):** Observer A → undo → PR #39. Rejected because PR #39 is further along and the parallel-tracks model (chosen) gets both done sooner than either serialized option.
- **Parallel tracks:** PR #39 rebase + Observer A refactor simultaneously. **This IS the chosen model** — Nick takes Observer A (TQ5/TQ6), Miles takes PR #39, both run concurrently. See §15 for ownership split.

---

## 7. Invariants and constraints (this audit, not the downstream work)

These are invariants of the *audit artifact*, not the capabilities themselves. Each per-area capability will produce its own invariants at spec time.

- **I1 (Audit fidelity):** Every "works today" / "broken today" claim in §2 is grounded in a file path or commit reference from the `main` branch at `39fcd87` or the referenced PR/spec. Observable: an engineer can open any cited file and verify the claim.
- **I2 (Scenario grounding):** Every decision in §5 traces to at least one user scenario in §1. Observable: no decision reads as "architectural cleanup for its own sake."
- **I3 (No scope creep):** This artifact prioritizes; it does not design. Section-level diff design, Observer A refactor design, cursor rendering design all belong to downstream specs. Observable: no API shapes, no data models, no architecture diagrams in this file.
- **I4 (Reversibility acknowledgment):** Sequencing recommendations are reversible. Miles may accept, override, or fragment them without invalidating the audit findings.

### Non-goals

- **[NEVER] This is not a bet commitment.** Creating this artifact does not commit the team to all four areas. It commits to making decisions about them.
- **[NOT NOW] Agent-proposal review experience** — the combined design space covering inline suggestions (Area D), draft-review (PQ9), branching UX (CC4), cross-doc timeline, and cross-file agent-pass view. Deferred 2026-04-13 (Nick). Revisit trigger: a dedicated design sprint scoped to rationalize the full "how humans review and manage agent proposals" experience end-to-end.
- **[NOT NOW] Multi-human presence.** PROJECT.md S-L1 parks multi-human for "after IC adoption validates the core loop." This audit scopes to human+AI co-editing only.
- **[NOT NOW] Rendered WYSIWYG diff view.** Source-mode diff view (D2) serves US-5f. Rendered-markdown-both-sides-with-changes-highlighted is a harder problem (ProseMirror tree-diffing or structural-diff-then-render) and belongs to the agent-proposal-review experience above when it kicks off.
- **[NOT NOW] Agent cursor rendering in editor.** Dropped 2026-04-13 (Nick) as skeuomorphic for agents. Superseded by US-5f served via Area A's Source-mode diff view.
- **[NOT NOW — for Miles's undo] Observer A origin-aware diff (FR-4/US-3e).** Re-examined 2026-04-13: core undo (FR-1/FR-2/FR-3/FR-5/FR-6) does NOT depend on Observer A. FR-4 (same-line interleaved) does, but requires origin-aware diff (not just char-level) per prior research on CRDT Item origin-laundering. Nick's independent track. Ships FR-4 when ready; does not block Miles.

---

## 8. Items

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| PQ1 | Timeline scope — per-doc vs cross-doc vs both | Product | P0 | **Decided** | §5 D1. 2026-04-13 (Nick): per-doc now; cross-doc folds into deferred bundle. |
| PQ2 | Diff view approach | Product | P0 | **Decided** | §5 D2. 2026-04-13 (Nick): Source-mode diff view; `@pierre/diffs` candidate library (§11); rendered WYSIWYG diff [NOT NOW]. |
| PQ3 | MCP surface for timeline | Product | P0 | **Back in scope** | §5 D3. Greenfield §13 pulls `rollback_to_version` back to pre-merge (TQ15). |
| PQ4 | Is PQ11 ("no suggest mode") still correct? | Product | P0 | **Decided** | §5 D4. 2026-04-13 (Nick): PQ11 holds. Area D + branching UX parked together. |
| PQ5 | Sequencing path | Product | P0 | **Decided** | §5 D5. 2026-04-13 (Nick): Path A — finish PR #39 in flight first, then Area B. |
| PQ6 | Rollback + undo origin interaction | Product/Tech | P0 | **Open** | §5 D6. Recommendation: (b) rollbacks NOT tracked by any UndoManager. Decide before undo work starts. |
| PQ7 | Observer A diff + origin correctness timing | Product/Tech | P0 | **Decided** | §5 D7. RE-REVISED 2026-04-13: (b) independent correctness track, decoupled from Miles's undo. Core undo (FR-1/FR-2/FR-3/FR-5/FR-6) ships without it. FR-4/US-3e needs origin-aware diff (deeper than char-level). Nick's independent spec. |
| PQ8 | Presence investment level | Product | P0 | **Decided** | §5 D8. 2026-04-13 (Nick): cursor dropped; verify + reconcile flash divergence; typing indicator + file-level parked. |
| Q-trigger | Diff view activator | Product/Tech | P1 | **Open** | Implementation detail for PR #39 or follow-up. Recommendation: (b) timeline click + post-write affordance. |
| Q-layout | Source-mode diff layout | Product/Tech | P1 | **Open** | Recommendation: ship (a) inline unified; add (b) side-by-side via `@pierre/diffs` follow-up. |
| Q-exit | Exit flow from diff view | Product/Tech | P1 | **Open** | Recommendation: (c) WYSIWYG button disabled in review mode; explicit "Exit preview." |
| PQ9 | Pass boundary grouping (UNTANGLED from identity) | Product/Tech | P0 | **Decided** | §5 D9. RE-REVISED 2026-04-13 after MCP harness lifecycle research (§14): (e) hybrid — product-native user-action-bounded grouping (contiguous agent-origin WIPs between user edits, grouped by D12 connectionId) as primary; optional `session_id?` + `parent_session_id?` on write tools as enrichment. Prior "session-id required" invalidated by research. |
| PQ12 | Agent identity mechanism (NEW) | Product/Tech | P0 | **Decided** | §5 D12. 2026-04-13. Build `AgentIdentity` from MCP connection primitives: connectionId (UUID per stdio, `extra.sessionId` for HTTP) + `clientInfo.name/version` + optional `agent_label`. Long-lived (correct). Replaces hardcoded `DEFAULT_AGENT_ID`. Carried on every WIP commit + activity-map entry + awareness state. |
| PQ10 | Pre-rollback safety checkpoint | Product | P0 | **Open** | §5 D10 (NEW). Emit WIP commit capturing pre-rollback state (Figma two-checkpoints pattern, §12.1/§12.8). Addresses "lost my last 5 minutes" failure. Small server-side add. Recommendation: yes. |
| PQ11 | Rollback activity-map broadcast | Product | P0 | **Open** | §5 D11 (NEW). Emit activity entry with `'rollback'` origin so collaborators see rollback as discrete event. Research §12.1: restore visibility is prior-art convention. Small server-side add. Recommendation: yes. |
| Q-branch-switch | Timeline panel on branch change | Tech | P2 | **Open** | Cheap hygiene. Recommendation: re-fetch on branch-change event. |
| TQ1 | PR #39 rebase cost | Tech | P1 | **Assumed** | Confidence: MEDIUM. Branch diverged at `1dd65a0`; `main` has since merged #61, #62, #65, #71, touching `api-extension.ts`, `shadow-repo.ts`, `standalone.ts`. Verify by: attempting the rebase. |
| TQ2 | Agent flash verification + Source/WYSIWYG reconciliation | Tech | P0 | **Open** | Baseline-sufficiency gate for Area C. Research §12.5: zero products flash whole-doc — reconcile Source to WYSIWYG targeted pattern. Add Playwright E2E verification + `prefers-reduced-motion` + doc-size fallback. Hours to 1 day. |
| TQ3 | `@pierre/diffs` spike for Source-mode diff rendering | Tech | P1 | **Open** | 1–2 day integration spike as follow-up to PR #39. Verifies 5 criteria in §11. |
| ~~TQ4~~ | ~~PreviewEditor.tsx → SourceEditor.tsx refactor~~ | — | — | **Superseded by TQ9** | TQ9 upgrades this from post-merge to pre-merge under greenfield §13. |
| TQ5 | Observer A origin-aware diff (FR-4/US-3e) | Tech | P0 | **Decided** | §5 D7 RE-REVISED: independent correctness track, NOT prerequisite for Miles's undo. Scope expanded from "char-level diff" to "origin-aware diff" per prior research (CRDT Item origin-laundering is root cause, not diff granularity). **Owner: Nick, separate spec.** Delivers FR-4/US-3e when ready. |
| TQ6 | US-3e frequency stress test | Tech | P0 | **Open** | Mitigation for accepting US-3e gap. Reuses `observers.stress.s4.test.ts` harness to simulate concurrent user+agent same-line writes under load. Turns "we assume rare" into evidence. ~1 day. Scheduled within Area B work. |
| TQ7 | `prefers-reduced-motion` for flash animations | Tech | P1 | **Open** | Accessibility per WCAG SC 2.3.3 (§12.5). CSS media query + JS fallback. Pairs with TQ2 flash reconciliation. Hours. |
| TQ8 | Mode-state refactor to enum | Tech | P0 | **Open** | Per §13. `isSourceMode: boolean` → `editorMode: 'wysiwyg' \| 'source' \| 'diff'`. Ships in PR #39. Enum is the correct data model for a 3-state machine. Not deferred debt. |
| TQ9 | PreviewEditor.tsx → SourceEditor.tsx fold (pre-merge) | Tech | P0 | **Open** | Per §13, upgrades TQ4 from post-merge follow-up to pre-merge. No parallel editor components for the same conceptual space. |
| TQ10 | Origin constants unified (typed `LocalTransactionOrigin`) | Tech | P0 | **Open** | Per §13. Currently mixed: `'rollback-apply'` is raw string, `AGENT_WRITE_ORIGIN` is typed. Unify under one convention. Fix the smell now. |
| TQ11 | Activity-map entry schema refactor | Tech | P0 | **Open** | Per §13 + §5 D11. `{ agentId, timestamp, type, description }` → `{ actor: {type, id, name}, timestamp, action: {kind, metadata}, visibility: {flash, feed} }`. Refactor while consumers are few. Generalizes to future coarse actions. |
| TQ12 | Shared flash-target primitive extracted | Tech | P0 | **Open** | Per §13 + §5 D8. Extract `computeFlashTargets(activityEntry) → LineRange[]` to a shared module. Both WYSIWYG and Source consume it. Eliminates divergence-by-copy-paste as a failure class. |
| TQ13 | Broken agent-undo scaffold removed (pre-PR-#39-merge) | Tech | P0 | **Open** | Per §13. Remove `AgentUndoButton`, `/api/agent-undo` + `/api/agent-redo` + `/api/agent-undo-status` endpoints, `undo_agent_edit` + `redo_agent_edit` MCP tools. Keep `AGENT_WRITE_ORIGIN` constant (load-bearing for observer origin guards). Better to ship no-undo than confidently-broken-undo. Proper three-UndoManager implementation ships in Area B. |
| TQ14 | `safetyCheckpoint({ action, context })` generic primitive | Tech | P0 | **Open** | Per §13 + §5 D10. Generic primitive, not rollback-specific. Rollback is first caller; future coarse actions (apply-draft, etc.) use the same primitive. Named for extensibility. |
| TQ15 | `rollback_to_version` MCP tool (pre-merge in PR #39) | Tech | P0 | **Open** | Per §13 + §5 D3. Upgrades D3 from post-merge follow-up to pre-merge. Symmetric with existing `undo_agent_edit` / `redo_agent_edit` MCP tools (even though those are being removed — the pattern of MCP-exposed history operations is the precedent we're keeping). |
| TQ16 | Optional session-id + parent-session-id + agent-label on agent write MCP tools | Tech | P1 | **Open** | §5 D9 RE-REVISED (§14). `session_id?`, `parent_session_id?`, `agent_label?` as OPTIONAL params (not required). Clients with turn semantics pass them; others rely on product-native user-action-bounded grouping. No 400 error for missing. Enrichment only. |
| TQ17 | AgentIdentity composition from MCP primitives | Tech | P0 | **Open** | §5 D12 (NEW). Implement `AgentIdentity { connectionId, clientInfo?: {name, version}, label?, displayName, colorSeed }`. Generated at MCP `initialize` time. For stdio: server generates UUID per connection. For HTTP/SSE: uses `extra.sessionId`. Read `clientInfo` from MCP handshake (openbolts skips this; we shouldn't). Colors: deterministic hash-to-color from connectionId. |
| TQ18 | Remove hardcoded `DEFAULT_AGENT_ID = 'claude'` | Tech | P0 | **Open** | §5 D12 (NEW). `agent-sessions.ts` currently hardcodes one agent identity. Replace with dynamic identity built from connection at session establishment time. Per-agent awareness state in PresenceBar (multi-agent support). Per-agent undo scoping in future UndoManagers. |
| XQ1 | Cursor rendering expectation in PQ1 needs update | Cross-cutting | P2 | **Completed 2026-04-13** | PROJECT.md PQ1 updated. PQ11 also annotated (Claim B superseded). |

---

## 9. Context

- **Traces to:** PROJECT.md §Stories — S5 (Human sees agent edits in real-time with presence), S6 (Edits auto-persist with version history timeline), PQ1 (Presence/awareness UX is P0), PQ11 (Suggest mode — not needed), TQ1 (Real-time sync: Yjs CRDT via Hocuspocus).
- **Lateral:**
  - `stories/wiki-links-next/STORY.md` — precedent format (multi-area prioritization brief; this artifact follows its structural pattern loosely)
  - `stories/init-and-project-switching/STORY.md` — sibling in-scope work competing for capacity
  - `projects/server-bridge-hardening/PROJECT.md` — Observer A refactor (TQ3 above) shares the bridge subsystem
- **Forward:**
  - If PR #39 ships → follow-up story for cross-doc activity feed (US-2a) in the deferred branching/review bundle
  - Area B undo implementation (Miles — UM wiring + scaffold removal, NO Observer A dependency)
  - Observer A origin-aware diff (Nick — delivers FR-4/US-3e independently)
  - ~~If Area C gets cursor rendering → follow-up for typing indicator + file-level presence~~ (cursor dropped; US-5f supersedes)
  - If deferred bundle reopens → agent-proposal review experience design sprint (inline suggestions, branching UX, cross-doc, rendered WYSIWYG diff)

---

## 10. Evidence & References

### Upstream Artifacts
- [`PROJECT.md`](../../PROJECT.md) — source of PQ1, PQ11, S5, S6, CC1, CC2 framing
- [`CLAUDE.md`](../../CLAUDE.md) — shadow repo + branch-switch protocol documentation

### Specs
- [`specs/2026-04-10-undo-architecture/SPEC.md`](../../specs/2026-04-10-undo-architecture/SPEC.md) — Draft, the authoritative catalog of Area B root causes (R3–R8) and the recommended three-UndoManager architecture
- [`specs/2026-04-08-presence-awareness-ux/SPEC.md`](../../specs/2026-04-08-presence-awareness-ux/SPEC.md) — Draft, covers the Area C detail features (cursor, typing indicator, file-level presence)

### PRs
- [inkeep/open-knowledge#39](https://github.com/inkeep/open-knowledge/pull/39) — "feat: Timeline with rollbacks," the entirety of Area A work in flight
- Merged on main touching the same surface: #61, #62, #65, #71 (all contribute to the PR #39 rebase cost)

### Code (on `main` at audit time, HEAD `39fcd87`)
- [`packages/server/src/shadow-repo.ts`](../../packages/server/src/shadow-repo.ts) — shadow repo substrate (checkpoint refs, WIP refs, saveVersion)
- [`packages/server/src/agent-sessions.ts`](../../packages/server/src/agent-sessions.ts) — Area B scaffold (server-side Y.UndoManager, AGENT_WRITE_ORIGIN)
- [`packages/server/src/api-extension.ts`](../../packages/server/src/api-extension.ts) — agent-undo endpoints (Area B scaffold surface) + home of Area A endpoints on PR #39
- [`packages/app/src/presence/PresenceBar.tsx`](../../packages/app/src/presence/PresenceBar.tsx) — Area C avatar bar (US-5a)
- [`packages/app/src/presence/use-presence.ts`](../../packages/app/src/presence/use-presence.ts) — awareness hook
- [`packages/app/src/presence/identity.ts`](../../packages/app/src/presence/identity.ts) — adjective-animal identity generation
- [`packages/app/src/presence/AgentUndoButton.tsx`](../../packages/app/src/presence/AgentUndoButton.tsx) — Area B scaffold UI surface
- [`packages/app/src/editor/extensions/agent-flash-source.ts`](../../packages/app/src/editor/extensions/agent-flash-source.ts) — Area C flash animation (US-5d)
- [`packages/core/src/types/awareness.ts`](../../packages/core/src/types/awareness.ts) — AwarenessState + AwarenessUser types

### Research Reports
- [`reports/auto-persistence-version-history-patterns/REPORT.md`](../../reports/auto-persistence-version-history-patterns/REPORT.md) — patterns from 8 products for timeline + checkpoint + restore UX
- [`reports/compiled-truth-timeline-content-conventions/REPORT.md`](../../reports/compiled-truth-timeline-content-conventions/REPORT.md) — append-only evidence pattern (relevant to US-2 async review)
- [`reports/crdt-branching-namespacing-prior-art/REPORT.md`](../../reports/crdt-branching-namespacing-prior-art/REPORT.md) — relevant to D6 (branch-switch + timeline interaction)
- [`reports/source-toggle-architecture/REPORT.md`](../../reports/source-toggle-architecture/REPORT.md) — awareness-based mode locking (relevant to Area C)

### External Sources
- [Yjs UndoManager docs](https://docs.yjs.dev/api/undo-manager) — primitive behind Area B's three-UndoManager architecture
- [TipTap Tracked Changes extension](https://tiptap.dev/docs/editor/extensions/functionality/tracked-changes) — paid (Pro+), unstable, referenced for Area D context
- ~~[TipTap Collaboration Cursor](https://tiptap.dev/docs/editor/extensions/functionality/collaboration-cursor)~~ — cursor plugin (previously flagged for US-5b; dropped 2026-04-13 per US-5b supersession)
- **Full research citations are embedded per-item in §12** (track 2 undo + time-machine conventions, track 3 review-mode UX, track 4 collaborator-edit visibility, track 5 agent-pass + MCP time-machine).

---

## 11. Markdown-diff library landscape (for Area A L1 / D2 / TQ3)

Candidates to evaluate for the Source-mode diff view (D2 decided approach). Spike scope: render a markdown diff with intra-line highlighting, support unified + side-by-side, work inside or alongside CodeMirror, handle frontmatter / code blocks / large rewrites / theme alignment.

### Primary candidate

- **`@pierre/diffs`** ([diffs.com](https://diffs.com/), [GitHub](https://github.com/pierrecomputer/pierre), v1.1.15, MIT)
  - React component library built on Shiki for syntax highlighting
  - Split (side-by-side) + unified layouts; user choice
  - **Intra-line word-level change highlighting** — the key missing thing in PR #39's current renderer
  - Configurable change indicators (bars / classic +/– / none)
  - Token hover + line selection callbacks (useful if we wire comments or agent-action affordances on specific changes later)
  - Merge conflict resolution UI + comments/annotations framework — **pre-investment for the deferred agent-proposal-review bundle**
  - Install: `bun i @pierre/diffs`
  - Caveat: code-focused (Shiki). Gives us "markdown source diff with syntax coloring of tokens"; does NOT give us "rendered markdown both sides with changes highlighted through the rendering" — that's the [NOT NOW] rendered-WYSIWYG-diff tier.

### Also evaluate

- **`react-diff-viewer-continued`** ([npm](https://www.npmjs.com/package/react-diff-viewer-continued))
  - Fork of original `react-diff-viewer` (which is unmaintained)
  - Split + unified layouts, word-level diff granularity, syntax-highlighted
  - Widely used, older codebase, less feature-rich than `@pierre/diffs`
  - Smaller surface, possibly easier to embed

- **`jsdiff`** (npm: `diff`) — already in PR #39's server deps
  - Low-level diff primitive; PR #39's server uses `createTwoFilesPatch`
  - You bring your own rendering layer
  - Useful if we want full control and `@pierre/diffs` / `react-diff-viewer` don't fit; higher effort

- **`diff2html`** ([diff2html.xyz](https://diff2html.xyz/))
  - HTML renderer for unified diff format
  - Side-by-side + line-by-line output; syntax-highlighted
  - Not React-native (produces HTML strings); awkward to embed in a React+CodeMirror surface
  - Mostly useful as a reference for output formatting, not as a direct dependency

### ProseMirror / Y.Doc-native (for the [NOT NOW] rendered WYSIWYG diff tier)

- **`prosemirror-changeset`** ([GitHub](https://github.com/ProseMirror/prosemirror-changeset)) — structural diff of ProseMirror documents, used for tracked-changes implementations
- **`prosemirror-recreate-steps`** — reconstructs step history from two document states
- **Y.Snapshot** ([Yjs snapshot API](https://docs.yjs.dev/api/snapshot)) — Yjs-native mechanism for diffing Y.Doc states. Could diff Y.Doc snapshots and render changes through y-prosemirror. Referenced in Hocuspocus community discussions for self-hosted version history.

These are relevant when we eventually do rendered-markdown-diff (both sides rendered through TipTap/ProseMirror with changes highlighted). Out of scope for near-term. Worth listing so the future spec knows where to start.

### Decision framework for TQ3 spike

Ship the spike narrow: **does `@pierre/diffs` replace PR #39's `PreviewEditor.tsx` line-diff rendering cleanly?** Criteria:
1. **Markdown legibility:** frontmatter, headings, lists, tables, code blocks render with usable syntax coloring
2. **Large-rewrite handling:** intra-line highlighting actually helps on "agent rewrote this paragraph" cases (this is the PQ11 Claim B concern — does the enriched line-level answer it?)
3. **Integration cost:** drop-in replacement or heavy rewiring? Bundle size impact?
4. **Theme alignment:** respects light/dark themes via `next-themes`
5. **A11y:** navigable by keyboard, screen-reader-friendly change markers

If (1)–(3) pass, adopt. If they fail, try `react-diff-viewer-continued`. If both fail, fall back to enriching PR #39's CodeMirror-based diff rendering with manual intra-line highlighting via `jsdiff`.

---

## 12. Research findings synthesis (2026-04-13)

Five parallel research + exploration tracks dispatched to build deep context for the 8 CPO/CTO-level decisions. Per-item briefs below grounded in the findings. Full source citations follow each brief.

### §12.1 — D6 Rollback + undo interaction (prior art)

**Key finding:** Of 8 products studied, **only Google Docs puts restore on the per-user Cmd+Z stack**. The other 7 (Figma, Notion, VS Code Timeline, Dropbox Paper, Coda, Microsoft Word, Obsidian) treat restore as a coarser action recovered through re-navigation of history. Figma shipped an explicit engineering mitigation: **two autosave checkpoints written around every restore**, addressing the "lost my last 5 minutes" failure mode directly. Dropbox Paper formalizes the reverse path with an in-history "Undo" link.

**UX literature consensus:** Tesler/Raskin "NO MODES" (ACM) + NN/g on confirmation-gated coarse actions + LogRocket's "reversible actions" framework all argue coarse actions should add friction rather than rely on Cmd+Z scope. Collaborative-undo literature (Isaac Hagoel's "You Don't Know Undo/Redo") recommends "the last user to directly modify data owns it" — restore is conceptually a multi-user state change, not a personal edit.

**Codebase reality:** Rollback uses raw string origin `'rollback-apply'`, doesn't emit activity-map entry, uses `updateYFragment` directly.

**Implication:** Recommendation (b) — rollback NOT tracked by any UndoManager — is strongly supported. Plus adopt Figma's pre-rollback-checkpoint pattern (D10) and emit collaborator-visible activity entry (D11).

**Citations:** [Google Docs Version History](https://support.google.com/docs/answer/190843) · [Figma "Restore" forum](https://forum.figma.com/ask-the-community-7/undo-restore-this-version-13226) · [Dropbox Paper restore doc](https://help.dropbox.com/delete-restore/track-restore-changes-comments) · [Notion page history](https://www.notion.com/help/duplicate-delete-and-restore-content) · [VS Code Timeline](https://bobbyhadz.com/blog/view-vscode-local-history) · [Tesler "NO MODES"](https://dl.acm.org/doi/pdf/10.1145/2212877.2212896) · [NN/g Modes](https://www.nngroup.com/articles/modes/) · [You Don't Know Undo/Redo](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol) · [Microsoft Q&A: undo restore](https://learn.microsoft.com/en-us/answers/questions/4307537/undo-restore-previous-version)

### §12.2 — D7 US-3e acceptance (codebase reality)

**Key finding:** All three agent-write endpoints (`agent-write`, `agent-write-md`, `agent-patch`) perform character-offset Y.Text mutations, not line-anchored. `agent-patch` uses `currentText.indexOf(find)` — position stale if user types mid-call. Yjs CRDT ordering handles the mutation deterministically (last-write-wins per origin); the zombie-residue issue is specific to Observer A's line-level diff intermediary, not a universal CRDT problem.

**Critical:** Observer A diff logic is **~60 lines of code** (`observers.ts:206–249`). Test infrastructure is comprehensive: S1-S9 stress suites (`observers.stress.s1-s8-s9.test.ts`, `s2`, `s4`, `s5-s6`), `observers.fuzz.test.ts` (property-based same-line scenarios), `bridge-matrix.test.ts` (12-path multi-client E2E matrix). `api-patch.test.ts:81-106` exercises concurrent-write survival.

**Implication:** Character-level refactor is cheaper than originally framed. **Stakes lowered** — queue as named 1–2 week correctness story, not vague "when needed." Add stress test that quantifies US-3e frequency under simulated concurrent workloads (reuses existing `observers.stress.s4.test.ts` harness) to replace "we assume it's rare" with evidence.

### §12.3 — Q-trigger Diff view activator (prior art)

**Key finding:** **Zero** human-collab tools surveyed auto-switch into review/history mode. Entry is universally explicit (GitHub, VS Code, Google Docs, Figma, Notion, Obsidian, TinyMCE, CKEditor). AI tools split into *stage-then-review* (Cursor Composer, Claude Code, Cline, Copilot Edits — nothing commits until accept) vs *apply-then-review* (Aider, Windsurf Cascade — disk is ground truth). Neither camp uses auto-switch-into-review-mode.

**Most-criticized AI pattern:** Cursor forum has active backlash threads documenting: (a) "Regression: AI edits applying automatically without Diff/Approval UI," (b) Plan mode silently flipping to Agent mode, (c) interrupting the agent reverting all in-progress work. Users explicitly frame loss of the staged-review gate as a regression.

**UX literature consensus:** Tesler/Raskin "NO MODES" + NN/g on modal interruption: user-invisible mode switches are a core usability failure. Mode errors occur when input is interpreted under a ruleset the user didn't expect to be active.

**Implication:** Recommendation (b) — explicit timeline click + subtle post-write affordance — is strongly supported. Auto-switch (c) would put us on the Cursor-backlash side of the industry pattern. Post-write affordance should be *subtle* (small link in header), not modal.

**Citations:** [Cursor auto-apply regression thread](https://forum.cursor.com/t/regression-ai-edits-applying-automatically-without-diff-approval-ui/154887) · [Cursor Plan→Agent auto-switch thread](https://forum.cursor.com/t/plan-mode-ui-button-auto-switches-to-agent-chaos-ensues/148247) · [NN/g Modes](https://www.nngroup.com/articles/modes/) · [NN/g Modal dialogs](https://www.nngroup.com/articles/modal-nonmodal-dialog/) · [Tesler (ACM)](https://dl.acm.org/doi/pdf/10.1145/2212877.2212896)

### §12.4 — Q-exit Review mode exit semantics (prior art)

**Key finding:** Read-only historical view is the dominant convention (Google Docs, Figma — hard-locks even copy-paste, Notion). Exit is explicit via dedicated affordance ("Done" button, "Restore" button, close modal). VS Code's diff editor is the notable exception (right pane editable) but treats diff as a tab → tab close is still explicit. Figma's "Done" button was criticized in community as too inconspicuous — worth a UX note that Exit Preview affordance should be prominent.

**Implication:** Recommendation (c) — WYSIWYG toggle disabled during review, explicit "Exit preview" — matches dominant human-collab convention. Add tooltip on disabled toggle explaining why.

**Citations:** [Figma "Can't edit restored version"](https://forum.figma.com/t/cant-edit-restored-version-from-history-view-only/4763) · [Google Docs Version History](https://support.google.com/docs/answer/190843) · [CKEditor source area](https://ckeditor.com/docs/ckeditor4/latest/features/sourcearea.html) · [VS Code Source Control](https://code.visualstudio.com/docs/sourcecontrol/overview)

### §12.5 — Flash reconciliation (prior art + accessibility)

**Key finding:** **Zero** surveyed products flash the whole document on a collaborator's edit. Dominant pattern is point-targeted: caret + name label + insertion appearing in collaborator's color. Figma explicitly relies on the change itself being visible via movement, not a separate animation. AI coding tools use *persistent diff hunks* (line-level green/red), not transient flashes. Cursor community is asking for *more* granularity (word-level intra-line after v2.0 regression), not less. **Linear actively retreated from high-frequency activity signaling** — April 2025 changelog explicitly collapses similar consecutive events.

**Accessibility:** WCAG SC 2.3.1 prohibits flashing >3×/second. SC 2.2.2 (Pause, Stop, Hide) requires control for non-essential motion >5 seconds. SC 2.3.3 (Animation from Interactions) calls for honoring `prefers-reduced-motion`. Current codebase has no `prefers-reduced-motion` handling.

**Codebase reality:** WYSIWYG flashes last-3 blocks (30ms stagger, 2s animation). Source flashes **every line in document** (`{ from: 0, to: docLength }`). No tests for either.

**Implication:** Reconcile Source to WYSIWYG's targeted-blocks pattern — strongest evidence of the eight calls. Plus add `prefers-reduced-motion`, Playwright verification, doc-size fallback. Current Source behavior is outlier across entire landscape.

**Citations:** [Figma Multiplayer Editing](https://www.figma.com/blog/multiplayer-editing-in-figma/) · [Linear Collapsed Issue History](https://linear.app/changelog/2025-04-03-collapsed-issue-history) · [NN/g Alert Fatigue](https://www.nngroup.com/videos/alert-fatigue-user-interfaces/) · [WCAG 2.3.3](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html) · [Cursor intra-line diff request](https://forum.cursor.com/t/agent-diff-review-show-character-level-word-level-changes-not-just-changed-lines/155776) · [Google Docs collaborator UX](https://javascript.plainenglish.io/how-google-docs-shows-other-peoples-cursor-in-real-time-fe0f83cfb4ca)

### §12.6 — D3 MCP rollback tool (prior art + codebase)

**Key finding 1 (codebase):** `undo_agent_edit` and `redo_agent_edit` **already exist** as MCP tools in `packages/cli/src/mcp/tools/`. The principle "agents call history operations via MCP" is already established in our codebase.

**Key finding 2 (industry):** Industry convention treats history as human territory. None of Cursor, Claude Code, Cline, Aider, Windsurf, Replit, or Copilot expose agent-callable rollback as a first-party pattern. Only two community MCP servers implement the pattern: **Rewind-MCP** (explicitly for Claude Code — `checkpoint`/`undo`/`list_undos`/`cleanup`/`status`) and **statecli/mcp-server** ("memory and undo for AI agents" — `statecli_replay`/`statecli_undo`/`statecli_checkpoint`/`statecli_log`). Reference MCP git server (`modelcontextprotocol/servers/src/git`) exposes git `reset`/`checkout` as lower-level primitives.

**Implication:** Adding `rollback_to_version` extends the existing `undo_agent_edit`/`redo_agent_edit` pattern — not a new precedent. **Stakes lower than I originally framed.** We're already outside the industry convention of "history = human territory" by one step; adding another tool is incremental. Flag: being outside industry convention means we'll learn independently what edge cases matter.

**Citations:** [Rewind-MCP](https://github.com/khalilbalaree/Rewind-MCP) · [statecli/mcp-server](https://github.com/statecli/mcp-server) · [MCP git server](https://github.com/modelcontextprotocol/servers/tree/main/src/git) · [cyanheads/git-mcp-server](https://github.com/cyanheads/git-mcp-server) · [VS Code Chat Checkpoints](https://visualstudiomagazine.com/articles/2025/08/07/vs-code-update-chat-checkpoints-and-improved-mcp-tooling.aspx)

### §12.7 — Agent-pass definition (prior art)

**Key finding:** **Strong convergence on "prompt = unit"** across every AI coding tool surveyed:
- **Cursor Composer:** checkpoint per prompt
- **Claude Code:** checkpoint per user prompt, `/rewind` by prompt
- **Cline:** checkpoint per user message + per-step snapshots; "infinite undo for development session"
- **Aider:** one git commit per prompt; `/undo-prompt` reverses all edits from last prompt
- **Windsurf Cascade:** revert-arrow-per-prompt
- **Replit Agent:** checkpoint per "key development milestone"

Human-collab tools use time-based grouping (Figma 30-min blocks, Notion 2-min idle gap). The AI-tool "prompt = unit" convergence is stronger and more specific.

**Yjs primitive:** `UndoManager` uses 500ms `captureTimeout` default for grouping; `stopCapturing()` forces boundary; `trackedOrigins` filters authors. Our server-side UM uses `captureTimeout: 0` (one transaction per undo entry).

**Codebase gap:** Our MCP tools don't carry a session/prompt-id. Server sees individual tool calls, not "this tool call is part of prompt X."

**Implication:** Three-tier framing for D9 —
- (a) MVP: idle-gap heuristic (5-min, Notion-pattern)
- (b) Evolution: `session_id` optional parameter on MCP write tools; clients pass a stable ID per conversation turn
- (c) Yjs-native: `captureTimeout` grouping (correct per Yjs but doesn't match user intuition — 500ms too short for "a pass")

Recommend (a) MVP, (b) as evolution when protocol complexity is worth the industry-alignment.

**Citations:** [Cursor Checkpoints](https://stevekinney.com/courses/ai-development/cursor-checkpoints) · [Claude Code Checkpointing](https://code.claude.com/docs/en/checkpointing) · [Cline 3.13 release](https://cline.bot/blog/cline-3-13-toggleable-clinerules-slash-commands-previous-message-editing) · [Aider git integration](https://aider.chat/docs/git.html) · [Windsurf Cascade docs](https://docs.windsurf.com/windsurf/cascade/cascade) · [Replit Checkpoints](https://docs.replit.com/replitai/checkpoints-and-rollbacks) · [Y.UndoManager](https://docs.yjs.dev/api/undo-manager) · [Notion page history](https://super.so/blog/how-to-check-notion-page-history-and-restore-versions)

### §12.8 — Reverse-rollback path (prior art)

**Key finding:** Canonical convention across 8 products is "re-navigate through history." Dropbox Paper formalizes with an in-history "Undo" affordance. Figma pre-creates two autosave checkpoints around a restore so the pre-restore state is always reachable. None of the surveyed products have a separate "undo restore" button distinct from re-navigating history.

**Implication:** No special "undo restore" affordance needed. Re-navigation is standard. **But adopt Figma's two-checkpoint pattern** — pre-rollback WIP commit emitted before rollback transaction, so the "your state immediately before rolling back" entry is explicit and discoverable in the timeline. Ties into D10 (pre-rollback safety checkpoint).

**Citations:** [Figma engineering response to lost-work scenarios](https://forum.figma.com/ask-the-community-7/if-you-roll-back-to-a-tagged-named-version-in-history-can-you-roll-forward-again-33211) · [Dropbox Paper in-history Undo](https://help.dropbox.com/delete-restore/track-restore-changes-comments) · [NN/g Dangerous UX](https://www.nngroup.com/articles/proximity-consequential-options/)

---

## 13. Greenfield directive — items back in scope (2026-04-13)

**Directive (Nick, 2026-04-13):** This is a greenfield project. No deferred tech debt. Don't optimize for expediency or "scope." Optimize for:
1. **Architecturally-best / most-correct** per evidence — what two staff engineers would argue for
2. **Clean maintainable codebase** that sets or fixes the right precedents for patterns to follow
3. **Best product experience** without over-engineering what users wouldn't expect

### Impact on the 5 CPO/CTO decisions

| Decision | Before greenfield lens | After greenfield lens |
|---|---|---|
| **D6** Rollback + Cmd+Z | (b) not tracked | (b) unchanged — already architecturally correct per Tesler/NO-MODES + 7/8 industry. Minor refinement: `'rollback-apply'` origin becomes typed `LocalTransactionOrigin` object, not raw string |
| **D7** Observer A + undo coupling | (a) prerequisite for undo (b) independent track | **(a) FLIPPED → (b) prerequisite** under greenfield, then **RE-REVISED → (b) independent track** after first-principles re-examination showed core undo (FR-1/FR-2/FR-3/FR-5/FR-6) does NOT depend on Observer A. FR-4/US-3e is the one feature that does — and it needs origin-aware diff (deeper than char-level per prior research). Nick's independent spec. |
| **D9** Pass boundary grouping | (g) hybrid session-id + idle-gap fallback | **(g) SHIFTED → (b) session-id required** under greenfield, then **RE-REVISED → (e) product-native default + optional enrichment** after MCP harness lifecycle research (§14) showed transport sessionId is NOT conversation-turn-scoped. Identity (D12) is the long-lived concern; pass boundary is the short-lived concern — untangled. |
| **D12** Agent identity (**NEW**) | N/A (hardcoded DEFAULT_AGENT_ID) | **Build `AgentIdentity` from MCP connection primitives.** connectionId (generated UUID for stdio, `extra.sessionId` for HTTP) + `clientInfo.name/version` + optional `agent_label`. Long-lived is CORRECT — same process = same actor = same identity across all conversations. |
| **D10** Pre-rollback checkpoint | (e) always emit, distinct origin | (e) refined — name the primitive GENERICALLY: `safetyCheckpoint({ action, context })`. Rollback is first caller; future coarse actions use same primitive. |
| **D11** Rollback broadcast | (a) distinct `'rollback'` origin + visual | (a) refined — **refactor activity-map schema** before more consumers land. `{ agentId, timestamp, type, description }` → `{ actor, timestamp, action: {kind, metadata}, visibility }`. |

### Items that were demoted / deferred that come back into scope

Under the directive, the following items reclassify from "follow-up" to "pre-merge" or "prerequisite":

| Item | Was | Now |
|---|---|---|
| D3 `rollback_to_version` MCP tool | Post-merge follow-up | **Pre-merge in PR #39** (TQ15). Symmetry with MCP-exposed history pattern. |
| TQ4 PreviewEditor → SourceEditor fold | Post-merge follow-up | **Pre-merge in PR #39** (TQ9). No parallel editor components. |
| Q-layout — side-by-side diff | "Follow-up after inline unified ships" | **Ship both from day one.** `@pierre/diffs` gives both for free; don't ship half. |
| TQ5 Observer A origin-aware diff | "Prerequisite to undo" (was D7 flip) | **Independent correctness track** (D7 re-revised). Core undo ships without it. FR-4/US-3e scope expanded from char-level to origin-aware per prior research. |
| Flash reconciliation (TQ2) | "Reconcile behaviors" | **Extract shared primitive** (TQ12) — both surfaces consume `computeFlashTargets` from one module; divergence-by-copy-paste becomes impossible |
| Broken agent-undo scaffold | "Remove when Area B lands" | **Remove pre-PR-#39-merge** (TQ13). Better to ship no-undo than confidently-broken-undo. |
| Mode state | "Current boolean is fine for now" | **Refactor to enum** (TQ8). Data model should match the state machine. |
| Activity-map schema | "Current shape is fine for now" | **Refactor now** (TQ11). Fewer consumers today means cheaper refactor. |
| Origin constants | "Mixed raw-string/typed is fine" | **Unify to typed `LocalTransactionOrigin` throughout** (TQ10). Fix the smell. |
| Hardcoded DEFAULT_AGENT_ID | "Fine for single-agent" | **Replace with dynamic `AgentIdentity`** (TQ17/TQ18 per D12). Build identity from MCP connection primitives; supports multi-agent from day one. Per-agent undo scoping, per-agent awareness/presence, per-agent activity-map attribution. |

### Architectural precedents set by these decisions

These are patterns that future work in the repo should follow:

1. **Typed transaction origins.** All Y.Doc transaction origins use `LocalTransactionOrigin` objects, never raw strings. One convention.
2. **Generic primitives over specific ones.** `safetyCheckpoint({ action, context })` not `emitPreRollbackSnapshot()`. Name for extensibility.
3. **Structured event schemas.** Activity-map entries carry `{ actor, timestamp, action, visibility }` — any coarse collaborative action fits the shape.
4. **Shared computation, per-surface rendering.** Flash-target computation lives in one module; WYSIWYG and Source decoration layers just apply the result. Prevents divergence.
5. **Contract-first MCP tools.** We define the MCP protocol; clients conform. Required parameters are required, not optional-with-fallback.
6. **Mode state as enums.** Editor state machines use enums, not boolean flags that implicitly encode state.
7. **Remove broken capabilities rather than shipping them.** A confidently-broken UI is worse than the absence of capability.
8. **Separate long-lived identity from short-lived session concerns.** Agent identity (who is this?) is long-lived — stable across conversations within one process, derived from MCP connection primitives. Pass boundaries (what did they do in this burst?) are short-lived — derived from the product's own edit-history model (user-action-bounded grouping). Don't conflate them. Use MCP primitives for what they're good at (identity); use product-native mechanisms for what the protocol can't provide (turn boundaries). See §14.

### Net implications for PR #39 scope

PR #39 expands meaningfully. The new must-haves before merge:
- All of the research-backed resolutions (D6, D10, D11, Q-trigger, Q-exit, Q-branch-switch)
- The architectural precedent items: TQ8 (mode enum), TQ9 (PreviewEditor fold), TQ10 (origin constants), TQ11 (activity schema), TQ12 (flash primitive), TQ13 (scaffold removal), TQ14 (safetyCheckpoint), TQ15 (rollback MCP tool)
- Both inline and side-by-side diff layouts via `@pierre/diffs` (TQ3 pre-merge, not follow-up)
- Flash reconciliation + `prefers-reduced-motion` (TQ2, TQ7)

**Rebase + 10+ scope items = substantial PR.** Consider splitting into a sequence of mergeable commits if it gets unwieldy, but no individual piece gets deferred post-merge. The net timeline is longer than a minimal PR #39 merge would be; the outcome is meaningfully cleaner architecture.

### Parallelization opportunity

Area B's Observer A character-level refactor lives in `packages/app/src/editor/observers.ts` and doesn't conflict with PR #39's touched files (`api-extension.ts`, `shadow-repo.ts`, `standalone.ts`, editor components). If capacity permits, both tracks run simultaneously:
- Track 1 (Miles): PR #39 expansion + merge
- Track 2 (parallel): Observer A char-level refactor + Area B undo scope

Area B doesn't need Area A merged to proceed. Timeline unblocks sooner.

---

## 14. MCP session lifecycle research + identity/boundary untangling (2026-04-13)

### MCP harness lifecycle research (invalidated "session-id required" D9)

**Research question:** When Claude Code, Claude Desktop, and Cursor connect to an MCP server, what lifecycle does the transport-level sessionId have? Is it per-conversation, per-turn, per-project, or per-process?

**Finding:** sessionId is NOT conversation-turn scoped in ANY major harness:

| Harness | MCP connection lifecycle | What one sessionId spans |
|---|---|---|
| **Claude Code CLI** | Per `claude` CLI process | Every conversation + every turn until process exits. `/clear` does NOT reset the MCP connection. |
| **Claude Desktop (macOS)** | Per app launch | Every chat the user ever opens until quit+relaunch. Config only re-read at boot. |
| **Cursor** | Per project open | Every Chat + Composer + Agent session across all windows sharing the config. Known bug: reuses stale sessionIds even after server restart. |

**For stdio transport: no sessionId at all.** The subprocess IS the session. MCP spec has no sessionId field for stdio.

**For HTTP/SSE: `Mcp-Session-Id` persists for the host's lifetime** — potentially thousands of turns.

### Why "session-id required" was wrong

Requiring `session_id` as a tool parameter asks clients to provide something most can't produce reliably. Claude Code, Claude Desktop, and Cursor have no "turn boundary" concept built into their MCP client implementations. They'd have to add code to generate per-turn IDs — and today they don't. A required parameter that clients can't meet = a contract that breaks on day one.

### The untangling: identity vs pass boundary

The analysis was churning because it conflated two orthogonal concerns:

**Agent Identity (long-lived — Concern A, D12):**
- WHO is making the call
- Lifecycle: stable across conversations within one MCP host process
- Mechanism: MCP connection primitives are IDEAL — `extra.sessionId` (HTTP/SSE) or server-generated connectionId (stdio) + `clientInfo.name/version` at initialize + optional `agent_label` from config
- The long-livedness of transport sessionId is a FEATURE for identity, not a bug
- Same Claude Code process = same actor across all conversations = correct

**Pass Boundary (short-lived — Concern B, D9):**
- WHEN a contiguous burst of agent activity starts/ends
- Lifecycle: bounded by user action or agent burst
- Mechanism: can't come from MCP transport (wrong granularity) — must be PRODUCT-NATIVE
- Primary: user-action-bounded grouping — contiguous `'agent-write'`-origin WIP commits between user edits, grouped by AgentIdentity.connectionId
- Enrichment: optional `session_id?` + `parent_session_id?` args from clients that DO have turn semantics

These compose cleanly: the timeline shows agent identity (colored avatar, name) on each pass; passes are bounded by user-edit boundaries; each pass is associated with one agent identity.

### Composed identity struct

```typescript
interface AgentIdentity {
  connectionId: string;      // extra.sessionId (HTTP/SSE) or UUID generated at initialize (stdio)
  clientInfo?: {             // from MCP initialize handshake
    name: string;            // e.g., "claude-code", "cursor-mcp"
    version: string;
  };
  label?: string;            // user-provided via .mcp.json config or connection args
  displayName: string;       // derived: label || clientInfo.name || "Agent"
  colorSeed: string;         // derived: hash(connectionId) → deterministic color from palette
}
```

Carried on every WIP commit, activity-map entry, awareness state. Replaces hardcoded `DEFAULT_AGENT_ID = 'claude'`.

### Pass boundary grouping pseudocode

```typescript
function groupAgentPasses(wipCommits: WipCommit[]): AgentPass[] {
  // 1. If commits carry explicit session_id, group by session_id
  // 2. Otherwise, group by: contiguous commits sharing the same
  //    AgentIdentity.connectionId, bounded by any commit from a
  //    different identity (user or another agent)
  // 3. parent_session_id chains produce nested pass display
}
```

### Per-agent UndoManager implication

Under multi-agent identity, the server-side Agent UndoManager becomes PER-AGENT:
- Current: one UndoManager tracking `AGENT_WRITE_ORIGIN` for all agents
- Target: per-agent UndoManager, one per `AgentIdentity.connectionId`, each with origin `{ agent: connectionId }` as a typed `LocalTransactionOrigin`
- "Undo Claude's edit" doesn't accidentally undo Cursor's edit
- Aligned with the three-UndoManager architecture (WYSIWYG user + Source user + N × Agent server-side)

### Timeline display composition

```
Timeline
──────────────
● Now
○ You typed — 2 min ago                             ← user identity (adjective-animal)
▼ Claude Code (research-agent) — 5 min ago           ← AgentIdentity.displayName + pass grouping
    ○ wrote intro.md
    ○ patched index.md
    ○ wrote setup.md
○ You typed — 15 min ago
▼ Cursor Composer — 18 min ago                       ← different AgentIdentity.connectionId
    ○ wrote auth-flow.md
    ○ wrote auth-flow.md (again)
◆ Save Version — 25 min ago
```

### Sources
- [MCP Spec — Transports (2025-03-26)](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — sessionId is transport-layer, not conversation-layer
- [Claude Code — Connect to tools via MCP](https://code.claude.com/docs/en/mcp) — MCP servers spawned once per CLI process
- [Claude Desktop — Getting started with MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) — subprocesses at app launch, shared across all chats
- [Cursor managed MCP server lifecycle — Cursor Forum](https://forum.cursor.com/t/cursor-managed-mcp-server-lifecycle/123733) — per project open
- [Cursor stale session ID — Cursor Forum](https://forum.cursor.com/t/cursor-fails-to-recover-from-stale-session-id-http-400-on-mcp-reconnect/138169) — reuses stale IDs
- OpenBolts codebase (`packages/mcp/src/server.ts`) — per-server-instance actorId pattern; `extra.sessionId` available but unused; `clientInfo` available but unused

---

*Changelog entry for this section is in `meta/_changelog.md`.*

---

## 15. Ownership split (2026-04-13)

### Nick (bridge / observer / CRDT-invariant layer) — independent track

**DECOUPLED from Miles 2026-04-13.** Nick's work delivers FR-4/US-3e (same-line interleaved undo). Does NOT block Miles's undo (FR-1/FR-2/FR-3/FR-5/FR-6).

| Item | Scope | Coordination with Miles |
|---|---|---|
| **TQ5** Observer A origin-aware diff (FR-4/US-3e) | Scope expanded from "char-level diff" to "origin-aware diff" per prior research (CRDT Item origin-laundering is root cause). Separate spec. | None — Nick's files only. Delivers FR-4 when ready. |
| **TQ6** US-3e stress test | Extend `observers.stress.s4.test.ts`. Proves the origin-laundering problem + validates the fix. | None |
| **Bridge-matrix undo-invariant tests** | Extend `bridge-matrix.test.ts` with undo propagation scenarios. TDD groundwork for both Nick's and Miles's work. | None — tests are additive |

### Miles (server + UI + MCP + identity + undo) — starts with PR #39

Everything in §6 Area A expanded scope + **full Area B undo (no Observer A dependency)**:

| Item | Scope |
|---|---|
| PR #39 rebase + review comments | Timeline panel, api-extension, shadow-repo |
| TQ8, TQ9, TQ10, TQ11 | Mode-state enum, PreviewEditor fold, typed origins, activity-map schema |
| TQ12, TQ13, TQ14, TQ15 | Flash shared primitive, scaffold removal, safetyCheckpoint, rollback MCP tool |
| TQ16, TQ17, TQ18 | Optional session-id params, AgentIdentity composition, DEFAULT_AGENT_ID removal |
| TQ3, TQ7 | @pierre/diffs spike, prefers-reduced-motion |
| D6, D10, D11, D12 implementation | Rollback behavior, safety checkpoint, broadcast, identity |
| Q-trigger, Q-exit, Q-layout, Q-branch-switch | Source-mode diff view mechanics |
| **Area B undo (NO Observer A dep)** | Wire WYSIWYG UM on Y.XmlFragment (FR-1), y-codemirror native UM (FR-2), per-agent server-side UMs (FR-3), Cmd+Z keyboard, scaffold removal. Ships US-3a/b/c/d + US-4a/b/c. |

### Coordination points

**Zero coordination needed.** Nick and Miles are fully decoupled:
- Miles ships undo (FR-1/FR-2/FR-3/FR-5/FR-6) without waiting on Nick.
- Nick ships FR-4/US-3e via origin-aware diff independently.
- When both land on main, the full undo story (FR-1 through FR-6) is complete.

### R7 — DROPPED

Observer modal pause/resume is NOT in either track. Current architecture is already correct.
