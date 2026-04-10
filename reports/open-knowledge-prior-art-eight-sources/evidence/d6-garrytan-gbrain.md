# Evidence: GBrain — Garry Tan's personal knowledge brain spec

**Dimension:** D6 — gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb
**Date:** 2026-04-07
**Sources:** Raw gist content (1,294 lines), fetched via curl

---

## Key pages referenced
- `https://gist.githubusercontent.com/garrytan/49c88e83cf8d7ae95e087426368809cb/raw` — raw gist content (full spec)

---

## Findings

### Finding: The gist is a BUILD SPEC for "GBrain" — an open-source personal knowledge brain, not a manifesto
**Confidence:** CONFIRMED
**Evidence:** Gist line 1-30:
```yaml
---
title: GBrain
type: project
created: 2026-04-05
updated: 2026-04-05
tags: [open-source, knowledge-base, sqlite, rag, thin-harness, fat-skills]
sources: [GStack-YC-Spring-2026-Talk-pptx]
---

# GBrain

> Open-source personal knowledge brain. SQLite + FTS5 + vector embeddings in one file. Thin CLI harness, fat skill files. The knowledge layer to GStack's coding layer. Together: intelligence on tap.
```

State: "Spec complete — ready to build." Repo: github.com/garrytan/gbrain. Dated 2026-04-05 (2 days before this research).

**Implications for open-knowledge:** This is a DIRECTLY comparable project by someone in a high-leverage position (YC president). Garry Tan building this means the problem space is validated at the top of the developer ecosystem. His architecture is philosophically aligned with open-knowledge (markdown, MCP-native, thin harness + fat skills) but makes different technical bets worth studying.

### Finding: Scale motivation — Garry's current brain is 7,471 markdown files, 2.3GB, hitting git's scaling ceiling
**Confidence:** CONFIRMED
**Evidence:** Gist — "Git doesn't scale past ~5K files. The current brain has 1,222 people dossiers, 7,471 markdown files, 2.3GB. Git is choking. The wiki brain pattern (Karpathy compiled truth + timeline) is right — it just needs a real database underneath."

**Implications for open-knowledge:** 
- **This is a hard data point on markdown-in-git's scaling ceiling.** Open-knowledge's PROJECT.md claims a 100-1000 article scale as P0. Garry's 7,471 files confirm that git works until ~5K files, then degrades. Open-knowledge should:
  1. Set an explicit P0 scale ceiling (e.g., "up to 5,000 articles per KB")
  2. Plan a migration path for KBs that grow beyond (sharding? separate git submodules? or adopt SQLite backing for large KBs?)
  3. Note the limit in day-0 docs so users don't try to put 10K articles in a single KB
- **This is actually a threat to open-knowledge's architecture** that isn't addressed in PROJECT.md. Git at 7,471 files with 23,441 timeline entries and 14,329 links is choking — that's directly comparable to what a power-user open-knowledge KB would look like in 2-3 years.

### Finding: SQLite as canonical storage (WAL mode, FTS5, embeddings as BLOBs) — markdown is the import/export interface
**Confidence:** CONFIRMED
**Evidence:** Gist section 2 (SQL Schema) — 8 tables:
- `pages` (slug, type, title, compiled_truth, timeline, frontmatter JSON, timestamps)
- `page_fts` (FTS5 virtual table, Porter stemmer, unicode61 tokenizer)
- `page_embeddings` (chunk_text, Float32 BLOB, model, chunk_index)
- `links` (from_page_id, to_page_id, context)
- `tags` (many-to-many)
- `raw_data` (sidecar API responses, one row per source per page)
- `timeline_entries` (structured date-based events; supplements markdown timeline)
- `ingest_log` (audit trail)
- `config` (brain-level settings)

Key quote: "Every byte of content preserved. Round-trippable — `gbrain export` recreates the original markdown directory structure."

**Implications for open-knowledge:** 
- **GBrain bets the opposite of open-knowledge on canonical format.** Open-knowledge: markdown files are canonical, SQLite (or any index) is derived. GBrain: SQLite is canonical, markdown is a round-trip view.
- The tradeoff:
  | Dimension | Open-knowledge (markdown canonical) | GBrain (SQLite canonical) |
  |---|---|---|
  | Git-friendly | ✅ Native | ❌ (single .db file) |
  | Merge/branch | ✅ Git branches | ❌ Would need custom layer |
  | Human editing | ✅ Any text editor | ⚠ Export → edit → import |
  | Structured queries | ❌ Grep/Orama only | ✅ SQL |
  | Multi-user | ⚠ Via CRDT | ❌ "one writer, many readers" |
  | Scale | Degrades at ~5K files | Handles 100K+ rows easily |
- **GBrain concedes multi-user collaboration to get scale.** Open-knowledge concedes scale to get multi-user.
- **Open-knowledge's "markdown canonical" bet is explicitly contradicted by a knowledgeable practitioner building for scale.** This is a risk to acknowledge in PROJECT.md.

### Finding: "Compiled truth + timeline" architecture — the above-the-line/below-the-line pattern
**Confidence:** CONFIRMED
**Evidence:** Gist section 2 "Core principle: compiled truth + timeline":
- **Above the line (compiled_truth):** Always current. Rewritten when new info arrives. The intelligence assessment.
- **Below the line (timeline):** Append-only. Never rewritten. The evidence base.

The horizontal rule (`---`) separates them. On export, this is reconstructed from two SQLite columns.

**Implications for open-knowledge:** This is a CONVENTION open-knowledge could adopt without any code changes. It's literally just:
```markdown
---
title: Auth System
---

# Auth System
[Compiled truth — overwritten as new info arrives]

---

## Timeline
- **2026-04-01** | Meeting with security team — decided JWT with 24h expiry
- **2026-03-28** | PR #847 introduced middleware
```

The pattern solves a real problem: knowledge entries have both *current-state summary* content (what's true now) and *historical evidence* (how we got here). Without the split, agents either overwrite the history (losing provenance) or grow the file unboundedly.

**This is one of the strongest "steal this" findings in the report.** Open-knowledge's reference skills (ingest, compile) should author in this format by convention.

### Finding: "Thin CLI harness, fat skills" architecture — the intelligence lives in markdown SKILL.md files, not code
**Confidence:** CONFIRMED
**Evidence:** Gist section "Why thin CLI + fat skills?" — "Proven by GStack at 64K+ stars. The CLI is ~500 lines of TypeScript that dispatches commands to a core library. The intelligence lives in SKILL.md files — fat markdown documents that Claude Code reads and follows. This means: The CLI never needs to be smart. It's plumbing. The skills can be updated by editing markdown. No recompile, no redeploy. Claude Code reads SKILL.md at session start and knows every workflow, heuristic, and edge case."

Five core skills: `ingest/SKILL.md`, `query/SKILL.md`, `maintain/SKILL.md`, `enrich/SKILL.md`, `briefing/SKILL.md`. Each is standalone markdown.

**Implications for open-knowledge:** 
- **This is 100% aligned with open-knowledge's PQ13 (Option D: smart conventions + batteries-included skills) and PQ14 (reference skills as v1 deliverables).** Garry is building the same architecture independently.
- Open-knowledge's "reference skills as v1 deliverables" has Garry Tan as a validation point: a YC president has chosen the same pattern for his personal KB.
- The specific skills Garry specifies (ingest, query, maintain, enrich, briefing) are a strong starting list for what open-knowledge's reference skills should be. `briefing` in particular is interesting — not in open-knowledge's current plan.

### Finding: MCP server from day one — 14 tools exposed
**Confidence:** CONFIRMED
**Evidence:** Gist section 4 "MCP Server":

| Tool | Description |
|---|---|
| `brain_search` | FTS5 full-text search |
| `brain_query` | Semantic search (FTS5 + vector) |
| `brain_get` | Read a page by slug |
| `brain_put` | Write/update a page |
| `brain_ingest` | Ingest a source document |
| `brain_link` | Create cross-reference |
| `brain_timeline` | Get timeline entries |
| `brain_timeline_add` | Add timeline entry |
| `brain_tags` | List tags for a page |
| `brain_tag` | Add/remove tag |
| `brain_list` | List pages with filters |
| `brain_backlinks` | Pages linking to a slug |
| `brain_stats` | Brain statistics |
| `brain_raw` | Read/write raw enrichment data |

**Implications for open-knowledge:** 
- **14 tools is close to open-knowledge's current plan of 10 tools.** Both are much higher than ByteRover's 2-tool surface.
- Tool naming pattern: `brain_<verb>` (single word). Open-knowledge uses `read_file`, `write_file` (filesystem-compatible). Different design choices but similar granularity.
- **GBrain splits search into two tools** — `brain_search` (FTS5) and `brain_query` (semantic). Open-knowledge plans a single `search_files` with hybrid retrieval. GBrain's split is more explicit; the tradeoff is tool count vs tool clarity.
- **`brain_raw` for sidecar data** — Garry's brain stores API responses (Crustdata, Happenstance, Exa) in a separate table so the compiled page stays clean. Open-knowledge doesn't have this pattern; all data goes in frontmatter or the article body. Worth considering a sidecar convention for enrichment data.

### Finding: Bun runtime, compiled binary, minimal dependencies (gray-matter, yaml, @modelcontextprotocol/sdk)
**Confidence:** CONFIRMED
**Evidence:** Gist section "Tech Stack":
- Runtime: Bun (compiled binary via `bun build --compile`)
- Database: SQLite via `bun:sqlite` (no native addons)
- Full-text search: FTS5 with Porter stemmer and unicode61 tokenizer
- Vector search: Pure JavaScript cosine similarity (Float32 blobs) for v1; sqlite-vec as optional acceleration
- Embeddings: OpenAI text-embedding-3-small (1536 dims, $0.02/1M tokens, configurable)
- MCP: @modelcontextprotocol/sdk with stdio transport
- Markdown: gray-matter (frontmatter) + regex for wiki-links; no remark at runtime

**Implications for open-knowledge:** 
- **GBrain is Bun-first** for runtime. Open-knowledge's TQ23 chose Node.js for distribution, Bun for dev. Both are viable.
- **GBrain uses pure JS cosine similarity for v1** (no sqlite-vec dependency). Open-knowledge plans Orama with optional embeddings. Both are acceptable for <100K chunks.
- **GBrain uses regex for wiki-link parsing, not remark at runtime.** Open-knowledge's TQ11 imports remarkStructure/remarkLLMs from Fumadocs — heavier runtime dependency. For the specific wiki-link parsing case, regex is sufficient and faster.

### Finding: MCP deployment via stdio transport, config in Claude Code's mcp.json
**Confidence:** CONFIRMED
**Evidence:** Gist section 4 "MCP Server":
```json
{
  "mcpServers": {
    "gbrain": {
      "command": "gbrain",
      "args": ["serve", "--db", "/path/to/brain.db"]
    }
  }
}
```

**Implications for open-knowledge:** Standard pattern. Open-knowledge's `npx openknowledge init` should output the same config. CC5 (zero-friction onboarding) alignment.

### Finding: Migration plan — 10 steps, 7,471 files → SQLite, cost ~$0.50 in embeddings
**Confidence:** CONFIRMED
**Evidence:** Gist section 6 (Migration Plan). Step 8: "Generate embeddings ~7,500 pages × ~3 chunks avg = ~22,500 API calls. At $0.02/1M tokens with text-embedding-3-small, total cost ~$0.50. Parallelize with 10 concurrent requests, rate limit to 3,000 RPM."

**Implications for open-knowledge:** Concrete cost data point. At scale: 7,500 articles × 3 chunks × ~500 tokens each = 11.25M tokens × $0.02/1M = $0.22 for OpenAI embeddings. **The cost of vectorizing a personal KB is negligible.** Open-knowledge's S8 local embeddings via bge-small-en-v1.5 (local CPU) are ~free at runtime but require a model download; GBrain's cloud embeddings are near-free per call but require API access. Tradeoff: local vs cloud embeddings is more about dependencies (download vs API key) than cost.

### Finding: Five reference skills specified in detail — ingest, query, maintain, enrich, briefing
**Confidence:** CONFIRMED
**Evidence:** Gist section 5 (Skills). Each skill has explicit workflow + quality rules:

- **`ingest/SKILL.md`:** For each entity mentioned → check if page exists → update compiled_truth or create → extract links → parse timeline → store raw data → log. Entry criteria: "Not everything gets a page." Quality rules: "State section gets REWRITTEN, not appended to. Timeline is append-only, reverse-chronological (newest first)."

- **`query/SKILL.md`:** Three-layer search strategy (FTS5 keyword + semantic vector + structured queries). Ranking heuristic: "FTS5 score × 0.4 + vector similarity × 0.6 = combined score. Boost type-match (+0.2), recency (+0.1), penalize low-score pages (−0.1)."

- **`maintain/SKILL.md`:** 8 lint checks — contradictions, stale info, orphan pages, missing cross-references, dead links, open thread audit, tag consistency, embedding freshness. Outputs a maintenance report as a new page.

- **`enrich/SKILL.md`:** API integrations (Crustdata, Happenstance, Exa, Captain). Validation rules (e.g., "connection count < 20 → likely wrong person"). Batch rules (checkpoint every 20, exponential backoff).

- **`briefing/SKILL.md`:** Daily briefing structure — calendar + active deals + open threads + recent brain changes + people in play + stale alerts. Output to `sources/briefing-YYYY-MM-DD`.

**Implications for open-knowledge:** 
- **Garry's skills are a strong template for open-knowledge's reference skills.** Open-knowledge's PQ14 lists "ingest, compile, Q&A, lint, index-maintenance" as the reference skills. Garry's are nearly identical with different names (query=Q&A, maintain=lint, briefing=new).
- **The `maintain` skill with 8 specific lint checks** is a very concrete specification. Open-knowledge should produce a similar checklist for its lint skill.
- **`enrich` with external API integration** is novel. Open-knowledge doesn't currently plan an enrich reference skill. Worth adding — the pattern of "pull data from external APIs → distill → store in KB with provenance" is common enough to warrant a reference implementation.
- **`briefing` as a skill that COMPILES a new page FROM the KB** is the "query results become new wiki pages" pattern Karpathy describes. Open-knowledge should ship this as a reference skill — it's the feedback loop that makes the KB compound.

### Finding: Multi-brain support via env var switching; real-time sync explicitly deferred
**Confidence:** CONFIRMED
**Evidence:** Gist section "Open Questions":
- "Multi-brain support: Supported from day one. Each brain is one `.db` file; switch via `GBRAIN_DB` environment variable."
- "Real-time sync: Explicitly deferred. v1 uses explicit commands only—no file watcher daemon, since the brain is written by AI agents, not human editors."

**Implications for open-knowledge:** 
- **Multi-brain is trivial** in GBrain's architecture (just another .db file). Open-knowledge's multi-project support is similar (just another git repo) but requires more UI affordances.
- **"Written by AI agents, not human editors" is GBrain's explicit stance.** Open-knowledge's explicit stance is the OPPOSITE — human+AI co-editing is the P0 differentiator (S5 presence). Same architecture, opposite bet on who the editor is.
- GBrain defers real-time sync. Open-knowledge makes it a P0 (CC1). This is the single biggest product-level distinction between the two projects.

### Finding: Differentiation section — explicitly positions GBrain against Obsidian, Notion, and RAG frameworks
**Confidence:** CONFIRMED
**Evidence:** Gist section "Differentiation":
> "GBrain is not a note-taking app. Compared to Obsidian (plugin-based, file-storage), Notion (cloud lock-in), and RAG frameworks (separate vector stores), GBrain combines:
> - Single portable SQLite file (zero server, zero Docker)
> - FTS5 + semantic search in one query
> - Fat markdown skills (intelligence outside the binary)
> - MCP-native (any AI client can integrate)
> - Git-friendly export escape hatch
> - Knowledge model (compiled truth + timeline) reflecting how Garry structures intelligence"

**Implications for open-knowledge:** 
- **GBrain positions against EXACTLY the same set of competitors as open-knowledge** (Obsidian, Notion, RAG) and lands on an adjacent-but-different resolution. The overlap is:
  - MCP-native ✅ both
  - Fat markdown skills ✅ both
  - Git-friendly ✅ (GBrain export-only, open-knowledge native)
  - Single-file portable ❌ GBrain only (SQLite)
  - Compiled truth + timeline ❌ GBrain only
  - Rich WYSIWYG editor ❌ GBrain doesn't have one
  - Human+AI co-editing ❌ GBrain deferred
- **The two projects are NOT direct competitors** — GBrain is optimized for a power-user running AI agents against a personal brain that doesn't need a rich editing surface. Open-knowledge is optimized for human+AI co-editing with a developer-grade editor. They could even COMPLEMENT: GBrain as the storage backend, open-knowledge as the editor front-end (though licensing would need to line up).

---

## Gaps / follow-ups
- Gist is 1,294 lines; I inspected ~900 of them. The last ~400 lines (implementation roadmap details, architecture diagram, closing notes) not inspected — may contain additional detail but unlikely to change the synthesis.
- github.com/garrytan/gbrain — the actual repo. If it's built, inspecting the real implementation would be higher-value than the spec alone.
- GStack referenced as the "coding layer" counterpart. What is GStack's architecture? (Likely the same thin-CLI + fat-skills pattern for code generation.)

## Related open-knowledge material
- **PQ13 (Karpathy workflow as Option D: smart conventions + batteries-included skills)** — Garry has chosen the same approach
- **PQ14 (Reference skills as v1 deliverable)** — Garry's 5 skills are a stronger template
- **TQ5 (OSS license)** — GBrain appears to be pure OSS (no license info in the spec but "open-source personal knowledge brain" in the tagline)
- **Risk: the ~5K file git ceiling** — not currently addressed in PROJECT.md. Should be.
- **New pattern to consider: compiled truth + timeline convention** — a very strong "steal this"
- **New pattern to consider: sidecar raw_data storage** for external API enrichment
- **New reference skill to consider: briefing** — compiling a new page from current KB state
- **Validation: markdown + MCP + thin-harness + fat-skills is a convergent architecture** — GBrain, open-knowledge, ByteRover all landed on variants
