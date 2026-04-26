---
title: "CLI Command Naming: `ok brain` / `gbrain` / `llm-brain` — Landmine Audit + Architecture Shape"
description: "Evidence-driven assessment of naming a re-runnable knowledge-base scaffolder subcommand for @inkeep/open-knowledge. Covers brand/trademark/registry landmines across the `brain` family (disqualifying GBrain collision with Garry Tan's 2026 launch, TheBrain Technologies trademark, Obsidian 'second brain' tagline), alternative name candidates (`seed`, `new`, `pages`, `scaffold`), subcommand-vs-flag CLI ergonomics, and the shared-implementation shape for CLI + Electron-UI hybrid scaffolders based on shadcn 3.0 / Astro / Supabase / Prisma precedent."
createdAt: 2026-04-23
updatedAt: 2026-04-23
subjects:
  - Open Knowledge
  - GBrain
  - Garry Tan
  - TheBrain Technologies
  - Obsidian
  - shadcn
  - Astro
  - Prisma
  - Supabase
  - clig.dev
topics:
  - CLI naming
  - trademark audit
  - subcommand vs flag
  - CLI + UI shared implementation
  - scaffolder command
  - agent-readable folder instructions
---

# CLI Command Naming: `ok brain` / `gbrain` / `llm-brain` — Landmine Audit + Architecture Shape

**Purpose:** Decide what to call the re-runnable CLI command that scaffolds folder structure, `config.yml` folder-metadata, and per-folder agent-readable instructions for an Open Knowledge base — and how to wire it so the Electron app can trigger the same scaffolder post-init. The reader cares most about (1) whether the `brain` family is defensible or a landmine, (2) the cleanest CLI↔UI shared-implementation shape, and (3) a ranked recommendation with evidence.

---

## Executive Summary

**Top recommendation: `ok seed`, implemented as a top-level subcommand with a shared `planSeed` / `applySeed` TS module consumed by the CLI, an Electron IPC handler, and (later) an optional MCP tool.**

The `brain` family is not safe:

1. **`gbrain` is disqualifying.** [Garry Tan](https://github.com/garrytan/gbrain), CEO of Y Combinator, open-sourced `GBrain` on **April 9–10, 2026 — 13 days before this report**. It has 10.5k+ GitHub stars, installs as `npm install -g gbrain` with its own `gbrain init/import/query` subcommands, and positions itself as "markdown files in a Git repo + agent skills layer + typed wiki-links for AI agents" — *extensionally identical* to Open Knowledge's positioning. The "g" stands for Garry. `ok gbrain` would read to any AI-agent-developer as an integration with, or derivative of, Tan's product. See [D1](#d1--naming-landscape-brain-gbrain-llm-brain) and [D4](#d4--trademark--registry-landmines).
2. **`brain` is medium-to-high risk** from a combination of (a) [TheBrain Technologies LP](https://www.thebrain.com)'s live USPTO trademark family covering "computer software for facilitating information management" — the exact category — since 1998; (b) [Obsidian's core tagline](https://obsidian.md) "A second brain, for you, forever"; (c) [Tiago Forte's registered "BUILDING A SECOND BRAIN"](https://www.buildingasecondbrain.com) US/EU trademark; and (d) a crowded npm `brain*` namespace (`@braindb/core`, `@titan-design/brain`, `@lumenlabs/lumen-brain`, `nano-brain`, `@mager/brainpack` all shipped 2025–2026). Not legally fatal for a subcommand, but the combined brand-collision yields a "me-too Obsidian clone" reading that's corrosive to positioning.
3. **`llm-brain`** is the cleanest of the `brain` family on registry/trademark (no npm, PyPI, or USPTO collision) but inherits the Obsidian/BASB metaphor baggage *and* timestamps the product to the "LLM era" — a term already aging as the tooling matures. Viable as a fallback, not recommended as first choice.

Top alternatives, ranked:

| # | Candidate | Headline reason |
|---|-----------|-----------------|
| 1 | **`ok seed`** | Clean `db:seed` metaphor; pairs cleanly with existing `ok init`; zero collisions; evokes "plant the starter structure, agent grows it" |
| 2 | `ok new` | Most conventional — `git new` / `cargo new` / `gh repo new` precedent; best if command takes a target-path argument |
| 3 | `ok pages` | Domain-grounded in Open Knowledge's own vocabulary ("pages" is already used repo-wide); zero collision |
| 4 | `ok scaffold` | Honest and unambiguous; mild 2015-Yeoman dev-crusty vibe but safe |
| — | `ok llm-brain` | Fallback if the `brain` metaphor remains desired despite the soft penalties |

**CLI shape:** Top-level subcommand, not a flag on `init`. The clig.dev / jmmv.dev written heuristic — *"flags tune, subcommands operate"* — and mature-tool convergence (shadcn `add`, astro `add`, supabase `functions new`, gh `<noun> create`, jekyll `new`) unambiguously point to a dedicated subcommand. `init` is a reserved one-shot word across the ecosystem; namespacing under `ok init <name>` or fronting a `--<name>` flag fights the convention.

**Shared-implementation shape (when same-runtime CLI + UI both need to invoke):** shape **(a)** — single TS module exported from a shared package, wrapped thinly by CLI (Commander), Electron IPC handler, and (future) MCP tool. This is the shadcn 3.0 pattern verbatim, where `runInit` / `runAdd` are exported functions consumed by Commander and the shadcn MCP server identically. Shell-out (shape b) is reserved for cross-runtime cases (Supabase Dashboard talking to a local CLI); duplication (shape d) is the anti-pattern.

**Idempotency UX:** plan → show diff → confirm → apply. Same shape across shadcn 3.0, `astro add`, Prisma. Return a structured `ScaffoldPlan` object so the CLI renders ANSI diff + y/n prompt and the Electron renderer renders a React diff component + Apply button — identical logic, different presenters.

**Key Findings:**

- **`gbrain` collides catastrophically with Garry Tan's GBrain (released 2026-04-10).** See [D1 Finding 1](#d1--naming-landscape-brain-gbrain-llm-brain), [D4 Finding](#d4--trademark--registry-landmines).
- **TheBrain Technologies LP holds live USPTO trademarks** in the exact software category since 1998. `brain` is defensible as a subcommand but brand-conflation is high. [D1 Finding 2](#d1--naming-landscape-brain-gbrain-llm-brain), [D4](#d4--trademark--registry-landmines).
- **Subcommand beats flag for re-runnable scaffolders** per clig.dev + jmmv.dev + every mature CLI surveyed (shadcn, astro, supabase, gh, jekyll). [D2](#d2--cli--ui-shared-implementation-patterns).
- **Same-runtime hybrid scaffolders converge on "shared TS module + thin wrappers"** — shadcn 3.0's `runInit` / `runAdd` exported functions consumed by both Commander and MCP is the canonical example. [D2](#d2--cli--ui-shared-implementation-patterns).
- **`init` is reserved for one-shot setup** across every tool surveyed — re-runnable scaffolders get their own subcommand. Open Knowledge's existing `ok init` (scaffolds `.open-knowledge/`, registers MCP) should stay as-is; the new command is additive. [D2](#d2--cli--ui-shared-implementation-patterns).
- **`AGENTS.md` is the emerging cross-vendor standard** for agent-readable instruction files (OpenAI, Google, Anthropic, Cursor, Zed all accept it). Nested per-folder `AGENTS.md` is spec-supported. The scaffolder should emit `AGENTS.md`, not `CLAUDE.md`. The repo's own `CLAUDE.md → AGENTS.md` symlink is the 1P precedent. [D3](#d3--what-the-scaffolder-should-emit).

---

## Research Rubric

**Primary question:** What should we name the CLI command that scaffolds folder structure + `config.yml` instructions + folder frontmatter for an Open Knowledge base, and how should it be architected so it's canonical from CLI but UI-triggerable post-init?

**Reader cares about:** (1) is `brain` / `gbrain` / `llm-brain` a defensible choice or a landmine, (2) cleanest CLI+UI shared-implementation shape, (3) a ranked recommendation with evidence.

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Naming landscape for `brain` / `gbrain` / `llm-brain` / alternatives — prior art, brand positioning, vibes | Deep | **P0** |
| D2 | CLI + UI-triggered hybrid scaffolder patterns + subcommand vs flag | Moderate | **P0** |
| D3 | Agent-readable folder-instruction conventions (AGENTS.md nested, Cursor .mdc frontmatter) | Moderate | P1 |
| D4 | Trademark / registry / SERP landmines — USPTO, npm, PyPI, Homebrew, domains | Light | P1 |

**Non-goals:** Implementation of the command (that's `/spec` or `/ship`); evaluating Open Knowledge's own codebase for where to wire the CLI; logo / visual brand identity; whether to keep `init-content` MCP tool alongside the CLI (pre-decided direction per conversation); revisiting the top-level `ok` binary name (covered in [`cli-command-name-ok-okb/`](../cli-command-name-ok-okb/REPORT.md)).

**Stance:** Conclusions-allowed — ranked naming recommendation + recommended architecture shape.

---

## Detailed Findings

### D1 — Naming Landscape: `brain`, `gbrain`, `llm-brain`

#### Finding: `gbrain` is a hard collision with a 13-day-old Y-Combinator-CEO-backed product in the exact same category

**Confidence:** CONFIRMED
**Evidence:** [evidence/naming-landscape.md](evidence/naming-landscape.md) Finding 1, [evidence/trademark-registry-audit.md](evidence/trademark-registry-audit.md)

[GBrain](https://github.com/garrytan/gbrain) launched on April 9–10, 2026 under MIT license, authored by [Garry Tan](https://www.ycombinator.com/people/garry-tan) (CEO of Y Combinator). Multiple independent sources confirm scale and positioning:

- [Gamgee.ai coverage](https://gamgee.ai/blogs/garry-tan-gbrain-ai-memory-system/) frames it as "The Memex We Were Promised"
- [Fenado.ai architectural walkthrough](https://fenado.ai/news/technology/garry-tans-gbrain-leverages-git-and-postgres-for-robust-multi-agent-ai-memory) describes a three-layer architecture: Git-based Brain Repo (markdown as source of truth) + GBrain Retrieval (Postgres + pgvector hybrid search) + AI Agent Skills layer
- [Little Might explainer](https://www.littlemight.com/g-brain/) confirms the "g" stands for "Garry"
- D4 confirms it installs as `npm install -g gbrain` with subcommands `gbrain init/import/query` — direct subcommand-namespace collision if Open Knowledge uses `ok gbrain`
- A derivative project — [huytieu/COG-second-brain](https://github.com/huytieu/COG-second-brain) — already explicitly brands itself as "inspired by Garry Tan's gstack and gbrain"

**Implications:** `ok gbrain` reads as "Garry's brain integration inside Open Knowledge" to anyone in the AI-agent-developer space. The category, architecture, and timing alignment make this a brand-equivalent collision, not a coincidental-name one. SERP for `gbrain` is Tan-dominated. **Disqualifying.**

#### Finding: `brain` carries a live USPTO trademark family owned by TheBrain Technologies in the exact software category

**Confidence:** CONFIRMED
**Evidence:** [evidence/naming-landscape.md](evidence/naming-landscape.md) Finding 2, [evidence/trademark-registry-audit.md](evidence/trademark-registry-audit.md)

[TheBrain Technologies LP](https://www.thebrain.com) has shipped TheBrain since 1998 (per [Wikipedia](https://en.wikipedia.org/wiki/TheBrain_Technologies)) and holds multiple active USPTO registrations covering "computer software for facilitating information management, namely, a graphical user interface for use in file management" — see [Justia trademark record](https://trademarks.justia.com/759/34/the-75934504.html) and [USPTO report #74634933](https://uspto.report/TM/74634933), renewed 2018. The trademark family includes PersonalBrain™, WebBrain™, TeamBrain™.

Obsidian's tagline on [obsidian.md](https://obsidian.md) is "A second brain, for you, forever." Tiago Forte's "BUILDING A SECOND BRAIN" is a [registered US/EU trademark](https://www.buildingasecondbrain.com) covering the personal knowledge management methodology.

**Implications:** Subcommand-level trademark risk is modest (subcommands receive weaker protection than product names), but the combined brand-conflation surface is high. Any documentation, tutorial, or screencast using `ok brain` competes with TheBrain / Obsidian / BASB for SEO and mental-model space. Positioning cost exceeds the legal cost — the product gets read as a me-too entrant in a category it doesn't occupy.

#### Finding: The npm `brain*` namespace is saturated with 2025–2026 AI-memory tools

**Confidence:** CONFIRMED
**Evidence:** [evidence/naming-landscape.md](evidence/naming-landscape.md) Finding 4

Active packages published in the last year:

| Package | Description |
|---|---|
| [`@braindb/core`](https://www.npmjs.com/package/@braindb/core) | Markdown-graph content-layer database |
| [`@titan-design/brain`](https://www.npmjs.com/package/@titan-design/brain) | Developer second-brain with hybrid RAG + LLM memory extraction |
| [`@lumenlabs/lumen-brain`](https://www.npmjs.com/package/@lumenlabs/lumen-brain) | Memory management with knowledge injection |
| [`nano-brain`](https://www.npmjs.com/package/nano-brain) | Memory system with hybrid search |
| [`@mager/brainpack`](https://www.npmjs.com/package/@mager/brainpack) | AI-agent brain-portability CLI (Feb 2026) |

[`brain.js`](https://www.npmjs.com/package/brain.js) remains the dominant legacy occupant (neural-networks library). The bare `brain` package [on npm is deprecated but occupied](https://www.npmjs.com/package/brain).

**Implications:** This is the opposite of whitespace. "Brain" is the default cliché for AI-agent memory tools circa 2026 — picking it puts Open Knowledge in a lineup of five-plus lookalikes, none of which are category leaders. `brainpack` specifically occupies near-adjacent territory (CLI for AI-agent brain portability) — `ok brainpack` would be doubly confusing.

#### Finding: "Brain" metaphor in LLM tooling peaked 2022–2023 hackathon era and is in decline

**Confidence:** INFERRED
**Evidence:** [evidence/naming-landscape.md](evidence/naming-landscape.md) Finding 6

LangChain / LangGraph docs use "brain" only colloquially (e.g., [LangGraph memory docs](https://docs.langchain.com/oss/python/langgraph/memory) prose: "the MemorySaver component acts as a bridge between your agent's brain … and where its memories are stored") — never as a first-class primitive, class, or module name. No framework has adopted "Brain" as a concept. Current agent-tooling vocabulary has shifted to *memory*, *skills*, *context engineering*, *tools*, *graph*, *workspace*.

**Implications:** Naming a command `brain` in April 2026 reads as a 2022-era throwback. Garry Tan's GBrain is an exception that reinforces the rule — his usage is self-referential (`g` = Garry) and tongue-in-cheek. Joining the cliché is the opposite of a trend-aware move.

#### Finding: Industry convention for "scaffold agent-readable context" is `init`, already taken by Open Knowledge

**Confidence:** CONFIRMED
**Evidence:** [evidence/naming-landscape.md](evidence/naming-landscape.md) Finding 7

- Claude Code's `/init` "generates a starter CLAUDE.md file based on your current project structure" ([docs](https://code.claude.com/docs/en/quickstart))
- `npm init`, `cz init` (commitizen), `specify init` (GitHub spec-kit)
- Open Knowledge already ships `open-knowledge init` / `ok init` — scaffolds `.open-knowledge/` and registers MCP in `.mcp.json` (see project CLAUDE.md / AGENTS.md §Package: cli)

**Implications:** The new command performs an *adjacent but distinct* operation — it scaffolds *content* folders and agent instructions, while `ok init` scaffolds the *tool config*. The new command needs a name that (a) is clearly distinct from `init`, (b) evokes "populate the knowledge base with a sensible starter shape." See D2 Finding below: re-runnable content-scaffolders consistently get dedicated subcommands, not flags or `init` namespaces.

#### Candidate assessment summary

Full table in [evidence/naming-landscape.md](evidence/naming-landscape.md). Top-line verdicts:

| Candidate | Verdict | Primary reason |
|-----------|---------|----------------|
| `brain` | **REJECT** | TheBrain trademark + Obsidian/BASB + crowded npm + 2022-era vibe |
| `gbrain` | **REJECT — DISQUALIFYING** | Garry Tan's GBrain, identical category, 2 weeks old, 10.5k+ stars |
| `llm-brain` | **REJECT (soft)** | No hard collision but inherits every brain-soft-penalty + timestamps to LLM era |
| `seed` | **STRONG** | `db:seed` precedent, zero collision, evocative, pairs with `ok init` |
| `new` | **STRONG** | `git new` / `cargo new` / `gh repo new` convention; idiomatic |
| `pages` | **STRONG** | Grounded in OK's own vocab ("pages" already used repo-wide); zero collision |
| `scaffold` | **VIABLE** | Rails/Yeoman-familiar; mild dev-crusty vibe |
| `codex` | **REJECT** | [OpenAI Codex CLI](https://github.com/openai/codex) hard brand collision |
| `pack` | **REJECT** | `@mager/brainpack` adjacent-category CLI collision |

---

### D2 — CLI + UI Shared Implementation Patterns

#### Finding: `shadcn` CLI exposes `runInit` / `runAdd` as importable async functions — the canonical hybrid shape

**Confidence:** CONFIRMED
**Evidence:** [evidence/cli-ui-hybrid-patterns.md](evidence/cli-ui-hybrid-patterns.md), [DeepWiki shadcn CLI walkthrough](https://deepwiki.com/shadcn-ui/ui/3.1-cli-commands-reference), [shadcn CLI 3.0 + MCP changelog](https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp)

shadcn's CLI commands are exported TypeScript functions:

```
export async function runInit(cwd: string, config: Config)
export async function runAdd(components: string[], options: AddOptions)
```

Commander is a thin argv parser on top. In August 2025 shadcn 3.0 added an MCP server that invokes the same functions — quoting the [changelog](https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp): *"The MCP server exposes shadcn CLI operations as MCP tools."* One function definition, three entry points (CLI, MCP, future editor plugin).

**Implications:** This is shape (a) — **single TS module exported, consumed by multiple entry points.** No subprocess spawn, no stdout parsing, no shell quoting. Typed function, typed return. Open Knowledge's Electron main process runs Node.js at the same major version as the CLI → shape (a) applies with zero impedance.

#### Finding: Shell-out (shape b) is reserved for cross-runtime hybrids; duplication (shape d) only appears when unavoidable

**Confidence:** CONFIRMED
**Evidence:** [evidence/cli-ui-hybrid-patterns.md — Supabase + GitKraken findings](evidence/cli-ui-hybrid-patterns.md)

- **Supabase Dashboard** creates edge functions through a web UI that duplicates the `supabase functions new` logic — because the Dashboard is web-hosted (different runtime from the local CLI). Shape (d).
- **GitKraken** [deliberately rejected shell-out to `git`](https://www.gitkraken.com/blog/nodegit-libgit2) in favor of `nodegit` / `libgit2` — library-over-shell-out when the UI and tool share a runtime.
- **VS Code** built its entire extension API on `commands.executeCommand(id)` dispatching to registered TS handlers ([extension-guides/command](https://code.visualstudio.com/api/extension-guides/command)) — same pattern at scale.

**Implications:** For Open Knowledge (Electron main = Node.js = same runtime as `ok` CLI), shape (a) is strictly better. Shell-out buys nothing here — it costs subprocess lifetime management, stdout parsing, and error-surface impedance, with no isolation benefit.

#### Finding: `clig.dev` + `jmmv.dev` + mature-tool convergence: re-runnable operations get subcommands, not flags

**Confidence:** CONFIRMED
**Evidence:** [evidence/cli-ui-hybrid-patterns.md — clig/jmmv/precedent findings](evidence/cli-ui-hybrid-patterns.md)

Written heuristics from [clig.dev](https://clig.dev) and [jmmv.dev subcommand essay](https://jmmv.dev/2013/09/cli-design-subcommand-based-interfaces.html):

> *"If you've got a tool that's sufficiently complex, you can reduce its complexity by making a set of subcommands."* — clig.dev
> *"Specific cases in which flags are right are: enabling debugging features, selecting whether the output should be colored or not, specifying the number of columns in the printed data, raising the verbosity level."* — jmmv.dev

Mature-tool precedent converges:

| Tool | Scaffolder subcommand | Pattern |
|---|---|---|
| `shadcn` | `shadcn add` | noun|
| `astro` | `astro add` | noun |
| `supabase` | `supabase functions new <name>` | noun-verb |
| `gh` | `gh repo create`, `gh issue create` | noun-verb |
| `jekyll` | `jekyll new`, `jekyll new-theme` | verb, verb-noun |
| `docusaurus` | `docusaurus docs:version` | colon-namespaced verb |

**Zero mature tools** ship a re-runnable scaffolder as a flag on `init`. `init` is universally one-shot.

**Implications:** `ok brain` / `ok seed` / `ok new` — subcommand form — is the overwhelming convention. `ok init --brain` violates the "flags tune, subcommands operate" heuristic; `ok init brain` fights the one-shot `init` connotation. Subcommand wins unambiguously.

#### Finding: Idempotency UX converges on "plan → diff → confirm → apply"

**Confidence:** CONFIRMED
**Evidence:** [evidence/cli-ui-hybrid-patterns.md — shadcn/astro/Prisma idempotency findings](evidence/cli-ui-hybrid-patterns.md)

- shadcn 3.0 added a `--diff` flow and overwrite-confirmation prompt (after [issue #931](https://github.com/shadcn-ui/ui/issues/931) surfaced silent overwrites)
- `astro add` [restored explicit tsconfig diff preview](https://github.com/withastro/astro/commit/a4c0d0b4df540b23fa85bf926f9cc97470737fa1) in a recent fix
- Prisma's `generate` is [debounced with `simpleDebounce`](https://deepwiki.com/prisma/prisma/3.1-generate-command) in watch mode for re-run idempotency

**Implications:** The recommended shape is a `ScaffoldPlan` struct returned by the shared TS module:

```ts
type ScaffoldPlan = {
  created: FileCreate[]
  skipped: FileSkipReason[]
  configEdits: ConfigEdit[]
  warnings: string[]
}
```

The CLI wrapper renders ANSI diff + y/n prompt. The Electron renderer renders a React diff component + Apply button. **Identical logic; different presenters.** No silent no-op, no silent overwrite.

---

### D3 — What the Scaffolder Should Emit

#### Relationship to existing research

This dimension is **narrowed** — navigation/sidebar folder-metadata is already covered deeply by [`config-driven-folder-frontmatter/REPORT.md`](../config-driven-folder-frontmatter/REPORT.md). The delta here is specifically the *agent-readable instruction* surface.

See [evidence/agent-instruction-conventions.md](evidence/agent-instruction-conventions.md) for the full analysis.

#### Finding: `AGENTS.md` (nested) is the emerging cross-vendor standard

**Confidence:** CONFIRMED
**Evidence:** [AGENTS.md specification at agentsmd.net](https://agentsmd.net), adopted by OpenAI Codex, Google Jules / Gemini CLI, Cursor, Zed, Factory, Amp, Aider. Anthropic's Claude Code accepts `AGENTS.md` as an alternative to its proprietary `CLAUDE.md`. The spec supports nesting — `/AGENTS.md` for repo-wide, `/api/AGENTS.md` to narrow to a subtree, closer files override parents.

The Open Knowledge repo already commits to this — `CLAUDE.md` at root is a symlink to `AGENTS.md` (see persistent memory `project_claude_md_symlink.md`).

#### Finding: Cursor's `.cursor/rules/*.mdc` frontmatter is the most sophisticated scoping pattern in the ecosystem

**Confidence:** CONFIRMED
**Evidence:** [Cursor rules docs](https://docs.cursor.com/context/rules). Each `.mdc` file has YAML frontmatter controlling activation — `description`, `globs`, `alwaysApply`, plus four activation modes (Always / Auto-attached / Agent-requested / Manual). The frontmatter keys map cleanly onto "instructions for this folder, scoped by glob, addressed to an agent."

#### Recommended scaffolder output

1. **Root `AGENTS.md`** — project-wide agent-readable instructions. Matches 1P precedent.
2. **Per-top-level-folder `AGENTS.md`** — e.g. `specs/AGENTS.md`, `reports/AGENTS.md`. Matches the nested AGENTS.md convention.
3. **`config.yml` `folders:` block** — centralized per-folder metadata (title, icon, description, category). This is Shape A/B from the [config-driven-folder-frontmatter report](../config-driven-folder-frontmatter/REPORT.md).
4. **Optional:** frontmatter on per-folder `AGENTS.md` (`description`, `globs`, `alwaysApply`) — Cursor-style — so agents can reason about when to pull the instructions.

**What NOT to emit:**

- **No `INDEX.md` / `_index.md` with folder-config frontmatter** — explicitly rejected as Open Knowledge D19 anti-pattern ("shadow folder structure in files"). See [config-driven-folder-frontmatter §D19](../config-driven-folder-frontmatter/REPORT.md).
- **Not `CLAUDE.md` as primary** — emit `AGENTS.md` and symlink if Claude-specific fallback is desired.

#### Finding: No existing tool ships a CLI subcommand that *writes* agent-instruction files

**Confidence:** INFERRED (from negative search)
**Evidence:** [evidence/agent-instruction-conventions.md](evidence/agent-instruction-conventions.md). Cursor has no CLI scaffolder — only an in-IDE chat-driven rule generator. Claude Code's `/init` is a slash command *inside* the Claude Code session, not a CLI subcommand of `claude`. GitHub Copilot, Zed, Windsurf all require hand-authoring.

**Implications:** The scaffolder Open Knowledge is building is a genuinely novel affordance — no precedent to copy. Mild positive for positioning: Open Knowledge defines a new surface rather than competing with an incumbent.

---

### D4 — Trademark / Registry Landmines

See full evidence in [evidence/trademark-registry-audit.md](evidence/trademark-registry-audit.md).

| Candidate | USPTO | npm | PyPI | SERP | Overall verdict |
|-----------|-------|-----|------|------|-----------------|
| `brain` | **LIVE — TheBrain Technologies LP** (Reg 2169826 + PersonalBrain™ / WebBrain™ / TeamBrain™ family), IC 009/042 since 1998 | `brain` deprecated but occupied; namespace crowded (see D1) | `brain` occupied | OKX BRAIN cryptocurrency + TheBrain + Obsidian "second brain" | **MEDIUM-HIGH — NO** |
| `gbrain` | No filing | **Occupied — `gbrain` published by Garry Tan, installs as `npm install -g gbrain`** | Unclear | 100% Garry-Tan-dominated (1.5M+ X impressions in 24h) | **VERY HIGH — HARD NO** |
| `llm-brain` | No filing | Free | Free | Academic / neutral | **LOW — Viable on registry grounds** (but inherits D1 soft penalties) |

**Implications:** D4 independently corroborates the D1 verdict. `gbrain` is disqualifying on registry + trademark-adjacent grounds alone — Garry Tan's package is already named `gbrain` on npm and exposes its own subcommand namespace; the subcommand-within-a-subcommand reading of `ok gbrain` would be read as a Tan-branded integration. `brain` has legal exposure that's defensible for a subcommand today but would complicate any future product-identity elevation. `llm-brain` is clean on registry grounds — if the team wants to keep the metaphor, this is the least-worst `brain`-family option.

---

## Recommendation

### Naming: `ok seed` (first choice)

| Dimension | Assessment |
|-----------|------------|
| Hard collision | None. No npm bin, no USPTO mark, no PyPI, no Homebrew |
| Brand | Clean. `db:seed` (Rails/Django/Prisma) is the dominant precedent — developers know it as "populate with starter data" |
| Evocative fit | Strong. "Seed a knowledge base" maps precisely onto "plant the starter folders + instructions; agent grows it from there" |
| Pairs with `ok init` | Yes. `ok init` wires the tool; `ok seed` populates content. Clear division of labor |
| Length + typability | 4 letters, one syllable |
| Memorability | High; metaphor is widely understood |

**When to prefer `ok new` instead:** if the command's primary UX is "create a new knowledge base at `<path>`" (takes a positional target arg) rather than "populate the current directory," the `git new` / `cargo new` / `gh repo new` convention is the more idiomatic fit.

**When to prefer `ok pages` instead:** if the team wants the command to ground in Open Knowledge's own domain vocabulary over generic-CLI precedent — "pages" is already used throughout the repo to refer to markdown documents, and `ok pages` makes the command's output legible via the existing mental model.

**Fallback if keeping the `brain` metaphor is non-negotiable:** `ok llm-brain`. Accept the soft penalties (Obsidian/BASB framing, LLM-era timestamp) in exchange for preserving the metaphor. Do *not* use `ok brain` or `ok gbrain` — the landmines exceed the upside.

### Command shape: top-level subcommand

`ok seed` as a top-level subcommand, not `ok init --seed` or `ok init seed`. Per clig.dev + jmmv.dev + every mature CLI surveyed. Leaves room to grow sub-verbs later (`ok seed add <pack>`, `ok seed regenerate`, `ok seed list`).

### Architecture: shared TS module + thin wrappers

```
  packages/cli/src/seed/
    plan.ts        ← planSeed(opts): Promise<ScaffoldPlan>
    apply.ts       ← applySeed(plan, opts): Promise<ApplyResult>
    types.ts       ← ScaffoldPlan, ApplyResult, SeedOptions

  packages/cli/src/commands/seed.ts   ← Commander wrapper (ANSI diff + y/n)
  packages/desktop/src/main/ipc/seed.ts   ← Electron IPC handler (returns plan to renderer)
  packages/app/src/components/SeedDialog.tsx   ← React diff view + Apply button

  (future) packages/cli/src/mcp/tools/seed.ts   ← thin MCP wrapper (if re-introduced)
```

- **`planSeed`** is read-only — computes what would change, returns `ScaffoldPlan`. Safe to call from any surface without side effects.
- **`applySeed`** takes a plan + confirms, performs filesystem writes inside a try/catch with rollback on partial failure.
- **UI flow:** Electron "Set up my knowledge base" button → IPC → `planSeed` → renderer renders diff → user clicks Apply → IPC → `applySeed` → toast "done".
- **CLI flow:** `ok seed` → `planSeed` → ANSI diff + `? apply [Y/n]` → `applySeed` → stdout summary.
- **Idempotency:** re-running `ok seed` shows "0 files to create, 0 edits, exit 0." Matches `astro add` / shadcn `add --diff` convention.

### What the scaffolder emits (D3 synthesis)

1. Root `AGENTS.md` with project-wide agent guidance
2. Per-top-level-folder `AGENTS.md` (e.g., `specs/AGENTS.md`, `reports/AGENTS.md`, `projects/AGENTS.md`)
3. `config.yml` extension with a `folders:` block (Shape A/B per the [config-driven-folder-frontmatter](../config-driven-folder-frontmatter/REPORT.md) report)
4. Optional Cursor-style frontmatter on per-folder `AGENTS.md`

---

## Limitations & Open Questions

- **Trademark risk for `ok brain` specifically at the subcommand level** was not legally audited — a `/spec` that seriously considers `brain` despite the findings above should get counsel review. The combined brand-collision (per D1) alone is sufficient to reject without a legal question.
- **Garry Tan's GBrain trademark status** — no USPTO filing as of 2026-04-23. If he files, any derivative naming risk increases.
- **Does `seed` map cleanly to "re-runnable populate-and-regenerate"?** The `db:seed` metaphor in Rails is usually one-shot; Open Knowledge's command is meant to be re-runnable. The evidence supports `seed` as a re-runnable CLI subcommand when paired with `--diff` UX (`astro add` is re-runnable too, despite `add` historically meaning insert-once). Worth user-testing with a dev audience, out of scope here.
- **Cross-runtime MCP case** — if Open Knowledge re-introduces an MCP scaffolder tool later, it lives in the same Node.js runtime as the CLI, so shape (a) still applies. If Open Knowledge ever ships a cloud scaffolder (e.g., one-click "Set up a knowledge base" in a hosted web app), that would be the shape (d) duplication case — out of scope for this report.
- **Electron IPC shape** (synchronous `invoke` vs streaming for long-running scaffolds) — out of scope. Scaffolder runs are expected to be <1s for typical starter structure.

---

## References

### Evidence Files

- [evidence/naming-landscape.md](evidence/naming-landscape.md) — D1: `brain` / `gbrain` / `llm-brain` + alternatives, vibes, positioning
- [evidence/cli-ui-hybrid-patterns.md](evidence/cli-ui-hybrid-patterns.md) — D2: CLI+UI shared-impl shapes, subcommand vs flag, idempotency UX
- [evidence/agent-instruction-conventions.md](evidence/agent-instruction-conventions.md) — D3: AGENTS.md nested, Cursor `.mdc` frontmatter, scaffolder output shape
- [evidence/trademark-registry-audit.md](evidence/trademark-registry-audit.md) — D4: USPTO, npm, PyPI, Homebrew, domain per candidate

### Related Research

- [`reports/cli-command-name-ok-okb/`](../cli-command-name-ok-okb/REPORT.md) — top-level binary naming (`ok` vs `okb`), collision audit conventions this report inherits
- [`reports/config-driven-folder-frontmatter/`](../config-driven-folder-frontmatter/REPORT.md) — navigation/sidebar folder-metadata design space (Shape A–D), internal precedent (Fumadocs `meta.json` in `docs/`), D19 anti-pattern. **This report does NOT re-cover that ground** — it extends it with the agent-instruction surface
- [`reports/openknowledge-competitive-landscape/`](../openknowledge-competitive-landscape/REPORT.md) — Obsidian's "second brain" positioning as competitive context

### External Sources

Primary:
- [GBrain (Garry Tan)](https://github.com/garrytan/gbrain) — the disqualifying `gbrain` collision
- [TheBrain Technologies](https://www.thebrain.com) + [USPTO trademark #74634933](https://uspto.report/TM/74634933)
- [Obsidian](https://obsidian.md) + [Building a Second Brain](https://www.buildingasecondbrain.com)
- [AGENTS.md specification](https://agentsmd.net)
- [Cursor rules docs](https://docs.cursor.com/context/rules)
- [shadcn CLI 3.0 + MCP changelog](https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp) — canonical hybrid shape
- [Astro `astro add`](https://docs.astro.build/en/guides/integrations/) — idempotent scaffolder precedent
- [clig.dev](https://clig.dev) + [jmmv.dev subcommand essay](https://jmmv.dev/2013/09/cli-design-subcommand-based-interfaces.html) — subcommand-vs-flag heuristic

Secondary / context:
- [DeepWiki shadcn CLI commands reference](https://deepwiki.com/shadcn-ui/ui/3.1-cli-commands-reference)
- [Fumadocs CLI](https://fumadocs.vercel.app/docs/cli)
- [Justia trademark records](https://trademarks.justia.com)
- [LangGraph memory docs](https://docs.langchain.com/oss/python/langgraph/memory) — "brain" as informal prose, not first-class primitive
