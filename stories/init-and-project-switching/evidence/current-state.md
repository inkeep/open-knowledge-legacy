---
title: "Current state of initialization, onboarding, and multi-project support"
type: raw-proof
created: 2026-04-12
---

## CLI Init Command

**Location:** `packages/cli/src/commands/init.ts` (269 lines)

**What it scaffolds:** Confidence: CONFIRMED
- `.open-knowledge/` directory (constant `OK_DIR = '.open-knowledge'` in `constants.ts:2`)
- `.open-knowledge/config.yml` (YAML format — `CONFIG_FILENAME = 'config.yml'`)
- `AGENTS.md` at project root within `.open-knowledge/` (via `initContent()` in `content/init.ts`)
- Content subdirs: `articles/`, `external-sources/`, `research/`
- `.open-knowledge/cache/` directory
- `.open-knowledge/.gitignore` (ignoring `cache/`)
- `.mcp.json` entry for MCP server registration

**What it does NOT do:**
- No content directory configuration during init — always scaffolds at cwd
- No `--yes` flag — only `--force` (overwrite MCP entry) and `--no-mcp` (skip MCP config)
- Does not scan for existing markdown — BUT the server's file watcher does this at startup (see below)

## Server-Side Content Detection (ALREADY EXISTS)

**Location:** `packages/server/src/file-watcher.ts`

The file watcher is the **existing auto-detection mechanism**:
- `startWatcher()` (line 588) calls `seedLastKnownHashes()` on startup
- `seedLastKnownHashes()` (line 318) recursively walks the content directory
- Applies `ContentFilter` (gitignore + `content.include` globs via `picomatch` + `content.exclude`)
- Populates an in-memory `fileIndex: Map<string, FileIndexEntry>` with every matching `.md` file
- The `fileIndex` is exposed via `getFileIndex()` and consumed by:
  - `GET /api/documents` — document listing for the sidebar
  - `GET /api/pages` — page listing with extracted titles
  - Backlink index, orphans API, etc.

**Implication:** Content detection is NOT a gap. The server already finds all matching markdown files
on startup. What's missing is the **web editor UX** that surfaces this to the user — welcome screen,
content scope adjustment, first-document creation. The detection pipeline is the data source;
the story is about the UI that presents it.

**Default content config:** `content: { dir: '.', include: ['**/*.md'], exclude: [] }`
(from `specs/2026-04-11-content-config-unification/SPEC.md`)

## Start Command

**Location:** `packages/cli/src/commands/start.ts` (209 lines)

- Auto-runs `runInit()` if `.open-knowledge/` missing (line 35-47), with `mcp: false` (skips .mcp.json)
- Default port: 3000 (`config/schema.ts`)
- Browser auto-open: only with `--open` flag, NOT default
- Creates content directory if it doesn't exist (`mkdirSync` at line 50-54)
- No project registry write — single-project-per-invocation

## Web Editor Empty State

**Location:** `packages/app/`

- `FileSidebar.tsx` — shows "No files yet." when `documents.length === 0`. No folder picker, no onboarding.
- `EditorArea.tsx` — shows "Select a document to edit" when no doc selected. No welcome screen.
- No initialization UI anywhere in `/packages/app/`

## Multi-Project Architecture: Single-Project

Confidence: CONFIRMED

The system is fundamentally single-project-per-invocation:
- CLI commands use `process.cwd()` to determine project directory (`packages/cli/src/commands/mcp.ts:18`)
- One Hocuspocus server instance = one content directory
- MCP server reads `projectDir` at initialization, serves that project only
- No cross-project awareness in any code path

## Multi-Project: What Does NOT Exist

Confidence: CONFIRMED (negative search)

Searched: `projects.json`, `project.*registry`, `openknowledge list`, `openknowledge open`,
`frecency`, `lastOpened`, `openCount` across all TS/TSX files. Zero matches.

- No `~/.open-knowledge/projects.json` or equivalent registry
- No `openknowledge list` command
- No `openknowledge open <name>` command
- No project history tracking
- No frecency ordering
- No in-editor project switcher
- No MCP Roots protocol implementation

## Multi-Project: What DOES Exist (foundations)

- User-level config directory: `~/.open-knowledge/` (code in `loader.ts:78`) — this is where a registry would live
- `.open-knowledge/` marker directory — this is the filesystem marker for project discovery
- Start command auto-scaffolds `.open-knowledge/` on first run — auto-population hook point

## Electron Spec Context

**IMPORTANT:** `specs/2026-04-11-electron-desktop-app/SPEC.md` already specifies:
- **Project Navigator** — window with empty state + "Open Project" / "New Project" buttons (J1 step 4)
- **Auto-scaffolding** via `initContent(path)` when user creates a new project (J1 step 6)
- **Multi-window project switching** — one utilityProcess per window per project (J4a, J4b)
- **NG9: No auto-scan for .open-knowledge/ projects on first launch** (explicit non-goal in Electron spec)
- **NG10: No onboarding wizard / tutorial walkthrough** — first launch → Project Navigator
- **No project registry specified** — the Electron spec doesn't mention `projects.json` or frecency

This means: the Electron spec covers the "standalone launcher" path. This story covers
the **CLI + web editor (localhost)** path. The two are complementary surfaces. The project
registry built by this story would also be consumable by the Electron app's Project Navigator.

## Config System

- Format: YAML (not JSON as the report sometimes states)
- Directory: `.open-knowledge/` (not `.openknowledge/` as report uses)
- Hierarchy: Zod defaults → `~/.open-knowledge/config.yml` → `./.open-knowledge/config.yml`
- Content tracking: glob-based `content.include`/`content.exclude` (content-config-unification spec)
- ContentFilter: unions `.gitignore` rules with config exclude patterns
