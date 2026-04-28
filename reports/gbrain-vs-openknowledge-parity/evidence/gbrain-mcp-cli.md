# Evidence: GBrain MCP & CLI Surface (D5 + D7)

**Dimension:** D5 (MCP tool surface parity) + D7 (CLI surface parity)
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README — full CLI command tree; README MCP claims; docs/mcp/CLAUDE_CODE.md (limited setup info only)

---

## Findings

### Finding: GBrain CLI surface — full command tree (verbatim from README)
**Confidence:** CONFIRMED
**Evidence:** README "Setup / Pages / Search / Import-Export / Files / Embeddings / Links & Graph / Jobs / Skills / Admin / Code Integration / Agent Durability" sections:

**Setup:**
- `gbrain init [--supabase|--url]` — Create brain (PGLite default)
- `gbrain migrate --to supabase|pglite` — Bidirectional engine migration
- `gbrain upgrade` — Self-update with feature discovery

**Pages:**
- `gbrain get <slug>` — Read a page (fuzzy slug matching)
- `gbrain put <slug> [< file.md]` — Write/update (auto-versions)
- `gbrain delete <slug>` — Delete a page
- `gbrain list [--type T] [--tag T]` — List with filters

**Search:**
- `gbrain search <query>` — Keyword search (tsvector)
- `gbrain query <question>` — Hybrid search (vector + keyword + RRF)

**Import/Export:**
- `gbrain import <dir> [--no-embed]` — Import markdown (idempotent)
- `gbrain sync [--repo <path>]` — Git-to-brain incremental sync
- `gbrain export [--dir ./out/]` — Export to markdown

**Files (cloud blob storage):**
- `gbrain files list|upload|sync|verify`
- `gbrain files mirror <dir>` — Copy to cloud, local untouched
- `gbrain files redirect <dir>` — Replace local with .redirect pointers
- `gbrain files clean <dir>` — Remove pointers, cloud only
- `gbrain files restore <dir>` — Download everything back (undo)

**Embeddings:**
- `gbrain embed [<slug>|--all|--stale]` — Generate/refresh embeddings

**Links & Graph:**
- `gbrain link|unlink|backlinks` — Cross-reference management
- `gbrain extract links|timeline|all` — Batch backfill (--source db|fs, --type, --since, --dry-run)
- `gbrain graph-query <slug>` — Typed traversal (--type T --depth N --direction in|out|both)

**Jobs (Minions):**
- `gbrain jobs submit <name> [--params JSON] [--follow]`
- `gbrain jobs list [--status S] [--queue Q]`
- `gbrain jobs get|cancel|retry|delete <id>`
- `gbrain jobs prune [--older-than 30d]`
- `gbrain jobs stats` — Job health dashboard
- `gbrain jobs smoke` — One-command health check
- `gbrain jobs work [--queue Q] [--concurrency N]` — Start worker daemon
- `gbrain jobs supervisor --concurrency 4` — Auto-restarting worker (Postgres only)

**Skills (v0.19):**
- `gbrain skillify scaffold <name>`
- `gbrain skillify check [path]`
- `gbrain skillpack list|install <name>|install --all|diff <name>`
- `gbrain check-resolvable [--strict]`
- `gbrain routing-eval [--llm] [--json]`

**Admin:**
- `gbrain doctor [--json] [--fast]` — Health checks (resolver, skills, DB, embeddings)
- `gbrain doctor --fix [--dry-run]` — Auto-fix DRY violations
- `gbrain doctor --locks` — List idle-in-tx backends (Postgres only)
- `gbrain stats` — Brain statistics
- `gbrain serve` — MCP server (stdio)
- `gbrain integrations` — Integration recipe dashboard
- `gbrain sources list|add|remove|...` — Multi-source brain management (v0.18)
- `gbrain dream [--dry-run] [--phase N]` — One maintenance cycle then exit (cron-friendly)
- `gbrain check-backlinks check|fix` — Back-link enforcement
- `gbrain lint [--fix]` — LLM artifact detection
- `gbrain repair-jsonb [--dry-run]` — Repair v0.12.0 double-encoded JSONB (Postgres)
- `gbrain orphans [--json] [--count]`
- `gbrain transcribe <audio>` — Transcribe audio (Groq Whisper)
- `gbrain research init <name>` — Scaffold a data-research recipe
- `gbrain research list` — Show available recipes

**Code Integration (GStack Bridge):**
- `gbrain code-callers <symbol>`
- `gbrain code-callees <symbol>`
- `gbrain code-def <symbol>`
- `gbrain code-refs <symbol>`
- `gbrain query "..." --near-symbol <symbol> --walk-depth 2`

**Agent Durability (v0.15):**
- `gbrain agent run "prompt"` — Single-subagent run
- `gbrain agent run "prompt" --fanout-manifest manifests/pages.json --subagent-def analyzer`
- `gbrain agent logs <id> --follow --since 5m`

**Total CLI verbs:** ~70+ distinct subcommands across 12 groups.

### Finding: Open Knowledge's current CLI surface (1P)
**Confidence:** CONFIRMED
**Evidence:** Directory listing of `packages/cli/src/commands/`:
- `auth/` (auth subcommands)
- `clean.ts`, `clone.ts`
- `editors.ts`, `init.ts`, `install-skill.ts`
- `lock-state.ts`, `mcp.ts`
- `preview.ts`, `pull.ts`, `push.ts`
- `seed.ts`, `self-spawn.ts`
- `start.ts`, `status.ts`, `stop.ts`, `sync.ts`
- `ui-proxy.ts`, `ui.ts`

**Total OK CLI verbs:** ~19 distinct commands. Per CLAUDE.md, top-level commands are `ok start | init | mcp` (and `bin: open-knowledge` + `ok`).

**Implications:** OK has ~19 CLI commands; GBrain has ~70+. The biggest verb-cluster gaps:
- **`pages`** group (`get|put|delete|list`) — OK relies on the editor + MCP edit_document for these
- **`embed`** (entire concept missing in OK)
- **`graph-query`, `extract`, `link`/`unlink`** (missing)
- **`jobs`** group (entire concept missing — OK has no job queue)
- **`skillify` + `skillpack`** group (missing — OK has `install-skill` only)
- **`agent run|logs`** (missing)
- **`code-callers|callees|def|refs`** (missing)
- **`dream`, `lint`, `doctor`, `integrations`** (missing)
- **`migrate`, `transcribe`, `research`, `sources`** (missing)
- **`files`** group (missing — OK has no cloud blob storage)

OK has that GBrain doesn't:
- **`preview`, `ui`, `ui-proxy`** — browser-based editor + preview (entire UI subsystem)
- **`pull`, `push`, `sync`, `clone`** — git-aware lifecycle (gbrain has `sync` only; OK's git story is more developed)
- **`editors`** — editor-launcher integration
- **`seed`** — content scaffolding
- **`self-spawn`** — auto-relaunch / fast-mode pattern
- **`status`, `start`, `stop`** — server lifecycle

### Finding: GBrain MCP server — claimed 30+ tools via stdio + HTTP remote
**Confidence:** CONFIRMED (count); INFERRED (specific tool names)
**Evidence:** README "Tech Stack: MCP: Model Context Protocol (stdio & HTTP remote)". README "30+ MCP tools via stdio" claim. Setup config:

```json
{
  "mcpServers": {
    "gbrain": { "command": "gbrain", "args": ["serve"] }
  }
}
```

Inferred tool names (mapping from CLI verbs and original spec's 14 tools):
- `gbrain_search`, `gbrain_query` — keyword + hybrid retrieval
- `gbrain_get`, `gbrain_put`, `gbrain_delete`, `gbrain_list` — page CRUD
- `gbrain_import`, `gbrain_sync`, `gbrain_export` — ingestion lifecycle
- `gbrain_embed` — embedding generation
- `gbrain_link`, `gbrain_unlink`, `gbrain_backlinks` — cross-reference
- `gbrain_extract` — backfill
- `gbrain_graph_query` — typed traversal
- `gbrain_timeline_*` — timeline ops (from spec)
- `gbrain_tag`, `gbrain_tags` — tagging
- `gbrain_stats` — statistics
- `gbrain_raw` — sidecar enrichment data
- `gbrain_jobs_*` — job queue (submit, list, get, cancel, retry, stats)
- `gbrain_agent_run`, `gbrain_agent_logs` — durable subagents
- `gbrain_orphans`, `gbrain_doctor` — maintenance
- `gbrain_integrate` — recipe install

**Note:** docs/mcp/CLAUDE_CODE.md does not enumerate tool schemas — it covers MCP server setup only. The exact 30+ tool list would require reading `src/mcp/tools/` in the repo. Tool names follow `gbrain_<verb>` (snake_case) convention per spec.

### Finding: Open Knowledge MCP tool surface (1P)
**Confidence:** CONFIRMED
**Evidence:** Directory listing of `packages/cli/src/mcp/tools/`:

| OK MCP tool | Purpose |
|---|---|
| `consolidate` | Consolidate factual content from sources |
| `edit_document` | Surgical markdown edits via CRDT |
| `exec` | Whitelisted shell exec (cat/ls/grep/find) |
| `get_backlinks` | Pages linking TO a slug |
| `get_dead_links` | Find broken wiki-links |
| `get_forward_links` | Pages a doc links TO |
| `get_history` | Version history of a page |
| `get_hubs` | Hub pages (high in-degree) |
| `get_orphans` | Pages with no inbound links |
| `ingest` | Ingest external sources |
| `list_documents` | List docs with filters |
| `preview_url` | Get preview URL for a doc |
| `read_document` | Read a markdown doc |
| `rename_document` | Rename a doc + update links |
| `research` | Research workflow trigger |
| `rollback_to_version` | Rollback to prior version |
| `save_version` | Snapshot a version |
| `search` | grep + frontmatter enrichment |
| `suggest_links` | Suggest wiki-link candidates |
| `write_document` | Write a new doc |

**Total OK MCP tools:** 20 (matches CLAUDE.md's "current plan of 10 tools" reference but exceeds it — OK has grown past the original target).

**Implications:**
- **MCP tool count is comparable** (OK 20, GBrain ~30). The bigger gap is **what kinds of operations are exposed**.
- OK uniquely has: `edit_document` (surgical, CRDT-aware), `preview_url`, `get_hubs`, `get_dead_links`, `consolidate`, `research`, `save_version`/`rollback_to_version`, `suggest_links`, `rename_document` (with link updates).
- GBrain uniquely has: vector/hybrid retrieval, typed graph queries, embedding management, jobs, durable subagents, code-symbol queries, integrations dashboard, sources management, dream cycle, lint, transcribe.
- **Naming convention diverges:** OK uses underscored verbs (`read_document`, `get_backlinks`, `edit_document`); GBrain uses prefixed underscored verbs (`gbrain_search`, `gbrain_query`, `gbrain_graph_query`). Both are valid; the prefix is GBrain's namespace marker.

### Finding: MCP transports — both projects ship stdio; GBrain adds HTTP remote
**Confidence:** CONFIRMED
**Evidence:** GBrain README shows HTTP remote pattern: `ngrok http 8787 --url your-brain.ngrok.app` + `bun run src/commands/auth.ts create "claude-desktop"` to mint auth tokens. Then `claude mcp add gbrain -t http https://YOUR-DOMAIN.ngrok.app/mcp -H "Authorization: Bearer YOUR_TOKEN"`.

OK ships stdio-only via `ok mcp` per `packages/cli/src/commands/mcp.ts`. The Hocuspocus server runs separately (`ok start`); the MCP server auto-discovers it via `server.lock`.

**Implications:** GBrain's HTTP remote pattern enables **shared-brain across multiple clients/devices** (mobile, multiple machines pointing at one tunneled brain). OK's stdio pattern is local-first; remote access would require an HTTP MCP layer + auth token system. The auth piece is the harder part — OK has `auth/` commands but no token-mint-for-MCP flow.

---

## Negative searches

- Searched docs/mcp/ for explicit tool list documentation → NOT FOUND. The docs/mcp directory documents per-host setup (CLAUDE_CODE, CLAUDE_DESKTOP, CLAUDE_COWORK, PERPLEXITY, ALTERNATIVES, DEPLOY) but no tool schemas.
- Searched for whether GBrain MCP supports resources/prompts (beyond tools) → INCONCLUSIVE; not mentioned in fetched content.

---

## Gaps / follow-ups

- Authoritative tool list requires reading `src/mcp/tools/` in repo (not fetched).
- Whether `gbrain serve` exposes resources or prompts (per MCP spec) is undocumented in fetched material.
- HTTP transport details (how auth tokens are minted, rotated, scoped) — referenced but not deep-fetched.
