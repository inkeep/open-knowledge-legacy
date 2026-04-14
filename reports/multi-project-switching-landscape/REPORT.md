# Multi-Project Switching Landscape for Open Knowledge

**Date:** 2026-04-14

## Relationship to Prior Art

The `onboarding-multiproject-ux` report (2026-04-08) established: `~/.open-knowledge/projects.json` with frecency ordering, auto-populated on `init`/`start`; per-project `.mcp.json`; MCP Roots as the eventual multi-root primitive. It surveyed VS Code, Obsidian, JetBrains, Raycast switching patterns.

This report extends it along three axes the prior work deferred:

1. **Running-server lifecycle** — who starts/stops/surfaces/reaps the per-project processes.
2. **Cross-project hub UX** — the surface the user touches (tray, web hub, CLI, launcher), not just the JSON underneath.
3. **MCP scope across projects** — privacy and consent tradeoffs for global vs per-project agent scope.

Since the prior report, `server.lock` landed. That makes cross-project discovery trivial: a glob over `~/**/.open-knowledge/server.lock` answers "what's running right now?" with zero new infrastructure. This report assumes that primitive.

---

## 1. Today's Actual UX

- User runs `open-knowledge start` per project. Each instance gets its own process + kernel-assigned port + `server.lock` at `<contentDir>/.open-knowledge/server.lock` containing `{pid, hostname, port, startedAt, worktreeRoot}`.
- `bun run dev` and `open-knowledge start` against the same content dir fail fast via shared lock.
- User discovers ports via the terminal banner or `lsof`. No list, no tray, no hub.
- MCP clients read the project-local `.mcp.json`. At runtime, MCP auto-discovers the live port via `server.lock`; falls back to disk-only if nothing running.
- Net: for five projects, five terminals, five URLs, no cross-KB view.

---

## 2. Landscape Survey

### 2.1 Vault-style (Obsidian, Logseq)

**Obsidian** — manually registered vaults; last vault opens by default; `Cmd+Shift+O` modal lists recents. Vaults are fully isolated (plugins, hotkeys, graph). Community plugins Vault Hopper and Workspaces only bookmark vault+file pairs; no aggregation. The `obsidian://open?vault=X&file=Y` URL scheme is the hook launchers use.

**Logseq** — graphs = vaults; welcome screen shows recent graphs on launch. No cross-graph search.

**Lesson:** both treat the vault as the atomic app context. Simple, but forecloses cross-project agents.

### 2.2 IDE-workspace (VS Code, Cursor, JetBrains)

**VS Code Cmd+R** — sub-second fuzzy switch over `Recent`; per-workspace tab restoration; multi-root workspaces hold N folders as one logical unit. The `Ports` panel is a relevant server-registry analogue.

**Cursor** — inherits VS Code recents; adds per-project `.cursor/rules/`, isolated per workspace. No cross-project AI view.

**JetBrains Welcome Screen / Toolbox** — groups recents by tags; "project groups" as saved collections; Toolbox handles per-IDE version management.

**Lesson:** Recent + frecency + fuzzy is the floor. Multi-root matters for monorepos, is distinct from switching.

### 2.3 Server-registry-style — the main gap vs prior report

**pm2** — `pm2 list` table (name/pid/port/mem/uptime/restarts); `~/.pm2/dump.pm2` persists for `resurrect`; `pm2 monit` TUI; `pm2 logs <name>` tails. A `PM2 God` daemon owns processes. Killer feature; downside: always-on daemon is out of scope.

**Docker Desktop tray** — menu-bar icon shows "N containers running"; dropdown lists each with start/stop; full dashboard is Electron. Tray is a view over the same daemon state `docker ps` reads.

**VS Code Ports panel** — auto-detects bound ports inside the editor's process tree; for Remote/Codespaces proxies over a public URL. Closest pattern to daemonless OK: probe `~/**/.open-knowledge/server.lock`, filter live PIDs, render.

**GitHub Codespaces "Your codespaces"** — lists running/stopped/recent with resume-in-place. Cloud, but the UX ("some running, some paused") transfers.

**tmux / zellij** — `tmux ls` / `tmux attach -t <name>`. Named environments the user re-enters. Naive OK analogue: `open-knowledge sessions` + `attach <name>`.

**Lesson:** without a daemon, state lives in filesystem (lockfiles, projects.json); "registry" is a read-side aggregation. Exactly what `server.lock` enables.

### 2.4 Menu-bar / tray UIs

**Syncthing, Tailscale, Rectangle, Raycast** — ambient menu-bar. Implementation: native Swift (Rectangle, Tailscale), Electron `systemTray` (Docker Desktop), Tauri, or xbar/SwiftBar plugin (a shell script emitting menu lines).

For OK, **xbar/SwiftBar** is compelling as MVP: a ~40-line script that globs server.locks, checks PIDs, emits a menu. Zero app, zero daemon — the host polls (~60s).

**Raycast script commands** — launcher equivalent. Type "ok," fuzzy project list. Community extensions already index VS Code/JetBrains/iTerm recents; an OK extension aggregates into the user's existing launcher habit.

**Lesson:** users already have menu-bar/launcher habits. Adding one more costs little if daemonless and shows live state + one-click open.

### 2.5 Cross-project search / unified view

**Obsidian** — no official cross-vault search; community Omnisearch is single-vault. Users fall back to Spotlight / `rg`.

**Raycast** — indexes files across configured folders via Spotlight; searches "all my markdown" with zero setup.

**Notion / Reflect / Mem** — cloud-first, single global workspace per account; cross-workspace = different tab. N/A locally.

**Spotlight / `mdfind` / Recoll / DevonThink** — OS-level full-text indexers already index every markdown file on the machine. Any OK "global index" that only does full-text is re-inventing Spotlight.

**Lesson:** a global OK index has value only beyond Spotlight/`rg` — backlinks, typed frontmatter relations, agent-attribution queries. Bare FTS cross-search is not worth building.

### 2.6 MCP scope across projects

| Option | Registration | Claude in A sees B? |
|---|---|---|
| Per-project (today) | `.mcp.json` in repo | No |
| Global user-scope | `~/.claude.json` | Yes, all registered |
| Directory-scoped auto-attach | Hook on cwd change | Implicit current only |
| Federation | `.mcp.json` + registry | Via `switch_project` tool call |

Claude Code's 3-scope config supports the global path today. Cursor/Windsurf/VS Code are project-only as of 2025.

**Privacy tradeoff:** global = "work project Claude can see personal-journal project." Feature for some, violation for others (client A KB must never leak to client B session).

**Convergence from other ecosystems:** explicit-switch-with-persistence is cleanest. VS Code remembers per-terminal workspace; JetBrains tags by client; Cursor scopes rules to workspace. Per-directory-implicit is the default because cwd is a strong intent signal. MCP Roots extends this protocol-level.

---

## 3. Pattern Archetypes

**A. CLI-only (pm2, tmux)** — state in `~/.open-knowledge/`, `projects` / `open` / `stop` commands. Fits terminal natives and agents; misses discoverability for forgotten projects.

**B. Vault-switcher (Obsidian)** — modal inside the editor app. Fits users living in the editor; misses the no-project-active-yet state.

**C. Hub page (Codespaces dashboard, Docker Desktop UI)** — `open-knowledge hub` starts a tiny server on a well-known port; all projects, live-status, cross-project search. Fits users wanting a "home"; adds a process the user must start.

**D. Ambient tray (Docker tray, xbar)** — menu-bar icon with live projects. Fits passive awareness; macOS-biased unless extended.

These are composable — same registry, different surfaces.

---

## 4. Option Space

### Option 1 — CLI `projects` / `open` / `stop` (1-2 days)

```
$ open-knowledge projects
  PROJECT       PATH                  STATUS       LAST OPENED
  my-product    ~/work/my-product     live :5173   2h ago
  research      ~/notes/research      live :5174   yesterday
  journal       ~/notes/journal       stopped      3d ago

$ open-knowledge open research        # browser-open :5174
$ open-knowledge open journal         # start + open
$ open-knowledge stop my-product      # SIGTERM pid from lock
```

Glue over `server.lock` + `projects.json`. Each `start` registers itself. `--json` unlocks Raycast/xbar consumption.

### Option 2 — In-editor switcher (3-5 days)

React command palette fetches `/api/projects`, navigates the tab to target project's `http://localhost:<port>`. Pure web navigation; target must be running (or user clicks "Start" which opens a shell URL handler — defer that path). Extension: `localStorage`-persisted per-project tab state.

### Option 3 — Hub page on well-known port (1 week)

`open-knowledge hub` starts read-mostly single-page app on port 5100 (or next available, persisted to `~/.open-knowledge/hub.lock`). Lists projects with live-status via `server.lock` probes, offers "Open" and "Start," implements cross-project search by shelling `rg` across registered content dirs. Localhost-only bind. Later this becomes the natural host for a federated MCP router (Option 5).

### Option 4 — xbar / SwiftBar plugin (half-day)

~40-line script shipped in `packages/cli/xbar/open-knowledge.5m.sh`. User drops into `~/Library/Application Support/xbar/plugins/`. Zero runtime deps, zero daemon. Pair with a Raycast extension that reads the same `projects.json` for non-macOS-menubar users.

### Option 5 — Global MCP federation (1-2 weeks; depends on Option 3)

`open-knowledge mcp --global` registered in `~/.claude.json`:
1. `list_projects` tool
2. Existing tools gain required `projectId` param
3. Routes to target project's running server (or starts on-demand)
4. First-touch consent per (agent, project) stored at `~/.open-knowledge/consent/<agent-id>/<project-id>`

Default MUST remain per-project. Global is an opt-in upgrade. Later: `resolve_link(slug)` to span projects.

---

## 5. Recommendation

**Build first (MVP):**
1. **Option 1 (CLI `projects`)** — smallest, highest leverage, dependency of everything else. Formalizes `projects.json` and gives power users real tooling today. Mostly glue over existing primitives.
2. **Option 4 (xbar plugin)** — half-day, zero runtime obligation, instantly tells users "your projects are visible without a terminal."

These validate the registry and cover terminal-native + GUI-ambient archetypes.

**Build next:**
3. **Option 3 (hub page)** — highest-signal surface for non-terminal users. Bind well-known port, read-mostly, "start project" as only action verb. Natural home for cross-project search via shelled `rg` (do not build a new index).
4. **Option 2 (in-editor switcher)** — once users run multiple projects routinely. Small if the hub already exists (reuse `/api/projects`).

**Explicitly defer:**
- **Option 5 (global MCP federation).** High cost; unclear demand until Options 1-4 reveal whether users want cross-project agent scope or are happy scoped to cwd. MCP Roots may mature during this window.
- **Native menu-bar app** (Electron/Tauri/Swift). xbar covers 90% at <1% cost. Revisit only if xbar proves inadequate.
- **Custom cross-project full-text index.** Spotlight/`rg` cover common case. Build domain-specific index only when backlinks/typed relations need to span projects — and only if federation lands on "cross-project by default."

**Non-negotiables carried from the brief:** no always-on daemon; no globally-unique port registry; no cloud. Registry reads = synchronous FS scans; writes on `start`/`stop`; everything localhost + file-backed + user-owned.

---

## 6. Open Implementation Questions

- **Register on `init` vs `start`:** recommend `start` only. A never-started project has never been used; absence is correct. `init` creates `.open-knowledge/` but does not touch the user registry.
- **First-time hub discovery** of pre-registry projects: one-time opt-in scan of `~/`, `~/work/`, `~/code/` for `.open-knowledge/config.yml` markers on first `hub` launch. Thereafter, only registered-on-start additions.
- **Rename/move detection.** Stale entries surface via path-exists probe on each `projects` read; mark stale; after N days, prompt to remove. Same grace-period pattern as shadow-branch GC.
- **Shared wiki-links across projects** — needed for federation (Option 5), deferred. Resolution order when built: local project first, then consented peers in last-used order; ambiguous `[[Foo]]` prompts for project.

---

## References

- Prior extended report: `reports/onboarding-multiproject-ux/REPORT.md` — D2, D5, D6 provide the foundation.
- `server.lock` primitive: `packages/server/src/server-lock.ts`.
- Existing CLI commands surface: `packages/cli/src/commands/` — `projects`, `open`, `stop`, `hub` would be new siblings to `start` / `init` / `mcp`.
