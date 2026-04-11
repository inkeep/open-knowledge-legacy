---
title: "Worldmodel topology for Electron desktop app spec"
date: 2026-04-11
sources:
  - packages/server/src/standalone.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/persistence.ts
  - packages/server/src/api-extension.ts
  - packages/cli/src/cli.ts
  - packages/cli/src/commands/start.ts
  - packages/cli/src/commands/init.ts
  - packages/app/src/main.tsx
  - packages/app/src/App.tsx
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/src/editor/provider-pool.ts
  - packages/app/src/server/hocuspocus-plugin.ts
  - packages/app/src/components/FileSidebar.tsx
  - reports/electron-desktop-app-operations-2025/REPORT.md
---

# Worldmodel Topology: Electron Desktop App for Open Knowledge

## Executive Summary

Open Knowledge is a CRDT-backed knowledge base with a layered architecture: a standalone Hocuspocus server (packages/server) that manages real-time collaboration and git persistence, a CLI (packages/cli) that orchestrates it, and a React SPA (packages/app) that connects via WebSocket. The desktop app spec must preserve this separation while introducing Electron's main/renderer/utilityProcess boundaries.

Key discovery: the codebase is already well-factored for desktop wrapping. The server is pure Node.js with no UI dependencies, the React app connects via WebSocket to a standard Hocuspocus endpoint, and file persistence uses git plumbing that doesn't require special privileges. The main challenge is coordinating process lifecycle, IPC for file operations, and native menu/dialog APIs.

---

## 1. Current State: What Exists in OK Today

### 1.1 Server Package (packages/server/src)

**Purpose:** Standalone Hocuspocus v4 server with git auto-persistence, file watching, and three-way reconciliation.

**Core files:**

| File | Purpose | Public API |
|------|---------|-----------|
| `standalone.ts:90–688` | Factory for ServerInstance | `createServer(options: ServerOptions): ServerInstance` |
| `file-watcher.ts:417–505` | File system bridge via @parcel/watcher | `startWatcher(contentDir, onDiskEvent, contentFilter): Promise<WatcherHandle>` |
| `persistence.ts:128–206` | Y.Doc → markdown → disk layer | `createPersistenceExtension(opts): PersistenceHandle` |
| `api-extension.ts:44–80` | HTTP routes for agent writes, undo/redo, documents list | `createApiExtension(opts): Extension` |
| `index.ts:1–73` | Public exports | Re-exports all above + shadow-repo, reconciliation, metrics |

**Server startup contract** (standalone.ts:90–105):

```typescript
interface ServerOptions {
  port?: number;
  host?: string;
  contentDir: string;          // Required: where docs are stored
  projectDir?: string;         // Shadow repo location (defaults to contentDir)
  quiet?: boolean;             // Suppress logging
  debounce?: number;           // Y.Doc→disk debounce (default: 2000ms)
  maxDebounce?: number;        // Max debounce (default: 10000ms)
  gitEnabled?: boolean;        // Enable git persistence (default: true)
  commitDebounceMs?: number;   // Disk→git debounce (default: 30000ms)
  wipRef?: string;             // Shadow WIP branch ref
  enableTestRoutes?: boolean;  // /api/test-reset for testing only
  shadowRepo?: ShadowHandle;   // Pre-initialized shadow repo
  contentRoot?: string;        // Relative path for git staging
  includePatterns?: string[];  // Glob patterns (default: ['**/*.md'])
  excludePatterns?: string[];  // Gitignore-style patterns
}
```

**ServerInstance** (standalone.ts:82–88):

```typescript
interface ServerInstance {
  hocuspocus: Hocuspocus;          // The server—ready to wire to HTTP
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;    // Graceful shutdown
  ready: Promise<void>;            // Async init (watchers, shadow repo)
}
```

**Initialization flow** (standalone.ts:426–687):

1. `createServer()` synchronously creates Hocuspocus + extensions
2. Returns immediately with `ready: Promise` for async init
3. `initAsync()` runs in background:
   - Initializes shadow repo (git bare repo for version storage)
   - Starts `@parcel/watcher` on contentDir
   - Starts HEAD watcher to detect git branch changes
   - Populates reconciled base (last synced markdown per doc)

**HTTP/WebSocket routing** (cli:start.ts:77–120):

- `/collab` → Hocuspocus WebSocket (handled by hocuspocus.upgrade middleware)
- `/api/*` → Hocuspocus API extension (agent writes, documents list, etc.)
- `/*` → Static React app (served by sirv)

### 1.2 File Watcher (packages/server/src/file-watcher.ts)

**Purpose:** Disk bridge that detects external .md file changes and emits typed DiskEvent unions.

**Key implementation details:**

- Uses `@parcel/watcher` for cross-platform (macOS, Linux, Windows) file watching
- **Self-write detection** (Layer 1): contentHash tracking to avoid feedback loops
  - `registerWrite(filePath, hash)` called by persistence before writing
  - `isSelfWrite(filePath, hash)` checks and consumes tracker entry
- **Rename detection:** Matches delete+create pairs with same content hash
- **Conflict detection:** Scans for `<<<<<<` conflict markers
- **File index:** In-memory Map<docName, FileIndexEntry> for API route `/api/documents`

**DiskEvent taxonomy** (file-watcher.ts:28–40):

```typescript
type DiskEvent =
  | { kind: 'create'; path: string; docName: string; content: string }
  | { kind: 'update'; path: string; docName: string; content: string }
  | { kind: 'delete'; path: string; docName: string }
  | { kind: 'rename'; oldPath: string; newPath: string; oldDocName: string; newDocName: string; content: string }
  | { kind: 'conflict'; path: string; docName: string; content: string };
```

**WatcherHandle** (file-watcher.ts:49–54):

```typescript
interface WatcherHandle {
  unsubscribe: () => Promise<void>;
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
}
```

**Disk event processing** (standalone.ts:213–371):

- `create` → noop (file is new)
- `update` → 3-way reconcile (base vs ours vs theirs)
- `delete` → save dirty content to rescue buffer, mark doc deleted-upstream
- `rename` → detect via hash, record in lifecycle map
- `conflict` → mark doc with conflict markers, populate conflicts map

### 1.3 Persistence Layer (packages/server/src/persistence.ts)

**Purpose:** Two-layer debounced auto-save: CRDT→markdown→disk (L1 debounced by Hocuspocus) then disk→git (L2 debounced by persistence).

**Layer 1: Y.Doc serialization** (persistence.ts:164–206):

- On Hocuspocus `onStoreDocument` hook:
  - Extract Y.XmlFragment + frontmatter metadata map
  - Convert to ProseMirror JSON
  - Serialize to Markdown via MarkdownManager
  - Write to .md file (debounced 2s, max 10s)
  - Register write hash to avoid file-watcher feedback

**Layer 2: Git commit** (persistence.ts:defined but implementation in shadow-repo.ts):

- On disk write completion, enqueue git commit
- Debounced 30s idle after last write
- Commits to shadow WIP branch (refs/wip/main)

**Reconciled base tracking** (persistence.ts:49–100):

- Per-branch scope: `reconciledBaseByBranch: Map<branch, Map<docName, markdown>>`
- Updated on:
  - Document load from disk
  - Clean 3-way merge
  - Conflict resolution
  - Branch switch (scope changes)
- Used as merge base for next update's reconciliation

### 1.4 API Extension (packages/server/src/api-extension.ts)

**HTTP routes** (lines vary, see test files for examples):

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `GET /api/documents` | GET | List all .md files with size/mtime | None |
| `POST /api/pages` | POST | Create new document | None |
| `POST /api/agent-write` | POST | Batch write by agent (with origin tracking) | None |
| `POST /api/test-reset` | POST | Clear all state (test-only, requires enableTestRoutes=true) | None |

**extractPageTitle()** (api-extension.ts:91–126):

Priority: YAML `title:` field → first `# heading` → filename

### 1.5 CLI (packages/cli/src)

**Entry point** (cli.ts:22–78):

```typescript
const program = new Command()
  .name('open-knowledge')
  .version('0.0.1')
  .option('--cwd <path>', 'Working directory')
  .option('--log-level <level>', 'Log level', 'info')
```

Config resolution cascade: CLI flags → ENV vars (PORT, HOST) → workspace config → user config → Zod defaults

**Commands:**

1. **`start`** (commands/start.ts:8–120) — default command
   - Starts createServer() with config
   - Wires HTTP server to Hocuspocus WebSocket
   - Serves static React app from packages/app/dist
   - Graceful shutdown on SIGINT/SIGTERM

2. **`init`** (commands/init.ts:80–180) — one-shot setup
   - Scaffolds `.open-knowledge/` directory structure
   - Writes `.mcp.json` with open-knowledge MCP server entry (npx @inkeep/open-knowledge mcp)
   - Idempotent: skips if open-knowledge entry exists (unless --force)

3. **`mcp`** (commands/mcp.ts) — MCP server for Claude Code / Cursor
   - Spawns stdio-based MCP server
   - Exposes tools for file discovery, document read, agent writes

### 1.6 React App (packages/app/src)

**Entry** (main.tsx:1–16):

```typescript
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>
);
```

**Top-level App** (App.tsx:42–54):

```typescript
<DocumentProvider>
  <NavigationHandler />
  <SidebarProvider>
    <FileSidebar />
    <SidebarInset>
      <EditorPane />
    </SidebarInset>
  </SidebarProvider>
</DocumentProvider>
```

**NavigationHandler**: Syncs window.location.hash ↔ DocumentContext.openDocument()

### 1.7 Document Context (packages/app/src/editor/DocumentContext.tsx)

**Purpose:** Owns ProviderPool (singleton of HocuspocusProvider instances), exposes context for children.

**DocumentContextValue**:

```typescript
interface DocumentContextValue {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;  // 'connecting' | 'synced' | 'disconnected'
  openDocument: (docName: string) => void;
  closeDocument: (docName: string) => void;
}
```

**ProviderPool** (packages/app/src/editor/provider-pool.ts):

- LRU pool (default size 10) of HocuspocusProvider instances
- Survives React re-renders (module-level singleton)
- Auto-connects to `ws://<host>/collab` on construction
- Evicts LRU entry when capacity exceeded (never evicts active doc)
- Tracks syncState per provider
- On first sync, calls setupObservers() to attach markdown↔Y.Doc bidirectional sync

### 1.8 Editors (packages/app/src/editor)

**TiptapEditor.tsx**:

- ProseMirror-based WYSIWYG editor
- Collaboration extension + Hocuspocus provider
- Custom cursor rendering (agents invisible per NG1)
- Agent flash state for visual feedback on edits (isolated to ref, never triggers re-renders)

**SourceEditor.tsx**:

- CodeMirror 6 markdown editor
- yCollab for CRDT sync
- Awareness mode tracking: 'source' vs 'wysiwyg'

**File sidebar** (FileSidebar.tsx):

- Fetches `/api/documents` on mount
- Builds tree structure from flat docName list
- Collapsible folder tree
- Keyboard navigation (arrow keys, Enter to select)

### 1.9 Vite Plugin (packages/app/src/server/hocuspocus-plugin.ts)

**Purpose:** Co-locates Hocuspocus in dev mode (same process as React app).

- Resolves content config from `.open-knowledge/config.yml`
- Creates content filter (gitignore + config.content.exclude)
- Initializes Hocuspocus at module scope
- Wires WebSocket via Vite HTTP server
- Keeps watcher/shadow repo handles for hot reload cleanup

---

## 2. File System Topology

### 2.1 Project structure

```
project-root/
├── .open-knowledge/
│   ├── config.yml              # Workspace-scoped config (content.dir, persistence debounce)
│   ├── catalogs/               # Agent-read metadata index
│   │   └── .open-knowledge/    # Nested OK dir for catalog metadata
│   ├── AGENTS.md               # List of available agents
│   ├── INDEX.md                # Hand-curated index
│   └── .git/                   # Shadow repo (created by initShadowRepo)
│       ├── refs/wip/main       # WIP branch for version history
│       └── objects/            # CRDT state snapshots
├── .mcp.json                   # MCP server entries (written by `init` command)
├── content/                    # Default content directory (customizable via config.yml)
│   ├── document1.md
│   ├── document2.md
│   └── folder/
│       └── document3.md
├── .git/                       # User's own git repo (not touched by OK)
└── ...
```

**Config** (config.yml):

```yaml
content:
  dir: .                         # Relative to project root
  include:
    - "**/*.md"
  exclude: []

persistence:
  debounceMs: 2000              # CRDT→disk debounce
  maxDebounceMs: 10000
```

**Shadow repo structure** (.open-knowledge/.git):

- Bare repo (no working tree)
- Branch `refs/wip/main` stores WIP snapshots after each disk→git commit cycle
- Refs under `refs/wip/<branch>/<writer-id>/` store parked in-flight edits (3-way merge during branch switches)
- Each commit records doc markdown content + user/agent origin
- Rescue buffer at `.open-knowledge/.git/rescue/` saves uncommitted content before delete

### 2.2 MCP configuration

**.mcp.json** (written by `open-knowledge init`):

```json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
```

This allows Claude Code / Cursor to communicate with OK's MCP server.

---

## 3. Server Startup Contract

### 3.1 Startup sequence

1. **CLI parses config** (cli.ts:41–65)
   - Reads `.open-knowledge/config.yml` + env vars + flags
   - Resolves contentDir relative to cwd

2. **HTTP server created** (start.ts:77–120)
   - Node http.createServer()
   - Routes: `/api/*` → Hocuspocus, `/collab` → WebSocket, `/*` → React SPA

3. **Hocuspocus instantiated** (standalone.ts:130–153)
   - Debounce timers set
   - Extensions: persistence + API
   - Does NOT await async init

4. **Async init starts** (standalone.ts:426–687)
   - Shadow repo init/integrity check
   - File watcher start
   - HEAD watcher start
   - Populated ready promise

### 3.2 Port binding

- Default: 8080 (configurable via PORT env or --port flag)
- Binds to 127.0.0.1 (localhost) unless --host specified
- HTTP + WebSocket on same port (WebSocket upgrade via Express middleware)

### 3.3 WebSocket endpoint

- Path: `/collab`
- Full URL from browser: `ws://localhost:8080/collab`
- Hocuspocus protocol: Y.js binary format over ws frames
- Document name extracted from client-side URL parameter

### 3.4 Graceful shutdown

```typescript
async function shutdown() {
  await persistence.flushPendingGitCommit();  // Wait for current commit
  await persistence.waitForPendingCommits();  // Wait for all queued commits
  if (watcher) await watcher.unsubscribe();
  if (headWatcher) await headWatcher.unsubscribe();
  await sessionManager.closeAll();
  hocuspocus.flushPendingStores();
  if (shadowRef.current) destroyShadowRepo(shadowRef.current);
}
```

Listens for SIGINT/SIGTERM; user can Ctrl+C.

### 3.5 Content discovery

- **contentDir:** Resolved at startup from config + CLI (absolute path)
- **Glob patterns:** includePatterns=['**/*.md'] by default, applied during watcher init
- **Excluded paths:** gitignore rules + config.content.exclude patterns

---

## 4. React App Entry Contract

### 4.1 WebSocket connection

**ProviderPool constructor** (provider-pool.ts:33–35):

```typescript
constructor(maxSize = 10, wsUrl?: string) {
  this.wsUrl = wsUrl ?? `ws://${globalThis.location?.host ?? 'localhost'}/collab`;
}
```

Connects to `ws://localhost:8080/collab` by default (inferred from browser's current location).

### 4.2 Document lifecycle

1. **openDocument(docName)** → ProviderPool.open(docName)
   - Creates HocuspocusProvider with name=docName
   - Adds to pool (evicts LRU if at capacity)
   - Subscribes to sync state changes
   - On first sync: calls setupObservers() to attach bidirectional listeners

2. **closeDocument(docName)** → ProviderPool.close(docName)
   - Disconnects provider
   - Removes from pool

### 4.3 Sidebar document list

**FileSidebar.tsx**:

- `useEffect` fetches `/api/documents` on mount
- Parses JSON array: `[{docName, size, modified}, ...]`
- Builds tree from flat list (splits docName on `/`)
- Renders collapsible folders + file icons

### 4.4 Editor state durability

- All edits go to Y.Doc first (CRDT)
- Hocuspocus persistence extension writes Y.Doc→markdown→disk
- Disk write calls registerWrite(hash) to prevent file-watcher loop
- After max 10s, markdown synced to disk
- After 30s idle, disk→git commit

No in-memory state is lost on editor unmount (Y.Doc persists in memory for duration of provider connection).

---

## 5. CLI Command Surface

| Command | Purpose | Config read | Output |
|---------|---------|-------------|--------|
| `start` (default) | Launch server + serve React | workspace/user/env | HTTP server listening on port |
| `init` | Scaffolds `.open-knowledge/`, writes `.mcp.json` | None (stateless) | `.open-knowledge/` created, `.mcp.json` updated |
| `mcp` | Stdio-based MCP server for editors | workspace/user/env | JSON-RPC stdio stream |

**start** options:

```bash
open-knowledge start [--port <port>] [--host <host>] [--open]
open-knowledge start --cwd /path/to/project
```

**init** options:

```bash
open-knowledge init [--force] [--cwd /path/to/project]
```

**mcp** (no args):

```bash
open-knowledge mcp
```

---

## 6. External Dependencies (Native & Bun-specific)

### 6.1 Native modules

| Module | Package | Purpose | Requires rebuild for Node? |
|--------|---------|---------|---------------------------|
| @parcel/watcher | server | File system monitoring | Yes (native binding for libfsnotify) |
| simple-git | cli, server | Git plumbing | No (spawns git CLI, no native) |

### 6.2 Bun-specific APIs

| API | Used in | Electron compatibility | Notes |
|-----|---------|----------------------|-------|
| `import.meta.dirname` | cli/start.ts:62, app/hocuspocus-plugin.ts:29 | ✅ Node 21+ has this | Must check Node version in Electron |
| `Bun.file()`, `Bun.write()` | None (uses node:fs instead) | ✅ OK | Code is already Node-friendly |
| ESM only | All packages (type: "module") | ⚠️ Electron utilityProcess uses CJS | Build output (tsdown) must be CJS compatible |

### 6.3 ESM vs CJS compatibility

**Current state:**

- All packages are `"type": "module"` (ESM)
- Server exports from packages/server/src are imported as ESM

**Electron impact:**

- Main process can be ESM (Node 22+)
- IPC from utilityProcess (Node runner) is typically CJS
- **Mitigation:** Either build utilityProcess code to CJS, or use Node 22+ ESM in utilityProcess (Electron 40+ supports this)

### 6.4 Build output

- **CLI:** tsdown → dist/cli.mjs (ESM)
- **App:** Vite → dist/ (ESM + HTML + CSS)
- **Server:** Imported as ESM source (no build step, used by app/cli via import.meta.resolve or npm link)

---

## 7. Surfaces Map

### Product surfaces

| Surface | Responsibility | Coupling | Code/3P |
|---------|---|----------|---------|
| **Menu bar** | File, Edit, View menus + keyboard shortcuts | Tight to main process | New (Electron Menu API) |
| **Editor window** | BrowserWindow hosting React app | Medium to renderer | Electron + existing React |
| **Sidebar** | File tree navigator | Loose to API (fetches `/api/documents`) | Existing (FileSidebar.tsx) |
| **Project navigator** | "Open recent projects", "Open folder" | Medium to main process IPC | New (dialog + fs access) |
| **Settings dialog** | Workspace config (debounce, content dir) | Medium to renderer + main | New (React modal + IPC write) |
| **Dock icon** (macOS) | App icon, badge count | Loose (just cosmetic) | Electron Dock API |
| **Conflicts UI** | Show reconciliation conflicts to user | Medium to DocumentContext | New (modal overlay) |
| **Agent flash state** | Visual feedback during agent writes | Loose (CSS animation) | Existing (TiptapEditor ref) |

### Internal surfaces

| Surface | Responsibility | Coupling | Code/3P |
|---------|---|----------|---------|
| **Hocuspocus server** | Real-time sync + persistence | Tight to utilityProcess | Existing (server package) |
| **Y.js documents** | CRDT state | Tight to both renderer + utilityProcess | Existing (Yjs) |
| **File watcher** | Detect external .md changes | Tight to utilityProcess | Existing (@parcel/watcher) |
| **Persistence layer** | Y.Doc→markdown→disk→git | Tight to utilityProcess | Existing (persistence.ts) |
| **MCP stdio bridge** | Editor integration (Claude Code, Cursor) | Loose to utilityProcess | Existing (MCP server in cli) |
| **IPC channels** | Main ↔ utilityProcess | Tight to process model | New (electron.ipcMain/ipcRenderer) |
| **BrowserWindow lifecycle** | Window open/close/reload | Tight to main process | New (Electron BrowserWindow API) |
| **electron-updater** | Auto-update checking | Loose (main process only) | New (3P dependency) |
| **Native dialog API** | File open, folder select, alert | Medium to main process | New (Electron dialog API) |

---

## 8. Process Model & IPC Channels

### Desktop app architecture (candidate)

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Process                         │
│  - Window lifecycle (create/close/hide)                     │
│  - Menu bar + keyboard shortcuts                            │
│  - Project open/recent projects dialogs                     │
│  - IPC listener for renderer requests                       │
│  - electron-updater (check for updates)                     │
│  - Dock icon (macOS)                                        │
└────────────────────────────────────────────────────────────┬┘
        │                                                      │
        │ ipc.send("open-document", docName)                  │
        │ ipc.handle("get-file-index", ...) → HTTP req        │
        │ ipc.send("reload-sidebar")                          │
        └──────────────────┬──────────────────┬───────────────┘
                           │                  │
        ┌──────────────────▼──────┐  ┌────────▼─────────────────┐
        │   Renderer Process       │  │ utilityProcess (Node)    │
        │  (React app in window)   │  │   (Server + watchers)    │
        │                          │  │                          │
        │ - TiptapEditor           │  │ - createServer()         │
        │ - DocumentContext        │  │ - startWatcher()         │
        │ - FileSidebar            │  │ - startHeadWatcher()     │
        │ - ProviderPool           │  │ - HTTP + WS listener     │
        │                          │  │ - Git operations         │
        │ ws://localhost:8080/collab  │                          │
        └──────────────────────────┘  └──────────────────────────┘
                                           ▲
                        localStorage       │
                        cache stores       │ WebSocket frames
                        (optional)         │ (Yjs binary)
```

### IPC channel design

**Main → utilityProcess (request/response)**

| Channel | Data | Response | Purpose |
|---------|------|----------|---------|
| `get-file-index` | (none) | `{docName: size, modified}[]` | Sidebar refresh |
| `create-document` | `{docName, content}` | `{ok, error?}` | New file via dialog |
| `delete-document` | `{docName}` | `{ok, error?}` | Remove file (mark deleted-upstream) |
| `get-config` | (none) | config object | Read workspace config |
| `write-config` | config object | `{ok, error?}` | Update config.yml |

**Renderer → Main (async request)**

| Channel | Data | Response | Purpose |
|---------|------|----------|---------|
| `open-folder` | (none) | path or null | User selects project folder |
| `open-file` | (none) | path or null | User selects .md file to import |
| `show-dialog` | type, message | user choice | Confirm delete, etc. |

**Main → Renderer (notification)**

| Channel | Data | Purpose |
|---------|------|---------|
| `sidebar-updated` | file index | Refresh sidebar after external change |
| `sync-state` | 'synced' or 'error' | Badge on window title |

---

## 9. Prior Research

**Top relevant reports:**

1. **electron-desktop-app-operations-2025** ([evidence/versioning-and-security.md](../../../reports/electron-desktop-app-operations-2025/evidence/versioning-and-security.md))
   - Electron release schedule, versioning, CVE lag, macOS code signing workflow
   - Actionable: Pinning to Electron 41 (March 2026 release) aligns with Node 24.x, Chromium 146

2. **agent-browser-vs-playwright-crdt-testing** ([REPORT.md](../../../reports/agent-browser-vs-playwright-crdt-testing/REPORT.md))
   - Discusses deterministic execution of CRDT operations in browser automation
   - Actionable: Desktop app should pre-populate Yjs docs from disk on startup (no need for agent simulation)

3. **crdt-mcp-filesystem-bridge** ([evidence/](../../../reports/crdt-mcp-filesystem-bridge/evidence/))
   - MCP as bidirectional bridge between editor and CRDT server
   - Actionable: Existing open-knowledge mcp command is already MCP-compatible

4. **git-directory-nesting-shadow-repo** ([REPORT.md](../../../reports/git-directory-nesting-shadow-repo/REPORT.md))
   - Shadow repo pattern for version history in CRDT systems
   - Actionable: Confirms existing `.open-knowledge/.git` approach is sound

5. **auto-persistence-version-history-patterns** ([REPORT.md](../../../reports/auto-persistence-version-history-patterns/REPORT.md))
   - 3-way merge, debouncing, conflict UI patterns
   - Actionable: Document the reconciliation conflict flow in Electron desktop app

---

## 10. Unresolved Questions & Gaps

### Process model

- **Q1:** Should utilityProcess run the server continuously, or start/stop per window?
  - **Current assumption:** Continuous (one server per app lifetime, survives window close/reopen)
  - **Alternative:** Per-window (restart on new window = slower but simpler)
  
- **Q2:** How should project switching work? (close current, open new)
  - **Current assumption:** Destroy current server, start new server with new contentDir
  - **IPC implication:** Main sends "switch-project" to utilityProcess, waits for ready promise

### Packaging & distribution

- **Q3:** Will the desktop app package its own Electron or use system Electron?
  - **Current assumption:** Bundle (electron-builder asar)
  - **Impact:** asar size (current app ~150MB estimated), signed updates via electron-updater

- **Q4:** What's the minimum macOS version? (Affects code signing entitlements)
  - **Evidence:** Electron 40+ requires macOS 12.6 (Monterey) minimum
  - **Decision needed:** Scope in SPEC

### Native integration

- **Q5:** Should Open Knowledge detect and offer to import from external editors (VS Code recent files)?
  - **Current assumption:** Out of scope (v1 focuses on folder picker)
  - **Effort:** Low (enumerate ~/.config/Code/User/globalStorage/*/workspaceState.json)

- **Q6:** File right-click context menu in Finder → "Open in Open Knowledge"?
  - **Current assumption:** Out of scope (v1 focuses on native menu bar)
  - **Effort:** Medium (requires LaunchServices UTI registration + main process handler)

### Server shutdown

- **Q7:** If user closes window while edits are pending, should we:
  - (a) Block close until all edits persisted to disk+git?
  - (b) Auto-save in background, then close immediately?
  - (c) Ask user to wait?
  - **Current assumption:** (a) hard block (app.on('before-quit') prevents close)

### Conflict resolution UI

- **Q8:** Who resolves conflicts (user or AI agent)?
  - **Current assumption:** User UI (new modal component)
  - **Impact:** Requires 3-way diff UI + "keep ours/theirs/both" buttons
  - **Depends on:** Spec for conflict UX

### MCP vs desktop APIs

- **Q9:** Should MCP still run in desktop app, or only in CLI?
  - **Current assumption:** Keep in both (mcp command works standalone, desktop app can spawn server over IPC)
  - **Alternative:** Remove MCP from desktop app (users use Claude Code / Cursor instead of desktop app for AI)

---

## Summary

The codebase is well-structured for desktop wrapping. The server is pure Node.js, the React app is WebSocket-native, and file I/O uses standard Node APIs. The main design challenge is IPC choreography between main, renderer, and utilityProcess. The key insight is that the Hocuspocus server should live in utilityProcess (not main), and the renderer should connect via localhost WebSocket just as it does in the web app.

**Critical coupling points:**

1. utilityProcess must initialize before renderer connects (ready promise)
2. File watcher events in utilityProcess should notify renderer (IPC channel)
3. Graceful shutdown must flush all pending git commits
4. Config changes (workspace settings) require utilityProcess reload

**Existing OK patterns that scale well to Electron:**

- Per-branch reconciled base (survives window close)
- Content filter (gitignore aware)
- Self-write detection (prevents loops even if watcher fires)
- Parked WIP state (allows branch switch recovery)

