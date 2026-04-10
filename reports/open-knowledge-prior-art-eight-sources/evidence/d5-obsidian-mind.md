# Evidence: obsidian-mind — Obsidian vault template for Claude Code persistent memory

**Dimension:** D5 — breferrari/obsidian-mind
**Date:** 2026-04-07
**Sources:** Cloned repo at `~/.claude/oss-repos/prior-art-open-knowledge/obsidian-mind`, deep source investigation by Explore subagent
**Repo metrics:** 1.3K stars, 164 forks. Pure templates + prompts + bash/python hooks. No backend code.

---

## Findings

### Finding: obsidian-mind is a "PURE skill/convention" approach — zero application code, all behavior comes from CLAUDE.md + hooks + slash commands + subagents
**Confidence:** CONFIRMED
**Evidence:** Repo structure has NO source code directory — the entire repo is:
- `CLAUDE.md` (339 lines) — operating manual
- `vault-manifest.json` — schema declaration
- `.claude/settings.json` — 5 lifecycle hooks
- `.claude/commands/*.md` — 15 slash command definitions
- `.claude/agents/*.md` — 9 subagent definitions
- `.claude/scripts/` — small bash + Python hook implementations
- `.claude/skills/` — Obsidian + QMD integration skills
- `templates/*.md` — 5 note templates
- `bases/*.base` — Obsidian Bases (dynamic views)
- folder scaffolding (`brain/`, `work/`, `org/`, `perf/`, etc.)

**Implications for open-knowledge:** This is a **valuable counter-example to open-knowledge's "substrate product" approach.** obsidian-mind achieves much of what open-knowledge wants (persistent memory, agent-curated knowledge, conventions) **without writing any custom application code** — just using Obsidian + Claude Code's existing primitives (hooks, skills, subagents, vault filesystem).

The trade-off:
- **obsidian-mind**: zero infrastructure, fully forkable, no real-time co-editing, no sandbox enforcement, depends on Obsidian + Claude Code as the substrate
- **open-knowledge**: custom substrate, real-time co-editing, sandbox/permissions enforcement, IS the editor (not a layer on top)

**This is a serious risk to open-knowledge's positioning**: if obsidian-mind already covers 70% of the value at zero infrastructure cost, the marginal value of open-knowledge's substrate must be the remaining 30% (real-time co-editing, presence, MCP write tools, embeddable editor). Worth being honest about.

### Finding: CLAUDE.md (339 lines) is the "operating manual" — comprehensive prose convention document
**Confidence:** CONFIRMED
**Evidence:** `CLAUDE.md` sections (lines documented in subagent report):
- Skills & Capabilities (lines 5-14): obsidian-markdown, obsidian-cli, json-canvas, obsidian-bases, defuddle, qmd
- Custom Slash Commands (lines 16-36): table of all 15 commands
- Vault Structure (lines 38-66): folder purposes
- Obsidian CLI (lines 68-85): command reference
- Session Workflow (lines 87-149): start, end, thinking
- Creating Notes (lines 132-151): conventions
- Note Types (lines 153-164): 8 types with locations
- **Linking — This Is Critical** (lines 166-197): graph-first, "A note without links is a bug", role taxonomy (evidence/concept/index/person nodes)
- Maintaining Indexes (lines 199-207)
- Decision Records (lines 209-213)
- North Star (lines 220-227)
- Tags Convention (lines 229-239)
- Properties for Querying (lines 241-252)
- Memory System (lines 254-265)
- Agent Guidelines (lines 269-291)
- Subagents (lines 300-314)
- Hooks (lines 316-326)
- Rules (lines 328-339)

**Implications for open-knowledge:** This is a STRONG TEMPLATE for what open-knowledge's reference AGENTS.md should look like. The `instructions` field on the MCP server + AGENTS.md in the project root should follow the same structure:
- Vault/project structure
- File types and conventions
- Linking conventions
- Tags/properties for querying
- How to use the MCP tools (analogous to "Obsidian CLI" section)
- Session workflow patterns
- Subagent composition guidance

**Specifically valuable conventions to steal:**
- **"A note without links is a bug"** — turns linking from an option into a hygiene rule
- **Role taxonomy for note types**: evidence nodes (work notes — add outbound links), concept nodes (competencies — receive backlinks passively), index nodes (work/Index.md — actively curate links), person nodes (link to projects/teams)
- **"Where to put things" decision tree** for new content

### Finding: 15 slash commands organized by workflow phase — daily, performance review, maintenance, migration
**Confidence:** CONFIRMED
**Evidence:** `.claude/commands/*.md` — 15 files. Categorized:

**Daily workflow:**
- `/standup` (23 lines) — morning kickoff with context injection
- `/dump` (24 lines) — freeform capture with auto-routing
- `/wrap-up` (88 lines) — full session review (verify context, indexes, orphans)
- `/weekly` (88 lines) — cross-session synthesis, North Star alignment

**Voice/editing:**
- `/humanize` (83 lines) — voice-calibrated rewriting (loads 2-3 user-written notes, extracts voice fingerprint, rewrites in matching voice)

**Capture:**
- `/capture-1on1` (47 lines) — structured 1:1 meeting notes
- `/incident-capture` (120 lines) — Slack-sourced incident reconstruction
- `/slack-scan` (52 lines) — deep evidence gathering from Slack
- `/peer-scan` (54 lines) — GitHub PR analysis for peer review

**Performance review:**
- `/review-brief` (70 lines) — context transfer for review (manager or peer audience)
- `/self-review` (116 lines) — self-assessment within character limits, fact-checked
- `/review-peer` (103 lines) — peer review writing

**Maintenance:**
- `/vault-audit` (142 lines) — structural + frontmatter + link audit, fix what can be fixed
- `/vault-upgrade` (187 lines) — migrate from older obsidian-mind versions OR arbitrary Obsidian vaults
- `/project-archive` (48 lines) — move completed projects to archive with index updates

**Implications for open-knowledge:** 
- The set of slash commands here is a **strong reference for what open-knowledge's reference skills should be**. Open-knowledge's PQ14 lists "ingest, compile, Q&A, lint, index-maintenance" — that's only 5. obsidian-mind has 15.
- The "review-brief / self-review / review-peer" cluster is interesting — it's a domain-specific use case (performance reviews) built on top of the substrate. Open-knowledge could ship reference skills for analogous domains: "research" (compile sources into a wiki), "decision-log" (capture and organize decisions), etc.
- **The /humanize pattern is novel**: loads samples of user's writing, extracts a voice fingerprint, rewrites Claude-drafted content to match. This is a concrete answer to the "AI output sounds like AI" problem. Worth shipping as an open-knowledge reference skill.
- **The /vault-upgrade pattern** is a model for open-knowledge's migration story. Multi-tier classification (Tier 0 vault shape → Tier 1 structural → Tier 2 metadata → Tier 3 content reading → Tier 4 fallback) for arbitrary Obsidian vaults is impressive.

### Finding: 9 specialized subagents — each isolated context, each solving ONE problem
**Confidence:** CONFIRMED
**Evidence:** `.claude/agents/*.md` — 9 files:

| Agent | Model | Tools | Max Turns | Output |
|-------|-------|-------|-----------|--------|
| `vault-librarian` | sonnet | Read, Grep, Glob, Bash | 25 | Maintenance report file |
| `context-loader` | sonnet | Read, Grep, Glob, Bash | 20 | Inline briefing (no file) |
| `cross-linker` | sonnet | Read, Edit, Grep, Glob, Bash | 25 | Findings file |
| `brag-spotter` | sonnet | Read, Grep, Glob, Bash | 20 | Inline summary |
| `people-profiler` | sonnet | Read, Write, Edit, Bash, Grep, Glob | 30 | Inline summary + created files |
| `review-prep` | sonnet | Read, Grep, Glob, Write, Bash | 30 | Review prep file |
| `slack-archaeologist` | sonnet | Read, Write, Bash, Grep, Glob | 40 | Slack reconstruction file |
| `review-fact-checker` | sonnet | Read, Grep, Glob, Bash | 30 | Verified/unverified/flagged report |
| `vault-migrator` | sonnet | Read, Write, Edit, Grep, Glob, Bash | 50 | Either classification map or migration |

**Composition pattern from `/incident-capture`**:
> "Launch both in parallel when starting the capture: slack-archaeologist + people-profiler"

**Implications for open-knowledge:** 
- The **subagent isolation pattern is reusable.** Each agent has explicit tools, model, max turns, and a specific job. Parent commands orchestrate (parallel launch, conditional chaining, result aggregation).
- **Open-knowledge should encourage skill authors to use subagents for heavy operations.** A `compile` skill, for example, should spawn subagents for: source analysis, draft generation, cross-reference resolution, lint pass.
- **9 agents is a lot for one template**. Open-knowledge's reference skills can start with fewer (3-4 per skill is plenty) and grow as use cases emerge.
- **The "context isolation" property** prevents token budget leak between steps. This is critical for maintaining quality across long workflows.

### Finding: 5 lifecycle hooks enforce conventions automatically — SessionStart, UserPromptSubmit, PostToolUse, PreCompact, Stop
**Confidence:** CONFIRMED
**Evidence:** `.claude/settings.json` (hooks section) + `.claude/scripts/`:

| Hook | Trigger | Function |
|------|---------|----------|
| **SessionStart** | startup/resume/clear/compact | Inject North Star, recent changes, open tasks, active work, vault file listing. Run `qmd update` for incremental re-index. |
| **UserPromptSubmit** | every user message | Run `classify-message.py` — multilingual regex (English/Japanese/Korean/Chinese) detects DECISION/INCIDENT/1:1/WIN/ARCHITECTURE/PERSON/PROJECT signals → injects routing hint into context |
| **PostToolUse** | after Write/Edit | Run `validate-write.py` — check frontmatter present, tags exists, description ~150 chars, date exists, wikilinks present. Inject warnings as additional context |
| **PreCompact** | before context compaction | Back up session transcript to `thinking/session-logs/`. Prune to last 30. Exit 0 (non-blocking) |
| **Stop** | end of session | Output session-end checklist reminder (archive completed projects? update indexes? new notes linked? run /vault-audit?) |

Hook architecture notes:
- **Matcher-based**: SessionStart uses `matcher: "startup|resume|clear|compact"`
- **PostToolUse uses matcher** to only fire on Write/Edit (not Read/Grep/Bash)
- **All scripts gracefully fail (exit 0)** so a broken hook doesn't break the session

**Implications for open-knowledge:** **Hooks as enforcement is a powerful pattern open-knowledge can adopt.** The PostToolUse `validate-write.py` is the closest pattern to what open-knowledge wants — automatic frontmatter validation, link checking, hygiene enforcement.

For open-knowledge, this maps to:
- **PostToolUse (Write/Edit)**: validate frontmatter against project schema, check that links resolve, warn on orphan creation
- **SessionStart**: inject `.openknowledge/index.md` content, recent commit log, active drafts
- **UserPromptSubmit**: classify the user message and route to appropriate skill (similar to obsidian-mind's pattern)

**Importantly: open-knowledge's product can SHIP these hooks as part of `npx openknowledge init`.** Just like obsidian-mind's template includes `.claude/settings.json`, open-knowledge can ship a settings.json that wires up the hooks automatically. This gives Claude Code users a high-quality setup with zero manual configuration.

### Finding: Backlinks accumulate as evidence automatically — competency framework as the proof
**Confidence:** CONFIRMED
**Evidence:** `perf/competencies/README.md`:
> "Evidence accumulates via backlinks automatically — open any competency note and check the backlinks panel to see all work that demonstrates it."

Mechanism:
- Work notes have `## Related` section linking to competencies (e.g., `[[System Design]]`)
- Competency notes don't manually maintain evidence lists
- Obsidian's backlinks UI shows which work notes reference each competency
- The graph IS the evidence database

**Implications for open-knowledge:** 
- **This is the cleanest example of "wiki-links as a query language" in the prior art.** No code, no explicit data structure beyond markdown wiki-links — just a convention that "work note links to competency" → backlinks panel becomes the evidence view.
- **For open-knowledge:** S10 (wiki-links + backlinks) IS this pattern. The backlink index + UI surfacing of "what links here" gives users a queryable database without any explicit query language.
- **Specific use case to highlight in marketing**: open-knowledge can replicate the "performance review evidence accumulation" use case as a demo. Define a competency, link work notes to it, then ask "show me all evidence for X competency" → backlinks panel.

### Finding: Multi-tier vault classification heuristic for migrating arbitrary Obsidian vaults
**Confidence:** CONFIRMED
**Evidence:** `.claude/commands/vault-upgrade.md` (187 lines) + `.claude/agents/vault-migrator.md`:

5-step workflow:
1. **Validate & detect** — version fingerprint detection (v1/v2/v3.0-v3.3) for known obsidian-mind sources, OR organizational pattern detection (PARA, Zettelkasten, daily notes, flat, MOC-based, Inbox)
2. **Inventory & classify** — for each unknown file, apply 4-tier heuristic:
   - **Tier 0**: Vault shape (folder structure pattern)
   - **Tier 1**: Structural folder names (`projects/`, `daily/`)
   - **Tier 2**: Metadata (frontmatter + inline tags)
   - **Tier 3**: Content reading (Claude reads first 50 lines)
   - **Tier 4**: Fallback (uncategorized → `migrate-review/`)
3. **Present migration plan** — summary, conflicts, ask for "go" approval
4. **Execute migration** — vault-migrator agent reads source, transforms, writes target
5. **Validate** — spot-check frontmatter, broken links, orphans

**Idempotency:** Migration log tracks source content hashes; re-runs SKIP unchanged source files.

**Implications for open-knowledge:** This is a **strong template for an "import existing vault" reference skill**. Open-knowledge's S-L5 (browser extension) and S-L6 (connectors) target the migration use case. obsidian-mind shows a credible workflow:
- Detect source format
- Classify content with progressive heuristics (cheap → expensive)
- Plan-first execution with user approval
- Idempotent with content hashes
- Source vault never modified (read-only)

For open-knowledge, this could be a Day-1 reference skill: `npx openknowledge import <obsidian-vault-path>`. The user runs it once, gets their existing vault content into the open-knowledge format with full provenance.

### Finding: QMD as the recommended semantic search backend (Tobi Lutke / Shopify CEO)
**Confidence:** CONFIRMED
**Evidence:** `.claude/skills/qmd/SKILL.md` — Three search modes:
- **query**: BM25 + vector + LLM reranking (complex/conceptual queries)
- **search**: BM25 only (exact terms, names, ticket numbers)
- **vsearch**: Semantic-only (exploratory queries)

Used proactively per CLAUDE.md: "Use QMD PROACTIVELY before reading files directly — whenever the user asks about past decisions, incidents, people, meetings."

Index maintained by SessionStart hook running `qmd update` (incremental).

**Implications for open-knowledge:** QMD is referenced by both obsidian-mind AND Karpathy's gist (D8) as the recommended semantic search tool for markdown vaults. Open-knowledge's S8 plans Orama instead. **Worth a side-by-side comparison** before committing to Orama:
- QMD pros: Karpathy-recommended, used in production by obsidian-mind, hybrid BM25+vector+LLM rerank built-in
- Orama pros: Pure TypeScript (no external binary), in-process, more configurable, the same bge-small embedding model can be used

This isn't blocking — Orama is a fine choice — but if QMD's hybrid+rerank pipeline is meaningfully better, it might be worth using QMD as a CLI dependency rather than building the same pipeline on Orama.

### Finding: vault-manifest.json declares schema, version, migration rules — version detection enables vault upgrades
**Confidence:** CONFIRMED
**Evidence:** `vault-manifest.json` includes:
- `frontmatter_required`: per-note-type required fields
- `version_fingerprints`: file existence patterns to detect old vault versions

```json
"version_fingerprints": {
  "v1": { "exists": ["claude/Memories.md"], "missing": ["brain/", "bases/"] },
  "v2": { "exists": ["brain/", "bases/", "Home.md"], "missing": [".claude/agents/"] }
  ...
}
```

**Implications for open-knowledge:** **This is a strong pattern for open-knowledge to adopt.** A `.openknowledge/manifest.json` could declare:
- Frontmatter schema per content type (article, decision, source, compiled)
- Required folder conventions
- Version fingerprints for migration

This enables:
- Automatic schema validation in PostToolUse hook
- Version-aware migrations when open-knowledge's conventions evolve
- Programmatic discovery of "what kind of project is this?"

It's also a forcing function — having a manifest makes the conventions concrete and declarative rather than buried in prose docs.

### Finding: Multilingual content classification with CJK-safe regex patterns
**Confidence:** CONFIRMED
**Evidence:** `.claude/scripts/classify-message.py`:
```python
SIGNALS = [
    {
        "name": "DECISION",
        "patterns": [
            "decided", "deciding", "decision", "we chose", "agreed to",
            "決定した", "決めた", "合意した",
            "결정했어", "결정했습니다", "합의했어",
            "决定了", "我们决定", "确定了", "同意",
        ],
    },
    ...
]
```

Uses Latin-letter lookarounds (`(?<![a-zA-Z])` + `(?![a-zA-Z])`) for word boundaries that work across CJK (Python `\b` doesn't work for non-ASCII).

**Implications for open-knowledge:** Open-knowledge's audience includes non-English users. Reference skills should ship with multilingual support — at minimum, content classification regex should not be English-only. The CJK-safe lookaround pattern is a small but important detail.

---

## Gaps / follow-ups
- The `Home.md` Bases dashboards — what queries do they actually run? (Bases is Obsidian's structured data view feature.)
- The `humanize` voice-fingerprinting — how does it actually work? Does it use embeddings or pure prompt engineering?
- The competency framework's specific values — open-knowledge could fork these as a starting point
- How big is the average obsidian-mind deployment? (Star count is 1.3K; how many of those are users with active vaults?)

## Related open-knowledge material
- **PQ14 (reference skills as v1)** — 15 slash commands is the upper bound for reference skill count
- **PQ13 (Karpathy workflow Option D)** — obsidian-mind is the "fat conventions" extreme (no custom code)
- **CC5 (zero-friction onboarding)** — `.claude/settings.json` shipped in template is a great pattern
- **S10 (wiki-links + backlinks)** — backlinks-as-evidence is the canonical use case
- **S8 (semantic search)** — QMD as an alternative or complement to Orama
- **New pattern: PostToolUse hook for write-time validation** — open-knowledge's product can ship hook scripts in `npx openknowledge init`
- **New pattern: vault-manifest.json for declarative schema** — replaces prose-only convention docs
- **New reference skill: /humanize for voice-calibrated editing**
- **New reference skill: /vault-upgrade-style import for arbitrary markdown vaults**
- **Risk: obsidian-mind covers ~70% of open-knowledge's value with zero code** — open-knowledge's marginal value must be the remaining 30% (real-time co-editing, presence, embeddable editor, MCP write tools, sandbox enforcement)
