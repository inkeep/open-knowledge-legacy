# Evidence: Reference Skill Mapping — obsidian-mind commands/subagents to open-knowledge v1 skill candidates

**Dimension:** D11 — Cross-source reference skill mapping
**Date:** 2026-04-07
**Sources:** evidence/d5-obsidian-mind.md (15 commands, 9 subagents), evidence/d6-garrytan-gbrain.md (5 skills), evidence/d8-karpathy-gist.md (3 operations), PROJECT.md PQ14

---

## Method

Map each obsidian-mind command and subagent to a yes/no recommendation for open-knowledge v1. For each "yes," specify the adapted form. Cross-reference with GBrain's 5 skills and Karpathy's 3 operations. Produce a final prioritized list of 5-8 reference skills.

**Filtering criteria:**
- **Include** if the pattern is substrate-agnostic (doesn't depend on Obsidian, Slack, GitHub, or performance-review domain)
- **Include** if it maps to Karpathy's three canonical operations (Ingest, Query, Lint) or GBrain's five skills (ingest, query, maintain, enrich, briefing)
- **Exclude** if it's Obsidian-specific tooling, domain-locked (performance reviews), or depends on external services open-knowledge doesn't ship with
- **Exclude** if the community can build it later — v1 ships the substrate-level skills that make the Karpathy workflow work on day 0

---

## Part 1: obsidian-mind Command Mapping

### 15 Slash Commands

| # | obsidian-mind Command | Category | Maps to open-knowledge v1? | Rationale |
|---|---|---|---|---|
| 1 | `/standup` | Daily workflow | **No** | Session context injection. In open-knowledge, this is a **hook** (SessionStart), not a skill. The pattern is valuable but ships as `.openknowledge/hooks/` not as a reference skill. |
| 2 | `/dump` | Daily workflow | **Yes → `/ingest`** | Freeform capture with auto-routing. This IS ingest — "take unstructured input, classify it, route it to the right place, update links and indexes." Core Karpathy operation. |
| 3 | `/wrap-up` | Daily workflow | **No** | Session review (verify context, indexes, orphans). This is a **lint pass triggered at session end** — covered by the `/lint` skill, not a separate skill. Could be a hook. |
| 4 | `/weekly` | Daily workflow | **Yes → `/compile`** | Cross-session synthesis, North Star alignment. This IS compilation — "synthesize multiple sources into a new artifact." Maps to GBrain's `briefing` skill and Karpathy's "good answers filed back as new pages." |
| 5 | `/humanize` | Voice/editing | **No (v1)** | Voice-calibrated rewriting. Novel and valuable, but domain-specific and not substrate-level. D10 Tier 3 recommendation. Community skill. |
| 6 | `/capture-1on1` | Capture | **No** | Domain-locked (meeting notes). The community can build domain-specific capture skills on top of `/ingest`. |
| 7 | `/incident-capture` | Capture | **No** | Domain-locked (incident response) + Slack dependency. |
| 8 | `/slack-scan` | Capture | **No** | External service dependency (Slack). Not substrate-level. |
| 9 | `/peer-scan` | Capture | **No** | External service dependency (GitHub PRs). Not substrate-level. |
| 10 | `/review-brief` | Performance review | **No** | Domain-locked (performance reviews). |
| 11 | `/self-review` | Performance review | **No** | Domain-locked (performance reviews). |
| 12 | `/review-peer` | Performance review | **No** | Domain-locked (performance reviews). |
| 13 | `/vault-audit` | Maintenance | **Yes → `/lint`** | Structural + frontmatter + link audit. This IS lint — Karpathy's third canonical operation. Maps to GBrain's `maintain` skill. |
| 14 | `/vault-upgrade` | Maintenance | **Yes → `/import`** | Migrate arbitrary markdown vaults. Substrate-level: makes open-knowledge useful to existing Obsidian/markdown users on day 0. Multi-tier classification heuristic is reusable. |
| 15 | `/project-archive` | Maintenance | **No** | Archive management. Valuable but covered by conventions in AGENTS.md + manual file moves. Not a v1 reference skill. |

**Summary:** 4 of 15 commands map to v1 reference skills: `/ingest`, `/compile`, `/lint`, `/import`.

### 9 Subagents

| # | obsidian-mind Agent | Parent Command | Maps to open-knowledge v1? | Rationale |
|---|---|---|---|---|
| 1 | `vault-librarian` | `/vault-audit` | **Yes (inside `/lint`)** | The librarian IS the lint execution engine. In open-knowledge, this becomes a subagent within the `/lint` skill — not a standalone skill. |
| 2 | `context-loader` | `/standup` | **No (hook)** | Context injection at session start. Ships as a hook, not a skill. |
| 3 | `cross-linker` | `/vault-audit` | **Yes (inside `/lint`)** | Finds missing cross-references. A subagent of `/lint` — maps to Karpathy's "missing cross-references" lint check and GBrain's maintain checks. |
| 4 | `brag-spotter` | `/weekly` | **No** | Performance review domain. |
| 5 | `people-profiler` | `/incident-capture` | **No** | External service dependency (Slack, GitHub). |
| 6 | `review-prep` | `/review-brief` | **No** | Performance review domain. |
| 7 | `slack-archaeologist` | `/incident-capture` | **No** | Slack dependency. |
| 8 | `review-fact-checker` | `/self-review` | **No (v1), pattern reusable** | The fact-checking pattern (verified/unverified/flagged) is excellent but the domain is performance reviews. The PATTERN should inform `/lint`'s fact-checking subagent. |
| 9 | `vault-migrator` | `/vault-upgrade` | **Yes (inside `/import`)** | The migrator IS the import execution engine. Multi-tier classification + idempotent migration. Becomes a subagent within `/import`. |

**Summary:** 3 of 9 agents are reusable as subagents within v1 reference skills. The others are domain-locked or service-dependent.

---

## Part 2: Cross-Reference with GBrain and Karpathy

### GBrain's 5 Skills → open-knowledge mapping

| GBrain Skill | Description | Maps to open-knowledge v1? | Notes |
|---|---|---|---|
| `ingest` | Process source → compiled truth + timeline + links + raw data | **Yes → `/ingest`** | Core. Same as obsidian-mind's `/dump` + Karpathy's Ingest. |
| `query` | Three-layer search (FTS5 + vector + structured) | **Yes → `/query`** | Core. Same as Karpathy's Query. Open-knowledge's `/query` uses `search_files` MCP tool + index.md navigation. |
| `maintain` | 8 lint checks (contradictions, stale, orphans, dead links, tags, embeddings) | **Yes → `/lint`** | Core. Same as obsidian-mind's `/vault-audit` + Karpathy's Lint. |
| `enrich` | Pull external API data → distill → store with provenance | **No (v1)** | Requires external API integrations (Crustdata, Exa, etc.). Not substrate-level. Community skill territory. The PATTERN is valuable but the implementation depends on APIs open-knowledge doesn't ship with. |
| `briefing` | Compile daily briefing from KB state → new page | **Yes → `/compile`** | The "query results become new wiki pages" compounding loop. Maps to obsidian-mind's `/weekly`. D10 already recommends this as Tier 2. Promoting to v1 because it's the compounding mechanism that makes the KB grow from usage. |

### Karpathy's 3 Operations → open-knowledge mapping

| Karpathy Operation | Description | Maps to open-knowledge v1? | Coverage |
|---|---|---|---|
| **Ingest** | Drop source → process → update 10-15 wiki pages | **Yes → `/ingest`** | Covered by obsidian-mind `/dump` + GBrain `ingest`. |
| **Query** | Search wiki → synthesize answer → optionally file back as page | **Yes → `/query`** | Covered by GBrain `query`. The "file back as page" part is covered by `/compile`. |
| **Lint** | Health-check: contradictions, stale, orphans, missing refs, data gaps | **Yes → `/lint`** | Covered by obsidian-mind `/vault-audit` + GBrain `maintain`. |

**Karpathy's three operations are fully covered by the recommended v1 skills.** The addition of `/compile`, `/import`, and `/init` extends beyond Karpathy's minimum.

---

## Part 3: Convergence Analysis

### The "three canonical operations" are confirmed by all three sources

| Operation | Karpathy | GBrain | obsidian-mind | open-knowledge v1 |
|---|---|---|---|---|
| Ingest | Ingest | `ingest` | `/dump` | **`/ingest`** |
| Query | Query | `query` | (QMD + context-loader) | **`/query`** |
| Lint | Lint | `maintain` | `/vault-audit` + vault-librarian + cross-linker | **`/lint`** |
| Compile | (implicit in Query "file back") | `briefing` | `/weekly` | **`/compile`** |
| Migrate | — | — | `/vault-upgrade` + vault-migrator | **`/import`** |
| Enrich | — | `enrich` | `/slack-scan`, `/peer-scan` | No (v1) — external API dependent |
| Voice | — | — | `/humanize` | No (v1) — Tier 3 |

**The canonical three (Ingest/Query/Lint) are unanimous.** Compile is strongly supported (2 of 3 sources). Import is unique to obsidian-mind but critical for adoption. Enrich and Voice are valuable but not substrate-level.

### What's NOT in any prior art but open-knowledge needs

| Skill | Why needed | Prior art support |
|---|---|---|
| **`/init`** | Bootstrap a new KB (folder structure, AGENTS.md, manifest.json, hooks, MCP config). Zero-friction onboarding (CC5). | obsidian-mind's repo IS the init template. GBrain's CLI has a `gbrain init` implied by the spec. Pattern exists but open-knowledge needs its own version. |
| **`/publish`** | Export KB to a publishable format (Fumadocs, static site). | None in the 8 sources. Unique to open-knowledge's S-L2 publishing story. **Defer to post-v1** — it's a Later story. |

---

## Part 4: Recommended Reference Skills for v1

### Final list: 6 reference skills

| Priority | Skill | What it does | Subagents | Karpathy op | GBrain equiv | obsidian-mind equiv |
|---|---|---|---|---|---|---|
| **P0** | **`/ingest`** | Process a source (URL, file, paste) → create/update wiki pages, extract links, update index, append to log.md | source-analyzer, cross-linker | Ingest | `ingest` | `/dump` |
| **P0** | **`/query`** | Search the KB → synthesize answer with citations → optionally file the answer as a new page | — (uses MCP search_files + index.md) | Query | `query` | QMD + context-loader |
| **P0** | **`/lint`** | Health-check the KB: orphan pages, broken links, missing cross-refs, stale content, frontmatter violations, contradictions | librarian (structural), cross-linker (references) | Lint | `maintain` | `/vault-audit` + vault-librarian + cross-linker |
| **P1** | **`/compile`** | Synthesize multiple KB pages into a new compiled artifact (briefing, research summary, decision record, comparison) | source-gatherer, draft-writer | (Query "file back") | `briefing` | `/weekly` |
| **P1** | **`/import`** | Migrate an existing markdown vault (Obsidian, flat folder, PARA) into open-knowledge format with provenance | classifier, migrator | — | — | `/vault-upgrade` + vault-migrator |
| **P1** | **`/init`** | Bootstrap a new KB: create folder structure, AGENTS.md, manifest.json, hooks, .claude/settings.json with MCP config | — (single-pass script) | — | (repo is the init) | (repo is the init) |

### Priority definitions
- **P0:** Ships on day 0. Without these, the Karpathy workflow doesn't work. The product is useless without `/ingest` (can't add knowledge), `/query` (can't retrieve knowledge), and `/lint` (KB degrades without maintenance).
- **P1:** Ships in v1 but can lag P0 by a sprint. `/compile` is the compounding loop that differentiates "knowledge base" from "file dump." `/import` is the adoption accelerator for existing Obsidian/markdown users. `/init` is the zero-friction onboarding (CC5).

### What's explicitly NOT in v1 (and why)

| Skill | Why deferred | When to reconsider |
|---|---|---|
| `/enrich` | Depends on external APIs (Crustdata, Exa, etc.) that open-knowledge doesn't ship with. The community can build enrichment connectors. | When open-knowledge ships S-L6 (connectors). |
| `/humanize` | Voice-calibrated editing is novel but domain-specific. Not substrate-level. | Post-v1 as a community showcase skill. |
| `/standup` / `/wrap-up` | Session lifecycle management. Ships as hooks (SessionStart, Stop) in `.openknowledge/hooks/`, not as skills. | N/A — these ARE shipped, just as hooks not skills. |
| `/briefing-daily` | GBrain's calendar+deals+threads briefing is too domain-specific (VC/investor workflow). `/compile` is the generalized version. | When domain templates emerge from community usage. |
| Domain capture skills | `/capture-1on1`, `/incident-capture`, `/review-*`, `/peer-scan`, `/slack-scan` are all domain-locked or service-dependent. | Community-built skills on top of `/ingest`. |

### Skill composition architecture (recommended)

Each reference skill should follow obsidian-mind's pattern:
- **One SKILL.md file** (~50-150 lines) containing the prompt, workflow steps, conventions, and quality rules
- **0-2 subagents** (model: sonnet, explicit tools, max turns) for heavy operations within the skill
- **Convention-based output** (compiled truth + timeline format from GBrain, parseable log entries from Karpathy)

Example composition for `/ingest`:
```
/ingest
├── SKILL.md (orchestrator prompt: classify source, route, update links, update index, append log)
├── agents/
│   ├── source-analyzer.md (read source, extract entities/links/timeline, propose page updates)
│   └── cross-linker.md (after pages updated, find new cross-reference opportunities)
```

Example composition for `/lint`:
```
/lint
├── SKILL.md (orchestrator prompt: run checks, aggregate findings, fix what's safe, report what needs human review)
├── agents/
│   ├── librarian.md (structural checks: orphans, broken links, frontmatter violations, folder conventions)
│   └── cross-linker.md (reference checks: missing backlinks, concepts without pages, contradictions)
```

### Lint checks specification (merged from all three sources)

The `/lint` skill should check for these issues, drawn from Karpathy (6 checks), GBrain (8 checks), and obsidian-mind (vault-audit):

| # | Check | Source | Severity |
|---|---|---|---|
| 1 | Orphan pages (no inbound links) | Karpathy, GBrain, obsidian-mind | Warning |
| 2 | Broken links (target doesn't exist) | GBrain, obsidian-mind | Error |
| 3 | Missing cross-references (related pages not linked) | Karpathy, GBrain | Warning |
| 4 | Contradictions between pages | Karpathy, GBrain | Error |
| 5 | Stale content (newer sources supersede older claims) | Karpathy, GBrain | Warning |
| 6 | Frontmatter violations (missing required fields) | obsidian-mind (PostToolUse hook) | Error |
| 7 | Important concepts mentioned but lacking pages | Karpathy | Info |
| 8 | Tag inconsistency (typos, duplicates) | GBrain | Warning |
| 9 | Empty or stub pages | obsidian-mind | Warning |
| 10 | Data gaps (could be filled with web search) | Karpathy | Info |

---

## Gaps / follow-ups
- The exact SKILL.md content for each reference skill is `/spec` territory — this mapping identifies WHAT to build, not HOW to prompt it
- Subagent model selection (sonnet vs haiku vs opus) needs benchmarking per skill — obsidian-mind uses sonnet for all 9 agents, which is a reasonable default
- The `/init` skill's output (folder structure, AGENTS.md template, manifest.json) should be informed by obsidian-mind's CLAUDE.md (339 lines) as the reference template — that's D10 Tier 2 item #1
- QMD vs Orama decision (D5/D8) affects `/query` skill implementation but not the skill's existence or scope

## Related open-knowledge material
- **PQ14 (reference skills as v1)** — this mapping is the concrete answer to "which skills?"
- **PQ13 (Option D: smart conventions + fat skills)** — the skill architecture validated by 3 independent sources
- **CC5 (zero-friction onboarding)** — `/init` skill is the CC5 implementation
- **D10 Tier 1-3 recommendations** — this mapping refines the tiers into a prioritized skill list
- **D5 (obsidian-mind)** — primary source for command/subagent mapping
- **D6 (GBrain)** — primary source for the 5-skill reference set
- **D8 (Karpathy)** — primary source for the 3 canonical operations
