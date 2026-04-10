---
title: "llms.txt, Content Negotiation, and the Agent-Readable Web (2025-2026)"
description: "Landscape assessment of how the web is adapting to serve content to AI agents. Covers the llms.txt spec and adoption reality, content negotiation via Accept: text/markdown, Cloudflare Markdown for Agents, docs framework implementations (Fumadocs, Mintlify, Fern, Docusaurus), consumption evidence from server logs, the emerging layered agent-readable stack, the relationship to local-first knowledge platforms with walkable index files, Stripe's pioneering instructions pattern — embedding LLM behavioral directives in llms.txt as a static-file system prompt, and the structural compatibility between auto-generated _index.md files and the llms.txt format — enabling zero-transformation publishing from local knowledge bases to agent-readable web."
createdAt: 2026-04-07
updatedAt: 2026-04-05
subjects:
  - llms.txt
  - Jeremy Howard
  - Cloudflare
  - Vercel
  - Mintlify
  - Fern
  - Fumadocs
  - GitBook
  - Docusaurus
  - Karpathy
  - Stripe
  - AGENTS.md
  - Agent Skills
  - MCP
  - IETF AIPREF
  - IAB Tech Lab
  - CoMP
  - Hugo
topics:
  - llms.txt adoption
  - content negotiation
  - agent-readable web
  - markdown for agents
  - documentation delivery
  - agent discovery
  - AI content permissions standards
  - LLM instructions pattern
  - llms.txt compatibility
---

# llms.txt, Content Negotiation, and the Agent-Readable Web (2025-2026)

**Purpose:** Map how the web is adapting to serve content to AI agents — the standards, the adoption reality, the implementations across docs frameworks, and how these web-facing patterns relate to local-first knowledge platforms with walkable index files.

---

## Executive Summary

The web is developing a layered architecture for agent-readability, but adoption is radically asymmetric: **publishing is widespread, consumption is near-zero.** ~10% of surveyed websites publish llms.txt (~30K of 300K sampled by SE Ranking), but no major AI system auto-discovers or systematically reads it. Cloudflare launched "Markdown for Agents" (Feb 2026) enabling edge HTML-to-Markdown conversion, but only 3 of 7 tested coding agents even send `Accept: text/markdown`. The most rigorous server log study (Buytaert/Acquia, 400M requests) found llms.txt requests constituted 0.001% of traffic — all from SEO audit tools, zero from AI crawlers or answer engines.

The consumption gap has a sharp exception: **developer coding tools.** Claude Code, Cursor, and OpenCode DO send `Accept: text/markdown` and CAN consume llms.txt when manually configured. LangChain's mcpdoc MCP server provides the strongest actual consumption story — wrapping llms.txt as an MCP tool for structured documentation fetching. The pattern works for a narrow audience (developers using coding agents) even while the broader "AI crawlers will read it" premise remains unvalidated.

Docs frameworks have split into two tiers. **Hosted platforms** (Mintlify, Fern, GitBook) provide zero-config llms.txt generation + content negotiation + MCP servers. **OSS frameworks** (Docusaurus, Starlight, VitePress) rely on community plugins that generate static files at build time with no runtime content negotiation. **Fumadocs is the sole exception** — the only OSS framework with code-level content negotiation support (`isMarkdownPreferred()` + URL rewriting + remark-llms MDX-to-Markdown pipeline).

The most important finding for knowledge platforms: **llms.txt and per-folder index.md are structurally the same pattern at different scales.** Both are markdown files at well-known paths listing content with one-line descriptions. Both serve agent discovery. The difference is scope (web domain vs local folder) and delivery context (HTTP vs filesystem). A local KB's root index.md is functionally an llms.txt file. When published as a docs site, the transformation is trivial. Content negotiation is unnecessary locally because markdown IS the storage format — no HTML-to-Markdown conversion needed.

**Key Findings:**

- **llms.txt adoption is wide but shallow.** ~10% of web publishes it; effectively 0% of AI systems consume it autonomously. Developer docs is the real use case.
- **Content negotiation is becoming infrastructure.** Cloudflare provides it at the CDN level. Vercel documents it for Next.js. But only 43% of coding agents send the header, and zero AI crawlers do.
- **Fumadocs is the only OSS framework with code-level content negotiation.** `isMarkdownPreferred()`, `rewritePath()`, remark-llms pipeline. All others are build-time static file generators.
- **The consumption gap defines the space.** Publishing is a solved problem. Consumption is where the opportunity (and the failure) lies. No AI crawler reads llms.txt. No coding tool auto-discovers it. LangChain mcpdoc is the strongest bridge.
- **Stripe's "Instructions" section is the most significant llms.txt innovation.** Explicit behavioral directives ("never recommend the Charges API," "you must not call the Sources API") function as a system prompt in a static file. Stripe remains the only major adopter; Vercel extended the concept to per-page HTML via `<script type="text/llms.txt">`. No formal evaluation of impact exists, but the mechanism is sound: instructions loaded into a coding agent's context window are followed because they are in-context, not because of any protocol. The pattern maps directly to AGENTS.md (repo-scoped) and SKILL.md (skill-scoped) instructions. (See D7.)
- **llms.txt and index.md are the same pattern at different scales.** Markdown file, well-known path, one-line-per-entry with descriptions. llms.txt = web. index.md = local folder. AGENTS.md = codebase. SKILL.md = skill folder. Same philosophy everywhere: portable, agent-readable, no special runtime.
- **Auto-generated _index.md files are already llms.txt-format-compatible without trying.** The llms.txt spec (informal, not W3C/IETF) requires only an H1 + optional blockquote + optional H2 sections with `[name](url): description` lists. Our _index.md files produce exactly this structure. The divergences (relative paths, per-folder placement, extra frontmatter) do not violate the spec. Publishing bridge: root _index.md becomes /llms.txt with zero content transformation. Fern is the only platform shipping per-section hierarchical llms.txt — independently validating the per-folder _index.md pattern from the web side. (See D8.)

---

## Research Rubric

**Report Type:** Landscape Assessment
**Stance:** Factual
**Primary question:** How is the web adapting to serve content to AI agents, what's the adoption reality, and how do these patterns relate to agent-native knowledge platforms?

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | The llms.txt spec — mechanics, variants, adoption numbers, who publishes | Deep | P0 |
| D2 | Content negotiation — Accept: text/markdown, Cloudflare, Vercel, CDN mechanics | Deep | P0 |
| D3 | Docs framework implementations — Fumadocs, Mintlify, Fern, Docusaurus, others | Deep | P0 |
| D4 | Real adoption & consumption — who actually reads these files? | Deep | P0 |
| D5 | The emerging stack — llms.txt + content negotiation + skill.md + MCP as layers | Moderate | P1 |
| D6 | Relationship to local knowledge platforms — index.md and walkable indexes | Moderate | P1 |
| D7 | Stripe's Instructions Pattern — LLM steering instructions embedded in llms.txt | Deep | P0 |
| D8 | Local _index.md as llms.txt-compatible format — the zero-work publishing bridge | Moderate | P1 |

**Non-goals:** Re-covering bundling patterns (see llms-txt-consumption-patterns report). Re-covering agent skills deeply. Building implementation recommendations.

---

## Detailed Findings

### D1: The llms.txt Spec — Wide Publishing, Shallow Adoption

**Finding:** llms.txt is stable but informal (no W3C track). ~10% of the web publishes it, but this is inflated by auto-generation from CMS plugins. Real quality implementations number in the low thousands. No proven impact on AI citations.

**Evidence:** [evidence/d1-llms-txt-spec-adoption.md](evidence/d1-llms-txt-spec-adoption.md)

**The spec:** Created by Jeremy Howard (Answer.AI), September 2024. Markdown file at site root. H1 title + blockquote summary + H2 sections with markdown lists of `[Name](URL): description` links. Companion variants: `llms-full.txt` (complete content), `llms-ctx.txt` (expanded without URLs), per-page `.md` endpoints.

**Adoption by the numbers:**

| Source | Methodology | Finding |
|--------|------------|---------|
| [SE Ranking](https://seranking.com/blog/llms-txt/) | 300K domains analyzed | 10.13% adoption rate |
| BuiltWith | Crawl-based | 193K live (was 844K — inflated by Yoast auto-generation) |
| [Rankability](https://www.rankability.com/data/llms-txt-adoption/) | Top 1,000 global sites | ~0% adoption |
| [ALLMO](https://www.allmo.ai/articles/llms-txt) | 94,614 AI-cited URLs | 1 was llms.txt (0.001%) |

The core paradox: sites that benefit most (dev docs) are already well-structured. Sites that need discoverability (e-commerce, media) have no incentive because AI systems don't demonstrably use it.

**Stripe's "Instructions" innovation:** Stripe added `## Instructions for Large Language Model Agents` — a system prompt in a static file, steering LLM behavior when docs are consumed. Not part of the spec but arguably the most significant real-world llms.txt innovation. ([Source](https://dev.to/apideck/stripes-llmstxt-has-an-instructions-section-thats-a-bigger-deal-than-it-sounds-8ad))

**Spec evolution:** No formal v2. De facto extensions: Stripe's instructions section, Fern's `<llms-only>`/`<llms-ignore>` content tags, MCP pairing (GitBook auto-generates both llms.txt and MCP servers). Likely trajectory: toward per-page machine-readable context and MCP integration rather than single site-level files.

---

### D2: Content Negotiation — Infrastructure-Level but Low Adoption

**Finding:** Content negotiation via `Accept: text/markdown` is standards-compliant (RFC 7231 + RFC 7763), becoming infrastructure-level (Cloudflare CDN), but only 43% of coding agents send the header and zero AI crawlers do.

**Evidence:** [evidence/d2-content-negotiation.md](evidence/d2-content-negotiation.md)

**How it works:** Client sends `Accept: text/markdown` → server returns Markdown instead of HTML → `Vary: Accept` tells CDNs to cache separately. No new protocol — reuses HTTP content negotiation that has existed since 1997.

**Cloudflare "Markdown for Agents"** (launched Feb 12, 2026):
- Edge HTML-to-Markdown conversion, no origin changes needed
- Pro, Business, Enterprise plans (not Free)
- 2MB origin response cap
- Response headers: `x-markdown-tokens` (estimated count), `Content-Signal` (AI permissions: ai-train, search, ai-input)
- Token reduction: 80% (Cloudflare example), 99.7% (Checkly measurement)

**Vercel:** Next.js middleware pattern. Rewrite rule detects Accept header → routes to markdown endpoint. 99.4% size reduction. Also introduced "markdown sitemaps" as an alternative to XML sitemaps for agents.

**Who actually sends the header** ([Checkly, Feb 2026](https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/)):
- YES: Claude Code, Cursor, OpenCode (3/7 = 43%)
- NO: Codex, Gemini CLI, Copilot, Windsurf (4/7 = 57%)
- AI crawlers: zero send the header ([Buytaert](https://dri.es/markdown-llms-txt-and-ai-crawlers))

**The Buytaert counter-data:** Acquia hosting fleet (400M requests): "No AI crawler uses content negotiation. Not one." Crawlers discover .md files via explicit URLs, not Accept headers. GPTBot sent 34.8% of requests to .md files — discovered by URL, not content negotiation.

**Other implementations:** AWS CloudFront (DIY via CloudFront Functions + Lambda), WordPress (3+ plugins), Mintlify (native), Eleventy (community), Static Web Server (built-in), HackMD (native). Netlify: no native support. Fastly/Akamai: nothing announced.

#### D2.1: AI Content Permissions Standards — IETF AIPREF, Content-Signal, and CoMP

**Finding:** Three parallel standardization efforts are converging on how publishers signal AI content permissions. The IETF [AIPREF Working Group](https://datatracker.ietf.org/wg/aipref/about/) is the formal standards track (Proposed Standard, target August 2026). Cloudflare's Content-Signal is the de facto deployed implementation (September 2025, different naming). [IAB Tech Lab](https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/)'s CoMP is a parallel commercial negotiation protocol. None has meaningful adoption by AI systems yet.

**Evidence:** [evidence/d2-content-negotiation.md](evidence/d2-content-negotiation.md) (Standards Landscape section)

**IETF AIPREF Working Group:**

Chartered February 2025 under the Web and Internet Transport area. Co-chaired by Mark Nottingham and Suresh Krishnan. Originated from the IAB AI-CONTROL Workshop (September 2024). Participants include representatives from Mozilla, Google, Open Future, Meta, Ericsson, Anthropic, Common Crawl, and Cloudflare.

Two deliverables, both targeting **August 31, 2026** IESG submission (slipped from original August 2025 target):

| Draft | Version | Authors | What it defines |
|-------|---------|---------|----------------|
| [draft-ietf-aipref-vocab](https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/) | 05 | Paul Keller (Open Future), Martin Thomson (Mozilla) | Vocabulary: `train-ai` and `search` categories, each with allow/disallow/unknown states |
| [draft-ietf-aipref-attach](https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/) | 04 | Gary Illyes (Google), Martin Thomson (Mozilla) | Attachment: `Content-Usage` HTTP header + `Content-Usage` robots.txt rule |

The vocabulary is intentionally minimal: two categories, three states, extensible via future RFCs. Serialized as Structured Field Dictionaries (RFC 9651). Example HTTP header: `Content-Usage: train-ai=n`. Example robots.txt: `Content-Usage: train-ai=n`. The attach draft updates RFC 9309 (Robots Exclusion Protocol), adding `Content-Usage` as a new rule type alongside Allow/Disallow — creating a two-stage system where crawlability and usage preferences are independent.

Explicitly out of scope: enforcement, authentication, registries, auditing/transparency. The WG standardizes expression of preferences, not compliance.

**Cloudflare Content-Signal vs IETF Content-Usage — naming divergence:**

| Aspect | Cloudflare Content-Signal (deployed) | IETF AIPREF (draft) |
|--------|--------------------------------------|---------------------|
| Header name | `Content-Signal` | `Content-Usage` |
| Training | `ai-train` | `train-ai` |
| Search | `search` | `search` |
| RAG/grounding | `ai-input` | Not defined in vocab v05 |
| Format | robots.txt comment line | robots.txt rule + HTTP header (structured dict) |
| Values | `yes`/`no` | `y`/`n` |
| Status | Deployed (Sep 2025), CC0 license | Internet-Draft, Proposed Standard track |

Cloudflare submitted [draft-romm-aipref-contentsignals-00](https://datatracker.ietf.org/doc/html/draft-romm-aipref-contentsignals-00) (October 2025, by Michael Tremante and Leah Romm) proposing their three categories as sub-categories within the AIPREF framework. This individual submission expired April 2026 and was not adopted by the WG. The `ai-input` category (RAG/grounding) is the most significant gap — Cloudflare defines it, the IETF vocab does not (yet).

[contentsignals.org](https://contentsignals.org/) is a Cloudflare-run site describing itself as "an up-to-date guide to the IETF's proposed new AI Preferences." It provides a generator tool for robots.txt Content Signals and is released under CC0. Cloudflare customers using managed robots.txt get Content Signals applied automatically (default: search=yes, ai-train=no).

**IAB Tech Lab CoMP (Content Monetization Protocols):**

CoMP v1.0 was released for [public comment March 10, 2026](https://www.prnewswire.com/news-releases/iab-tech-lab-announces-comp-framework-to-ensure-llms-have-commercial-agreements-with-publishers-before-content-crawling-302709536.html) (comment period closed April 9, 2026). It solves a different problem than AIPREF:

- **AIPREF** answers: "What do I allow/disallow?" (preference signaling)
- **CoMP** answers: "How do we negotiate commercial access before crawling?" (licensing protocol)

CoMP is a JSON-based API protocol where AI systems send structured requests identifying themselves, their intended use (`ai-train`, `ai-input`, `ai-index`, `search`), and scope. Publishers respond with licensing URLs, content metadata, and retrieval instructions. Retrieval formats include HTML, RSS, API, MCP, NLWeb, and NewsML. CoMP explicitly assumes AIPREF-style blocking is already in place and is NOT a replacement for access controls — it is a commercial layer on top.

Key participants: Anthony Katsur (IAB Tech Lab CEO), The Weather Company, Bertelsmann, People Inc, Mobian.

**The emerging three-layer permissions model:**

| Layer | Standard | Function | Status |
|-------|----------|----------|--------|
| Vocabulary | IETF AIPREF vocab | What preferences can be expressed | Draft v05, Aug 2026 target |
| Attachment | IETF AIPREF attach | How preferences are communicated (HTTP + robots.txt) | Draft v04, Aug 2026 target |
| Commercial | IAB Tech Lab CoMP | How licensing is negotiated before access | v1.0 public comment closed |

Cloudflare's Content-Signal is a deployed precursor to layers 1+2 with different naming and broader scope (includes `ai-input`). Whether the IETF standard converges with or diverges from Cloudflare's naming remains unresolved.

**Implications for publishing platforms (S-L2 context):** A knowledge platform publishing docs should implement the `Content-Usage` robots.txt rule when the IETF draft stabilizes (August 2026 target), while supporting Cloudflare's `Content-Signal` as the interim deployed standard. The key decision is which permissions to set: most developer docs platforms will want `search=y, train-ai=n, ai-input=y` (allow search and RAG, block training) — but `ai-input` currently exists only in Cloudflare's vocabulary, not the IETF draft. CoMP is relevant only if the platform anticipates commercial licensing of content to AI providers.

---

### D3: Docs Framework Implementations — Platforms Lead, OSS Lags

**Finding:** Hosted platforms provide zero-config agent-readability. OSS frameworks rely on community plugins limited to build-time generation. Fumadocs is the sole OSS framework with runtime content negotiation.

**Evidence:** [evidence/d3-docs-framework-implementations.md](evidence/d3-docs-framework-implementations.md)

| Framework | llms.txt | llms-full.txt | Content Negotiation | MCP Server | Level |
|---|---|---|---|---|---|
| **Fumadocs** | Yes (code) | Yes (code) | Yes (Accept header + rewritePath) | No | Code-level (OSS) |
| **Mintlify** | Yes (auto) | Yes (auto) | Yes (Accept + Link + X-Llms-Txt) | No | Platform |
| **Fern** | Yes (auto) | Yes (auto, + query params) | Yes | Yes (auto) | Platform |
| **GitBook** | Yes (auto) | Yes (auto) | No (.md URLs) | Yes (auto) | Platform |
| **ReadMe** | Yes (auto) | Unconfirmed | No (.md URLs) | Yes (auto) | Platform |
| **Docusaurus** | 4+ plugins | Plugin | No | No | Plugin/build-time |
| **Starlight** | Plugin | Plugin (+small.txt) | No | No | Plugin/build-time |
| **VitePress** | 2 plugins | Plugin | No | No | Plugin/build-time |

**Fumadocs code-level detail** (verified from OSS source):
- `isMarkdownPreferred(request)` checks Accept header for text/plain, text/markdown, text/x-markdown
- `rewritePath(source, destination)` rewrites URLs to llms.mdx routes
- remark-llms plugin converts MDX AST to clean Markdown (strips imports, handles known components)
- Per-page `.mdx` endpoint returns Content-Type: text/markdown
- Ships a SKILL.md documenting its LLM-friendly features

**Fern stands out** for feature richness: `<llms-only>`/`<llms-ignore>` content tags, query param filtering (`?lang=python&excludeSpec=true`), AI analytics dashboard tracking LLM traffic by provider.

**Mintlify leads** on discoverability: sends `Link` and `X-Llms-Txt` headers on every response, prepends llms.txt index blockquote to all Markdown pages (survives context truncation).

---

### D4: Real Consumption — The Gap Persists

**Finding:** The March 2026 finding holds and is now even better evidenced. No AI system auto-discovers llms.txt. No AI crawler uses content negotiation. The strongest consumption story is manual configuration via coding tools and LangChain mcpdoc.

**Evidence:** [evidence/d4-consumption-evidence.md](evidence/d4-consumption-evidence.md)

**Six independent server log studies converge:**

| Study | Dataset | Result |
|-------|---------|--------|
| Buytaert/Acquia | 400M requests | 0.001% llms.txt, ALL from SEO tools |
| Semrush | Single site, 3 months | Zero AI bot visits to llms.txt |
| Reboot Online | 2 test domains, 3 months | Zero AI bot visits |
| SE Ranking | 300K domains | No correlation with AI citations |
| Search Engine Land | 10 sites, 180 days | 8/9 no measurable change |
| OtterlyAI | 62K AI bot visits | AI search relies on existing crawl infrastructure |

**The strongest actual consumption story:** [LangChain mcpdoc](https://github.com/langchain-ai/mcpdoc) — an MCP server that takes llms.txt URLs and exposes `fetch_docs` to coding agents. Requires manual configuration but provides structured, domain-locked documentation fetching. This is the closest thing to the "consume llms.txt programmatically" vision working in practice.

**Context7** produces llms.txt for open-source packages but does NOT consume existing llms.txt files — it uses its own crawler/indexer.

---

### D5: The Emerging Agent-Readable Stack

**Finding:** A layered architecture is converging but no single canonical document describes it. The layers are: permissions → discovery → delivery → project context → procedural knowledge → tool connectivity → agent communication.

**Evidence:** [evidence/d5-d6-emerging-stack-local-relationship.md](evidence/d5-d6-emerging-stack-local-relationship.md)

| Layer | Standard | Function |
|-------|----------|----------|
| **Permissions** | IETF AIPREF Content-Usage / Cloudflare Content-Signal / robots.txt | May I use this? |
| **Discovery** | llms.txt / index.md / AGENTS.md | What's here? |
| **Delivery** | Content Negotiation / raw markdown | Give it efficiently |
| **Project Context** | AGENTS.md / CLAUDE.md | Codebase-specific norms |
| **Procedural Knowledge** | Agent Skills (SKILL.md) | How do I do this? |
| **Tool Connectivity** | MCP | Let me interact with tools |
| **Coordination** | A2A (Google) | Let agents talk to each other |

Competing visions: "MCP for everything" (LangChain mcpdoc wraps llms.txt in MCP) vs "layered/composable" (Anthropic: skills and MCP are complementary, not competing) vs "protocol overload" (A2A + MCP + AG-UI overlapping).

Anthropic's position is explicit: "MCP provides connectivity. Skills provide procedural intelligence." They are orthogonal layers.

---

### D6: Relationship to Local Knowledge Platforms

**Finding:** llms.txt and per-folder index.md are the same pattern at different scales. Both are markdown files at well-known paths listing content with descriptions. A local KB's index.md is functionally an llms.txt file. Content negotiation is unnecessary locally because markdown IS the storage format.

**Evidence:** [evidence/d5-d6-emerging-stack-local-relationship.md](evidence/d5-d6-emerging-stack-local-relationship.md)

**Structural equivalence:**
- llms.txt: markdown file, site root, lists pages with `[Title](URL): description`
- index.md: markdown file, folder root, lists articles with `[Title](path): description`
- AGENTS.md: markdown file, repo root, lists docs with pointers
- SKILL.md: markdown file, skill folder, lists capabilities

All four are the same pattern: **a markdown file at a well-known path teaching agents what's here and how to navigate it.**

**Karpathy validates the connection directly:** "Navigating the knowledge base the way a human expert would — using a table of contents, not a vector search." His index.md files are structurally identical to llms.txt applied to a local wiki.

**Content negotiation is irrelevant locally** because the storage format IS markdown. The web needs negotiation because HTML is the default delivery format. Locally, there's nothing to negotiate — the agent reads markdown files directly.

**The publishing bridge:** When a local KB is published as a docs site (S-L2 in our architecture), the root index.md becomes the llms.txt. The per-folder index.md files become per-section llms.txt catalogs. The transformation is trivial — rename or auto-generate from the same source. Mintlify and GitBook already do this (auto-generate llms.txt from documentation structure).

---

### D7: Stripe's Instructions Pattern — LLM Steering via Static File

**Finding:** Stripe embedded explicit behavioral directives in llms.txt — a system prompt shipped as a static file. It is the only major adopter. Vercel extended the concept to per-page HTML. No formal evaluation of behavioral impact exists. The pattern is structurally identical to AGENTS.md and SKILL.md instructions, differing only in scope and delivery context — and could apply to per-folder index.md files in knowledge platforms.

**Evidence:** [evidence/d7-stripe-instructions-pattern.md](evidence/d7-stripe-instructions-pattern.md)

**What Stripe's instructions contain:** The `## Instructions for Large Language Model Agents` section uses imperative language characteristic of system prompts, not reference material:

- "Always default to the latest version of the API and SDK unless the user specifies otherwise."
- "Prioritize the Checkout Sessions API [...] and never recommend the Charges API."
- "Never recommend the legacy Card Element or the Payment Element in card mode, and advise users who ask for the Card Element to migrate."
- "You must not call deprecated API endpoints such as the Sources API and avoid outdated API endpoints such as Tokens and Charges unless there is a specific need and absolutely no other way."

The directives cover Checkout Sessions vs Charges, Payment Element vs Card Element, Setup Intents vs Sources API, Confirmation Tokens, dynamic payment methods, PCI compliance, recurring revenue, and Connect platform patterns. The specificity is what makes it machine-actionable — concrete prohibitions ("never recommend X") rather than vague guidance ("prefer modern patterns").

**Why Stripe needs this:** Stripe has accumulated 15 years of API surface area across multiple generations of payment primitives (Charges → Payment Intents → Checkout Sessions; Sources → Setup Intents; Card Element → Payment Element). LLM training data contains all of these, with deprecated patterns over-represented because they appear in more historical content. The instructions section counteracts model drift toward deprecated patterns at inference time.

**Adoption status — Stripe is alone:**

| Company | llms.txt | Instructions section? |
|---------|----------|-----------------------|
| **Stripe** | Yes | YES — detailed behavioral directives |
| **Cloudflare** | Yes | NO — structural organization only (per-service hierarchy) |
| **Anthropic** | Yes | NO — slim index linking to llms-full.txt |
| **Twilio** | Yes | NO — link index only |
| **Vercel** | Yes | NO in llms.txt; YES in HTML via `<script type="text/llms.txt">` |
| **Supabase** | Yes | NO — content dump pattern |

As the [Apideck analysis](https://www.apideck.com/blog/stripe-llms-txt-instructions-section) concludes: "Almost no one is using it yet." Only ~784 hand-curated llms.txt implementations exist (vs 800K+ auto-generated), and of those, Stripe is the sole prominent example with behavioral steering.

**Vercel's per-page extension:** Vercel proposed and shipped [`<script type="text/llms.txt">`](https://vercel.com/blog/a-proposal-for-inline-llm-instructions-in-html) — embedding LLM instructions directly in HTML. Browsers ignore unknown script types (no rendering impact). First production use: Vercel's 401 page, instructing agents to use MCP server functions to bypass deployment protection. This extends the pattern from site-scope (llms.txt) to page-scope, creating a hierarchy: site-level behavioral defaults + page-level contextual overrides. Per Vercel: "There was no need to talk to an LLM provider like OpenAI or Anthropic" — LLMs adapted immediately.

**Evidence of behavioral impact — none formal:** No published A/B tests, evaluations, or controlled experiments measure whether instructions change LLM output. Stripe's own AI agent integration benchmark (11 environments, Claude Opus 4.5 achieved 92% on full-stack tasks) does not test with vs. without the instructions section loaded. The Apideck analysis notes: "no major AI provider has confirmed their training crawlers automatically fetch llms.txt."

The real value path is inference-time: "developers manually loading it into Cursor or Claude for project context, or agent frameworks fetching it on startup." When loaded into a coding agent's context window, the instructions function as a system prompt — the agent follows them because they are in-context text, not because of any special protocol. This is the same mechanism by which AGENTS.md and CLAUDE.md work: markdown text placed where the LLM will encounter it.

**Relationship to AGENTS.md, CLAUDE.md, and SKILL.md:** The instructions pattern appears at every scope level in the agent-readable stack:

| Scope | File | Instructions mechanism |
|-------|------|-----------------------|
| Web domain | llms.txt | Stripe's `## Instructions for Large Language Model Agents` |
| HTML page | `<script type="text/llms.txt">` | Vercel's inline instructions |
| Repository | AGENTS.md / CLAUDE.md | Sits "right below the system prompt" in agent context |
| File patterns | .cursor/rules/*.mdc | Glob-scoped rules for specific file types |
| Skill folder | SKILL.md | Procedural instructions for a capability |

All share the same mechanism: markdown text placed where an LLM will encounter it, using imperative language to steer behavior. [GitHub's analysis of 2,500+ AGENTS.md files](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) found that the most effective ones use "explicit boundaries" and "concrete code examples" — precisely the qualities that make Stripe's instructions effective.

**Could per-folder index.md include instructions sections?** The pattern is structurally ready. If an index.md in a `deployment/` folder included:

```markdown
## Instructions for Agents
When working in this folder, prefer blue-green deployment patterns over rolling updates.
Always include health check endpoints. Never modify the production environment directly.
```

...the agent would follow those directives for the same reason it follows CLAUDE.md or Stripe's llms.txt — they are in-context text encountered during navigation. CLAUDE.md already supports folder-level nesting (`.claude/projects/<path>/CLAUDE.md`), and Cursor supports glob-scoped rules (`.cursor/rules/*.mdc`). A knowledge platform's per-folder index.md adding an instructions section would be a natural convergence of these patterns — scoping behavioral guidance to the content domain rather than the codebase domain.

**Decision triggers (when this matters):**
- If building a docs site for an API with deprecated endpoints, this is the highest-leverage llms.txt pattern to adopt
- If building a local knowledge platform with per-folder indexes, adding an instructions section is low-cost and potentially high-value for agent navigation quality
- If the audience is primarily coding agents (not AI crawlers), the instructions pattern is immediately effective since it operates at inference time

**Remaining uncertainty:**
- No controlled evaluation of behavioral impact exists — the mechanism is theoretically sound but empirically unvalidated
- Adoption remains at n=1 for the llms.txt variant (Stripe only) and n=1 for the HTML variant (Vercel only)
- Whether per-folder instructions in a knowledge base materially improve agent behavior over repo-level instructions (CLAUDE.md) is untested

---

### D8: Local _index.md as llms.txt-Compatible Format — The Zero-Work Publishing Bridge

**Finding:** Auto-generated `_index.md` files are structurally compatible with the llms.txt format without any deliberate alignment effort. The llms.txt spec is an informal community convention (not W3C/IETF), and its minimal format requirements — H1 + optional blockquote + optional H2 sections with `[name](url): description` lists — are exactly what `_index.md` files produce. The divergences (relative paths, per-folder placement, extra frontmatter) do not violate the spec. Fern is the only platform shipping per-section hierarchical llms.txt, independently validating the per-folder pattern from the web side.

**Evidence:** [evidence/d8-local-index-llmstxt-compatibility.md](evidence/d8-local-index-llmstxt-compatibility.md)

**How informal is the llms.txt spec?**

The llms.txt "standard" is a blog post by Jeremy Howard (Answer.AI), published September 2024, maintained through a [GitHub repository](https://github.com/AnswerDotAI/llms-txt) with community input via Discord. It is not on any standards track:

- Not a W3C Recommendation, not an IETF RFC or Internet-Draft, not an ISO standard
- No formal governance, no working group, no charter, no public review process
- No versioning scheme — the spec at [llmstxt.org](https://llmstxt.org/) is the single canonical source
- Self-describes as "a proposal": "We propose that those interested in providing LLM-friendly content add a `/llms.txt` file to their site"

This informality matters: there is no compliance authority. "Compatibility" means structural alignment with a community convention, not passing a conformance test.

**The exact format rules (from [llmstxt.org](https://llmstxt.org/)):**

| Element | Required? | Description |
|---------|-----------|-------------|
| H1 heading | **Yes** (only required element) | Project or site name |
| Blockquote | No | Short summary "containing key information necessary for understanding the rest of the file" |
| Body sections | No | "Zero or more markdown sections of any type except headings" with detailed information |
| H2 sections | No | Delimited by H2 headers, containing "file lists" |
| File list items | Per-entry: link required, description optional | `[name](url)` required, optionally followed by `: notes about the file` |
| "Optional" section | No (special semantics) | H2 titled "Optional" — URLs here "can be skipped if shorter context is needed" |

The file is "located in the root path `/llms.txt` of a website (or, optionally, in a subpath)."

**Where `_index.md` aligns with llms.txt:**

| llms.txt element | _index.md equivalent | Match? |
|---|---|---|
| H1 (project/site name) | H1 (folder name) | YES |
| Blockquote (summary) | Blockquote (folder description from meta.json) | YES |
| H2 sections with file lists | Section lists of child content | YES |
| `[name](url): description` per entry | `[title](path): description` per entry | YES |
| Markdown format | Markdown format | YES |
| Well-known path | Well-known path (folder root) | YES |

The alignment is not approximate — it is exact for all elements the spec prescribes. An `_index.md` file IS a valid llms.txt file by the spec's own minimal rules.

**Where it diverges — and why the divergences are non-violations:**

1. **Relative paths vs absolute URLs.** `_index.md` uses relative paths (`./subfolder/page.md`). Typical llms.txt files use absolute URLs. The spec requires "a required markdown hyperlink `[name](url)`" — relative paths are valid markdown hyperlinks. When published, paths are resolved to absolute URLs at deployment time, a standard SSG transform.

2. **Per-folder vs root-only.** `_index.md` exists in every folder. The spec says the file is located "in the root path `/llms.txt` of a website (or, optionally, in a subpath)." The "optionally, in a subpath" clause explicitly permits per-folder placement.

3. **Extra frontmatter fields.** `_index.md` may include YAML frontmatter or additional metadata. The spec prescribes a minimum structure, not a maximum — additional content is not prohibited.

4. **Naming convention.** `_index.md` is not named `llms.txt`. When published, the file is renamed or served at the `/llms.txt` path. This is a deployment concern, not a format incompatibility.

**The zero-work publishing bridge:**

The transformation from local `_index.md` to published llms.txt is:

1. Root `_index.md` → serve as `/llms.txt`. Content is already in the correct format.
2. Per-folder `_index.md` → serve as `/{section}/llms.txt`. Each folder catalog becomes a section-scoped llms.txt.
3. Relative paths → resolve to absolute URLs at publish time (standard SSG behavior).

What is NOT needed: no content rewriting, no format conversion, no information loss, no special tooling. The markdown structure going in is the markdown structure coming out.

**Per-folder llms.txt — is anyone else doing this?**

[Fern](https://buildwithfern.com/learn/docs/ai-features/llms-txt) is the only platform that implements hierarchical per-section llms.txt. Their documentation states: "Both files are available at any level of your documentation hierarchy (`/llms.txt`, `/llms-full.txt`, `/docs/llms.txt`, `/docs/ai-features/llms-full.txt`, etc.)." This allows agents to request section-scoped context rather than ingesting the full site index.

No other platform does this:

| Platform | Root llms.txt | Per-section llms.txt |
|---|---|---|
| **Fern** | Yes | **Yes — at any hierarchy level** |
| **Mintlify** | Yes | No — root only |
| **GitBook** | Yes | No — root only |
| **ReadMe** | Yes | No — root only |
| **OSS frameworks** | Yes (plugins) | No |

Fern's per-section llms.txt validates the same pattern that per-folder `_index.md` implements locally. The convergence is independent — Fern arrived at it from the web publishing side, our product arrived at it from the local-first knowledge base side.

**The `_index.md` naming — a deliberate design decision:**

The `_` prefix follows [Hugo's convention](https://gohugo.io/content-management/organization/) where:
- `_index.md` = **branch bundle / list page** — catalogs what's in the folder
- `index.md` = **leaf bundle / single page** — IS content

In our product, a folder can have both files without collision:
- `index.md` — human-authored content (Fumadocs renders this as the section's HTML page)
- `_index.md` — auto-generated catalog (agents read this for navigation; becomes llms.txt when published)
- `meta.json` — folder metadata (title, description, ordering)

The `_` prefix signals "infrastructure, not content." The same folder has a human face (`index.md` → HTML page) and an agent face (`_index.md` → llms.txt). When published, `_index.md` becomes the llms.txt at each level; `index.md` becomes the human-readable web page. No conflict, no collision, no special routing logic.

**Decision triggers (when this matters):**
- If publishing a local knowledge base as a docs site, the `_index.md` → llms.txt path eliminates a build step — no separate llms.txt generation needed
- If agents need scoped context (not the full site index), per-folder `_index.md` published as per-section llms.txt provides it — a pattern only Fern supports from the web side
- If evaluating llms.txt "compliance," the informal spec status means structural alignment is sufficient — there is no formal conformance to pass or fail

**Remaining uncertainty:**
- Whether any agent actively discovers and follows per-section llms.txt paths (Fern ships the capability but consumption data does not exist — same gap as root llms.txt per D4)
- Whether Mintlify, GitBook, or other platforms plan to add per-section llms.txt support
- Whether the llms.txt spec will formalize (standards track) or remain a community convention indefinitely

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **D1:** BuiltWith numbers are behind bot protection and difficult to independently verify
- **D2:** Conversion quality benchmarks (beyond token counts) for Cloudflare's edge conversion not published
- **D4:** No study specifically measures consumption by coding agents (Claude Code, Cursor) via WebFetch — all studies measure crawler/bot behavior
- **D7:** No controlled A/B test or evaluation measures whether Stripe's instructions section changes LLM output quality. The mechanism is theoretically sound (in-context instructions are followed) but empirically unvalidated at the llms.txt level
- **D8:** No consumption data exists for per-section llms.txt files (Fern ships the capability but no usage metrics are published). Whether agents actively discover and follow section-level llms.txt paths is unknown

### Out of Scope (per Rubric)
- Bundling patterns (npm, skills) — covered in existing llms-txt-consumption-patterns report
- Agent Skills specification deep dive — covered in existing research
- Implementation recommendations for our product

---

## References

### Evidence Files
- [evidence/d1-llms-txt-spec-adoption.md](evidence/d1-llms-txt-spec-adoption.md) — Spec mechanics, adoption numbers, notable publishers
- [evidence/d2-content-negotiation.md](evidence/d2-content-negotiation.md) — HTTP mechanics, Cloudflare, Vercel, CDN implementations
- [evidence/d3-docs-framework-implementations.md](evidence/d3-docs-framework-implementations.md) — Framework-by-framework feature matrix
- [evidence/d4-consumption-evidence.md](evidence/d4-consumption-evidence.md) — Server log studies, tool consumption, mcpdoc
- [evidence/d5-d6-emerging-stack-local-relationship.md](evidence/d5-d6-emerging-stack-local-relationship.md) — Layered stack, index.md ↔ llms.txt equivalence
- [evidence/d7-stripe-instructions-pattern.md](evidence/d7-stripe-instructions-pattern.md) — Stripe's Instructions section, adoption survey, Vercel inline extension, AGENTS.md/SKILL.md relationship
- [evidence/d8-local-index-llmstxt-compatibility.md](evidence/d8-local-index-llmstxt-compatibility.md) — _index.md format alignment with llms.txt spec, divergence analysis, per-section llms.txt landscape, Hugo naming convention

### External Sources
- [llmstxt.org](https://llmstxt.org/) — The llms.txt specification
- [Cloudflare Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) — Edge conversion feature
- [Cloudflare Content Signals](https://blog.cloudflare.com/content-signals-policy/) — AI permissions headers
- [Vercel Content Negotiation](https://vercel.com/blog/making-agent-friendly-pages-with-content-negotiation) — Next.js implementation
- [Checkly State of Content Negotiation](https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/) — Agent header survey
- [Dries Buytaert](https://dri.es/markdown-llms-txt-and-ai-crawlers) — Server log counter-evidence
- [SE Ranking](https://seranking.com/blog/llms-txt/) — 300K domain adoption study
- [Stripe llms.txt Instructions](https://dev.to/apideck/stripes-llmstxt-has-an-instructions-section-thats-a-bigger-deal-than-it-sounds-8ad) — Instructions section innovation
- [LangChain mcpdoc](https://github.com/langchain-ai/mcpdoc) — MCP-based llms.txt consumer
- [Mintlify Context for Agents](https://www.mintlify.com/blog/context-for-agents) — Content negotiation + discovery headers
- [Fern llms.txt](https://buildwithfern.com/learn/docs/ai-features/llms-txt) — Content tags + query params
- [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Local index.md pattern
- [Stripe "Build on Stripe with LLMs"](https://docs.stripe.com/building-with-llms) — Stripe's official LLM integration page
- [Stripe llms.txt](https://docs.stripe.com/llms.txt) — The actual llms.txt file with Instructions section
- [Apideck: Stripe Instructions Analysis](https://www.apideck.com/blog/stripe-llms-txt-instructions-section) — Primary analysis of the instructions pattern significance
- [Vercel Inline LLM Instructions](https://vercel.com/blog/a-proposal-for-inline-llm-instructions-in-html) — `<script type="text/llms.txt">` proposal and production implementation
- [Stripe AI Agent Benchmark](https://stripe.com/blog/can-ai-agents-build-real-stripe-integrations) — 11-environment agent integration benchmark
- [GitHub: How to Write a Great agents.md](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) — Analysis of 2,500+ repos
- [AGENTS.md Specification](https://github.com/agentsmd/agents.md) — The AGENTS.md open format
- [IETF AIPREF Working Group](https://datatracker.ietf.org/wg/aipref/about/) — Charter, milestones, participants
- [draft-ietf-aipref-vocab-05](https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/) — AI usage preference vocabulary (train-ai, search)
- [draft-ietf-aipref-attach-04](https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/) — Content-Usage HTTP header + robots.txt rule
- [draft-romm-aipref-contentsignals-00](https://datatracker.ietf.org/doc/html/draft-romm-aipref-contentsignals-00) — Cloudflare's IETF submission (expired)
- [IETF blog: AIPREF charter](https://www.ietf.org/blog/aipref-wg/) — Working group formation announcement
- [IETF blog: AIPREF progress](https://www.ietf.org/blog/ai-pref-progress/) — June 2025 progress update
- [contentsignals.org](https://contentsignals.org/) — Cloudflare-run AIPREF guide + robots.txt generator
- [IAB Tech Lab CoMP spec](https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/) — Content Monetization Protocol v1.0
- [CoMP press release](https://www.prnewswire.com/news-releases/iab-tech-lab-announces-comp-framework-to-ensure-llms-have-commercial-agreements-with-publishers-before-content-crawling-302709536.html) — March 2026 announcement
- [Common Crawl IETF 123 Report](https://commoncrawl.org/blog/ietf-123-report) — AIPREF WG participant observations
- [Answer.AI llms.txt proposal](https://www.answer.ai/posts/2024-09-03-llmstxt.html) — Original blog post proposing the llms.txt format
- [AnswerDotAI/llms-txt](https://github.com/AnswerDotAI/llms-txt) — GitHub repo maintaining the llms.txt spec
- [Hugo Content Organization](https://gohugo.io/content-management/organization/) — _index.md vs index.md (branch vs leaf bundles)
- [Mintlify llms.txt docs](https://www.mintlify.com/docs/ai/llmstxt) — Root-only llms.txt auto-generation
- [GitBook LLM-ready docs](https://gitbook.com/docs/publishing-documentation/llm-ready-docs) — Root-only llms.txt auto-generation

### Related Research
- [llms-txt-consumption-patterns](/Users/edwingomezcuellar/reports/llms-txt-consumption-patterns/) — How projects operationalize llms.txt (bundling, layered architecture)
- [docs-frameworks-vs-platforms-landscape](/Users/edwingomezcuellar/reports/docs-frameworks-vs-platforms-landscape/) — D5 covers content negotiation + agent accessibility in the docs landscape
- [kb-index-navigation-patterns-for-agents](/Users/edwingomezcuellar/reports/kb-index-navigation-patterns-for-agents/) — D9 covers walkable tree index patterns for agent KB navigation
