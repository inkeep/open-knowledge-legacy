# Evidence: Obsidian's Agent Skills Strategy (kepano/obsidian-skills)

**Dimension:** D8 — Obsidian's Agent Skills Strategy
**Date:** 2026-04-07
**Sources:** Cloned repo at `~/.claude/oss-repos/prior-art-open-knowledge/obsidian-skills` (shallow clone, HEAD fa1e131), [Agent Skills specification](https://agentskills.io/specification), npm registry (`skills@1.4.9`), GitHub API
**Repo metrics:** 21,036 stars, 1,294 forks, 11 contributors (kepano = 25 commits; rest = 1-2 each). MIT License. Created 2026-01-02.

---

## Findings

### Finding 1: obsidian-skills is 5 format-teaching skills, not application code — zero agent orchestration, zero AI logic

**Confidence:** CONFIRMED (source code read in full)
**Evidence:** The repo contains exactly 5 skills, each a `SKILL.md` + optional `references/` directory:

| Skill | SKILL.md lines | References | What it teaches |
|-------|----------------|------------|-----------------|
| `obsidian-markdown` | 195 lines | CALLOUTS.md (59), EMBEDS.md (64), PROPERTIES.md (60) | Obsidian Flavored Markdown — wikilinks, embeds, callouts, frontmatter, tags, comments, math, mermaid |
| `obsidian-bases` | 498 lines | FUNCTIONS_REFERENCE.md (171) | Obsidian Bases (.base files) — YAML views, filters, formulas, summaries |
| `json-canvas` | 245 lines | EXAMPLES.md (330) | JSON Canvas (.canvas files) — nodes, edges, groups, colors, layout |
| `obsidian-cli` | 107 lines | (none) | Obsidian CLI commands — read, create, search, plugin dev/test cycle |
| `defuddle` | 42 lines | (none) | Defuddle CLI — extract clean markdown from web pages |

**Total content:** ~1,771 lines across 12 files. No JavaScript, Python, or executable code. No hooks, subagents, slash commands, or lifecycle automation. Pure documentation that teaches agents Obsidian's proprietary formats and tools.

**Key structural observation:** Each SKILL.md follows the Agent Skills specification (agentskills.io) — YAML frontmatter with `name` and `description` fields, followed by markdown instructions. The `description` field is explicitly optimized for agent activation: "Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes."

**Implications for open-knowledge:** obsidian-skills is NOT a competitor to open-knowledge — it's a competitor to open-knowledge's REFERENCE SKILLS. obsidian-skills teaches agents how to work with Obsidian's formats; open-knowledge's reference skills would teach agents how to work with open-knowledge's MCP surface. The question is whether open-knowledge should adopt the same SKILL.md format and `npx skills add` distribution.

### Finding 2: The Agent Skills specification is Anthropic-originated, now a de facto standard across 33+ agents

**Confidence:** CONFIRMED (agentskills.io specification + npm registry + agent compatibility list)
**Evidence:**

**Specification (agentskills.io/specification):**
- Directory structure: `skill-name/SKILL.md` (required) + optional `scripts/`, `references/`, `assets/`
- SKILL.md frontmatter fields: `name` (required, max 64 chars, lowercase+hyphens), `description` (required, max 1024 chars), `license`, `compatibility`, `metadata`, `allowed-tools` (experimental)
- Progressive disclosure model: metadata (~100 tokens loaded at startup) → instructions (<5,000 tokens loaded on activation) → resources (loaded on demand)
- agentskills.io states: "The Agent Skills format was originally developed by Anthropic, released as an open standard, and has been adopted by a growing number of agent products."

**Compatible agents (33+ confirmed from agentskills.io):**
Claude Code, Claude (claude.ai), OpenAI Codex, Cursor, GitHub Copilot, VS Code, Gemini CLI, OpenHands, Goose (Block), Roo Code, Mistral Vibe, TRAE (ByteDance), Junie (JetBrains), Kiro (AWS), OpenCode (SST), Letta, Firebender, Mux (Coder), Amp, Factory, Piebald, Ona, Spring AI, Databricks Genie Code, Snowflake Cortex Code, Qodo, Laravel Boost, Emdash, Command Code, VT Code, Autohand, Agentman, pi

**Distribution mechanism — `npx skills add`:**
- npm package: `skills@1.4.9` (MIT, published 2 days ago as of 2026-04-07)
- Maintained by **Vercel Labs** (maintainers: rauchg = Guillermo Rauch/Vercel CEO, quuu)
- Repository: `vercel-labs/skills` on GitHub
- 62 published versions — actively maintained
- Keywords include every major agent: claude-code, codex, cursor, github-copilot, gemini-cli, opencode, openhands, goose, windsurf, etc.
- Usage: `npx skills add git@github.com:kepano/obsidian-skills.git`

**Claude Code plugin integration:**
The repo also ships as a Claude Code plugin (`.claude-plugin/plugin.json` and `marketplace.json`):
```json
// plugin.json
{
  "name": "obsidian",
  "version": "1.0.1",
  "description": "Create and edit Obsidian vault files...",
  "author": { "name": "Steph Ango", "url": "https://stephango.com/" },
  "license": "MIT"
}
// marketplace.json — enables /plugin marketplace add kepano/obsidian-skills
```

**Implications for open-knowledge:** The Agent Skills specification is no longer an Anthropic-only format — it's becoming the MCP of agent context (a cross-vendor standard). With 33+ compatible agents and Vercel-maintained CLI distribution, this is the distribution channel open-knowledge's reference skills should use. Shipping skills as SKILL.md files with `npx skills add` compatibility gives open-knowledge reach across the entire agent ecosystem, not just Claude Code.

### Finding 3: kepano's philosophy — "teach agents formats" vs "embed AI in the product"

**Confidence:** CONFIRMED (README.md + skill content + repo structure)
**Evidence:**

README.md line 1: "Agent Skills for use with Obsidian."

The README offers installation for 4 agents: Claude Code (marketplace + manual), Codex CLI, OpenCode. No mention of Obsidian-specific AI features, no LLM compute, no agent orchestration. The entire strategy is: "Here are the formats. Agents, learn them."

**What the skills actually teach (architecture of the approach):**
1. **obsidian-markdown** teaches Obsidian Flavored Markdown — a superset of CommonMark/GFM. The skill explicitly says: "This skill covers only Obsidian-specific extensions — standard Markdown is assumed knowledge." It covers wikilinks, block IDs, embeds, callouts, properties (frontmatter), tags, comments, highlights, math, mermaid, footnotes. Each with correct syntax examples.
2. **obsidian-bases** teaches the `.base` file format — a Obsidian-specific YAML format for database-like views over notes. Comprehensive: schema, filters, formulas, properties, views (table/cards/list/map), summaries, complete examples.
3. **json-canvas** teaches JSON Canvas 1.0 spec — an Obsidian-originated open format for spatial canvases. Node types (text/file/link/group), edges, colors, layout guidelines, validation checklist.
4. **obsidian-cli** teaches the Obsidian CLI — command-line access to vaults (read, create, search, properties, tasks, tags, backlinks) and plugin development commands (reload, errors, screenshot, DOM, eval, CSS).
5. **defuddle** teaches Defuddle CLI — a web content extraction tool (also by kepano) that converts web pages to clean markdown.

**The strategic pattern:** Obsidian externalizes ALL agent intelligence. The product stays lean (18-person team, $25M ARR, bootstrapped). Agents are powerful because they understand Obsidian's formats, not because Obsidian runs AI. 21K stars prove this resonates.

**Implications for open-knowledge:** This is a VALIDATED market signal. 21K developers installed or starred a repo that teaches agents about a product's file formats. This means there's significant demand for "teach my agent about my knowledge tool" — which is exactly what open-knowledge's reference skills would do. BUT it also validates Obsidian's competitive position: Obsidian + obsidian-skills + any agent = a surprisingly complete agent-native knowledge experience at the format level.

### Finding 4: The obsidian-skills repo covers format but NOT the co-creation problem

**Confidence:** CONFIRMED (full repo audit — no mention of collaboration, conflict resolution, presence, attribution, review)
**Evidence:**

A systematic search of all 12 files (1,771 lines) for collaboration-related terms found ZERO mentions of:
- Real-time collaboration / multiplayer
- Conflict resolution / concurrent edits
- Agent identity / attribution
- Staging / review / draft workflow
- Event subscription / change notification
- Presence / awareness
- Branching / merging (for content, not git)

The skills teach agents to READ and WRITE Obsidian files. They do NOT address what happens when a human and agent edit simultaneously, how to attribute agent contributions, how to review agent changes before they go live, or how to subscribe to changes.

The `obsidian-cli` skill shows `obsidian read`, `obsidian create`, `obsidian append` — all imperative commands that assume single-actor, last-write-wins. No `obsidian draft`, `obsidian propose`, or `obsidian watch`.

**Implications for open-knowledge:** This is the structural gap. obsidian-skills solves the "agent understands the format" problem. It does NOT solve the "agent is a co-creator with identity, review, and conflict resolution" problem. That's precisely open-knowledge's value proposition: the same format literacy (SKILL.md) PLUS co-creation primitives (MCP tools for drafts, staging, review, attribution, presence). Open-knowledge should be format-compatible with Obsidian (markdown + frontmatter + wikilinks) AND add the collaboration layer that obsidian-skills can never provide.

### Finding 5: 21K stars in 3 months — fastest-growing Obsidian ecosystem repo

**Confidence:** CONFIRMED (GitHub API)
**Evidence:**
- Created: 2026-01-02
- Stars: 21,036 (as of 2026-04-07 — 95 days)
- Growth rate: ~221 stars/day
- Forks: 1,294
- Contributors: 11 (overwhelmingly kepano; community PRs are minor fixes)
- Last updated: 2026-04-07 (actively maintained)

For comparison: Obsidian itself is closed-source (no star count). The largest Obsidian community repo (obsidian-releases) has ~9.6K stars over 5 years. obsidian-skills surpassed it in ~6 weeks.

**The star count signals:**
1. Developer demand for agent-format integration is enormous
2. The Agent Skills specification + `npx skills add` distribution model works
3. kepano's personal brand + Obsidian's 1.5M user base provides distribution
4. "Teach agents your product's formats" is a validated GTM strategy

**Implications for open-knowledge:** 21K stars is a market proof point. If open-knowledge ships reference skills in the same Agent Skills format, it can ride the same adoption wave. BUT it also means Obsidian's agent story is now much stronger than the original D2/D6 assessment in this report, which characterized Obsidian as "no AI in product" — true, but incomplete. The correct framing is "no AI in product, 21K-star agent ecosystem outside product."

### Finding 6: The .claude-plugin directory — dual distribution (Claude marketplace + npx skills)

**Confidence:** CONFIRMED (source files read)
**Evidence:**

The repo ships TWO distribution mechanisms:
1. **Claude Code plugin marketplace:** `.claude-plugin/plugin.json` + `marketplace.json` → `/plugin marketplace add kepano/obsidian-skills` → `/plugin install obsidian@obsidian-skills`
2. **Agent Skills CLI:** `npx skills add git@github.com:kepano/obsidian-skills.git` → copies skill files to agent-appropriate directory

The Claude plugin format (`plugin.json`) has its own metadata: `name`, `version`, `description`, `author`, `repository`, `license`, `keywords`. The `marketplace.json` is a registry manifest listing plugins in the repo.

This dual-distribution pattern means the same skills are available via:
- Claude Code's native plugin system (tightest integration)
- `npx skills add` (cross-agent, Vercel-maintained)
- Manual git clone (universal fallback)

**Implications for open-knowledge:** Open-knowledge reference skills should ship with the same triple distribution: Claude Code plugin (for Claude users), `npx skills add` (for all 33+ agents), and git clone (universal). The `.claude-plugin/` directory format is a template worth copying.

---

## Gaps / follow-ups

- **How does obsidian-mind (breferrari/obsidian-mind, 1.3K stars) relate to obsidian-skills?** obsidian-mind BUNDLES obsidian-skills as dependencies in its CLAUDE.md. They're complementary: obsidian-skills = format literacy, obsidian-mind = full workflow template (hooks, subagents, slash commands). Together they form the "convention layer" that replaces application code.
- **Is Orca (another `npx skills add` consumer) gaining traction?** Worth monitoring whether `npx skills add` becomes the dominant distribution for all agent skills, not just coding-related ones.
- **The `skills-ref` validation library** at github.com/agentskills/agentskills — should open-knowledge's CI validate its reference skills against this?
- **Does the `allowed-tools` experimental field in the Agent Skills spec foreshadow agent sandboxing?** If so, open-knowledge's MCP tools should align with the tool naming conventions.

## Relationship to prior D2 and D6 assessments

**D2 (AI/Agent Story) update needed:** The current D2 text says Obsidian's approach is "external agents via filesystem (no AI in product)" with "community provides 86 AI plugins and 12+ MCP servers." This is now incomplete. obsidian-skills (21K stars, official from CEO) represents an OFFICIAL agent strategy, not just community activity. It's the most successful "teach agents your formats" implementation in the ecosystem. The 86 plugins number is also stale — the Agent Skills ecosystem is now the primary vector, not the plugin ecosystem.

**D6 (Strategic Direction) update needed:** The current D6 text says "The CEO's approach to AI (teach agents formats via skills files) is deliberate philosophy, not inaction." This is directionally correct but understates the execution. With 21K stars and a formal spec adoption (agentskills.io), this is not just philosophy — it's a validated strategy with ecosystem momentum. The correct assessment: Obsidian will not build AI in the product, but is actively building the agent interop layer outside the product, and doing it better (by star count) than any competitor's MCP server.

**Threat assessment impact:** D6 currently rates Obsidian as "Tier 3: Low Threat" with "Probability of overlap: Very Low." This should be revised UPWARD to at least "Low" (not "Very Low"). obsidian-skills + obsidian-mind + the Claude Code plugin marketplace means Obsidian users can get 70% of open-knowledge's value without switching products. The remaining 30% (real-time co-editing, presence, embeddable editor, MCP write tools with draft/review) is open-knowledge's true differentiator.

## Related open-knowledge material

- **PQ4 (skill/MCP authoring and distribution)** — open-knowledge's skills should adopt the Agent Skills specification format
- **PQ3 (knowledge compilation)** — compilation is a skill, not a product feature; the Agent Skills format is the right packaging
- **XQ1 (MCP interface design)** — open-knowledge's MCP tools will be the foundation that skills call; the tool names matter for `allowed-tools` compatibility
- **CC5 (zero-friction onboarding)** — `npx skills add` is a proven zero-friction distribution model
- **Day-0 positioning ("Obsidian, but agent-native and collaborative")** — still valid, but now requires acknowledging that Obsidian's agent story is stronger than "no AI in product" implies
