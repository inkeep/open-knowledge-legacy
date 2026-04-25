# Evidence: Naming Landscape

**Dimension:** D1 — Naming landscape for `brain` / `gbrain` / `llm-brain` + alternatives
**Date:** 2026-04-23
**Context:** `@inkeep/open-knowledge` CLI binary `ok`. Subcommand scaffolds folder structure + AI-agent instructions + folder frontmatter for a fresh knowledge base.

---

## Key sources referenced

- https://www.npmjs.com/package/brain — deprecated npm package "brain" (neural network library, squatted)
- https://www.npmjs.com/package/brain.js — active neural net library, 300K+ weekly downloads historically
- https://www.npmjs.com/package/gbrain — stormcolor/gbrain WebGL ML lib (dormant)
- https://github.com/garrytan/gbrain — **Garry Tan (Y Combinator CEO) GBrain, released April 9-10, 2026, 5,400+ stars in 24h**
- https://gamgee.ai/blogs/garry-tan-gbrain-ai-memory-system/ — GBrain as "The Memex We Were Promised"
- https://fenado.ai/news/technology/garry-tans-gbrain-leverages-git-and-postgres-for-robust-multi-agent-ai-memory — GBrain architecture deep-dive
- https://www.littlemight.com/g-brain/ — "What Is g-brain?" explainer (notes "g" = Garry)
- https://www.thebrain.com/ — TheBrain product homepage
- https://en.wikipedia.org/wiki/TheBrain — TheBrain Technologies founded 1998
- https://trademarks.justia.com/759/34/the-75934504.html — USPTO registration #2956399 for "THE BRAIN" mark
- https://uspto.report/TM/74634933 — second USPTO mark #74634933, renewed 2018
- https://www.buildingasecondbrain.com/ — Tiago Forte "Building a Second Brain" (BASB) — registered US/EU trademark
- https://obsidian.md — "A second brain, for you, forever" (Obsidian tagline)
- https://docs.langchain.com/oss/python/langgraph/memory — LangGraph memory docs; "brain" used informally for agent graph state
- https://www.npmjs.com/package/@braindb/core — active "braindb" (markdown-graph DB), published 5 months ago
- https://www.npmjs.com/package/@titan-design/brain — active "brain" scope on npm (RAG + memory tool)
- https://www.npmjs.com/package/@lumenlabs/lumen-brain — active "lumen-brain" memory/knowledge tool
- https://www.npmjs.com/package/nano-brain — active memory/hybrid-search tool
- https://www.mager.co/blog/2026-02-21-openclaw-brain-transplant/ — `brainpack` (@mager/brainpack) CLI for AI-agent brain portability (Feb 2026)
- https://github.com/theDakshJaitly/mex — `mex` CLI, persistent project memory for AI coding agents (competitive)
- https://code.claude.com/docs/en/quickstart — Claude Code `/init` command
- https://aider.chat/docs/config.html — aider config via `.aider.conf.yml`, no `init` command
- https://github.com/huytieu/COG-second-brain — explicitly derivative ("inspired by Garry Tan's gstack and gbrain")
- https://en.wikipedia.org/wiki/Google_DeepMind — Google Brain merged April 2023; brand retired

---

## Findings

### Finding 1: `gbrain` is a hard collision with a 2-week-old, 5,400-star, YC-CEO-backed product in the EXACT same category

**Confidence:** CONFIRMED
**Evidence:** https://github.com/garrytan/gbrain, https://gamgee.ai/blogs/garry-tan-gbrain-ai-memory-system/, https://fenado.ai/news/technology/garry-tans-gbrain-leverages-git-and-postgres-for-robust-multi-agent-ai-memory

> "GBrain is an open-source personal AI knowledge management system created by Garry Tan, CEO of Y Combinator, released on April 9, 2026 under the MIT license. … Three-layer architecture: a Git-based Brain Repo (Markdown files as the human-readable source of truth), GBrain Retrieval (Postgres + pgvector with hybrid search), and an AI Agent Skills layer. … 5,400+ GitHub stars in 24 hours."

> "The Brain Repo is plain Markdown tracked in Git — not a proprietary database, not a vendor-specific format. … Every mention of a person, company, or concept becomes a typed link in a structured graph."

**Implications:** This is a **category-killing** collision, not a mild overlap. GBrain's description — "markdown files in a Git repo, agents read and write through them, typed wiki-links between entities, AI agent skills layer" — is *extensionally identical* to Open Knowledge's positioning. The "g" stands for "Garry" per multiple explainer articles; `ok gbrain` would read as "Garry's brain inside Open Knowledge" to anyone in the AI agent space, which is the entire target audience. Derivative-looking names damage credibility permanently. **DISQUALIFYING.** Also note `huytieu/COG-second-brain` already explicitly calls itself "inspired by gbrain" — the derivative framing is the default reading.

---

### Finding 2: `brain` is trademarked by TheBrain Technologies in the exact category (knowledge management software, since 1998)

**Confidence:** CONFIRMED
**Evidence:** https://trademarks.justia.com/759/34/the-75934504.html (USPTO Reg. #2956399), https://uspto.report/TM/74634933 (Reg. renewed 2018), https://en.wikipedia.org/wiki/TheBrain_Technologies

> "THE BRAIN is registered and renewed on 09 Jun 2018, and is owned by THEBRAIN TECHNOLOGIES LP. The trademark covers computer software for facilitating information management, namely, a graphical user interface for use in file management."

> "TheBrain Technologies was founded in 1998, specializing in a knowledge graph type of mind mapping software."

**Implications:** TheBrain is 28 years old, actively shipping (v14+ with AI tools), has **two active USPTO registrations explicitly covering "computer software for information management"** — the exact category Open Knowledge sits in. A subcommand is arguably lower trademark risk than a product name, but (a) the commercial-use surface is non-trivial given `ok brain` would appear in docs, tutorials, blog posts; (b) TheBrain's mark specifically covers the "GUI for file management" claim, which overlaps; (c) TheBrain's brand awareness in the PKM community is high enough that dev-tool users *will* conflate. Legal risk is modest but present. Brand-conflation risk is high. **NOT DISQUALIFYING in isolation, but combined with findings 3-4 it becomes so.**

---

### Finding 3: "Second brain" is Obsidian's core tagline AND Tiago Forte's registered US/EU trademark

**Confidence:** CONFIRMED
**Evidence:** https://obsidian.md (tagline "A second brain, for you, forever"), https://www.buildingasecondbrain.com

> "BUILDING A SECOND BRAIN is a registered trademark in multiple countries around the world. Specifically, 'BUILDING A SECOND BRAIN' is the subject of trademark registrations issued by the trademark offices of the United States, European Union, and other governing bodies around the world."

**Implications:** The whole "brain" metaphor in personal knowledge management is *defined* by Obsidian and Forte. A markdown-based knowledge tool that ships `ok brain` will be read as "me-too Obsidian clone" or "trying to ride BASB." Both are corrosive framings for a tool whose *actual* differentiator is CRDT + MCP + agent-native semantics. The category-owners have already planted flags here; following them means abdicating category-leader framing. Additionally, `ok llm-brain` is the same metaphor with an "llm-" prefix and inherits the Obsidian/BASB-derivative reading fully, plus reads as dated (see finding 6).

---

### Finding 4: The npm registry's `brain*` namespace is crowded with active AI-memory and knowledge-graph tools shipped in 2025-2026

**Confidence:** CONFIRMED
**Evidence:**
- `@braindb/core` — "markdown-graph-content-layer-database" (published 5 months ago)
- `@titan-design/brain` — "developer second brain with hybrid RAG search, LLM-powered memory extraction"
- `@lumenlabs/lumen-brain` — "memory management for saving and querying memory entries, knowledge injection"
- `nano-brain` — "memory system with hybrid search"
- `@mager/brainpack` — "platform-agnostic CLI that makes brain portability a first-class operation … auto-detecting whether you're running OpenClaw, Cursor, Claude Code, Windsurf, Cline, GitHub Copilot"
- `brain.js` — active neural networks lib

**Implications:** This is the opposite of a whitespace. "Brain" is the *default cliché* for AI-agent memory libraries right now. Choosing any brain-adjacent name puts Open Knowledge in a lineup of at-least-five lookalikes, none of which are clear category leaders — meaning no reflected-prestige even if the collision risks were lower. `brainpack` specifically is a "brain portability for AI coding agents" CLI which occupies nearly adjacent territory and was shipped February 2026 — `ok brainpack` would be doubly confusing.

---

### Finding 5: Google Brain brand is retired post-2023, but "brain" + "g-" prefix is still dangerous

**Confidence:** CONFIRMED
**Evidence:** https://en.wikipedia.org/wiki/Google_DeepMind, April 2023 merger

> "In April 2023, DeepMind merged with Google AI's Google Brain division to form Google DeepMind. … The 'Google Brain' brand is no longer actively used following the 2023 merger."

**Implications:** Google Brain is a retired brand, so `gbrain` does NOT hard-collide on brand recognition. HOWEVER, the finding-1 GBrain collision (Garry Tan) is the dominant concern, and "g-prefix" conventions in tooling often read as Google's (`gcloud`, `gsutil`, `gcp`, `gemini`) — new users could reasonably guess `ok gbrain` is a Google-branded integration. The Google-Brain-DeepMind merger is old news to AI practitioners but fresher to non-specialists; residual "Brain = Google's old AI lab" association persists in some audience segments. Combined with finding 1, `gbrain` is disqualified on both fronts.

---

### Finding 6: "Brain" as LLM-adjacent jargon peaked in 2022-2023 hackathon era and is declining

**Confidence:** INFERRED
**Evidence:** LangChain/LangGraph docs use "brain" only colloquially (e.g., "MemorySaver component acts as a bridge between your agent's brain (the graph) and where its memories are stored") — not as a formal primitive. No framework has adopted "Brain" as a class, module, or first-class concept. Hackathon 2022-2023 chatbot projects frequently used "brain" (e.g., "GPT-powered brain for X"), but 2026-era framing has moved to "memory," "context engineering," "skills," "tools," "graph."

**Implications:** Naming this command `brain` in April 2026 reads as a **2022-era throwback**. The current AI-agent vocabulary is memory / skills / context / workspace / index / graph. Garry Tan's GBrain is an exception, not a trend — his usage is self-referential (his name starts with G) and tongue-in-cheek. Joining the cliché is the opposite of a trend-aware naming move. This hurts `brain`, `llm-brain`, `gbrain` all three.

---

### Finding 7: Industry convention for "scaffold a folder for AI agent consumption" is overwhelmingly `init`

**Confidence:** CONFIRMED
**Evidence:**
- Claude Code: `/init` "generates a starter CLAUDE.md file based on your current project structure" (https://code.claude.com/docs/en/quickstart)
- npm: `npm init`
- aider: no scaffold command; uses `.aider.conf.yml` (https://aider.chat/docs/config.html)
- GitHub spec-kit: `specify init`
- commitizen: `cz init`
- Open Knowledge already has `open-knowledge init` per CLAUDE.md

**Implications:** `init` is the overwhelming default and is already taken by the existing `open-knowledge init` command (which "scaffolds `.open-knowledge/` and registers MCP server in `.mcp.json`"). The new command being named does something *adjacent but different* — scaffolds the content/folder structure itself, not the tool config. So the user needs a name that (a) is clearly distinct from `init`, (b) describes "populate the knowledge base with a sensible starter shape." The closest precedent here is `rails g scaffold` (generate scaffolding), `create-react-app` (bootstrap), and Rails `db:seed` (populate with starter data).

---

### Finding 8: `brainpack` and `mex` already occupy the "scaffold AI-agent knowledge context" CLI niche

**Confidence:** CONFIRMED
**Evidence:**
- `@mager/brainpack` (npm) — "platform-agnostic CLI … AI agent brain portability … 60 seconds"
- `github.com/theDakshJaitly/mex` — "Persistent project memory for AI coding agents. Structured scaffold + drift detection CLI."

**Implications:** Near-adjacent CLIs exist. Any name collision with `brainpack`, `mex`, or visibly derivative terms would actively weaken Open Knowledge's positioning. Rules out: `ok brainpack`, `ok pack` (ambiguous with brainpack), `ok mex`.

---

### Finding 9: `llm-brain` has no direct npm collision but inherits every other "brain" penalty plus timestamping

**Confidence:** CONFIRMED
**Evidence:** No `llm-brain` package exists on npm (search returned no direct match). `@llm-tools/embedjs` is the closest adjacent name. However, `llm-brain` carries the full Obsidian/BASB metaphor baggage (finding 3), the 2022-era vibe (finding 6), and additionally reads as "LLM era" — literally anchoring the product name to the current moment. "LLM" is already starting to read as quaint as "AI agent" tooling matures; by 2027 the term may feel like "web 2.0."

**Implications:** Free of hard collisions but carries every soft penalty plus a timestamp to a rapidly-aging term. Not disqualifying but distinctly worse than neutral alternatives.

---

### Finding 10: `ok-skills` (github.com/mxyhi/ok-skills) already exists as a skill collection repo for AI coding agents

**Confidence:** CONFIRMED
**Evidence:** https://github.com/mxyhi/ok-skills

**Implications:** Minor collision but worth noting — the `ok-` prefix in AI tooling is not uniquely Open Knowledge's. This is a low-severity concern (different org, different surface) but means `ok skills` as a subcommand could confuse users coming from that repo. Not a blocker.

---

## Candidate assessment table

| Candidate | Hard collision? | Brand collision | Trademark risk | Vibe | Memorability | Overall verdict |
|---|---|---|---|---|---|---|
| `ok brain` | Yes — TheBrain trademark in exact category | TheBrain (28 yrs), Obsidian tagline, BASB | Moderate (TheBrain mark active, category-exact) | 2022-era cliché; category derivative | Medium (commonplace) | **REJECT** |
| `ok gbrain` | **Yes — Garry Tan's GBrain, 2 weeks old, 5,400 stars, identical category** | YC CEO project; "g" = Garry | Low legal, but total brand-collision | Reads as fan-project derivative | Low (who is "g"?) | **REJECT — disqualifying** |
| `ok llm-brain` | No direct collision | Inherits Obsidian/BASB + 2022-era metaphor | Low | Dated; timestamps to LLM era | Low (awkward compound) | **REJECT** |
| `ok init` | N/A — already taken by existing command | — | — | — | High (convention) | N/A (conflict with existing) |
| `ok init-content` | No collision | None | None | Clear, descriptive, pedestrian | Low-Medium | VIABLE but dull |
| `ok scaffold` | No direct (scaffold-kit-cli exists but dormant) | Rails/Yeoman echo — mildly dated | None | Neutral; mildly dev-crusty | Medium | VIABLE |
| `ok seed` | No direct (many `seed` packages, but none category-owned) | Rails `db:seed` echo — clean metaphor | None | Clean; grounds well with "seed the KB" | High | **STRONG** |
| `ok starter` | No | None material | None | Neutral, clear | Medium | VIABLE |
| `ok kit` | No | None material | None | Generic; meh | Low-Medium | VIABLE-weak |
| `ok hydrate` | No | React/GraphQL echo (data hydration) | None | Clever but niche | Low | WEAK (too clever) |
| `ok bootstrap` | No | Twitter Bootstrap association (dated) | None | Dated; CSS-framework echo | Medium | VIABLE-weak |
| `ok pack` | **Yes — @mager/brainpack** adjacent | brainpack | None | Ambiguous | Medium | REJECT |
| `ok pages` | No | Next.js `pages` dir echo | None | Clear, grounded | High | **STRONG** |
| `ok shelf` | No | None | None | Fresh; "put books on shelf" | High | INTERESTING |
| `ok codex` | No direct (OpenAI Codex is a competing product) | **Yes — OpenAI Codex CLI** | None | **Hard brand collision** | High | **REJECT** |
| `ok world` | No | None material | None | Vague; Minecraft-y | Medium | WEAK |
| `ok room` | No | None | None | Abstract; spatial metaphor | Medium | WEAK |
| `ok desk` | No | None | None | Fresh; mental model of "arrange your desk" | Medium-High | INTERESTING |
| `ok workspace` | No direct (VS Code "workspace" association) | VS Code | None | Clear, grounded, developer-native | High | **STRONG** |
| `ok layout` | No | CSS/layout echo | None | Clear but mixed metaphor (visual vs structural) | Medium | VIABLE |
| `ok shape` | No | None | None | Abstract; may not land | Low-Medium | VIABLE-weak |
| `ok kb-init` | No | None | None | Descriptive, pedestrian | Medium | VIABLE |
| `ok new` | No | `git new` / `cargo new` echo | None | Clean, idiomatic | High | **STRONG** (if UX fits) |
| `ok scaffold-kb` | No | None | None | Explicit | Medium | VIABLE |
| `ok seed-kb` | No | None | None | Explicit | Medium | VIABLE |

---

## Recommended top candidates with reasoning

### 1. `ok seed` (top pick for evocativeness)
- **Zero hard collisions.** `db:seed` is the dominant precedent (Rails/Django/Prisma) — developers know "seed" as "populate with starter data." Clean metaphor for populating a knowledge base.
- **Evokes the right mental model.** "Seed a knowledge base" maps onto "plant the starter folders + instructions; it grows from here." Matches the MCP/agent-native framing — an *agent* reads the seed structure and extends it.
- **Short, memorable, typeable.** Four letters.
- **No brand baggage.** Doesn't echo Obsidian, TheBrain, GBrain, BASB, Google, or any dated hackathon cliché.
- **Pairs well with existing `ok init`.** `ok init` wires the tool; `ok seed` populates content. Clear division of labor.

### 2. `ok new` (top pick for conventionality)
- Follows the `git new`, `cargo new`, `gh repo new` convention — universally familiar.
- Three letters, zero ambiguity about intent.
- If the subcommand's ergonomics fit a "create a new knowledge base here" framing (as opposed to "populate an existing one"), this is the shortest-path, most-predictable name.
- Risk: may collide semantically with the existing `ok init` (both create things). Works best if `init` is retired or if `ok new` clearly takes a target path argument.

### 3. `ok pages` (top pick for domain-specific grounding)
- Grounds in the existing domain vocabulary — Open Knowledge docs already call individual markdown files "pages" (see MCP tool response wording, `previewUrl`, page-title extraction logic).
- Zero collision. Next.js `pages/` directory is adjacent but different context (framework config, not CLI).
- Makes the command's output legible: `ok pages` → "scaffolds the page structure."
- Drawback: doesn't convey "folder layout + instructions + frontmatter" as clearly as `seed`.

### 4. `ok scaffold` (top pick for tooling-convention)
- Rails/Yeoman-familiar. Unambiguous: "set up the scaffolding."
- Zero hard collision (`scaffold-kit-cli` on npm is dormant 3yr+).
- Slight dev-crusty vibe — feels 2015-era — but that's a mild penalty, not a blocker.
- Honest about what it does: creates boilerplate/scaffolding.

### 5. `ok desk` (dark horse — worth considering if the brand wants a fresh metaphor)
- No existing brand, category, or trademark collision.
- Evokes "set up your work surface" — which maps cleanly onto the command's purpose.
- Differentiates from Obsidian/TheBrain/GBrain's "brain/mind/graph" cliché.
- Risk: too cute; may not survive a quick "what does this command do?" skim test.

**Avoid:** `brain`, `gbrain`, `llm-brain`, `pack`, `brainpack`, `codex`, `hydrate`, `world`, `room`, `shape`, `kit`.

---

## Negative searches

- Searched USPTO for "gbrain" trademark → no registration (Garry Tan hasn't filed; the mark "THE BRAIN" is owned by TheBrain Technologies)
- Searched npm for `ok-brain` → NOT FOUND (namespace free but inheriting every "brain" penalty)
- Searched npm for `brain-kb` → NOT FOUND
- Searched for LangChain/LangGraph formal use of "brain" as class/module → NOT FOUND (only informal prose)
- Searched for aider `init` command → NOT FOUND; aider has no scaffold command, uses YAML config only

---

## Gaps / follow-ups

- **TheBrain trademark infringement risk for subcommands specifically.** Subcommand names generally receive weaker trademark protection than product names, but a full legal opinion was outside this scope. If `ok brain` is seriously considered, get counsel review. Recommendation still: don't — the brand-collision on *top of* the legal-risk kills it.
- **Garry Tan's GBrain trademark plans unknown.** No USPTO filing visible as of 2026-04-23. If he files, `gbrain` becomes doubly untenable. Not currently filed → low *legal* risk, but the finding-1 brand collision alone is disqualifying.
- **User-testing the top-3 names (`seed` / `new` / `pages`).** This report provides the evidence basis, but "which name resonates with agent developers in 2026" benefits from a 30-dev Twitter poll or equivalent. Out of scope here.
- **Command UX decision (`ok seed .` vs `ok seed <path>` vs `ok new <name>`) interacts with naming.** If the command always acts on CWD, `ok seed` reads clean. If it takes a `<name>` arg, `ok new <name>` is the more idiomatic choice.
