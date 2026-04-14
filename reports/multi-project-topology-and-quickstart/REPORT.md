# Multi-project topology & quickstart

**Date:** 2026-04-14
**Companion to:** `onboarding-walkthrough-audit`, `claude-auto-open-editor-ux`, `multi-project-switching-landscape`

This report answers four concrete questions that came up reading the first three:

1. What does the user actually type to get started (machine-level install, per-project enable)?
2. How many of each kind of server exist, today and under the "global hub" proposal?
3. What do real multi-project scenarios look like end-to-end?
4. How does a globally-running frontend discover the projects on a user's machine?

---

## 1. Quickstart — current shape, assumes F1/F2 from the audit are fixed

### 1.1 One-time machine setup

```bash
# Install the CLI globally (either runtime works — Node 22+ or Bun 1.3.11+)
npm install -g @inkeep/open-knowledge
# or: bun install -g @inkeep/open-knowledge

# Verify
open-knowledge --version
# → @inkeep/open-knowledge 0.x.y
```

**What this installs.** One binary — `open-knowledge` — on your `PATH`. Three subcommands matter: `init`, `start`, `mcp`. No background service is started. No files are written outside the npm/bun global prefix.

### 1.2 Enable for a project

```bash
cd ~/work/my-product
open-knowledge init
```

Interactively prompts: *"Which editors do you use?"* — multi-select Claude Code / Cursor / Windsurf / VS Code. Writes:

- `.open-knowledge/config.yml` — per-project config (content dir, include/exclude globs, persistence timings)
- `.open-knowledge/AGENTS.md` — the tool-usage guide Claude reads on MCP connect
- `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), `.vscode/mcp.json`, etc. — one stanza per selected editor, all pointing at `{ command: "npx", args: ["@inkeep/open-knowledge", "mcp"] }`

**No process is started yet.** `init` is config-only.

### 1.3 Start the editor + collaboration server

```bash
open-knowledge start
```

Boots one long-running process. Banner prints the URL (`http://localhost:5173` or next free port) and writes `.open-knowledge/server.lock`. Leave this running; open the URL; edit. Claude/Cursor sessions opened in that project will pick up the live port automatically via the lock file.

### 1.4 Verification checklist

```bash
# 1. The CLI is on your PATH
open-knowledge --version

# 2. The project is enabled
ls .open-knowledge/
# → AGENTS.md  config.yml  .gitignore

# 3. The editor is running
cat .open-knowledge/server.lock
# → {"pid":47231,"port":5173,"hostname":"…","startedAt":"…","worktreeRoot":"…"}

# 4. MCP is registered for your editor
cat .mcp.json   # Claude Code
# → {"mcpServers":{"open-knowledge":{"command":"npx","args":["@inkeep/open-knowledge","mcp"]}}}

# 5. From inside the editor tab, ask Claude: "What tools do you have?"
#    → should list init-content / ingest / research / write_document / etc.
```

That's the full onboarding surface. Everything else (version history, shadow repo, reconciliation, CC1 signal push) initializes transparently when `start` boots.

---

## 2. Server inventory

Counting servers is the clearest way to reason about topology. Three distinct server roles exist; the audit and meeting notes sometimes conflate them.

### 2.1 Roles

| Role | What it does | Lifecycle | Listener |
|---|---|---|---|
| **Frontend server** | Serves the React editor SPA (HTML/JS/CSS) as static files | Long-running | HTTP |
| **Collaboration server** | Hocuspocus — CRDT WebSocket, persistence, file-watcher, shadow repo, API | Long-running | WebSocket + HTTP /api routes |
| **MCP server** | stdio JSON-RPC endpoint Claude/Cursor speaks to | Spawned per editor session, dies when editor closes | stdio |

### 2.2 Today's count — per project

**One process, two listeners.** `open-knowledge start` launches a single Node/Bun process. Inside it:

- One HTTP listener on port P, handling three things via URL routing:
  - `/` → serves the React SPA static assets (frontend)
  - `/api/*` → collaboration server's REST API (documents, rescue, metrics, save-version)
  - `/collab` → WebSocket upgrade into Hocuspocus (collaboration)

So **frontend server and collaboration server are the same process today**. They share the port. "One server" is accurate from the user's point of view.

**MCP servers are separate.** Each editor (Claude Code session, Cursor window) that has `open-knowledge` in its `.mcp.json` spawns its own `npx @inkeep/open-knowledge mcp` subprocess when it opens. The subprocess lives for the duration of the editor session. It reads `.open-knowledge/server.lock` to connect to the running collaboration server; if there is none, it operates in disk-only mode.

### 2.3 Today's count — across N running projects

| Server type | Count (N projects × K editors per project) |
|---|---|
| Frontend server | N (one per project, same process as collab) |
| Collaboration server | N (same processes as above) |
| MCP server | up to N × K (one per editor per project, short-lived) |

In practice K is 1–3 (Claude Code + maybe Cursor + maybe VS Code for the same project).

### 2.4 Under the "global hub" proposal (from `multi-project-switching-landscape`)

The hub is **an additional frontend server** sitting on a well-known port, showing project list + cross-project search. It does not replace per-project servers.

| Server type | Count | Notes |
|---|---|---|
| Frontend server (hub) | **1 global** | Listens on e.g. `localhost:5100`, bound by `~/.open-knowledge/hub.lock`. Lists all known projects. |
| Frontend server (project editor) | N per-project | Unchanged from today. Served by each project's collab process. |
| Collaboration server | N per-project | Unchanged. CRDT scope is per-project; shadow repos are per-project; cannot be merged without major rework. |
| MCP server | up to N × K | Unchanged, unless Option 5 (global MCP federation) ships — then +1 global MCP process. |

**Key architectural claim.** Collaboration servers *must* stay per-project because their state (CRDT docs, shadow git refs, file-watcher index, reconciliation base) is scoped to one content directory. Frontend servers *can* unify: the SPA already knows how to connect to a named Hocuspocus endpoint. The hub is mostly a project picker + router.

### 2.5 Under "global frontend, decoupled from collab" (further future)

A more aggressive refactor: strip the static-asset serving out of `start`; have `start` only run Hocuspocus + API. The SPA is served exclusively by the hub (or from an npm-installed location), and connects via WebSocket to whichever project's Hocuspocus URL the user chose.

| Server type | Count |
|---|---|
| Frontend server | **1 global only** |
| Collaboration server | N per-project (HTTP API + WS only, no SPA) |
| MCP server | N × K |

Tradeoff: cleaner topology, smaller per-project process, one place to deploy frontend updates. Cost: CORS setup (frontend on port 5100 calling collab on port 5173 is cross-origin), loses the "just open localhost:5173 and go" simplicity, adds a hub-install step to the happy path.

**Recommendation:** keep today's combined process as the default; layer the hub as an optional additional frontend. Do not decouple the per-project SPA serving until there's pressure to.

---

## 3. Multi-project scenarios

Four narratives, from simplest to most load-bearing.

### Scenario A — "I use it for one project"

Single project. `open-knowledge start` in one terminal. Claude Code in the same project. This is the quickstart above; no multi-project machinery needed.

**Servers live:** 1 collab+frontend process, 1 MCP stdio per Claude session. Total: 2.

### Scenario B — "I have two projects and I switch between them a few times a day"

User has `~/work/product-docs` and `~/notes/research`. Each has its own `.open-knowledge/`.

**Today's experience:**
- Two terminals open. `cd ~/work/product-docs && open-knowledge start` — port 5173. `cd ~/notes/research && open-knowledge start` — port 5174.
- Two browser tabs. User has to remember or bookmark which port is which.
- Claude in product-docs sees only product-docs content. Claude in research sees only research content. No cross-talk.

**Servers live:** 2 collab+frontend processes, 2–4 MCP stdio processes. Total: 4–6.

**With `open-knowledge projects` CLI (Option 1 in the landscape report):**

```bash
$ open-knowledge projects
  PROJECT        PATH                  STATUS       LAST
  product-docs   ~/work/product-docs   live :5173   now
  research       ~/notes/research      live :5174   2m ago

$ open-knowledge open research        # opens http://localhost:5174 in browser
```

The user manages both from one terminal. Browser tabs still separate.

### Scenario C — "I have ten projects; only a few are active this week"

Mixed — some are projects that `open-knowledge start` has been run against; most are dormant. User wants:
- A list of "everything that exists" even if the server isn't running.
- "Everything that's live right now" as a subset.
- One-click open from the list; one-click start if not live.

**Today:** impossible without manual bookkeeping. Ten terminals or tmux windows. User forgets which projects are OK-enabled.

**With hub (Option 3):**

```bash
$ open-knowledge hub
  Hub running at http://localhost:5100
  → Open http://localhost:5100 to see all your knowledge projects
```

At `localhost:5100` the user sees:

```
Open Knowledge — your projects

LIVE (2)
  ● product-docs    ~/work/product-docs   :5173  →  [Open]
  ● research        ~/notes/research      :5174  →  [Open]

RECENT (8)
  ○ proposal-q2     ~/work/proposal-q2           →  [Start]
  ○ talk-notes      ~/talks/talk-notes           →  [Start]
  ○ journal         ~/notes/journal              →  [Start]
  …

[+ Add existing project…]
```

Live list comes from globbing `~/.open-knowledge/projects.json` and probing each project's `server.lock` for a live PID. "Start" invokes `open-knowledge start` in the target directory via the OS shell (or, if the hub is part of the collab binary, via a child process).

**Servers live (steady state):** 1 hub + 2 active per-project collab + 2–4 MCP stdio. Total: 5–7. The hub itself is one additional process — cheap.

### Scenario D — "I want Claude to reference knowledge from multiple projects in one conversation"

User is writing a proposal that cites notes from `research/` and design patterns from `product-docs/`. Both need to be queryable from one Claude Code session.

**Today:** not possible — `.mcp.json` is per-project; Claude in `proposal-q2` only sees `proposal-q2` content.

**Workarounds available today:**
- Symlink the other projects' content directories into `proposal-q2` — works because OK resolves symlinks by realpath and shares one Y.Doc per inode.
- Use Claude's file-reading tools (`Read`) to read the other projects' .md files raw — bypasses MCP, no CRDT, no backlinks.

**Future (Option 5 in landscape report):** `open-knowledge mcp --global` registered in `~/.claude.json`; exposes a `list_projects` tool + project-scoped versions of every existing tool. Consent-gated per (agent, project). This is the load-bearing feature for cross-project knowledge work; it's also the highest-cost one, and all three reports recommend deferring it until after the hub and CLI projects-list land.

**Servers live under Option 5:** 1 hub + N active collab + 1 global MCP + per-editor project-scoped MCPs. Count depends on whether per-project MCPs are retained (recommended yes, for backwards compat) or replaced.

---

## 4. Project discovery from a globally-running frontend

The question is: when the user opens `http://localhost:5100` (the hub), where does it get its list of projects from? Three complementary mechanisms — the hub should use all three.

### 4.1 Mechanism 1 — Explicit registry (`~/.open-knowledge/projects.json`)

Primary source of truth for "projects the user has touched."

**Schema:**
```jsonc
{
  "version": 1,
  "projects": [
    {
      "id": "7f3b…",                  // stable UUID, generated on first register
      "name": "product-docs",          // default = basename(path); editable
      "path": "/Users/andrew/work/product-docs",
      "firstSeen": "2026-03-11T…",
      "lastSeen": "2026-04-14T…",     // updated on each start
      "lockPath": ".open-knowledge/server.lock"
    }
  ]
}
```

**Write events:**
- `open-knowledge start` appends/updates on successful boot. Idempotent — same path bumps `lastSeen` only.
- `open-knowledge stop` (if we add it) updates `lastSeen`.
- Hub UI "Remove project" deletes the entry (does NOT delete the project's `.open-knowledge/`).

**Read events:**
- Hub reads this on every list request.
- `open-knowledge projects` CLI reads this.
- Raycast / xbar plugins read this.

**Why `init` should NOT write to this.** A project that was enabled but never started is indistinguishable, to the user, from clutter. Only projects the user has actually used appear. Simpler mental model.

### 4.2 Mechanism 2 — Live-server probe via `server.lock`

For each entry in the registry, check `<path>/.open-knowledge/server.lock`:

```typescript
const lock = readServerLock(project.path);
if (lock && isProcessAlive(lock.pid)) {
  project.status = { live: true, port: lock.port };
} else {
  project.status = { live: false };
}
```

This is a synchronous FS + PID check — no daemon, no subscriptions. The hub re-probes on every page load (or every 5s via polling) and the answer is always fresh.

Stale locks (PID dead) are detectable and ignorable. The same `isProcessAlive()` helper already exists in the codebase (`packages/server/src/process-alive.ts`).

### 4.3 Mechanism 3 — First-run filesystem scan (opt-in)

For users who had projects before the registry existed, or who manually cloned a project with a `.open-knowledge/` directory, the hub offers a one-time scan:

> *"Scan `~/`, `~/work/`, `~/code/` for Open Knowledge projects? This may take a minute."*

The scan globs for `**/.open-knowledge/config.yml` (the canonical project marker), inserts found paths into the registry, and doesn't repeat unless the user asks. Git-ignored directories (`node_modules/`, `.venv/`, etc.) are skipped — we can't rely on the user's own `.gitignore` so we hardcode the common noise patterns.

### 4.4 Discovery flow end-to-end

```
 hub loads
      │
      ▼
 read ~/.open-knowledge/projects.json  ◄──── (Mechanism 1)
      │
      ▼
 for each project: read server.lock + isProcessAlive(pid)  ◄──── (Mechanism 2)
      │
      ▼
 if registry empty on first launch:
      prompt: "Scan home directory for projects?"
         └── if yes → glob for **/.open-knowledge/config.yml  ◄──── (Mechanism 3)
              └── write results to registry
      │
      ▼
 render list: live projects first, recent next
```

**Rename/move robustness.** On each registry read, check `existsSync(project.path)`. If the directory is gone, mark as "missing" and surface a one-click "Locate…" action. After 30 days of missing status, prompt to delete the registry entry. Same grace-period pattern as the shadow-branch GC.

**Multi-user on shared machine.** `~/.open-knowledge/projects.json` is per-user (in `$HOME`). Not a concern today. If it ever becomes one, path-scoped to `$HOME` is already correct.

### 4.5 What the hub does NOT do

- **Does not index document content.** Cross-project search shells out to `rg` on the fly (from the landscape report recommendation). No background index, no search daemon.
- **Does not keep servers alive.** If a project's collab server dies, the hub shows it as "stopped." Hub does not auto-restart.
- **Does not open sockets to per-project servers.** It reads `server.lock` over the filesystem. The per-project SPA makes its own WebSocket connection when the user clicks "Open."

---

## 5. Summary: server counts at each proposal tier

| Configuration | Frontend | Collab | MCP (steady state) | Total processes |
|---|---|---|---|---|
| Single project, today | 1 (combined) | (same) | 1–3 | 2–4 |
| 2 active projects, today | 2 (combined) | (same) | 2–6 | 4–8 |
| N active projects + hub MVP | 1 hub + N project | N | N–3N | 1 + 2N–4N |
| N active projects + hub + global MCP | 1 hub + N project | N | 1 global + N project | 2 + 2N + per-editor |
| Decoupled frontend (deferred) | 1 hub only | N (API+WS only) | N per-project or 1 global | depends |

The hub adds exactly one process. Everything else is a function of how many projects the user has actively running.

---

## 6. What to build in what order (from across the three reports)

A combined punchlist:

1. **Fix F1** (asset-path) and **F3** (default excludes) from the audit — prerequisite to anything else being usable.
2. **Ship `projects.json` registry** written on `start`. Zero UI.
3. **Ship `open-knowledge projects` / `open` / `stop` CLI** over the registry + `server.lock`.
4. **Ship auto-open-once-per-session** via `open -g` (Phase 1 of the Claude auto-open report).
5. **Ship `open-knowledge hub`** — the global frontend at a well-known port, consuming the registry.
6. **Consider everything else** (MCP App status card, global MCP federation, xbar plugin, Raycast extension).

Steps 2–4 are each a day or two of work and are independently useful. Step 5 is a week. Step 6 items are optional polish.
