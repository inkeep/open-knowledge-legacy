# Project: Ship Desktop-Ready Foundations in the Web App and CLI

**Last verified:** 2026-04-11
**Traces to:** [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md)
**Appetite:** No fixed timeline. Ship quality over speed.

## Strategic context

**Situation:** Open Knowledge is a CRDT-collaborative MDX editor distributed as `npx @inkeep/open-knowledge`. The core stack lives in four shared packages (`core`, `server`, `cli`, `app`) that will be reused unchanged when the product ships as a native Electron macOS app. Recent PRs shipped multi-file document support (provider pool #50), content config unification (#47), gitignore filtering (#52), wiki-links (#42), and sidebar updates (#51).

**Complication:** The Electron desktop app spec (`specs/2026-04-11-electron-desktop-app/`) identified 15 items that are NOT Electron-specific — they live in the shared packages and affect both the CLI/web and the desktop distribution. Addressing them now means the desktop app inherits them for free. Addressing them later means either doing the work twice (once for web, once for desktop) or shipping a desktop app that inherits known gaps from the web app. Additionally, several items fix real bugs in the current CLI (silent data corruption from dual-process collision, blank first-run experience, no document creation UI) that hurt users today, not just hypothetical desktop users.

**Resolution:** Ship 5 focused specs that bring the web app / CLI to desktop-ready quality. Each spec delivers standalone value for the current CLI/web experience AND unblocks or simplifies the Electron packaging effort. No Electron-specific code ships until these foundations are solid.

### In-flight work audit (April 11 2026)

Several open PRs and specs overlap with or inform this project:

| PR/Spec | Status | Overlap | Impact on this project |
|---------|:------:|:--------|:-----------------------|
| **PR #41 — Image upload** | Open | **Directly implements Story 2b** — 492 LOC: TipTap ProseMirror plugin with upload decoration, `busboy` server endpoint, MIME validation, atomic write. Saves to `uploads/` directory. | Story 2b builds on this PR rather than starting from scratch. Design decisions (directory naming, per-doc subfolder, content.exclude) still open. |
| **PR #54 — Zero-config bunx CLI** | Open (spec) | T2 track adds `@parcel/watcher` → `chokidar` fallback — relevant to Story 5. T3 track adds auto-init on first `start` — related to Story 3. | Story 5 inherits T2's watcher fallback pattern. Story 3's starter document extends T3's auto-init. |
| **PR #39 — Timeline with rollbacks** | Open | Full version-history UI spec — richer than Story 4's persistence indicator. 4 API endpoints + timeline panel + attribution. | If Timeline ships, Story 4's persistence indicator becomes a badge on the Timeline button (not standalone). If Timeline deferred, Story 4 ships standalone. |
| **PR #40 — Enriched MCP file API** | Open (spec) | MCP `write_file` tool creates files — related to Story 2a's server CRUD endpoints. Proposes `.yml` sidecar metadata. | Story 2a's CRUD endpoints must be consistent with MCP file API contracts. |
| **PR #53 — Wiki-link context menu** | Open | Context menu pattern — shares UI pattern with Story 2a's sidebar context menu. | Shared component opportunity for right-click menus. |
| `shadow-lock.ts` | Merged | Existing PID-based lock for shadow git repo — exact pattern Story 1 extends to server-level lock. | Story 1 extends this pattern, doesn't invent a new one. |
| `specs/2026-04-08-external-write-reconciliation/` | Review | Extensive spec on git persistence, shadow repo, disk bridge. Established the shadow-lock pattern. | Story 1's server lock should be consistent with shadow-lock conventions. |

**What we're NOT doing:**
- **[NEVER]** Electron-specific code in this project (that's the desktop app spec)
- **[NEVER]** Multi-user collaboration features
- **[NOT NOW]** Cross-document search (Cmd+Shift+F) — useful but larger scope, separate spec
- **[NOT NOW]** Sidebar real-time updates — already in-flight as its own spec (`2026-04-11-sidebar-realtime-updates`)
- **[NOT NOW]** Plugin/extension API

## Items

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| PQ1 | Should `initContent()` create a starter `README.md` or a richer example doc? | Product | P0 | Open | Affects first-run UX for both CLI and desktop |
| PQ2 | Where do pasted images go? `<contentDir>/attachments/`? Hidden `.attachments/`? Per-doc subfolder? | Product | P0 | Open | Blocks Story 2b. Interaction with `content.exclude` needs design. |
| PQ3 | Should attachments be gitignored or version-controlled? | Product | P0 | Open | Most docs authors want screenshots in git for portability. Lean: version-controlled. |
| PQ4 | Can users rename/delete documents from the sidebar, or only from the filesystem? | Product | P0 | Open | Table-stakes for a docs authoring tool. Lean: yes, with confirmation dialog. |
| TQ1 | Does `shadow-lock.ts` pattern extend cleanly to a server-level content-dir lock, or does it need a different design? | Technical | P0 | Open | shadow-lock is for shadow git repo; server lock is for the Hocuspocus process + file watcher. Same pattern, different scope. Needs investigation. |
| TQ2 | Does `ProviderPool.wsUrl` override work correctly when the renderer loads from `file://` protocol? | Technical | P0 | Open | In Electron production builds, `globalThis.location.host` is empty when loaded via `file://`. The pool falls back to `'localhost'` without a port. Needs explicit `wsUrl` injection. (evidence: `provider-pool.ts:35`) |
| XQ1 | Should `state.json` (last-opened doc) live in `.open-knowledge/` (per-project, version-controlled) or in the OS app data dir (per-user, not version-controlled)? | Cross-cutting | P0 | Open | Desktop needs it in OS app data (window size/position is per-user). CLI needs it in `.open-knowledge/` (which project to resume). Could have both. |
| PQ5 | Dark mode: inherit system theme only, or offer an app-level override toggle? | Product | P2 | Parked | Day-0 is system-theme-only (`prefers-color-scheme`). Override toggle is future. |
| PQ6 | Should persistence failure surface as a banner, a status dot, or a toast? | Product | P2 | Parked | Lean: subtle status dot in the header that turns red on failure, with tooltip for details. Specifics defer to implementation. |

## Cross-cutting concerns

### 1. `content.exclude` interaction with new file types
Stories 2b (image paste) and 2a (document creation) both write new files to the content directory. The `ContentFilter` (from the gitignore-filtering spec) must handle:
- Attachments directory: exclude from document index but NOT from git
- New `.md` files: include in document index automatically (already handled by content.include default `**/*.md`)

This threads through Stories 2a and 2b — both need to verify ContentFilter behavior after writing files.

### 2. Server shutdown ordering
The lock file (Story 1) must be released AFTER all other shutdown steps (flush git, close sessions, close connections). The `destroy()` function in `standalone.ts` already has a correct ordering; lock release is appended as the final step. If shutdown ordering is wrong, a second process could acquire the lock before git WIP is flushed, leading to index corruption.

### 3. The `state.json` location question
Per-project state (last-opened doc, sidebar scroll position) vs per-user state (window size, theme preference) live in different places. The CLI needs per-project state. The desktop app needs both. The split is: `.open-knowledge/state.json` for per-project, `~/Library/Application Support/Open Knowledge/state.json` for per-user. Story 3 handles only per-project state. Desktop app adds per-user state as a separate concern.

---

## Stories

### Now

**Phasing rationale:** Dependency-first + risk-first. Story 1 fixes a real data-corruption bug in the current CLI AND establishes the process-coordination primitive the desktop app needs. Story 2 is the highest-value customer-visible improvement and can ship in parallel (no dependency on Story 1). Together they make OK demo-able to a docs author.

---

#### Story 1: Server Process Safety — lock file, graceful shutdown, MCP auto-discovery

Establish exclusive per-project process ownership so two Open Knowledge instances can never corrupt the same content directory. Extend the existing `shadow-lock.ts` pattern to a server-level lock, harden the `destroy()` shutdown sequence, and teach the MCP stdio server to discover a running instance's port from the lock file.

**Value:** This directly fixes a current data-corruption bug (customer: two `open-knowledge start` in the same directory = two competing file watchers + two git persistence pipelines writing to the same `.git/index-wip`). It establishes the process-coordination primitive that the desktop app's multi-window architecture needs (platform: each Electron window acquires a lock on its project, second window on the same project gets "Already open" dialog). AND it makes the MCP integration zero-config for users who already have the server running (customer: `open-knowledge mcp` auto-discovers the port without `--port` flag, Claude Desktop "just works").

**Constraints:**
- Must extend `shadow-lock.ts` pattern (PID, hostname, startedAt) rather than invent a new one
- Lock file location: `<contentDir>/.open-knowledge/server.lock`
- Lock metadata must include: `pid`, `hostname`, `port`, `startedAt`
- `destroy()` must release lock as the LAST step (after git flush, session close, watcher stop)
- MCP server reads lock file on startup → extracts port → connects to `http://localhost:<port>/api/...`
- If lock exists with dead PID → stale lock → remove and continue
- If lock exists with live PID → refuse to start → print "Already running on port X"

**Lateral:** Story 3 (state.json) depends on this — writing per-project state without process exclusivity is a race condition.

**Forward:** Desktop app's multi-window lock collision dialog (`"Already open in another window. [Switch to Window] [Cancel]"`) reads this lock file directly. Desktop app's MCP integration uses the same auto-discovery. Zero Electron-specific code needed for these features.

**Scope (items from the 15):** #1 (lock file), #2 (graceful shutdown), #3 (MCP auto-discovery)

**Packages touched:** `packages/server/` (lock.ts, standalone.ts), `packages/cli/` (mcp/server.ts)

---

#### Story 2a: Document CRUD — create, rename, delete from sidebar

Add the missing authoring primitives to the editor: users can create a new document, rename an existing document, and delete a document — all from the sidebar. These operations go through server endpoints and update the file watcher's index automatically.

**Value:** These are the most basic content-authoring operations (customer: every competitor — Obsidian, Notion, Typora, VS Code — supports creating/renaming/deleting files from the UI; missing them makes OK feel like a prototype). The server endpoints (`POST /api/documents`, `PATCH /api/documents/:docName`, `DELETE /api/documents/:docName`) become the document CRUD API surface that the desktop app's File menu delegates to (platform: File → New Document, File → Rename, File → Delete all call these endpoints). AND they're the foundation for future features like templates and import/export (forward).

**Constraints:**
- New documents must respect `content.include` globs (default `**/*.md`)
- Rename must update the file watcher index and the provider pool (if the doc is open, reconnect the provider with the new name)
- Delete must close the provider if the doc is open, remove from watcher index, and show a confirmation dialog before deleting from disk
- Server must handle nested paths (`docs/api/auth.md` → create parent directories automatically)
- Sidebar needs right-click context menu or inline action buttons for rename/delete

**Prior art:** PR #40 (Open, spec) defines MCP `write_file` / `edit_file` tools that create and modify files via the Hocuspocus API or direct disk writes. **Story 2a's server CRUD endpoints must be consistent with PR #40's conventions** — if the MCP `write_file` tool creates a file with one pattern and the sidebar "New Document" creates it with another, agents and humans have different mental models. PR #53 (Open) adds right-click context menus on wiki-links — the UI pattern (context menu component) is reusable for sidebar rename/delete.

**Lateral:** Shares sidebar UI patterns with Story 2b (attachments). Depends on the in-flight sidebar-realtime-updates spec for how the sidebar refreshes after CRUD operations. Must align with PR #40's MCP file API conventions.

**Forward:** Desktop app's File → New Document / Rename / Delete menu items delegate to these same endpoints via IPC → fetch. Template system (future) builds on `POST /api/documents` with pre-filled content.

**Scope (items from the 15):** #8 (document creation), #14 (rename/delete)

**Packages touched:** `packages/server/` (api-extension.ts), `packages/app/` (FileSidebar.tsx, new context menu component)

---

#### Story 2b: Clipboard image paste + attachments model

When a user pastes a screenshot into the editor, save it to the project's attachments directory and insert a markdown image reference. Define the attachments directory model (location, naming, content-filter interaction, git behavior).

**Value:** Docs authors paste screenshots constantly — API response screenshots, error screenshots, architecture diagrams, terminal output. Every competing tool handles this (customer: Obsidian saves to `attachments/`, Notion uploads to CDN, Typora saves configurable). Without it, OK forces users to manually save images, switch to Finder, find the file, construct a markdown reference, and switch back — a workflow that destroys writing flow. The attachments model also establishes how OK handles non-markdown assets generally (platform: future video embeds, PDF attachments, and import/export all build on this pattern).

**Constraints:**
- Attachments location: `<contentDir>/attachments/<docName>/` — per-document subdirectory keeps images organized and portable
- Naming: `<timestamp>-<first8-hash>.png` — deterministic, collision-free
- `content.exclude` must auto-exclude `attachments/` from the document index (attachments appear in the file tree under their parent doc, not as separate documents)
- Attachments are version-controlled (not gitignored) — docs authors expect screenshots to travel with their docs
- Server endpoint: `POST /api/attachments` with multipart form data → saves file → returns the relative markdown reference
- TipTap paste handler intercepts `paste` events with `image/*` data types → calls the endpoint → inserts `![](./attachments/<docName>/<filename>.png)` at cursor
- Must handle paste of both clipboard images (screenshots) and pasted files (drag-and-drop deferred to separate story)

**Lateral:** Shares the `content.exclude` concern with Story 2a (new documents must NOT be excluded; attachments MUST be excluded from the doc index but present in git).

**Forward:** Desktop app inherits this for free (TipTap paste handler runs in any renderer). Future drag-and-drop from Finder (OQ-20) uses the same attachment endpoint and naming convention.

**Prior art:** **PR #41 (Open, 492 LOC)** already implements the TipTap ProseMirror plugin (upload decoration with loading skeleton, paste handler), the `busboy` server endpoint with MIME validation + atomic writes, and shared constants in `packages/core/src/constants/upload.ts`. Saves to an `uploads/` directory (flat, not per-document). **This story should review, update, and merge PR #41** rather than restarting — the remaining work is design decisions (directory naming, per-doc subfolder, `content.exclude` interaction) and adapting the PR to the current codebase (it was opened April 10 against an older base).

**Scope (items from the 15):** #7 (clipboard image paste), #13 (attachments directory model)

**Packages touched:** `packages/server/` (api-extension.ts, content-filter config), `packages/app/` (TipTap paste extension), `packages/core/` (upload constants — already in PR #41)

---

### Next

**Phasing rationale:** Story 3 depends on Story 1 (lock file must be in place before writing per-project state.json to avoid race conditions). Story 4 is independent but lower urgency than Stories 1-2; it polishes rather than unblocks.

---

#### Story 3: First-run and return-visit experience — starter document + session persistence

Eliminate the blank-editor experience. New projects start with a starter document. Returning users resume where they left off. Per-project session state persists across server restarts.

**Value:** The first impression and the return visit are the two moments that determine whether a docs author sticks with a tool (customer: a blank editor after first `open-knowledge init` communicates "this tool doesn't work yet"; returning to a blank editor after restarting the server communicates "this tool doesn't remember me"). Fixing both costs a few hours of engineering but has outsized UX impact. Session state persistence (`.open-knowledge/state.json`) is also the foundation the desktop app uses for per-project state like last-active document and sidebar scroll position (platform).

**Constraints:**
- `initContent()` creates a starter `README.md` in `<contentDir>` if no `.md` files matching `content.include` exist
- Starter content: brief welcome message, maybe 5-10 lines showing markdown + a JSX component example (shows off OK's MDX capability immediately)
- Per-project state stored in `.open-knowledge/state.json`: `{ lastOpenedDoc: "path/to/doc", lastModified: "ISO-date" }`
- On server start / document switch, write state.json atomically (tmp + rename)
- On app load, read state.json → if `lastOpenedDoc` exists, open it via `ProviderPool.open()`; if deleted, fall back to first document in the index
- State.json respects the lock: only the process holding the lock writes state

**Lateral:** Depends on Story 1 (lock file) for safe state.json writes. Independent of Story 2 (document CRUD).

**Forward:** Desktop app reads per-project state.json for "which document was open." Desktop app adds per-user state (window size, position) in its own app data directory — the per-project state model established here doesn't need to change.

**Scope (items from the 15):** #6 (starter document), #10 (last-opened persistence), #21 (empty project state)

**Packages touched:** `packages/cli/` (content/init.ts), `packages/app/` (document-context.tsx or App.tsx), `packages/server/` (state.ts — new)

---

#### Story 4: Visual polish and operational resilience — dark mode CSS + persistence failure indicator

Ship the CSS foundation for light/dark theme support and surface git persistence failures to the user instead of silently logging to console.

**Value:** Dark mode is a baseline expectation for any writing tool in 2025 — Obsidian, Notion, VS Code, Typora all support it (customer: docs authors who write at night, or who simply prefer dark themes, currently get no accommodation). The persistence failure indicator prevents a silent-failure scenario where the user thinks their version history is recording but git plumbing has failed 3+ times and they don't know (customer: data integrity trust). Together these make OK feel production-ready rather than prototype-quality (GTM: demo-able to prospective users without embarrassment).

**Constraints:**
- Dark mode via CSS custom properties (`--ok-bg-primary`, `--ok-text-primary`, etc.) with `@media (prefers-color-scheme: dark)` values
- No app-level override toggle on day 0 — system theme only (NOT NOW)
- Apply to: editor chrome, sidebar, presence bar, agent undo button, flash decorations, any custom UI
- TipTap and CodeMirror have their own theme systems — need to bridge OK's CSS variables into their theming APIs
- Persistence indicator: subtle status dot in the editor header. Green = healthy, red = git pipeline failed. Tooltip on hover explains the failure. Clears when a subsequent commit succeeds.
- Server emits a persistence-status event when `consecutiveGitFailures >= 3` (already tracked in `persistence.ts`). Surfaces via awareness channel or a dedicated SSE/WS event.

**Prior art:** PR #39 (Open) ships a full Document Timeline & Rollback UI — a much richer version-history surface than the persistence failure indicator proposed here. **If PR #39 ships first, the persistence indicator becomes a warning badge on the Timeline button** (3-line addition — "show red dot when `consecutiveGitFailures >= 3`"). If Timeline is deferred, Story 4 ships the standalone indicator. Both designs should be aware of the other. Dark mode is mentioned tangentially in `specs/2026-04-07-docs-component-parity/` (Mermaid dark mode issues) but has no prior implementation.

**Lateral:** Independent of Stories 1-3. Can ship in any order. Persistence indicator should coordinate with PR #39 Timeline spec.

**Forward:** Desktop app inherits the CSS foundation (Electron renderer renders the same React app). Desktop app's native menu → View → Appearance follows the same system-theme-only pattern. Dark mode for the Project Navigator (Electron-only) reuses the CSS variables.

**Scope (items from the 15):** #11 (dark mode), #12 (persistence failure indicator)

**Packages touched:** `packages/app/` (globals.css, component styles, new StatusIndicator component), `packages/server/` (persistence event emission)

---

### Later (Ship Just Before Electron Packaging Begins)

**Phasing rationale:** These items are purely desktop-prep and don't improve the current web experience. They're small (few hours each) and should ship as the first PR of the Electron packaging work, not independently.

---

#### Story 5: Desktop build pipeline prep — dynamic port injection + CJS build target

Make two small infrastructure changes that the Electron packaging requires: ensure the React app's HocuspocusProvider accepts a runtime-injected WebSocket URL (instead of reading from `location.host`), and add a CJS build target for the server package (Electron's `utilityProcess.fork()` doesn't support ESM entry points).

**Value:** These are technically necessary for the Electron build (platform: `utilityProcess` requires CJS; `file://` protocol in Electron production renders doesn't have a `location.host`). They have zero impact on the current CLI/web experience but are cheap to ship (~2-4 hours each) and remove two known blockers from the Electron spec's critical path.

**Constraints:**
- `ProviderPool` already accepts `wsUrl` override (verified: `provider-pool.ts:33`). The change is in whatever creates the pool — pass `window.__OK_WS_URL__` or read from a preload-injected config. The pool itself doesn't change.
- CJS build: add a `tsdown` or `vite build --format cjs` output target to `packages/server/package.json`. The entry point is `standalone.ts` → produces `dist/standalone.cjs`. ESM output remains the default for CLI/web.
- Neither change should alter the current dev or CLI experience — existing behavior is preserved.

**Prior art:** PR #54 (Open, spec) Track T2 defines a `@parcel/watcher` → `chokidar` fallback for the zero-config `bunx` path. **The watcher fallback applies to Electron production builds too** — if `@parcel/watcher` native addon fails to load after `asarUnpack` (documented failure mode), the server should fall back to chokidar rather than crash. Story 5 should verify T2's fallback works in the Electron context, not re-solve it.

**Lateral:** Independent of all other stories. Inherits PR #54 T2 watcher fallback.

**Forward:** Directly unblocks the first Electron packaging PR. The dynamic port injection point (`window.__OK_WS_URL__`) is where the Electron preload bridge injects the utilityProcess's allocated port.

**Scope (items from the 15):** #4 (dynamic port), #5 (CJS build)

**Packages touched:** `packages/app/` (provider-pool.ts or document-context.tsx), `packages/server/` (build config)

---

## Dependency Graph

```
Story 1: Server Process Safety (lock, shutdown, MCP discovery)
  │
  ├──→ Story 3: First-Run Experience (state.json needs lock for safe writes)
  │
  └──→ Story 5: Desktop Build Prep (lock file's port field enables MCP auto-discovery)
       │
       └──→ [Electron Desktop App Spec implementation begins]

Story 2a: Document CRUD ──┐
                           ├──→ [Both unblock demos to docs authors]
Story 2b: Image Paste ────┘

Story 4: Dark Mode + Persistence Indicator (independent, any order)
```

**Parallel work opportunities:**
- Stories 1 and 2a/2b can ship in parallel (no dependency)
- Stories 3 and 4 can ship in parallel (no dependency between them)
- Story 5 is sequential (ship just before Electron work starts)

## Rabbit holes

### 1. Over-engineering the attachments model
**Why tempting:** Per-document subdirectory (`attachments/auth-guide/`) + content-addressable hashing + deduplication across docs + automatic cleanup of orphaned attachments.
**Why a rabbit hole:** The V1 is dead simple: flat directory, timestamp+hash filename, no deduplication, no cleanup. Every additional feature can be added later without breaking the flat-file model.
**What to do if encountered:** Ship the simplest version that saves a paste to disk and inserts a reference. Iterate on the model later based on real usage patterns.

### 2. Building a full file manager into the sidebar
**Why tempting:** Once you have create/rename/delete, you want drag-and-drop reordering, bulk operations, search-within-sidebar, nested folder creation, file templates...
**Why a rabbit hole:** The day-0 sidebar is a file tree with right-click actions. Every feature beyond that is additive and can ship later.
**What to do if encountered:** Ship create + rename + delete as context menu actions. Resist adding more until users ask.

### 3. Perfecting the lock file coordination protocol
**Why tempting:** Distributed lock protocols are fascinating — you could add heartbeats, lease expiry, advisory vs mandatory locking, cluster awareness...
**Why a rabbit hole:** OK is single-machine, single-user. PID-based stale detection is sufficient. The `shadow-lock.ts` pattern already solves this.
**What to do if encountered:** Use the existing shadow-lock.ts pattern verbatim. If edge cases emerge (e.g., macOS Sleep/Wake dropping PID validity), fix them as bugs — don't anticipate them.

### 4. Dark mode as a theme engine
**Why tempting:** CSS custom properties → theme JSON files → user-customizable themes → theme marketplace...
**Why a rabbit hole:** Two themes (light and dark) cover 99% of users. The CSS variable foundation enables future theming without building the engine now.
**What to do if encountered:** Ship light + dark via `prefers-color-scheme`. If users ask for custom themes, that's a signal to build a theme engine — not before.

## Pre-mortem

**If this project fails, the most likely cause is:** Story 2b (clipboard image paste) turns out to be harder than expected — the TipTap paste handler, the server endpoint, the ContentFilter exclusion, and the attachment path convention all touch different layers. If the attachments model isn't right, we'll waste cycles redesigning it. **Mitigation:** Design the attachments model (PQ2, PQ3) as the FIRST decision in Story 2b, before writing any code.

**What we're assuming that could be wrong:**
- **A1:** `shadow-lock.ts` extends cleanly to server-level locking (TQ1). If it doesn't, Story 1 is bigger. **Verification:** Read shadow-lock.ts carefully before designing server lock.
- **A2:** TipTap has a clean paste-handler extension point for intercepting image data (Story 2b). If it doesn't, we need a custom ProseMirror plugin. **Verification:** Check TipTap's paste-handling API and existing community extensions.
- **A3:** The `destroy()` function's shutdown ordering (flush → close → release) is reliable under all termination signals (SIGTERM, SIGINT, SIGKILL, macOS Sleep/Wake). SIGKILL can't be intercepted — the lock becomes stale, and the PID-based stale detection handles recovery. But if `SIGTERM` doesn't flush git, version history is lost. **Verification:** Test `destroy()` under each signal in the Story 1 implementation.

## Evidence & References

### Evidence Files
(to be populated during story investigation)

### Research Reports
- [reports/web-to-macos-desktop-wrapping-2025/REPORT.md](../../reports/web-to-macos-desktop-wrapping-2025/REPORT.md) — framework selection, OK-specific deep dive
- [reports/electron-desktop-app-operations-2025/REPORT.md](../../reports/electron-desktop-app-operations-2025/REPORT.md) — operational reference (versioning, signing, CI)

### Related Specs
- [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md) — desktop app spec (consumer of this project's output)
- [specs/2026-04-10-provider-pool/SPEC.md](../../specs/2026-04-10-provider-pool/SPEC.md) — multi-document architecture
- [specs/2026-04-10-document-list-api/SPEC.md](../../specs/2026-04-10-document-list-api/SPEC.md) — `/api/documents` design
- [specs/2026-04-11-content-config-unification/SPEC.md](../../specs/2026-04-11-content-config-unification/SPEC.md) — content config schema
- [specs/2026-04-11-exclude-gitignored-files/SPEC.md](../../specs/2026-04-11-exclude-gitignored-files/SPEC.md) — ContentFilter design
- [specs/2026-04-11-sidebar-realtime-updates/SPEC.md](../../specs/2026-04-11-sidebar-realtime-updates/SPEC.md) — sidebar real-time (in-flight, parallel)

### Codebase
- `packages/server/src/shadow-lock.ts` — existing PID-based lock pattern (extend for server lock)
- `packages/server/src/standalone.ts:399` — existing `destroy()` function (harden)
- `packages/app/src/editor/provider-pool.ts:33-35` — existing `wsUrl` override (plumb for Electron)
- `packages/cli/src/content/init.ts` — existing `initContent()` (extend for starter doc)
- `packages/cli/src/mcp/server.ts` — existing MCP stdio server (add lock-file auto-discovery)
- `packages/server/src/persistence.ts:99-103` — existing `consecutiveGitFailures` tracking (surface to UI)

### Upstream Artifacts
- Electron desktop app spec — source bet for this decomposition
