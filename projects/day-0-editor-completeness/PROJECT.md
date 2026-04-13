# Project: Close day-0 editor gaps for knowledge-tool parity

**Last verified:** 2026-04-12
**Traces to:** Gap analysis against Obsidian/Notion expectations (47 features audited, 30 missing) + conversation session 2026-04-12
**Appetite:** Now phase = 6 weeks (appetite-first); Next/Later appetite TBD

## Strategic context

**Situation.** Open-knowledge is a CRDT-collaborative markdown editor (TipTap + CodeMirror + Hocuspocus) positioned against Obsidian/Notion for documentation authors writing MDX with AI assistance. The core architecture is mature: multi-document support shipped, provider pool established, file watcher with `ContentFilter` detects all matching markdown at startup, backlink index populated, shadow repo committing WIP refs per writer, slash commands working. Twelve day-0 features exist: file creation, sidebar tree, slash commands, backlinks panel, presence, theme toggle, agent undo/redo, wiki links, inline formatting, mode toggle, keyboard collapse, folder expand/collapse. (evidence/current-editor-state.md)

**Complication.** The gap analysis against Obsidian/Notion revealed that 30 of 47 day-0 features are missing, but the gaps don't cluster evenly — they fall into distinct infrastructure categories with very different costs. Some are "pure UI wiring" where the server API is live and tested (forward links, orphans, hubs, page-headings, `save-version` — 6 API endpoints with no UI consumer). Others need new server endpoints but on existing infrastructure (delete/rename/move — the `ContentFilter`, safe path utilities, and provider pool cleanup already exist). Others need entire new systems (full-text search with Orama/FTS5/pgvector; user-facing version history rethinking the shadow repo's attribution journal into user-versioned timeline). Without a phased framing, "day-0 completeness" reads as 30 features worth 6 months of work — which, for a team whose spec velocity suggests ~3-5 engineers, is a forcing function for bad prioritization.

The intersection: **existence-stakes features** (file management, real-time sidebar updates) are blocking users TODAY, while **parity-for-parity's-sake features** (graph view, custom CSS, keyboard customization) are not. The product's differentiation is CRDT + agents + local-first — not Obsidian parity. A focused project on existence-stakes gets a usable product into users' hands in 6 weeks; chasing all 30 features is a 6-month distraction that delays validating the core thesis.

**Resolution.** This project targets the **existence-stakes** subset: operations a writer expects in their first session and a growing knowledge base needs to stay navigable. Search, user-facing version history UI, Electron-specific features, and multi-project switching are carved out as separate bets. Within scope: file ops (delete/rename/move with UI and MCP tool surfaces), real-time sidebar (blocks file ops UX), surface existing graph APIs (orphans/hubs/forward-links/outline panels), onboarding (Part A of init-and-project-switching), navigation (Cmd+K quick switcher, recents), and editor polish (word count, find/replace, sort sidebar).

**Primary beneficiary:** End-user writer (P1 from Electron spec — documentation authors writing MDX with AI assistance). AI agents are a **shared-surface consumer** — they access file ops through MCP tools that share backend APIs with the UI. UI-only features (outline, recents, quick switcher) serve humans only. (evidence/current-editor-state.md)

**Multi-dimensional value of the overall bet:**

Customer-facing: writers who open the editor don't hit walls — they can organize, navigate, and find content without abandoning to terminal or filesystem. Platform: every file-op endpoint built with a dual UI + MCP surface establishes a pattern that future agent-facing tooling inherits. Internal: the real-time sidebar infrastructure (file watcher → WebSocket push) becomes the reusable push primitive for future derived-view UIs. GTM: the "usable knowledge tool" milestone is the gate to broader user demos, evaluations, and positioning against Obsidian/Notion.

Intersection reasoning: the **platform dimension is load-bearing**. If file ops ship as UI-only, every future agent-facing capability reinvents the contract. Doing them as dual-surface (UI + MCP tool) now locks in the precedent — later MCP tool work adopts the pattern rather than forking it. This is a reversible-but-sticky decision.

**What we're NOT doing (bet-level non-goals):**
- **[NOT NOW] Full-text search.** Standalone bet. 8 research reports already completed (Orama vs FTS5+sqlite-vec vs PGlite+pgvector). Needs its own spec + ~4-6 weeks to integrate a search engine. Revisit when: this project's Now phase ships and search becomes the biggest remaining gap.
- **[NOT NOW] User-facing version history UI.** Shadow repo exists but was designed for attribution journaling, not user versions. Data model + UX are a separate spec. Revisit when: users demand it (evidence, not speculation).
- **[NOT NOW] Electron-specific features.** Native menus, Dock integration, folder picker via `dialog.showOpenDialog`. Covered in `specs/2026-04-11-electron-desktop-app/SPEC.md` — separate project. Electron wraps the React components built here without modification. Revisit when: Electron spec promotes from Draft to Approved.
- **[NOT NOW] Multi-project switching (`stories/init-and-project-switching` Part B).** Cross-project concern, not within-project completeness. Stays in its own story as sibling work. Revisit when: this project's Now ships and users have multiple projects registered.
- **[NEVER in this project] Graph view, tags, custom CSS, keyboard customization, import from Obsidian/Notion, comments/annotations.** Parity-for-parity's-sake or advanced features that don't move existence-stakes. Some may become separate bets.

## Items

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| PQ1 | Primary beneficiary: end-user writer with AI agent as shared-surface consumer | Product | P0 | **Decided** | Locked. Electron spec P1 explicit (2026-04-11). File ops, search, and content-query features ship with dual UI + MCP tool surface. UI-only features (outline, recents, quick switcher) serve humans only. (evidence/current-editor-state.md, specs/2026-04-11-electron-desktop-app/SPEC.md) |
| PQ2 | Existence-stakes scope (file ops + navigation + surface existing APIs + onboarding + polish), not parity | Product | P0 | **Decided** | Directed. Obsidian parity is not the strategic goal; differentiation is CRDT + agents + local-first. Parity features (graph, tags, custom CSS, keyboard customization) excluded unless they enable differentiation. |
| PQ3 | Full-text search carved out as separate bet | Product | P0 | **Decided** | Locked. 8 research reports exist (Orama/FTS5/pgvector evaluation). Search is a 4-6 week system integration, not a story. Own spec, own project. |
| PQ4 | User-facing version history UI carved out as separate bet | Product | P0 | **Decided** | Locked. Shadow repo designed for attribution journaling, not user versions. Data model + UX are separate spec work. Infrastructure stays; UI deferred. |
| PQ5 | Multi-project switching stays in `stories/init-and-project-switching/` Part B as sibling bet | Product | P0 | **Decided** | Locked. Cross-project concern, not within-project completeness. Part A (onboarding) folds into this project; Part B remains independent. |
| PQ6 | Electron wraps React components unchanged; no special coordination needed | Product | P0 | **Decided** | Locked. Electron spec G5 + architecture confirms React app is the renderer. Avoid browser-only APIs (File System Access) but otherwise build for web editor; Electron inherits. |
| TQ1 | Real-time sidebar is a prerequisite for file ops UX (delete/rename need instant sidebar feedback) | Tech | P0 | **Assumed** | Confidence: HIGH. Without real-time updates, delete shows 5s stale state — user reclicks the deleted file, errors. Verify by: prototyping delete with polling first; measure UX pain. (specs/2026-04-11-sidebar-realtime-updates/SPEC.md). Note: story IDs in this project use **ED-** prefix (ED-1 through ED-7) to avoid collision with root PROJECT.md's S1-S10. |
| TQ2 | Team capacity: 3-5 engineers, 1-2 barrels for Now phase | Tech | P0 | **Assumed** | Confidence: MEDIUM. Inferred from spec velocity (multiple specs/day 2026-04-07 through 2026-04-11). If team is actually 10 engineers, Now phase scales to 4-5 parallel stories. Verify by: user confirmation. |
| TQ3 | File ops need dual UI + MCP tool surface; MCP tool parity is part of "done" | Tech | P0 | **Decided** | Directed. Every file op endpoint becomes both a sidebar context menu action AND an MCP tool. Backend API is shared. Design API for both consumers from day 1. |
| XQ1 | Onboarding story (init-and-project-switching Part A) folds into this project's Now phase | Cross-cutting | P0 | **Decided** | Directed. Part A is day-0 editor completeness for new users. Ongoing draft PR #75 should be scoped down to Part A only, or Part B extracted to a separate story. Communication with existing PR author needed. |
| XQ2 | Component composability for Electron reuse | Cross-cutting | P2 | **Parked** | Components naturally reusable because Electron wraps React. Only guardrail: avoid browser-only APIs. Revisit when: Electron spec promotes from Draft. |
| TQ4 | Keyboard shortcut scheme coherence across stories | Tech | P0 | **Open** | ED-1 uses Ctrl+\, ED-5 adds Cmd+K, ED-7a adds Cmd+F. Future: Cmd+N (new doc), Cmd+S (save). Need a unified scheme documented before shortcuts collide. Spec-level concern, but the project should establish ownership — probably ED-5 (quick switcher) owns as the first new-shortcut story. |
| PQ7 | Explicit "new folder" operation bundled into ED-2 | Product | P0 | **Decided** | Directed. Folders are currently implicit (auto-created from nested paths). ED-2 scope expands to include "new empty folder" as a bundled file op. Shares safe path utilities and dual UI+MCP surface pattern. |
| PQ8 | Duplicate/copy file bundled into ED-2 | Product | P0 | **Decided** | Directed. ED-2 scope expands to include duplicate-file. Same UI and MCP tool pattern as delete/move/rename. Use case: template duplication, draft forking. |
| TQ5 | UI layout for 4 additional panels in ED-6 | Tech | P0 | **Open** | Current layout: sidebar + main editor + backlinks panel. ED-6 adds outline + forward links + orphans + hubs. Options: (a) tabbed panel region, (b) accordion in sidebar, (c) right-dock panels (VS Code style), (d) select subset for day-0 and defer others. Spec decision during ED-6, but affects ED-6 scope. |
| XQ3 | File ops semantics under multi-user CRDT collaboration | Cross-cutting | P0 | **Assumed** | Alice deletes a doc while Bob is editing it → what happens? The CRDT model has content conflict resolution but not file-existence conflict resolution. Current `standalone.ts:322-368` handles external deletes with rescue buffers, so the infrastructure exists. Confidence: MEDIUM that rescue-buffer path covers this. Verify by: Playwright test with two clients, one deletes, one edits. Affects ED-2 and ED-3. |

## Cross-cutting concerns

**C1: Real-time sidebar push (prerequisite infrastructure).** The file watcher emits `DiskEvent` (create/delete/rename/update) but currently broadcasts nothing to connected clients. The sidebar polls `/api/documents` every 5 seconds. Delete and rename file operations are blocked on this — without instant sidebar updates, delete creates a 5-second window where the user sees a stale entry, reclicks it, and hits a "not found" error. Draft spec exists (`specs/2026-04-11-sidebar-realtime-updates/`) with 6 open questions unresolved. This project must resolve the spec's open questions AND implement the push mechanism before file ops can ship a usable UX. Owner: the file-ops story owner, with spec resolution as a pre-req.

**C2: Dual UI + MCP surface for file ops.** Every file operation (delete, rename, move) needs a backend API consumed by BOTH a React UI (sidebar context menu) AND an MCP tool (agent-callable). The backend API must be designed for both consumers from day 1 — consistent path validation, consistent error shapes, consistent response formats. This is cross-cutting because it applies to all three file ops stories. If one story ships UI-only, the others will feel pressure to follow, fragmenting the agent capability. Owner: the first file-ops story owner sets the pattern; subsequent stories adopt.

**C3: Safe path utilities (security boundary).** `safeSubdir()` and `isSafeDocName()` in `api-extension.ts` prevent path traversal attacks on create-page. Every new file op endpoint MUST reuse these primitives, not re-implement. Delete, rename, move, and folder operations all touch filesystem paths sourced from HTTP — same threat surface. Trust boundary: the web editor is localhost-only today, but Electron distribution and future multi-user scenarios require robust validation regardless.

**C4: Provider pool lifecycle on external file changes.** When a file is deleted or renamed externally (e.g., by an agent via MCP tool, or by the user via CLI), the Hocuspocus server must close open providers, save rescue buffers for dirty docs, and update the fileIndex. `standalone.ts:322-368` already handles delete events from the file watcher — but does not yet handle rename (which is a delete + create in watcher terms). Rename must be a first-class operation to avoid data loss during the window between delete and create. Owner: whoever builds the rename endpoint.

**C5: Backlink index rewrites on rename.** The `managed-rename-inbound-rewrite` story covers rewriting `[[wiki-links]]` in all source documents when a target is renamed. This is half of the rename feature; the other half is the fs rename + provider pool cleanup. This project's rename story must coordinate with or absorb the managed-rename-inbound-rewrite story. Decide early: are they one story or two?

## Stories

### Outcomes enumerated (Phase 1 quality gate)

Each outcome names a beneficiary and an observable change. Stories decompose from these in Phase 2.

1. **Writers can organize their knowledge base from the editor.** Observable: a writer right-clicks a file in the sidebar and sees delete/rename/move actions; agents can call equivalent MCP tools. Files, folders, and nested paths all supported.

2. **Writers see file state update in real-time as the filesystem changes.** Observable: an agent creates a file via MCP tool; the sidebar shows it within 500ms. A file is deleted externally (CLI, git pull); the sidebar removes it within 500ms. No polling-induced staleness.

3. **Writers go from "opened the editor" to "editing my first article" without leaving the browser.** Observable: a new user in an empty directory sees a welcome screen with a "Create your first article" action. A new user in a directory with existing `.md` files sees a confirmation of what was detected and lands in the sidebar populated.

4. **Writers navigate a growing knowledge base by direct jump, not by scrolling.** Observable: a writer presses Cmd+K, types a few characters, selects a file from fuzzy-matched results, and lands in that doc. A writer sees recently-opened files without retracing their path.

5. **Writers see the structure and relationships of their content.** Observable: the sidebar surfaces forward links (what this doc links to), orphan pages (unlinked docs), and hub pages (most-linked docs). The editor shows a document outline (H1-H6 headings) with click-to-scroll.

6. **Writers have productive-feeling editor basics.** Observable: word count visible on the current doc. Find/replace within a doc works. Sidebar sortable by name or modified time.

*Stories below are listed in decomposition order. Phasing into Now/Next/Later in Phase 3.*

### ED-1: Push-based real-time sidebar updates

Replace the 5-second polling in `FileSidebar.tsx` with server-pushed file events over the existing WebSocket connection. When the file watcher emits a `DiskEvent` (create/update/delete/rename), the server broadcasts a structured event to all connected clients. The sidebar patches its local tree from the event stream rather than re-fetching the full document list.

**Value:** Writers see agent-created files appear instantly (customer) AND file operations built in subsequent stories can ship with usable UX because delete/rename feedback is immediate (platform — unblocks ED-2 and ED-3). The file-watcher-to-client push mechanism becomes the reusable primitive for future derived-view UIs (orphan/hubs panels, tag browser, future graph view) — this is the load-bearing platform dimension. Without it, every derived view defaults to polling and the architecture fragments.

**Constraints:** Reuses existing Hocuspocus awareness channel or adds a dedicated event channel (open question resolved during spec, see `specs/2026-04-11-sidebar-realtime-updates/` open questions). Must not introduce new WebSocket endpoints (would double transport surface). Push payload must be small (file path + event kind), not the full document list — large KBs must not flood the channel. Polling fallback on WebSocket disconnect is acceptable (single re-fetch on reconnect).

**Lateral:** `stories/backlinks-push-over-awareness/STORY.md` uses the same awareness-based push pattern for backlinks — this story sets the precedent for both. The two stories should share the signaling primitive; whichever ships first defines the contract.

**Forward:** Enables ED-2 (delete+move UX), ED-3 (rename UX), ED-6 (graph panels if they need live updates), and any future derived-view UI.

---

### ED-2: File organization operations from the sidebar (delete, move, duplicate, new folder)

Writers can right-click a file in the sidebar and choose Delete, Move, or Duplicate. Writers can create an empty folder via sidebar action or context menu. Agents can call equivalent MCP tools: `delete_document(path)`, `move_document(source, destination)`, `duplicate_document(source, destination)`, `create_folder(path)`. Backend API shared between UI and MCP. On delete with a dirty doc open in the editor, the existing rescue-buffer mechanism preserves unsaved CRDT state. Folder deletion and folder move follow the same pattern as file operations.

**Value:** Writers can clean up and reorganize without leaving the browser (customer) AND the dual-surface UI + MCP tool pattern establishes how every future file-level agent capability should be built (platform — load-bearing). If delete ships as UI-only, every subsequent MCP tool maintainer re-derives the shared-API pattern. Internal: fixes a concrete day-0 embarrassment — users can currently create files they can never remove from the UI.

**Constraints:** Reuses `safeSubdir()` and `isSafeDocName()` from `api-extension.ts` (C3). Coordinates with provider pool cleanup (C4) — the `standalone.ts:322-368` deletion path handles external delete events; this story exposes the operation via HTTP and adds UI entry points. Real-time sidebar (ED-1) is a prerequisite — without instant feedback, delete UX is broken. Confirmation UX required for destructive operations (irreversible without version history).

**Lateral:** ED-3 (rename) shares most of the backend machinery — same safe path utilities, same provider pool coordination, same dual-surface pattern. Whichever ships first sets the API shape.

**Forward:** Establishes the dual UI+MCP surface pattern for future file-level operations (duplicate, archive, tag).

---

### ED-3: File rename from the sidebar with backlink rewriting

Writers can inline-rename a file in the sidebar; backlinks in other documents update atomically. Agents can call an MCP `rename_document(source, destination)` tool. The rename operation is `fs.renameSync` + provider pool reopen + `managed-rename-inbound-rewrite` for `[[wiki-links]]`. The rename is a single atomic operation from the user's perspective — no window where stale backlinks point to a non-existent file.

**Value:** Writers can fix typos and reorganize by semantic meaning (customer) AND the editor maintains link integrity automatically — a differentiation feature vs. plain-filesystem workflows (customer + platform). Without backlink rewriting, every rename creates broken `[[links]]` that the user must manually fix; with it, the editor demonstrates "understands your knowledge graph" as a positioning point. Internal: completes the half-finished `managed-rename-inbound-rewrite` story by providing the user-facing trigger.

**Constraints:** Absorbs or closely coordinates with `stories/managed-rename-inbound-rewrite/STORY.md` — decide during spec whether to merge or keep as dependency. Real-time sidebar (ED-1) is prerequisite (inline rename UX needs instant feedback). Must handle the rename-across-directories case (a rename with a path change = move + rename). URL/hash routing must update if the renamed file is currently open. Case-only renames on case-insensitive filesystems (macOS default) need special handling.

**Lateral:** Shares backend machinery with ED-2 (delete+move). Shares backlink rewriting with `managed-rename-inbound-rewrite` — this story is the visible half; that story is the graph-maintenance half.

**Forward:** Rename-with-link-integrity is the pattern for future operations that affect the knowledge graph (merging duplicate docs, splitting a long doc into multiple files).

---

### ED-4: First-run onboarding flow in the web editor

New writers opening the editor for the first time (or with an empty content directory) see a welcome screen with a "Create your first article" action. Writers with existing markdown files see a confirmation of what the watcher detected ("Found 50 files in `docs/`") and an option to adjust content scope. Returning writers see the file sidebar directly — no onboarding overlay. This is **Part A of the existing `stories/init-and-project-switching/` draft PR** (#75), carried forward into this project.

**Value:** New writers land in a productive state without terminal context-switching (customer) AND the onboarding components (welcome, content-scope confirmation, first-document creation) become the building blocks the Electron Project Navigator composes when the desktop app ships (platform — load-bearing for Electron reuse). Internal: eliminates the 3-step "run npx → open browser → create file manually" onboarding tax that currently blocks demos and evaluations.

**Constraints:** Server must be running before onboarding (C-A1 in source story) — CLI still owns server startup. Content detection reuses the existing `ContentFilter` pipeline — no separate file walking. Config changes must persist to `.open-knowledge/config.yml`. Onboarding components are React components the Electron renderer can wrap. The source story's full invariants and ACs carry forward.

**Lateral:** `stories/init-and-project-switching/` Part B (project registry + switching) stays as sibling work — that's cross-project navigation, not within-project completeness. PR #75 needs to be scoped down or split.

**Forward:** Electron Project Navigator composes these components. `stories/init-and-project-switching/` Part B uses the same registry mechanism if built later.

---

### ED-5: Quick switcher (Cmd+K) and recent files

Writers press Cmd+K (Cmd+P on some conventions) and get a fuzzy-matched command palette listing all documents. Selecting a result opens that document. A "Recently opened" section appears at the top of the palette, tracked client-side. No server-side search index needed — the fileIndex already in memory on the client is enough for fuzzy matching at expected KB sizes (<5000 docs).

**Value:** Writers with growing KBs (>50 docs) can jump directly to any file without scrolling the sidebar tree (customer — critical for scale) AND validates that search-like features don't require a full-text search engine when the problem is document finding, not content finding (platform — distinguishes navigation from search, clarifying the eventual search bet's scope). Internal: muscle memory for Obsidian and VS Code users lands intact.

**Constraints:** Pure frontend — no server changes required. Fuzzy matching uses a client library (fzf.js or similar, ~5KB). Recents stored in localStorage (no server-side tracking). Must handle large fileIndex (thousands of docs) with responsive typing (<100ms match time). Keyboard navigation is primary interaction (arrow keys, enter, escape).

**Lateral:** When full-text search ships as a separate bet, the Cmd+K UI becomes the natural entry point — search results join the palette alongside file matches. This story builds the UI; the search bet adds the content-match backend later.

**Forward:** Natural home for future command-palette commands (create doc, insert template, switch theme).

---

### ED-6: Surface existing graph and outline APIs as editor panels

Add four React panels/views that consume already-live server APIs:
- **Document outline** (from `GET /api/page-headings`) — H1-H6 tree with click-to-scroll, docked to editor
- **Forward links panel** (from `GET /api/forward-links`) — what this doc links to
- **Orphans view** (from `GET /api/orphans`) — docs with no inbound or outbound links
- **Hubs view** (from `GET /api/hubs`) — most-linked docs

Each is a focused UI consuming an existing, tested endpoint. No new backend work.

**Value:** Writers see the shape of their knowledge graph — where they've written dense clusters (hubs), where they have orphaned thoughts, where a doc links forward — without leaving the editor (customer). Makes visible investment the team has already made (6 API endpoints with no UI). Internal: highest-ROI story in the project — backend work is done, this is pure React. Completes the sense that the editor is "a real knowledge tool" because the graph primitives are surfaced.

**Constraints:** Reuse the existing BacklinksPanel component architecture as the template for new panels. Outline panel needs click-to-scroll integration with the TipTap editor (scrollIntoView on heading click). If real-time sidebar (ED-1) has shipped, panels can subscribe to the same push channel for live updates; if not, they poll or refresh-on-demand. Panel layout needs a home — the current EditorArea has sidebar + main + backlinks; adding 4 more panels needs thoughtful surface area.

**Lateral:** Shares real-time update mechanism with ED-1. Shares the backlinks panel's push-over-awareness pattern (`stories/backlinks-push-over-awareness/`).

**Forward:** Establishes the "derived-view panel" UI pattern for future graph features (graph view, tag browser).

---

### ED-7a: Find and replace within a document

Writers press Cmd+F to open a find bar in the editor; Cmd+Shift+F or Cmd+Opt+F opens find-and-replace. Finds highlight in the document, next/previous navigate between matches, replace-one and replace-all modify the document through normal CRDT writes (so agent visibility and undo work correctly).

**Value:** Writers can correct systematic errors or rename inline references without leaving the editor (customer — core editor table-stakes). Without this, users drop to external tools (VS Code, sed) for bulk in-document edits, breaking the "work stays in the editor" premise. Platform: establishes how keyboard-driven editor overlays work for future features (command palette expansion, find-across-all-files).

**Constraints:** TipTap has `@tiptap/extension-search-and-replace` for the WYSIWYG editor; CodeMirror has its own search extensions for the source mode. Both must be coordinated so that the same Cmd+F keybinding works in both editor modes. Must handle the bridge invariant — replace must go through CRDT writes, not direct DOM manipulation, or Observer A and Observer B fall out of sync (see `CLAUDE.md` STOP rules).

**Lateral:** Agent find+replace exists as `POST /api/agent-patch` (MCP-surface). The user-facing find/replace should share the same underlying write pattern when possible (consistent behavior between human and agent edits).

**Forward:** Regex support and case sensitivity are natural extensions. Find-across-all-files is a separate story (touches search scope, not just editor).

---

### ED-7b: Sidebar sort + word count polish bundle

Two small features shipped together because neither is large enough to justify its own story:
- **Sidebar sort toggle** — dropdown in sidebar header: sort by name (default, current behavior) or modified date (descending). The fileIndex already has `modified` timestamps.
- **Word count in editor footer** — live word count for the current doc, derived from the Y.Text content. Optional: characters, reading time estimate.

**Value:** Writers see productive-feeling basics — the editor respects conventions they expect (customer). Each individual feature is small but collectively they close the "feels unfinished" gap. Internal: low-risk, high-visibility wins that demonstrate progress and polish.

**Constraints:** Sort stable (no flicker on re-sort). Word count must not trigger layout shifts on every keystroke (debounce or CSS containment). Both features need to work with the real-time sidebar (ED-1) — sort re-applies on every event.

**Lateral:** None significant.

**Forward:** Sort criteria can extend to "recently modified" (day-1+ addition). Word count extension points: reading time, per-section counts.

### Now (6 weeks, 2-3 parallel barrels, "not broken" thin slice)

**Phasing rationale:** Dependency-first (ED-1 unblocks ED-2/ED-3 UX), risk-first (ED-1 resolves the biggest pre-existing spec uncertainty — the draft sidebar-realtime spec's 6 open questions), and customer-journey-first (onboarding → file ops → real-time sidebar is the minimum thin slice that a new user can complete without feeling stuck). At ~3-5 engineers with 1-2 barrels, Now holds 2-3 parallel stories. Each of these stories stands alone as value delivered if Next/Later never happened — a user who can onboard, create, delete, move, rename, and see the sidebar update is using a credible knowledge tool.

- **ED-1: Push-based real-time sidebar updates** — prerequisite infrastructure, resolves the biggest spec uncertainty
- **ED-2: File organization operations (delete, move, duplicate, new folder)** — the largest file-ops gap, day-0 blocker, establishes dual UI+MCP surface pattern
- **ED-4: First-run onboarding flow** — carries forward from `stories/init-and-project-switching/` Part A, day-0 blocker for new users

Walking skeleton: user runs `npx openknowledge` in empty or existing directory → sees onboarding → creates or adopts content → can delete/move/rename/duplicate/organize → sidebar stays live. Standalone value delivered.

### Next (6-8 weeks, 2-3 parallel barrels, "feels like a real knowledge tool")

**Phasing rationale:** Value-first (ED-6 is the highest-ROI story — 6 API endpoints sit unconsumed, pure React work), then filling in core editor polish. ED-3 (rename) is Next rather than Now because (a) it requires coordination with `managed-rename-inbound-rewrite` which is a sibling concern, and (b) rename without backlink rewriting is worse than no rename, so we'd rather wait and ship it right. ED-5 (Cmd+K) enters here when KBs are big enough that navigation matters.

- **ED-3: File rename with backlink rewriting** — needs coordinate-or-absorb decision with `managed-rename-inbound-rewrite` story during spec
- **ED-6: Surface existing graph and outline APIs** — highest-ROI story; 6 existing endpoints consumed; establishes derived-view panel pattern
- **ED-5: Quick switcher (Cmd+K) and recent files** — navigation at scale; unblocks writers with >50 docs

### Later (appetite TBD, promote on evidence)

**Phasing rationale:** Appetite-first — these are polish and editor basics that make the product feel complete but don't block core flows. Promote triggers are concrete user signals, not calendar dates.

- **ED-7a: Find and replace within a document** — Promote when: users report bulk-edit friction OR inline-edit flow becomes a common agent workflow where human + agent both need find/replace.
- **ED-7b: Sidebar sort + word count polish bundle** — Promote when: Now+Next ship and qualitative feedback surfaces "feels unfinished" sentiment OR when a larger polish sprint is scheduled.

## Rabbit holes

**RH1: "Let's just add search while we're doing file ops."** Tempting because ED-2 touches the sidebar and search UI also lives in the sidebar. But search is a 4-6 week system integration (Orama vs FTS5+sqlite-vec vs pgvector), has 8 research reports dedicated to it, and deserves its own project. If encountered during ED-2 implementation, DO NOT add search scope — note it as a separate spec and move on. Trigger the search bet as a separate project once this one ships.

**RH2: "While we're rewriting the sidebar to be real-time (ED-1), let's also redesign it."** The sidebar has known UX weaknesses (cramped tree, no file metadata display, no context menu infrastructure). ED-1 adds the context menu for ED-2, but temptation will be to rebuild the whole sidebar. DO NOT. Keep ED-1 laser-focused on the push mechanism. Schedule a separate sidebar-UX story for Later if needed.

**RH3: "Let's unify the keyboard shortcut scheme now."** TQ4 is real but it's a spec-level concern, not a story. Don't try to establish the project-wide shortcut scheme as a dedicated story — that's a documentation artifact. Let ED-5 (Cmd+K) own it since it's the first new-shortcut story, and use a living doc to track future additions.

**RH4: "User-facing version history is close because the shadow repo exists."** Wrong. The shadow repo was designed for attribution journaling (per-writer WIP refs). User-facing history needs a redesigned data model (named versions, diff viewer, restore workflow) and is a separate spec. If the temptation surfaces during file-ops work ("delete is irreversible, let's add history quick"), resist — trash/recycle-bin is a valid lightweight alternative for Later if delete regret becomes a real signal.

**RH5: "We might as well add graph view since we have orphan/hub data."** ED-6 surfaces the API endpoints as panels. Graph view is a different UI — visual force-directed layout, node/edge rendering, interactive navigation. It's a separate story (and may not even be in this project — arguable parity-for-parity's-sake). The panels are the table-stakes; graph view is the differentiation feature in a future bet.

## Pre-mortem

**Most likely failure mode: The real-time sidebar (ED-1) spec resolution takes longer than expected.** The draft spec has 6 open questions and no resolved design. If spec work drags, ED-2 and ED-3 UX degrades (delete with 5s staleness is bad) or they ship with polling as a fallback (which dilutes the platform dimension). **Mitigation:** Budget ED-1 spec resolution as the first 1-2 weeks of Now phase. If it drags beyond that, escalate — the spec needs more senior design bandwidth, not more iteration time.

**Second-most likely: ED-2 scope creeps.** The story now includes delete + move + duplicate + new folder + MCP tools for all four. That's already at the upper edge of one story. Adding folder-move-with-content, confirmation UX variations, or trash/undo risks blowing the 6-week Now appetite. **Mitigation:** Draw a hard line at spec time — folder operations mirror file operations with no special cases; confirmation is a single modal for destructive ops; no trash or undo in this story.

**Third: The primary-beneficiary assumption is wrong.** If the actual users are developers using OK for in-repo docs (P2 in Electron spec, not P1), the feature priorities shift — Git-aware history UI and CLI depth matter more than Obsidian parity. **Mitigation:** Ship Now phase and gather usage signal before committing Next phase. If P2 is primary, Next reshapes toward developer workflows.

**Fourth: MCP tool parity turns out to be speculative platform investment.** If agents don't meaningfully use the file-op MCP tools in practice (humans do all the organizing, agents do all the writing), the dual-surface pattern was overkill. **Mitigation:** Measure MCP tool call rates after Now ships. If agent file-op usage is <5% of total file-op volume, future file-related work can skip the MCP tool surface and save effort.

**Fifth: Team capacity assumption (3-5 engineers, 1-2 barrels) is wrong — team is smaller.** If Now has only 1 barrel, three parallel stories won't fit. Serialize: ED-1 → ED-2 → ED-4 sequentially, which stretches Now to 12+ weeks. **Mitigation:** User confirmation of team size before committing to the phasing. Or split Now into "Now-1" (ED-1 + ED-4) and "Now-2" (ED-2) serialized.

## Final validation tests

- **Walking skeleton (Now standalone value):** If Next and Later never happen, does Now deliver? YES — onboarding + file ops + real-time sidebar = a new user can onboard, create/delete/move/rename/duplicate files, and trust the sidebar. This is a usable day-0 knowledge tool even without search, graph panels, quick switcher, or editor polish.
- **Barrel count check:** Now has 3 stories (ED-1, ED-2, ED-4). At 1-2 barrels, this requires some sequencing within Now (likely ED-1 starts first, ED-4 and ED-2 start when ED-1's contract is clear). This is acceptable — Now's 6-week budget accommodates sequencing within the phase.
- **Dependency audit:** Now → Next dependency is ED-3 (rename, Next) depending on ED-1 (real-time sidebar, Now) and `managed-rename-inbound-rewrite` (sibling story). Next → Later dependencies: none. Later → earlier: none. No circular or backward dependencies.
- **Deferral audit:** Later stories (ED-7a, ED-7b) have promotion triggers tied to user feedback, not dates. ED-3 has coordinate-or-absorb with managed-rename-inbound-rewrite as the Next→implement gate. All deferrals have explicit triggers.
- **Traceability:** PROJECT.md claims about the codebase (file watcher detects content, 6 API endpoints have no UI consumer, provider pool handles external deletes, shadow repo is attribution-focused) all trace to `evidence/current-editor-state.md`. Stories reference related specs and stories. Items table Decided/Assumed rows include evidence references where resolved through investigation.

## Rabbit holes
*(To be written in Phase 3)*

## Pre-mortem
*(To be written in Phase 3)*

## Evidence & References

### Evidence Files
- [evidence/current-editor-state.md](evidence/current-editor-state.md) — Feature inventory (12 exist, 6 API-only, 30 missing), infrastructure readiness, search research context, version history data model

### Research Reports
- [reports/onboarding-multiproject-ux/REPORT.md](../../reports/onboarding-multiproject-ux/REPORT.md) — Onboarding and multi-project UX (6 dimensions, 20+ tools)
- [reports/search-engine-decision/REPORT.md](../../reports/search-engine-decision/REPORT.md) — Orama vs SQLite FTS5+sqlite-vec vs PGlite+pgvector (for the separate search bet)
- [reports/orama-deep-dive/REPORT.md](../../reports/orama-deep-dive/REPORT.md) — Orama source-code-level assessment (for the separate search bet)
- [reports/orama-vs-ripgrep-indexed-grep/REPORT.md](../../reports/orama-vs-ripgrep-indexed-grep/REPORT.md) — Indexed grep architecture
- [reports/CATALOGUE.md](../../reports/CATALOGUE.md) — Full reports index

### Related Specs
- [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md) — Electron native distribution (draft)
- [specs/2026-04-11-sidebar-realtime-updates/SPEC.md](../../specs/2026-04-11-sidebar-realtime-updates/SPEC.md) — Real-time sidebar push (draft, 6 open questions)
- [specs/2026-04-11-content-config-unification/SPEC.md](../../specs/2026-04-11-content-config-unification/SPEC.md) — Content config schema
- [specs/2026-04-10-multi-file-documents/SPEC.md](../../specs/2026-04-10-multi-file-documents/SPEC.md) — Multi-file documents (mentions rename/move as future work)
- [specs/2026-04-10-provider-pool/SPEC.md](../../specs/2026-04-10-provider-pool/SPEC.md) — LRU provider pool

### Related Stories
- [stories/init-and-project-switching/STORY.md](../../stories/init-and-project-switching/STORY.md) — Onboarding (Part A folds into this project) + multi-project switching (Part B stays separate)
- [stories/managed-rename-inbound-rewrite/STORY.md](../../stories/managed-rename-inbound-rewrite/STORY.md) — Backlink rewriting on rename (coordinates with rename story in this project)
- [stories/backlinks-push-over-awareness/STORY.md](../../stories/backlinks-push-over-awareness/STORY.md) — Backlinks panel real-time updates (sibling of real-time sidebar)
- [stories/slug-correctness/STORY.md](../../stories/slug-correctness/STORY.md) — Wiki link slug normalization
- [stories/suggest-links-mcp-tool/STORY.md](../../stories/suggest-links-mcp-tool/STORY.md) — MCP link suggestion tool

### Upstream Artifacts
- Gap analysis session (2026-04-12) — 47 features audited, 30 missing
- Conversation frame-check (2026-04-12) — primary beneficiary, scope ceiling, Electron timing resolved via analysis
