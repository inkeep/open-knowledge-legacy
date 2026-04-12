---
title: "In-flight specs summary (provider pool, document list API, content config, gitignore filter, sidebar)"
date: 2026-04-11
sources:
  - specs/2026-04-10-provider-pool/SPEC.md
  - specs/2026-04-10-document-list-api/SPEC.md
  - specs/2026-04-11-content-config-unification/SPEC.md
  - specs/2026-04-11-exclude-gitignored-files/SPEC.md
  - specs/2026-04-11-sidebar-realtime-updates/SPEC.md
---

# In-Flight Specs Summary for Electron Desktop App

## 1. Provider Pool & Document Context (2026-04-10)

**Status:** Final

**What changed in OK's architecture:**
- Replaced hardcoded singleton `HocuspocusProvider` with an LRU pool (cap 10) and React context
- Enabled dynamic document open/close/switch via `DocumentContext.openDocument(docName)` / `closeDocument(docName)`
- Made document handling per-instance: each pool entry tracks its own `syncState`, `observerCleanup`, and `lastAccessedAt`

**Constraints the desktop spec must inherit:**
- LRU eviction never evicts the active document
- Pool is TypeScript class in `packages/app/src/editor/provider-pool.ts`, survives React re-renders
- Components must subscribe to `DocumentContext` instead of module-level provider singletons
- Blank state when `activeDocName` is `null`: editors not rendered, mode toggle + undo disabled (acknowledged regression pending sidebar PR)
- Document switch forces SourceEditor/TiptapEditor remount (due to `yCollab` binding requirement) — expect flash
- Acceptance test updates required: replace `window.__hocuspocusProvider` refs with `window.__providerPool` + `window.__activeProvider` getter

**Open issues intersecting with desktop:**
- Tabbed editor chrome is explicitly deferred (parallel work to this spec)
- URL routing / deep links layered on later
- File tree sidebar is separate PR consuming `openDocument()`

**Key file paths:**
- `packages/app/src/editor/provider-pool.ts` (new)
- `packages/app/src/editor/DocumentContext.tsx` (new)
- `packages/app/src/components/App.tsx` (wraps app with `<DocumentProvider>`)
- `packages/app/src/components/TiptapEditor.tsx`, `SourceEditor.tsx`, `EditorPane.tsx`, `EditorArea.tsx`, `EditorHeader.tsx`
- `packages/app/src/presence/AgentUndoButton.tsx`, `PresenceBar.tsx`, `use-presence.ts`
- `packages/server/src/persistence.ts` (mkdir fix for nested docNames)

**Non-goals affecting desktop:**
- MCP tool revival (parallel spec)
- URL routing (can layer on later)

---

## 2. Document List API (2026-04-10)

**Status:** Final

**What changed in OK's architecture:**
- Added `GET /api/documents` endpoint: lists files matching `config.content.include` / `exclude` globs
- Endpoint returns `{ ok: true, documents: [{ docName, size, modified }, ...] }` with optional `?dir=<subdir>` filtering
- Single source of truth for "what documents exist" (consumed by sidebar, MCP list_documents tool, future UI)

**Constraints the desktop spec must inherit:**
- Response is flat list; tree structure derived client-side
- `docName` = path relative to `contentDir`, without `.md` extension (e.g., `articles/architecture`)
- Sorted alphabetically by `docName`
- Default config (`**/*.md`) lists all `.md` files; custom glob filtering deferred until needed

**Open issues intersecting with desktop:**
- Path validation via `safeSubdir()` helper prevents traversal attacks
- Config integration: two approaches proposed (A: minimal, list all `.md`; B: full, wire custom globs). **Recommendation: Approach A** — globs can be wired later without API changes

**Key file paths:**
- `packages/server/src/api-extension.ts` (route: `/api/documents`)
- `packages/cli/src/config/schema.ts` (config schema with `content.include`/`exclude`)

**Non-goals:**
- File tree UI (separate PR)
- MCP `list_documents` tool (parallel spec)

---

## 3. Content Config Unification (2026-04-11)

**Status:** Complete (retroactive)

**What changed in OK's architecture:**
- Unified `wiki.roots` + `content.dir` config into single `content: { dir, include, exclude }` section
- Replaced in-place INDEX.md catalogs with mirrored catalogs in `.open-knowledge/catalogs/`, mirroring project directory structure
- Renamed `wiki/` directory and code to `content/`; all user-facing text now says "content" / "knowledge base"

**Constraints the desktop spec must inherit:**
- Content config is now `content: { dir: '.', include: ['**/*.md'], exclude: [] }` (defaults to project root, all markdown)
- `dir` serves the CRDT editor (where to read/write documents); `include`/`exclude` serve the catalog system (which files to track)
- Mirrored catalogs at `.open-knowledge/catalogs/` are gitignored and regenerated on startup + watch events
- Catalog links use project-root-relative paths (agents pass directly to Read tool)
- Content-hash dedup prevents watcher loops when catalogs are inside watched tree
- File watcher watches `projectDir` (not just `.open-knowledge/`) with 500ms quiet / 2s max debounce

**Open issues intersecting with desktop:**
- Old catalog code (`catalog.ts`, `watcher.ts`, `paths.ts`) retained but disconnected; no runtime calls
- No migration tool for old `config.yml` files (was internal-only; moot for external users)

**Key file paths:**
- `packages/cli/src/config/schema.ts` (unified schema)
- `packages/cli/src/content/mirror-catalog.ts` (new, glob scanning + tree building + catalog generation)
- `packages/cli/src/mcp/server.ts` (inline file watcher on `projectDir`)
- `packages/cli/src/content/init.ts` (renamed from `wiki/init.ts`)
- `packages/cli/src/content/paths.ts` (renamed types)
- `.open-knowledge/.gitignore` (includes `catalogs/`)

**Non-goals:**
- Removing `articles/`, `external-sources/`, `research/` directory convention (still recommended)
- Removing old catalog code (retained for potential future use)
- Migrating wiki-links-backlinks spec terminology (separate concern)

---

## 4. Exclude Git-Ignored Files (2026-04-11)

**Status:** Draft

**What changed in OK's architecture:**
- Refactored file watcher to be single source of truth for "what content files exist"
- Documents API now reads from watcher's in-memory file index instead of doing independent `readdirSync`
- Unified exclusion filter (config `content.exclude` + `.gitignore` rules) applied at watcher level
- Removed hardcoded `EXCLUDED_DIRS` constant

**Constraints the desktop spec must inherit:**
- **Critical architectural shift:** Watcher owns file index; API reads from it. Single filtering surface eliminates divergence.
- Filtering applies to **discovery** (watcher's index); direct document access by name (persistence, agent writes) bypasses filter
- Inclusion rule: matches `content.include` pattern AND not excluded by `content.exclude` or `.gitignore`
- Exclusion supersedes inclusion: file matching both is excluded
- `.gitignore` loaded at startup only (no hot-reload); nested `.gitignore` files handled via two-pass bootstrap (load root + config excludes first, then scan for nested, skipping already-excluded dirs)
- Non-git projects gracefully degrade (only `content.exclude` applies)

**Open issues intersecting with desktop:**
- Hot-reload of `.gitignore` changes identified as future work; document that users must restart server to apply changes
- `ignore` npm package (v5.3.2) used in-process (not `git check-ignore` subprocess)
- `picomatch` added as dep for `content.include` glob matching

**Key file paths:**
- `packages/server/src/content-filter.ts` (new, `ContentFilter` module with `isExcluded()` and `getWatcherIgnoreGlobs()`)
- `packages/server/src/file-watcher.ts` (maintains file index, applies filtering during scan/events)
- `packages/server/src/api-extension.ts` (reads from watcher's index, removes `EXCLUDED_DIRS`)
- `packages/server/src/standalone.ts` (creates `ContentFilter`, wires watcher → API extension)
- `packages/app/src/server/hocuspocus-plugin.ts` (dev mode: creates `ContentFilter` at module scope)
- `packages/cli/src/commands/start.ts` (forwards config globs to server options)

**Non-goals:**
- UI toggle to show/hide ignored files
- Allowing editing of git-ignored files to bypass filter

---

## 5. Sidebar Real-Time Updates (2026-04-11)

**Status:** Draft (seed)

**What changed in OK's architecture:**
- Identified latency problem: polling `GET /api/documents` every 5 seconds delays new files appearing in sidebar
- Identified divergence problem: sidebar's document list and provider pool's open documents are independent data sources (no coordination)

**Constraints the desktop spec must inherit:**
- Current sidebar implementation polls every 5 second; replacement not yet decided
- File watcher already detects disk changes in real-time; architecture exists for broadcast
- Provider pool has `onChange` callback but only fires for pool operations, not filesystem changes
- `GET /api/documents` currently does synchronous `readdirSync` on every call

**Open questions still being researched:**
- **OQ1:** Push vs pull for updates? WebSocket push, SSE, smarter polling (ETag/since param), or file watcher event forwarding?
- **OQ2:** Should provider pool trigger sidebar refresh when `pool.open()` creates a disk file?
- **OQ3:** Scope of real-time events: create, delete, rename, modified timestamp?
- **OQ4:** Optimistic UI for agent writes (add to sidebar before server confirms)?
- **OQ5:** Scalability of list endpoint with `content.dir: '.'` and 3000+ files — paginate, cache, or make async?
- **OQ6:** Subscribe to filtered file watcher stream (create/delete/rename) instead of re-listing?

**Key file paths:**
- `packages/app/src/components/FileSidebar.tsx` (current polling implementation)
- `packages/server/src/file-watcher.ts` (detects disk changes; broadcasts not yet implemented)
- Hocuspocus WebSocket connection (could carry broadcast messages)

**Non-goals:**
- None specified (spec is in research phase)

---

# Synthesized Summary

## Multi-Document Support (as of April 11, 2026)

OK now has **complete multi-document architecture** in the client layer:
- Provider pool holds up to 10 concurrent Y.Doc providers with LRU eviction
- `DocumentContext` exposes `openDocument(docName)` / `closeDocument(docName)` / `activeDocName`
- Components consume context instead of referencing singletons
- Pool state flows to React via callbacks
- Blank state when no document is open (sidebar PR will resolve this regression)

**Server layer** supports multi-document via:
- Persistence already handles nested `docName` paths (with recent mkdir fix)
- `GET /api/documents` API lists all `.md` files in content directory
- File watcher watches projectDir and maintains real-time index

## Content Config & Project Boundary (as of April 11, 2026)

Unified `content: { dir, include, exclude }` config replaces the old split (content.dir for editor, wiki.roots for catalogs):
- Default: `dir: '.'`, `include: ['**/*.md']`, `exclude: []` — tracks all markdown in project root
- Custom globs support narrowing (e.g., track only `docs/**` and `specs/**`)
- Catalog generation **respects config globs**; any `.md` file outside include patterns is not indexed
- Mirrored catalog structure at `.open-knowledge/catalogs/` mirrors project layout for intuitive navigation
- Catalogs gitignored, regenerated at startup + on watch events

## File Watcher & ContentFilter

Architectural shift toward **watcher as single source of truth**:
- Watcher maintains in-memory file index (with size, modified metadata)
- `ContentFilter` module encapsulates unified exclusion logic:
  - Loads `.gitignore` (root + nested) via two-pass bootstrap (root + config excludes first, then scan with bootstrap filter)
  - Loads `content.exclude` patterns from config
  - Builds include matcher from `content.include`
  - Rule: include if matches `include` pattern AND not excluded by config or gitignore
  - Exclusion supersedes inclusion
- Watcher applies filter during initial scan and on every file event
- API reads from watcher's index (no independent `readdirSync`)
- Eliminates divergence between API and watcher
- `.gitignore` hot-reload not yet implemented (users must restart server for changes)

## Editor's DocumentContext + Provider Pool

**Architecture:**
- `ProviderPool` (TypeScript class, `packages/app/src/editor/provider-pool.ts`) is module-scope singleton housing the LRU map
- `DocumentContext` (React context, `packages/app/src/editor/DocumentContext.tsx`) exposes pool state and methods to components
- `<DocumentProvider>` wraps app in `App.tsx`, holds pool in `useRef`, flows state changes via `setState` callbacks

**Lifecycle:**
- `openDocument(docName)` creates a provider + observer cleanup function, syncs from server, becomes active
- If pool is at capacity, evicts LRU entry (never active): `provider.disconnect()` first, then cleanup, then remove from map
- Switching documents forces editor remount (yCollab binding requires it); expect visual flash
- Re-opening evicted document is fresh sync from server
- Closing a document removes it from pool; if it was active, `activeDocName` becomes `null`

**Observer lifecycle:**
- Each `PoolEntry` stores its own cleanup function (returned by `setupObservers()`)
- On eviction: disconnect provider first, then call cleanup
- Typing state already per-document via `WeakMap<Y.Doc, TypingState>`; no changes needed to observer internals

## Sidebar Today

**Current implementation:**
- Polls `GET /api/documents` every 5 seconds
- Creates local tree structure from flat list
- Displays files but no real-time sync with provider pool's open documents
- Latency: new files (created by agents) appear 0-5 seconds later in sidebar
- Divergence: sidebar's list and pool's open docs are independent (no coordination)

**Future (draft spec, OQ phase):**
- Multiple push/pull strategies under evaluation
- Goal: real-time updates when files created/deleted, coordinated with pool
- Potential approaches: WebSocket broadcast, SSE, smarter polling (ETag), or filtered file watcher events
- Optimistic UI and scalability (3000+ files) still being designed

## Cross-Cutting Design Constraints for Desktop App

### 1. **Watcher as Single Source of Truth**
The file watcher is now the authoritative index for "what documents exist." Any desktop UI that displays a document list must read from the watcher's index (via API), not do independent filesystem walks. This eliminates divergence between what the editor can open and what the sidebar shows.

### 2. **Filtering Happens Once, at Watcher Level**
Content exclusion (gitignore + config exclude) is applied during watcher scan and event handling. The API and catalog system read from a pre-filtered index. The desktop app **should not re-apply filtering** on the client side; trust the watcher's index.

### 3. **Direct Document Access Bypasses Filter**
If a user or agent knows a document's name (e.g., via URL or direct API call), they can open it regardless of ignore status. Filtering applies to **discovery** (sidebar, catalog), not **access**. The desktop app's document-opening flow should not check ignore status.

### 4. **LRU Pool + Context Drive Editor State**
The provider pool is the canonical source for "what documents are open in the editor." The sidebar must coordinate with the pool's state (e.g., visually mark open documents, disable "open" if already open). Any multi-window architecture must share or sync the pool state across windows.

### 5. **Blank State is Accepted**
When no document is open (`activeDocName === null`), editors are not rendered. This is an acknowledged regression in the current client PR; the sidebar PR will resolve it. The desktop app should design multi-window UX with this in mind (e.g., "open a document to get started").

### 6. **Document Switch Forces Component Remount**
Switching between open documents will cause a brief flash (SourceEditor + TiptapEditor remount due to yCollab binding). This is a known trade-off. The desktop app's tabbed or multi-window UX must accept this; smooth transitions are future work if needed.

### 7. **Observer Cleanup Requires Orderly Eviction**
When a pool entry is evicted, `provider.disconnect()` must be called before `observerCleanup()`. The desktop app must not manually manage provider lifecycles — delegate to the pool. If building custom window management, ensure it doesn't bypass the pool's eviction contract.

### 8. **Config Globs Are Immutable at Runtime**
`content.include` and `content.exclude` are read at server startup and applied by the watcher. The desktop app should **not expose a UI to change these at runtime** (or if it does, it must restart the server). This is noted as future work in the content config spec.

### 9. **Catalog Paths are Project-Root-Relative**
Mirrored catalogs in `.open-knowledge/catalogs/` use project-root-relative paths (e.g., `specs/2026-04-07-foo/SPEC.md`). The desktop app's navigation should use these paths directly when reading documents or constructing breadcrumbs.

### 10. **Real-Time Sidebar Updates Unresolved**
The sidebar real-time spec is still in open-question phase. The desktop app should plan for eventual event-driven updates (WebSocket, SSE, or smarter polling) but shipping v1 with polling is likely acceptable. Design the sidebar abstraction so the update strategy can be swapped later without refactoring components.

### 11. **Nested Documents Require Mkdir**
The persistence layer now creates parent directories for nested `docName` paths (fix in `packages/server/src/persistence.ts`). The desktop app can freely create documents in subdirectories (e.g., `projects/my-project/notes`); the server will handle directory creation.

### 12. **Multi-Window State Coordination**
If the desktop app opens multiple windows (one per project or per document), each window will have its own `DocumentProvider` + `ProviderPool`. **These pools are independent.** A design decision needed: should all windows share a single pool (IPC relay), or maintain separate pools? This affects whether opening the same document in two windows creates two providers or reuses one.

---

## Unresolved & Future Work

### From Provider Pool
- Tabbed editor chrome (architecture ready, UI separate)
- URL routing / deep links (can layer on later)

### From Document List API
- Custom glob filtering in API (deferred; approach A for now)

### From Content Config
- Hot-reload config changes (currently requires restart)
- Supporting `.git/info/exclude` and global gitignore (low priority; `.gitignore` covers 99%+ of cases)
- Smarter glob implementation (brace expansion, character classes)

### From Gitignore Filter
- Hot-reload `.gitignore` changes (identified for future; users must restart server today)
- UI toggle to show/hide git-ignored files

### From Sidebar Real-Time
- **All major decisions unresolved:** push vs pull, provider pool coordination, event scope, optimistic UI, scalability strategy
- Expected as part of sidebar PR (not blocking desktop app spec, but needed for good UX)

---

## Key Takeaway for Desktop Spec

The OK server and client have **matured to support multi-document workflows**. The client now has a pool + context to manage multiple open documents. The server has a unified config system (content globs), real-time file watcher with filtering, and an API for document discovery. The architecture is **ready for a desktop app that wraps this stack and surfaces multi-window or tabbed switching.**

The main design decision for the desktop spec is: **How do multiple windows coordinate?** All windows could share a single server + provider pool, or each could spawn its own. The current architecture (server-centric, API-first) favors a single server with IPC relay or WebSocket broadcast to keep windows in sync.
