# Open Questions — Project Wiki MCP Surface

Living document for design questions that arise during implementation.
Questions are investigated and answered inline as they come up.

---

## Q1: Multiple AGENTS.md files in the same repo — does it make sense?

**Date:** 2026-04-10
**Status:** Answered

### Context

The open-knowledge `init` command scaffolds `.open-knowledge/AGENTS.md` inside user repos. But the open-knowledge repo itself could also have a `.open-knowledge/` directory (dogfooding). Does having multiple AGENTS.md files make sense? How do different tools handle them?

### Findings

**Tool support for hierarchical AGENTS.md:**

| Tool | File | Subdirectory scoping | Hierarchy |
|---|---|---|---|
| **Claude Code** | `CLAUDE.md` (not `AGENTS.md`) | Yes — subdirectory files scope to that subtree | `.gitignore`-like: global → root → subdirectory, stacking |
| **OpenAI Codex** | `AGENTS.md` | Yes — subdirectory files scope to that subtree | Merges with parent; deeper files add context, don't replace |
| **Cursor** | `.cursorrules` / `.cursor/rules/` | No | Single root-level file (or rules directory) |
| **Windsurf** | `.windsurfrules` | No | Single root-level file |

**Key takeaways:**

1. **Claude Code ignores `AGENTS.md` entirely** — it only reads `CLAUDE.md`. So `.open-knowledge/AGENTS.md` is invisible to Claude Code. It's read by agents as a regular file (via Read tool), not auto-loaded as instructions.

2. **Codex treats `.open-knowledge/AGENTS.md` as a scoped subdirectory file** — it applies only when Codex is working within `.open-knowledge/`. This is actually useful: when an agent operates inside the wiki directory, it gets wiki-specific conventions automatically.

3. **AGENTS.md and CLAUDE.md coexist without conflict** — each tool reads its own file. You can have both at repo root with different (tool-specific) instructions.

4. **The self-referential case (dogfooding) is fine** — the open-knowledge repo having its own `.open-knowledge/` is just development config. User repos get their own via scaffolding. Scoping rules handle it naturally.

### Answer

**Yes, it makes sense.** `.open-knowledge/AGENTS.md` is the right place for wiki navigation conventions because:

- For **Codex users**: it scopes wiki conventions to the wiki directory automatically via Codex's hierarchy
- For **Claude Code users**: the MCP server's `instructions` field delivers the same conventions on connect; `AGENTS.md` is a fallback readable by any agent via the Read tool, even without MCP
- For **all agents**: it's the first thing an agent reads when exploring `.open-knowledge/` — serves as a README for the wiki's structure and conventions

**For the open-knowledge repo itself**: having `.open-knowledge/` is fine for dogfooding. It's a separate concern from the scaffolded user-facing wiki.

---

## Q2: Should watcher.ts live in the CLI package? What about existing file watcher utils?

**Date:** 2026-04-10
**Status:** Answered

### Context

`packages/cli/src/wiki/watcher.ts` uses `@parcel/watcher` to watch `.open-knowledge/` for .md changes and regenerate INDEX.md catalogs. Questions: (1) is @parcel/watcher the right choice vs alternatives? (2) should the watcher live in cli or server?

### File watcher comparison

| Library | Type | Dependencies | Bun compat | Notes |
|---|---|---|---|---|
| **@parcel/watcher** (current) | Native C++ (NAPI) | ~2MB native binary | Needs `trustedDependencies` | Batch events, no duplicates, best macOS FSEvents. Used by Vite. |
| **chokidar v4** | Pure JS (`fs.watch`) | Zero native deps | No friction | ~40M downloads/wk. Good fallback if native builds cause issues. |
| **nodemon** | CLI process restarter | N/A | N/A | Not embeddable — irrelevant. |
| **fs.watch** (built-in) | Node.js API | None | Yes | `recursive: true` broken on Linux. Duplicate events. Too low-level. |
| **Bun-native** | N/A | N/A | N/A | No dedicated watcher API exists. `Bun.FileSystemRouter` is HTTP routing. |
| **watchpack** | Wraps chokidar | chokidar + extras | Yes | webpack's watcher. Adds complexity for no benefit here. |
| **nsfw** | Native C++ | ~2MB native binary | Same friction as @parcel | Less maintained than @parcel/watcher. |

### Answer

**Stay with @parcel/watcher.** It's already battle-tested in this codebase (also used in `packages/server/src/file-watcher.ts` for CRDT disk sync), provides native batch event delivery that pairs well with the debounce logic, and is the same watcher Vite uses internally. If Bun native-addon friction becomes a real problem, chokidar v4 (pure JS, zero native deps) is the fallback.

**The watcher belongs in `packages/cli`**, not server. The catalog watcher is a CLI/MCP concern — it watches wiki directories and regenerates INDEX.md catalogs. The server's `file-watcher.ts` watches the `content/` directory for CRDT sync (different purpose, different directory, different behavior). Both share `@parcel/watcher` as a dependency but their logic shouldn't be coupled.

---

## Q3: Non-TypeScript options for file change detection

**Date:** 2026-04-10
**Status:** Answered

### Context

The catalog rebuild logic should stay TypeScript. But the *detection* layer (watching for .md changes) doesn't have to be an embedded Node.js dependency. Can we decouple "detect changes" from "rebuild catalogs"?

### Options investigated

| Approach | Latency | Cross-platform | Catches all mutations | Complexity |
|---|---|---|---|---|
| **`fswatch`** (OS-native CLI) | Sub-second | macOS + Linux + BSD | Yes (all disk writes) | Low — pipe to `bun run rebuild` |
| **`watchman`** (Facebook daemon) | Sub-second | macOS + Linux + Windows | Yes | Medium — requires daemon install |
| **`inotifywait`** (Linux) | Sub-second | Linux only | Yes | Low, but macOS deal-breaker |
| **Git hooks** (`post-commit` etc.) | Instant on git ops | Yes | No — misses non-git edits | Low |
| **CI/GitHub Actions** | 30s–2min | N/A (remote) | Git-mediated only | Low |
| **Cron/launchd polling** | 30–60s | Yes | Yes | Low — `find -newer` skips no-ops |
| **Editor hooks** (VS Code, MCP) | Instant | Editor-specific | Only that editor's saves | High coupling |

### Key insight: detection and rebuild are fully separable

The rebuild is a standalone script: `bun run rebuild-catalog.ts`. The detector just needs to spawn it on change. They communicate via process invocation — no shared runtime needed.

```
[detector: fswatch/git-hook/cron] --spawns--> bun run rebuild-catalog.ts
```

This means @parcel/watcher is not architecturally required — it's one option for the detection layer.

### Recommended layered approach

1. **Primary (local dev):** Keep @parcel/watcher for now — it's embedded in the MCP server process and provides sub-second response. But the rebuild logic should be extractable as a standalone CLI command (e.g., `open-knowledge rebuild-catalogs`) so external detectors can trigger it.
2. **Supplementary:** `post-commit` / `post-merge` git hooks — catches git-mediated changes, works without MCP server running.
3. **Backstop:** CI action on push — guarantees catalog consistency across the team even if no one ran the watcher locally.

### What this means for the codebase

- Extract `rebuildCatalogs()` into a standalone CLI subcommand so it's invocable from any trigger (git hook, cron, CI, fswatch pipe)
- Keep @parcel/watcher as the default real-time mechanism in the MCP server
- The detection layer becomes pluggable without changing the rebuild logic
