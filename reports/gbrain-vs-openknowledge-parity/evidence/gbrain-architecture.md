# Evidence: GBrain Architecture & Data Model (D1)

**Dimension:** D1 — Architecture & data model parity
**Date:** 2026-04-27
**Sources:** github.com/garrytan/gbrain README (master), gist spec (gist/garrytan/49c88e83cf8d7ae95e087426368809cb), prior 2026-04-07 evidence in `reports/open-knowledge-prior-art-eight-sources/evidence/d6-garrytan-gbrain.md`

---

## Key pages referenced
- https://github.com/garrytan/gbrain — README, master branch (~11.8k stars, 105 commits)
- https://raw.githubusercontent.com/garrytan/gbrain/master/docs/ethos/THIN_HARNESS_FAT_SKILLS.md
- Prior gist spec (2026-04-05) — used to compare spec vs. shipped

---

## Findings

### Finding: Shipped architecture pivoted from spec — markdown-in-Git is canonical, Postgres is the index
**Confidence:** CONFIRMED
**Evidence:** README (github.com/garrytan/gbrain) — section "Data Model":

> "Source of truth: Markdown files in a Git repository. The repo is the system of record. Database (Postgres prod or PGLite embedded, default) stores: embeddings (pgvector), typed links (knowledge graph), timelines (extracted from markdown), job queue (Minions), subagent execution ledger."
>
> "Bidirectional sync: `gbrain sync` picks up Git changes; `gbrain put` writes back to files and syncs."

**Implications:** This is a 180° turn from the original gist spec (2026-04-05) which positioned SQLite as canonical. The shipped product converged on the **same architectural bet as Open Knowledge**: markdown files are canonical, the index is derived. Open Knowledge's prior risk assessment (the spec "explicitly contradicts our markdown-canonical bet") no longer applies.

### Finding: Database engines — PGLite (embedded, default) or Postgres + pgvector (remote, Supabase)
**Confidence:** CONFIRMED
**Evidence:** README — "Database Engines: PGLite (embedded Postgres 17.5, default); Postgres + pgvector (remote, Supabase Pro $25/mo)." CLI command: `gbrain migrate --to supabase|pglite` (bidirectional engine migration). Setup time: "PGLite database ready in 2 seconds."

**Implications:** GBrain ships with a real RDBMS-grade index from day one. Open Knowledge's index today is grep + frontmatter enrichment (`packages/cli/src/mcp/tools/search.ts` confirmed: "Runs grep across tracked content and groups matches by file"). The PGLite engine is the install-friction-free path; Postgres is the scale path. Both are SQL-native, supporting structured queries that grep cannot answer (graph walks, vector NN, JSONB queries).

### Finding: Compiled-truth + timeline as a content convention (the `---` divider pattern)
**Confidence:** CONFIRMED
**Evidence:** README:

> "Above the `---`: compiled truth. Your current best understanding. Gets rewritten when new evidence changes the picture."
> "Below: timeline. Append-only evidence trail. Never edited, only added to."
>
> Example:
> ```
> ---
> type: concept
> title: Do Things That Don't Scale
> tags: [startups, growth, pg-essay]
> ---
>
> # Do Things That Don't Scale
> [Compiled truth — overwritten as new info arrives]
>
> ---
>
> - 2013-07-01: Published on paulgraham.com
> - 2024-11-15: Referenced in batch W25 kickoff talk
> ```

**Implications:** This is a pure convention — no code change required to adopt. Open Knowledge can ship it today by:
1. Updating reference skills (`ingest`, `compile`, etc.) to author in this format.
2. Adding a `compiled_truth` / `timeline` extraction utility for downstream queries.
3. Adding a lint check ("compiled-truth ↔ timeline coupling" — already in OK's planned 17-check taxonomy per `reports/knowledge-linting-karpathy-workflow/`).

### Finding: Single-writer (AI agent) explicit stance — real-time multi-user sync deferred
**Confidence:** CONFIRMED
**Evidence:** Original spec gist: "Real-time sync: Explicitly deferred. v1 uses explicit commands only — no file watcher daemon, since the brain is written by AI agents, not human editors."

Shipped behavior is consistent: README references `gbrain sync` as an explicit CLI verb (not a watcher), and there is no presence/awareness layer. GBrain is built around a single writing principal (the agent) per brain. Multiple agents/clients can hit the MCP server, but Postgres `idle-in-tx` lock detection (`gbrain doctor --locks`) hints that concurrent write contention is observed and managed at the DB layer, not via CRDT.

**Implications:** This is the **intentional, load-bearing divergence** from Open Knowledge. OK's CRDT topology (Y.Doc + Hocuspocus + observer bridge) exists specifically to enable simultaneous human + AI co-editing on the same document — that's PROJECT.md's P0 differentiator. Architecturally:
- GBrain optimizes for **agent throughput at scale on a single-principal brain**.
- OK optimizes for **human ↔ agent co-presence on a shared document**.
- These bets are not directly portable to one another. OK can adopt GBrain's index/skills/graph without giving up CRDT; GBrain would have to add a CRDT layer or accept session-level locking to add multi-user.

### Finding: Tech stack — Bun runtime, TypeScript 98.3%, pgvector HNSW cosine, OpenAI embeddings, MCP stdio + HTTP remote
**Confidence:** CONFIRMED
**Evidence:** README:
- Language: TypeScript (98.3%)
- Runtime: Bun (package manager + runtime)
- Vector search: pgvector (HNSW cosine)
- Full-text search: Postgres tsvector + websearch_to_tsquery
- Embeddings: OpenAI embeddings API
- Models: Claude (Opus/Haiku), Groq Whisper (transcription)
- MCP: stdio + HTTP remote (ngrok tunnel pattern)
- License: MIT

**Implications:**
- **Bun is shared.** OK is also Bun-native (`bun@1.3.13` per CLAUDE.md). Common runtime, common ergonomics.
- **MIT license is permissive.** OK can borrow GBrain skill files / patterns without license complications.
- **HTTP MCP remote** is supported via ngrok. OK ships stdio-only via `ok start` per `packages/cli/`. Extending OK's MCP to support HTTP is non-trivial but tractable.

### Finding: Repo structure prioritizes skills/, recipes/, conventions/
**Confidence:** CONFIRMED
**Evidence:** README repo tree (verbatim):

```
skills/                — 29 skill files
  - RESOLVER.md        — Skill dispatcher (agent reads this first)
  - signal-detector/
  - brain-ops/
  - ingest/
  - ...
  - conventions/       — Shared rules (quality.md, brain-first.md, model-routing.md, test-before-bulk.md, cross-modal.yaml)
recipes/               — Integration recipes (ngrok, Twilio, Gmail, X, Calendar, meeting-sync, data-research)
templates/             — Page templates
src/
  - commands/          — CLI command implementations
  - engines/           — Pluggable database engines (PGLite, Postgres)
docs/
  - ethos/             — THIN_HARNESS_FAT_SKILLS.md
  - mcp/               — Per-host MCP setup
  - integrations/
  - benchmarks/        — 2026-04-18-brainbench-v1.md
AGENTS.md              — Agent operating protocol (non-Claude; read first)
CLAUDE.md              — Claude Code operating protocol
INSTALL_FOR_AGENTS.md  — Agent installation workflow
llms.txt               — Documentation map (for LLMs)
llms-full.txt          — Documentation map + core docs inlined
openclaw.plugin.json   — Plugin manifest
```

**Implications:**
- `AGENTS.md + CLAUDE.md` symlink pattern matches OK exactly (per OK's `CLAUDE.md` referencing the symlink to `AGENTS.md`).
- `skills/RESOLVER.md` as a routing manifest is novel for OK — see D4 evidence.
- `recipes/` directory — first-class concept of "self-installing integration patterns." OK has no equivalent today.
- `llms.txt` + `llms-full.txt` — documentation map specifically for LLM consumption. OK has CLAUDE.md but no `llms.txt`.

---

## Negative searches

- Searched README + GitHub directory for evidence of CRDT, Y.Doc, Yjs, Hocuspocus, real-time collaboration → **NOT FOUND**. GBrain has no live collaboration layer.
- Searched for "presence", "awareness", "co-editing" → **NOT FOUND**.
- Searched for "WYSIWYG", "TipTap", "ProseMirror", "browser editor" → **NOT FOUND**. GBrain has no native editor; it relies on the user's terminal/IDE/agent.

---

## Gaps / follow-ups

- GBrain's actual MCP tool list (30+ tools) is referenced in README but not enumerated in the README itself. The `docs/mcp/CLAUDE_CODE.md` file describes setup but not the tool surface. Source of truth would be `src/mcp/tools/` in the repo — not fetched in this pass. Inferred set is captured in `gbrain-mcp-cli.md`.
- Performance characteristics (pgvector HNSW build time, embed-on-write latency) not quantified beyond "ready in 2 seconds" install claim and the BrainBench P@5/R@5 numbers (separate evidence file).
