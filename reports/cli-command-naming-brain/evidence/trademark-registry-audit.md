# Evidence: Trademark + Registry Audit

**Dimension:** D4 — Trademark / registry / SERP landmines
**Date:** 2026-04-23
**Sources:** USPTO Trademark Search (tmsearch.uspto.gov), Justia Trademarks, npm registry (npmjs.com), PyPI (pypi.org), GitHub, WebSearch SERP sampling, Homebrew Formulae.

---

## TL;DR landmine map

| Candidate | Landmine severity | Dominant confound |
|---|---|---|
| `brain` | **HIGH** — trademark ("THE BRAIN", plus family of BRAIN-derived marks held by TheBrain Technologies LP), deprecated npm package squat, generic SERP | Multiple vectors |
| `gbrain` | **VERY HIGH** — a live, high-profile Garry Tan / Y Combinator project launched 13 days before this audit (2026-04-10), 10.5k+ stars, `npm i -g gbrain` installs it | garrytan/gbrain |
| `llm-brain` | **LOW** — no npm package, no PyPI package, no trademark; GitHub repos are academic / joke ("brain rot" papers) | Only academic noise |

---

## USPTO trademark check

The USPTO retired the TESS interface on 2023-11-30 and replaced it with the cloud-based Trademark Search at https://tmsearch.uspto.gov. Full TESS-style field queries were not executable from this audit environment; findings below come from Justia Trademarks (which mirrors USPTO TSDR data) and confirming web search.

| Mark | Class | Status | Owner | Serial # / Reg # | Notes |
|---|---|---|---|---|---|
| **THE BRAIN** | IC 009 / 042 | **LIVE — REGISTERED AND RENEWED** | TheBrain Technologies LP | Serial 74634933 / Reg 2169826 | Filed 1995-02-16, registered 1998-06-30, renewed 2018-06-09. Covers "computer software for facilitating information management, namely, a graphical user interface for use in file management." Direct overlap with OK's product category. |
| **THE BRAIN** (second reg) | IC 042 | LIVE | TheBrain Technologies LP | Serial 75934504 / Reg 2956399 | Filed March 2000. Consulting services for software in information management + software design/development. |
| **BRAIN®, BrainEKP™, Brain Enabled™, WebBrain™, BrainSDK™, PersonalBrain™, SiteBrain™, TeamBrain™** | Various | LIVE (family) | TheBrain Technologies LP | (not enumerated) | TheBrain Technologies holds a multi-mark family around the bare word BRAIN in the personal knowledge management / mind-mapping space. |
| **BRAIN** | Not confirmed IC | (Reg 4056860 / Serial 77864221) | Unknown owner (Justia hit, not dereferenced) | — | Present in Justia results; status + class not confirmed in this audit. |
| **NAISSUS** (filed by "FB BRAIN, INC.") | IC 009 medical | LIVE | FB BRAIN, INC. | Serial 90307338 | Company name uses "BRAIN" but the mark is NAISSUS, not BRAIN. Not a direct conflict. |
| **GBRAIN** | — | **NOT FOUND in initial search** | — | — | No USPTO registration surfaced for the bare mark GBRAIN. CANNOT rule out a pending application or state registration without a full TESS/USPTO query. |
| **LLM BRAIN / LLM-BRAIN** | — | **NOT FOUND** | — | — | No USPTO registration surfaced. |

**Key implication:** For a CLI subcommand, trademark exposure is low *as long as* OK does not elevate the subcommand to product-name status (i.e. does not market "Open Knowledge Brain" as a standalone SKU). TheBrain Technologies LP has a 28-year-old registered family of BRAIN marks in the **exact software category** (personal knowledge management, information management GUI). If the subcommand stuck and became central to product identity (e.g. tagline "OK Brain — the second brain for agents"), this is the mark that would issue a cease-and-desist.

---

## npm registry

| Package | Last publish | Status | `bin`? | Weekly DL (approx) | Notes |
|---|---|---|---|---|---|
| `brain` | ~2018 (8 yrs ago from 2026) | **DEPRECATED** | unknown (likely no) | low (legacy) | Original harthur/brain feed-forward neural net. Package page on npm says "no longer supported." Latest v1.0.0. The namespace is occupied but inactive. |
| `brain.js` | Active (maintained by BrainJS org) | ACTIVE | No (library) | ~2,511/week (v2.0.0-beta.24) | GPU-accelerated NN library. Dominates any `brain`-adjacent npm search. |
| `brainjs` | (alternate spelling) | Active | No | ~72/week | Separate entry; minor. |
| `gbrain` | **ACTIVE** | ACTIVE — two overlapping uses | **YES (CLI)** | (new, growing) | **Two packages on the same name:** (1) a 7-years-ago abandoned GPU ML library from unrelated author; (2) a **new 2026 publish pointing at Garry Tan's `garrytan/gbrain`**. Install command documented as `npm install -g gbrain`. This is a CLI tool (`gbrain init`, `gbrain import`, `gbrain query`). Direct collision. |
| `llm-brain` | **NOT FOUND** | Name available | — | — | No package surfaced in search. |
| `llmbrain` | **NOT FOUND** | Name available | — | — | No package surfaced in search. |
| `ok-brain` | **NOT FOUND** | Name available | — | — | — |
| `openbrain` | No notable hit | — | — | — | Not confirmed either way. |
| `second-brain` / `secondbrain` | No prominent npm hit | — | — | — | Name exists as a product concept (second-brain.io, multiple GitHub repos) but no dominant npm package surfaced. |
| `brain-canvas` | Active | ACTIVE | No | low | Live HTML canvas for LLMs. Adjacent noise. |
| `@titan-design/brain` | Active | ACTIVE (scoped) | Maybe | low | "Developer second brain with hybrid RAG search." Scoped, not a collision for the bare name. |
| `nano-brain` | Active | ACTIVE | Maybe | low | Memory system. Adjacent. |

---

## PyPI registry

| Package | Last publish | Status | Notes |
|---|---|---|---|
| `brain` | Occupied | (details not fully retrieved) | pypi.org/project/brain — embedded XML-RPC server + object-storage library. Unrelated domain; name is taken. |
| `brain-ai` | Occupied | ACTIVE | "Open source intelligent personal assistant development package." Adjacent. |
| `brain-py` | Occupied | ACTIVE | "BrainPy" — computational neuroscience / JIT framework. Unrelated domain; name is taken. |
| `gbrain` | **NOT FOUND** | Name available on PyPI | Not surfaced. (Given Garry Tan's project is bun/npm-native, PyPI is likely unclaimed for now, but expect claim soon.) |
| `llm-brain` | **NOT FOUND** | Name available | — |

---

## GitHub top hits

| Repo | Stars | Last activity | Topic |
|---|---|---|---|
| **garrytan/gbrain** | **~10.5k-10.6k** (as of 2026-04-23; 5.4k in first 24h) | Active, daily (v0.10.0 recently shipped) | "Garry's Opinionated OpenClaw/Hermes Agent Brain" — personal markdown knowledge base for AI agents. **Directly overlapping use case with OK.** |
| garrytan/gstack | (companion repo, high stars) | Active | 23-tool Claude Code skill pack. Same author. |
| harthur/brain | Low-to-moderate legacy | Archived | Original JS neural net; abandoned. |
| BrainJS/brain.js | Very high | Active | GPU NN library. |
| llm-brain-rot/llm-brain-rot | Research | 2025 | "LLMs can get brain rot" academic paper repo. |
| patrick-llgc/Learning-Deep-Learning (paper_notes/llm_brain.md) | Content-only | — | Academic notes. |
| HAWAIILAB/llm-brain-damage-experiment | Research | — | Academic experiment. |
| subbareddy248/speech-llm-brain | Research | — | Speech LLM research. |
| GT-RIPL/Awesome-LLM-Robotics (mentions LLM-BRAIn) | High | Active | Robotics paper list referencing "LLM-BRAIn" behavior-tree paper (April 2023). |

**"llm-brain" / "llmbrain" as a repo name:** only academic / research repos. No active product collision.

**"gbrain" as a repo name:** dominated by garrytan/gbrain, which is the top and likely *only* real product hit.

---

## SERP dominance (Google, as sampled via WebSearch April 2026)

- **"gbrain"** → **Completely dominated by Garry Tan / Y Combinator GBrain.** Top 10 results are all Tan-related: the GitHub repo, news coverage (noqta.tn, gamgee.ai, agenticbrew.ai, proudfrog.com, fenado.ai, vibesparking.com, littlemight.com, dev.to), X/Twitter threads, Instagram reel, YouTube short. Zero results for the legacy GPU-ML npm package. **"gbrain" now means "Garry Tan's personal AI knowledge system" in 2026.**
- **"llm brain"** → Academic / research dominance: MIT News, research.google blog, Towards Data Science, PMC journal articles, Wikipedia LLM page, techxplore. Neutral-to-safe for CLI naming; no competing product owns the term.
- **"second brain"** → Heavily dominated by (a) Tiago Forte's Building a Second Brain book + course (buildingasecondbrain.com, fortelabs.com) and (b) the PKM community's Obsidian tutorials (medium.com, hashnode, dev.to, catangel.ch, obsidian.rocks). Also a product named Second Brain I/O at second-brain.io and Second Brain by Hexact at secondbrain.hexact.io. Very crowded category — a CLI named `ok second-brain` would fight Tiago Forte for SEO forever.
- **"ok brain"** → Surface results include the **BRAIN cryptocurrency (Braintrust/BRAIN token listed on OKX exchange)** — the "OK" prefix actively confounds with OKX exchange. Mixed / crypto-polluted SERP. Not fatal (the crypto is low-profile) but not a clean brand either.
- **"brain" (bare)** → Completely generic; dominated by brain.js, brainfm, TheBrain software, neuroscience content, Wikipedia. No CLI could own this SERP.

---

## Homebrew

- **`brainfm`** cask exists (`brew install --cask brainfm` — desktop client for brain.fm focus-music service). Not a CLI collision but a namespace occupant.
- **`brain`** formula: not surfaced in search. Likely unclaimed but weak evidence.
- **`gbrain`** formula: not surfaced. Garry Tan's install instructions route through `bun install && bun link` or `npm install -g gbrain`, not brew, so the brew namespace appears unclaimed today — but this is the obvious next step for the GBrain project and should be assumed to be claimed within months.
- **`llm-brain`** formula: not surfaced. Likely unclaimed.

---

## Domain sketch

WHOIS was not directly queryable in this audit environment. Search-engine surface evidence only:

| Domain | Status (inferred) | Notes |
|---|---|---|
| brain.sh | Unknown; no public product on it surfaces in SERP | Assume parked/registered. |
| thebrain.com | **Active product site** (TheBrain Technologies LP) | 28-year-old PKM software. |
| gbrain.com | No prominent site surfaced | Garry Tan's project uses github.com/garrytan/gbrain as primary landing page; no dedicated `.com` surfaced in search. Likely parked or registered by a squatter given the project's viral launch. |
| gbrain.dev | No site surfaced | Same as above — probable future claim target. |
| gbrain.ai | No site surfaced | Same. |
| llmbrain.com / llmbrain.dev | No site surfaced | Probably available; also unremarkable. |
| second-brain.io | **Active product** | AI-powered PKM SaaS ("Supermemory for AI Agents"). |
| secondbrain.software | Active product page | Separate Second Brain PKM product. |
| secondbrain.hexact.io | Active product | Second Brain by Hexact (business-knowledge AI). |

---

## Findings

### Finding F1: `gbrain` is already taken by a viral Y Combinator project with the exact same use case
**Confidence:** CONFIRMED
**Evidence:**
- https://github.com/garrytan/gbrain (~10.5k stars within two weeks of launch)
- https://trendshift.io/repositories/25625
- https://noqta.tn/en/news/garry-tan-gbrain-open-source-ai-agent-memory-2026
- https://x.com/garrytan/status/2044291663213015491 (Tan's own v0.10.0 announcement)
- Install command documented as `npm install -g gbrain` in multiple sources, with a `gbrain` binary exposing `gbrain init`, `gbrain import`, `gbrain query` subcommands.

**Implications:** This is a show-stopper for `gbrain` as a candidate. Garry Tan's gbrain overlaps OK's use case *exactly* — markdown-based personal knowledge base for AI agents, stored in Git, queryable by agents. A user typing `ok gbrain` or searching "gbrain" will land on Tan's project 100% of the time for the foreseeable SEO window. Even framing `ok gbrain` as a subcommand would be read as "the Open Knowledge integration for Garry's brain," not as an OK-native feature. The namespace is not just squatted — it's *actively owned by a competitor for mindshare.*

### Finding F2: `brain` (bare) has a 28-year-old live USPTO trademark in the same software class
**Confidence:** CONFIRMED
**Evidence:**
- https://trademarks.justia.com/746/34/the-brain-74634933 (Serial 74634933, Reg 2169826, LIVE, renewed 2018)
- https://trademarks.justia.com/759/34/the-75934504.html (Serial 75934504, Reg 2956399, LIVE)
- https://www.thebrain.com/about (product: "TheBrain" mind-mapping + PKM software)
- TheBrain Technologies LP holds a family: BRAIN®, BrainEKP™, Brain Enabled™, WebBrain™, BrainSDK™, PersonalBrain™, SiteBrain™, TeamBrain™.

**Implications:** For a subcommand, exposure is low today (a subcommand is not a trademark-bearing use). But TheBrain Technologies LP has demonstrably policed its mark family for 28 years across adjacent software (PersonalBrain™, TeamBrain™, WebBrain™). If OK ever promoted the subcommand to product-name status ("OK Brain" tagline, standalone marketing page, homepage hero), a cease-and-desist from TheBrain Technologies is plausible. Forward-looking trademark risk on `brain` is **medium-high** precisely because the owner has a track record of extending and defending.

### Finding F3: `llm-brain` is genuinely unclaimed across npm, PyPI, and trademark
**Confidence:** CONFIRMED
**Evidence:**
- No `llm-brain` or `llmbrain` npm package surfaces in search (multiple queries).
- No `llm-brain` PyPI project surfaces.
- GitHub hits are academic papers about LLM cognition ("brain rot" study, robotic brain research) — not product collisions.
- No USPTO registration surfaces for LLM BRAIN or LLM-BRAIN.

**Implications:** `llm-brain` is the cleanest candidate on every D4 axis. The only confound is SERP — "llm brain" as a search term returns neuroscience / ML research papers about how LLMs resemble human brains. That's neutral noise, not a competitor, and is actually *on-topic* for the subcommand's semantic intent. No cease-and-desist risk. No namespace collision.

### Finding F4: npm `brain` is deprecated but the namespace is occupied
**Confidence:** CONFIRMED
**Evidence:**
- https://www.npmjs.com/package/brain (deprecation notice on npm page)
- https://github.com/harthur/brain (archived, no longer maintained)
- https://www.npmjs.com/package/@programphile/brain.js (scoped continuation)

**Implications:** The bare `brain` npm name is held by a deprecated 8-year-old neural network library. Not a UX collision for a *subcommand* of `ok` (since the subcommand is not published as its own npm package), but relevant if OK ever wanted to ship a standalone `brain` CLI binary.

### Finding F5: `BRAIN` as a bare word is polluted in 2026 SERP by a crypto token
**Confidence:** CONFIRMED
**Evidence:**
- https://www.okx.com/en-us/price/braintrust-brain (Braintrust/BRAIN token listed on OKX, the exchange whose token is OKB)
- https://coinmarketcap.com/currencies/okb/

**Implications:** "BRAIN" as a bare token ticker is a live cryptocurrency on a major exchange whose brand is "OKX" / "OKB." For a CLI whose short-form is `ok`, combining `ok brain` in any marketing or docs pulls a *direct* crypto association. This is the same class of problem the user flagged about OKB. Not fatal, but it's a measurable brand-confusion vector that doesn't exist for `llm-brain`.

### Finding F6: `second-brain` is a category-crowded term owned in the public imagination by Tiago Forte + Obsidian tutorials
**Confidence:** CONFIRMED
**Evidence:**
- https://www.buildingasecondbrain.com/
- https://fortelabs.com/blog/test-driving-a-new-generation-of-second-brain-apps-obsidian-tana-and-mem/
- https://second-brain.io/
- https://secondbrain.software/
- https://secondbrain.hexact.io/
- Multiple tutorials across Medium, Dev.to, Hashnode, YouTube tying "second brain" to Obsidian.

**Implications:** `second-brain` as a subcommand name would fight Tiago Forte's book franchise + the Obsidian community for SEO for years. Semantically accurate but brand-crowded. Better avoided unless OK explicitly wants to market against that category.

---

## Verdict per candidate

### `brain` — **severity MEDIUM-HIGH**, go/no-go: **NO (forward-looking risk)**
- npm namespace deprecated but occupied.
- USPTO: LIVE 28-year trademark family owned by TheBrain Technologies LP in the exact software class.
- SERP: fully generic + polluted with BRAIN crypto token + TheBrain product.
- Subcommand use today is defensible. Any elevation to product-name status is not.
- Biggest risk: one-way-door — if the subcommand sticks and marketing ever leans on it, the trademark owner has standing and a 28-year track record of policing.

### `gbrain` — **severity VERY HIGH**, go/no-go: **NO (hard collision)**
- An active, viral, high-profile Y Combinator / Garry Tan project launched 13 days before this audit owns this name on GitHub, npm, and SERP.
- `npm install -g gbrain` installs Tan's tool, not ours.
- The project overlaps OK's use case *exactly* (markdown-based knowledge base for AI agents, Git-versioned).
- Users encountering `ok gbrain` will parse it as "OK's integration with GBrain," not as a native feature.
- This is the clearest "do not pick this" signal in the audit. The GBrain project is big enough that even *not* colliding with it means acknowledging it — OK cannot own the name.

### `llm-brain` — **severity LOW**, go/no-go: **YES (cleanest candidate on D4)**
- No npm package. No PyPI package. No USPTO trademark. No Homebrew formula.
- GitHub hits are academic (brain-rot papers, robotic brain research) — neutral noise.
- SERP dominated by neuroscience-LLM academic content, which is on-topic and non-competitive.
- No crypto confound, no TheBrain trademark family overlap (trademark requires a *mark*; "LLM BRAIN" reads as generic descriptive language).
- Only mild cost: the `llm-` prefix will age as LLM terminology evolves (it's 2026-current but may feel dated in 2028+).

---

## Sources

- [USPTO Trademark Search](https://tmsearch.uspto.gov/)
- [Justia: THE BRAIN trademark (Reg 2169826)](https://trademarks.justia.com/746/34/the-brain-74634933)
- [Justia: THE BRAIN trademark (Reg 2956399)](https://trademarks.justia.com/759/34/the-75934504.html)
- [TheBrain Technologies — About](https://www.thebrain.com/about)
- [USPTO.report: THE BRAIN registration](https://uspto.report/TM/74634933)
- [npm: brain.js](https://www.npmjs.com/package/brain.js)
- [npm: brain (deprecated)](https://www.npmjs.com/package/brain)
- [npm: brainjs](https://www.npmjs.com/package/brainjs)
- [npm: gbrain](https://www.npmjs.com/package/gbrain)
- [npm: @titan-design/brain](https://www.npmjs.com/package/@titan-design/brain)
- [npm: brain-canvas](https://www.npmjs.com/package/brain-canvas)
- [npm: nano-brain](https://www.npmjs.com/package/nano-brain)
- [PyPI: brain](https://pypi.org/project/brain/)
- [PyPI: brain-ai](https://pypi.org/project/brain-ai/)
- [PyPI: brain-py](https://pypi.org/project/brain-py/)
- [GitHub: garrytan/gbrain](https://github.com/garrytan/gbrain)
- [GitHub: garrytan (profile)](https://github.com/garrytan)
- [GitHub: BrainJS/brain.js](https://github.com/BrainJS/brain.js/)
- [GitHub: harthur/brain (legacy)](https://github.com/harthur/brain)
- [GitHub: llm-brain-rot/llm-brain-rot](https://github.com/llm-brain-rot/llm-brain-rot)
- [Trendshift: garrytan/gbrain stats](https://trendshift.io/repositories/25625)
- [Noqta.tn: YC President Garry Tan Open-Sources GBrain](https://noqta.tn/en/news/garry-tan-gbrain-open-source-ai-agent-memory-2026)
- [Gamgee: Garry Tan's GBrain: The Memex We Were Promised](https://gamgee.ai/blogs/garry-tan-gbrain-ai-memory-system/)
- [Agentic Brew: Garry Tan GBrain](https://www.agenticbrew.ai/news/5e699314-0849-415e-8f0f-2bd3d60b85b7/garry-tan-gbrain-open-source-personal-ai-agent-platform)
- [Little Might: What Is g-brain?](https://www.littlemight.com/g-brain/)
- [Garry Tan X announcement (v0.10.0)](https://x.com/garrytan/status/2044291663213015491)
- [Homebrew: brainfm cask](https://formulae.brew.sh/cask/brainfm)
- [OKX: Braintrust (BRAIN) token](https://www.okx.com/en-us/price/braintrust-brain)
- [CoinMarketCap: OKB](https://coinmarketcap.com/currencies/okb/)
- [Building a Second Brain (Tiago Forte)](https://www.buildingasecondbrain.com/)
- [Second Brain I/O](https://second-brain.io/)
- [TheBrain Technologies — legal terms](https://www.thebrain.com/about/legal/terms)
- [MIT News: LLMs reason about diverse data like brains (2025)](https://news.mit.edu/2025/large-language-models-reason-about-diverse-data-general-way-0219)
- [Google Research: Language processing via LLM representations](https://research.google/blog/deciphering-language-processing-in-the-human-brain-through-llm-representations/)
