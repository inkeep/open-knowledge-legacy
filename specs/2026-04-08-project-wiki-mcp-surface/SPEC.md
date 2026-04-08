# Project Wiki — MCP Surface, Catalogs, Codebase Index & Skills

**Status:** Approved
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-08
**Baseline commit:** bfee3dc
**Links:**
- Parent project: [PROJECT.md](../../PROJECT.md), [STORIES.md](../../STORIES.md)
- Evidence: [./evidence/](./evidence/)
- Related specs: [bidirectional-observer-sync](../2026-04-07-bidirectional-observer-sync/), [agent-markdown-writes](../2026-04-07-agent-markdown-writes/)

---

## 1) Problem statement

**Situation:** Development teams using AI coding agents (Claude Code, Cursor, Codex) accumulate project knowledge — architecture decisions, process docs, research findings, codebase understanding. This knowledge is what makes agents effective: an agent with accurate project context produces dramatically better output. Today this knowledge lives in scattered specs, markdown files, CLAUDE.md, Notion pages, or developers' heads.

**Complication:** This knowledge goes stale almost immediately. Specs are written, code evolves, and the specs no longer reflect reality. PRs change architecture but nobody updates the docs. External research gets done but lives in disconnected reports. The result: agents work with outdated context, produce wrong suggestions, and developers lose trust in agent output. The cost compounds — every stale article makes the next agent interaction worse. Today's workarounds are manual (someone remembers to update docs) or nonexistent (docs just rot). Deep Wiki (Devin's auto-generated codebase documentation) generates a static snapshot but doesn't stay current — it's a point-in-time export, not a living document. CLAUDE.md helps but is limited to a single flat file with no structure.

**Resolution:** A project wiki that lives in `.openknowledge/` inside any git repo. Maintained by both agents and humans. Contains two layers: (1) **knowledge articles** grouped by topic — architecture, processes, decisions, research — and (2) a **code mirror index** that structurally mirrors the repo with directory summaries and file annotations. An MCP server gives agents structured read/write/navigate access. Catalog files provide hierarchical navigation. An `/ingest` skill processes PRs, external sources (URLs, PDFs), and other inputs into wiki articles and keeps them current as the codebase evolves. The wiki is plain markdown, navigable by any agent even without the MCP server, and committed to git alongside the code.

## 2) Goals
- G1: Agents working in a repo with `.openknowledge/` have accurate, current project context that improves their output quality
- G2: The wiki stays up to date as the codebase evolves — via `/ingest` processing PRs and via manual human/agent edits
- G3: Any MCP-compatible agent can read, write, search, and navigate the wiki via standard tool interfaces
- G4: The wiki is useful even without the MCP server running — plain markdown files with catalog navigation readable by any agent
- G5: The codebase itself is indexed — directory summaries and file annotations provide structural understanding alongside topical knowledge articles

## 3) Non-goals
- **[NEVER]** NG1: Run LLM inference in the MCP server core — intelligence comes from the connected agent
- **[NOT NOW]** NG2: Wiki-links and backlinks (Bucket 7) — Revisit if: knowledge articles grow beyond ~50 and cross-referencing becomes painful
- **[NOT NOW]** NG3: Permission model / draft branches — Revisit if: team size grows or sensitive content requires review gates
- **[NOT NOW]** NG4: CRDT real-time sync — agent writes directly to files; editor team handles CRDT integration separately — Revisit if: editor integration is ready and co-editing UX is needed
- **[NOT NOW]** NG5: Vector/semantic search — catalog navigation + grep is sufficient at P0 scale — Revisit if: wiki grows beyond ~200 articles
- **[NOT NOW]** NG6: Auto-ingestion on PR merge — start with manual triggers — Revisit if: manual ingestion proves the workflow and teams want automation
- **[NOT UNLESS]** NG7: Publishing engine (docs site from wiki) — Only if: team demand for external-facing docs emerges

## 4) Personas / consumers

- **P1: Developer using Claude Code (primary)**
  - JTBD: "My agent should know how this project works so it produces correct, context-aware output"
  - Current workflow: Writes CLAUDE.md, maintains scattered docs manually, agent frequently produces wrong suggestions due to stale context
  - Pain: Docs go stale, agent works with outdated info, developer loses trust
  - Workaround: Manually re-explain context to the agent every session, or just accept worse output
  - Success: Agent reads the wiki, produces suggestions that reflect current architecture and decisions

- **P2: Developer using Cursor/Codex/Cowork**
  - JTBD: Same as P1 but via different tool
  - Current workflow: Similar scattered docs; may not have MCP support yet
  - Pain: Same staleness problem
  - Success: Can read `.openknowledge/` files directly even without MCP; gets MCP access when their tool supports it

- **P3: Team lead / new team member**
  - JTBD: "New engineers (and their agents) should onboard faster by reading the wiki"
  - Current workflow: Tribal knowledge, asking around, reading old PRs
  - Success: New team member's agent reads the wiki and immediately understands the codebase

## 5) User journeys

### P1: Developer with Claude Code — happy path

1. **Discovery:** Developer clones a repo that has `.mcp.json` pointing to the openknowledge MCP server
2. **Setup:** Claude Code reads `.mcp.json`, prompts to trust the MCP server, user approves. MCP server starts.
3. **First use (no wiki yet):** Agent reads MCP instructions, sees no `.openknowledge/`, calls `init` tool. Scaffolds the wiki structure. Agent begins by creating a basic codebase map from reading the repo.
4. **Ongoing use:** Developer asks agent questions — agent reads wiki articles for context. Developer or agent writes new articles. `/ingest` processes PRs to update relevant articles. Catalog files auto-regenerate on writes.
5. **"Aha moment":** Agent produces a suggestion that correctly accounts for an architecture decision documented in the wiki — something it would have gotten wrong without the context.
6. **Failure/recovery:** Wiki article is stale. Agent produces wrong suggestion. Developer notices, tells agent to update the article. Agent reads the current code, updates the wiki. Next time, it's correct.

### P1: Failure path — stale wiki

1. PR merges that changes the auth flow
2. Nobody runs `/ingest` on the PR
3. Wiki still describes the old auth flow
4. Agent reads stale article, produces wrong suggestion
5. Developer notices, runs `/ingest` on the PR manually
6. Wiki updates, subsequent agent interactions are correct
7. (Future: auto-ingestion on PR merge prevents this)

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Thin MCP server: file watcher + catalog generator + instructions + init tool | MCP server starts via `.mcp.json`, watches `.openknowledge/` for file changes, regenerates catalogs automatically | @modelcontextprotocol/sdk + @parcel/watcher |
| Must | Agent uses native tools (Read, Write, Edit, Grep) for file operations | MCP server does NOT proxy file reads/writes; agent uses its built-in tools directly | Simplifies architecture |
| Must | `init` MCP tool scaffolds `.openknowledge/` structure | Calling init creates the directory structure, AGENTS.md, and starter catalog | |
| Must | `/init-wiki` skill orchestrates full wiki population after scaffold | Agent reads entire codebase, creates code-index annotation for every file, directory summaries, and knowledge articles from existing docs | LLM-powered, runs in the agent |
| Must | Catalog files (`INDEX.md`) auto-generate per folder inside `.openknowledge/` | After any file write in `.openknowledge/`, the parent folder's INDEX.md updates with title/description/tags from all children | File watcher triggers regeneration |
| Must | Knowledge articles have frontmatter (title, description, tags) | Every article has YAML frontmatter; catalog generator reads it | |
| Must | Folder metadata supported | Folders have title, description via meta.yaml or similar | |
| Must | Code mirror index mirrors repo directory structure with annotations for every file | `.openknowledge/code-index/` contains a `_summary.md` per directory and an annotation `.md` per source file | |
| Must | Knowledge articles grouped by topic | `.openknowledge/articles/` organized by topic, not by file structure | |
| Must | `.mcp.json` in repo configures Claude Code automatically | Team members get MCP server on clone + trust approval | |
| Must | AGENTS.md documents wiki conventions | Any agent can navigate the wiki by reading files, even without MCP | |
| Must | MCP `instructions` field guides agent behavior on connect | Agent knows to read catalog first, then search, then read specific files; includes CLAUDE.md hint to update code-index after code edits | |
| Must | Code-index freshness maintained via CLAUDE.md convention | CLAUDE.md instructs agent to update relevant `.openknowledge/code-index/` entries after significant code changes | Real-time best-effort |
| Should | `/ingest` skill processes PR links into wiki updates | Given a PR URL or number, reads the diff and updates relevant wiki articles + code-index entries | P0 but last to build |
| Should | `/ingest` skill processes URLs, PDFs | Given an external source, creates or updates a wiki article | |
| Could | `rebuild_catalogs` MCP tool for manual trigger | Force-regenerate all catalog files without waiting for file watcher | Extension |
| Could | `status` MCP tool shows wiki health | Reports stale articles, orphans, coverage gaps | Extension |
| Could | `/consolidate` skill synthesizes multiple articles | Given scattered articles on a topic, produces one canonical article | Use case still fuzzy |
| Could | `/research` skill does exploratory research | Searches web, writes findings to a research area of the wiki | |

### Non-functional requirements
- Performance: MCP tool responses < 500ms for reads, < 2s for writes (at 100-1000 file scale)
- Reliability: Wiki is plain files in git — crash recovery is git checkout
- Security/privacy: No secrets in wiki content; MCP server runs locally
- Portability: Wiki readable without MCP server; just markdown files

## 7) Success metrics & instrumentation
- **Agent output quality:** Qualitative — does the agent produce better suggestions when the wiki exists? (No automated metric at P0)
- **Wiki freshness:** % of articles updated within the last N commits. Measurable via frontmatter timestamps vs git log.
- **Adoption signal:** Number of repos with `.openknowledge/` directory
- **What we will log:** MCP tool call counts, which tools are used most, catalog regeneration frequency

## 8) Current state (how it works today)

- **Init spike exists** with validated CRDT plumbing, TipTap editor, observer sync, persistence pipeline, disk bridge, agent write HTTP endpoints (`/api/agent-write`, `/api/agent-write-md`)
- **No MCP server built yet** — the plumbing works but nothing speaks MCP
- **No catalog generator built yet**
- **No skills built yet**
- **48 research reports** inform architectural decisions
- **PROJECT.md + STORIES.md** define the broader project; this spec covers Tim's buckets (2, 7 deferred, skills)
- **`.mcp.json` support** exists in Claude Code for project-scoped MCP servers
- **just-bash** (Vercel Labs) validated by Mintlify at scale (30K+ daily conversations)

## 9) Proposed solution (vertical slice)

### Directory structure

```
myproject/
  src/                          # existing codebase
  .mcp.json                     # MCP server config (committed)
  CLAUDE.md                     # includes wiki maintenance conventions
  .openknowledge/
    INDEX.md                    # root catalog — links to all sections
    AGENTS.md                   # conventions for any agent (no MCP needed)
    config.yaml                 # settings (exclusions, etc.)
    articles/                   # knowledge articles grouped by topic
      infrastructure/
        deploy-process.md
        rate-limiting.md
        INDEX.md                # auto-generated catalog for this folder
      auth/
        auth-architecture.md
        INDEX.md
      INDEX.md                  # auto-generated catalog for articles/
    code-index/                 # mirrors repo structure
      src/
        server/
          _summary.md           # directory summary
          persistence.md        # file annotation
          hocuspocus-plugin.md
          INDEX.md              # auto-generated catalog
        editor/
          _summary.md
          observers.md
          INDEX.md
        INDEX.md
      INDEX.md                  # auto-generated catalog for code-index/
    research/                   # exploratory research (/research skill)
      INDEX.md
    external-sources/           # ingested external content (/ingest skill)
      INDEX.md
    cache/                      # gitignored derived data
```

### System architecture

```
┌─────────────────────────────────────────────────────┐
│                   AI Agent                           │
│          (Claude Code / Cursor / Codex)              │
│                                                      │
│  Native tools: Read, Write, Edit, Grep, Glob, Bash  │
│  Skills: /init-wiki, /ingest, /consolidate, /research│
└──────────┬────────────────────────┬──────────────────┘
           │                        │
           │ reads/writes files     │ MCP connection
           │ directly               │ (stdio via .mcp.json)
           ▼                        ▼
┌──────────────────┐    ┌──────────────────────────────┐
│  .openknowledge/ │    │  MCP Server                   │
│  (files on disk) │◄───│  (npx openknowledge serve)    │
│                  │    │                               │
│  articles/       │    │  1. instructions on connect   │
│  code-index/     │    │  2. init tool (scaffold)      │
│  research/       │    │  3. @parcel/watcher on        │
│  external-sources│    │     .openknowledge/           │
│  INDEX.md files  │    │  4. catalog regenerator       │
│                  │    │  5. rebuild_catalogs (ext)     │
│                  │    │  6. status (ext)               │
└──────────────────┘    └──────────────────────────────┘
```

### Data flow: agent writes an article

```
1. Agent calls Write("articles/auth/sso-migration.md", content)
   └─ Agent's native tool, direct filesystem write

2. @parcel/watcher detects new file
   └─ MCP server's file watcher fires

3. Catalog regenerator reads all .md files in articles/auth/
   └─ Pulls frontmatter (title, description, tags) from each
   └─ Skips INDEX.md files (they're output, not input)

4. Writes articles/auth/INDEX.md
   └─ Lists all articles in auth/ with their metadata
   └─ Content-hash check prevents re-triggering the watcher

5. Propagates up: regenerates articles/INDEX.md
   └─ Lists all topic folders with their metadata + child counts

6. Propagates up: regenerates root INDEX.md
   └─ Links to articles/, code-index/, research/, external-sources/
```

### Data flow: /init-wiki on a new repo

```
1. Agent connects via MCP, reads instructions
2. Instructions say: "No .openknowledge/ found. Call init."
3. Agent calls MCP init tool
   └─ Creates .openknowledge/ skeleton (dirs, AGENTS.md, config.yaml, empty INDEX.md files)
4. Instructions say: "Run /init-wiki to populate."
5. /init-wiki skill executes (runs in the agent, not the server):
   a. Reads .gitignore to determine exclusion list
   b. Reads every non-excluded source file in the repo
   c. For files >= 25 lines: writes code-index annotation
      (frontmatter + purpose + key exports + dependencies)
   d. For every directory: writes _summary.md
   e. Reads existing docs (README, ARCHITECTURE.md, specs, etc.)
   f. Synthesizes knowledge articles from docs + code understanding
   g. Writes articles to articles/ grouped by topic
   h. File watcher catches all writes, catalogs regenerate as it goes
6. Batching: /init-wiki processes N files per batch (configurable)
   to avoid token limits and allow incremental progress
```

### Data flow: /ingest processes a PR

```
1. Developer says: "ingest PR #47"
2. /ingest skill executes (runs in the agent):
   a. Reads the PR diff (via gh CLI or GitHub API)
   b. Reads the current wiki articles + code-index entries
      that relate to the changed files
   c. Determines what needs updating:
      - Code-index annotations for changed files → update
      - Code-index annotations for deleted files → remove
      - Code-index annotations for new files → create
      - Directory summaries for affected directories → update
      - Knowledge articles affected by the changes → update
   d. Writes all updates using native file tools
   e. File watcher catches writes, catalogs regenerate
```

### MCP server implementation

**Dependencies:** `@modelcontextprotocol/sdk`, `@parcel/watcher`

**Tools:**
| Tool | Purpose | When called |
|---|---|---|
| `init` | Scaffold `.openknowledge/` directory structure | First connection when no wiki exists |
| `rebuild_catalogs` | Force-regenerate all INDEX.md files | Manual trigger if catalogs are stale (extension) |
| `status` | Report wiki health: stale entries, drift, coverage | On demand (extension) |

**Server capability:**
- `instructions` field (returned on MCP initialize) — guides agent on wiki conventions, navigation pattern (catalog first → grep → read), CLAUDE.md hint for code-index updates. This is a standard MCP server capability, not a tool or resource.

**File watcher behavior:**
- Watches `.openknowledge/` recursively
- On any `.md` file create/update/delete (excluding `INDEX.md` files):
  1. Read all sibling `.md` files' frontmatter
  2. Regenerate the parent folder's `INDEX.md`
  3. Propagate up to parent folders until root
- Debounce: 500ms quiet / 2s max (handles burst writes from `/init-wiki`)
- Loop prevention: content-hash check before writing INDEX.md; skip if unchanged

### Catalog file format (INDEX.md)

```markdown
---
title: Infrastructure
description: Deployment, CI/CD, and infrastructure knowledge
generated: true
---

## Articles

- **[Deploy Process](deploy-process.md)** — How we deploy to production. Tags: infra, ci
- **[Rate Limiting](rate-limiting.md)** — How our API rate limits work. Tags: api, infra

## Subfolders

- **[Monitoring](monitoring/INDEX.md)** — Alerting and observability (3 articles)
```

Root INDEX.md:
```markdown
---
title: Project Wiki
description: Living knowledge base for [project name]
generated: true
---

## Sections

- **[Knowledge Articles](articles/INDEX.md)** — Architecture, processes, decisions (N articles)
- **[Codebase Index](code-index/INDEX.md)** — File and directory annotations (N entries)
- **[Research](research/INDEX.md)** — Exploratory research and findings
- **[External Sources](external-sources/INDEX.md)** — Ingested external content
```

### Code-index annotation format

For `src/server/persistence.ts`:
```markdown
---
title: persistence.ts
description: CRDT → markdown → disk → git pipeline with debounced auto-save
tags: [server, persistence, git]
path: src/server/persistence.ts
---

## Purpose
Handles the three-layer auto-persistence pipeline: CRDT binary to disk (2-10s),
markdown serialize + file write, git WIP ref commits (30s debounce).

## Key exports
- `createPersistenceExtension()` — Hocuspocus extension for onStoreDocument hook
- `writeTracker` — feedback prevention for disk bridge

## Dependencies
- simple-git — git plumbing operations
- Hocuspocus server hooks — onStoreDocument, afterStoreDocument
- node:fs, node:path — atomic file writes (temp + rename)
```

### Code-index directory summary format

For `src/server/`:
```markdown
---
title: Server
description: Backend services — Hocuspocus, persistence, file watching, agent API
tags: [server, backend]
path: src/server/
---

## Overview
The server directory contains the backend infrastructure: real-time CRDT sync
(Hocuspocus), auto-persistence pipeline (CRDT → disk → git), file watcher
for external editor bridge, and HTTP APIs for agent writes.

## Key files
- **persistence.ts** — Auto-save pipeline (CRDT → disk → git)
- **hocuspocus-plugin.ts** — WebSocket server + agent write endpoints
- **file-watcher.ts** — Disk bridge for external editor sync

## Excluded files (< 25 lines)
- agent-flow.test.ts, persistence.test.ts, file-watcher.test.ts
```

### CLAUDE.md additions

```markdown
## .openknowledge/ — Project Wiki

This repo has a living knowledge base in `.openknowledge/`.

- Read `INDEX.md` at any level for navigation
- After significant code changes, update relevant `.openknowledge/code-index/` entries
- Run `/ingest` on PRs to keep the wiki current
- Knowledge articles live in `.openknowledge/articles/` grouped by topic
- Codebase annotations live in `.openknowledge/code-index/` mirroring the repo structure
```

### .mcp.json

```json
{
  "mcpServers": {
    "openknowledge": {
      "command": "npx",
      "args": ["openknowledge", "serve"]
    }
  }
}
```

### Skill definitions (SKILL.md stubs)

**`/init-wiki`** — Two-phase skill:
1. **Phase 1: Code-index.** Heavy bash exploration (`find`, `ls`, `cat`, `head`, `wc`) to map the entire filesystem. For every file >= 25 lines (respecting .gitignore), write a code-index annotation (frontmatter + purpose + key exports + dependencies). Write `_summary.md` for every directory. This creates the structural map.
2. **Phase 2: Knowledge articles.** Navigate the code-index (read INDEX.md files and annotations) to understand the project. Read actual source code as needed for deeper understanding. Synthesize knowledge articles grouped by topic in `articles/`. Use the code-index + existing docs (README, specs, ARCHITECTURE.md) as input. Decide whether each piece of knowledge is a new topic or belongs in an existing article by exploring what's already in the wiki. Keep articles focused and not too long.
Batched with configurable file limit per run for large repos.

**`/ingest`** — Two modes:
1. **PR mode:** Read the full PR diff (via `gh pr diff` or GitHub API). Determine what changed. Update code-index annotations in-place for modified files. Delete annotations for removed files. Create annotations for new files. Update directory summaries. Then assess which knowledge articles are affected and update/rewrite them as appropriate. Clean stale entries.
2. **External source mode:** Process a URL, PDF, or other source. Create a new article in `external-sources/` with the raw/processed content. Optionally synthesize a knowledge article in `articles/` if the source relates to an existing topic.

**`/consolidate`** — Reads multiple scattered articles on a topic and synthesizes one canonical article. (Could scope — use case fuzzy.)

**`/research`** — Exploratory web research written to `.openknowledge/research/`. Heavy web searching. Kept separate from canonical knowledge as exploratory/provisional.

### Implementation sequencing

```
Phase 1: MCP server + init tool + catalog generator
  → Server starts, watches files, regenerates catalogs, serves instructions
  → init tool scaffolds .openknowledge/

Phase 2: /init-wiki skill
  → Agent can populate a wiki from scratch
  → Code-index + knowledge articles generated

Phase 3: CLAUDE.md conventions + AGENTS.md
  → Code-index stays fresh via agent convention
  → Any agent can navigate without MCP

Phase 4: /ingest skill (PRs)
  → Wiki stays current at PR boundaries
  → Stale entry cleanup

Phase 5 (extensions): /ingest (external), /consolidate, /research, status tool
```

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links |
|---|---|---|---|---|---|---|
| D1 | Agent writes directly to files, no CRDT | T | LOCKED | No | P0 simplicity; CRDT integration is editor team's concern | Conversation with Tim |
| D2 | Thin MCP server (file watcher + catalog gen + instructions + init), NOT just-bash proxy | T | LOCKED | No | Agent uses native tools for file ops; MCP server handles side effects only. just-bash overkill for this use case. | Research agents confirmed; conversation with Tim |
| D3 | No drafts/permissions for P0 | P | LOCKED | No | Agent writes directly; review via git history | Conversation with Tim |
| D4 | `init` as MCP tool + `/init-wiki` skill for full population | P | DIRECTED | No | MCP tool scaffolds structure; skill orchestrates agent reading entire codebase and generating content | Conversation with Tim |
| D5 | `.mcp.json` in repo for Claude Code auto-config | T | LOCKED | No | Portable across team; committed to git | Claude Code docs |
| D6 | Catalogs consolidated in `.openknowledge/`, not scattered through repo | P | LOCKED | Yes | Users don't want index files polluting their codebase | Conversation with Tim |
| D7 | Two-layer content model: knowledge articles + code mirror index | P | DIRECTED | No | Different navigation patterns for "how does auth work" vs "what does this file do" | Conversation with Tim |
| D8 | Wiki is plain markdown files in git | T | LOCKED | Yes | Readable by any agent without MCP; diffable, greppable, portable | PROJECT.md principle |
| D9 | Wiki-links and backlinks deferred | P | DEFERRED | No | Bucket 7 work; revisit after core MCP + catalogs ship | Conversation with Tim |
| D10 | `/ingest` for PRs is P0 but last to build | P | DIRECTED | No | Critical for freshness but depends on MCP + catalogs being solid first | Conversation with Tim |
| D11 | Directory structure: `articles/` (by topic) + `code-index/` (mirrors repo) + `research/` | P | DIRECTED | No | Clean separation of topical knowledge, structural codebase index, and exploratory research | Conversation with Tim |
| D12 | Catalog naming: `INDEX.md` | P | LOCKED | Yes | Team preference; uppercase distinguishes from Fumadocs `index.md`; supports frontmatter | CC6 research, conversation with Tim |
| D13 | Code mirror index: every file gets an annotation | P | DIRECTED | No | Comprehensive codebase understanding; `/init-wiki` generates all annotations on first run | Conversation with Tim |
| D14 | Code-index freshness via CLAUDE.md convention + `/ingest` at PR boundaries | X | ASSUMED | No | CLAUDE.md tells agent to update code-index after code edits (real-time best-effort); `/ingest` does systematic updates at PR granularity. CLAUDE.md compliance is unvalidated — agents may not reliably follow maintenance instructions. `/ingest` is the reliable backstop. | Conversation with Tim |
| D15 | Knowledge articles updated at PR cycle via `/ingest` | P | DIRECTED | No | PR granularity is right for higher-level knowledge; acceptable staleness | Conversation with Tim |
| D16 | MCP server tools: `init` + `instructions` (core), `rebuild_catalogs` + `status` (extensions) | T | DIRECTED | No | Minimal core; extensions added if needed | Conversation with Tim |
| D17 | Code-index annotation contains: frontmatter (title, description, tags, path) + purpose + key exports/functions + dependencies | P | DIRECTED | No | Rich enough for agent orientation; kept current by CLAUDE.md convention + `/ingest` | Conversation with Tim |
| D18 | Code-index exclusions: follow .gitignore + skip files < 25 lines. Note exclusions at directory summary level. | T | DIRECTED | No | Small config/boilerplate files not worth annotating individually | Conversation with Tim |
| D19 | External sources land in `.openknowledge/external-sources/` | P | DIRECTED | No | Separate from authored knowledge articles | Conversation with Tim |
| D20 | Stale code-index entries cleaned by `/ingest`; `status` tool detects drift | T | DIRECTED | No | Active cleanup via skill, passive detection via MCP tool | Conversation with Tim |
| D21 | `/ingest` reads full PR diff, updates/rewrites/adds/deletes as appropriate | T | DIRECTED | No | In-place edit for small changes, rewrite for large scope changes, add/delete code-index entries for new/removed files | Conversation with Tim |
| D22 | `/init-wiki` is two-phase: (1) bash exploration → code-index, (2) navigate code-index → synthesize articles | T | DIRECTED | No | Code-index first gives the agent a map; articles are synthesized from the map, reading code as needed. Uses existing INDEX.md + code-index to determine new vs existing topics. Keeps articles focused. | Conversation with Tim |
| D23 | Frontmatter schema: `title` + `description` required, `tags` recommended, everything else optional (open schema) | P | DIRECTED | No | Minimal required set; `description` is most important for catalog navigation | Conversation with Tim |

## 11) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What is the exact directory structure inside `.openknowledge/`? | P | P0 | No | → Resolved: D11. `articles/`, `code-index/`, `research/`, `INDEX.md`, `AGENTS.md`, `cache/` | Resolved |
| Q2 | How does the code mirror index stay in sync with the codebase? | T | P0 | No | → Resolved: D14. CLAUDE.md convention for real-time + `/ingest` at PR boundaries | Resolved |
| Q3 | What does the MCP tool interface look like? | T | P0 | No | → Resolved: D2. Thin server with `init` + `instructions` + file watcher. No just-bash. Agent uses native tools. | Resolved |
| Q4 | What frontmatter fields are required vs optional? | P | P0 | No | → Resolved: D23. `title` + `description` required, `tags` recommended, everything else optional (open schema). | Resolved |
| Q5 | What does the catalog file format look like? | P | P0 | No | → Resolved: D12 (naming: INDEX.md) + Section 9 (full format specified — frontmatter + articles list + subfolders list with child counts and links) | Resolved |
| Q6 | How does `/ingest` for PRs work mechanically? | T | P0 | No | → Resolved: D21. Reads full diff. Updates articles in-place or rewrites depending on scope of change. May add/delete/edit code-index entries. | Resolved |
| Q7 | How does `init` + `/init-wiki` work end-to-end? | P | P0 | No | → Resolved: D22. init scaffolds, /init-wiki does two-phase: bash exploration → code-index, then synthesize articles. Uses INDEX.md summaries + code-index to decide if topic is new or existing. Keeps articles focused, not too long. | Resolved |
| Q8 | How does the code mirror index relate to catalog files? | P | P0 | No | Code-index has its own INDEX.md catalogs, same format as articles. Agent reads root INDEX.md, sees both `articles/` and `code-index/` as top-level sections. | Resolved |
| Q9 | Should the MCP server provide access to repo files outside `.openknowledge/`? | P | P0 | No | → No. Agent already has native access to all repo files. MCP server only watches `.openknowledge/`. | Resolved |
| Q10 | What triggers catalog regeneration? | T | P0 | No | → Resolved: @parcel/watcher on `.openknowledge/` directory. Every .md file write triggers parent folder's INDEX.md regeneration. | Resolved |
| Q11 | What does the `/init-wiki` skill prompt look like? | T | P0 | No | → Resolved: D22. Two-phase: (1) Bash exploration to build full code-index first (filesystem map → annotations), (2) navigate the code-index to synthesize knowledge articles, reading code as needed for deeper understanding. | Resolved |
| Q12 | How large can the code-index get for big repos? | T | P0 | No | → Resolved: batch with a file count limit per run. Incremental. | Resolved |
| Q13 | What does a code-index file annotation actually contain? | P | P0 | No | → Resolved: D17. Frontmatter (title, description, tags, path) + purpose + key exports/functions + dependencies | Resolved |
| Q14 | How does the file watcher avoid infinite loops (catalog write triggers another watch event)? | T | P0 | No | → Resolved: Same pattern as init_spike's `file-watcher.ts` — content-hash check before writing INDEX.md (skip if unchanged) + watcher ignores INDEX.md files (they're output, not input). Two-layer prevention already validated in PR #6. | Resolved |
| Q15 | What files are excluded from code-index? | T | P0 | No | → Resolved: D18. Follow .gitignore + skip files < 25 lines. Note exclusions at directory summary level. | Resolved |
| Q16 | Where do external sources land? | P | P0 | No | → Resolved: D19. `.openknowledge/external-sources/` directory | Resolved |
| Q17 | What happens when source files are deleted/renamed? | T | P0 | No | → Resolved: D20. `/ingest` cleans stale code-index entries. `status` tool detects drift. | Resolved |
| Q18 | Concurrent writes — two agents same file? | T | P0 | No | → Resolved: Last-write-wins acceptable for P0. CRDT handled by editor team later. | Resolved |
| Q19 | Does each sub-section (articles, code-index, research, external-sources) have its own catalog? | P | P0 | No | → Resolved: Yes. Each has its own INDEX.md. Root INDEX.md links to them. | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | @parcel/watcher + @modelcontextprotocol/sdk sufficient for MCP server | HIGH | Both validated — @parcel/watcher in init_spike, MCP SDK is standard | Before implementation | Active |
| A2 | Catalog files + grep sufficient for agent navigation at P0 scale (100-1000 files) | HIGH | Grounded in architecture (hierarchical catalogs + in-memory grep is fast at this scale). The oft-cited "Amazon Science 94.5%" stat is from PROJECT.md and has not been independently verified — the assumption holds regardless based on the scale argument. | Before implementation | Active |
| A3 | Claude Code `.mcp.json` auto-configures reliably | HIGH | Documented feature; verify with test | Before implementation | Active |
| A4 | Teams will maintain the wiki if the friction is low enough | MEDIUM | First-party dogfooding at Inkeep | Ongoing | Active |

## 13) In Scope (implement now)

### Phase 1: MCP server + init + catalogs
- **Goal:** A running MCP server that scaffolds `.openknowledge/`, watches for file changes, and auto-regenerates INDEX.md catalogs
- **Requirements:** MCP server (thin), `init` tool, file watcher, catalog generator, `instructions` field, `.mcp.json`
- **Acceptance criteria:** Agent connects via MCP, calls `init`, writes a test article, INDEX.md regenerates automatically
- **Owner:** Tim
- **Risks:** File watcher loop prevention; debounce tuning

### Phase 2: /init-wiki skill
- **Goal:** Agent can populate a full wiki from an empty scaffold — code-index for every file + knowledge articles from existing docs
- **Requirements:** `/init-wiki` SKILL.md, batching, .gitignore-aware exclusions, < 25 line skip
- **Acceptance criteria:** Run `/init-wiki` on this repo (open-knowledge), produces code-index annotations + knowledge articles. Catalogs correct.
- **Owner:** Tim
- **Risks:** Token cost on large repos; batching correctness

### Phase 3: CLAUDE.md + AGENTS.md conventions
- **Goal:** Code-index stays fresh via agent convention; wiki navigable without MCP
- **Requirements:** CLAUDE.md additions, AGENTS.md template, navigation conventions documented
- **Acceptance criteria:** Agent without MCP can orient and navigate the wiki by reading files alone
- **Owner:** Tim

### Phase 4: /ingest skill (PRs)
- **Goal:** Wiki stays current at PR boundaries; stale entries cleaned
- **Requirements:** `/ingest` SKILL.md, PR diff reading (gh CLI), code-index + knowledge article updates, stale entry cleanup
- **Acceptance criteria:** Run `/ingest` on a merged PR, relevant wiki articles and code-index entries update correctly
- **Owner:** Tim
- **Risks:** Agent correctly identifying which wiki articles are affected by a diff

### Phase 5 (extensions): /ingest (external), status tool, /consolidate, /research
- **Goal:** External source ingestion, wiki health monitoring, article synthesis, exploratory research
- **Not blocking:** ship after Phase 4 proves the workflow

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Wiki goes stale despite tooling (same fate as all wikis) | Medium | High | `/ingest` for PRs; freshness signals in catalog; low-friction editing | Tim |
| Code mirror index too expensive to maintain at scale | Medium | Medium | Every file annotated (D13) but batched + incremental. At ~500+ files, consider directory-only mode. `/init-wiki` has configurable batch limits. | Tim |
| @parcel/watcher or MCP SDK limitations discovered | Low | Medium | Both are proven (watcher validated in init spike, MCP SDK is standard); fallback to named tools if thin server approach insufficient | Tim |
| Catalog format doesn't work well for agents in practice | Medium | High | Test with real agents early; iterate on format before locking | Tim |
| Spec diverges from STORIES.md Bucket 2 (intentional rescope) | Low | Medium | Document divergence; align with team. Bucket 2 assumed 10+ MCP tools + just-bash; this spec narrows to thin server + native tools. Tim's rescope — needs team alignment. | Tim |
| Two watchers on `.openknowledge/` when editor + MCP server both run | Low | Low | Desired behavior: editor persistence writes files, MCP watcher catches them and regenerates catalogs. Debounce + content-hash prevent spurious regeneration. Document the coexistence pattern. | Tim |
| Disk-first writes diverge from PROJECT.md CRDT-first assumption | Medium | Low | Intentional phasing: P0 writes to disk, editor team handles CRDT. Convergence path: when editor is ready, agent writes can route through Hocuspocus DirectConnection instead of disk. Same files either way. | Tim |
| Per-file code-index may not scale beyond ~500 files | Medium | Medium | Acceptable at P0 project sizes. For monorepos, batch limits + incremental updates. Future: directory-only mode for large repos. | Tim |

## 15) Future Work

### Explored
- **Wiki-links and backlinks (Bucket 7)** — S10 from STORIES.md. Custom TipTap wikilink node, dual adjacency list, MCP link-graph tools. Deferred because core MCP + catalogs must ship first. Trigger: wiki grows beyond ~50 articles and cross-referencing becomes painful.
- **Auto-ingestion on PR merge** — GitHub webhook or CI step that runs `/ingest` automatically. Start with manual triggers. Trigger: manual ingestion proves the workflow.

### Identified
- **`/consolidate` skill** — Synthesize scattered articles into one canonical article. Use case fuzzy. Needs its own spec pass when patterns emerge from real wiki usage.
- **`/research` skill** — Exploratory web research written to a separate wiki area. Extends `/ingest` with web search.
- **Vector/semantic search** — Orama or SQLite FTS5 for concept-level search. Trigger: wiki scale exceeds catalog + grep utility.

### Noted
- **Publishing engine** — Render wiki as external docs site. Long-term Mintlify/GitBook replacement path.
- **Cross-repo wiki federation** — Link knowledge across multiple repos. Relevant for monorepo or multi-service architectures.

## 16) Agent constraints

- **SCOPE:** `.openknowledge/` directory structure, MCP server (`src/mcp-server/` or equivalent), skill files (`/init-wiki`, `/ingest`), `.mcp.json`, CLAUDE.md additions, AGENTS.md template
- **EXCLUDE:** Editor code (TipTap, y-prosemirror, observer sync — Bucket 1), CRDT/Hocuspocus layer (editor team), persistence pipeline (Bucket 4 — Miles), presence UX (Bucket 3), permission model (Bucket 5), wiki-links/backlinks (Bucket 7 — deferred)
- **STOP_IF:** Implementation requires changes to the CRDT layer or Hocuspocus server; MCP server needs to proxy file reads/writes instead of using native tools; code-index generation exceeds reasonable token costs (>$5 per init on a 500-file repo)
- **ASK_FIRST:** Changes to `.mcp.json` schema that affect other team members' MCP configs; any tool that writes outside `.openknowledge/`; INDEX.md format changes after initial deployment (1-way door for agents already depending on the format)
