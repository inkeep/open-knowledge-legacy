# Story: Web editor onboarding + project registry and switching

**Last verified:** 2026-04-12

> **Split notice (2026-04-12):** This story was originally shaped as two parts.
> **Part A (onboarding)** is now owned by `projects/day-0-editor-completeness/PROJECT.md` as story **ED-4**.
> **Part B (project switching)** remains here as a standalone story — a sibling bet, not within the day-0 editor completeness project.
> The content below is preserved intact for traceability and as the source of truth for Part B.
> Part A's canonical home is the project; this file retains it for the draft PR (#75) history.

---

## Part A — Web editor initialization and onboarding

### Problem (SCR-lite)

**Situation.** Open-knowledge already has a working content detection pipeline: the file watcher (`file-watcher.ts:seedLastKnownHashes`) recursively scans the content directory on startup, applies `ContentFilter` (gitignore + glob include/exclude via `picomatch`), and populates an in-memory `fileIndex`. The `/api/documents` and `/api/pages` endpoints expose this index. If a user runs `npx openknowledge` in a directory with existing `.md` files, those files appear in the sidebar automatically — the server finds them via `content.include: ['**/*.md']`. The `start` command auto-scaffolds `.open-knowledge/` on first run if missing. (evidence/current-state.md)

**Complication.** The detection pipeline works — but the web editor doesn't acknowledge it. Two gaps:

First, the **empty-state dead end**: when a user runs `npx openknowledge` in a directory with no `.md` files (common for first-time use), the sidebar shows "No files yet." and the editor shows "Select a document to edit." — two static strings with no affordances. No "create your first article" button, no hint about what to do next. The user must context-switch to a terminal or file manager to create their first `.md` file. When files DO exist, they show up — but there's no confirmation ("Found 50 files in docs/"), no option to adjust the content scope, no onboarding moment.

Second, the **Electron path alignment**: the product roadmap includes a standalone macOS app (already spec'd in `specs/2026-04-11-electron-desktop-app/SPEC.md`) with a Project Navigator that provides folder selection, project creation, and onboarding (J1). Every in-editor onboarding component we build now — welcome screen, first-document creation, content scope confirmation — becomes a component the Electron renderer can wrap. If we build these only in the Electron shell, the CLI-distributed web editor stays a dead end for new users.

The intersection: the empty-state UX gap is a customer problem today (CLI users hit the dead end), AND building onboarding components for the web editor now creates the reusable layer that the Electron app composes later. One investment, two distribution surfaces.

**Resolution.** The web editor gains an onboarding experience that bridges the gap between "server started, content detected" and "user is productively editing." For the empty-state case: a welcome screen with a "Create your first article" action. For the existing-content case: a confirmation screen surfacing what the watcher found ("Found 50 markdown files") with the option to adjust content scope (content directory, include/exclude patterns). For returning users: direct to the editor, no onboarding. The server's existing detection pipeline (`ContentFilter` + `fileIndex`) provides the data — the story is about the web editor UX that surfaces it.

### Value and goals

**Customer-facing:** A new user who runs `npx openknowledge` in an existing project directory with markdown files sees those files recognized and surfaced in the editor within one interaction — no terminal context-switching, no "No files yet" dead end. A user in an empty directory gets a guided path to their first document.

**Platform:** The onboarding flow establishes the initialization-awareness component pattern that the future standalone launcher will compose. Specifically: (1) a detection layer that can report what `.open-knowledge/` state exists and what content the server knows about, (2) a setup confirmation UI that lets the user adjust content scope, and (3) a first-run guidance component. These three components are useful in-editor now AND compose into a launcher later. This is the load-bearing dimension — if we build onboarding as a CLI-only concern, the launcher either reimplements it or ships without it.

**Internal:** Eliminates the "run 4 commands to get started" onboarding tax that currently makes demos, evaluations, and testing friction-heavy.

**Observable success:**
- A user who runs `npx openknowledge` in a directory with 50 existing `.md` files sees a welcome screen that says "Found 50 markdown files in `./docs/`" and offers to use them as content. After one confirmation click, the file sidebar is populated.
- A user in an empty directory sees a welcome screen with a "Create your first article" button. Clicking it creates a file and opens the editor with that document.
- A returning user (`.open-knowledge/` already exists, content already loaded) does NOT see the onboarding flow — the editor loads directly.

### Invariants

- **I-A1: Onboarding triggers only on first meaningful interaction.** The onboarding flow appears when EITHER (a) `.open-knowledge/` does not exist yet, OR (b) `.open-knowledge/` exists but the content directory has zero files loaded by the server. Once the user has dismissed onboarding and at least one document exists, it never reappears. Observable: returning users see the file sidebar directly, no onboarding overlay.
- **I-A2: Existing content is never modified by onboarding.** The onboarding flow detects existing markdown files and offers to adopt them. It NEVER moves, renames, reformats, or modifies those files. It only adjusts the server's content scope (which directories to watch). Observable: file checksums before and after onboarding are identical.
- **I-A3: CLI and UI initialization produce identical outcomes.** Whether a user initializes via CLI (`npx openknowledge init`) or via the web editor's onboarding flow, the resulting `.open-knowledge/` directory, `AGENTS.md`, and MCP configuration are structurally identical. Observable: diff of `.open-knowledge/` contents after CLI init vs after UI init.
- **I-A4: Onboarding is skippable without consequence.** A user who dismisses the onboarding flow without configuring anything can still use the editor — the default content directory (`.`) applies. Observable: dismiss onboarding, create a file manually in the project root, file appears in sidebar.
- **I-A5: Content detection results are accurate.** The count and location of detected markdown files shown in onboarding matches reality. No false positives (non-markdown files counted), no false negatives (markdown files missed). Observable: compare onboarding's reported count against `find . -name '*.md' | wc -l` (minus gitignored files).

### Constraints

- **C-A1: Server must be running before onboarding.** The web editor is served by the Hocuspocus server. The onboarding flow runs inside the web app — it cannot start the server itself. This means the CLI command (`npx openknowledge`) still handles server startup; the web editor handles the post-startup experience. [This constraint relaxes when the standalone launcher ships.]
- **C-A2: Content detection uses the same `ContentFilter` pipeline as the file watcher.** The onboarding flow's detection of existing markdown files must use the server's filtering logic (`.gitignore` + `config.content.exclude` patterns) so the count shown matches what the file sidebar will actually display. No separate file-walking logic.
- **C-A3: Configuration changes during onboarding (content directory, include/exclude patterns) must persist to `.open-knowledge/config.yml`.** The onboarding flow is not a runtime-only override — it writes durable config.
- **C-A4: Auto-detection must complete in under 5 seconds for directories with up to 10,000 files.** The user should not wait for detection to finish before seeing the welcome screen — detection results can appear progressively.

### Non-goals

- **[NOT NOW] Standalone launcher / Electron app.** A native macOS app that opens a folder picker and starts the server from a desktop icon. Already spec'd (`specs/2026-04-11-electron-desktop-app/SPEC.md`) with its own Project Navigator and onboarding flow (J1). This story covers the **web editor (localhost) path** — the complementary surface for CLI-distributed users. Revisit when: the Electron app ships and we need to ensure component reuse between the two surfaces. Architecture decisions here must not foreclose the Electron path — onboarding components should be composable React components the Electron renderer can wrap.
- **[NOT NOW] Project-level permission configuration during onboarding.** The report's Bucket 5 covers permission models. Onboarding should not surface permission setup. Revisit when: the permission model is designed and the init command scaffolds `permissions.yaml`.
- **[NOT NOW] Template selection.** Offering the user a choice of KB templates ("engineering docs", "research", "personal notes") during onboarding. The single default structure (`articles/`, `external-sources/`, `research/`) is sufficient for now. Revisit when: user research shows template demand.
- **[NOT UNLESS] Interactive CLI prompts during init.** The CLI `init` command should remain non-interactive (flags only), per CLI best practices from clig.dev. The web editor's onboarding flow is where interactivity belongs. Revisit only if: a CLI-only user segment (no browser access) demonstrates need for interactive terminal-based init.
- **[NEVER] Modifying or reformatting existing markdown files during detection.** Onboarding detects and surfaces — it never touches user content. This is a trust boundary.

### Acceptance criteria

- **AC-A1:** A user runs `npx openknowledge` in a directory with 50 `.md` files in a `docs/` subdirectory. The web editor shows a welcome screen reporting "Found 50 markdown files in `docs/`." The user confirms, and the file sidebar populates with those files.
- **AC-A2:** A user runs `npx openknowledge` in an empty directory. The web editor shows a welcome screen with a "Create your first article" action. The user clicks it, types a title, and the editor opens with that document. The file appears on disk in the content directory.
- **AC-A3:** A user who has already completed onboarding (`.open-knowledge/` exists, documents present) runs `npx openknowledge` and sees the file sidebar directly — no onboarding screen.
- **AC-A4:** The web editor's onboarding screen, when the server has detected existing content (via `fileIndex`), displays a summary (e.g., "Found 50 markdown files") and offers the user a way to adjust content scope (content directory, include/exclude patterns) before dismissing.
- **AC-A5:** A user dismisses the onboarding flow without configuring anything. They can still create files via the editor, and those files appear in the sidebar using the default content directory.
- **AC-A6:** The onboarding flow's content detection and the file sidebar's document list use the same filtering pipeline (`.gitignore` + exclude patterns). No discrepancy between what onboarding reports and what the sidebar shows.

---

## Part B — Project discovery, registry, and switching

### Problem (SCR-lite)

**Situation.** Open-knowledge is single-project-per-invocation. Each `npx openknowledge` starts a Hocuspocus server bound to the current working directory's `.open-knowledge/` config. The MCP command determines its project directory from `process.cwd()`. There is no project registry, no history of which directories have been initialized, no way to list known projects, and no mechanism to switch between projects without killing the server, `cd`-ing, and restarting. (evidence/current-state.md)

**Complication.** This creates friction at two levels that compound. First, **developer workflow friction**: a knowledge worker using open-knowledge across 3-5 projects (work docs, personal research, client project, OSS contributions) must remember exact directory paths, manage multiple terminal sessions, and keep track of which `localhost` port serves which project. Cognitive load research establishes clear thresholds: context switching costs developers an average of 9.5 minutes to return to productive flow (Qatalog/Cornell), and sub-1-second switching is the threshold where developers maintain flow (Nielsen). Every project switch today costs a full server restart cycle — several seconds of terminal work plus the mental load of directory navigation. Second, **agent discovery friction**: an MCP-connected agent has no way to discover which knowledge bases exist on a machine or to reference content across KBs. Each agent session is siloed to one project. When the user asks "find the document I wrote about X" and it's in a different KB, the agent has no mechanism to look.

The compound effect: as the number of KBs grows, the per-switch cost stays constant but the frequency of switches increases. Three projects with two switches/day is tolerable; eight projects with five switches/day is workflow-breaking. And unlike IDEs where project switching is a solved problem (VS Code Cmd+R, JetBrains welcome screen), open-knowledge has zero infrastructure for this.

**Resolution.** A project registry at `~/.open-knowledge/projects.json` auto-populated by `init` and `start` commands, CLI commands to list and switch projects (`openknowledge list`, `openknowledge open <name>`), and an in-editor project switcher that lets users navigate between projects without leaving the browser.

### Value and goals

**Customer-facing:** A user with multiple knowledge bases can see all their projects in one place (CLI or editor), switch between them with one action, and find recent projects by frecency rather than remembering paths. The cost of switching drops from "kill server, remember path, cd, restart" to "one command or one click."

**Platform:** The project registry establishes the cross-project data model — a machine-readable JSON file at a known location that launchers (Raycast, Alfred), future Electron apps, and CI/CD can query. Every tool that needs to answer "what open-knowledge projects exist on this machine?" reads one file. This is the load-bearing dimension — without a registry, every future integration (launcher, global MCP server, cross-project search) must invent its own project discovery, which fragments the model.

**Internal (agent capability):** The registry enables a future global MCP server that can list and navigate across all KBs without per-project configuration. An agent connected to the global server can answer "find the document I wrote about auth" across all knowledge bases. [This future capability is explicitly scoped out of this story — but the registry is the prerequisite.]

**Observable success:**
- A user runs `openknowledge list` and sees their 5 projects ordered by frecency. They run `openknowledge open research` and the editor opens to their research KB within 3 seconds.
- A user in the web editor clicks a project switcher in the header and sees their recent projects. They click a different project, and the editor navigates to it.
- A new project created via `npx openknowledge init` automatically appears in `openknowledge list` without manual registration.

### Invariants

- **I-B1: Registry is auto-populated.** Every successful `init` and `start` invocation records the project in `~/.open-knowledge/projects.json`. The user never manually registers a project. Observable: run `npx openknowledge init` in a new directory, then `openknowledge list` — the new project appears.
- **I-B2: Registry survives project deletion.** If a user deletes a project directory, the registry entry becomes stale but does NOT cause errors. `openknowledge list` shows the entry as missing/stale. Observable: delete a project dir, run `openknowledge list` — entry is marked stale, not errored.
- **I-B3: Frecency ordering is deterministic.** Given the same access history, `openknowledge list` always produces the same ordering. The ordering combines recency (more recent = higher) and frequency (more opens = higher). Observable: two projects opened the same number of times — the more recently opened one ranks higher.
- **I-B4: Project switching does not lose unsaved state.** If a user switches projects while editing, any unsaved CRDT state in the current project is persisted (via the normal persistence debounce) before the switch completes. Observable: edit a document, switch projects, switch back — edits are preserved.
- **I-B5: Registry format is machine-readable.** The registry file is valid JSON that external tools (Raycast, Alfred, scripts) can parse without special tooling. Observable: `cat ~/.open-knowledge/projects.json | jq .` succeeds.
- **I-B6: In-editor switcher reflects registry state.** The project list shown in the editor matches `openknowledge list` output. If a project is added or removed, the editor's list updates on next open. Observable: init a new project in a terminal, open the editor's switcher — new project appears.

### Constraints

- **C-B1: MVP architecture is one server per project.** Switching projects in the editor means navigating to a different `localhost:<port>` or restarting the server with a different project root. A single multi-root server (via MCP Roots protocol) is future work. This constraint bounds the switching UX — it cannot be sub-100ms instant like Notion's sidebar; realistic target is 2-5 seconds for server restart or new-tab navigation.
- **C-B2: Registry location is `~/.open-knowledge/projects.json`.** Cross-platform, simple, co-located with user-level config. XDG-compliant location (`$XDG_STATE_HOME/open-knowledge/projects.json`) as fallback on Linux. The user-level config directory (`~/.open-knowledge/`) already exists in the config loader code.
- **C-B3: No new dependencies for the registry.** The registry is a JSON file with read/write via Node.js `fs` — no SQLite, no database, no external process.
- **C-B4: The `list` and `open` commands are non-interactive.** They print output and exit, suitable for piping and scripting. No TUI, no interactive selection. The editor provides the interactive experience.

### Non-goals

- **[NOT NOW] Global MCP server serving multiple KBs.** A single MCP server instance that can answer queries across all registered projects. The registry this story creates is a prerequisite, but the multi-root MCP server is separate. Revisit when: the MCP Roots protocol is implemented in the server and cross-KB agent queries are a validated need.
- **[NOT NOW] Cross-project search.** Searching for content across all registered KBs from the CLI or editor. Revisit when: the global MCP server exists and exposes a unified search tool.
- **[NOT NOW] Project groups or tags.** Organizing projects into named groups (JetBrains-style). The flat frecency list is sufficient for up to ~20 projects. Revisit when: user research shows organization demand at higher project counts.
- **[NOT UNLESS] Account-based project sync.** Syncing the project registry across machines via a cloud account (Notion-style). This requires infrastructure that doesn't exist and contradicts the local-first principle. Revisit only if: open-knowledge adds a cloud backend for other reasons AND users request cross-machine project continuity.
- **[NEVER] Automatic project removal from the registry.** The registry never deletes entries on its own. Stale entries (deleted directories) are marked but preserved — the user explicitly removes them. This prevents data loss from accidental directory moves.

### Acceptance criteria

- **AC-B1:** A user runs `npx openknowledge init` in three different directories. `openknowledge list` shows all three, ordered by most recently accessed.
- **AC-B2:** A user runs `openknowledge open <name>` where `<name>` matches a registered project. The server starts (or restarts) with that project's root, and the editor opens in the browser.
- **AC-B3:** A user runs `openknowledge list` after deleting one project's directory. The listing shows the deleted project as stale/missing without crashing.
- **AC-B4:** A user in the web editor clicks a project switcher UI element and sees their registered projects with frecency ordering. Clicking a different project navigates to it.
- **AC-B5:** `~/.open-knowledge/projects.json` is valid JSON parseable by `jq` and contains `path`, `name`, `lastOpened`, `openCount`, and `type` fields for each entry.
- **AC-B6:** A user edits a document, then uses the editor's project switcher to navigate to another project, then returns to the original. Their edits are preserved.

---

## Items (unified)

| ID | Item | Type | Priority | Status | Notes |
|---|---|---|---|---|---|
| PQ1 | Onboarding trigger condition: first-run detection via `.open-knowledge/` presence + document count | Product | P0 | **Decided** | Locked. Two conditions: (a) no `.open-knowledge/` dir, or (b) zero documents loaded. Once dismissed + ≥1 doc exists, never reappears. (evidence/current-state.md) |
| PQ2 | Content scope adjustment during onboarding: surface what the watcher found and let user refine | Product | P0 | **Decided** | Directed. The server's file watcher already detects content via `ContentFilter` + `seedLastKnownHashes()` at startup. The onboarding screen reads from `/api/documents` (or a new `/api/init-status` endpoint) to show what was found. User can adjust `content.dir` and `content.exclude` patterns. No separate scanning needed — the server is the source of truth. |
| PQ3 | Onboarding flow components: detection summary → scope confirmation → first-document guidance | Product | P0 | **Decided** | Directed. Three components in sequence. The scope confirmation step lets users adjust the detected content directory and exclude patterns. |
| PQ4 | "Create first article" action in empty-state onboarding | Product | P0 | **Decided** | Directed. User provides a title, file is created in the content directory, editor opens to that document. |
| PQ5 | Registry schema: path, name, lastOpened, openCount, type (sidecar/standalone) | Product | P0 | **Decided** | Directed. Schema from report D5. `name` derived from directory name or config. `type` inferred from KB-git relationship. |
| PQ6 | Frecency algorithm: how to combine recency and frequency for ordering | Product | P0 | **Assumed** | Use zoxide-style frecency (frequency × recency weight, exponential decay). Confidence: MEDIUM. Verify by: testing with realistic access patterns — does the ordering feel right? [Inferred from report D5 citing zoxide's approach.] |
| PQ7 | Editor switcher UX: where in the UI and what interaction pattern | Product | P0 | **Open** | Options: (a) header dropdown (Notion-style), (b) sidebar section above file tree, (c) command palette entry. Needs design decision. Current editor header has theme toggle + presence bar — a project name/dropdown could sit alongside. |
| PQ8 | Switching semantics: server restart vs new tab vs dynamic root swap | Product | P0 | **Decided** | Directed. MVP: `openknowledge open <name>` starts/restarts the server for the target project and opens the browser. In-editor switching navigates to the target project's server URL (one server per project). Multi-root server is future. |
| TQ1 | Server-side API for initialization status: does `.open-knowledge/` exist, how many docs loaded, detected content dirs | Tech | P0 | **Open** | The web editor needs a server endpoint to query initialization state. Could extend existing `/api/documents` or add a new `/api/init-status` endpoint. |
| TQ2 | Content detection reuses `ContentFilter` pipeline (gitignore + exclude patterns) | Tech | P0 | **Decided** | Locked. No separate file-walking logic. Detection must match what the file sidebar will show. |
| TQ3 | Config write from web editor: onboarding must persist content-dir choice to `.open-knowledge/config.yml` | Tech | P0 | **Assumed** | The web editor can write config via a server-side API endpoint. Confidence: HIGH — the server already has filesystem access. Verify by: checking whether a config-write API exists or needs to be created. |
| TQ4 | Onboarding dismissal state: where is "user has completed onboarding" stored? | Tech | P0 | **Open** | Options: (a) presence of `.open-knowledge/config.yml` with a `initialized: true` flag, (b) a `.open-knowledge/cache/onboarding-completed` marker, (c) inferred from document count > 0. Needs design decision. |
| TQ5 | Auto-registration hook: where in `init` and `start` to call registry-write | Tech | P0 | **Assumed** | Register after successful `.open-knowledge/` scaffolding in `init`, and on server startup in `start`. Confidence: HIGH. Verify by: checking that both code paths have access to the project root path and config. (evidence/current-state.md) |
| TQ6 | Registry file locking: concurrent read/write safety | Tech | P0 | **Assumed** | Two `openknowledge` processes could write to the registry simultaneously (user runs `init` in two terminals). Need atomic write (write-to-temp + rename). Confidence: HIGH — standard pattern. Verify by: confirming Node.js `fs.rename` is atomic on the target platforms. |
| TQ7 | Stale entry detection: how to mark deleted projects without removing them | Tech | P0 | **Open** | Options: (a) check `fs.existsSync(path)` on `list`, mark missing entries inline, (b) add a `status` field to registry entries, (c) just show all entries and let the user see the error when they try to open a deleted one. |
| TQ8 | In-editor project switching: server API or client-side navigation | Tech | P0 | **Open** | The editor needs to know the registry contents. Options: (a) server endpoint `/api/projects` that reads the registry, (b) the editor fetches a known URL for each registered project's server, (c) the editor stores project list in localStorage synced from CLI. |
| TQ9 | Browser opening: `openknowledge open <name>` should open the browser automatically | Tech | P2 | **Assumed** | Use `open` (macOS) / `xdg-open` (Linux) to open `localhost:<port>`. Confidence: HIGH. The `start` command already has `--open` flag logic. |
| XQ1 | CLI `init` content-dir suggestion: enhance `init` to report what the watcher would find with current config | Cross-cutting | P2 | **Parked** | The server's file watcher already detects all content at startup via `ContentFilter` + `seedLastKnownHashes`. The `init` command could preview this (e.g., "With default config, the watcher will find 50 `.md` files in `docs/`"), but it's not required — the web editor onboarding can surface this from the running server's `/api/documents` data. Lean: defer to web editor. Revisit when: CLI-only users (no browser) need content-dir guidance during init. |
| XQ2 | Component composability for future Electron launcher | Cross-cutting | P2 | **Parked** | Onboarding components (detection display, scope config, first-doc creation) should be React components that can be wrapped by a future launcher shell. Lean toward composable. Revisit when: standalone launcher work begins. |
| XQ3 | `init` and `start` must both auto-register in the project registry | Cross-cutting | P0 | **Decided** | Locked. Both commands write to the registry. The onboarding flow triggers `init`, which triggers registration. |
| XQ4 | Registry location must be discoverable by future global MCP server | Cross-cutting | P2 | **Parked** | The global MCP server will need to read `~/.open-knowledge/projects.json`. The registry's location and format must be stable enough to be a public contract. Revisit when: global MCP server work begins. |

## Context

- **Traces to:** `reports/onboarding-multiproject-ux/REPORT.md` — all six dimensions (D1 CLI init patterns, D2 multi-project switching, D3 agent context loading, D4 KB-in-repo patterns, D5 project discovery & registry, D6 MCP multi-project routing). Upstream research decisions CC5 (Zero-Friction Onboarding) and PQ23 (multi-project support).
- **Lateral:** The Electron desktop app spec (`specs/2026-04-11-electron-desktop-app/SPEC.md`) covers the native-app path — Project Navigator, folder picker, multi-window switching. This story covers the **CLI + web editor (localhost)** path. The project registry built here is consumable by both surfaces. The Electron spec does not currently mention `projects.json` or frecency — a forward connection from this story to the Electron spec.
- **Forward:** Global MCP server (multi-root, cross-KB queries) depends on the registry as its project-discovery mechanism. Electron app's Project Navigator could read the registry for its Recent Projects list. Raycast/Alfred integrations can read the registry JSON directly. Agent context scaffolding (`AGENTS.md`, `INDEX.md`) established by init is consumed by MCP tools.

## Evidence & References

### Evidence Files
- [evidence/current-state.md](evidence/current-state.md) — Verified codebase state: init, start, file watcher auto-detection, web editor empty state, multi-project gaps, Electron spec context

### Research Reports
- [reports/onboarding-multiproject-ux/REPORT.md](../../reports/onboarding-multiproject-ux/REPORT.md) — Zero-friction onboarding and multi-project UX (all 6 dimensions)
- [reports/onboarding-multiproject-ux/evidence/cli-init-patterns.md](../../reports/onboarding-multiproject-ux/evidence/cli-init-patterns.md) — 8 tools compared for init/scaffolding patterns
- [reports/onboarding-multiproject-ux/evidence/multi-project-switching.md](../../reports/onboarding-multiproject-ux/evidence/multi-project-switching.md) — 9 tools compared for switching UX + cognitive load research
- [reports/onboarding-multiproject-ux/evidence/discovery-and-mcp-routing.md](../../reports/onboarding-multiproject-ux/evidence/discovery-and-mcp-routing.md) — Project registries + MCP multi-project routing patterns
- [reports/onboarding-multiproject-ux/evidence/agent-context-loading.md](../../reports/onboarding-multiproject-ux/evidence/agent-context-loading.md) — 7 agent systems compared for context loading strategies

### External Sources
- [clig.dev](https://clig.dev/) — CLI design guidelines (non-interactive init best practices)
- [Obsidian - Manage Vaults](https://obsidian.md/help/manage-vaults) — Gold-standard additive init pattern
- [Obsidian - Vault Switcher](https://help.obsidian.md/User+interface/Vault+switcher) — Manual register vault switching
- [VS Code - Workspaces](https://code.visualstudio.com/docs/editing/workspaces/workspaces) — Cmd+R fuzzy search project switching pattern
- [zoxide](https://github.com/ajeetdsouza/zoxide) — Frecency-based directory navigation (algorithm reference)
- [UXmatters - Cognitive Distance](https://www.uxmatters.com/mt/archives/2024/12/cognitive-distance-streamlining-context-switching-in-ux.php) — Context switching cost research (9.5 min recovery, sub-1s threshold)
- [AGENTS.md Specification](https://agents.md/) — Cross-agent project guidance format
- [MCP Lifecycle Specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle) — Roots protocol for future multi-root server

### Related Specs
- [specs/2026-04-11-electron-desktop-app/SPEC.md](../../specs/2026-04-11-electron-desktop-app/SPEC.md) — Electron desktop app (covers native-app onboarding + multi-window project switching)
- [specs/2026-04-11-content-config-unification/SPEC.md](../../specs/2026-04-11-content-config-unification/SPEC.md) — Content config schema (`content.dir`, `content.include`, `content.exclude`)

### Upstream Artifacts
- [reports/onboarding-multiproject-ux/REPORT.md](../../reports/onboarding-multiproject-ux/REPORT.md) — Source research report
