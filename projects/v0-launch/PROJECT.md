# Project: Open Knowledge v0 Launch

**Scope:** Unfinished work for v0 launch quality. Shipped foundations referenced as substrate, not enumerated.

## Overview

**Jump to person:** [Miles](#miles--collaboration--shadow-git--presence) · [Mike](#mike--knowledge-graph--content--search) · [Andrew](#andrew--platform--ops--system-level-infrastructure) · [Tim](#tim--agent-infrastructure--mcp--virtualization) · [Dima](#dima--sidebar--crud--docs-system-engineering) · [Sarah](#sarah--head-of-design--design-engineer) · [Nick](#nick--editor-internals--crdt--mdx-pipeline)

| Person | Now | Next | Later | Reach |
|--------|-----|------|-------|-------|
| **[Miles](#miles--collaboration--shadow-git--presence)** | V0-14 per-origin undo (NO Observer A dep), V0-16 Timeline | V0-17 persistence indicator | | |
| **[Mike](#mike--knowledge-graph--content--search)** | V0-8 graph view, V0-12 slug correctness | V0-5 rename+backlink, V0-11 graph panels, V0-3 backlinks push, V0-21 dead-links | V0-13 suggest_links | V0-25 SQLite schema |
| **[Andrew](#andrew--platform--ops--system-level-infrastructure)** | V0-1 process safety, V0-2 real-time sidebar | | V0-20 desktop build prep | |
| **[Tim](#tim--agent-infrastructure--mcp--virtualization)** | V0-26 MCP completeness + harness integration | | | V0-24 enriched bash |
| **[Dima](#dima--sidebar--crud--docs-system-engineering)** | V0-4 file ops | V0-9 outline, V0-10 Cmd+K | V0-18 find/replace, V0-19 sort+wc | V0-22 tabs, V0-23 DnD |
| **[Sarah](#sarah--head-of-design--design-engineer)** | V0-6 image paste, V0-7 onboarding | | | |
| **[Nick](#nick--editor-internals--crdt--mdx-pipeline)** | Observer A origin-aware diff (FR-4/US-3e, independent — does NOT block Miles) | | | |

**Operating model:** Feature owners are empowered to ship UX within their scope. Sarah focuses on cross-cutting design patterns (panel-docking, keyboard shortcuts, visual language), novel UX surfaces (onboarding), and design reviews across the product.

**Not in v0 scope:** Full-text search · Electron native distribution · Multi-project switching · Tracked changes / inline suggestions · Tags / custom CSS / keyboard customization · Multi-human concurrent editing · Cloud SaaS

---

## Strategic context

**Situation.** Open Knowledge's foundational stack is shipping fast — multi-file documents, provider pool, wiki-links + backlinks, file watcher with ContentFilter, shadow repo for attribution, bidirectional observer sync, dark mode, markdown source-text fidelity, graceful shutdown data-loss fix, symlink-safe sync, multi-editor MCP config, enriched read tools. Shipping velocity is high. The CRDT-collaborative MDX editor with agent co-creation via MCP is real and runnable today.

**Complication.** Despite shipping velocity, the product is not yet "v0 launchable" — it cannot be shown publicly without embarrassing day-0 gaps and silent data-integrity bugs. Three classes of unfinished work block public launch:
1. **Existence-stakes UX** — users cannot delete, rename, move, or duplicate files from the UI; cannot Cmd+Z their own typo (`StarterKit.undoRedo: false`); cannot find a doc by name in a 50+ doc KB; see "No files yet" with no affordance on first run.
2. **Silent data-integrity bugs** — two `open-knowledge start` invocations in the same directory create competing file watchers + git pipelines (lock file missing); renaming a file leaves `[[oldName]]` dangling in every other doc (managed-rename-with-link-rewrite missing); non-ASCII titles are destructively mangled (`[[café]]` → `caf` — slug bug, one-way door if delayed); agent activity flash divergent across WYSIWYG/Source modes with zero test coverage.
3. **Operational visibility gaps** — backend infrastructure for degraded-boot signals (PR #62), version history (shadow repo), and graph navigation (orphans/hubs/forward-links/outline APIs) all shipped without UI consumers. The work is half-done — server is ready, no surface is exposed to users.

The intersection: each of these classes alone is fixable; together they form a "credibility cliff" between shipping foundations and shipping product. Closing all three in one coordinated push gets the editor to a state where it can be demoed, distributed to design partners, and used as the basis for evaluation. Ship them piecemeal and the product remains "impressive demo, embarrassing daily use" indefinitely.

**Resolution.** Each story phases into Now (must-have for launch) / Next (should-have to feel complete) / Later (polish + gated) / Reach (if capacity). Each story carries ownership and current PR/spec status so the team can pick up work without re-discovery.

**Key pattern decisions.** The unfinished work establishes patterns the rest of the product inherits. Push-over-awareness (V0-2) is the reusable signaling pattern for every future derived-view UI. Dual UI + MCP surface for file ops (V0-4, V0-5) is the contract every future agent-callable capability adopts. Lock file (V0-1) extends to multi-window Electron without redesign.

**Bet-level non-goals.**
- **[NEVER in v0]** Multi-human concurrent editing across devices. Architecture supports it via Yjs awareness; product is solo + AI for v0. Promote when: cloud sync infrastructure exists.
- **[NEVER in v0]** Cloud SaaS / hosted backend. v0 is local-first. Promote: separate bet entirely.
- **[NEVER in v0]** Plugin/extension marketplace. Custom React components via mdx-components.tsx is the extension model; no separate plugin API. Promote: not foreseen.
- **[NOT NOW]** Full-text search system (Orama/FTS5/pgvector). Standalone bet — 8 research reports completed; separate project. Promote: when Now phase ships and search is the biggest remaining gap.
- **[NOT NOW]** Electron native distribution. Already spec'd separately (`specs/2026-04-11-electron-desktop-app/`). v0 ships in CLI + web form. Promote: when Electron implementation begins (V0-20 desktop build prep is the gating story).
- **[NOT NOW]** Multi-project switching (registry + `openknowledge list`/`open` + in-editor switcher). Cross-project navigation, separate bet. Lives as `stories/init-and-project-switching/` Part B. Promote: when v0 ships and users have multiple projects registered.
- **[NOT NOW]** Tracked changes / inline suggestion mode (Google Docs-style green/red proposals). PROJECT.md PQ11 explicitly parked. Lives in a combined "agent-proposal review experience" design space with branching/draft UX (PQ9). Promote: dedicated design pass for the bundle.
- **[NOT NOW]** Tags / tag browser, custom CSS, keyboard customization, font size adjustment. Parity-for-parity's-sake or low-leverage features.
- **[NOT NOW] "OK as a WYSIWYG editor for a Fumadocs project."** Future bet: a Fumadocs project (with fumadocs-ui components registered in `mdx-components.tsx`) can be opened by Open Knowledge as the editor. The editor recognizes fumadocs components, renders them with prop panels, persists changes back to the `.mdx` files. Positions OK as a Mintlify-class editor for the Fumadocs ecosystem. Owner: Dima long-term; Nick consults on generalizable MDX editing + built-in/custom component rendering. Promote when: v0 ships AND MDX pipeline (Nick's territory) stabilizes enough that the generalization surface is clean.

## Team burndowns

Each section below contains one team member's ownership summary, their stories in priority order (Now → Next → Later → Reach), and cross-references to shared stories owned by others. See [Overview](#overview) for the summary table.

---

### Miles — Collaboration / Shadow Git / Presence

**Territory:** Shadow git repo (infrastructure + lifecycle). Merge conflicts and project-sidecar lifecycle. Timeline + rollback. Change attribution (writer identity, shadow refs). Showing diffs made by agents. "Presence" UX for agents (activity flash, agent indicators). Unique identification of agents (via MCP connection). Cmd+Z for self; Cmd+Z or revert for changes made by others. Branching / merge conflicts (future). Persistence failure indicator UI. Permissions model (if needed, future).

**Now**

#### V0-14: Per-origin undo — three-UndoManager architecture (NO Observer A dependency)

**What to build.** Full per-origin undo: three UndoManagers (WYSIWYG Y.XmlFragment + Source y-codemirror native + N× per-agent server-side scoped by `AgentIdentity.connectionId`). AgentIdentity from MCP connection primitives replaces hardcoded `DEFAULT_AGENT_ID`. Broken undo scaffold (AgentUndoButton, undo endpoints, undo MCP tools) removed pre-PR-#39-merge as part of V0-16.

**DECOUPLED from Observer A (2026-04-13).** First-principles re-examination showed core undo features (FR-1/FR-2/FR-3/FR-5/FR-6) do NOT depend on Observer A diff granularity:
- FR-1 (WYSIWYG Cmd+Z): Y.UndoManager on XmlFragment reverts directly; Observer A propagates the revert — correct at any diff granularity.
- FR-2 (Source Cmd+Z): y-codemirror native UM on Y.Text; Observer A not in path.
- FR-3 (Agent undo): Server-side UM + syncTextToFragment; Observer A skips (origin guard on 'sync-from-text').
- FR-4 (Same-line interleaved / US-3e): This IS the one that depends on Observer A — but per prior research, it needs origin-aware diff (not just char-level). Root cause is CRDT Item origin-laundering. **Nick's independent track, separate spec.** Does NOT block Miles.

**Miles ships (owner: Miles, after V0-16):**

| Item | What | Unlocks |
|------|------|---------|
| Wire WYSIWYG UM on Y.XmlFragment | Cmd+Z reverts user's XmlFragment edits | FR-1 → US-3a, 3c, 3d |
| Enable y-codemirror native UM on Y.Text | Cmd+Z reverts user's Source edits | FR-2 → US-3b |
| Per-agent server-side UMs (D12/TQ17/TQ18) | Each connected agent gets own UM keyed by `AgentIdentity.connectionId` | FR-3 → US-4a/b/c (multi-agent correct) |
| Cmd+Z keyboard wiring in both modes | Keyboard shortcuts for undo/redo | FR-1 + FR-2 |
| D9(e) pass-boundary grouping | Product-native user-action-bounded grouping in timeline queries | Timeline UX for agent passes |

**What this unlocks:**
- US-3a/b/c/d Cmd+Z for self (WYSIWYG, Source, cross-mode, interleaved on different lines) ✅
- US-4a/b/c Agent undo (from button, from MCP, stack behavior) ✅ — with per-agent scoping
- US-3e (same-line concurrent) — ships when Nick's independent origin-aware diff track lands. NOT a v0 blocker.

**R7 (observer modal pause/resume) — DROPPED.** Would cause stale-baseline bugs in multi-tab/agent scenarios. Current origin-guard architecture is already correct.

**Value.** Customer: most fundamental editor operation. Currently a user literally cannot undo their own typo (`StarterKit.configure({ undoRedo: false })`). Platform: AgentIdentity (D12) replaces hardcoded `DEFAULT_AGENT_ID = 'claude'` with connection-level identity from MCP primitives — enables per-agent presence, per-agent undo scoping, multi-agent support.

**Constraints.**
- Scaffold removed in V0-16 (TQ13) — proper implementation ships here
- Rollback NOT tracked by any UndoManager (D6(b) — decided in V0-16; coarse action, not fine-grained undo)
- `AgentIdentity { connectionId, clientInfo, label, displayName, colorSeed }` — generated at MCP `initialize` time; per-agent server-side UndoManager keyed by connectionId
- **NO dependency on Nick's Observer A work** — Miles ships independently

**Lateral.** V0-16 removes the broken scaffold and establishes typed origins (TQ10) + activity-map schema (TQ11) that V0-14 builds on.

**Forward.** Per-agent identity enables future multi-agent UX. Nick's origin-aware diff (FR-4/US-3e) completes the undo story when it lands.

**Detail.** `stories/collaboration-capabilities-audit/STORY.md` §3 Area B. Spec: `specs/2026-04-10-undo-architecture/SPEC.md` (needs update to reflect decoupled decisions).

**Status.** Miles starts after V0-16 ships. Zero dependency on Nick.

---


#### V0-16: Timeline + Rollback — PR #39 expanded scope under greenfield directive

**What to build.** Land Miles's PR #39 (`feat/timeline`) with expanded scope per the greenfield directive (polished audit §13). This is significantly larger than a close-out — it's PR #39 rebase + 17 review comments + 8 architectural-precedent items + decision implementations + flash reconciliation + diff library integration.

**Core PR #39 (original scope):**
- Server: `timeline-query.ts` (237 + 250 test), 4 HTTP endpoints (`/api/history`, `/api/history/:sha`, `/api/diff`, `/api/rollback`), multi-parent checkpoint commits in `saveVersion()`, standalone-mode checkpoints
- Client: `TimelinePanel.tsx` (right-side Sheet), restore flow with confirmation
- Rebase onto main (non-trivial: touches `api-extension.ts`, `shadow-repo.ts`, `standalone.ts` — all changed since PR #39 branched)
- Address 17 pending review comments

**Expanded scope (greenfield directive — "no deferred tech debt"):**

| Item | What | Why not deferred |
|------|------|-----------------|
| **TQ8** | Mode-state refactor: `isSourceMode: boolean` → `editorMode: 'wysiwyg' \| 'source' \| 'diff'` | Enum is the correct data model for a 3-state machine. Ships in PR #39. |
| **TQ9** | Fold `PreviewEditor.tsx` into `SourceEditor.tsx` as a diff-mode capability | No parallel editor components for the same conceptual space. |
| **TQ10** | Typed origin constants: all origins as `LocalTransactionOrigin` objects | Fix `'rollback-apply'` raw-string smell. Unify under one convention. Nick consulted on shape (5-min conversation). |
| **TQ11** | Activity-map entry schema refactor: `{ actor: AgentIdentity, timestamp, action: {kind, metadata}, visibility: {flash, feed} }` | Refactor while consumers are few. Generalizes to future coarse actions. |
| **TQ12** | Shared flash primitive: `computeFlashTargets(activityEntry) → LineRange[]` | Both WYSIWYG and Source consume it. Eliminates divergence-by-copy-paste. **Subsumes V0-15 (activity flash verify + reconcile).** |
| **TQ13** | Remove broken agent-undo scaffold (AgentUndoButton, undo endpoints, undo MCP tools) | "Better to ship no-undo than confidently-broken undo." `AGENT_WRITE_ORIGIN` constant stays (load-bearing). Proper three-UM ships in V0-14. |
| **TQ14** | `safetyCheckpoint({ action, context })` generic primitive | Rollback as first caller; future coarse actions (apply-draft, etc.) reuse. Named for extensibility. Figma's two-checkpoints-around-restore pattern. |
| **TQ15** | `rollback_to_version` MCP tool (ships in PR #39, not follow-up) | Symmetric with existing MCP-exposed history pattern. |
| **TQ3** | `@pierre/diffs` integration — **ship BOTH inline unified AND side-by-side from day 1** | Don't ship half. Library candidate evaluated in polished audit §11. |
| **TQ2** | Flash reconciliation — Source's "flash all lines" → targeted pattern matching WYSIWYG's last/first-3-blocks | Zero surveyed products flash the whole document (audit §12.5). |
| **TQ7** | `prefers-reduced-motion` for flash animations (WCAG SC 2.3.3) | Accessibility baseline. Hours. |

**Decisions landing in V0-16:**
- **D6(b):** Rollback NOT tracked by any UndoManager (7/8 surveyed products agree — audit §12)
- **D10(e-generic):** safetyCheckpoint primitive, rollback as first caller
- **D11(a-structured):** Activity-map broadcast via refactored schema, distinct visual treatment (cool-blue pulse vs warm-orange agent-write flash)
- **D3:** `rollback_to_version` MCP tool
- **Q-trigger(b):** Explicit timeline click + post-agent-write affordance
- **Q-exit(c):** WYSIWYG button disabled in review mode; explicit "Exit preview"
- **Q-layout:** Both inline unified and side-by-side via `@pierre/diffs`
- **Q-branch-switch(a):** Re-fetch on branch-change event

**What this unlocks:**
- US-1a/1b/1c Timeline-based recovery (recent rewind, checkpoint restore, external overwrite recovery) ✅
- US-2b Per-file diff review ✅
- US-5f Agent pass summary per file (via Source-mode diff view) ✅
- US-5d Activity flash verified + reconciled across both modes ✅

**V0-15 (activity flash verify) is SUBSUMED by V0-16.** TQ2 (flash reconciliation) + TQ12 (shared primitive) + TQ7 (prefers-reduced-motion) + Playwright E2E verification all ship as part of V0-16's expanded scope. V0-15 as a separate story is redundant.

**Value.** Customer: recovery from mistakes — the trust dimension is load-bearing for production use. Source-mode diff view serves the "see what the agent did" scenario (US-5f). Platform: mode-state enum (TQ8), typed origins (TQ10), activity-map schema (TQ11), shared flash primitive (TQ12), safetyCheckpoint (TQ14) all set architectural precedents future work inherits. The greenfield directive means these precedents are set right, not retrofitted.

**Constraints.**
- Whole-version restore only in v0; selective revert is post-v0.
- Polling vs reactive refresh stays acceptable tech debt.
- Broken undo scaffold removed pre-merge (TQ13) — proper undo ships in V0-14.

**Non-goals (per polished audit).**
- **[NOT NOW]** Cross-doc timeline / activity feed (US-2a) — folds into deferred agent-proposal-review bundle.
- **[NOT NOW]** Rendered WYSIWYG diff — Source-mode diff serves US-5f.
- **[NOT NOW]** Selective per-section revert (US-2c partial — whole-version only).

**Lateral.** V0-14 depends on V0-16 (scaffold removal + typed origins + activity-map schema). Nick's TQ5 (Observer A char-level) runs in parallel. TQ10 coordination: one 5-minute conversation between Nick and Miles on where typed origin constants live (`packages/core/`).

**Forward.** Cross-doc activity feed (US-2a — S5's headline scenario) is the first natural extension. SafetyCheckpoint primitive (TQ14) reused by future apply-draft. Activity-map schema (TQ11) consumed by future agent-pass grouping (D9).

**Detail.** `stories/collaboration-capabilities-audit/STORY.md` §3 Area A.

**Owners.** **Miles** (all of V0-16). Nick consulted on TQ10 (typed origins shape) — one 5-minute conversation then independent.

**Status.** **PR #39 open**, Miles owns delivery. Approved-with-suggestions; needs rebase + 17 review comments + greenfield expanded scope.  Includes flash reconciliation, diff library integration, scaffold removal, and 8 architectural-precedent items.

**Lateral.** Coordinates with V0-14 on rollback-undo origin interaction (L2). Coordinates with V0-17 (persistence indicator) — if Timeline ships first, persistence indicator becomes a badge on the Timeline button.

**Forward.** Selective revert (US-2c) is the first natural extension. Cross-document activity feed (US-2a) — which PR #39 is per-document — is post-v0.

**Detail.** `stories/collaboration-capabilities-audit/STORY.md` §3 Area A. Delivery: PR #39.

**Status / owner signals.** **PR #39 open**, Miles owns delivery. Approved-with-suggestions, 17 pending inline recommendations. Branch diverged from main at `1dd65a0`; needs rebase across PRs #61, #62, #65, #71. 

---


**Next**

#### V0-17: Persistence failure indicator UI

**What to build.** Subtle status dot in editor header. Green = healthy, red = git pipeline failed. Tooltip on hover explains the failure. Clears when subsequent commit succeeds. Server emits a persistence-status event when `consecutiveGitFailures >= 3` (already tracked in `persistence.ts:99-103`); UI consumes it. **If V0-16 (Timeline) ships first, this becomes a red badge on the Timeline button instead of standalone (PQ11).**

**Value.** Customer: prevents silent-failure scenario — user thinks version history is recording but git plumbing has failed 3+ times unbeknownst to them. Data integrity trust is load-bearing for production use.

**Constraints.**
- Server emits via awareness channel or a dedicated SSE/WS event (spec decision).
- Indicator design: minimal — a dot, not a banner or toast (Andrew's PQ6 lean).
- Recovers automatically on next successful commit.

**Lateral.** Coordinates with V0-16 (Timeline) on visual placement (PQ11).

**Forward.** Foundation for future operational signals (sync status, agent activity status).


**Owners.** **Miles** end-to-end (1:1 with his change-attribution / shadow-git territory — feature-owner principle applies). Sarah consulted on visual design (dot + tooltip micro-interaction). Backend infra already shipped (PR #62 degraded-boot signal); Miles wires the UI.

**Status.** Backend infrastructure shipped (PR #62 — degraded boot signal). UI not started.

---


**Subsumed**

### Mike — Knowledge Graph / Content / Search

**Territory:** Wiki links and back links (data + link rewriting + managed rename). Graph visualization. Auto-indexing forward/back links. Link-click navigation experience. Orphans and hub detection. Dead-link checking. Slug correctness (Unicode + duplicate heading — one-way door). Config schema (SQLite / Drizzle / Zod). Full-text search (backend, UX, MCP tool integration — standalone bet post-v0). `suggest_links` MCP tool.

**Load watch:** Broad — knowledge-graph substrate + search substrate + config schema substrate. Three functional surfaces that share underlying data infrastructure. Manageable because coherent, but worth confirming he's sized for all of it.

**Now**

#### V0-8: Graph view of links (close out PR #76)

**What to build.** Force-directed graph visualization of the wiki-link structure. A `GraphView` React component (using `react-force-graph-2d`) consumes a new `GET /api/link-graph` endpoint backed by `BacklinkIndex.getLinkGraph()`. Nodes are docs; edges are `[[wiki-links]]`. Active document highlighted. Theme-aware (hooks into existing next-themes setup). Integrates into `EditorArea.tsx` as a panel or overlay.

**Value.** Customer: writers see the shape of their knowledge graph visually — a differentiator vs plain-filesystem docs tools, a recognizable feature for Obsidian users evaluating OK. Platform: `/api/link-graph` + `getLinkGraph()` become the foundation for future graph-based features (future clustering, semantic overlays, agent navigation hints). Internal: rounds out the wiki-links shipping story — PR #71 shipped the graph data + panels for inline context; V0-11 surfaces list-form navigation; V0-8 surfaces visual-form exploration. Together they cover the three Obsidian-grade link UX modes.

**Intersection with V0-11 (graph panels):** V0-11 (outline + forward + orphans + hubs) is list-form navigation — quick orientation. V0-8 (this story) is visual-form exploration — see connectedness. Different UI, shared backend data. Both consume the backlink index; neither supersedes the other. The panels answer "what's related to THIS doc"; the graph view answers "what does the whole knowledge base look like."

**Constraints.**
- Reuse existing `BacklinkIndex` forward map — no new data model.
- Theme-aware via existing `next-themes` integration (dark mode already shipped PR #60).
- Performance at scale: `react-force-graph-2d` must render acceptably for KBs up to ~5000 nodes. Verify during PR close-out; if performance is a blocker at realistic KB sizes, node/edge filtering (e.g., N-hop neighborhood around active doc) may be needed.
- Must not introduce per-interaction server load — graph data fetched once per open; updates respond to awareness push from V0-2/V0-3 (or poll if those haven't shipped).

**Lateral.** Pairs with V0-11 (graph panels) — complementary surfaces on the same backend. Pairs with V0-3 (BacklinksPanel push) — both are derived-view UIs that should adopt CC1 push-over-awareness pattern for live updates.

**Forward.** Foundation for future graph-based features: clustering overlays, tag-colored nodes (if tags ship), semantic-similarity edges, agent navigation hints ("you're here; these clusters are related"). If search ships (separate bet), graph view could layer search results as a filter.

**Delivery.** PR #76. 

**Status / owner signals.** **PR #76 OPEN**, Mike authored. Remaining work: PR review, performance validation at realistic KB sizes, layout/placement decision in `EditorArea.tsx` (panel vs overlay vs separate view), accessibility pass (keyboard navigation for graph). 

---


#### V0-12: Slug correctness — Unicode-safe + duplicate-heading-anchor disambiguation

**What to build.** Replace `toWikiLinkSlug` in `packages/core/src/utils/slug.ts` (currently `text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')` — destroys non-ASCII) with a Unicode-aware algorithm: NFKD normalize, lowercase, keep `\p{L}\p{N}`, collapse other to `-`, trim. Update `extractHeadings` in `api-extension.ts` to emit consistent `-1`, `-2` suffixes for duplicate headings (today only the client-side `HeadingAnchors` plugin disambiguates). Single source of truth in core.

**Value.** Customer-correctness: any user with non-ASCII content (Latin-accented, CJK, Cyrillic, Arabic, emoji-laden) is hitting a silent destructive bug today. Platform: the slug function is a shared identifier producer used in 4+ contexts (page targets, heading anchors, heading picker, unresolved-link creation) — fixing it once ripples atomically. **GTM (negative):** shipping international users a vault that destructively mangles links on every save is a trust cliff.

**One-way door:** the rewrite cost of fixing this AFTER users accumulate content is linear in vault size. Delayed fixing accumulates more content under the broken slug.

**Constraints.**
- Slug function lives in `@inkeep/open-knowledge-core`; `extractHeadings`, `HeadingAnchors`, `buildUnresolvedWikiLinkAttrs` all consume.
- Idempotent: `slug(slug(x)) === slug(x)`.
- Duplicate-heading disambiguation: server returns `notes`, `notes-1`, `notes-2`; rendered DOM IDs match exactly.
- Migration path (PQ9 OPEN): TBD between rewrite-on-boot, dual-resolve, or empty-vault-only release. Coordinates with V0-5 infrastructure (CC5).

**Non-goals.**
- **[NEVER]** Transliteration across scripts (`東京` → `tokyo` is lossy).
- **[NOT NOW]** Configurable slug algorithm per workspace.
- **[NOT NOW]** Fuzzy slug resolution (`[[cafe]]` → `café.md`).

**Lateral.** Mike's Story 2 (suggest_links, V0-13) depends on this — Unicode bug propagates to false-negatives. V0-5 (rename) shares rewrite infrastructure if PQ9 lands on option (a).

**Forward.** Sets precedent for every future identifier-producing function (heading IDs, wiki-link targets, future block IDs).

**Detail.** `stories/wiki-links-next/STORY.md` Story 1 (full invariants + AC).

**Status / owner signals.** Mike's. Scoped in detail. Migration path open. 

---


**Next**

#### V0-5: File rename + atomic backlink rewriting

**What to build.** Writers inline-rename a file in the sidebar; backlinks in other documents update atomically. Agents call MCP `rename_document(source, destination)`. The rename operation is `fs.renameSync` + provider pool reopen + atomic rewrite of `[[oldName]]` → `[[newName]]` across affected docs (preserving aliases `[[old|Display]]` → `[[new|Display]]` and section anchors `[[old#section]]` → `[[new#section]]`). Single atomic operation: either complete or rolled back, no partial state.

**Value.** Customer: rename doesn't silently break things. The "#1 trust-breaking gap" per Mike's audit — a user renames day 1, accumulates broken inbound links silently, three weeks later has a vault full of stale red-links. Platform: rewrite infrastructure becomes reusable for V0-12 slug migration (CC5), future heading-rename, future merge-pages.

**Constraints.**
- Reuses `BacklinkIndex.backward.get(oldName)` as the source of truth for affected docs.
- Uses Hocuspocus `DirectConnection`/agent-session transaction primitive (consistent with agent writes).
- Trigger surface: HTTP (`POST /api/rename`) + MCP tool (`rename_document`). Editor UI is sidebar inline-edit.
- Rewrite must fit in single Hocuspocus transaction per affected doc (per-doc atomicity) AND single rename operation at vault level (crash-recovery atomicity — TQ5 OPEN: per-doc-with-journal vs all-in-one-transaction).
- Rename collision: error out, don't auto-resolve (PQ10).
- Editor-open docs update live via Hocuspocus collab.
- External filesystem rename reconciliation (user runs `mv` in terminal) is OUT OF SCOPE — that's M5b.

**Lateral.** Coordinates with V0-4 (shares backend machinery, dual-surface pattern). Shares rewrite infrastructure with V0-12 if PQ9 lands on option (a).

**Forward.** Heading rename propagation (M5c — same machinery, different trigger). Move-to-subfolder (combined rename + path change). Future merge-pages.
md Story 3 — invariants I1-I8, AC1-AC7, items table).

**Status / owner signals.** Not started. Mike's Story 3 has detailed scoping. TQ5 staff-level decision needed (atomic strategy). 

---


#### V0-11: Surface existing graph APIs as editor panels (forward links, orphans, hubs)

**What to build.** Three React panels/views consuming already-live server APIs (no new backend work):
- **Forward links panel** (`GET /api/forward-links`) — what this doc links to
- **Orphans view** (`GET /api/orphans`) — docs with no inbound or outbound links
- **Hubs view** (`GET /api/hubs`) — most-linked docs

Each is a focused UI consuming an existing, tested endpoint.

**Value.** Customer: writers see the shape of their knowledge graph — where they've written dense clusters (hubs), where they have orphaned thoughts, where a doc links forward — without leaving the editor. **Highest-ROI story in the project** — backend work is done, this is pure React. Makes visible the investment the team has already made (3 API endpoints with no UI consumer). Pairs with V0-8 (graph view) for visual exploration and V0-9 (outline panel) for within-doc navigation.

**Constraints.**
- Reuse existing BacklinksPanel component architecture as the template.
- **Adopts Sarah's panel-docking pattern** (defined by Sarah as cross-cutting, first expressed in V0-9).
- Subscribes to V0-2/V0-3 push channel for live updates if shipped; falls back to refresh-on-demand otherwise.
- Panel layout (TQ10 OPEN): tabbed region, accordion in sidebar, right-dock panels (VS Code style), or select subset for v0 — resolved as part of Sarah's panel-docking pattern spec.

**Lateral.** Adopts V0-3 push-over-awareness pattern for live updates (CC1) and V0-9's panel-docking pattern.

**Forward.** Consumes "derived-view panel" pattern set by V0-9.


**Owners.** **Mike** owns delivery end-to-end (his knowledge-graph domain). Consumes Sarah's panel-docking pattern. Mike works with Dima on scroll/performance if active-state behavior differs from outline.

**Status.** Not started. Backend APIs all exist and are tested (`/api/forward-links`, `/api/orphans`, `/api/hubs`). Pure frontend work. 

---


#### V0-3: BacklinksPanel push-over-awareness (replace 2s polling)

**What to build.** Replace the 2-second `setInterval` in `BacklinksPanel.tsx` with awareness-driven push (CC1 pattern from V0-2). When server-side persistence updates the backlink index for a doc, broadcast an awareness signal to every loaded `Y.Doc` in the affected target set. The panel subscribes and re-fetches only when signaled.

**Value.** Customer: the backlinks panel feels live — a new inbound link appears within 500ms instead of up-to-2s. Platform: second consumer of CC1 push-over-awareness pattern — validates the pattern with two consumers before V0-11 panels adopt it.

**Constraints.**
- Reuses Hocuspocus awareness channel — does NOT introduce new transport.
- Signal is opaque (e.g., `backlinksRev: <timestamp>`) — clients react to "changed," not value content.
- Server dispatch inside `persistence.ts`'s `onStoreDocument` flow + file-watcher handlers in `standalone.ts`, after backlink index update.
- Target docs not currently loaded → silently dropped; fresh fetch on next mount.
- Fallback: single fetch on mount + on awareness reconnect; no silent polling fallback.

**Lateral.** Adopts V0-2's pattern; coordinates the contract.

**Forward.** Pattern is now proven across two consumers — V0-11 panels adopt with confidence.

**Detail.** `stories/wiki-links-next/STORY.md` Story 4 (full invariants + AC).

**Status / owner signals.** Not started. Mike's. 

---


#### V0-21: Dead-link checking

**What to build.** Surface existing unresolved-wiki-link data as a UI panel + MCP tool. `BacklinkIndex` already tracks unresolved targets (PR #71 wiki-links infrastructure). Add `GET /api/dead-links` endpoint returning the list. UI panel: "Dead links" section (either per-doc "Dead links in this doc" or vault-wide "Dead links across vault") with click-to-source navigation. MCP tool `find_dead_links()` for agents to call during link-hygiene workflows.

**Value.** Customer: writers can find broken `[[links]]` before they accumulate silently — closes the trust-breaking gap that rename (V0-5) also addresses from a different angle. Platform: exposes existing BacklinkIndex data via a new consumer surface. Internal (agent capability): agents can run dead-link checks as part of KB hygiene workflows.

**Scope (Tier 1 for v0 Next):** Just expose existing unresolved-wiki-link data. Small scope, builds on shipped infrastructure.

**Out of Tier 1 / Later:**
- External URL validation (HTTP fetch, rate limiting, cache) — larger scope, own story post-v0
- Section-anchor validation (`[[Page#missing]]`) — depends on V0-12 slug correctness for canonical anchors
- Auto-fix suggestions ("did you mean `[[foo]]`?") — parity-for-parity's-sake without clear user demand

**Constraints.** Uses existing BacklinkIndex — no new data model. Endpoint is a thin wrapper over `BacklinkIndex.getUnresolvedTargets()` (or equivalent; Mike knows the exact API). UI adopts Sarah's panel-docking pattern (when that pattern lands via V0-9).

**Lateral.** V0-5 (managed rename) prevents dead links from happening at rename time. V0-21 surfaces dead links that already exist. Complementary.

**Forward.** Foundation for future link-hygiene automation: agent auto-fix of dead links, scheduled audits, heading-rename propagation.


**Owners.** **Mike** end-to-end (his knowledge-graph territory). MCP tool registration coordinates with Tim (dual-surface pattern — UI panel + MCP tool for agents).

**Status.** Not started. 

---


**Later**

#### V0-13: `suggest_links` MCP tool (unlinked mentions for agents)

**What.** New MCP tool that, given a target page, finds all docs containing the page's title-as-text but no `[[link]]` to it (Roam's "Unlinked References" / Obsidian's unlinked-references panel). Returns list of source docs + snippet context. Lets agents perform the cross-cutting hygiene task of finding and closing unlinked mentions.

**Value.** Internal (agent capability): agents can read backlinks but not find unlinked mentions today. Closes the discovery half of the agent KB workflow. Customer: indirect — better agent assistance with link hygiene.

**Promote when:** v0 ships and agent workflows show evidence that unlinked-mention discovery is a recurring need.

**Constraints.** Depends on V0-12 slug correctness (Unicode bug propagates to false-negatives). Substring algorithm choice (Aho-Corasick vs regex) is implementation detail.

**Detail.** `stories/wiki-links-next/STORY.md` Story 2. 

---


**Reach**

#### V0-25: Schematize backlink index + config into SQLite with Drizzle + Zod

**What to build.** Replace the in-memory Map-based backlink index (currently `Map<string, Map<string, string>>` forward + backward, serialized as JSON to `.open-knowledge/cache/{branch}/backlinks.json`) and the YAML config layer with a SQLite database accessed via Drizzle ORM with Zod schema validation. Single `.open-knowledge/cache/ok.db` per project (per-branch tables or branch column). Migrate the file index (`Map<docName, FileIndexEntry>`) into the same DB.

**Why this matters.** Currently everything is Maps-in-memory + JSON/YAML-on-disk. That works at small scale but:
- **No query capability** — finding "all docs modified in the last week that link to auth.md" requires iterating the entire in-memory Map. SQL makes this trivial.
- **No full-text search foundation** — Mike's post-v0 search bet (Orama or SQLite FTS5) needs a DB layer. If the backlink index and file metadata are already in SQLite, adding FTS5 is a `CREATE VIRTUAL TABLE` on existing data — not a migration.
- **Serialization is fragile** — the JSON cache (`backlinks.json`) is a full dump-and-reload. SQLite gives incremental writes, crash recovery, and ACID transactions.
- **Schema enforcement** — Drizzle + Zod gives typed, validated data at every boundary. Current Maps are untyped at the persistence layer.

**Scope (what moves into SQLite):**

| Data | Current storage | SQLite table(s) |
|------|----------------|-----------------|
| Backlink index (forward + backward) | In-memory Maps + JSON cache | `links(source, target, snippet, branch)` |
| File index (docName → size, modified) | In-memory Map (file-watcher) | `documents(doc_name, size, modified, title, description, tags, branch)` — frontmatter parsed at index time |
| Config (content.dir, include, exclude, persistence settings) | YAML files + Zod schema | `config(key, value, scope)` — or keep YAML for human editing, mirror into SQLite for queries |

**What stays as-is:**
- Shadow git repo (`.git/openknowledge/`) — git objects, not database rows
- Y.Doc CRDT state — Hocuspocus manages, not SQLite
- YAML config files — human-editable source of truth; SQLite mirrors for query access

**Constraints.**
- Drizzle ORM (not Prisma — Drizzle is lighter, SQL-first, better Bun compatibility)
- Zod schemas for all table types (consistent with existing config schema pattern in `config/schema.ts`)
- Per-branch data via branch column or branch-prefixed tables (match existing `BranchGraphState` pattern)
- Migration from in-memory to SQLite must be transparent — existing consumers (`getBacklinks()`, `getForwardLinks()`, `getOrphans()`, `getHubs()`, `getFileIndex()`) keep their interfaces; implementation changes underneath
- Database file in `.open-knowledge/cache/ok.db` — gitignored, rebuild from files if missing (same as current JSON cache)
- Must not slow down the hot path: `onStoreDocument` → backlink update must be fast (current in-memory Map update is <1ms; SQLite insert must be competitive)

**Value.** Platform: SQLite becomes the foundation for Mike's post-v0 search bet — FTS5 virtual table on the `documents` table, vector search via sqlite-vec extension, metadata-filtered queries. The 8 research reports (Orama vs FTS5+sqlite-vec vs PGlite+pgvector) all assumed a DB layer exists — this builds it. Internal: replaces fragile JSON serialization with ACID persistence. Forward: enables future metadata queries (tag filtering, recent-modified, most-linked) without iterating Maps.

**Lateral.** CC9 (MCP enrichment quality bar) — enriched MCP tool responses (`list_documents` with metadata, `read_document` with backlinks) become SQL queries instead of Map iterations. Faster, more flexible. V0-24 (enriched just-bash) — `exec("ls docs/ | sort -k modified")` becomes a SQL query under the hood.

**Forward.** Direct path to Mike's search bet: add `CREATE VIRTUAL TABLE documents_fts USING fts5(title, description, content, content=documents)` on top of the `documents` table. No separate index-building pipeline needed — the data is already structured.

**Owners.** **Mike** end-to-end. His "schematizing config into proper SQLite → Drizzle → Zod" brainstorm item.

**Status.** Not started.  **Reach goal — lower priority than Mike's core v0 work** (V0-8 graph view close-out, V0-12 slug correctness, V0-3 BacklinksPanel push, V0-5 rename + link rewrite, V0-11 graph panels, V0-21 dead-link checking). Ship if Mike has capacity after core stories land. Becomes a prerequisite for the post-v0 search bet.

---


---

### Andrew — Platform / Ops / System-level Infrastructure

**Territory:** Project initialization, discovery, opening (CLI experience). Multi-project navigation + switching (CLI-side). Lock files, port management, service boot/shutdown, multi-session coordination. Server-side push broadcast infrastructure (CC1). Directory structure decisions (Assets/Attachments folder, Raw/external-sources folder, init scaffolding). OpenTelemetry / logging / instrumentation. Testing / CI / quality-gate infrastructure (formal steward). Electron desktop app (staged).

**Platform primitives consumed by feature owners:** `initContent()` scaffolding, `state.json` atomic writes + lock coordination, server-side awareness broadcast, process-safety primitives. Feature specs declare their primitive requirements; Andrew implements the primitives; feature code consumes them.

**Load watch:** Heavy platform stack. If Electron promotes from staged before v0 ships, or if testing/CI needs formal investment, consider splitting. Flag if saturated.

**Now**

#### V0-1: Server process safety — lock file, hardened shutdown, MCP port auto-discovery

**What to build.** Establish exclusive per-project process ownership. Extend `shadow-lock.ts` PID-based pattern to a server-level lock at `<contentDir>/.open-knowledge/server.lock`. Harden `destroy()` to release the lock as the final step (after git flush, session close, watcher stop). MCP stdio server reads the lock file on startup to discover a running instance's port — eliminates `--port` flag requirement.

**Value.** Customer: fixes a current data-corruption bug (two `open-knowledge start` in same directory = competing file watchers + competing git pipelines writing to `.git/index-wip`). Platform: lock pattern extends directly to Electron multi-window — each window acquires a lock; second window on same project gets "Already open in another window" dialog with zero Electron-specific code. AND zero-config MCP integration (Claude Desktop "just works" without `--port`).

**Constraints.**
- MUST extend `shadow-lock.ts` pattern (PID, hostname, startedAt) — invent nothing new.
- Lock metadata: `{ pid, hostname, port, startedAt }`.
- `destroy()` releases lock LAST, after all other shutdown steps (CC8).
- Stale lock detection: live PID → refuse to start with "Already running on port X"; dead PID → remove and continue.

**Lateral.** V0-7 (session persistence) depends on this — writing `state.json` without process exclusivity is a race condition.

**Forward.** Electron multi-window lock collision dialog reads this lock file. Future cross-machine deployment (if ever) reuses the pattern.
md`).

**Status / owner signals.** Not started. Andrew authored the original scoping; assignable to him or a server-focused engineer.  Spec needed.

---


#### V0-2: Push-based real-time sidebar updates

**What to build.** Replace the 5-second polling in `FileSidebar.tsx` with server-pushed file events over the existing WebSocket connection. When the file watcher emits a `DiskEvent` (create/update/delete/rename), the server broadcasts a structured event to all connected clients. The sidebar patches its local tree from the event stream rather than re-fetching the full document list. Establishes the push-over-awareness pattern (CC1).

**Value.** Customer: writers see agent-created files appear instantly; file ops (V0-4) ship with usable UX because delete/rename feedback is immediate. Platform: file-watcher-to-client push becomes the reusable primitive for V0-3 (BacklinksPanel push), V0-11 (graph panels), and any future derived-view UI. Without this, every panel defaults to polling and the architecture fragments.

**Constraints.**
- Reuses existing Hocuspocus awareness channel (CC1) — does NOT introduce a new WebSocket endpoint.
- Push payload is small (file path + event kind), not the full document list.
- Polling fallback on awareness disconnect is acceptable (single re-fetch on reconnect).
- Resolves the 5 open questions in `specs/2026-04-11-sidebar-realtime-updates/` SPEC.md (TQ2).

**Lateral.** V0-3 (BacklinksPanel push) shares the architectural primitive — coordinate the contract.

**Forward.** Enables V0-4/V0-5 file op UX, V0-11 graph panels with live updates, future tag browser.


**Owners.** **Andrew** (server-side push broadcast — the CC1 infrastructure, file-watcher-to-awareness plumbing). **Dima** (client-side sidebar subscriber — sidebar event handler, tree patch on events). Andrew sets the push contract; Dima consumes. Pattern is reusable: Mike's V0-3 (BacklinksPanel) and V0-11 (graph panels) adopt the same contract.

**Status.** Spec drafted with 5 OQs unresolved (TQ2). Not started. 

---


**Later**

#### V0-20: Desktop build pipeline prep — dynamic port + CJS build

**What.** Two infrastructure changes for Electron packaging: (1) ensure HocuspocusProvider accepts runtime-injected WebSocket URL instead of reading from `location.host` (current bug: `provider-pool.ts:35` falls back to `'localhost'` without port when loaded via `file://`), (2) add CJS build target for `packages/server/` (Electron's `utilityProcess.fork()` doesn't support ESM entry points).

**Value.** Platform: technically necessary for Electron build. Zero impact on current CLI/web experience.

**Promote when:** Electron packaging spec promotes from Draft (Intake) to Approved AND implementation begins. Currently no signal of imminent Electron work; promote trigger is "first DMG packaging spike" or equivalent.

**Constraints.** ProviderPool already accepts `wsUrl` override (TQ14). CJS build adds parallel output, ESM stays default (TQ15). Inherits PR #54 Track T2's `@parcel/watcher` → `chokidar` fallback.


---


**Cross-references** (secondary owner)

- **V0-7** (onboarding): Andrew owns platform primitives (`initContent()` extension, `state.json` schema + atomic writes + lock coordination, server init-status endpoint). Sarah is primary feature owner — see Sarah section.
- **V0-4** (file ops): Andrew's CC1 push-broadcast infrastructure is a prerequisite for Dima's sidebar UX. Andrew ships push server-side; Dima consumes client-side.

---

### Tim — Agent Infrastructure / MCP / Virtualization

**Territory:** MCP tools for read/write/list for agent. Just-bash virtualization (grep, ls, etc. — open question XQ1). MCP initialization and discovery by Cursor, Claude Code/Cowork, Codex. Agent harness integration. Embedded web viewer integration. Computing virtualized information / cataloging / indexes for agents (frontmatter indexing, etc.). MCP tool surface for file operations (dual surface with V0-4, V0-5; Dima owns UI, Tim owns MCP). MCP `ingest` tool.

**Now**

#### V0-26: MCP tool completeness + agent harness integration

**What to build.** Three workstreams that make the MCP surface v0-ready:

**1. Enrich `list_documents` (CC9 gap).** Currently returns raw doc names only (Hocuspocus passthrough). Agents must N+1 call `read_document` on each to get metadata. Enhance to return per-doc metadata: title (from frontmatter), description, tags, backlink count, modified timestamp, catalog category. Matches the enrichment standard `read_document` and `search` already meet (PR #74).

**2. Agent harness embedded web viewer integration.** Make the major agent harnesses aware of the OK editor for co-authoring:
- Cursor's browser panel — open `localhost:PORT/#/docName` alongside the agent
- Claude Code macOS app web view — same
- Claude Desktop preview panel — same
- MCP `instructions` field updated to tell agents: "prefer OK MCP tools over native Read/Grep/Glob for all KB operations" + "open the editor at `localhost:PORT/#/docName` to view documents during co-authoring"

**3. V0-4 file-ops MCP tool surface.** Design and implement `delete_document`, `move_document`, `duplicate_document`, `create_folder` as MCP tools. Shared backend API with Dima's UI (CC2 dual surface). Enriched responses per CC9 (e.g., `delete_document` reports orphaned backlinks, `move_document` reports updated references — not just `{ok: true}`).

**Value.** Customer (agent): agents using OK's MCP tools get strictly better results than native tools — the value prop of the MCP server. Without `list_documents` enrichment, agents waste turns on N+1 reads. Without harness integration, agents don't know how to show the editor alongside their work. Without file-ops MCP tools, agents fall back to native `Bash("rm")` which bypasses CRDT, provider pool, and rescue buffers.

**Constraints.**
- `list_documents` enrichment reuses the same frontmatter parsing + backlink index data that `read_document` already uses. No new data sources — just plumbing existing data into the response.
- Harness integration is primarily MCP `instructions` + documentation, not code changes. The editor already runs on localhost; agents just need to know the URL pattern.
- File-ops MCP tools share backend API with Dima's V0-4 UI — coordinate on API shape (CC2). Dima owns the server endpoints; Tim wraps them as MCP tools.
- All MCP tool responses use consistent enrichment shape (CC9).

**Lateral.** V0-4 (Dima) — shared backend API for file ops. CC9 — Tim owns the enrichment quality bar across all tools. V0-21 (Mike) — `find_dead_links` MCP tool registration is Tim's to wire.

**Forward.** V0-24 (enriched just-bash, Reach) builds on the same enrichment pipeline Tim establishes here. Post-v0 search bet plugs content-search results into the MCP surface Tim owns.

**Owners.** **Tim** end-to-end.

**Status.** `list_documents` enrichment and MCP instructions update can start immediately (no dependencies). File-ops MCP tools coordinate with Dima's V0-4 backend API (starts after V0-2 push contract is clear). Harness integration is documentation + testing work.

---

**Reach**

#### V0-24: Enriched just-bash MCP surface

**What to build.** A single MCP tool `exec(command)` that accepts bash-like commands scoped to the project's content directory. Same commands agents already know (`grep`, `ls`, `cat`, `find`, `wc`, `head`, `tail`, `sort`), but output enriched with computed system data. Every file reference in output includes: title (from frontmatter), backlink count, forward-link count, tags, modified timestamp, catalog category. Combinatorial operations (pipes) work — enrichment applies per output line that references a file.

**Why this matters.** Agents already compose native bash + curl/jq to glue grep results with our HTTP API. That works but it's three tool calls where one would do. Enriched just-bash makes the composition native: `exec("grep 'auth' **/*.md | head -5")` returns the first 5 files mentioning auth, each with enriched metadata, in one call. No curl, no jq, no glue code. The agent uses commands it already knows and gets better output.

Research supports this (root PROJECT.md XQ1): "Dust.tt observed agents spontaneously inventing file-path syntax before filesystem tools existed — agents naturally think in paths and Unix idioms." And: "Minimum tool count is the #1 failure predictor" — one `exec` tool vs 14 semantic tools.

**Scope tiers:**

| Tier | What | Effort |
|------|------|--------|
| **Tier 1 (minimum reach)** | `grep`, `ls`, `cat` enriched — per-file metadata in output |
| **Tier 2 (combinatorial)** | Pipe support (`grep | head`, `ls | sort -k modified`) |
| **Tier 3 (full, post-v0)** | All read-only commands enriched + custom commands (`backlinks auth.md`, `orphans`, `dead-links`) | Larger scope |

**Constraints.**
- **Read-only + whitelisted.** No `rm`, `mv`, `cp`, `mkdir`, `chmod`, or arbitrary execution. Write operations go through semantic MCP tools (`write_document`, `delete_document`, etc.) that have CRDT awareness + provider pool coordination. Enriched bash is for reading + discovery only.
- **Scoped to content directory.** Commands execute relative to the project's content root. Path traversal outside content dir blocked (reuse `safeSubdir()`).
- **Enrichment is additive, not replacing.** Raw command output stays intact; enrichment appends as structured metadata. Agent can parse either the raw output (familiar) or the enriched metadata (richer).
- **Falls back gracefully.** Commands that don't produce file-scoped output (e.g., `echo`, `date`) return raw output without enrichment — no error, just no metadata to add.
- **Relationship to semantic tools:** Enriched just-bash COMPLEMENTS semantic tools for v0, not replaces. `exec("cat auth.md")` and `read_document("auth.md")` return the same enriched data via different entry points. Post-v0 decision: should enriched bash REPLACE some semantic tools to reduce tool count? That's XQ1.

**Value.** Customer (agent): agents use one `exec` tool with familiar bash commands instead of learning 14 semantic MCP tools. Combinatorial operations (pipes, head, sort, grep chaining) work natively. Platform: explores XQ1 architecture (root PROJECT.md) — if enriched bash works well in practice, post-v0 we could make it the primary MCP surface and deprecate semantic tools that it subsumes.

**Lateral.** CC9 (MCP enrichment quality bar) applies: enriched bash output must match or exceed what semantic tools return. If `exec("cat auth.md")` returns less than `read_document("auth.md")`, the value prop breaks. Same enrichment pipeline under the hood.

**Forward.** If this works well: post-v0, evaluate deprecating `read_document`, `list_documents`, `search` in favor of `exec("cat")`, `exec("ls")`, `exec("grep")`. Reduces tool count from ~14 to ~5 (exec + write_document + edit_document + undo + redo). Root PROJECT.md XQ1 resolves.

**Detail.** Root PROJECT.md XQ1 (open architectural question). Internal `bash/index.ts` provides the implementation substrate.

**Owners.** **Tim** end-to-end. This is his "just-bash virtualization" brainstorm item brought to life.

**Status.** Not started. 5 week. **Reach goal — lower priority than Tim's core v0 work** (V0-4 MCP file-ops, CC9 enrichment audit, MCP initialization/discovery, harness integration). Ship if Tim has capacity after core lands. Depends on core semantic tools working first (enriched bash reuses the same enrichment pipeline).

---


**Cross-references** (secondary owner)

- **V0-4** (file ops): Tim owns MCP tool surface (`delete_document`, `move_document`, `duplicate_document`, `create_folder`). Dima is primary (UI + server API) — see Dima section.
- **V0-21** (dead-link checking): Tim owns MCP tool registration (`find_dead_links`). Mike is primary — see Mike section.
- **V0-13** (suggest_links): Tim owns MCP tool registration. Mike is primary — see Mike section.
- **CC9** (MCP enrichment quality bar): Tim owns verification across all MCP tools during V0-4 spec.

---

### Dima — Sidebar / CRUD / Docs-system Engineering

**Territory:** Sidebar (UX + internals). CRUD on files/folders (V0-4). Tabbed file experience (Obsidian-style). Drag-and-drop markdown files. Docs site / Fumadocs maintenance. Long-term: "OK as WYSIWYG editor for a Fumadocs project" future bet (Nick consulting on MDX).

**Feature owner for engineering-heavy UI stories (ships UX functional + high quality; Sarah reviews/polishes after):**
- V0-9 Outline panel — Dima feature-owns build. Consumes Sarah's panel-docking pattern. 
- V0-10 Quick switcher (Cmd+K) — Dima feature-owns end-to-end. Uses `shadcn/ui Command` component (wraps `cmdk`). Designs result-source architecture himself; Mike consulted when search bet activates post-v0. 
- V0-18 Find and replace — Dima feature-owns (TipTap + CodeMirror coordination). 
- V0-19 Word count + sidebar sort — Dima fully.

**Engineering refactor owner:** Slash-command-generalization spec (still Draft) — pure engineering refactor. Block editor UX (future `block-editor-ux` spec).

**A11y (post-v0 as a formal practice):** Deprioritized for v0. In v0: baseline a11y is engineering hygiene — Dima implements keyboard nav, focus management, semantic HTML as part of shipping his own stories. Post-v0 (when promoted): Dima owns the formal practice — tooling, standards, compliance audits, team education.

**Long-term (Nick → Dima handoff):** Typed component nodes (PR #23) + Component slash insert (PR #12) — handoff when MDX pipeline clean.

**Now**

#### V0-4: File organization operations from the sidebar (delete, move, duplicate, new folder)

**What to build.** Writers can right-click a file in the sidebar and choose Delete, Move, or Duplicate. Writers can create an empty folder via sidebar action or context menu. Agents can call equivalent MCP tools: `delete_document`, `move_document`, `duplicate_document`, `create_folder`. Backend API shared between UI and MCP (CC2). On delete with a dirty doc open in the editor, the existing rescue-buffer mechanism preserves unsaved CRDT state.

**Value.** Customer: writers can clean up and reorganize without leaving the browser — fixes a concrete day-0 embarrassment (users can currently create files they cannot remove from the UI). Platform: dual UI + MCP surface establishes the precedent for every future file-level agent capability (CC2 — load-bearing).

**Constraints.**
- Reuses safe path utilities (CC3) and provider pool cleanup (CC4).
- Real-time sidebar (V0-2) is prerequisite — without it, delete UX is broken (5s stale state, user reclicks, errors).
- Confirmation UX required for destructive operations (no version history → irreversible).
- Folder operations mirror file operations; no special-case folder-move-with-content semantics in v0.
- **MCP tool enrichment (CC9):** File-ops MCP tools must return enriched responses — not just `{ok: true}`. E.g., `delete_document` reports title of deleted doc + count of orphaned backlinks created. `move_document` reports which backlinks now point to the new path. Tim designs response shapes during spec. Agent using `delete_document` gets strictly better feedback than agent using native `Bash("rm")`.

**Lateral.** V0-5 (rename) shares most backend machinery and the dual-surface pattern. **Scope note:** V0-4 scopes "move" as context-menu / move-dialog interaction. Drag-and-drop reorder/move in the sidebar tree is explicitly NOT V0-4 — that's V0-23 (reach goal, lower priority, builds on V0-4's backend).

**Forward.** Establishes the dual UI+MCP pattern for future file-level operations (archive, tag, batch ops).


**Status / owner signals.** Not started. PR #40 (open spec) defines MCP write_file conventions — coordinate API shape. PR #53 (open) adds wiki-link context menu — UI pattern reusable. 

---


**Next**

#### V0-9: Document outline panel

**What to build.** A panel showing the hierarchy of headings (H1-H6) in the currently-open document as a clickable tree. Click a heading → editor scrolls to it. Active heading highlighted based on cursor/scroll position. Collapsible. Live-updates as headings change. Consumes `GET /api/page-headings` (already shipped). Works in both WYSIWYG and Source modes (scroll integration with TipTap + CodeMirror). **This story also sets the panel-docking visual + interaction pattern that V0-11 and future panels adopt.**

**Value.** Customer: within-doc navigation — writers working in long docs can jump between sections without scrolling. Obsidian/VS Code/Google Docs/Typora all ship this; users coming from those tools expect it. Platform: panel-docking pattern established here (where panels live, collapse behavior, keyboard nav, active-state visual) becomes the visual language for V0-11 (graph panels) and any future docked panel. **Load-bearing design decision** — getting the pattern right once saves every future panel from re-deciding.

**Constraints.**
- Reuse existing `BacklinksPanel` component architecture as the template where possible.
- Scroll-integration works in both TipTap (WYSIWYG) and CodeMirror (Source) modes; single behavior spec, two implementations.
- Active-heading detection via scroll position (IntersectionObserver or similar — performance-sensitive on long docs).
- Live updates: subscribe to CC1 push if V0-2 shipped; fall back to on-demand refresh.
- Outline slug consistency with V0-12 (Mike's slug correctness) — outline panel's anchor IDs must match the editor's rendered heading IDs.

**Lateral.** Sets the panel-docking pattern V0-11 adopts. V0-3 (BacklinksPanel push) and V0-11 (graph panels) are the next consumers. Coordinates with V0-12 on slug consistency (Mike owns slugs; this panel consumes them).

**Forward.** Panel-docking visual language carries into every future panel: tag browser, future graph clusters, AI-suggestion surfaces, etc.


**Owners.** **Dima** leads (scroll integration with TipTap + CodeMirror, IntersectionObserver active-heading detection, live-update state management, tree rendering, UX decisions). Builds to Sarah's panel-docking pattern. Nick consulted on editor-side integration (ProseMirror scroll primitives in WYSIWYG mode).

**Status.** Not started. Backend API exists (`/api/page-headings`). Pure frontend work. 5 weeks.

---


#### V0-10: Quick switcher (Cmd+K) and recent files

**What to build.** Writers press Cmd+K and get a fuzzy-matched command palette listing all documents. Selecting a result opens that document. A "Recently opened" section appears at the top of the palette, tracked client-side. No server-side search index needed — the `fileIndex` already in memory is enough for fuzzy matching at expected KB sizes (<5000 docs).

**Value.** Customer: writers with growing KBs (>50 docs) jump directly to any file without scrolling the sidebar tree. Platform: validates that document-finding doesn't require a full-text search engine — clarifies the eventual search bet's scope (search is for content, Cmd+K is for navigation). Internal: muscle memory for Obsidian + VS Code users lands intact.

**Constraints.**
- Pure frontend — no server changes.
- Fuzzy matching library (TQ11 PARKED): fzf.js, fuse.js, or custom (~5KB).
- Recents stored in localStorage.
- Keyboard navigation primary (arrow keys, enter, escape).
- Must handle large fileIndex (thousands of docs) with responsive typing (<100ms match time).

**Lateral.** When full-text search ships as separate bet, Cmd+K becomes the natural entry point for combined navigation + search results.

**Forward.** Natural home for future command-palette commands (create doc, insert template, switch theme).


**Owners.** **Dima** feature-owns end-to-end. Uses `shadcn/ui Command` component (wraps `cmdk` — used by Linear, Vercel; handles keyboard nav, fuzzy filtering, a11y). Designs result-source extensibility contract himself — Mike consulted when post-v0 search bet activates to ensure content results plug in cleanly.  Nextra has analogous command palette work Dima can draw from.

**Status.** Not started. Library: `shadcn/ui Command` (wraps `cmdk`). 5 weeks.

---


**Later**

#### V0-18: Find and replace within document

**What.** Cmd+F find bar; Cmd+Shift+F find-and-replace. Find highlights in document, next/previous navigate matches, replace-one and replace-all modify the document through normal CRDT writes (so agent visibility + undo work correctly).

**Value.** Customer: core editor table-stakes. Without this, users drop to VS Code/sed for bulk in-document edits.

**Promote when:** users report bulk-edit friction OR inline-edit flow becomes a common agent workflow.

**Constraints.** TipTap and CodeMirror have separate search extensions; coordinated Cmd+F across modes (TQ12 OPEN). Must go through CRDT writes (bridge invariant).


**Owners.** **Dima** feature-owns end-to-end (TipTap search+replace extension wiring, CodeMirror search extension coordination, single Cmd+F across both modes, bridge-invariant preservation — consult Nick on CRDT write path, find-bar UX).  5 weeks.

---


#### V0-19: Sidebar sort + word count polish bundle

**What.** Sidebar sort toggle (name [default] or modified date descending — fileIndex already has `modified`). Live word count in editor footer (derived from Y.Text). Optional: characters, reading time.

**Value.** Customer: productive-feeling basics; collectively closes "feels unfinished" gap.

**Promote when:** Now+Next ship and qualitative feedback surfaces "feels unfinished" sentiment OR when a larger polish sprint is scheduled.


**Owners.** **Dima** implements both (sort is trivial extension of his sidebar territory; word count is trivial Y.Text derivation). Sarah reviews word-count placement in the editor footer.

---


**Reach**

#### V0-22: Tabbed file experience (Obsidian-style)

**What.** Multiple documents open simultaneously as tabs above the editor. Tab bar shows open docs. Click tab to switch. Close tab (X button or middle-click). Remember open tabs across sessions via `state.json` (depends on V0-7 session persistence).

**Value.** Customer: users can reference one doc while editing another — reduces sidebar navigation overhead. Matches Obsidian, VS Code, every editor users are coming from.

**Constraints.**
- Provider pool already supports multiple open docs (LRU from `specs/2026-04-10-provider-pool/`). Each tab = one active HocuspocusProvider.
- Hash routing (`#/docName`) needs to extend or be replaced with tab-aware state management.
- Tab persistence in `state.json` — depends on V0-7 session persistence (Andrew's primitives).
- Closing a doc's tab doesn't delete the doc (obvious but worth stating).

**Owners.** **Dima** end-to-end. 

**Status.** Not started.  **Reach goal — lower priority than Dima's core v0 work.**

---


#### V0-23: Drag-and-drop files in sidebar

**What.** Drag files and folders within the sidebar tree to move them. Drag a file to a different folder → moves the file (same backend as V0-4 move). Drag a folder → moves the folder + contents. Visual drag preview, drop-target highlighting, prohibited-drop indication (e.g., can't drop a folder into itself).

**Value.** Customer: intuitive organization matching every file manager. Faster than context-menu move for spatial thinkers. Obsidian and VS Code support this.

**Constraints.**
- Builds on V0-4's move backend — DnD is a **trigger** for the same `move_document` API, not a separate operation.
- Needs V0-2 real-time sidebar to update correctly after moves.
- DnD library: `@dnd-kit/core` or HTML5 drag API. Evaluate at impl time.
- Must handle edge cases: drop onto root, drop onto self, deeply nested moves.

**Scope note on V0-4:** V0-4 (file organization ops) scopes "move" as context-menu / move-dialog. DnD is explicitly NOT in V0-4 — it's this separate reach story that builds on V0-4's backend.

**Owners.** **Dima** end-to-end. 

**Status.** Not started.  **Reach goal — lower priority than Dima's core v0 work.**

---


**Cross-references** (secondary owner)

- **V0-2** (real-time sidebar): Dima owns client-side subscriber (sidebar event handler, tree patch on events). Andrew is primary for server push infra — see Andrew section.
- **V0-5** (rename): Dima owns sidebar trigger UX (inline rename). Mike is primary for rewrite machinery — see Mike section.

---

### Sarah — Head of Design / Design Engineer

**Territory:** WYSIWYG experience design — end-to-end visual + interaction direction for the editor. TipTap extensions / rich UX (bubble menu, inline formatting, callouts, authoring rich patterns). Copy-paste experience (image paste V0-6 close-out; copy-paste images; drag-drop images). V0-7 Onboarding feature + React UI (novel first-impression work). Frontmatter editing UX (future). Persistence indicator visual design (consulted with Miles on V0-17).

**Cross-cutting patterns (set once, ahead of implementation — not per-story):**
- Panel-docking visual + interaction pattern (consumed by V0-9 outline, V0-11 graph panels, future panels) — Sarah writes pattern doc; feature owners build to it
- Keyboard shortcut scheme (Cmd+K, Cmd+F, Ctrl+\, future shortcuts — scheme + discoverability)
- Visual design language (focus indicators, motion, error states — adopted across the product)
- V0-10 palette result-source contract reviewed after Dima ships (Dima designs + builds end-to-end)

**Design reviews:** Provides design feedback across all features as they ship — pattern consistency, visual polish, interaction quality.

**Design lead for cross-cutting UX:** Owner for UX questions that span multiple features or don't have a clear home. Final call on UX tradeoffs and taste decisions.

**Now**

#### V0-6: Image paste + attachments model

**What to build.** When a user pastes a screenshot into the editor, save it to the project's attachments directory and insert a markdown image reference. Define the attachments directory model (location, naming, content-filter interaction, git behavior).

**Value.** Customer: docs authors paste screenshots constantly. Without this, OK forces them to manually save images, switch to Finder, find the file, construct a markdown reference, switch back — destroying writing flow. Every competing tool handles this. Platform: attachments model establishes how OK handles non-markdown assets generally (future video embeds, PDF attachments, import/export all build on this pattern).

**Constraints.**
- Attachments location: `<contentDir>/attachments/<docName>/` (PQ4 — per-doc subfolder for portability).
- Naming: `<timestamp>-<first8-hash>.png` (deterministic, collision-free).
- `content.exclude` auto-excludes `attachments/` from document index (CC7); attachments are version-controlled (PQ5).
- TipTap paste handler intercepts `image/*` clipboard events; calls `POST /api/attachments` with multipart form; inserts `![](./attachments/<docName>/<filename>.png)` at cursor.
- Drag-and-drop deferred to a separate story.

**Lateral.** Shares `content.exclude` concern with V0-4 (CC7).

**Forward.** Electron inherits unchanged (TipTap paste runs in any renderer). Drag-and-drop builds on the same endpoint.
 **PR #41 is in flight** with 492 LOC already covering the TipTap plugin, busboy server endpoint, MIME validation, atomic writes — saves to flat `uploads/` (not per-doc).

**Status / owner signals.** **PR #41 open**. Remaining work: design decisions (PQ4, PQ5 — directory naming, gitignore behavior) and adapting PR #41 to current codebase + content.exclude integration. 

---


#### V0-7: First-run onboarding flow + session persistence + starter document

**What to build.** Three integrated UX components for the first-run and return-visit experience:
- **Welcome screen** — when `.open-knowledge/` is fresh OR no documents loaded, show a guided onboarding (content detection summary if files exist, "Create your first article" action if empty). Once dismissed and ≥1 doc exists, never reappears.
- **Starter document** — `initContent()` creates a starter `README.md` in `<contentDir>` if no `.md` files matching `content.include` exist. Brief welcome content, 5-10 lines showing markdown + a JSX component example.
- **Session persistence** — per-project `.open-knowledge/state.json` stores `{ lastOpenedDoc, lastModified }`. On app load, opens the last doc (or falls back to first in index if deleted). Atomic write (tmp + rename), respects V0-1 lock.

**Value.** Customer: new writers land in a productive state without terminal context-switching. Returning users resume where they left off — small UX moment with outsized stickiness impact. Platform: onboarding components compose into the future Electron Project Navigator without rework. State.json model establishes per-project state pattern that Electron's per-user state extends.

**Constraints.**
- Onboarding components are React components the Electron renderer can wrap.
- Content detection reuses the existing `ContentFilter` pipeline (no separate file walking).
- Config changes during onboarding (content.dir, exclude) persist to `.open-knowledge/config.yml`.
- Existing content NEVER modified by onboarding — detection only.
- State.json depends on V0-1 lock (CC6).

**Lateral.** Part B of `stories/init-and-project-switching/` (multi-project switching) is a sibling bet — explicitly out of v0 scope. PR #57 already shipped auto-init; this story extends with the UI flow + starter doc + session persistence.

**Forward.** Electron Project Navigator composes these components. Per-user state (window size/position) is a separate Electron concern that doesn't change this per-project model.
 **Story-depth detail in `stories/V0-7-onboarding/STORY.md`.**

**Owners (layered).** **Sarah** owns the feature end-to-end and the React UI (welcome screen, content scope confirmation, first-doc creation — highest-leverage first-impression novel UX). **Andrew** owns the platform primitives the spec consumes: `initContent()` extension for starter README, `state.json` schema + atomic writes + lock-coordinated writes (depends on V0-1), server endpoint for init status. Sarah writes the spec declaring primitive requirements; Andrew implements primitives; Sarah's React components consume them.

**Status.** Part A onboarding scoped in detail. Auto-init shipped (PR #57). Starter doc + session persistence + React UI not started.

---


**Cross-references**

- **Cross-cutting patterns:** Panel-docking, keyboard shortcut scheme, visual design language — published as reference docs that feature owners build to.
- **Review + polish:** Sarah reviews all features after they ship for pattern drift, visual inconsistencies, or polish opportunities. Not in the critical path.

---

### Nick — Editor Internals / CRDT / MDX Pipeline

**Territory:** Bidirectional markdown ↔ prosemirror conversion pipelines. Observers / conversion preservation / CRDT invariants. Bridge invariant (Y.XmlFragment ↔ Y.Text). Editing or rendering MDX components (built-in or custom).

**Now (parallel track for V0-14 prerequisite):** TQ5 Observer A character-level diff refactor (~60 LOC in `observers.ts:206-249`). TQ6 US-3e stress test. Bridge-matrix undo-invariant tests (TDD groundwork). Zero coordination with Miles — Nick's files only. Starting now.

**Temporary until handoff:** PR #12 Component slash insert — Nick's until MDX pipeline clean → Dima. PR #23 Typed component nodes — Nick's until MDX pipeline clean → Dima. Generalizable MDX editing for future Fumadocs editor bet — Nick consulting Dima long-term.

**Cross-references** (consultation role)

- **V0-14** (per-origin undo): Nick owns TQ5/TQ6 prerequisites (Observer A char-level refactor + stress test). Miles owns the three-UndoManager wiring — see Miles section. Convergence: Miles starts UM wiring after Nick's TQ5 lands + Miles's V0-16 scaffold removal. One 5-min conversation on TQ10 (typed origin constants shape in `packages/core/`), then independent.
- **V0-16** (Timeline): Nick consulted on TQ10 (typed origins — constants shape).
- **V0-18** (find/replace): Nick consulted on bridge invariant (CRDT write path for replace operations).
- **V0-20** (desktop build prep): Nick consulted on provider-pool.ts dynamic port change.

---

## Post-v0 (out of v0-launch scope; tracked for future planning)

Items explicitly deprioritized to post-v0. Not stories in this project — future bets or ongoing practices that pick up after v0 ships.

### Deprioritized engineering practices

- **A11y as a formal engineering practice** (Dima future) — Baseline a11y stays as engineering hygiene in v0: feature owners implement keyboard nav, semantic HTML, focus management as part of shipping. Sarah's designs remain accessible by default as design discipline. What moves post-v0:
  - Formal WCAG AA compliance audit + checklist
  - `axe-core` in CI / Lighthouse audits as a gate
  - Playwright a11y test suite
  - ESLint a11y plugin enforcement as a release gate
  - Dedicated a11y compliance sprint
  - **Promote trigger:** v0 ships AND real user evidence of a11y gaps OR enterprise evaluation requires WCAG compliance.

### Separate bets (each its own future project)

- **Full-text search** — Mike's future project. 8 research reports completed. separate project (Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector). Promote when: v0 ships AND search becomes the biggest remaining gap.
- **User-facing version history UI (beyond Timeline)** — Miles's future project. Shadow repo was designed for attribution journaling; richer user-versioned history needs redesigned data model + UX. V0-16 Timeline covers the narrow scope for v0. Promote when: users demand richer history controls (named versions, per-file timeline, branch-based experiments).
- **Electron native distribution** — Andrew's future project. V0-20 is the build-pipeline-prep gating story. Spec exists at `specs/2026-04-11-electron-desktop-app/`. Promote when: Electron implementation begins (DMG packaging spike).
- **Multi-project switching (Part B of init-and-project-switching)** — separate bet. Registry at `~/.open-knowledge/projects.json`, CLI `list`/`open` commands, in-editor switcher. Cross-project navigation, not within-project. Promote when: v0 ships AND users have multiple projects registered.
- **"OK as WYSIWYG editor for a Fumadocs project"** — Dima's future project (Nick consulting on MDX). Positions OK as Mintlify-class editor for the Fumadocs ecosystem. Promote when: v0 ships AND MDX pipeline stabilizes enough that the generalization surface is clean.
- **Permissions model (Zanzibar-style)** — Miles's future project if needed. Root PROJECT.md PQ7/PQ12/TQ10. Promote when: multi-human collaboration or enterprise use cases force the model.
- **Suggestions / tracked changes (PQ11 parked)** — combined "agent-proposal review experience" design bundle with branching/draft UX (PQ9). Promote as a dedicated design pass, not piecemeal.

### Dead-link checking Tier 2/3 (post-v0 expansion of V0-21)

V0-21 covers Tier 1 (surface existing unresolved wiki-link data). Tier 2/3 are post-v0:
- **Tier 2:** External URL validation (HTTP fetch with rate limiting, cache, retry on transient failures)
- **Tier 3:** Section-anchor validation (`[[Page#missing-heading]]` — depends on V0-12 slug correctness)
- **Promote when:** V0-21 ships AND link-hygiene workflows surface demand for deeper validation.

---

## Dependency graph

```
V0-1 (process safety) ─┬─→ V0-7 (state.json needs lock for safe writes)
                       └─→ V0-20 (lock file's port field enables MCP auto-discovery — already in V0-1)

V0-2 (real-time sidebar push) ─┬─→ V0-4 (file ops UX needs instant feedback)
                                ├─→ V0-5 (rename UX same)
                                └─→ V0-11 (panels can subscribe for live updates)

V0-2 ↔ V0-3 (BacklinksPanel push) — CC1 pattern coordinator; first one defines contract

V0-8 (graph view) ↔ V0-11 (graph panels) — complementary UIs on same BacklinkIndex data
V0-8 — can adopt CC1 push-over-awareness for live updates once V0-2/V0-3 defines contract

V0-4 (file ops) ─→ V0-5 (rename shares backend machinery + dual-surface pattern)

V0-12 (slug) ─→ V0-13 (suggest_links — Unicode propagation)

V0-12 ↔ V0-5 — possibly share rewrite infrastructure (CC5; PQ9 OPEN)

V0-14 (per-origin undo) ↔ V0-16 (Timeline) — coordinate L2 rollback+undo origin interaction

V0-16 (Timeline) ↔ V0-17 (persistence indicator) — placement decision (PQ11)

V0-9 (outline panel) — Sarah sets panel-docking pattern; V0-11 (graph panels) adopts

V0-12 (slug) ─→ V0-21 (dead-link checking — unresolved targets matched by slug; Unicode bug would propagate false-positives)

V0-7 (onboarding) — independent of all others except V0-1

V0-6 (image paste) — independent of all others (PR #41 close-out)

V0-10 (Cmd+K), V0-11 (panels), V0-15 (flash), V0-18 (find/replace), V0-19 (sort+wc), V0-20 (build prep) — all independent
```

**Critical path:** V0-1 → V0-7 (process safety unblocks session persistence). V0-2 → V0-4 → V0-5 (real-time sidebar unblocks file ops UX, file ops machinery enables rename).

## Items table

P0 = must resolve before this story can move to spec. P2 = explicitly deferred with revisit context. No P1 (binary triage).

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| PQ1 | v0 launch primary persona: end-user writer (P1) with AI agent as shared-surface consumer | Product | P0 | **Decided** | Locked. Inherited from day-0-editor-completeness PROJECT.md PQ1 (evidence/competing-decompositions.md). Feature-by-feature: file ops + slug + content queries surface both UI and MCP; outline / quick switcher / persistence indicator are UI-only. |
| PQ2 | Existence-stakes scope, not parity. Excluded: graph view, tags, custom CSS, keyboard customization, comments. | Product | P0 | **Decided** | Locked. Differentiation is CRDT + agents + local-first; Obsidian parity isn't the goal. |
| PQ3 | Search, version-history-UI-as-redesign, Electron, multi-project switching are separate bets | Product | P0 | **Decided** | Locked. Each named in non-goals with promote triggers. Note: V0-16 (Timeline) is an exception — it's already in flight as PR #39, scoped narrower than the full version-history-UI-as-redesign carve-out. |
| PQ4 | Attachments directory location: `<contentDir>/attachments/<docName>/` (per-document subfolder) | Product | P0 | **Assumed** | Confidence: INFERRED. Andrew's Story 2b leaned to per-doc; PR #41 currently uses flat `uploads/`. Verify by: checking with PR #41 author whether the per-doc subfolder design is acceptable. Affects V0-6. |
| PQ5 | Attachments are version-controlled (not gitignored) | Product | P0 | **Assumed** | Confidence: INFERRED. Andrew's Story 2b PQ3. Most docs authors expect screenshots in git for portability. Verify by: confirming with first dogfood user. Affects V0-6. |
| PQ6 | Onboarding flow components: detection summary → scope confirmation → first-document guidance | Product | P0 | **Decided** | Directed. Inherited from `stories/init-and-project-switching/STORY.md` PQ3. Three-component sequence; details in V0-7 STORY.md. |
| PQ7 | "Create first article" empty-state action | Product | P0 | **Decided** | Directed. Inherited from init-and-project-switching PQ4. |
| PQ8 | Slug algorithm: NFKD normalize, lowercase, keep `\p{L}\p{N}`, collapse other to `-`, trim `-` | Product | P0 | **Assumed** | Confidence: INFERRED (Mike's S1.PQ1). Mirrors GitHub's heading-anchor algorithm. Verify by: spec-level review against I1-I4 invariants (in V0-12 STORY.md). |
| PQ9 | Slug migration path for existing non-ASCII content: TBD between (a) rewrite on boot using V0-5 infrastructure, (b) dual-resolve transition window, (c) empty-vault-only release | Product | P0 | **Open** | Mike's S1.TQ2 — UNCERTAIN confidence. Cascades to V0-5/V0-12 sequencing. **Investigate first:** inspect dogfood vaults for existing non-ASCII titles. |
| PQ10 | Rename collision behavior: error out (not auto-resolve to `bar-1.md`) | Product | P0 | **Assumed** | Mike's S3.PQ2. Silent auto-resolution surprising; error and require caller to pick name. Verify with Mike. Affects V0-5. |
| PQ11 | Persistence failure indicator design: subtle status dot in editor header, red on `consecutiveGitFailures >= 3` | Product | P0 | **Assumed** | Andrew's Story 4 design + PR #62 infrastructure. If V0-16 (Timeline) ships first, becomes a badge on Timeline button instead of standalone. Verify after V0-16 status clears. Affects V0-17. |
| TQ1 | Lock file location + schema: `<contentDir>/.open-knowledge/server.lock` with `{pid, hostname, port, startedAt}` | Tech | P0 | **Decided** | Locked. Andrew's Story 1. Extends `shadow-lock.ts` pattern verbatim. Affects V0-1. |
| TQ2 | Real-time sidebar push: 5 open spec questions in `specs/2026-04-11-sidebar-realtime-updates/` | Tech | P0 | **Open** | OQ1-OQ5: push vs pull strategy, provider-pool coordination, event scope, optimistic UI, scalability. **Resolve before V0-2 implementation.** Owner: V0-2 spec author. |
| TQ3 | Push-over-awareness pattern: shared between V0-2 (sidebar) and V0-3 (backlinks panel). First story sets the contract. | Tech | P0 | **Decided** | Directed. Avoid two divergent push implementations. Whichever ships first defines the signal field shape and consumer subscription pattern. |
| TQ4 | File ops dual surface: every endpoint consumed by BOTH UI and MCP tool, designed for both consumers from day 1 | Tech | P0 | **Decided** | Locked. Cross-cutting C2. Affects V0-4, V0-5. |
| TQ5 | Atomic-rewrite strategy for managed rename: all-docs-in-one-Hocuspocus-transaction vs per-doc-with-journal | Tech | P0 | **Open** | Mike's S3.TQ1 — staff-level decision. Per-doc + journal is operationally simpler; all-in-one is cleaner but conflicts with Hocuspocus per-doc model. **Resolve in V0-5 spec.** |
| TQ6 | Per-origin undo path without character-level Observer A refactor: wire WYSIWYG UndoManager on Y.XmlFragment + leverage y-codemirror's UM + fix observer modal | Tech | P0 | **Decided** | Directed. Miles's audit reframe — character-level refactor reclassified as edge-case improvement (US-3e), not prerequisite. V0-14 ships basic Cmd+Z without it. |
| TQ7 | Onboarding dismissal state storage: TBD between config flag, cache marker, doc-count inference | Tech | P0 | **Open** | From init-and-project-switching TQ4. **Resolve in V0-7 spec.** |
| TQ8 | Server API for initialization status: extend `/api/documents` or new `/api/init-status` | Tech | P0 | **Open** | From init-and-project-switching TQ1. **Resolve in V0-7 spec.** |
| TQ9 | Session state location: `.open-knowledge/state.json` (per-project, version-controlled) for v0; per-user state in OS app data dir is Electron's concern | Tech | P0 | **Decided** | Directed. Andrew's XQ1 split. v0 only handles per-project. Affects V0-7. |
| TQ10 | UI layout for 4 graph panels (V0-11): tabbed region, accordion, right-dock, or subset | Tech | P0 | **Open** | Affects V0-11 scope. Spec decision. |
| TQ11 | Quick switcher fuzzy matching library: fzf.js, fuse.js, or custom | Tech | P2 | **Parked** | V0-10 spec decision. Pure frontend, low risk, defer to spec time. |
| TQ12 | Find/replace coordination across TipTap WYSIWYG and CodeMirror Source modes (single Cmd+F shortcut) | Tech | P0 | **Open** | Affects V0-18. Spec decision: shared overlay or mode-specific? |
| TQ13 | Activity flash divergence: WYSIWYG flashes last/first 3 blocks; Source flashes all lines | Tech | P0 | **Open** | Miles's audit Area C. **Resolve in V0-15 spec** (verify behavior + reconcile divergence). |
| TQ14 | Dynamic port injection point for Electron: where the preload bridge passes the utilityProcess port to the renderer | Tech | P0 | **Decided** | Directed. Andrew's Story 5. Use `window.__OK_WS_URL__` or preload-injected config. ProviderPool already accepts `wsUrl` override. Affects V0-20. |
| TQ15 | CJS build target for `packages/server/`: tsdown or vite build --format cjs, entry standalone.ts | Tech | P0 | **Decided** | Directed. Andrew's Story 5. ESM remains default; CJS added as parallel output. Affects V0-20. |
| XQ1 | Coordination with Mike on V0-3, V0-5, V0-8, V0-12, V0-13 (wiki-links bundle + graph view) | Cross-cutting | P0 | **Open** | Mike is the decision-maker for wiki-links prioritization (PR #72) AND the author of PR #76 (graph view, V0-8). v0-launch absorbs Stories 1 (V0-12), 3 (V0-5), 4 (V0-3), 2 (V0-13 Later) from his bundle + Graph view (V0-8) as in-flight close-out. Mike to confirm scoping reflects his intent. |
| XQ2 | Coordination with Miles's PR #39 for V0-16 (Timeline close-out) | Cross-cutting | P0 | **Open** | Miles owns PR #39 delivery. V0-16 in this project = "close out PR #39 to land." Confirm with Miles that v0-launch including Timeline doesn't conflict with his ownership. |
| XQ3 | Multi-user collaboration semantics on file ops: Alice deletes while Bob edits | Cross-cutting | P0 | **Assumed** | MEDIUM confidence. `standalone.ts:322-368` handles external delete via rescue buffer; rename path may need similar treatment. Verify by Playwright test in V0-4/V0-5 spec. |
| XQ4 | Component composability for future Electron renderer | Cross-cutting | P2 | **Parked** | Components naturally reusable because Electron wraps React unchanged. Guardrail: avoid browser-only APIs (File System Access). |

## Cross-cutting concerns

These thread through multiple stories. Each is a constraint or shared infrastructure, not a story itself.

### CC1: Push-over-awareness pattern (V0-2, V0-3, future panels)
The file watcher emits `DiskEvent` (create/update/delete/rename); the backlink index updates on persistence-store. Both today force consumers to poll because there's no client-facing push channel. Establish the pattern in V0-2 (sidebar): use the existing Hocuspocus awareness channel with a dedicated "system" sub-state, signal-then-fetch (not push-the-data), idempotent under rapid changes. V0-3 (BacklinksPanel) adopts the same pattern — whichever ships first defines the contract; the second consumes it. Future panels (V0-11 graph panels, future tag browser) inherit.

### CC2: Dual UI + MCP surface for file operations (V0-4, V0-5)
Every file operation (delete, move, duplicate, new folder, rename) needs a backend API consumed by BOTH a React UI (sidebar context menu) AND an MCP tool (agent-callable). Backend API is shared; consistent path validation (reuses safe-path utilities), consistent error shapes, consistent response formats. If V0-4 ships UI-only, V0-5 will follow the precedent — and every future file-related agent capability fragments. Owner: V0-4 spec author sets the pattern.

### CC3: Safe path utilities (V0-4, V0-5, V0-6)
`safeSubdir()` and `isSafeDocName()` in `api-extension.ts` prevent path-traversal attacks on the existing `create-page` endpoint. Every new file-op endpoint MUST reuse these primitives, not re-implement. Trust boundary: localhost-only today, but Electron distribution and any future multi-user scenarios require robust validation regardless. Image upload (V0-6) endpoint also passes through these.

### CC4: Provider pool lifecycle on file events (V0-4, V0-5)
`standalone.ts:322-368` already handles delete events from the file watcher (close providers, save rescue buffer for dirty docs, update fileIndex). Rename must be a first-class operation (not delete + create) to avoid data loss during the window between events. V0-5 likely needs to extend the existing delete handler to a unified rename handler that closes the old provider and reopens under the new name with state preserved.

### CC5: Backlink index rewrites on rename and slug migration (V0-5, V0-12)
V0-5 (managed rename) rewrites `[[oldName]]` → `[[newName]]` across affected docs. V0-12 (slug correctness) may also need to rewrite existing vault content if PQ9 lands on option (a) rewrite-on-boot. Same machinery — Mike's S3.XQ2 explicitly notes the reuse opportunity. Decide sequencing in V0-12 spec.

### CC6: Process safety + state.json coordination (V0-1, V0-7)
V0-7 (session persistence) writes per-project `state.json` for last-opened doc. V0-1 (process safety) provides the lock that makes `state.json` writes safe — only the lock-holding process writes state. V0-7 depends on V0-1 lock infrastructure being in place. Sequencing: V0-1 ships first, V0-7 second.

### CC7: content.exclude interactions with new file types (V0-4, V0-6)
V0-4 creates new `.md` files via UI — must be included in document index automatically (already handled by `content.include` default `**/*.md`). V0-6 saves images to `attachments/` — must be EXCLUDED from document index but NOT gitignored. ContentFilter behavior must be verified after both stories ship. Cross-spec: PR #52 (gitignore filtering) established the ContentFilter.

### CC8: Server shutdown ordering (V0-1, prior PR #61)
PR #61 fixed graceful-shutdown data loss in `createServer().destroy()`. V0-1 adds the lock release as the final step (after git flush, session close, watcher stop). Lock release MUST be last — if a second process acquired the lock before git WIP is flushed, index corruption results. The shutdown ordering invariant is now: stop watchers → drain agent sessions → flush L1 → drain L2 → release shadow lock → release server lock.

### CC9: MCP tool enrichment quality bar (all agent-facing tools, Tim owns)

Every agent-facing MCP tool must return **enriched data beyond what native tools provide** — that's the value prop of the MCP server. An agent using ONLY OK's MCP tools (never touching native Read/Grep/Glob/Bash) should get strictly better results than one using native tools alone. Enrichment includes: parsed frontmatter, backlink/forward-link context, git history, catalog pointers, slug-resolved wiki-link targets, modified timestamps, per-doc metadata.

**Verification items for Tim during V0-4 spec:**
- **`list_documents` enrichment audit:** Does it return per-doc metadata (title from frontmatter, backlink count, modified timestamp, catalog category)? If it only returns raw names + sizes, agents must N+1 call `read_document` on each — defeating enrichment. Enhance if needed.
- **V0-4 file-ops tool response shapes:** `delete_document` should report what was deleted (title, orphaned backlinks created). `move_document` should report which backlinks now point to the new path. `duplicate_document` should report the new doc's metadata. Fire-and-forget responses without context waste the agent's next turn on re-discovery.
- **MCP `instructions` field guidance:** Tell agents explicitly "prefer OK MCP tools over native Read/Grep/Glob for all knowledge-base operations — our tools include computed context (backlinks, frontmatter, catalog, git history) that native tools don't."
- **Consistency:** All tools that return document data should use the same enrichment shape (same metadata fields in the same format) so agents build one mental model of "what a document looks like."

**Current state (post PR #74):** `read_document` and `search` are enriched (frontmatter + git history + backlinks + catalog context + snippets). `list_documents` enrichment level needs verification. V0-4's new file-ops tools need response-shape design. Graph tools (`get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs`) return computed data by nature.

**Architecture note:** Enrichment lives in semantic MCP tools (Architecture A from root PROJECT.md XQ1). Under the hood, tools USE bash internally (`bash/index.ts` runs `grep`, `git log`, `cat`) then enrich with computed system data. The agent never calls bash directly through MCP. The just-bash alternative (Architecture B / XQ1) remains an open question for post-v0 — current semantic-tools approach works.

---


---

## Rabbit holes

**RH1: "Let's just add search while we're doing file ops."** Tempting because V0-4 touches the sidebar and search UI lives there too. But search is a separate project with 8 research reports dedicated to it. DO NOT add. Trigger search bet as a separate project once v0 ships.

**RH2: "Let's redesign the sidebar while we're rewriting it real-time (V0-2)."** Sidebar has known UX weaknesses. V0-2 adds the push primitive; temptation is to rebuild the whole sidebar. DO NOT. Schedule a separate sidebar-UX story for later.

**RH3: "Let's unify the keyboard shortcut scheme now."** Real concern but it's a documentation artifact, not a story. V0-10 (Cmd+K) owns first new shortcut as informal owner. Use a living doc to track future additions.

**RH4: "User-facing version history UI is close because shadow repo exists."** Wrong. Shadow repo was designed for attribution journaling (per-writer WIP refs). User-facing history needs redesigned data model — separate spec. V0-16 (Timeline via PR #39) is the narrow scope; richer history UI is post-v0.

**RH5: "We might as well add graph view since we have orphan/hub data."** V0-11 surfaces APIs as panels. Graph view is different (force-directed layout, node/edge rendering, interactive navigation). Separate story; explicitly out of v0 (parity-for-parity's-sake unless it differentiates).

**RH6: "Per-origin undo means we should do the character-level Observer A refactor first."** Per Miles's audit reframe (TQ6) — character-level refactor reclassified as edge-case improvement (US-3e), not prerequisite. Wire WYSIWYG UM + y-codemirror UM + observer modal fix lands US-3a/b/c/d much faster.

**RH7: "Let's design the attachments model to support templates, deduplication, cleanup of orphans."** V0-6 (image paste) per-doc subfolder + timestamp-hash naming is the simple V1. Every additional feature can ship later without breaking the flat-file model. Resist scope creep.

**RH8: "Let's unify all the in-flight PRs into one mega-PR for v0."** Each PR has its own author, review surface, and merge cadence. V0 is a planning artifact, not a delivery artifact — each story ships its own PR.

## Pre-mortem

**Most likely failure mode: Real-time sidebar (V0-2) takes longer than expected.** 5 OQs in spec, no resolved design. If spec drags, V0-4 and V0-5 UX degrade or ship with polling fallback.**Mitigation:** Prioritize V0-2 spec resolution early in the Now phase.

**Second-most likely: V0-4 scope creeps.** Story already includes delete + move + duplicate + new folder + MCP tools for all four. Adding folder-move-with-content variations, undo affordances, or trash blows the appetite. **Mitigation:** Hard scope line at spec — folder ops mirror file ops with no special cases; single confirmation modal for destructive ops; no trash in v0.

**Third: multi-PR coordination breaks.** Five in-flight PRs intersect v0 scope (PR #75 planning master; PR #72 Mike's story bundle; PR #39 Miles's Timeline; PR #76 Mike's graph view; PR #41 Sarah's image paste). If absorption isn't communicated cleanly, work duplicates, conflicts at merge time, or owners receive planning changes as a surprise. **Mitigation:** Walk this PROJECT.md through with Mike (PR #72 + PR #76), Miles (PR #39), Sarah (PR #41), Andrew (desktop-readiness retirement) before any v0 stories enter spec phase. Get explicit acknowledgment that absorption is acceptable.

**Fourth: V0-5 (rename) atomic-rewrite strategy (TQ5) is harder than expected.** Per-doc-with-journal vs all-in-one-transaction is a staff-level decision; whichever picked has crash-recovery edge cases. **Mitigation:** Treat as P0 spec-time decision; budget extra discovery time for V0-5 spec.

**Fifth: V0-12 (slug) migration path (PQ9) requires more rewrite than estimated.** If dogfood vaults have substantial non-ASCII content, option (a) rewrite-on-boot is invasive; option (b) dual-resolve adds complexity. **Mitigation:** Inspect dogfood vaults BEFORE choosing migration approach.

**Sixth: Team capacity wrong.** Plan assumes 3-4 parallel barrels. If team is smaller or barrels saturated by other work, Now phase sequences serially → 12+ weeks. **Mitigation:** User confirmation of team size before committing to phasing. Or split Now into Now-1 + Now-2 with internal sequencing.

**Seventh: Electron suddenly becomes urgent.** V0-20 (desktop build prep) in Later. If Electron implementation kicks off ahead of schedule, V0-20 promotes mid-flight. Acceptable churn.

## Evidence & References

### Evidence Files
- [evidence/current-editor-state.md](evidence/current-editor-state.md) — Feature inventory, infrastructure readiness, what's shipped vs unfinished
- [evidence/competing-decompositions.md](evidence/competing-decompositions.md) — Records the consolidation of 4 prior planning surfaces

### Source Stories (preserved for traceability)
- [stories/init-and-project-switching/STORY.md](../../stories/init-and-project-switching/STORY.md) — Part A → V0-7; Part B stays as standalone sibling bet
- [stories/wiki-links-next/STORY.md](../../stories/wiki-links-next/STORY.md) — Mike's bundle: Story 1 → V0-12, Story 2 → V0-13, Story 3 → V0-5, Story 4 → V0-3
- [stories/collaboration-capabilities-audit/STORY.md](../../stories/collaboration-capabilities-audit/STORY.md) — Miles's audit: Area A → V0-16, Area B → V0-14, Area C → V0-15

### Sibling projects (NOT absorbed — coordinate via cross-reference)
- [projects/server-bridge-hardening/PROJECT.md](../server-bridge-hardening/PROJECT.md) — Narrow wedge (test coverage + unification); waiting on PR #39 merge

### Active PRs in flight (status as of 2026-04-13)
- **PR #75** (Nick, draft) — this PR: story decomposition + v0 master project
- **PR #72** (Nick, draft) — wiki-links-next story bundle prepared for Mike as decision-maker (4 stories absorbed — V0-3, V0-5, V0-12, V0-13; bundle carries source-of-truth detail)
- **PR #39** (Miles, open) — Timeline + Rollback (V0-16 close-out)
- **PR #76** (Mike, open) — Graph view of links (V0-8 close-out)
- **PR #41** (Sarah, open) — Image upload (V0-6 close-out)
- **PR #36** (Andrew, open, 3 days stale) — OpenTelemetry instrumentation spec (out of v0 scope)
- **PR #23** (Nick, open) — Typed component nodes (out of v0 scope)
- **PR #12** (Dima, draft, draft) — Component slash insert (pending review)
- **PR #81** — MERGED 2026-04-13: wiki-link menu flash bug fix

**Merged since v0-launch was written (2026-04-13):** PR #81 (small bug fix, no v0 scope impact).

### Specs referenced
- `specs/2026-04-11-sidebar-realtime-updates/SPEC.md` — V0-2 (5 OQs to resolve)
- `specs/2026-04-10-undo-architecture/SPEC.md` — V0-14 (needs reframe per Miles's audit)
- `specs/2026-04-08-presence-awareness-ux/SPEC.md` — V0-15 (presence baseline)
- `specs/2026-04-11-electron-desktop-app/SPEC.md` — V0-20 gated on this promoting from Draft
- `specs/2026-04-10-wiki-links-backlinks/SPEC.md` + `IMPLEMENTATION_MILESTONES.md` — V0-3, V0-5, V0-12, V0-13 (Mike's stories trace here)

### Research reports
- `reports/onboarding-multiproject-ux/REPORT.md` — V0-7 source research
- `reports/backlinks-typed-links-and-ux-landscape/REPORT.md` — V0-5, V0-12 source research
- `reports/wiki-links-backlinks-architecture/REPORT.md` — V0-5 (rename-propagation problem), V0-12 (link identity), V0-13 (unlinked mentions)
- `reports/web-to-macos-desktop-wrapping-2025/REPORT.md` — V0-20 source research
- `reports/electron-desktop-app-operations-2025/REPORT.md` — V0-20 operational reference
- `reports/CATALOGUE.md` — full reports index

### Upstream Artifacts
- Root `PROJECT.md` (largely Phase 1 stories shipped) — strategic bet this v0 launch executes against
- Root `STORIES.md` — Phase 1 workstreams (marked stale 2026-04-12)
