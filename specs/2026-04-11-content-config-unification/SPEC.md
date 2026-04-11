# Content Config Unification: wiki → content, roots → globs, mirrored catalogs

**Status:** Complete (retroactive)
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-11
**Branch:** `refactor/wiki-to-content-config` (PR #47)
**Links:**
- Parent spec: [project-wiki-mcp-surface](../2026-04-08-project-wiki-mcp-surface/SPEC.md) (D6, D16)
- Prior art: Tim's original catalog system design in PR #9
- Related: [wiki-links-backlinks](../2026-04-10-wiki-links-backlinks/SPEC.md)

---

## 1) Problem statement

**Situation.** The project wiki MCP surface (shipped per the [project-wiki-mcp-surface spec](../2026-04-08-project-wiki-mcp-surface/SPEC.md)) uses two separate config sections: `content: { dir }` for the CRDT editor's content directory, and `wiki: { roots: [{path, label}], include, exclude }` for browsable wiki subtrees inside `.open-knowledge/`. Each wiki root is a named directory (`articles/`, `external-sources/`, `research/`) with its own INDEX.md catalog. Catalogs are written in-place alongside source files.

**Complication.** Three problems emerged from this design:

1. **The `roots` config is unnatural for repo-wide content tracking.** The original spec (D16) anticipated a "repo-as-wiki" mode where the entire project is tracked, but `roots` forces users to enumerate each directory explicitly with a label. For a monorepo with specs, reports, docs, and evidence scattered across dozens of directories, this means maintaining a long `roots` array that falls out of date every time someone creates a new directory. Glob patterns (`**/*.md`) are the natural primitive for "track all markdown files."

2. **In-place INDEX.md files pollute the source tree.** Writing auto-generated INDEX.md catalogs next to source files in directories like `specs/`, `reports/`, or `docs/` creates noise: they show up in git diffs, confuse contributors who don't know they're auto-generated, and can conflict with existing index files in those directories. The original spec's D6 ("catalogs consolidated in `.open-knowledge/`, not scattered through repo") anticipated this concern for the wiki directory itself, but the problem is worse when tracking content across the entire project.

3. **"Wiki" terminology is too narrow.** This is a content/knowledge management system that tracks any markdown files across a codebase. "Wiki" implies a specific wiki-style knowledge base with articles and categories. The actual use case includes specs, reports, evidence files, and any other markdown content.

**Resolution.** Unify the config into a single `content: { dir, include, exclude }` section, replace in-place catalogs with mirrored catalogs inside `.open-knowledge/catalogs/`, and rename all wiki-related code and user-facing text to use "content" terminology.

## 2) Goals

- G1: A single `content` config section replaces both `content.dir` and the entire `wiki` section
- G2: Glob patterns (`include`/`exclude`) replace explicit directory enumeration (`roots`)
- G3: Auto-generated catalogs never touch the source tree — they live inside `.open-knowledge/catalogs/`
- G4: Catalog directory structure mirrors the project's directory structure, so navigation is intuitive
- G5: All user-facing text uses "content" / "knowledge base" instead of "wiki"
- G6: Backward-compatible — existing `.open-knowledge/` scaffolds continue to work after updating config

## 3) Non-goals

- **[NEVER]** NG1: Remove the `articles/`, `external-sources/`, `research/` directory convention — the content lifecycle model (D14 in the parent spec) is unchanged. These remain the recommended default directories for structured knowledge.
- **[NOT NOW]** NG2: Remove the old `catalog.ts`, `watcher.ts`, `paths.ts` code — retained but disconnected for potential future use (e.g., if a project wants in-place catalogs within `.open-knowledge/` itself).
- **[NOT NOW]** NG3: Migrate the wiki-links-backlinks spec terminology — that spec (S10) uses "wiki" in its own context; renaming there is a separate concern.
- **[NOT UNLESS]** NG4: Support multiple independent `content` sections — one unified section is sufficient. Only revisit if teams need fundamentally different glob patterns for different content types.

## 4) Personas / consumers

- **P1: Developer using Claude Code (primary).** Runs `open-knowledge init`, gets a knowledge base that tracks all markdown in the repo. Navigates via mirrored catalogs in `.open-knowledge/catalogs/`. Never sees auto-generated files in their source directories.
- **P2: Monorepo maintainer.** Has specs, reports, docs, and evidence scattered across many directories. Needs `**/*.md` to track everything without maintaining a `roots` list. Mirrored catalogs give a unified navigation view without polluting any source directory.
- **P3: AI agent (Claude Code, Cursor, Codex).** Reads `.open-knowledge/catalogs/INDEX.md` for a project-wide content map. Links in catalogs use project-root-relative paths, which agents can pass directly to their Read tool.

## 5) User journeys

### P1: Developer sets up a new project

1. Developer runs `open-knowledge init` in their project root
2. `.open-knowledge/` is scaffolded with `articles/`, `external-sources/`, `research/`, `AGENTS.md`, `.gitignore`, and `config.yml`
3. Default config is `content: { dir: '.', include: ['**/*.md'], exclude: [] }`
4. MCP server starts, scans the project for `**/*.md` files, writes mirrored catalogs to `.open-knowledge/catalogs/`
5. Catalogs mirror the project's directory structure — `specs/` gets `.open-knowledge/catalogs/specs/INDEX.md`, etc.
6. `.open-knowledge/.gitignore` includes `catalogs/` — they are never committed

### P2: Monorepo maintainer customizes tracking

1. Maintainer edits `.open-knowledge/config.yml`:
   ```yaml
   content:
     dir: .
     include:
       - "docs/**/*.md"
       - "specs/**/*.md"
     exclude:
       - "**/node_modules/**"
   ```
2. MCP server restarts, scans only matching files, catalogs regenerate to reflect the narrower scope

### P3: Agent navigates the knowledge base

1. Agent connects via MCP, receives instructions pointing to `.open-knowledge/catalogs/INDEX.md`
2. Agent reads the root catalog — sees a tree of all tracked content organized by directory
3. Each article link is a project-root-relative path (e.g., `specs/2026-04-08-foo/SPEC.md`)
4. Agent reads the article directly using its native Read tool

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Unified `content` config section with `dir`, `include`, `exclude` | Config schema validates; `dir` defaults to `.`, `include` defaults to `["**/*.md"]`, `exclude` defaults to `[]` | Replaces both old `content.dir` and `wiki` section |
| Must | Mirrored catalog generation in `.open-knowledge/catalogs/` | Catalogs written inside `.open-knowledge/catalogs/`, mirroring the project directory structure; source tree untouched | |
| Must | Content-hash dedup on catalog writes | Catalogs only rewritten when content actually changes; prevents watcher loops | Reuses `contentHash` from existing `catalog.ts` |
| Must | Sticky title/description metadata in mirrored catalogs | Existing `title` and `description` in a mirrored INDEX.md are preserved across rebuilds | Same pattern as original catalog system |
| Must | Article links use project-root-relative paths | Agents can use paths directly with their Read tool | |
| Must | File watcher on project root with debounce | @parcel/watcher watches `projectDir`, triggers catalog rebuild on `.md` changes outside `catalogs/` | 500ms quiet / 2s max debounce |
| Must | `catalogs/` is gitignored | `.open-knowledge/.gitignore` includes `catalogs/` | Auto-generated, never committed |
| Must | Full catalog rebuild on MCP server startup | Catches changes made while server was off | |
| Must | Rename `wiki/` directory to `content/` in CLI package | `packages/cli/src/wiki/` becomes `packages/cli/src/content/` | |
| Must | Rename MCP tool `init-wiki` to `init-content` | Tool name in MCP `tools/list`, trigger text, and all references updated | |
| Must | All user-facing text uses "content" / "knowledge base" | AGENTS.md, MCP instructions, CLI output, config comments | |
| Should | Old catalog code retained but disconnected | `catalog.ts`, `watcher.ts`, `paths.ts` kept in `content/` for potential future use | Not called at runtime |

### Non-functional requirements

- Performance: Full catalog rebuild handles 900+ articles across a real monorepo
- Reliability: Content-hash dedup prevents watcher infinite loops
- Portability: Catalogs readable by any agent; paths are project-root-relative

## 7) Success metrics & instrumentation

- **Config simplicity:** Single `content` section vs two sections — fewer lines of config, fewer concepts to learn
- **Source tree cleanliness:** Zero auto-generated files outside `.open-knowledge/`
- **Agent navigation:** Agents can read `.open-knowledge/catalogs/INDEX.md` and navigate to any tracked content file

## 8) Current state

- **Implemented and tested on branch `refactor/wiki-to-content-config` (PR #47).**
- 92 tests pass (83 existing + 9 new mirror catalog tests), clean typecheck.
- Mirror catalogs generate correctly on the open-knowledge repo itself: 907 articles across specs, reports, evidence, etc.
- Old catalog code (`catalog.ts`, `watcher.ts`, `paths.ts`) retained in `packages/cli/src/content/` but not called at runtime.

## 9) Proposed solution (vertical slice)

### Config schema (before vs after)

**Before:**
```yaml
content:
  dir: ./content

wiki:
  roots:
    - path: ./articles
      label: Knowledge Articles
    - path: ./external-sources
      label: External Sources
    - path: ./research
      label: Research
  include: ["**/*.md"]
  exclude: []
```

**After:**
```yaml
content:
  dir: .
  include:
    - "**/*.md"
  exclude: []
```

`dir` serves the CRDT editor (tells it where to read/write documents). `include`/`exclude` serve the catalog system (tells it which files to track and index). Both are relative to the project root.

### Mirrored catalog structure

```
project-root/
  specs/
    2026-04-07-foo/SPEC.md
    2026-04-08-bar/SPEC.md
  reports/
    some-report/REPORT.md
  .open-knowledge/
    catalogs/                          # <-- gitignored, auto-generated
      INDEX.md                         # root catalog
      specs/INDEX.md                   # mirrors specs/
      specs/2026-04-07-foo/INDEX.md    # mirrors specs/2026-04-07-foo/
      reports/INDEX.md                 # mirrors reports/
      .open-knowledge/articles/INDEX.md  # mirrors .open-knowledge/articles/
    articles/
    external-sources/
    research/
    config.yml
    AGENTS.md
    .gitignore                         # includes: cache/, catalogs/
```

### System architecture

```
                   MCP Server (npx open-knowledge mcp)
                   ┌──────────────────────────────────────────┐
                   │                                          │
                   │  1. Read config: content.include/exclude │
                   │  2. Scan project: scanFiles(projectDir)  │
                   │  3. Build tree → generate catalogs       │
                   │  4. Write to .open-knowledge/catalogs/   │
                   │  5. Watch projectDir for .md changes     │
                   │  6. Debounce (500ms quiet / 2s max)      │
                   │  7. Rebuild catalogs on change           │
                   │                                          │
                   └──────────────────────────────────────────┘
                              │                    │
                   startup rebuild          @parcel/watcher
                              │                    │
                              ▼                    ▼
                   .open-knowledge/catalogs/INDEX.md
                   .open-knowledge/catalogs/specs/INDEX.md
                   .open-knowledge/catalogs/reports/INDEX.md
                   ...
```

### Key implementation files

| File | Purpose |
|---|---|
| `packages/cli/src/config/schema.ts` | Zod schema: removed `wiki` section, added `include`/`exclude` to `content` |
| `packages/cli/src/content/mirror-catalog.ts` | New: glob scanning, tree building, mirrored catalog generation |
| `packages/cli/src/content/mirror-catalog.test.ts` | 9 new tests for mirror catalog behavior |
| `packages/cli/src/mcp/server.ts` | Inline catalog watcher (replaces imported `startCatalogWatcher`), watches `projectDir` |
| `packages/cli/src/content/init.ts` | Renamed from `wiki/init.ts`; `initWiki` → `initContent` |
| `packages/cli/src/content/paths.ts` | Renamed types: `WikiRoot` → `ContentRoot`, `WikiPaths` → `ContentPaths` |
| `packages/cli/src/mcp/tools/init-content.ts` | Renamed from `init-wiki.ts`; tool name `init-content` |
| `packages/cli/src/constants.ts` | `WIKI_DIR` → `OK_DIR` |

### Glob matching

`mirror-catalog.ts` implements a lightweight glob-to-regex converter supporting `*` (single segment), `**` (any depth), and `?` (single char). Built-in excludes: `node_modules`, `.git`, `.claude`, `.changeset`, and hidden directories (except `.open-knowledge`). Inside `.open-knowledge/`, the `catalogs/` and `cache/` directories are always excluded from scanning.

### File watcher changes

The watcher moved from watching only `.open-knowledge/` to watching the entire `projectDir`. It filters events to only trigger rebuilds on `.md` file changes outside the `catalogs/` directory. The watcher is now defined inline in `server.ts` rather than imported from `wiki/watcher.ts`, because the old watcher was coupled to the `roots`-based catalog system.

### Data flow: catalog rebuild

```
1. scanFiles(projectDir, include, exclude)
   └─ Recursively walks project, applies glob patterns
   └─ Returns flat list of project-root-relative paths

2. buildTree(files)
   └─ Organizes flat list into DirNode tree structure

3. generateNodeCatalog(tree, projectDir, catalogsDir)
   └─ Recurses depth-first through tree
   └─ For each directory with content:
      a. Reads frontmatter from each .md file (title, description, tags)
      b. Reads sticky metadata from existing mirrored INDEX.md
      c. Generates catalog content with Articles + Subfolders sections
      d. writeIfChanged — content-hash dedup prevents unnecessary writes

4. Output: .open-knowledge/catalogs/<mirror-path>/INDEX.md
   └─ Links use project-root-relative paths
```

### Alternatives considered

**Option A: Keep roots, add a "repo-as-wiki" flag.** Add a boolean flag to enable whole-repo scanning alongside the existing roots config. Rejected: two parallel systems for content tracking (roots for structured wiki, flag for repo-wide) adds complexity without benefit. Globs subsume both cases.

**Option B: Keep catalogs in-place, add a "mirror mode" toggle.** Let users choose between in-place and mirrored catalogs. Rejected: maintaining two catalog generation paths is unnecessary complexity. Mirrored catalogs are strictly better (no source tree pollution, same navigation experience).

**Option C: Remove catalog generation entirely, rely on grep.** Agents can find content with grep; catalogs are redundant. Rejected: catalogs provide a navigable overview that grep cannot — they answer "what content exists and how is it organized" without requiring the agent to know what to search for.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Rationale |
|---|---|---|---|---|---|
| D1 | Replace `wiki.roots` with `content.include`/`content.exclude` glob patterns | P/T | LOCKED | Yes (config schema change) | Globs are the natural primitive for file selection; roots forced manual directory enumeration that doesn't scale. The parent spec's D16 anticipated user-defined roots but actual usage showed the pattern was wrong. |
| D2 | Merge `wiki` section into `content` section | T | LOCKED | Yes (config schema change) | Two separate sections (`content.dir` for the editor, `wiki` for catalogs) were confusing. Both operate on the same content; a single section is clearer. |
| D3 | Default `content.dir` to `.` (project root) instead of `./content` | P | LOCKED | No | Most users track content across their entire project, not in a dedicated `content/` subdirectory. `.` is the more useful default. |
| D4 | Write mirrored catalogs to `.open-knowledge/catalogs/` | T | LOCKED | Yes | In-place catalogs pollute the source tree (D6 from parent spec, extended to repo-wide tracking). Mirroring preserves the directory structure for navigation while keeping all auto-generated files contained. |
| D5 | Gitignore `catalogs/` | T | LOCKED | No | Catalogs are derived data — they can be regenerated from source files at any time. Committing them would create noise in git diffs. |
| D6 | Use project-root-relative paths in catalog links | T | LOCKED | No | Agents read files by absolute or root-relative paths. Paths like `specs/2026-04-07-foo/SPEC.md` are directly usable with Read tools. Relative-to-catalog paths would require path resolution. |
| D7 | Rename `wiki` → `content` in all code and user-facing text | P | LOCKED | Yes | "Wiki" is too narrow for a system that tracks any markdown content. "Content" / "knowledge base" better describes the actual use case. |
| D8 | Retain old catalog code (`catalog.ts`, `watcher.ts`) but disconnect it | T | DIRECTED | No | The old code may be useful if a project wants in-place catalogs within `.open-knowledge/` itself (the original use case). Removing it is premature; retaining it costs nothing. |
| D9 | Inline the catalog watcher in `server.ts` instead of importing from `content/watcher.ts` | T | DIRECTED | No | The old watcher was coupled to the roots-based system. The new watcher is simpler (watches projectDir, filters by extension and path) and doesn't warrant a separate module. |
| D10 | Watch `projectDir` (not just `.open-knowledge/`) for catalog rebuilds | T | LOCKED | No | Content files live across the entire project, not just in `.open-knowledge/`. The watcher must see changes to any tracked `.md` file. |

## 11) Open questions

All resolved. No open questions remaining.

## 12) Assumptions

| ID | Assumption | Confidence | Status |
|---|---|---|---|
| A1 | @parcel/watcher can watch the entire project root without performance issues | HIGH | Validated: works on open-knowledge repo (900+ articles) |
| A2 | Content-hash dedup prevents watcher loops when catalogs are inside the watched tree | HIGH | Validated: catalogs dir is excluded from watcher trigger filter |
| A3 | The lightweight glob-to-regex converter handles common patterns correctly | HIGH | Validated: 9 tests cover `**/*.md`, nested patterns, exclusions |
| A4 | Agents will navigate mirrored catalogs as effectively as in-place catalogs | MEDIUM | Links are project-root-relative and directly usable; navigation UX is equivalent |

## 13) In Scope

All items implemented:

- Unified `content` config schema with `dir`, `include`, `exclude`
- `mirror-catalog.ts`: glob scanning, tree building, mirrored catalog generation
- Inline catalog watcher in `server.ts` watching `projectDir`
- Directory rename `wiki/` → `content/` with all type/function renames
- MCP tool rename `init-wiki` → `init-content`
- User-facing text updated: "wiki" → "content" / "knowledge base"
- `.open-knowledge/.gitignore` updated to include `catalogs/`
- MCP instructions updated to point to `.open-knowledge/catalogs/INDEX.md`
- 9 new tests for mirror catalog behavior
- All 92 tests passing, clean typecheck

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Large project root causes slow full scans | Low | Medium | Built-in excludes (`node_modules`, `.git`, hidden dirs) skip the heaviest directories; validated on 900+ file repo |
| Custom glob-to-regex misses edge cases | Low | Medium | Standard patterns (`**/*.md`) are well-tested; exotic patterns can fall back to adding explicit paths to include |
| Breaking change for existing `.open-knowledge/config.yml` files | Medium | Low | The old `wiki` section is simply removed from the schema; Zod defaults fill in `content.include`/`content.exclude` if not present; existing `content.dir` values are preserved |
| Agents confused by catalog path change (`INDEX.md` → `catalogs/INDEX.md`) | Low | Medium | MCP instructions updated to point to the new path; `AGENTS.md` updated; agents follow instructions on each connect |

## 15) Future Work

### Explored

**Reconnecting old catalog code for `.open-knowledge/` internal catalogs.** The retained `catalog.ts` and `watcher.ts` could power in-place INDEX.md generation specifically within `.open-knowledge/articles/`, `.open-knowledge/external-sources/`, and `.open-knowledge/research/` — the original use case. This would give those directories their own navigable catalogs without polluting external directories. Not connected because mirrored catalogs already cover these directories. Revisit if: the two catalog styles (mirrored for repo-wide, in-place for `.open-knowledge/` internal) prove to serve different navigation needs.

### Identified

**Smarter glob implementation.** The current `globToRegex` handles `*`, `**`, and `?` but not brace expansion (`{md,mdx}`), character classes (`[a-z]`), or negation (`!pattern`). If users need these, consider adopting `picomatch` or `micromatch` as a dependency instead of the hand-rolled converter.

**Config migration tool.** A CLI command or automatic migration that reads an old-format `config.yml` (with `wiki.roots`) and rewrites it to the new `content.include`/`content.exclude` format. Currently unnecessary because the old format was only used internally, but would matter for external users upgrading.

### Noted

**Relationship to parent spec decisions.** This change updates several decisions from the parent spec ([project-wiki-mcp-surface](../2026-04-08-project-wiki-mcp-surface/SPEC.md)):
- **D6** (catalogs consolidated in `.open-knowledge/`): extended from "within the wiki directory" to "for the entire project"
- **D16** (wiki config with roots): superseded by glob-based content config
- **D13** (workflow tools): `init-wiki` renamed to `init-content`

The parent spec should be updated to reference this change.
