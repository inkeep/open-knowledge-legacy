# Project Wiki — MCP Surface, Catalogs & Skills

**Status:** Draft
**Owner(s):** Tim Cardona
**Last updated:** 2026-04-08
**Baseline commit:** bfee3dc
**Links:**
- Parent project: [PROJECT.md](../../PROJECT.md), [STORIES.md](../../STORIES.md)
- Research: Informed by 48 reports in the `reports/` git submodule ([inkeep/nick-reports](https://github.com/inkeep/nick-reports)). See PROJECT.md §Evidence for the full report index.
- Related specs: [bidirectional-observer-sync](../2026-04-07-bidirectional-observer-sync/), [agent-markdown-writes](../2026-04-07-agent-markdown-writes/)

---

## 1) Problem statement

**Situation:** Development teams using AI coding agents (Claude Code, Cursor, Codex) accumulate project knowledge — architecture decisions, process docs, research findings. This knowledge is what makes agents effective: an agent with accurate project context produces dramatically better output. Today this knowledge lives in scattered specs, markdown files, CLAUDE.md, Notion pages, or developers' heads.

**Complication:** This knowledge goes stale almost immediately. Specs are written, code evolves, and the specs no longer reflect reality. External research gets done but lives in disconnected reports. The result: agents work with outdated context, produce wrong suggestions, and developers lose trust in agent output. The cost compounds — every stale article makes the next agent interaction worse. Today's workarounds are manual (someone remembers to update docs) or nonexistent (docs just rot). Deep Wiki (Cognition's auto-generated codebase documentation for their Devin AI agent) generates a static snapshot but doesn't stay current. CLAUDE.md helps but is limited to a single flat file with no structure.

**Resolution:** A project wiki that lives in `.open-knowledge/` inside any git repo. Maintained by both agents and humans. Content has a clear lifecycle: raw external sources (`external-sources/`) are ingested, analyzed into research findings (`research/`), and promoted into canonical knowledge articles (`articles/`) as understanding solidifies. A thin MCP server auto-generates catalog files (INDEX.md) for navigation and serves conventions to agents on connect. Skills (`/init-wiki`, `/ingest`, `/research`, `/consolidate`) help create and maintain content at each stage. The knowledge compounds: each agent session builds on the last one's understanding. The wiki is plain markdown, navigable by any agent even without the MCP server, and committed to git alongside the code.

## 2) Goals
- G1: Agents working in a repo with `.open-knowledge/` have accurate, current project context that improves their output quality
- G2: The wiki is maintained as a side effect of normal agent work — the agent writes articles while doing its actual job, knowledge compounds over time
- G3: Any MCP-compatible agent can discover and navigate the wiki via the MCP `instructions` field and auto-generated catalogs
- G4: The wiki is useful even without the MCP server running — plain markdown files with catalog navigation readable by any agent
- G5: Content has a clear lifecycle — external sources (raw) → research (analysis) → articles (canonical) — with skills for each stage
- G6: External sources (URLs, PDFs) are ingested and preserved as raw reference material alongside authored knowledge

## 3) Non-goals
- **[NEVER]** NG1: Run LLM inference in the MCP server core — intelligence comes from the connected agent
- **[NEVER]** NG2: Code-index / file-by-file codebase mirror — the agent reads source code directly when it needs implementation details
- **[NOT NOW]** NG3: Wiki-links and backlinks (Bucket 7) — Revisit if: wiki grows beyond ~50 articles
- **[NOT NOW]** NG4: Permission model / draft branches — Revisit if: team size grows
- **[NOT NOW]** NG5: CRDT as a hard dependency — MCP server works without Hocuspocus via disk fallback. When Hocuspocus is available, writes route through DirectConnection automatically (D1). MCP doesn't support streaming text output; agent writes complete chunks, not character-by-character.
- **[NOT NOW]** NG6: Vector/semantic search — catalog + grep sufficient at P0 scale
- **[NOT NOW]** NG7: File attribution / per-author tracking — can use native file ops without collaboration server; file watcher detects changes regardless of source. Layer in later.
- **[NOT NOW]** NG8: Auto-commit versioning — no auto-commit every 30 seconds. Focus on functional indexing over git history management. GitHub Actions for index consistency across team (D17) is the team sync mechanism.
- **[NOT NOW]** NG9: PR ingestion — `/ingest` for PRs is a future extension; v0 focuses on external source ingestion and manual article maintenance
- **[NOT UNLESS]** NG10: Publishing engine (docs site from wiki) — Only if: demand emerges

## 4) Personas / consumers

- **P1: Developer using Claude Code (primary)**
  - JTBD: "My agent should know how this project works so it produces correct, context-aware output"
  - Current workflow: Writes CLAUDE.md, maintains scattered docs manually, agent frequently produces wrong suggestions due to stale context
  - Pain: Docs go stale, agent works with outdated info, developer loses trust
  - Workaround: Manually re-explain context to the agent every session, or just accept worse output
  - Success: Agent reads the wiki, produces suggestions that reflect current architecture and decisions

- **P2: Developer using Cursor/Codex/Cowork**
  - JTBD: Same as P1 but via different tool
  - Success: Can read `.open-knowledge/` files directly even without MCP; gets MCP access when their tool supports it

- **P3: Team lead / new team member**
  - JTBD: "New engineers (and their agents) should onboard faster by reading the wiki"
  - Success: New team member's agent reads the wiki and immediately understands the project

## 5) User journeys

### P1: Developer with Claude Code — happy path

1. **Discovery:** Developer clones a repo that has `.mcp.json` pointing to the openknowledge MCP server
2. **Setup:** Claude Code reads `.mcp.json`, prompts to trust the MCP server, user approves. MCP server starts. Catalogs rebuild on startup.
3. **First use (no wiki yet):** Agent reads MCP instructions, sees empty `.open-knowledge/`, runs `/init-wiki` skill. Skill reads the codebase and existing docs, writes knowledge articles grouped by topic. Catalogs auto-generate.
4. **Ongoing use:** Developer asks agent questions — agent reads wiki articles for context. Agent writes new articles as a side effect of doing work (e.g., after implementing SSO, it updates the auth architecture article). Developer edits articles directly. Catalogs stay current automatically.
5. **"Aha moment":** Agent produces a suggestion that correctly accounts for an architecture decision documented in the wiki — something it would have gotten wrong without the context.
6. **Failure/recovery:** Wiki article is stale. Agent produces wrong suggestion. Developer notices, tells agent to update the article. Agent reads the current code, updates the wiki. Next time, it's correct.

### Content lifecycle: external source → research → article

**Ingesting an external source:**
1. Developer finds a useful article/paper/PDF about a technology the team uses
2. Runs `/ingest` with the URL or file
3. Skill fetches and saves the raw content in `external-sources/`
4. Catalog updates. The raw source is now reference material any agent can read.

**Researching a topic:**
1. Developer asks agent to research CRDT alternatives
2. Agent runs `/research`, which calls `/ingest` to fetch several sources into `external-sources/`
3. Agent reads the fetched sources, analyzes them, writes findings in `research/`
4. Research article is provisional — "here's what I found, here are trade-offs"

**Promoting research to canonical knowledge:**
1. Team decides on a CRDT approach based on the research
2. Developer (or agent via `/consolidate`) writes a canonical article in `articles/` — "CRDT Architecture — why we chose Yjs, how it works, key decisions"
3. The research article stays as historical context; the article is the source of truth going forward

### Spec conversations and exploratory work

1. Developer has a long spec conversation with their agent (like this one)
2. Decisions are made, trade-offs explored, but no code is committed yet
3. Agent writes findings to `research/` — "Spec exploration: MCP surface design"
4. When decisions solidify and code ships, the understanding graduates to `articles/`

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Thin MCP server: file watcher + catalog generator + instructions + workflow prompts | MCP server starts via `.mcp.json` (stdio), watches `.open-knowledge/` for file changes, regenerates catalogs automatically, exposes three workflow prompts (`init-wiki`, `ingest`, `research`) via the MCP `prompts/list` handshake | @modelcontextprotocol/sdk + @parcel/watcher. Scaffolding moved to CLI (D4 update). |
| Must | Agent uses native tools (Read, Write, Edit, Grep) for file reads AND writes in P0. | MCP server does NOT proxy reads or writes. Agent writes to `.open-knowledge/` via native tools; the file watcher picks up changes and regenerates catalogs. | **Adaptive write path deferred — see D1 and §15 Future Work.** Native writes are functionally equivalent in the disk-only case; adaptive routing becomes valuable when Hocuspocus is running alongside (instant propagation, origin tagging, per-origin undo). |
| Must | `open-knowledge init` CLI subcommand scaffolds `.open-knowledge/` structure + wires `.mcp.json` | Running `open-knowledge init` creates the directory structure, `AGENTS.md`, starter catalogs, and writes an `openknowledge` entry to `./.mcp.json` (preserving existing entries, idempotent). | Changed from MCP tool → CLI subcommand this session — the MCP init tool created a chicken-and-egg problem for first-time setup. See D4 update. |
| Must | Catalog files (`INDEX.md`) auto-generate per folder inside `.open-knowledge/` | After any file write, the parent folder's INDEX.md updates with title/description/tags from all children | File watcher triggers regeneration |
| Must | Full catalog rebuild on server startup | Catches changes made while server was off (human edits, editor writes) | Milliseconds at P0 scale |
| Must | Knowledge articles have frontmatter (title, description, tags) | Every article has YAML frontmatter; catalog generator reads it | `title` + `description` required, `tags` recommended, open schema |
| Must | `.mcp.json` in repo configures Claude Code automatically | Team members get MCP server on clone + trust approval | Committed to git |
| Must | AGENTS.md documents wiki conventions | Any agent can navigate the wiki by reading files, even without MCP | |
| Must | MCP `instructions` field guides agent behavior on connect | Agent knows to read catalog first, then search, then read specific files | |
| Must | `.open-knowledge/config.yml` `wiki:` section supports user-defined roots with `include`/`exclude` globs | Wiki roots are configurable — default articles/, external-sources/, research/ can be reshaped freely. Each root is a browsable subtree with its own `INDEX.md`. | Merged into CLI config schema (was separate `config.yaml`). Evolved from fixed paths to `roots` array. See D16. |
| Should | `mcp__openknowledge__init-wiki` MCP prompt bootstraps wiki from empty state | Agent reads codebase + existing docs, writes knowledge articles grouped by topic, sets sticky folder descriptions on each new subfolder. Claude Code surfaces the prompt as `mcp__openknowledge__init-wiki` in the slash menu; other MCP clients use their equivalent prompt UX. | Shipped as an MCP prompt, not a SKILL.md file (pivoted this session — MCP prompts are cross-client via the protocol). |
| Should | `mcp__openknowledge__ingest` MCP prompt fetches external sources into `external-sources/` | Given a URL or file, fetches raw content and saves it as reference material with frontmatter. | Raw preservation — no analysis, just capture. Pivoted to MCP prompt. |
| Should | `mcp__openknowledge__research` MCP prompt analyzes sources and writes findings to `research/` | Uses `mcp__openknowledge__ingest` (or the same fetch workflow manually) to gather sources, then writes structured provisional findings to `research/`. | Non-canonical. Pivoted to MCP prompt. |
| Could | `consolidate` MCP prompt promotes research into canonical articles | Reads research articles + external sources on a topic, writes a definitive article in `articles/`. | Research → article promotion. Not built; still deferred per §15. |
| Could | `rebuild_catalogs` MCP tool for manual trigger | Force-regenerate all INDEX.md files | Extension |
| Could | `status` MCP tool shows wiki health | Reports stale articles, orphans, coverage gaps | Extension |

### Non-functional requirements
- Performance: Catalog regeneration < 100ms per folder at P0 scale
- Reliability: Wiki is plain files in git — crash recovery is git checkout
- Security/privacy: No secrets in wiki content; MCP server runs locally
- Portability: Wiki readable without MCP server; just markdown files

## 7) Success metrics & instrumentation
- **Agent output quality:** Qualitative — does the agent produce better suggestions when the wiki exists?
- **Knowledge compounding:** Do articles get updated over time, or do they stale? Measurable via git log on `.open-knowledge/`.
- **Adoption signal:** Number of repos with `.open-knowledge/` directory
- **What we will log:** MCP tool call counts, catalog regeneration frequency

## 8) Current state (how it works today)

- **Init spike exists** with validated CRDT plumbing, TipTap editor, observer sync, persistence pipeline, disk bridge
- **No MCP server built yet**
- **No catalog generator built yet**
- **No skills built yet**
- **48 research reports** inform architectural decisions
- **`.mcp.json` support** exists in Claude Code for project-scoped MCP servers

## 9) Proposed solution (vertical slice)

### Directory structure

```
myproject/
  src/                          # existing codebase
  .mcp.json                     # MCP server config (committed)
  CLAUDE.md                     # includes wiki conventions
  .open-knowledge/
    INDEX.md                    # root catalog — links to all sections
    AGENTS.md                   # conventions for any agent (works without MCP)
    config.yml                  # settings (wiki roots, persistence, etc.)
    articles/                   # knowledge articles grouped by topic
      infrastructure/
        deploy-process.md
        rate-limiting.md
        INDEX.md                # auto-generated catalog for this folder
      auth/
        auth-architecture.md
        INDEX.md
      INDEX.md                  # auto-generated catalog for articles/
    external-sources/           # ingested external content (/ingest skill)
      INDEX.md
    research/                   # exploratory research (/research skill)
      INDEX.md
    cache/                      # gitignored derived data
```

### config.yml (`wiki:` section)

```yaml
wiki:
  roots:
    - path: ./articles
      label: Knowledge Articles
    - path: ./external-sources
      label: External Sources
    - path: ./research
      label: Research
  include: ["**/*.md"]          # glob patterns for wiki membership
  exclude: []                   # glob patterns to exclude
```

> **Note:** `roots` is user-configurable — teams can add custom roots (e.g., `eng-research/`, `RFCs/`) beyond the default three. Each root gets its own `INDEX.md` catalog. When a root `path` points outside `.open-knowledge/` (e.g., `../docs`), ensure that directory isn't also managed by the editor's Hocuspocus persistence pipeline. Two systems watching the same directory with different source-of-truth models creates conflicts. The default paths avoid this.

### System architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       AI Agent                               │
│              (Claude Code / Cursor / Codex)                  │
│                                                              │
│  Native tools: Read, Edit, Write, Grep, Glob, Bash           │
│  Workflow prompts (via MCP `prompts/list`):                  │
│    mcp__openknowledge__init-wiki                             │
│    mcp__openknowledge__ingest                                │
│    mcp__openknowledge__research                              │
└──────────┬────────────────────────┬─────────────────────────┘
           │                        │
           │ reads + writes         │ MCP stdio connection
           │ files natively         │ (via .mcp.json)
           ▼                        ▼
┌──────────────────┐    ┌──────────────────────────────┐
│ .open-knowledge/ │    │  MCP Server                   │
│  (files on disk) │◄───│  (npx open-knowledge mcp)     │
│                  │    │                               │
│  articles/       │    │  1. instructions on connect   │
│  external-sources│    │  2. @parcel/watcher on        │
│  research/       │    │     .open-knowledge/           │
│  INDEX.md files  │    │  3. catalog regenerator        │
│                  │    │     (incl. sticky folder       │
│                  │    │      descriptions)             │
│                  │    │  4. workflow prompts           │
│                  │    │     (init-wiki, ingest,        │
│                  │    │      research)                 │
│                  │    │  NO TOOLS — scaffolding        │
│                  │    │  lives in CLI init (D4)        │
└──────────────────┘    └──────────────────────────────┘

           CLI entry points (terminal, not MCP):
           ┌─────────────────────────────────────┐
           │  open-knowledge init                │
           │    → scaffold .open-knowledge/      │
           │    → write .mcp.json                │
           │  open-knowledge mcp                 │
           │    → start stdio MCP server         │
           │  open-knowledge start               │
           │    → Hocuspocus + editor            │
           └─────────────────────────────────────┘
```

> **Note:** The CLI package name is `open-knowledge` (hyphenated). `open-knowledge mcp` starts the stdio MCP server; `open-knowledge start` (or just `open-knowledge`) starts the editor server (Bucket 6).

### Coexistence & convergence with the editor stack

> **Status:** DEFERRED. As of 2026-04-09, the adaptive write path described below is not built. Agent writes use native file tools (disk-first) in P0. The content of this section remains as the target architecture for when editor integration becomes priority. See §15 Future Work entry "Adaptive write path" and D1 (status: DEFERRED) for the revised decision.

**Adaptive write path (deferred):** When built, the MCP server will detect whether Hocuspocus is running and route writes accordingly:

```
Agent writes an article
  → Is Hocuspocus running?
    → Yes: DirectConnection → Y.Doc → persists to disk → watcher → catalogs
           (instant in editor, origin-tagged, per-origin undo works)
    → No:  native file write → disk → watcher → catalogs
           (works without editor, anonymous — no attribution)
```

Both paths produce the same outcome: a file on disk and updated catalogs. The difference is latency and attribution:

| | Disk write (no editor) | DirectConnection (editor running) |
|---|---|---|
| Editor sees change | Via disk bridge (2-10s delay) | Instant |
| Attribution ("agent wrote this") | Anonymous | Origin-tagged |
| Per-origin undo | No | Yes |
| Works without editor | Yes | No |

**Disk writes are anonymous.** The filesystem doesn't carry identity. When the editor isn't running, there's no attribution — git blame is the only record of who wrote what. This is acceptable for P0 (90% agent-generated content, review via git history).

**When both systems run simultaneously:**
- Agent writes via DirectConnection → CRDT → persists to disk → MCP watcher catches it → catalogs regenerate. Instant in editor with full attribution.
- Human edits in the editor → CRDT persists to disk → MCP watcher catches it → catalogs regenerate.
- If agent falls back to disk write (DirectConnection unavailable) → disk bridge syncs into CRDT with small delay. Anonymous in the CRDT.

**Detection mechanism:** MCP server checks for Hocuspocus on startup (attempt connection). If available, use DirectConnection for writes. If not, fall back to disk. Re-check periodically or on connection failure.

**What's long-term vs what evolves:**
- **Long-term:** Catalog generator, INDEX.md format, skill definitions, directory structure, content lifecycle.
- **Evolves:** Write path adapts based on what's available. Disk-first is the fallback, CRDT is the upgrade. No architecture rewrite needed — migration is additive.

### Relationship to STORIES.md Bucket 2

This spec **supersedes** the following STORIES.md Bucket 2 tasks:

| STORIES.md Task | Status in this spec | Rationale |
|---|---|---|
| T2.1 — MCP server with filesystem-compatible tool signatures | **Superseded.** Thin server with `init` only; agent uses native tools. | Research showed just-bash/10+ tools overkill; agent already has file tools |
| T2.2 — Knowledge-specific tools (update_frontmatter, create_draft, etc.) | **Deferred.** No custom tools for v0. | No drafts/permissions for P0 (D3); frontmatter edited via native tools |
| T2.3 — Additive enrichment in tool responses | **Deferred.** No enriched reads for v0. | Agent reads files directly; enrichment adds complexity without clear value |
| T2.4 — Wire MCP writes through Hocuspocus DirectConnection | **Adaptive.** DirectConnection used when Hocuspocus is available; disk fallback when not (D1). | See Coexistence section — adaptive write path |
| T2.5 — Catalog file generator | **In scope.** Same goal, different trigger (file watcher vs onStoreDocument). | |
| T2.6 — Catalog naming | **Resolved.** INDEX.md (D10). | |
| T2.7 — Folder metadata handling | **Deferred.** meta.yaml not in v0 scope. | |
| T2.8 — MCP instructions + AGENTS.md | **In scope.** | |
| T2.9 — just-bash evaluation | **Resolved.** Rejected (D2). | |
| T2.10 — Permission store integration | **Deferred.** No permissions for P0 (D3). | |

STORIES.md should be updated to reflect this supersession.

### Data flow: agent writes an article

```
1. Agent writes ".open-knowledge/articles/auth/sso-migration.md"
   └─ Adaptive path (D1):
      If Hocuspocus running → DirectConnection → Y.Doc → persists to disk
      If not → native Write tool → direct filesystem write

2. File lands on disk (either path)

3. @parcel/watcher detects new/changed file
   └─ MCP server's file watcher fires

4. Catalog regenerator reads all .md files in articles/auth/
   └─ Pulls frontmatter (title, description, tags) from each
   └─ Skips INDEX.md files (they're output, not input)

5. Writes articles/auth/INDEX.md
   └─ Lists all articles in auth/ with their metadata
   └─ Content-hash check prevents re-triggering the watcher

6. Propagates up: regenerates articles/INDEX.md
   └─ Lists all topic folders with their metadata + child counts

7. Propagates up: regenerates root INDEX.md
   └─ Links to articles/, research/, external-sources/
```

### Data flow: /init-wiki on a new repo

```
1. Agent connects via MCP, reads instructions
2. Instructions: "If .open-knowledge/ is empty, run /init-wiki to populate."
3. /init-wiki skill executes (runs in the agent, not the server):
   a. Reads the codebase — source files, README, existing docs, specs
   b. Synthesizes knowledge articles grouped by topic
      (e.g., "Auth Architecture", "Deploy Pipeline", "Data Model")
   c. Writes articles to articles/ with proper frontmatter
   d. File watcher catches all writes, catalogs regenerate as it goes
4. Wiki is populated. Agent and human can now read and build on it.
```

### Data flow: content lifecycle (external source → research → article)

```
1. /ingest — capture raw source
   a. Developer says: "ingest https://example.com/crdt-comparison"
   b. Skill fetches the page, saves raw content to external-sources/crdt-comparison.md
   c. Frontmatter: title, source URL, date fetched
   d. No analysis — just raw preservation

2. /research — analyze and synthesize
   a. Developer says: "research CRDT alternatives for our editor"
   b. Skill calls /ingest on several URLs → raw sources saved to external-sources/
   c. Skill reads the fetched sources + any existing wiki articles on the topic
   d. Writes analysis to research/crdt-alternatives.md
   e. Research is provisional — findings, trade-offs, open questions

3. /consolidate (or manual) — promote to canonical
   a. Team makes a decision based on the research
   b. Developer or agent writes articles/architecture/crdt-architecture.md
   c. Canonical article: "why we chose Yjs, how it works, key decisions"
   d. Research stays as historical context; article is the source of truth
```

### MCP server implementation

**Dependencies:** `@modelcontextprotocol/sdk`, `@parcel/watcher`

**Transport:** stdio. Server starts when agent connects, dies when agent disconnects.

**Tools:**
| Tool | Purpose | When called |
|---|---|---|
| `init` | Scaffold `.open-knowledge/` directory structure | First connection when wiki doesn't exist |
| `rebuild_catalogs` | Force-regenerate all INDEX.md files | Manual trigger (extension) |
| `status` | Report wiki health | On demand (extension) |

**Server capability:**
- `instructions` field (returned on MCP initialize) — guides agent on wiki conventions and navigation pattern (read INDEX.md first → grep → read specific files).

**Startup behavior:**
- On server start, immediately rebuild ALL catalog files (full pass). Catches any changes that happened while the server was off.
- Then start the file watcher for live changes going forward.

**File watcher behavior:**
- Watches `.open-knowledge/` recursively (respects `config.yml` wiki roots)
- On any `.md` file create/update/delete (excluding `INDEX.md` files):
  1. Read all sibling `.md` files' frontmatter
  2. Regenerate the parent folder's `INDEX.md`
  3. Propagate up to parent folders until root
- Debounce: 500ms quiet / 2s max (handles burst writes during `/init-wiki`)
- Loop prevention: content-hash check before writing INDEX.md; skip if unchanged

### Catalog file format (INDEX.md)

```markdown
---
title: Infrastructure
description: Deployment, CI/CD, and infrastructure knowledge
generated: true
schema_version: 1
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
schema_version: 1
---

## Sections

- **[Knowledge Articles](articles/INDEX.md)** — Architecture, processes, decisions (N articles)
- **[External Sources](external-sources/INDEX.md)** — Ingested external content
- **[Research](research/INDEX.md)** — Exploratory research and findings
```

### CLAUDE.md additions

```markdown
## .open-knowledge/ — Project Wiki

This repo has a living knowledge base in `.open-knowledge/`.

- Read `INDEX.md` at any level for navigation
- After doing significant work, update or create relevant wiki articles
- Knowledge articles live in `.open-knowledge/articles/` grouped by topic
- External sources live in `.open-knowledge/external-sources/`
```

### .mcp.json

```json
{
  "mcpServers": {
    "openknowledge": {
      "command": "npx",
      "args": ["open-knowledge", "mcp"]
    }
  }
}
```

### Skill definitions

**`/init-wiki`** — Bootstraps the wiki from an empty state. Reads the codebase systematically (source files, README, existing docs, specs). Synthesizes knowledge articles grouped by topic in `articles/`. Uses bash exploration to map the filesystem, then reads files for deeper understanding. Keeps articles focused and not too long.

**`/ingest`** — Fetches and captures an external source (URL, PDF, or other document). Saves the raw content to `external-sources/` with frontmatter (title, source URL, date fetched). No analysis — just raw preservation. This is the capture step in the content lifecycle.

**`/research`** — Analyzes a topic by gathering and synthesizing sources. Calls `/ingest` to fetch external sources into `external-sources/`, reads them alongside existing wiki content, and writes analysis/synthesis to `research/`. Research articles are provisional — findings, trade-offs, open questions. Not canonical.

**`/consolidate`** — Promotes research into canonical knowledge. Reads research articles and external sources on a topic, synthesizes a definitive article in `articles/`. The research stays as historical context; the article becomes the source of truth.

### Implementation sequencing

```
Phase 1: MCP server + init tool + catalog generator
  → Server starts, watches files, regenerates catalogs, serves instructions
  → init tool scaffolds .open-knowledge/

Phase 2: /init-wiki skill
  → Agent can populate a wiki from scratch
  → Knowledge articles generated from codebase + existing docs

Phase 3: CLAUDE.md + AGENTS.md conventions
  → Wiki maintained as side effect of normal agent work
  → Any agent can navigate without MCP

Phase 4: /ingest skill
  → External sources (URLs, PDFs) captured in external-sources/
  → Raw preservation — the capture step

Phase 5: /research skill
  → Uses /ingest to gather sources
  → Writes analysis/synthesis to research/
  → Provisional findings, not canonical

Phase 6 (extensions): /consolidate, status tool, GitHub Actions
  → Promote research → articles
  → Wiki health monitoring
```

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links |
|---|---|---|---|---|---|---|
| D1 | Adaptive write path: DirectConnection when Hocuspocus is running, disk when not | T | **DEFERRED** (was LOCKED) | No | **Reverted 2026-04-09**: not built in any user story (US-005 shipped the MCP server without the write tool). For P0, disk-first via native tools is functionally equivalent per NG5 ("MCP server works without Hocuspocus via disk fallback"). Adaptive routing becomes valuable when the editor runs alongside the MCP server — deferred until editor integration becomes priority. **Trigger to revisit:** Phase 2 (editor S1) ships AND users/agents report write conflicts or stale-editor friction that disk-first can't handle. See §15 Future Work. | Original: Conversation with Tim. Reverted: this session's session-changelog entry. |
| D2 | Thin MCP server (file watcher + catalog gen + instructions + workflow prompts), NOT a full filesystem proxy | T | LOCKED | No | **Updated 2026-04-09**: MCP server has NO tools. Scaffolding moved to CLI (D4). Write routing deferred (D1). The server exposes: `instructions`, file watcher, catalog generator with sticky folder descriptions, and three workflow prompts (`init-wiki`, `ingest`, `research`) via the MCP `prompts/list` handshake. Agent uses native tools for all file operations. | Research confirmed. |
| D3 | No drafts/permissions for P0 | P | LOCKED | No | Agent writes directly; review via git history | Conversation with Tim |
| D4 | Scaffolding is a CLI subcommand (`open-knowledge init`); `mcp__openknowledge__init-wiki` MCP prompt handles population | P | DIRECTED | No | **Updated 2026-04-09**: previously "`init` as MCP tool + `/init-wiki` skill". Both halves pivoted this session. Scaffolding moved from MCP tool to CLI because the tool created a chicken-and-egg problem for first-time setup (users couldn't invoke an MCP tool before MCP was wired up). Skills moved to MCP prompts because prompts are cross-client via the protocol (work in Claude Code, Cursor, Windsurf, etc. without client-specific file copying). | Original: conversation with Tim. Updated: this session. |
| D5 | `.mcp.json` in repo for Claude Code auto-config | T | LOCKED | No | Portable across team; committed to git | Claude Code docs |
| D6 | Catalogs consolidated in `.open-knowledge/`, not scattered through repo | P | LOCKED | Yes | Users don't want index files polluting their codebase | Conversation with Tim |
| D7 | Knowledge articles only — no code-index / file-by-file codebase mirror | P | LOCKED | No | Agent reads source code directly; wiki captures understanding (why, how things connect, processes) not file descriptions | Conversation with Tim |
| D8 | Wiki is plain markdown files in git | T | LOCKED | Yes | Readable by any agent without MCP; diffable, greppable, portable | PROJECT.md principle |
| D9 | Wiki-links and backlinks deferred | P | DEFERRED | No | Bucket 7 work; revisit after core ships | Conversation with Tim |
| D10 | Catalog naming: `INDEX.md` | P | LOCKED | Yes | Team preference; uppercase distinguishes from Fumadocs `index.md`; supports frontmatter; `schema_version` field for future migration | CC6 research |
| D11 | Directory structure: `articles/` + `external-sources/` + `research/` — three stages of the content lifecycle | P | DIRECTED | No | Raw sources → research analysis → canonical articles. Each stage has a clear home and purpose. | Conversation with Tim |
| D12 | Frontmatter schema: `title` + `description` required, `tags` recommended, open schema | P | DIRECTED | No | Minimal required set; `description` is most important for catalog navigation | Conversation with Tim |
| D13 | MCP server tools: **none**. Scaffolding is a CLI subcommand (`open-knowledge init`, D4). `rebuild_catalogs` and `status` extensions remain deferred. `instructions` is a server capability. | T | DIRECTED | No | **Updated 2026-04-09**: previously said `init` was the core tool. Moved out of the MCP server. The server's only surfaces are now: `instructions`, file watcher/catalog regen, and the three workflow prompts. | Updated this session. |
| D14 | Content lifecycle: external-sources (raw) → research (analysis) → articles (canonical) | P | LOCKED | No | `/ingest` captures raw, `/research` analyzes, `/consolidate` promotes. Knowledge matures through stages. | Conversation with Tim |
| D15 | stdio transport; full catalog rebuild on startup | T | LOCKED | No | Server lives/dies with agent session; startup rebuild catches offline changes | Conversation with Tim |
| D16 | `.open-knowledge/config.yml` `wiki:` section supports user-defined roots with `include`/`exclude` globs | P | DIRECTED | No | **Updated 2026-04-10**: wiki config now uses `wiki: { roots: [{ path, label }], include, exclude }` — user-defined roots replace the fixed `articles_path`/`external_sources_path`/`research_path` keys. Each root is a browsable subtree with its own `INDEX.md`. `init` seeds a default convention (articles/, external-sources/, research/); users reshape freely by editing config. `resolveWikiPaths(config, okDir)` in `packages/cli/src/wiki/paths.ts` maps roots to absolute dirs. | Original: meeting notes. Updated: this session. |
| D17 | GitHub Actions for index consistency across team (future) | T | DIRECTED | No | Ensures catalogs are correct even when MCP server hasn't run | Meeting notes |
| D18 | Content is ~90% agent-generated; focus on agent writing, human guiding | P | DIRECTED | No | Agent writes research findings incrementally; human provides direction | Meeting notes |
| D19 | `/ingest` is raw capture only — no analysis | P | LOCKED | No | Separation of concerns: `/ingest` fetches, `/research` analyzes. Raw sources preserved as reference. | Conversation with Tim |
| D20 | `/research` calls `/ingest` to gather sources before analyzing | T | DIRECTED | No | Skills compose: `/research` uses `/ingest` for capture, then does its own analysis | Conversation with Tim |
| D21 | Spec conversations and exploratory work go to `research/`, promote to `articles/` when decisions solidify | P | DIRECTED | No | Research is provisional; articles are canonical. Same lifecycle. | Conversation with Tim |

## 11) Open questions

All resolved. No open questions remaining.

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | @parcel/watcher + @modelcontextprotocol/sdk sufficient for MCP server | HIGH | Both validated — @parcel/watcher in init_spike, MCP SDK is standard | Before implementation | Active |
| A2 | Catalog files + grep sufficient for agent navigation at P0 scale | HIGH | Hierarchical catalogs + grep is fast at this scale | Before implementation | Active |
| A3 | Claude Code `.mcp.json` auto-configures reliably | HIGH | Documented feature; verify with test | Before implementation | Active |
| A4 | Teams will maintain the wiki if the friction is low enough | MEDIUM | First-party dogfooding at Inkeep | Ongoing | Active |
| A5 | Agent reliably updates wiki articles as side effect of work when prompted by CLAUDE.md | MEDIUM | Unvalidated — agents may not consistently follow CLAUDE.md hints. Skills (/init-wiki, /ingest, /research) are the reliable content creation mechanism. CLAUDE.md is best-effort. | Before Phase 3 | Active |

## 13) In Scope (implement now)

### Phase 1: CLI init + MCP server + catalogs
- **Goal:** A `open-knowledge init` terminal command that scaffolds `.open-knowledge/` and wires `.mcp.json`, plus a running MCP server that watches for file changes and auto-regenerates INDEX.md catalogs.
- **Requirements:** CLI `init` subcommand (scaffold + wire MCP config, idempotent), MCP server (thin, stdio, no tools), file watcher, catalog generator (with sticky folder descriptions), `instructions` field, full rebuild on startup.
- **Acceptance criteria:** Run `open-knowledge init` in a fresh directory → `.open-knowledge/` scaffolded + `.mcp.json` created. Open an MCP client → server starts, connects, delivers instructions, watcher picks up changes. Write a test article via native tools → INDEX.md regenerates automatically (including the parent folder's Subfolders list if a new subfolder was created, respecting sticky `title`/`description` frontmatter fields).
- **Owner:** Tim
- **Risks:** File watcher loop prevention; debounce tuning; `.mcp.json` merge semantics when the file already has non-openknowledge entries.

### Phase 2: /init-wiki skill
- **Goal:** Agent can populate a full wiki from an empty scaffold by reading the codebase and existing docs
- **Requirements:** `/init-wiki` SKILL.md
- **Acceptance criteria:** Run `/init-wiki` on a real repo, produces useful knowledge articles grouped by topic. Catalogs correct.
- **Owner:** Tim
- **Risks:** Token cost on large repos; article quality depends on agent capability

### Phase 3: CLAUDE.md + AGENTS.md conventions
- **Goal:** Wiki maintained as side effect of normal agent work; navigable without MCP
- **Requirements:** CLAUDE.md additions, AGENTS.md template
- **Acceptance criteria:** Agent without MCP can orient and navigate the wiki by reading files alone
- **Owner:** Tim
- **Contingency (A5):** If agents don't reliably follow CLAUDE.md maintenance hints, wiki freshness depends entirely on explicit skill invocations (/init-wiki, /ingest, /research). This is acceptable for P0 — skills are the primary content creation mechanism. CLAUDE.md becomes supplementary, not load-bearing.

### Phase 4: /ingest skill
- **Goal:** External sources (URLs, PDFs) captured as raw reference material
- **Requirements:** `/ingest` SKILL.md
- **Acceptance criteria:** Run `/ingest` with a URL, fetches and saves raw content in `external-sources/` with proper frontmatter
- **Owner:** Tim

### Phase 5: /research skill
- **Goal:** Agent can research a topic by gathering sources and writing analysis
- **Requirements:** `/research` SKILL.md, calls `/ingest` for source capture
- **Acceptance criteria:** Run `/research` on a topic, gathers sources into `external-sources/`, writes analysis to `research/`
- **Owner:** Tim

### Phase 6 (extensions): /consolidate, status tool, GitHub Actions
- **Not blocking:** ship after content lifecycle proves the workflow

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Wiki goes stale despite tooling (same fate as all wikis) | Medium | High | Low-friction editing; CLAUDE.md convention; `/init-wiki` for bootstrapping | Tim |
| Spec diverges from STORIES.md Bucket 2 (intentional rescope) | Low | Medium | Document divergence; align with team. Bucket 2 assumed 10+ MCP tools; this spec narrows to thin server + native tools. | Tim |
| Two watchers on `.open-knowledge/` when editor + MCP server both run | Low | Low | Debounce + content-hash prevent spurious regeneration | Tim |
| Catalog format doesn't work well for agents in practice | Medium | High | Test with real agents early; iterate on format before locking | Tim |
| `/init-wiki` produces low-quality articles | Medium | Medium | Iterate on skill prompt; test on multiple real repos | Tim |

## 15) Future Work

### Explored
- **Adaptive write path (D1 deferred from LOCKED, 2026-04-09)** — An MCP write tool that routes agent writes to Hocuspocus DirectConnection (when the editor is running) or disk (when not). Originally a Must requirement per D1 and D2, deferred because: (a) the disk-only subset is functionally equivalent for P0 per NG5; (b) native Write + the file watcher already achieve the same end state when the editor isn't running; (c) the three MCP prompts introduced in US-007..US-009 (now shipped as MCP prompts) instruct the agent to use its native tools directly. **Trigger to revisit:** Phase 2 editor work (S1, S2, S3) ships AND users report write conflicts, stale-editor friction, or missing origin attribution. When revisited, the work is: (1) add a `write_article` MCP tool with adaptive routing to `packages/cli/src/mcp/tools/write.ts`, (2) wire it to detect Hocuspocus via HTTP ping and fall back to atomic temp+rename on disk, (3) update all three prompt bodies to instruct agents to call the tool instead of native Write for wiki files. Estimated ~100 LOC + tests.
- **Wiki-links and backlinks (Bucket 7)** — Deferred. Trigger: wiki grows beyond ~50 articles.
- **PR ingestion** — `/ingest` reads PR diffs and updates wiki articles automatically. Trigger: manual wiki maintenance proves the workflow and teams want automation.
- **GitHub Actions for index consistency** — CI step ensures catalogs are correct across team. Trigger: team adoption.
- **`/consolidate` skill** — Promotes research into canonical articles. Part of the content lifecycle but deferred until research → article promotion pattern is validated manually.

### Identified
- **Vector/semantic search** — Trigger: wiki scale exceeds catalog + grep utility.
- **Code-index** — File-by-file codebase annotations. Dropped from P0 because agent reads code directly. Revisit if agents need pre-computed summaries for orientation at scale.

### Noted
- **Publishing engine** — Render wiki as external docs site.
- **Cross-repo wiki federation** — Link knowledge across multiple repos.
- **Browser extension** — One-click web clipping into the wiki (Obsidian Web Clipper equivalent).

## 16) Agent constraints

- **SCOPE:** `.open-knowledge/` directory structure, MCP server, MCP prompts (`init-wiki`, `ingest`, `research`), CLI `init` subcommand, `.mcp.json`, CLAUDE.md additions, AGENTS.md template, `config.yml`
- **EXCLUDE:** Editor code (TipTap, y-prosemirror — Bucket 1), CRDT/Hocuspocus layer, persistence pipeline (Bucket 4), presence UX (Bucket 3), permission model (Bucket 5), wiki-links/backlinks (Bucket 7)
- **STOP_IF:** Implementation requires changes to the CRDT layer or Hocuspocus server; MCP server needs to proxy file reads (writes use adaptive path, reads stay native)
- **ASK_FIRST:** Changes to `.mcp.json` schema that affect other team members; INDEX.md format changes after initial deployment (1-way door); any new MCP tool beyond `init`
