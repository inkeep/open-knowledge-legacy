---
title: "GBrain vs Open Knowledge — Capability Parity Audit (2026-04-27)"
description: "Two-way capability comparison between Garry Tan's GBrain (github.com/garrytan/gbrain, ~11.8k stars, v0.21+) and Open Knowledge as of 2026-04-27. Inventories what each system ships across architecture (markdown-canonical + index), retrieval (hybrid vector/keyword/graph + RRF), knowledge graph (auto-typed-link extraction), skills (29 vs ~1, with resolver/skillify/skillpack), MCP tool surface (~30 vs 20), CLI verbs (~70+ vs ~19), background work (Minions Postgres job queue, durable subagents, dream cycle), lint/maintenance (13 surfaces vs 2), integrations (7 recipes vs 0), and code-bridge. Identifies the load-bearing intentional divergence (GBrain single-writer agent-only; OK CRDT real-time human+AI co-editing), classifies each parity gap by cost (convention / skill / MCP-tool / CLI / architectural / out-of-scope), and ranks shippable parity work."
createdAt: 2026-04-27
updatedAt: 2026-04-27
subjects:
  - GBrain
  - Garry Tan
  - Open Knowledge
  - Y.js
  - Hocuspocus
  - PGLite
  - pgvector
  - Postgres
  - MCP
  - GStack
topics:
  - capability parity
  - hybrid retrieval
  - knowledge graph
  - skills architecture
  - resolver
  - durable jobs
  - CRDT collaboration
  - markdown canonical
---

# GBrain vs Open Knowledge — Capability Parity Audit

**Purpose:** Plan parity work between Open Knowledge and Garry Tan's GBrain. The reader cares most about (1) the actual capability matrix today, (2) which gaps are cheap convention/skill adoption vs which are architectural, (3) a ranked plan of shippable parity work — and (4) where parity is *intentionally* asymmetric because the products have made different load-bearing bets.

---

## Executive Summary

GBrain shipped on 2026-04-10 (~17 days ago) at github.com/garrytan/gbrain. As of 2026-04-27 it has ~11.8k stars, v0.21+ (Cathedral II), 29 bundled skills, a ~30-tool MCP surface, ~70+ CLI verbs across 12 groups, and a production deployment of 17,888 pages built in 12 days. The shipped architecture **pivoted from the original spec** — the gist's "SQLite-canonical, markdown-export" plan was abandoned. GBrain now uses **markdown-in-Git as the system of record**, with PGLite (embedded Postgres 17.5, default) or Postgres + pgvector (Supabase, $25/mo) as the **derived index**. This is the same architectural bet as Open Knowledge.

**The load-bearing intentional asymmetry:** GBrain is single-principal (one AI agent writes per brain), explicitly defers real-time multi-user sync, and has no native editor. Open Knowledge is built around real-time CRDT co-editing (Y.Doc + Hocuspocus + observer bridge), ships TipTap WYSIWYG + CodeMirror source mode in a browser/Electron app, and treats human+AI co-presence on the same document as the P0 differentiator. **Neither side can adopt the other's load-bearing bet without a rebuild.** Everything else can be ported, adopted, or de-emphasized at varying parity cost.

**Where GBrain leads OK today (highest-leverage parity work, ranked):**

1. **Hybrid retrieval (vector + keyword + RRF + graph + backlink boost).** OK's `search` is grep + frontmatter today. GBrain's `query` benchmarks at P@5 49.1%, R@5 97.9%, with the graph layer contributing +31.4 P@5 points over its own graph-disabled variant. This is the single biggest **product-quality** gap. **Cost: architectural.** Requires: embeddings pipeline, vector index (pgvector or sqlite-vec or local-only), RRF fusion code, ranking heuristics. **Order weeks, not months.**

2. **Auto-extracted typed knowledge graph (zero-LLM regex extraction).** Five edge types in GBrain (`attended`/`works_at`/`invested_in`/`founded`/`advises`); the type inference cascade and within-page dedup are the novel pieces. OK's `[[wiki-link]]` has no edge typing today. **Cost: convention + extraction code.** Pick canonical edge set for OK's domain (likely `references`, `supersedes`, `derived_from`, `child_of`, `mentions`, `cites`), wire extraction into the file watcher, store in the index. **Order: weeks.**

3. **Compiled-truth + timeline content convention.** Pure markdown convention, zero code change. Above the `---`: rewriteable summary; below: append-only timeline. Becomes load-bearing for retrieval ranking once compiled-truth boost exists. **Cost: convention only.** Update reference skills + add a lint check (#12 in the 17-check taxonomy: compiled-truth ↔ timeline coupling). **Order: days.**

4. **Skills architecture at scale + resolver + skillify + skillpack.** GBrain ships 29 skills with `skills/RESOLVER.md` as the routing manifest, `gbrain skillify` to promote ad-hoc fixes into durable skills, and `gbrain skillpack` for bundle install/diff. OK has one shipped skill (`open-knowledge`). **Cost: skill-only with infrastructure additions.** First step is the resolver convention + the skillify/skillpack scaffolding — that unlocks shipping skills incrementally without each one being a one-off. **Order: weeks for infrastructure, ongoing for skills.**

5. **Postgres-native durable job queue (Minions) + durable subagents + dream cycle.** $0.00/task, 100% durability, parent-child DAGs, fan-out/fan-in. Enables scheduled maintenance (every N hours: re-extract links, refresh stale embeddings, run lint). **Cost: architectural** — adds a Postgres dependency (or a separate SQLite job table). Aligns with adding embeddings (#1) since both push toward an SQL backend. **Order: weeks.**

6. **Lint/maintenance surface — 13 enforceable checks vs OK's 2.** OK has dead-link + orphan detection. GBrain ships citation-fixer, back-link enforcement, LLM-artifact lint, stale-page, embedding-freshness, resolver-conformance, routing-eval, skill-audit, doctor, smoke, skillpack-check. The 17-check taxonomy already exists in OK research (`reports/knowledge-linting-karpathy-workflow/`). **Cost: skill-only + a few new MCP/CLI verbs.** **Order: weeks, incremental.**

**Where OK leads GBrain (and these are not parity work — they are OK's moat):**

- **Real-time CRDT co-editing on the same document.** Multiple humans + AI agents simultaneously, sub-second propagation, per-writer attribution, per-writer undo.
- **TipTap WYSIWYG + CodeMirror source mode** with lossless markdown round-trip (11 invariants, 11 documented irreducible gaps).
- **Live preview attached to agent edits** (preview-attach-once + agent-flash side-channel + agent-effects ring buffer) — visual co-presence while the agent works.
- **Per-session writer identity taxonomy** (5 categories of writer with frozen origin objects) and per-agent undo via Y.UndoManager.
- **Electron desktop app** + browser editor — distribution-ready product, not just CLI plumbing.
- **OpenTelemetry server + browser instrumentation**, file watcher with bidirectional disk↔CRDT sync, symlink-realpath identity, atomic-write discipline.
- **Codified architectural correctness** — 27 numbered precedents, 17 STOP rules, 14 WARN rules cited at ~50 code sites; 11 markdown-fidelity invariants under PBT.

These are **architectural moats**, not features that can be copied piecemeal. They exist because OK targeted human+AI co-editing from the start.

**Recommended posture:** Accept the asymmetry. Adopt the cheap stuff (compiled-truth convention, edge-typed wiki-links, the `brain-first.md` lookup discipline) immediately. Plan the medium stuff (hybrid retrieval, durable jobs, skill infrastructure) as 1-2 quarters of focused work. Don't try to match GBrain's voice/email/X/calendar integrations or GStack code-bridge — those are GBrain's product-shape decisions, not parity gaps. Stay focused on what makes OK distinct: human+AI co-editing on the document.

**Key Findings:**

- **Architecture pivot:** GBrain shipped markdown-canonical + Postgres-index — the same bet as OK. Spec-era "SQLite-canonical" critique no longer applies. ([D1](#d1--architecture--data-model))
- **Retrieval gap is the highest-leverage parity work.** GBrain's hybrid pipeline (vector + keyword + RRF + graph + backlink boost) benchmarks at P@5 49.1%; OK is grep-only. The graph layer alone contributes +31.4 P@5 points. ([D2-D3](#d2--retrieval-and-d3--knowledge-graph))
- **29 skills + resolver + skillify is GBrain's category-shaping move.** OK ships 1 skill. The infrastructure (resolver, skillify scaffold/check, skillpack install/diff) matters more than the skill count. ([D4](#d4--skills--resolver))
- **Minions (Postgres job queue) is categorically different from sub-agents for deterministic background work.** $0/task, 100% durability, parent-child DAGs. OK has no equivalent. ([D6](#d6--background-work--agent-durability))
- **OK's CRDT real-time co-editing is the single biggest GBrain gap that GBrain explicitly defers and OK should not give up.** ([D8](#d8--ok-unique-capabilities))

---

## Research Rubric

**Stance:** Conclusions (ranked recommendations linked to evidence).

| # | Dimension | Depth | Priority | Evidence |
|---|-----------|-------|----------|----------|
| D1 | Architecture & data model | Deep | P0 | [evidence/gbrain-architecture.md](evidence/gbrain-architecture.md) |
| D2 | Retrieval (vector + keyword + RRF) | Deep | P0 | [evidence/gbrain-retrieval-and-graph.md](evidence/gbrain-retrieval-and-graph.md) |
| D3 | Knowledge graph (typed links + traversal) | Deep | P0 | [evidence/gbrain-retrieval-and-graph.md](evidence/gbrain-retrieval-and-graph.md) |
| D4 | Skills architecture + resolver + skillify + skillpack | Deep | P0 | [evidence/gbrain-skills-resolver.md](evidence/gbrain-skills-resolver.md) |
| D5 | MCP tool surface | Moderate | P0 | [evidence/gbrain-mcp-cli.md](evidence/gbrain-mcp-cli.md) |
| D6 | Background work / agent durability | Moderate | P0 | [evidence/gbrain-durability-jobs.md](evidence/gbrain-durability-jobs.md) |
| D7 | CLI verb surface | Moderate | P1 | [evidence/gbrain-mcp-cli.md](evidence/gbrain-mcp-cli.md) |
| D8 | OK's unique capabilities (1P) | Deep | P0 | [evidence/openknowledge-unique-capabilities.md](evidence/openknowledge-unique-capabilities.md) |
| D9 | Lint / maintenance | Moderate | P1 | [evidence/gbrain-lint-maintenance.md](evidence/gbrain-lint-maintenance.md) |
| D10 | Integrations & enrichment | Light | P1 | [evidence/gbrain-integrations-enrichment.md](evidence/gbrain-integrations-enrichment.md) |
| D11 | Identity & persona artifacts | Light | P2 | [evidence/gbrain-skills-resolver.md](evidence/gbrain-skills-resolver.md) |
| D12 | Code-knowledge bridge (GStack) | Light | P2 | [evidence/gbrain-code-bridge.md](evidence/gbrain-code-bridge.md) |

**Non-goals:** Implementation (handoff to `/spec` or `/ship`); license audit (gbrain is MIT, no concern); Garry Tan / YC competitive-positioning (covered in `reports/cli-command-naming-brain/`); benchmark methodology critique; pricing analysis; UI-design parity.

---

## Detailed Findings

### D1 — Architecture & Data Model

**Finding:** GBrain shipped with **markdown-in-Git as the system of record** and PGLite/Postgres + pgvector as the index — the same architectural bet as Open Knowledge. The original spec's "SQLite-canonical" plan was abandoned. The single material divergence is multi-writer support: GBrain is **single-principal (AI agent), explicitly defers real-time sync**; OK is **multi-writer (humans + agents) via CRDT**.

**Evidence:** [evidence/gbrain-architecture.md](evidence/gbrain-architecture.md)

**Implications:**
- The 2026-04-07 prior-art evidence (`reports/open-knowledge-prior-art-eight-sources/evidence/d6-garrytan-gbrain.md`) flagged "GBrain bets the opposite of open-knowledge on canonical format." That risk no longer exists — both projects independently converged on markdown-canonical.
- GBrain's choice of **PGLite as default install** is a useful reference for OK if/when OK adopts a structured index. PGLite is bundled, no native deps, ready in 2 seconds — the install-friction-free path.
- **The "single-writer agent-only" stance** is what enables GBrain's whole architecture (Postgres locks, Postgres job queue, Postgres durable subagents). It also costs GBrain the human+AI co-editing scenario entirely.

**Decision triggers (when this matters):**
- If we commit to a Postgres backend for OK's index, PGLite-as-default is the right model (CLI install on PGLite; opt-in to Postgres/Supabase for scale).
- If we ever consider relaxing CRDT for a single-user OK-Lite mode, GBrain's architecture is the proof-of-concept of how that looks.

**Remaining uncertainty:**
- Whether PGLite scales acceptably for OK's targeted KB sizes (100-1000 articles initially, growing toward 5K+). GBrain claims production at 17,888 pages on Supabase Postgres, but the PGLite ceiling is undocumented in fetched content.

---

### D2 — Retrieval and D3 — Knowledge Graph

**Finding:** GBrain ships **hybrid retrieval** (intent classifier → multi-query expansion → vector via pgvector HNSW cosine + keyword via tsvector → RRF fusion → cosine re-scoring → compiled-truth boost → backlink boost → 4-layer dedup). The shipped pipeline benchmarks at **P@5 49.1%, R@5 97.9%** on BrainBench v1, with **the graph layer contributing +31.4 P@5 points** over the graph-disabled variant. The graph itself is **auto-extracted with zero LLM calls** via regex + heuristic + type-inference cascade, producing five typed edge types (`attended`, `works_at`, `invested_in`, `founded`, `advises`).

**Evidence:** [evidence/gbrain-retrieval-and-graph.md](evidence/gbrain-retrieval-and-graph.md)

**Open Knowledge today:** `search` MCP tool is grep + frontmatter enrichment (`packages/cli/src/mcp/tools/search.ts` confirmed). No embeddings, no vector index, no RRF, no typed-link graph, no ranking heuristics. `get_backlinks` and `get_forward_links` exist as 1-hop graph queries; no traversal with `--depth`/`--type`/`--direction`.

**Implications:**
- This is the **single biggest product-quality gap**. Vector retrieval + graph traversal are qualitatively different from grep — they answer questions grep cannot ("documents semantically related to X within 2 hops of Y").
- **The graph layer is load-bearing.** Without it, GBrain's retrieval drops to roughly OK's grep-only level. So if OK adds embeddings without the graph, expected lift is moderate. The pair (embeddings + typed graph) is what produces the headline numbers.
- **Auto-extraction with zero-LLM is a non-obvious win.** It means the graph stays current at no marginal cost on every write. The mechanism (regex + code-fence stripping + type cascade + within-page dedup + stale-link reconciliation) is portable to OK.
- **For OK, the canonical edge types differ from GBrain's people-graph types.** Likely candidates for OK: `references` / `mentions` (general), `supersedes` (replaces), `derived_from` (provenance), `child_of` (folder hierarchy), `cites` (with citation-fixer skill).

**Decision triggers:**
- If we add embeddings, we should also add the graph + RRF in the same milestone — partial work leaves most of the lift on the table.
- If we keep deferring retrieval entirely, accept that OK's "find by content" experience stays at grep-level indefinitely. Acceptable only if the editor + co-presence is the primary value, not retrieval-based KB queries.

**Recommendation (Conclusions stance):** Schedule a focused 1-2 month effort on hybrid retrieval. Order of work:
1. Decide: cloud OpenAI embeddings (cheap per call, requires API key) or local model (e.g., bge-small-en-v1.5 via transformers.js / candle). Per spec evidence: 7,500 pages × 3 chunks × ~500 tokens × $0.02/1M = $0.22 cloud cost — embedding cost is negligible at OK's scale; the deciding factor is offline-availability and dependency footprint.
2. Pick vector index: **pgvector** (if OK commits to Postgres for jobs+index in same milestone) or **sqlite-vec** (lighter dependency; aligns with Bun's `bun:sqlite`). pgvector is the GBrain-aligned choice; sqlite-vec is the OK-CRDT-aligned choice (CRDT files + SQLite index, no Postgres dep).
3. Implement chunker + embedding pipeline + freshness tracking (`embeddings.stale`).
4. Implement keyword index (FTS5 if SQLite; tsvector if Postgres).
5. Implement RRF fusion + compiled-truth-boost + backlink-boost ranking.
6. Add typed-link extraction to file watcher (regex + cascade for OK's edge types).
7. Add `query` MCP tool (alongside the existing keyword `search`); add `graph_query` MCP tool.
8. Run a BrainBench-equivalent on OK's content to establish a baseline + lift.

---

### D4 — Skills + Resolver

**Finding:** GBrain ships **29 skills organized by 7 conceptual groups** with `skills/RESOLVER.md` as the explicit dispatch table, **`gbrain skillify`** to promote ad-hoc agent fixes into durable skills (with tests + evals + filing), and **`gbrain skillpack`** for bundled install/diff. The architecture is "thin harness, fat skills" (~200 lines of CLI / 29 markdown skill files), enforced by `gbrain check-resolvable` (reachability, MECE, DRY, routing, filing, SKILLIFY_STUB) and `gbrain routing-eval` (intent→skill accuracy on fixtures).

**Evidence:** [evidence/gbrain-skills-resolver.md](evidence/gbrain-skills-resolver.md)

**Open Knowledge today:** Ships one skill (`open-knowledge`) bundling wiki conventions. CLI has `install-skill` (single-skill) but no resolver/skillify/skillpack/audit infrastructure. Per OK's PQ14, planned reference skills are ingest, compile, Q&A, lint, index-maintenance — ~5 skills.

**Implications:**
- **The skill *count* is downstream of the skill *infrastructure*.** GBrain's 29 skills are sustainable because skillify scaffolds them, the resolver routes them, and skillpack distributes them. Without that, every skill is bespoke.
- **`gbrain check-resolvable`** is the load-bearing audit: it ensures every skill is reachable, no two skills overlap (MECE), no duplication (DRY), no dangling stubs. Without this audit, a 29-skill repo decays into ambiguity within months.
- **`gbrain skillify`** is a workflow primitive — "the agent solved X; promote that solve into a skill so it's repeatable next time." This is closer to a learning loop than a manual authoring step. OK has nothing analogous.
- **Conventions folder** (`skills/conventions/quality.md`, `brain-first.md`, `model-routing.md`, `test-before-bulk.md`, `cross-modal.yaml`) factor cross-cutting rules out of individual skills. OK currently inlines these in the `open-knowledge` skill.

**Recommendation:**
1. **Adopt the resolver pattern.** Author `skills/RESOLVER.md` (or extend AGENTS.md) as a dispatch table mapping intents to skills. Initially just the planned ~5 skills.
2. **Define the skill conformance contract.** What does a "complete" OK skill look like? At minimum: SKILL.md + frontmatter, a deterministic script (where applicable), tests (unit + integration), an LLM eval (intent→skill routing test), a resolver entry, a filing target in the brain. Document this and ship a `scaffold` CLI verb (analog of `gbrain skillify scaffold`).
3. **Factor out cross-cutting conventions.** Extract the wiki-conventions from the `open-knowledge` skill into separate convention files (e.g., `closed-loop-grounding.md`, `wiki-link-discipline.md`, `hub-update-interleaving.md`). Reference them from each skill that needs them.
4. **Add `check-resolvable` as a CI/build check.** Even with 5 skills, an audit that catches "this skill isn't reachable from the resolver" is cheap and prevents drift.
5. Consider `skillpack` only after there are enough skills for bundling to make sense (likely 15+).

---

### D5 — MCP Tool Surface

**Finding:** GBrain ships **~30 MCP tools** (claim per README; specific names follow `gbrain_<verb>` snake_case convention). OK ships **20 MCP tools** under `packages/cli/src/mcp/tools/`. Counts are comparable; the gap is in **what kinds of operations are exposed**.

**Evidence:** [evidence/gbrain-mcp-cli.md](evidence/gbrain-mcp-cli.md)

**Tools GBrain has that OK doesn't:**
- Vector/hybrid retrieval (`gbrain_query` with semantic), embedding ops (`gbrain_embed`)
- Typed graph traversal (`gbrain_graph_query` with `--type`/`--depth`/`--direction`)
- Job submission/lifecycle (`gbrain_jobs_*`)
- Durable subagent run (`gbrain_agent_run`/`gbrain_agent_logs`)
- Code-symbol queries (`gbrain_code_callers`/`callees`/`def`/`refs`)
- Integrations dashboard (`gbrain_integrate`)
- Sources management (`gbrain_sources_*`)
- Dream cycle trigger
- Lint
- Transcribe

**Tools OK has that GBrain doesn't:**
- `edit_document` — surgical, CRDT-aware, attribution-bearing edit (vs GBrain's whole-page `gbrain_put`)
- `preview_url` — return the live editor preview URL
- `get_hubs` — high-in-degree hub pages
- `get_dead_links` — broken wiki-link detection
- `consolidate` — multi-source factual consolidation
- `research` — research-workflow trigger
- `save_version` / `rollback_to_version` — explicit version snapshots beyond Y.js auto-versioning
- `suggest_links` — wiki-link candidate suggestions
- `rename_document` — rename + transitive link updates

**Implications:**
- **The shape of OK's MCP surface reflects "agent edits the live document via CRDT primitives."** Surgical edits, preview, link suggestions, hubs, rename-with-link-update — these are operations that make sense in a co-editing world. GBrain doesn't have these because GBrain has no editor.
- **The shape of GBrain's MCP surface reflects "agent reads/writes pages, schedules background work, queries the index."** These are operations that make sense when the agent is the writer.
- **Naming convention divergence** (`gbrain_<verb>` vs `<verb>_<noun>`). Both valid; OK's pattern is more Claude-Code-skill-idiomatic.

**Recommendation:** Don't add MCP tools 1:1 from GBrain. Add the ones that align with new capabilities (when retrieval ships: `query` with semantic, `graph_query`; when jobs ship: `jobs_submit`/`jobs_list`/`agent_run`; when lint ships: `lint` and `doctor`).

---

### D6 — Background Work / Agent Durability

**Finding:** GBrain ships **Minions** — a Postgres-native durable job queue with parent-child DAGs, fan-out/fan-in, atomic PID locking, exponential backoff, idempotency keys, and durability across worker restarts. Production metrics on a 45,000-page Supabase brain: 753ms spawn, $0/task, 100% success vs >10s/$0.03/0% for sub-agent equivalents. Plus **durable subagents** (two-phase ledger, fan-out across 50 shards, crash-tolerant aggregator). Plus **dream cycle** (`gbrain dream` — one maintenance pass per cron tick).

**Evidence:** [evidence/gbrain-durability-jobs.md](evidence/gbrain-durability-jobs.md)

**Open Knowledge today:** No job queue. No durable subagents. No scheduled maintenance. The MCP `ingest` tool runs synchronously per call.

**Implications:**
- **Minions' core insight: not every background task should be an LLM call.** Pulling a Twitter timeline, parsing JSON, writing a page — these are deterministic. They need durability, scheduling, retry, back-pressure — but no judgment. Spawning a sub-agent for them wastes tokens and runtime.
- **Postgres-native is the load-bearing choice.** Same DB as the index → transactional consistency between job state and data writes. Choosing Minions effectively chooses Postgres for OK's index too (or accept a separate SQLite job table; doable but less unified).
- **Dream cycle + Minions is the shape of "the brain maintains itself overnight."** Re-extract links, refresh stale embeddings, run lint, update orphans report, rebuild graph indices. This pattern (also called "Sleep Consolidation" in the broader Karpathy-workflow community) is increasingly canonical.

**Recommendation:** Schedule alongside the retrieval work in D2/D3. The trio (embeddings + index + jobs) needs the same backend choice. If OK commits to Postgres/PGLite for hybrid retrieval, Minions becomes a natural extension. If OK stays SQLite-only, build a lighter SQLite-based queue (acceptable for personal-KB scale, less suitable for the multi-tenant scenarios GBrain addresses).

---

### D7 — CLI Verb Surface

**Finding:** GBrain has ~70+ CLI verbs across 12 groups. OK has ~19. The biggest verb-cluster gaps are: `pages` group (get/put/delete/list — OK uses editor + MCP for these), `embed`, `graph-query`, `extract`, `link`/`unlink`, `jobs`, `skillify`/`skillpack`, `agent run/logs`, `code-*`, `dream`, `lint`, `doctor`, `integrations`, `migrate`, `transcribe`, `sources`, `files` (cloud blob).

**Evidence:** [evidence/gbrain-mcp-cli.md](evidence/gbrain-mcp-cli.md)

**OK has that GBrain doesn't:** `preview`, `ui`, `ui-proxy` (browser editor surface); `pull`/`push`/`sync`/`clone` (richer git lifecycle); `editors` (editor launcher integration); `seed`; `self-spawn`; `status`/`start`/`stop` (server lifecycle).

**Implications:** Most of GBrain's verb surface is downstream of capabilities (D2/D3/D6) — once OK has embeddings, jobs, lint, skills, graph, the corresponding CLI verbs follow naturally. The CLI doesn't drive parity work; it reflects it.

**Recommendation:** Don't plan CLI parity directly. Plan capability parity; CLI verbs ship alongside.

---

### D8 — OK Unique Capabilities

**Finding:** Open Knowledge ships substantial capabilities GBrain explicitly doesn't have: **real-time CRDT co-editing** (Y.Doc + Hocuspocus + observer bridge with three load-bearing invariants, five write surfaces); **TipTap WYSIWYG + CodeMirror source mode** with lossless markdown round-trip (11 invariants under PBT, 11 documented irreducible gaps); **live preview attached to agent edits** (preview-attach-once + agent-flash + agent-effects); **per-session writer attribution + per-agent undo** (5-category writer-ID taxonomy with frozen origin objects); **Electron desktop app**; **OpenTelemetry server + browser instrumentation**; **CC1 broadcast for derived-view invalidation**; **file watcher with bidirectional disk↔CRDT sync, atomic writes, symlink-realpath identity**; **27 numbered architectural precedents + 17 STOP rules + 14 WARN rules** cited at ~50 code sites.

**Evidence:** [evidence/openknowledge-unique-capabilities.md](evidence/openknowledge-unique-capabilities.md)

**Implications:**
- **None of these are "parity gaps GBrain might close."** They reflect OK's targeted use case (human+AI co-editing on shared documents) and GBrain's targeted use case (single-writer AI agent at scale on personal/professional knowledge). The architectures diverge at the foundation.
- **OK's investment here is its moat.** Multiple humans + AI agents co-editing a markdown wiki page sub-second, with attribution and undo per writer, with WYSIWYG and source mode in sync, is a hard-to-replicate combination. GBrain hasn't tried.
- **The "co-presence" experience** (human watches agent edit live; agent watches human edit live; both can intervene mid-edit; preview pane visible to both) is qualitatively different from "agent writes to file system; human reads later."

**Recommendation:** Frame these as **the load-bearing differentiation**, not parity items. Don't dilute them by spreading effort thin across GBrain's surface. Adopt GBrain's *cheap* patterns (compiled-truth, edge-typed wiki-links, brain-first lookup discipline) to enrich co-editing, and adopt GBrain's *medium* patterns (hybrid retrieval, durable jobs) where they make co-editing's value scale. Don't add Twilio or Whisper integration to "match GBrain" — that's GBrain's product shape, not OK's.

---

### D9 — Lint / Maintenance

**Finding:** GBrain ships **~13 enforceable maintenance/lint surfaces**: citation audit, back-link enforcement, orphan detection, LLM-artifact lint, stale-page, dead-link, resolver conformance, routing accuracy, skill audit, skill-manifest coverage, doctor health checks, skillpack health, smoke tests. Plus a `maintain` skill that **outputs a maintenance report as a brain page** (meta-knowledge). OK ships 2 of these (orphan + dead-link detection via MCP tools).

**Evidence:** [evidence/gbrain-lint-maintenance.md](evidence/gbrain-lint-maintenance.md)

**Implications:**
- **The 17-check taxonomy already exists in OK research** (`reports/knowledge-linting-karpathy-workflow/`). Implementation status: 2 shipped of ~7 deterministic; 0 of ~5 hybrid; 0 of ~5 LLM-only.
- The parity gap is **bounded and concrete** — taxonomy is known, what's missing is implementation.
- **Maintenance reports as brain pages** is the meta-pattern: the KB documents its own health, which becomes searchable and historical. Different from "lint output to console and exit."

**Recommendation:** Ship the deterministic checks first (redlinks, embedding freshness, source traceability, tag consistency, index-drift) — these are mechanical and reuse the file watcher + index. Layer hybrid checks (stale-claim, missing cross-references) once embeddings ship. LLM-only checks (contradictions, hallucination amplification) are the last tier and need the dream cycle to run them economically. Output should be a brain page (`reports/maintenance/YYYY-MM-DD.md` or similar).

---

### D10 — Integrations & Enrichment

**Finding:** GBrain ships **7 self-installing integration recipes** — ngrok-tunnel, credential-gateway (Gmail/Calendar OAuth), voice-to-brain (Twilio + OpenAI Realtime), email-to-brain (Gmail), x-to-brain (Twitter), calendar-to-brain (Google Calendar), meeting-sync (Circleback transcripts). All follow the pattern: external signal → deterministic collector code → LLM analysis → brain page → indexing. Plus **tiered enrichment** (1 mention → Tier 3 stub; 3+ mentions → Tier 2 web/social; meeting or 8+ mentions → Tier 1 full pipeline) and **`gbrain transcribe` via Groq Whisper**. Plus **cloud blob file storage** (`gbrain files mirror|redirect|clean|restore`) with `.redirect` pointer convention.

**Evidence:** [evidence/gbrain-integrations-enrichment.md](evidence/gbrain-integrations-enrichment.md)

**Implications:**
- These are **GBrain's product-shape decisions** — Garry built it for a YC-president personal/professional brain (people, companies, meetings, deals). OK's product shape is different (technical knowledge, specs, design docs, decisions, code-adjacent).
- **The recipe pattern is portable.** A folder with `recipe.yaml` + `setup.md` + collector + skill is a clean integration interface. OK could ship a recipe for, e.g., GitHub issues → brain pages, or Slack threads → decisions, when the integration substrate exists.
- **Tiered enrichment as a deterministic classifier** is reusable. OK could use the same pattern for "concept seen N times → promote from stub to full page."
- **Cloud blob file storage with `.redirect` pointers** is a real future need for OK once large media (videos, screenshots, PDFs) accumulate.

**Recommendation:** Don't directly port GBrain's specific integrations. Build the recipe substrate later, once 1-2 OK-shaped integrations have concrete demand (likely GitHub-flavored). Borrow the `.redirect` pointer pattern when binary asset volume forces the conversation.

---

### D11 — Identity & Persona Artifacts

**Finding:** GBrain ships **`soul-audit`** — a 6-phase interview generating four identity artifacts: SOUL.md (agent identity), USER.md (user profile), ACCESS_POLICY.md (4-tier privacy), HEARTBEAT.md (operational cadence). Plus AGENTS.md as a cross-vendor instruction file.

**Evidence:** [evidence/gbrain-skills-resolver.md](evidence/gbrain-skills-resolver.md)

**Implications:**
- These four files together define **what the brain is**, **who owns it**, **what it can/can't share**, and **how often it does what**. They're the policy layer above the data.
- OK has CLAUDE.md/AGENTS.md (role of agent) and `.open-knowledge/principal.json` (writer identity) but **no privacy/ACL layer**. As OK grows beyond pure technical content, the ACL question (which pages are shareable, which agents can read which folders) will surface.

**Recommendation:** Defer until there's concrete demand. The `soul-audit` workflow is interesting but cosmetic until the underlying ACL system exists. ACCESS_POLICY.md as a future spec is worth tracking.

---

### D12 — Code-Knowledge Bridge (GStack)

**Finding:** GBrain ships **`gbrain code-callers|callees|def|refs`** and `gbrain query "..." --near-symbol X --walk-depth N` — symbol-graph-aware retrieval that unifies code symbols and document content under one Postgres + pgvector index. Cathedral II (v0.21.0) added call-graph edges; **multi-source brain** (`gbrain sources add <repo> --strategy code|markdown`) lets one Postgres index multiple Git repos.

**Evidence:** [evidence/gbrain-code-bridge.md](evidence/gbrain-code-bridge.md)

**Implications:**
- This is **GStack pairing**, not a generic OSS feature. GBrain assumes GStack provides the symbol-extraction layer.
- For OK, this is a **late-stage parity item** — only worth chasing if OK targets coding-agent workflows specifically. Today OK's content is markdown wiki, not code.
- **Multi-source brain** as a generic capability (one index, many repos) is more broadly useful and worth keeping in mind for OK's longer-term architecture.

**Recommendation:** Out of scope for parity. Track `gbrain sources` as a pattern for future OK multi-repo support.

---

## Parity Summary Matrix

| Capability | GBrain | OK today | Parity cost | Priority |
|---|---|---|---|---|
| Markdown-canonical + git | ✅ | ✅ | — | — |
| Embedded SQL index | PGLite | none (grep) | architectural | **P0** |
| Vector/semantic search | pgvector HNSW | none | architectural | **P0** |
| Keyword search | tsvector | grep + frontmatter | skill-only | P1 |
| RRF hybrid fusion | ✅ | ❌ | architectural | **P0** |
| Typed knowledge graph | regex auto-extract, 5 edge types | basic [[wiki-link]] | convention + extraction | **P0** |
| Backlink-boosted ranking | ✅ | get-backlinks tool only | skill + index | P1 |
| Compiled-truth + timeline convention | ✅ | ❌ | convention only | **P0** |
| Skills count | 29 | 1 | skill-only (ongoing) | P1 |
| Skill resolver / RESOLVER.md | ✅ | ❌ | convention + audit CLI | **P0** |
| Skillify (promote fix to skill) | ✅ | ❌ | CLI + scaffold | P1 |
| Skillpack (curated bundle install) | ✅ | install-skill (single) | CLI extension | P2 |
| Conventions/ folder pattern | ✅ | inlined in `open-knowledge` skill | refactor | P2 |
| Postgres job queue (Minions) | ✅ | ❌ | architectural | P1 |
| Durable subagents w/ fan-out | ✅ | ❌ | architectural | P1 |
| Dream / scheduled maintenance | ✅ | ❌ | CLI + cron | P1 |
| Lint surfaces | ~13 | 2 | skill + MCP | P1 |
| Doctor / health checks | ✅ | status only | CLI + skill | P1 |
| External integrations | 7 self-install recipes | 0 | recipe substrate + per-recipe | P2 |
| Voice/email/calendar/X/meeting | ✅ | ❌ | out-of-scope (different product shape) | OoS |
| Audio transcription | Groq Whisper | ❌ | provider integration | P2 |
| Cloud blob file storage | ✅ | ❌ | architectural | P2 |
| Identity artifacts (SOUL/USER/POLICY/HEARTBEAT) | ✅ | partial (principal.json) | skill + spec | P2 |
| Code-symbol bridge | GStack pairing | ❌ | out-of-scope | OoS |
| Multi-source brain | sources add | single content dir | architectural | P2 |
| MCP HTTP remote transport | ✅ | stdio only | server + auth | P2 |
| **Real-time CRDT co-editing** | ❌ (deferred) | ✅ | OK-only | **OK moat** |
| **TipTap WYSIWYG + CodeMirror source** | ❌ | ✅ | OK-only | **OK moat** |
| **Live preview attached to agent edits** | ❌ | ✅ | OK-only | **OK moat** |
| **Per-session writer attribution + undo** | ❌ | ✅ | OK-only | **OK moat** |
| **Electron desktop app** | ❌ | ✅ | OK-only | **OK moat** |
| **OpenTelemetry instrumentation** | unclear | ✅ | OK-only | **OK moat** |
| **File watcher bidirectional sync** | sync command (one-shot) | continuous + atomic | OK-only | **OK moat** |
| **Markdown fidelity invariants (PBT)** | ❌ | ✅ (I1-I11) | OK-only | **OK moat** |
| **`edit_document` surgical CRDT-aware MCP tool** | ❌ (whole-page put) | ✅ | OK-only | **OK moat** |
| **Codified architectural correctness (precedents/STOP/WARN)** | partial (docs/ethos) | extensive (CLAUDE.md + PRECEDENTS.md) | OK-only | **OK moat** |

**Legend:**
- **P0** — High-leverage parity work, plan within 1-2 quarters.
- **P1** — Medium-leverage, plan after P0.
- **P2** — Low-leverage, defer until concrete demand.
- **OoS** (Out of Scope) — Different product shape; don't pursue parity.
- **OK moat** — OK's load-bearing capability; don't dilute by spreading effort.

---

## Limitations & Open Questions

### Dimensions not fully covered
- **Exact GBrain MCP tool list with schemas:** ~30 tools claimed; ~20 inferred from CLI verb mapping. Authoritative list requires reading `src/mcp/tools/` in the repo.
- **PGLite scaling ceiling:** GBrain's production deployment is on Supabase Postgres (45,000 pages). PGLite's actual ceiling for OK's targeted KB sizes (1K-10K articles) is not in fetched content.
- **Cathedral II details:** Search hit referenced v0.21.0 call-graph edges and two-pass retrieval, but the BRAINBENCH benchmark doc returned 404 on raw fetch. Implementation specifics inferred only.
- **`gbrain skillify`'s 10-item audit details:** Items mentioned (SKILL.md, script, unit + E2E tests, LLM evals, resolver entry, trigger eval, check-resolvable gate, brain filing) but not enumerated step-by-step.

### Out of scope (per rubric non-goals)
- Implementation/`/spec` work for any parity gap.
- License compatibility audit (gbrain is MIT — out of scope for this report; assume compatible).
- Benchmark methodology critique of BrainBench v1.
- Pricing analysis (Supabase Pro $25/mo, ngrok $8/mo).
- Garry Tan / YC competitive-positioning narrative — covered in `reports/cli-command-naming-brain/`.

---

## References

### Evidence Files
- [evidence/gbrain-architecture.md](evidence/gbrain-architecture.md) — D1: Architecture & data model
- [evidence/gbrain-retrieval-and-graph.md](evidence/gbrain-retrieval-and-graph.md) — D2 + D3: Retrieval pipeline + auto-extracted typed graph
- [evidence/gbrain-skills-resolver.md](evidence/gbrain-skills-resolver.md) — D4 + D11: Skills, resolver, skillify, skillpack, identity artifacts
- [evidence/gbrain-mcp-cli.md](evidence/gbrain-mcp-cli.md) — D5 + D7: MCP tools and CLI verb surface
- [evidence/gbrain-durability-jobs.md](evidence/gbrain-durability-jobs.md) — D6: Minions, durable subagents, dream cycle
- [evidence/gbrain-lint-maintenance.md](evidence/gbrain-lint-maintenance.md) — D9: Lint/maintenance surface
- [evidence/gbrain-integrations-enrichment.md](evidence/gbrain-integrations-enrichment.md) — D10: Integrations, enrichment, files
- [evidence/gbrain-code-bridge.md](evidence/gbrain-code-bridge.md) — D12: Code-knowledge bridge (GStack)
- [evidence/openknowledge-unique-capabilities.md](evidence/openknowledge-unique-capabilities.md) — D8: OK 1P unique capabilities

### External Sources
- [github.com/garrytan/gbrain](https://github.com/garrytan/gbrain) — Primary source: README, repo structure, CLI tree, skills enumeration, MCP setup, benchmarks
- [docs/ethos/THIN_HARNESS_FAT_SKILLS.md](https://github.com/garrytan/gbrain/blob/master/docs/ethos/THIN_HARNESS_FAT_SKILLS.md) — Architectural principle
- [docs/integrations/README.md](https://github.com/garrytan/gbrain/blob/master/docs/integrations/README.md) — 7 integration recipes
- [docs/GBRAIN_SKILLPACK.md](https://github.com/garrytan/gbrain/blob/master/docs/GBRAIN_SKILLPACK.md) — Skill bundle reference (summary)
- [docs/benchmarks/2026-04-18-brainbench-v1.md](https://github.com/garrytan/gbrain/blob/master/docs/benchmarks/2026-04-18-brainbench-v1.md) — BrainBench v1 (P@5 49.1%, R@5 97.9%)
- [docs/mcp/CLAUDE_CODE.md](https://github.com/garrytan/gbrain/blob/master/docs/mcp/CLAUDE_CODE.md) — MCP setup for Claude Code
- [littlemight.com/g-brain/](https://www.littlemight.com/g-brain/) — Third-party explainer (2026)

### Related Research (open-knowledge reports)
- [reports/open-knowledge-prior-art-eight-sources/](../open-knowledge-prior-art-eight-sources/REPORT.md) — Earlier (2026-04-07) GBrain analysis based on the gist spec; **architecture findings now stale** (spec said SQLite-canonical; shipped product is markdown-canonical with Postgres index).
- [reports/cli-command-naming-brain/](../cli-command-naming-brain/REPORT.md) — Naming-landmine audit; established GBrain shipped 2026-04-09–10, established the `gbrain` collision as disqualifying for OK CLI naming.
- [reports/knowledge-linting-karpathy-workflow/](../knowledge-linting-karpathy-workflow/REPORT.md) — 17-check lint taxonomy across Karpathy + GBrain + community; the ground truth for D9 lint parity work.
- [reports/compiled-truth-timeline-content-conventions/](../compiled-truth-timeline-content-conventions/REPORT.md) — D1 compiled-truth pattern across GBrain, ByteRover, Wikipedia, intelligence-community.
- [reports/openknowledge-competitive-landscape/](../openknowledge-competitive-landscape/REPORT.md) — broader competitive map.
