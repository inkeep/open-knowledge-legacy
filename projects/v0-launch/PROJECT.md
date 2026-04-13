# Project: Open Knowledge v0 Launch

**Last verified:** 2026-04-13
**Traces to:** Consolidates 4 prior planning surfaces (see Provenance)
**Appetite:** Now phase = 6-8 weeks; Next/Later TBD
**Scope discipline:** This document covers UNFINISHED work only. Already-shipped foundations are referenced as substrate, not enumerated as stories.

---

## Strategic context

**Situation.** Open Knowledge's foundational stack is shipping fast — multi-file documents, provider pool, wiki-links + backlinks, file watcher with ContentFilter, shadow repo for attribution, bidirectional observer sync, dark mode, markdown source-text fidelity, graceful shutdown data-loss fix, symlink-safe sync, multi-editor MCP config, enriched read tools. 20+ PRs merged in the 48 hours before this plan was written. The CRDT-collaborative MDX editor with agent co-creation via MCP is real and runnable today.

**Complication.** Despite shipping velocity, the product is not yet "v0 launchable" — it cannot be shown publicly without embarrassing day-0 gaps and silent data-integrity bugs. Three classes of unfinished work block public launch:
1. **Existence-stakes UX** — users cannot delete, rename, move, or duplicate files from the UI; cannot Cmd+Z their own typo (`StarterKit.undoRedo: false`); cannot find a doc by name in a 50+ doc KB; see "No files yet" with no affordance on first run.
2. **Silent data-integrity bugs** — two `open-knowledge start` invocations in the same directory create competing file watchers + git pipelines (lock file missing); renaming a file leaves `[[oldName]]` dangling in every other doc (managed-rename-with-link-rewrite missing); non-ASCII titles are destructively mangled (`[[café]]` → `caf` — slug bug, one-way door if delayed); agent activity flash divergent across WYSIWYG/Source modes with zero test coverage.
3. **Operational visibility gaps** — backend infrastructure for degraded-boot signals (PR #62), version history (shadow repo), and graph navigation (orphans/hubs/forward-links/outline APIs) all shipped without UI consumers. The work is half-done — server is ready, no surface is exposed to users.

The intersection: each of these classes alone is fixable; together they form a "credibility cliff" between shipping foundations and shipping product. Closing all three in one coordinated push gets the editor to a state where it can be demoed, distributed to design partners, and used as the basis for evaluation. Ship them piecemeal and the product remains "impressive demo, embarrassing daily use" indefinitely.

**Resolution.** A single "v0 launch" project that consolidates the four prior planning surfaces (see Provenance), focuses exclusively on unfinished work, and phases into Now (must-have for launch) / Next (should-have to feel complete) / Later (polish + gated). Each story carries its own ownership signal and current PR/spec status so the team can pick up work without re-discovery.

**Multi-dimensional value.**

Customer-facing: end-user writers (P1) and developers using OK as a docs tool (P2) get a tool that doesn't trip them on basic operations. Demos work without scripted workarounds. Returning users land where they left off. Renames don't break things.

Platform: the unfinished work establishes patterns the rest of the product inherits. The push-over-awareness primitive (used in V0-2 sidebar and V0-3 backlinks) is the reusable signaling pattern for every future derived-view UI. The dual UI + MCP surface for file ops (V0-4, V0-5) is the contract every future agent-callable file-level capability adopts. The lock file pattern (V0-1) extends to multi-window Electron without redesign.

GTM: v0 launch is the threshold for showing the product externally — to design partners, to candidates, to potential users. The collaboration audit calls Timeline + Rollback (V0-16) and the file-ops gap "table-stakes for any docs author migrating from Obsidian/Notion." Without them, the product positions as a demo, not a tool.

Internal: closing the silent data-integrity bugs (V0-1 process safety, V0-12 slug correctness, V0-5 managed rename) reduces the "support tax" of shipping a product where users hit corruption silently and we discover it weeks later from dogfood reports.

**Intersection reasoning:** the platform dimension is load-bearing. If file ops ship as UI-only without the dual MCP surface, every future agent-facing file capability fragments. If the push-over-awareness pattern isn't established now (V0-2), every derived-view panel defaults to polling and we end up with five different real-time strategies. The customer outcomes are immediate; the platform patterns make them composable.

**Bet-level non-goals.**
- **[NEVER in v0]** Multi-human concurrent editing across devices. Architecture supports it via Yjs awareness; product is solo + AI for v0. Promote when: cloud sync infrastructure exists.
- **[NEVER in v0]** Cloud SaaS / hosted backend. v0 is local-first. Promote: separate bet entirely.
- **[NEVER in v0]** Plugin/extension marketplace. Custom React components via mdx-components.tsx is the extension model; no separate plugin API. Promote: not foreseen.
- **[NOT NOW]** Full-text search system (Orama/FTS5/pgvector). Standalone bet — 8 research reports completed; 4-6 week system integration. Promote: when Now phase ships and search is the biggest remaining gap.
- **[NOT NOW]** Electron native distribution. Already spec'd separately (`specs/2026-04-11-electron-desktop-app/`). v0 ships in CLI + web form. Promote: when Electron implementation begins (V0-20 desktop build prep is the gating story).
- **[NOT NOW]** Multi-project switching (registry + `openknowledge list`/`open` + in-editor switcher). Cross-project navigation, separate bet. Lives as `stories/init-and-project-switching/` Part B. Promote: when v0 ships and users have multiple projects registered.
- **[NOT NOW]** Tracked changes / inline suggestion mode (Google Docs-style green/red proposals). PROJECT.md PQ11 explicitly parked. Lives in a combined "agent-proposal review experience" design space with branching/draft UX (PQ9). Promote: dedicated design pass for the bundle.
- **[NOT NOW]** Graph view (force-directed link visualization). Different surface from the panels in V0-11 (which surface existing API endpoints). Promote: post-v0 when graph data is rich enough to be useful.
- **[NOT NOW]** Tags / tag browser, custom CSS, keyboard customization, font size adjustment. Parity-for-parity's-sake or low-leverage features.

## Provenance

This project consolidates four prior planning surfaces into a single source of truth:

| Source | Branch | Role | Disposition |
|--------|--------|------|-------------|
| `projects/desktop-readiness/` (Andrew) | `chore/restore-scoped-reports` | Original "ship desktop-ready foundations" decomposition (5 stories) | Stories 1, 2a, 2b, 3, 5 absorbed; dark mode dropped (shipped via PR #60). Source PROJECT.md should be retired when chore branch lands. |
| `projects/day-0-editor-completeness/` (this branch) | `worktree-stories+init-and-project-switching` | "Close day-0 editor gaps" decomposition (7 stories) | All 7 stories absorbed (ED-1 through ED-7). Source directory deleted as part of this consolidation. |
| `stories/wiki-links-next/` (Mike) | `feat/backlinks-landscape-and-stories` | Wiki-link correctness + agent capability bundle (4 stories) | Stories 1, 3, 4 absorbed (slug correctness, managed rename + link rewrite, BacklinksPanel push). Story 2 (suggest_links MCP tool) absorbed as Later (agent capability, not user-blocking). Source bundle remains in Mike's PR #72 as the original framing; v0-launch is authoritative going forward. |
| `stories/collaboration-capabilities-audit/` (Miles) | `feat/backlinks-landscape-and-stories` | Decision brief covering Timeline (Area A), Per-origin Undo (Area B), Presence (Area C), Suggestions (Area D parked) | Areas A, B, C absorbed as V0-16, V0-14, V0-15. Area D stays parked (PQ11). Source brief remains as the deeper rationale + per-area detail. |

**Why one master, not four bets:** the four surfaces have ~40% direct overlap (file rename appears in three of them; real-time sidebar pattern in two; first-run experience in two). Consolidating eliminates duplicate scoping work and gives the team one PROJECT.md to plan against.

**Coordination footprint:** Mike's PR #72 (wiki-links-next) and Miles's PR #39 (Timeline) are in flight. This master should be reviewed alongside both PRs to ensure scoping is reflected back into their work. Andrew's `desktop-readiness` PROJECT.md on `chore/restore-scoped-reports` is unmerged — when that branch lands, the redundant directory should be removed in favor of this master.

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
| XQ1 | Coordination with Mike's PR #72 for V0-5 (rename) and V0-12 (slug) absorption | Cross-cutting | P0 | **Open** | V0-5 absorbs Mike's Story 3 (rename + link rewrite); V0-12 absorbs Mike's Story 1 (slug). Mike to confirm scoping reflects in his PR or accept that v0-launch is authoritative going forward. |
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

---

## Stories — Now (8 stories, 6-8 weeks)

**Phasing rationale:** Risk-first + dependency-first + customer-journey-first. Now contains the things that block any external demo:
- Process safety (V0-1): fixes existing data-corruption bug. Without this, dual-process collision silently corrupts content. **Risk-first.**
- Real-time sidebar (V0-2): prerequisite for file ops UX (delete/rename feel broken with 5s polling staleness). **Dependency-first.**
- File org ops (V0-4): table-stakes for any docs author. Today users can create files but not delete or move them. **Customer-journey-first.**
- Image paste (V0-6): PR #41 in flight, near-shipped. Close-out, not full build. **In-flight close-out.**
- Onboarding (V0-7): day-0 first impression. Empty state currently has no affordance. **Customer-journey-first.**
- Slug correctness (V0-12): one-way door. Every day delayed accumulates more vault content under the broken slug. **Risk-first.**
- Per-origin undo basic (V0-14): users literally cannot Cmd+Z their own typo. Embarrassing day-0 bug. **Customer-journey-first.**
- Timeline close-out (V0-16): PR #39 in flight, blocks server-bridge-hardening project. **In-flight close-out.**

Walking skeleton: a new user runs `npx openknowledge`, sees onboarding (V0-7), creates files (existing) and organizes them (V0-4), can undo their typos (V0-14), pastes screenshots (V0-6), trusts that data isn't silently corrupting (V0-1), sees real-time sidebar updates as the agent writes (V0-2), can recover from mistakes via Timeline (V0-16), and can use non-English titles without losing content (V0-12). That's a credible v0.

---

### V0-1: Server process safety — lock file, hardened shutdown, MCP port auto-discovery

**What to build.** Establish exclusive per-project process ownership. Extend `shadow-lock.ts` PID-based pattern to a server-level lock at `<contentDir>/.open-knowledge/server.lock`. Harden `destroy()` to release the lock as the final step (after git flush, session close, watcher stop). MCP stdio server reads the lock file on startup to discover a running instance's port — eliminates `--port` flag requirement.

**Value.** Customer: fixes a current data-corruption bug (two `open-knowledge start` in same directory = competing file watchers + competing git pipelines writing to `.git/index-wip`). Platform: lock pattern extends directly to Electron multi-window — each window acquires a lock; second window on same project gets "Already open in another window" dialog with zero Electron-specific code. AND zero-config MCP integration (Claude Desktop "just works" without `--port`).

**Constraints.**
- MUST extend `shadow-lock.ts` pattern (PID, hostname, startedAt) — invent nothing new.
- Lock metadata: `{ pid, hostname, port, startedAt }`.
- `destroy()` releases lock LAST, after all other shutdown steps (CC8).
- Stale lock detection: live PID → refuse to start with "Already running on port X"; dead PID → remove and continue.

**Lateral.** V0-7 (session persistence) depends on this — writing `state.json` without process exclusivity is a race condition.

**Forward.** Electron multi-window lock collision dialog reads this lock file. Future cross-machine deployment (if ever) reuses the pattern.

**Source.** Andrew's Story 1 (`projects/desktop-readiness/PROJECT.md`).

**Status / owner signals.** Not started. Andrew authored the original scoping; assignable to him or a server-focused engineer. Estimate: ~1 week. Spec needed.

---

### V0-2: Push-based real-time sidebar updates

**What to build.** Replace the 5-second polling in `FileSidebar.tsx` with server-pushed file events over the existing WebSocket connection. When the file watcher emits a `DiskEvent` (create/update/delete/rename), the server broadcasts a structured event to all connected clients. The sidebar patches its local tree from the event stream rather than re-fetching the full document list. Establishes the push-over-awareness pattern (CC1).

**Value.** Customer: writers see agent-created files appear instantly; file ops (V0-4) ship with usable UX because delete/rename feedback is immediate. Platform: file-watcher-to-client push becomes the reusable primitive for V0-3 (BacklinksPanel push), V0-11 (graph panels), and any future derived-view UI. Without this, every panel defaults to polling and the architecture fragments.

**Constraints.**
- Reuses existing Hocuspocus awareness channel (CC1) — does NOT introduce a new WebSocket endpoint.
- Push payload is small (file path + event kind), not the full document list.
- Polling fallback on awareness disconnect is acceptable (single re-fetch on reconnect).
- Resolves the 5 open questions in `specs/2026-04-11-sidebar-realtime-updates/` SPEC.md (TQ2).

**Lateral.** V0-3 (BacklinksPanel push) shares the architectural primitive — coordinate the contract.

**Forward.** Enables V0-4/V0-5 file op UX, V0-11 graph panels with live updates, future tag browser.

**Source.** ED-1 from day-0-editor-completeness; complementary to draft `specs/2026-04-11-sidebar-realtime-updates/`.

**Status / owner signals.** Spec drafted with 5 OQs unresolved. Not started. Estimate: ~2 weeks (1 week spec resolution + 1 week implementation).

---

### V0-4: File organization operations from the sidebar (delete, move, duplicate, new folder)

**What to build.** Writers can right-click a file in the sidebar and choose Delete, Move, or Duplicate. Writers can create an empty folder via sidebar action or context menu. Agents can call equivalent MCP tools: `delete_document`, `move_document`, `duplicate_document`, `create_folder`. Backend API shared between UI and MCP (CC2). On delete with a dirty doc open in the editor, the existing rescue-buffer mechanism preserves unsaved CRDT state.

**Value.** Customer: writers can clean up and reorganize without leaving the browser — fixes a concrete day-0 embarrassment (users can currently create files they cannot remove from the UI). Platform: dual UI + MCP surface establishes the precedent for every future file-level agent capability (CC2 — load-bearing).

**Constraints.**
- Reuses safe path utilities (CC3) and provider pool cleanup (CC4).
- Real-time sidebar (V0-2) is prerequisite — without it, delete UX is broken (5s stale state, user reclicks, errors).
- Confirmation UX required for destructive operations (no version history → irreversible).
- Folder operations mirror file operations; no special-case folder-move-with-content semantics in v0.

**Lateral.** V0-5 (rename) shares most backend machinery and the dual-surface pattern.

**Forward.** Establishes the dual UI+MCP pattern for future file-level operations (archive, tag, batch ops).

**Source.** ED-2 from day-0-editor-completeness + Andrew's Story 2a (consolidated).

**Status / owner signals.** Not started. PR #40 (open spec) defines MCP write_file conventions — coordinate API shape. PR #53 (open) adds wiki-link context menu — UI pattern reusable. Estimate: 2-3 weeks.

---

### V0-6: Image paste + attachments model

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

**Source.** Andrew's Story 2b. **PR #41 is in flight** with 492 LOC already covering the TipTap plugin, busboy server endpoint, MIME validation, atomic writes — saves to flat `uploads/` (not per-doc).

**Status / owner signals.** **PR #41 open**. Remaining work: design decisions (PQ4, PQ5 — directory naming, gitignore behavior) and adapting PR #41 to current codebase + content.exclude integration. Estimate: 1-2 weeks of close-out, mostly review + refactor of existing PR.

---

### V0-7: First-run onboarding flow + session persistence + starter document

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

**Source.** ED-4 from day-0-editor-completeness (Part A of init-and-project-switching) + Andrew's Story 3 (consolidated). **Story-depth detail in `stories/V0-7-onboarding/STORY.md`.**

**Status / owner signals.** Part A onboarding scoped in detail. Auto-init shipped (PR #57). Starter doc + session persistence not started. Estimate: 2 weeks (1.5 weeks UI + 0.5 week persistence after V0-1).

---

### V0-12: Slug correctness — Unicode-safe + duplicate-heading-anchor disambiguation

**What to build.** Replace `toWikiLinkSlug` in `packages/core/src/utils/slug.ts` (currently `text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')` — destroys non-ASCII) with a Unicode-aware algorithm: NFKD normalize, lowercase, keep `\p{L}\p{N}`, collapse other to `-`, trim. Update `extractHeadings` in `api-extension.ts` to emit consistent `-1`, `-2` suffixes for duplicate headings (today only the client-side `HeadingAnchors` plugin disambiguates). Single source of truth in core.

**Value.** Customer-correctness: any user with non-ASCII content (Latin-accented, CJK, Cyrillic, Arabic, emoji-laden) is hitting a silent destructive bug today. Platform: the slug function is a shared identifier producer used in 4+ contexts (page targets, heading anchors, heading picker, unresolved-link creation) — fixing it once ripples atomically. **GTM (negative):** shipping international users a vault that destructively mangles links on every save is a trust cliff.

**One-way door:** the rewrite cost of fixing this AFTER users accumulate content is linear in vault size. Every day delayed = more migration work.

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

**Source.** Mike's wiki-links-next Story 1 (full SCR + invariants + AC available in `stories/wiki-links-next/STORY.md` Story 1).

**Status / owner signals.** Mike's. Scoped in detail. Migration path open. Estimate: ~1 week + migration testing.

---

### V0-14: Per-origin undo — basic Cmd+Z (without character-level Observer A refactor)

**What to build.** Wire `Y.UndoManager` on `Y.XmlFragment('default')` for WYSIWYG undo. Enable y-codemirror's native UndoManager for `Y.Text('source')`. Fix observer modal architecture (R7 from undo spec) so undo works across mode switches. Keep the existing server-side agent UndoManager (already works for different-line case).

**What this unlocks (per Miles's audit):**
- US-3a Cmd+Z in WYSIWYG ✅
- US-3b Cmd+Z in Source ✅
- US-3c Cross-mode Cmd+Z ✅
- US-3d Interleaved (different lines) ✅
- US-4a/4b/4c agent undo continues working

**Known gap (deferred):** US-3e (same-line simultaneous user+agent edit) requires character-level Observer A refactor. In our batch-rewrite agent pattern (TQ16 LOCKED: agents do file-write or string-replace, both section-level), this is rare. Documented, bounded, reversible when character-level lands.

**Value.** Customer: most fundamental editor operation. Currently a user literally cannot undo their own typo (`StarterKit.configure({ undoRedo: false })` disables native ProseMirror undo, no replacement wired). PROJECT.md S5: "Per-origin undo — Cmd+Z undoes Claude's changes specifically, preserving yours." Today we ship the inverse: you can undo Claude (with a leak) but not yourself.

**Constraints.**
- Reframed path lands US-3a/b/c/d much faster than original "character-level prerequisite" framing suggested (TQ6 in Items table).
- Existing `AgentUndoButton`, server undo endpoints, MCP undo tools STAY (load-bearing for origin guards via `AGENT_WRITE_ORIGIN`).
- Character-level Observer A refactor reclassified as Later improvement (US-3e edge case), not prerequisite.

**Lateral.** Coordinates with V0-16 (Timeline + Rollback) on D5 "rollback + undo origin interaction" — Miles's audit L2 decision.

**Forward.** Character-level Observer A refactor lands later as a correctness improvement; closes US-3e and the R5/R6 leak edge cases.

**Source.** Miles's audit Area B (full reframe in `stories/collaboration-capabilities-audit/STORY.md` §3 Area B). `specs/2026-04-10-undo-architecture/` is the underlying spec but its "blocked on Observer A refactor" framing is superseded.

**Status / owner signals.** Not started under reframed path. Spec exists with old framing (5 interlocking failure modes) — needs spec update. Estimate: 1-2 weeks.

---

### V0-16: Timeline + Rollback (close out PR #39)

**What to build.** Land Miles's PR #39 (`feat/timeline`): server-side `timeline-query.ts`, 4 HTTP endpoints (`/api/history`, `/api/history/:sha`, `/api/diff`, `/api/rollback`), multi-parent checkpoint commits in `saveVersion()`, standalone-mode checkpoints, client-side `TimelinePanel.tsx` (right-side Sheet, 10s polling), `PreviewEditor.tsx` line-level unified diff, restore flow with confirmation.

**What's needed to ship (per Miles's audit):**
- Rebase onto main (touches `api-extension.ts`, `shadow-repo.ts`, `standalone.ts` — all changed in PR #62)
- Address 17 pending review comments (minor: `ok` field consistency, a11y, NaN handling)
- Resolve L1 — diff view approach: **DECIDED 2026-04-13 (Nick) — Source-mode diff view.** Clicking a timeline entry flips editor to Source mode with diff rendering. Library candidate: `@pierre/diffs`. PreviewEditor.tsx likely folds into SourceEditor.tsx as a "diff mode" capability.
- Resolve L2 — rollback + undo origin interaction (small, documentable; coordinates with V0-14)
- Consider folding PreviewEditor.tsx into SourceEditor.tsx per L1 (raise during review)

**What this unlocks (per Miles's audit):**
- US-1a Recent rewind ✅
- US-1b Checkpoint restore ✅
- US-1c External overwrite recovery ("upstream" entries) ✅
- US-2b Per-file diff review ✅
- US-2c Selective revert ⚠️ partial (whole-version restore only)
- US-5f Agent pass summary per file ✅ (via Source-mode diff view)

**Value.** Customer: recovery from mistakes — "I accidentally ruined my doc" becomes "I scroll back and restore." Trust dimension is load-bearing for production use. The Source-mode diff view also serves the "see what the agent did" scenario (US-5f) — which the audit reframed as the actual product value (cursor rendering dropped as skeuomorphic).

**Constraints.**
- Whole-version restore only in v0; selective revert is post-v0.
- Polling vs reactive refresh stays acceptable tech debt for now.

**Non-goals (per audit demoted list).**
- **[NOT NOW]** MCP surface for timeline (additive, add later).
- **[NOT NOW]** Branch-switch refresh (with branching UX parked, becomes hygiene only).
- **[NOT NOW]** Rendered WYSIWYG diff (decided to use Source-mode diff instead).

**Lateral.** Coordinates with V0-14 on rollback-undo origin interaction (L2). Coordinates with V0-17 (persistence indicator) — if Timeline ships first, persistence indicator becomes a badge on the Timeline button.

**Forward.** Selective revert (US-2c) is the first natural extension. Cross-document activity feed (US-2a) — which PR #39 is per-document — is post-v0.

**Source.** Miles's audit Area A (full detail in `stories/collaboration-capabilities-audit/STORY.md` §3 Area A). PR #39 is the in-flight delivery.

**Status / owner signals.** **PR #39 open**, Miles owns delivery. Approved-with-suggestions, 17 pending inline recommendations. Branch diverged from main at `1dd65a0`; needs rebase across PRs #61, #62, #65, #71. Estimate: 1-2 weeks of close-out (rebase + review + L1/L2 decisions), assuming Miles is the executor.

---

## Stories — Next (5 stories)

**Phasing rationale:** Value-first + dependency-resolved. After Now ships:
- V0-5 (rename) becomes possible because V0-4 file ops machinery exists and V0-2 real-time sidebar provides instant feedback.
- V0-11 (graph panels) is highest-ROI remaining — backend already shipped, pure React.
- V0-10 (Cmd+K) becomes valuable as Now-shipped onboarding leads to real usage.
- V0-3 (BacklinksPanel push) adopts V0-2's pattern.
- V0-17 (persistence indicator) UI adopts V0-16's Timeline button if Timeline shipped, otherwise standalone.

---

### V0-5: File rename + atomic backlink rewriting

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

**Source.** ED-3 from day-0-editor-completeness + Mike's wiki-links-next Story 3 (consolidated; full detail in Mike's STORY.md Story 3 — invariants I1-I8, AC1-AC7, items table).

**Status / owner signals.** Not started. Mike's Story 3 has detailed scoping. TQ5 staff-level decision needed (atomic strategy). Estimate: 2-3 weeks.

---

### V0-11: Surface existing graph and outline APIs as editor panels

**What to build.** Four React panels/views consuming already-live server APIs (no new backend work):
- **Document outline** (`GET /api/page-headings`) — H1-H6 tree with click-to-scroll, docked to editor
- **Forward links panel** (`GET /api/forward-links`) — what this doc links to
- **Orphans view** (`GET /api/orphans`) — docs with no inbound or outbound links
- **Hubs view** (`GET /api/hubs`) — most-linked docs

Each is a focused UI consuming an existing, tested endpoint.

**Value.** Customer: writers see the shape of their knowledge graph — where they've written dense clusters (hubs), where they have orphaned thoughts, where a doc links forward — without leaving the editor. **Highest-ROI story in the project** — backend work is done, this is pure React. Makes visible the investment the team has already made (5 API endpoints with no UI consumer). Completes the sense that the editor is "a real knowledge tool."

**Constraints.**
- Reuse existing BacklinksPanel component architecture as the template.
- Outline panel needs click-to-scroll integration with TipTap editor.
- Subscribes to V0-2/V0-3 push channel for live updates if shipped; falls back to refresh-on-demand otherwise.
- Panel layout (TQ10 OPEN): tabbed region, accordion in sidebar, right-dock panels (VS Code style), or select subset for v0.

**Lateral.** Adopts V0-3 push-over-awareness pattern for live updates (CC1).

**Forward.** Establishes "derived-view panel" UI pattern for future graph features (graph view, tag browser if added).

**Source.** ED-6 from day-0-editor-completeness.

**Status / owner signals.** Not started. Backend APIs all exist and are tested (`/api/page-headings`, `/api/forward-links`, `/api/orphans`, `/api/hubs`). Pure frontend work. Estimate: 1-2 weeks.

---

### V0-10: Quick switcher (Cmd+K) and recent files

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

**Source.** ED-5 from day-0-editor-completeness.

**Status / owner signals.** Not started. Pure frontend. Estimate: 1 week.

---

### V0-3: BacklinksPanel push-over-awareness (replace 2s polling)

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

**Source.** Mike's wiki-links-next Story 4 (full detail in Mike's STORY.md Story 4 — invariants I1-I6, AC1-AC5).

**Status / owner signals.** Not started. Mike's. Estimate: 1 week.

---

### V0-17: Persistence failure indicator UI

**What to build.** Subtle status dot in editor header. Green = healthy, red = git pipeline failed. Tooltip on hover explains the failure. Clears when subsequent commit succeeds. Server emits a persistence-status event when `consecutiveGitFailures >= 3` (already tracked in `persistence.ts:99-103`); UI consumes it. **If V0-16 (Timeline) ships first, this becomes a red badge on the Timeline button instead of standalone (PQ11).**

**Value.** Customer: prevents silent-failure scenario — user thinks version history is recording but git plumbing has failed 3+ times unbeknownst to them. Data integrity trust is load-bearing for production use.

**Constraints.**
- Server emits via awareness channel or a dedicated SSE/WS event (spec decision).
- Indicator design: minimal — a dot, not a banner or toast (Andrew's PQ6 lean).
- Recovers automatically on next successful commit.

**Lateral.** Coordinates with V0-16 (Timeline) on visual placement (PQ11).

**Forward.** Foundation for future operational signals (sync status, agent activity status).

**Source.** Andrew's Story 4 persistence indicator portion (dark mode dropped — shipped via PR #60, #63).

**Status / owner signals.** Backend infrastructure shipped (PR #62 — degraded boot signal). UI not started. Estimate: 0.5-1 week.

---

## Stories — Later (4 stories, promote on trigger)

**Phasing rationale:** Polish + gated work. Promote when explicit trigger fires; not on a calendar.

---

### V0-15: Activity flash verification + WYSIWYG/Source reconciliation

**What.** Verify the existing agent-flash implementation works end-to-end in both editor modes. Reconcile Source mode's "flash all lines" behavior with WYSIWYG's "flash last/first 3 blocks" — pick one or document the divergence intentionally. Add Playwright E2E coverage (dogfood via `agent-sim --rapid 5`).

**Value.** Customer: agent activity becomes reliable + consistent. Internal: closes a "implemented but unverified" gap with zero test coverage today.

**Promote when:** v0 Now ships and dogfood reveals the divergence is user-visible OR before public launch (low-effort polish).

**Source.** Miles's audit Area C (reframed). Estimate: 0.5-1 week.

---

### V0-18: Find and replace within document

**What.** Cmd+F find bar; Cmd+Shift+F find-and-replace. Find highlights in document, next/previous navigate matches, replace-one and replace-all modify the document through normal CRDT writes (so agent visibility + undo work correctly).

**Value.** Customer: core editor table-stakes. Without this, users drop to VS Code/sed for bulk in-document edits.

**Promote when:** users report bulk-edit friction OR inline-edit flow becomes a common agent workflow.

**Constraints.** TipTap and CodeMirror have separate search extensions; coordinated Cmd+F across modes (TQ12 OPEN). Must go through CRDT writes (bridge invariant).

**Source.** ED-7a from day-0-editor-completeness. Estimate: 1-2 weeks.

---

### V0-19: Sidebar sort + word count polish bundle

**What.** Sidebar sort toggle (name [default] or modified date descending — fileIndex already has `modified`). Live word count in editor footer (derived from Y.Text). Optional: characters, reading time.

**Value.** Customer: productive-feeling basics; collectively closes "feels unfinished" gap.

**Promote when:** Now+Next ship and qualitative feedback surfaces "feels unfinished" sentiment OR when a larger polish sprint is scheduled.

**Source.** ED-7b from day-0-editor-completeness. Estimate: 0.5-1 week.

---

### V0-13: `suggest_links` MCP tool (unlinked mentions for agents)

**What.** New MCP tool that, given a target page, finds all docs containing the page's title-as-text but no `[[link]]` to it (Roam's "Unlinked References" / Obsidian's unlinked-references panel). Returns list of source docs + snippet context. Lets agents perform the cross-cutting hygiene task of finding and closing unlinked mentions.

**Value.** Internal (agent capability): agents can read backlinks but not find unlinked mentions today. Closes the discovery half of the agent KB workflow. Customer: indirect — better agent assistance with link hygiene.

**Promote when:** v0 ships and agent workflows show evidence that unlinked-mention discovery is a recurring need.

**Constraints.** Depends on V0-12 slug correctness (Unicode bug propagates to false-negatives). Substring algorithm choice (Aho-Corasick vs regex) is implementation detail.

**Source.** Mike's wiki-links-next Story 2 (full detail in Mike's STORY.md Story 2). Estimate: 1 week (after V0-12).

---

### V0-20: Desktop build pipeline prep — dynamic port + CJS build

**What.** Two infrastructure changes for Electron packaging: (1) ensure HocuspocusProvider accepts runtime-injected WebSocket URL instead of reading from `location.host` (current bug: `provider-pool.ts:35` falls back to `'localhost'` without port when loaded via `file://`), (2) add CJS build target for `packages/server/` (Electron's `utilityProcess.fork()` doesn't support ESM entry points).

**Value.** Platform: technically necessary for Electron build. Zero impact on current CLI/web experience.

**Promote when:** Electron packaging spec promotes from Draft (Intake) to Approved AND implementation begins. Currently no signal of imminent Electron work; promote trigger is "first DMG packaging spike" or equivalent.

**Constraints.** ProviderPool already accepts `wsUrl` override (TQ14). CJS build adds parallel output, ESM stays default (TQ15). Inherits PR #54 Track T2's `@parcel/watcher` → `chokidar` fallback.

**Source.** Andrew's Story 5. Estimate: 0.5 week (~2-4 hours each item).

---

## Dependency graph

```
V0-1 (process safety) ─┬─→ V0-7 (state.json needs lock for safe writes)
                       └─→ V0-20 (lock file's port field enables MCP auto-discovery — already in V0-1)

V0-2 (real-time sidebar push) ─┬─→ V0-4 (file ops UX needs instant feedback)
                                ├─→ V0-5 (rename UX same)
                                └─→ V0-11 (panels can subscribe for live updates)

V0-2 ↔ V0-3 (BacklinksPanel push) — CC1 pattern coordinator; first one defines contract

V0-4 (file ops) ─→ V0-5 (rename shares backend machinery + dual-surface pattern)

V0-12 (slug) ─→ V0-13 (suggest_links — Unicode propagation)

V0-12 ↔ V0-5 — possibly share rewrite infrastructure (CC5; PQ9 OPEN)

V0-14 (per-origin undo) ↔ V0-16 (Timeline) — coordinate L2 rollback+undo origin interaction

V0-16 (Timeline) ↔ V0-17 (persistence indicator) — placement decision (PQ11)

V0-7 (onboarding) — independent of all others except V0-1

V0-6 (image paste) — independent of all others (PR #41 close-out)

V0-10 (Cmd+K), V0-11 (panels), V0-15 (flash), V0-18 (find/replace), V0-19 (sort+wc), V0-20 (build prep) — all independent
```

**Critical path:** V0-1 → V0-7 (process safety unblocks session persistence). V0-2 → V0-4 → V0-5 (real-time sidebar unblocks file ops UX, file ops machinery enables rename).

## Distribution table — who picks up what

Owner signals where they exist (in-flight PR author or original story author). When no signal, marked "open assignment."

| Story | Estimate | Owner signal | Delivery vehicle | Status |
|-------|----------|---------------|------------------|--------|
| V0-1 process safety | 1 wk | Andrew (story author) | Spec → impl | Not started, fully scoped |
| V0-2 real-time sidebar | 2 wk | open | Spec resolves 5 OQs → impl | Spec drafted |
| V0-3 BacklinksPanel push | 1 wk | Mike (story author) | Spec → impl | Mike's PR #72 includes story |
| V0-4 file ops bundle | 2-3 wk | open | Spec → impl | Not started |
| V0-5 rename + link rewrite | 2-3 wk | Mike (story author) | Spec → impl | Mike's PR #72 includes story; coordinate absorption |
| V0-6 image paste | 1-2 wk | (PR #41 author) | Close out PR #41 | In flight |
| V0-7 onboarding + session + starter | 2 wk | (this PR) | Spec → impl | Onboarding scoped (Part A); rest not started |
| V0-10 Cmd+K | 1 wk | open | Spec → impl | Not started |
| V0-11 graph panels | 1-2 wk | open | Spec → impl | Backend done, pure React |
| V0-12 slug correctness | 1 wk + migration | Mike (story author) | Spec → impl | Mike's PR #72 includes story |
| V0-13 suggest_links | 1 wk | Mike (story author) | Spec → impl | Mike's PR #72 includes story; Later phase |
| V0-14 per-origin undo basic | 1-2 wk | open | Spec update + impl | Spec needs reframe per Miles's audit |
| V0-15 activity flash verify | 0.5-1 wk | open | Verification + small fix | Existing impl, needs test coverage |
| V0-16 Timeline + Rollback | 1-2 wk close-out | Miles (PR #39 author) | Close out PR #39 | In flight; needs rebase + 17 review comments |
| V0-17 persistence indicator UI | 0.5-1 wk | open | Spec → impl | Backend infra shipped (PR #62) |
| V0-18 find/replace | 1-2 wk | open | Spec → impl | Not started; Later phase |
| V0-19 sort + word count | 0.5-1 wk | open | Spec → impl | Not started; Later phase |
| V0-20 desktop build prep | 0.5 wk | Andrew (story author) | Spec → impl | Gated on Electron starting |

**Sequencing for Now phase (8 stories, 6-8 weeks):**
- Week 1-2: V0-1 (Andrew), V0-2 (open), V0-12 (Mike) start in parallel — process safety + spec resolution + slug fix
- Week 2-4: V0-6 (PR #41 close-out), V0-16 (Miles PR #39 close-out), V0-7 (open) — close out in-flight + start onboarding
- Week 3-5: V0-4 (open) starts after V0-2 contract clear; V0-14 (open) starts in parallel (undo is independent of file ops)
- Week 5-8: ship, integration test, polish

**Parallel barrels:** ~3-4 active barrels at any time given 8 Now stories over 6-8 weeks. Matches inferred team size (7-10 engineers based on recent merge velocity).

## Rabbit holes

**RH1: "Let's just add search while we're doing file ops."** Tempting because V0-4 touches the sidebar and search UI lives there too. But search is a 4-6 week system integration with 8 research reports dedicated to it. DO NOT add. Trigger search bet as a separate project once v0 ships.

**RH2: "Let's redesign the sidebar while we're rewriting it real-time (V0-2)."** Sidebar has known UX weaknesses. V0-2 adds the push primitive; temptation is to rebuild the whole sidebar. DO NOT. Schedule a separate sidebar-UX story for later.

**RH3: "Let's unify the keyboard shortcut scheme now."** Real concern but it's a documentation artifact, not a story. V0-10 (Cmd+K) owns first new shortcut as informal owner. Use a living doc to track future additions.

**RH4: "User-facing version history UI is close because shadow repo exists."** Wrong. Shadow repo was designed for attribution journaling (per-writer WIP refs). User-facing history needs redesigned data model — separate spec. V0-16 (Timeline via PR #39) is the narrow scope; richer history UI is post-v0.

**RH5: "We might as well add graph view since we have orphan/hub data."** V0-11 surfaces APIs as panels. Graph view is different (force-directed layout, node/edge rendering, interactive navigation). Separate story; explicitly out of v0 (parity-for-parity's-sake unless it differentiates).

**RH6: "Per-origin undo means we should do the character-level Observer A refactor first."** Per Miles's audit reframe (TQ6) — character-level refactor reclassified as edge-case improvement (US-3e), not prerequisite. Wire WYSIWYG UM + y-codemirror UM + observer modal fix lands US-3a/b/c/d much faster.

**RH7: "Let's design the attachments model to support templates, deduplication, cleanup of orphans."** V0-6 (image paste) per-doc subfolder + timestamp-hash naming is the simple V1. Every additional feature can ship later without breaking the flat-file model. Resist scope creep.

**RH8: "Let's unify all the in-flight PRs into one mega-PR for v0."** Each PR has its own author, review surface, and merge cadence. V0 is a planning artifact, not a delivery artifact — each story ships its own PR.

## Pre-mortem

**Most likely failure mode: Real-time sidebar (V0-2) takes longer than expected.** 5 OQs in spec, no resolved design. If spec drags, V0-4 and V0-5 UX degrade or ship with polling fallback. **Mitigation:** Budget V0-2 spec resolution as first 1-2 weeks of Now. Escalate if it drags.

**Second-most likely: V0-4 scope creeps.** Story already includes delete + move + duplicate + new folder + MCP tools for all four. Adding folder-move-with-content variations, undo affordances, or trash blows the appetite. **Mitigation:** Hard scope line at spec — folder ops mirror file ops with no special cases; single confirmation modal for destructive ops; no trash in v0.

**Third: PR #75 / Mike's PR #72 / Miles's PR #39 coordination breaks.** Three in-flight PRs from different authors all overlap with v0 scope. If absorbing into v0 isn't communicated cleanly, work duplicates or conflicts at merge time. **Mitigation:** Walk this PROJECT.md through with Mike, Miles, Andrew before any v0 stories enter spec phase. Get explicit acknowledgment that absorption is acceptable.

**Fourth: V0-5 (rename) atomic-rewrite strategy (TQ5) is harder than expected.** Per-doc-with-journal vs all-in-one-transaction is a staff-level decision; whichever picked has crash-recovery edge cases. **Mitigation:** Treat as P0 spec-time decision; budget extra discovery time for V0-5 spec.

**Fifth: V0-12 (slug) migration path (PQ9) requires more rewrite than estimated.** If dogfood vaults have substantial non-ASCII content, option (a) rewrite-on-boot is invasive; option (b) dual-resolve adds complexity. **Mitigation:** Inspect dogfood vaults BEFORE choosing migration approach.

**Sixth: Team capacity wrong.** Plan assumes 3-4 parallel barrels. If team is smaller or barrels saturated by other work, Now phase sequences serially → 12+ weeks. **Mitigation:** User confirmation of team size before committing to phasing. Or split Now into Now-1 + Now-2 with internal sequencing.

**Seventh: Electron suddenly becomes urgent.** V0-20 (desktop build prep) in Later. If Electron implementation kicks off ahead of schedule, V0-20 promotes mid-flight. Acceptable churn — the work is small (~2-4 hours per item).

## Evidence & References

### Evidence Files
- [evidence/current-editor-state.md](evidence/current-editor-state.md) — Feature inventory, infrastructure readiness, what's shipped vs unfinished
- [evidence/competing-decompositions.md](evidence/competing-decompositions.md) — Records the consolidation of 4 prior planning surfaces

### Source Stories (preserved for traceability)
- [stories/init-and-project-switching/STORY.md](../../stories/init-and-project-switching/STORY.md) — Part A → V0-7; Part B stays as standalone sibling bet
- [stories/wiki-links-next/STORY.md](../../stories/wiki-links-next/STORY.md) — Mike's bundle: Story 1 → V0-12, Story 2 → V0-13, Story 3 → V0-5, Story 4 → V0-3
- [stories/collaboration-capabilities-audit/STORY.md](../../stories/collaboration-capabilities-audit/STORY.md) — Miles's audit: Area A → V0-16, Area B → V0-14, Area C → V0-15

### Source Projects (superseded)
- `projects/desktop-readiness/PROJECT.md` (on `chore/restore-scoped-reports`) — Andrew's 5-story decomposition; absorbed into v0-launch
- `projects/day-0-editor-completeness/PROJECT.md` (this branch) — 7-story decomposition; absorbed into v0-launch (directory will be deleted)

### Sibling projects (NOT absorbed — coordinate via cross-reference)
- [projects/server-bridge-hardening/PROJECT.md](../server-bridge-hardening/PROJECT.md) — Narrow wedge (test coverage + unification); waiting on PR #39 merge

### Active PRs in flight (status as of 2026-04-13)
- **PR #75** (this PR) — story decomposition + v0 master project
- **PR #72** (Mike, draft) — wiki-links-next bundle (4 stories absorbed; Mike's PR carries source-of-truth scoping)
- **PR #39** (Miles, open) — Timeline + Rollback (V0-16 close-out)
- **PR #41** (open) — Image upload (V0-6 close-out)
- **PR #76** (open) — Graph view of links — out of v0 scope, may inform post-v0
- **PR #81** (open) — wiki-link menu flash bug fix
- **PR #36** (open, 3 days stale) — OpenTelemetry instrumentation spec (out of v0 scope)
- **PR #23** (open) — Typed component nodes (out of v0 scope)
- **PR #12** (draft, 4 days stale) — Component slash insert (status unclear; needs triage)

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
