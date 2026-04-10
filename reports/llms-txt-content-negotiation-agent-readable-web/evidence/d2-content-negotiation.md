# Evidence: Content Negotiation for AI Agents

**Dimension:** D2 — Accept: text/markdown, Cloudflare Markdown for Agents, CDN mechanics
**Date:** 2026-04-07
**Sources:** Cloudflare docs/blog, Vercel blog, Checkly report, RFC 7231, RFC 7763, Dries Buytaert

---

## Key sources
- [Cloudflare Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) — launched Feb 12, 2026
- [Cloudflare blog](https://blog.cloudflare.com/markdown-for-agents/) — 80% token reduction
- [Vercel content negotiation](https://vercel.com/blog/making-agent-friendly-pages-with-content-negotiation) — 99.4% size reduction
- [Checkly State of Content Negotiation](https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/) — 3/7 agents send header
- [Dries Buytaert](https://dri.es/markdown-llms-txt-and-ai-crawlers) — "no AI crawler uses content negotiation"
- [RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231) — HTTP content negotiation
- [RFC 7763](https://datatracker.ietf.org/doc/html/rfc7763) — text/markdown media type

## Findings

### Standards-compliant: RFC 7231 + RFC 7763, no new protocol needed
**Confidence:** CONFIRMED

### Cloudflare: edge HTML-to-Markdown conversion, Pro+ plans, 2MB cap
**Confidence:** CONFIRMED
Headers: Content-Type, Vary: accept, x-markdown-tokens (estimated), Content-Signal (AI permissions). 80% token reduction. Also offers Workers AI `AI.toMarkdown()` and Browser Rendering `/markdown` API for JS-heavy pages.

### Vercel: Next.js middleware pattern, 99.4% size reduction
**Confidence:** CONFIRMED
Rewrite rule detects Accept header → routes to markdown endpoint. Also introduced "markdown sitemaps."

### Only 3 of 7 coding agents send Accept: text/markdown
**Confidence:** CONFIRMED
Claude Code, Cursor, OpenCode: YES. Codex, Gemini CLI, Copilot, Windsurf: NO. (Checkly, Feb 2026)

### No AI crawler uses content negotiation
**Confidence:** CONFIRMED
Buytaert/Acquia fleet (400M requests): "Not one." Crawlers discover .md files via explicit URLs, not Accept header. GPTBot: 34.8% of requests went to .md files (URL-based, not header-based).

### Key distinction: crawlers vs coding agents
**Confidence:** CONFIRMED
Crawlers scrape HTML. Coding agents (3/7) send Accept: text/markdown for real-time tool use. Different audiences, different behaviors.

### Other implementations: AWS DIY, WordPress plugins, Mintlify native, Eleventy community
**Confidence:** CONFIRMED
Netlify: no native support (Edge Functions only). Fastly/Akamai: nothing announced.

---

## Standards Landscape: IETF AIPREF, Content-Signal, IAB Tech Lab CoMP

**Date:** 2026-04-05
**Sources:** IETF Datatracker, IETF blog, Cloudflare blog, IAB Tech Lab, contentsignals.org, Common Crawl IETF 123 report

### Key sources
- [IETF AIPREF WG charter](https://datatracker.ietf.org/wg/aipref/about/) — chartered Feb 2025, milestones Aug 2026
- [draft-ietf-aipref-vocab-05](https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/) — Paul Keller (Open Future), Martin Thomson (Mozilla)
- [draft-ietf-aipref-attach-04](https://datatracker.ietf.org/doc/draft-ietf-aipref-attach/) — Gary Illyes (Google), Martin Thomson (Mozilla)
- [draft-romm-aipref-contentsignals-00](https://datatracker.ietf.org/doc/html/draft-romm-aipref-contentsignals-00) — Michael Tremante, Leah Romm (Cloudflare). Expired Apr 2026.
- [IETF blog: AIPREF charter](https://www.ietf.org/blog/aipref-wg/) — Feb 27, 2025
- [IETF blog: AIPREF progress](https://www.ietf.org/blog/ai-pref-progress/) — Jun 29, 2025
- [Cloudflare Content Signals Policy blog](https://blog.cloudflare.com/content-signals-policy/) — Sep 24, 2025
- [contentsignals.org](https://contentsignals.org/) — Cloudflare-run generator + guide
- [IAB Tech Lab CoMP spec](https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/) — v1.0 public comment Mar 10, 2026
- [IAB Tech Lab CoMP press release](https://www.prnewswire.com/news-releases/iab-tech-lab-announces-comp-framework-to-ensure-llms-have-commercial-agreements-with-publishers-before-content-crawling-302709536.html) — Mar 10, 2026
- [CoMP 1.0 spec on GitHub](https://github.com/IABTechLab/CoMP/blob/dev/CoMP-1.0.md)
- [Common Crawl IETF 123 report](https://commoncrawl.org/blog/ietf-123-report) — Jul 2025

---

### Finding: IETF AIPREF WG is the formal standards track for AI content preferences
**Confidence:** CONFIRMED
**Evidence:** [IETF Datatracker](https://datatracker.ietf.org/wg/aipref/about/), [IETF blog](https://www.ietf.org/blog/aipref-wg/)

Chartered February 2025 under the Web and Internet Transport (WIT) area. Co-chaired by Mark Nottingham and Suresh Krishnan. Area Director: Mike Bishop. Mailing list: ai-control@ietf.org. Originated from the IAB AI-CONTROL Workshop (September 2024).

The WG produces two deliverables:
1. **draft-ietf-aipref-vocab** — vocabulary for expressing AI usage preferences (currently v05)
2. **draft-ietf-aipref-attach** — mechanisms for associating preferences with content in HTTP (currently v04)

External liaisons: IPTC, PLUS Coalition, WHATWG, W3C, and other content format bodies.

Explicitly out of scope: enforcement mechanisms, authentication/authorization, preference registries, auditing/transparency.

---

### Finding: AIPREF vocab defines two categories — train-ai and search — with three states (allow/disallow/unknown)
**Confidence:** CONFIRMED
**Evidence:** [draft-ietf-aipref-vocab-05](https://ietf-wg-aipref.github.io/drafts/draft-ietf-aipref-vocab.html)

Authors: Paul Keller (Open Future), Martin Thomson (Mozilla, editor).

Two core preference categories:
- **`train-ai`** (label) — "the act of using an asset to train or fine-tune a foundation model"
- **`search`** (label) — using assets "in a search application that directs users to the location from which the assets were retrieved," constrained to verbatim excerpts with attribution links

Each category has three states: Allow (`y`), Disallow (`n`), Unknown (no signal).

Serialization: Structured Field Dictionary (RFC 9651). Example: `train-ai=y, search=n`

The vocabulary is intentionally minimal and extensible — designed for future RFC updates to add categories.

---

### Finding: AIPREF attach draft defines Content-Usage HTTP header and robots.txt Content-Usage rule
**Confidence:** CONFIRMED
**Evidence:** [draft-ietf-aipref-attach-04](https://ietf-wg-aipref.github.io/drafts/draft-ietf-aipref-attach.html)

Authors: Gary Illyes (Google), Martin Thomson (Mozilla).

Two attachment mechanisms:
1. **Content-Usage HTTP header** — structured dictionary in responses. Example: `Content-Usage: train-ai=n`. Applies as representation metadata. Servers MUST preserve preferences when content answers later requests.
2. **robots.txt Content-Usage rule** — extends RFC 9309. Uses identical path-prefix matching as Allow/Disallow. Example:
   ```
   User-Agent: *
   Content-Usage: train-ai=n
   Content-Usage: /ai-ok/ train-ai=y
   ```

Key: "Usage preferences apply only to those resources that can be crawled according to Allow/Disallow rules." Crawlability and usage preferences are a two-stage system.

Updates RFC 9309.

---

### Finding: Cloudflare's Content-Signal is a precursor implementation, not aligned with IETF naming
**Confidence:** CONFIRMED
**Evidence:** [Cloudflare blog](https://blog.cloudflare.com/content-signals-policy/), [draft-romm-aipref-contentsignals-00](https://datatracker.ietf.org/doc/html/draft-romm-aipref-contentsignals-00)

Cloudflare launched Content Signals Policy on September 24, 2025. Three signals: `search`, `ai-train`, `ai-input`. Expressed in robots.txt as comments: `Content-Signal: search=yes, ai-train=no`. Released under CC0 license.

Naming divergence from IETF:
- Cloudflare uses `ai-train`; IETF uses `train-ai`
- Cloudflare uses `Content-Signal`; IETF uses `Content-Usage`
- Cloudflare defines `ai-input` (RAG/grounding); IETF vocab v05 does NOT include an equivalent — only `train-ai` and `search`

Cloudflare submitted [draft-romm-aipref-contentsignals-00](https://datatracker.ietf.org/doc/html/draft-romm-aipref-contentsignals-00) (Oct 2025, by Michael Tremante and Leah Romm) proposing their three categories as sub-categories of the AIPREF Automated Processing category. This individual draft expired April 2026 and was NOT adopted by the WG.

The IETF is on a separate track with different names, structure, and scope. Cloudflare's implementation is a de facto deployment that may converge with or diverge from the final standard.

---

### Finding: contentsignals.org is a Cloudflare-run guide and generator tool
**Confidence:** CONFIRMED
**Evidence:** [contentsignals.org](https://contentsignals.org/), [Cloudflare blog](https://blog.cloudflare.com/content-signals-policy/)

Describes itself as "an up-to-date guide to the IETF's proposed new AI Preferences (aipref)." Provides a generator tool for creating Content Signals to paste into robots.txt. Run by Cloudflare, released under CC0.

Cloudflare customers using managed robots.txt get Content Signals applied automatically (default: search=yes, ai-train=no).

---

### Finding: IAB Tech Lab CoMP is a parallel commercial protocol, not a replacement for AIPREF
**Confidence:** CONFIRMED
**Evidence:** [IAB Tech Lab](https://iabtechlab.com/standards/comp-content-monetization-protocols-initiative/), [press release](https://www.prnewswire.com/news-releases/iab-tech-lab-announces-comp-framework-to-ensure-llms-have-commercial-agreements-with-publishers-before-content-crawling-302709536.html), [CoMP 1.0 spec](https://github.com/IABTechLab/CoMP/blob/dev/CoMP-1.0.md)

CoMP v1.0 released for public comment March 10, 2026 (comment period closed April 9, 2026).

CoMP is fundamentally different from AIPREF:
- **AIPREF** = signaling preferences (what you allow/disallow). Vocabulary + attachment mechanisms.
- **CoMP** = commercial negotiation protocol (how to establish licensing before crawling). JSON-based API for request/response between AI systems and publishers.

CoMP assumes AIPREF-style blocking is already in place at the CDN/edge level. It defines:
- AISystem request objects (identification, usage intent, scope, functions)
- Package response objects (licensing URLs, content metadata, retrieval instructions)
- Functions reusing AIPREF-aligned terms: `ai-train`, `ai-input`, `ai-index`, `search`
- Sub-functions: training, RAG, grounding, agent-view, agent-actions
- Retrieval formats: HTML, RSS, API, MCP, NLWeb, XML, NewsML

Key participants: Anthony Katsur (CEO), The Weather Company, People Inc, Bertelsmann, Beeler.Tech, Mobian.

CoMP explicitly is NOT: a bot-blocking system, a licensing marketplace, or a definition of economic models. It is a communication protocol for discovering licensing terms and access mechanisms.

---

### Finding: AIPREF timeline slipped — milestones now August 2026 (originally August 2025)
**Confidence:** CONFIRMED
**Evidence:** [IETF Datatracker milestones](https://datatracker.ietf.org/wg/aipref/about/), [IETF progress blog](https://www.ietf.org/blog/ai-pref-progress/)

Original milestones: August 2025 (both vocab and attach drafts to IESG).
Current milestones: **August 31, 2026** for both deliverables.

June 2025 progress update (co-chairs) was "optimistic" about schedule with potential for "only slight" slips. The one-year slip from August 2025 to August 2026 suggests more unresolved issues than anticipated.

Outstanding issues as of June 2025: inference-time use terminology, search's relationship to AI, TDM terminology, preference combination methodology.

Meetings: IETF 122 Bangkok (first), interim Brussels (Apr 2025), design team London (Jul 2025), IETF 123 Madrid (Jul 2025).

Participating organizations (per Common Crawl IETF 123 report): Meta, Ericsson, Google, Anthropic, Common Crawl, Mozilla, Open Future, Cloudflare, plus others.

---

### Finding: Three-layer standards architecture emerging — preferences, attachment, commercial negotiation
**Confidence:** INFERRED
**Evidence:** Synthesis from AIPREF vocab, AIPREF attach, CoMP, Content-Signal

A layered model is converging:
1. **Vocabulary layer** (IETF AIPREF vocab) — what preferences can be expressed: train-ai, search, potentially more
2. **Attachment layer** (IETF AIPREF attach) — how preferences are communicated: Content-Usage HTTP header, robots.txt Content-Usage rule
3. **Commercial layer** (IAB Tech Lab CoMP) — how licensing/access is negotiated before crawling: JSON API, access tokens, package discovery

Cloudflare's Content-Signal is a deployed precursor to layer 1+2 with different naming. contentsignals.org bridges deployed practice with emerging standard.

---

## Gaps / follow-ups

- The IETF vocab currently has only `train-ai` and `search`. Cloudflare's `ai-input` (RAG/grounding) is NOT in the IETF vocab. Whether it gets added is an open question.
- draft-romm-aipref-contentsignals (Cloudflare's IETF submission) expired and was not adopted. The relationship between deployed Content-Signal and future Content-Usage is unresolved.
- CoMP public comment period closed April 9, 2026. Final v1.0 status and adoption trajectory unknown.
- No evidence of any AI system or crawler actually respecting Content-Signal or Content-Usage headers in practice (same consumption gap as D4).
- The EU AI Act and DSA may create regulatory pressure for these standards, but that dimension was not investigated.
