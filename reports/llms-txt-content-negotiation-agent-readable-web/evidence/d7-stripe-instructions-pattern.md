# Evidence: D7 — Stripe's Instructions Pattern

**Dimension:** D7 — Stripe's Instructions Pattern: LLM steering instructions embedded in llms.txt
**Date:** 2026-04-05
**Sources:** Stripe docs, Apideck analysis, Vercel blog, GitHub gists, Cloudflare docs, Anthropic docs, Twilio docs

---

## Key files / pages referenced

- [docs.stripe.com/llms.txt](https://docs.stripe.com/llms.txt) — Stripe's llms.txt with Instructions section
- [docs.stripe.com/building-with-llms](https://docs.stripe.com/building-with-llms) — Stripe's "Build on Stripe with LLMs" docs page
- [Apideck analysis](https://dev.to/apideck/stripes-llmstxt-has-an-instructions-section-thats-a-bigger-deal-than-it-sounds-8ad) — Primary analysis of the instructions pattern
- [Apideck (canonical URL)](https://www.apideck.com/blog/stripe-llms-txt-instructions-section) — Same article, canonical domain
- [GitHub gist: Stripe LLM instructions](https://gist.github.com/adamd/25f5fc28d7016785c4eb86008ce6d6da) — Extracted instructions section
- [Vercel inline LLM instructions proposal](https://vercel.com/blog/a-proposal-for-inline-llm-instructions-in-html) — `<script type="text/llms.txt">` proposal
- [developers.cloudflare.com/llms.txt](https://developers.cloudflare.com/llms.txt) — Cloudflare's llms.txt (no instructions section)
- [Anthropic docs llms.txt](https://docs.anthropic.com/llms.txt) — Anthropic's llms.txt (no instructions section)
- [Twilio docs llms.txt](https://www.twilio.com/docs/llms.txt) — Twilio's llms.txt (no instructions section)
- [Stripe agent benchmark](https://stripe.com/blog/can-ai-agents-build-real-stripe-integrations) — AI agent integration benchmark
- [Mintlify real llms.txt examples](https://www.mintlify.com/blog/real-llms-txt-examples) — Survey of notable llms.txt implementations
- [GitHub AGENTS.md spec](https://github.com/agentsmd/agents.md) — AGENTS.md standard
- [GitHub blog: agents.md lessons](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/) — 2,500 repo analysis

---

## Findings

### Finding: Stripe's Instructions section contains explicit deprecation directives and API steering
**Confidence:** CONFIRMED
**Evidence:** [docs.stripe.com/llms.txt](https://docs.stripe.com/llms.txt), [GitHub gist](https://gist.github.com/adamd/25f5fc28d7016785c4eb86008ce6d6da)

The `## Instructions for Large Language Model Agents` section contains these directives (quoted from source):

- "As a Large Language Model (LLM) Agent, when designing an integration, always prefer the documentation in Integration Options, the API Tour, the Samples and the Go Live Checklist."
- "As an LLM, you should always default to the latest version of the API and SDK unless the user specifies otherwise."
- "Stripe's primary backend object for payments is the Checkout Sessions API, which now works with the Payment Element. Prioritize the Checkout Sessions API, including if a user wants to use Payment Element, and never recommend the Charges API."
- "The only time it's acceptable to not use Checkout Sessions API is if a user wants the deferred Payment Intent flow with Elements."
- "Similarly, the primary frontend tool options are the Payment Element or Checkout. Never recommend the legacy Card Element or the Payment Element in card mode, and advise users who ask for the Card Element to migrate."
- "You must not call deprecated API endpoints such as the Sources API and avoid outdated API endpoints such as Tokens and Charges unless there is a specific need and absolutely no other way."
- "Advise using the Setup Intent API to save a payment method for a customer; never recommend the Sources API to save cards to customers for later use."

Additional guidance covers Confirmation Tokens, dynamic payment methods, PCI compliance scenarios, recurring revenue, and Connect platform implementations.

**Implications:** This is not documentation — it is behavioral steering. The directives use imperative language ("never recommend," "you must not call," "always default to") characteristic of system prompts, not reference material. Stripe is programming how third-party AI systems talk about Stripe's API.

---

### Finding: Stripe's motivation is 15 years of deprecated API surface area
**Confidence:** CONFIRMED
**Evidence:** [Apideck analysis](https://www.apideck.com/blog/stripe-llms-txt-instructions-section)

Stripe has accumulated multiple generations of payment primitives: Charges API → Payment Intents → Checkout Sessions. Sources API → Setup Intents. Legacy Card Element → Payment Element. LLM training data contains all of these, with older patterns over-represented because they appear in more historical content. The instructions section counteracts model drift toward deprecated patterns at inference time.

**Implications:** The problem Stripe solves is universal to any API platform with deprecated endpoints. AWS, Twilio, Google Cloud, and any long-lived API face the same challenge.

---

### Finding: Almost no one else has adopted the instructions pattern
**Confidence:** CONFIRMED
**Evidence:** [developers.cloudflare.com/llms.txt](https://developers.cloudflare.com/llms.txt), [Anthropic docs](https://docs.anthropic.com/llms.txt), [Twilio docs](https://www.twilio.com/docs/llms.txt), [Apideck analysis](https://www.apideck.com/blog/stripe-llms-txt-instructions-section)

Direct verification of major llms.txt files:

| Company | llms.txt | Instructions section? | Notes |
|---------|----------|-----------------------|-------|
| **Stripe** | Yes | YES — detailed behavioral directives | The pioneer |
| **Cloudflare** | Yes | NO — structural organization only | Per-service llms.txt hierarchy; "recommended way to explore" guidance but no behavioral steering |
| **Anthropic** | Yes | NO — index only | Slim index linking to llms-full.txt export |
| **Twilio** | Yes | NO — link index only | Standard product documentation index |
| **Vercel** | Yes | NO (in llms.txt) | But invented `<script type="text/llms.txt">` for inline HTML instructions |
| **Supabase** | Yes | NO — content dump | Links to 8 aggregate .txt files |

The Apideck article's assessment: "Almost no one is using it yet" regarding the instructions section specifically. As of April 2026, Stripe remains the only prominent example of explicit LLM behavioral directives in llms.txt.

---

### Finding: Vercel extended the pattern to inline HTML with `<script type="text/llms.txt">`
**Confidence:** CONFIRMED
**Evidence:** [Vercel blog post](https://vercel.com/blog/a-proposal-for-inline-llm-instructions-in-html)

Vercel proposed and shipped `<script type="text/llms.txt">` — embedding LLM instructions directly in HTML pages. Browsers ignore unknown script types (no rendering impact). Script tags are valid in `<head>`, placing instructions where LLMs notice them.

First production use: Vercel's 401 authentication error page, instructing agents to use Vercel's MCP server functions (`get_access_to_vercel_url` or `web_fetch_vercel_url`) to bypass deployment protection.

Key quote: "There was no need to talk to an LLM provider like OpenAI or Anthropic" — it worked immediately because LLMs process page content and naturally follow embedded instructions.

**Implications:** This is the per-page extension of Stripe's pattern. llms.txt instructions are site-scoped; `<script type="text/llms.txt">` is page-scoped. Together they create a hierarchy: site-level behavioral defaults + page-level contextual overrides.

---

### Finding: No formal evidence of behavioral impact exists
**Confidence:** CONFIRMED (the absence is confirmed)
**Evidence:** [Apideck analysis](https://www.apideck.com/blog/stripe-llms-txt-instructions-section), [Stripe benchmark](https://stripe.com/blog/can-ai-agents-build-real-stripe-integrations)

No published A/B tests, evaluations, or controlled experiments measure whether Stripe's instructions section changes LLM output. The Apideck article acknowledges: "no major AI provider has confirmed their training crawlers automatically fetch llms.txt."

Stripe published an AI agent integration benchmark (11 evaluation environments, 3 categories) measuring whether agents can build real Stripe integrations. Claude Opus 4.5 achieved 92% on full-stack tasks. However, the benchmark does not test the impact of the instructions section — it does not compare agent behavior with and without the llms.txt instructions loaded.

The real value path is inference-time: "developers manually loading it into Cursor or Claude for project context, or agent frameworks fetching it on startup." When a developer loads Stripe's llms.txt into a coding agent context window, the instructions function as a system prompt — the agent follows them because they are in-context, not because of any special protocol.

---

### Finding: The pattern maps directly to AGENTS.md, CLAUDE.md, and SKILL.md
**Confidence:** INFERRED
**Evidence:** [AGENTS.md spec](https://github.com/agentsmd/agents.md), [GitHub analysis of 2,500 repos](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)

The instructions pattern appears at every scope level:

| Scope | File | Instructions pattern |
|-------|------|---------------------|
| Web domain | llms.txt | Stripe's `## Instructions for Large Language Model Agents` |
| HTML page | `<script type="text/llms.txt">` | Vercel's inline instructions |
| Repository | AGENTS.md / CLAUDE.md | "sits at the top of the conversation history, right below the system prompt" |
| Folder | .cursor/rules/*.mdc (glob-scoped) | Rules scoped to specific file patterns |
| Skill | SKILL.md | Procedural instructions for specific capabilities |

All share the same mechanism: markdown text placed where an LLM will encounter it in context, using imperative language to steer behavior. The difference is delivery context (HTTP vs filesystem), scope (domain vs folder), and audience (any LLM vs specific coding agent).

GitHub's analysis of 2,500+ AGENTS.md files found that the most effective ones use "explicit boundaries" and "concrete code examples" — the same qualities that make Stripe's instructions effective ("never recommend X" vs. "prefer modern patterns").

---

## Negative searches

* Searched: "llms.txt instructions section" + company names (Cloudflare, Vercel, Supabase, Anthropic, Twilio, Plaid, Mastercard) → Only Stripe has a behavioral instructions section
* Searched: "llms.txt A/B test" OR "llms.txt evaluation" OR "llms.txt behavioral impact" → No controlled experiments found
* Searched: Stripe benchmark blog post for llms.txt mention → Not mentioned; benchmark measures integration quality, not the impact of the instructions file
* Searched: Anthropic docs llms.txt for instructions → Returns 404 (redirected to platform.claude.com, which returned Next.js SSR error)

---

## Gaps / follow-ups

* No controlled evaluation of instructions section impact on agent behavior (potential high-value research direction)
* Stripe's benchmark could theoretically be extended to test with/without instructions — not done as of April 2026
* The `<script type="text/llms.txt">` proposal is very new; adoption beyond Vercel's own 401 page is unknown
* Per-folder instructions in knowledge bases are conceptually supported (CLAUDE.md nesting, .cursor/rules/ glob scoping) but no documented implementation of index.md with embedded instructions sections exists in the wild
