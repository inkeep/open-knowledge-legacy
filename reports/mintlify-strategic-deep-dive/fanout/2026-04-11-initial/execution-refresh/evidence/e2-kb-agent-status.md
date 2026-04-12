# Evidence: E2 — KB Agent Execution Status

**Dimension:** KB Agent execution status
**Date:** 2026-04-11
**Sources:** mintlify.com/blog, docs.mintlify.com, github.com/orgs/mintlify/discussions

---

## Key pages referenced

- https://www.mintlify.com/blog/kb-agent — "We Replaced Our Internal Wiki With a Slack Bot" (Mar 22)
- https://www.mintlify.com/docs/ai/agent — Agent product documentation
- https://www.mintlify.com/docs/guides/knowledge-base — Internal KB setup guide
- https://www.mintlify.com/docs/ai/slack-bot — Deprecated old Slack bot
- github.com/orgs/mintlify/discussions/categories/feature-requests — Customer discussions

---

## Findings

### Finding: KB Agent was soft-launched to customers on March 22 — NOT internal-only
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/kb-agent

The blog post's closing paragraph contains an explicit customer CTA:

> "You can sign up for Mintlify, connect your Slack, and try the KB agent out for yourself. We're still very early, so any feedback you have time to provide will likely make it into the product surface in the next few weeks."

This directly contradicts the April 2 assessment that KB Agent was "internal-only" and a "trial balloon." The blog post was simultaneously a product story AND a launch announcement. The "still very early" language signals pre-GA / early access, not internal-only.

**Correction to prior research:** The `strategic-direction-update-2026-04.md` stated: "It is described as an internal Mintlify tool, not a product feature" and "There is no product page, pricing, or documentation for it." The first claim was wrong — the CTA explicitly invites customers to try it. The second claim about no product page/pricing remains accurate: KB Agent is bundled under the general Agent product (Pro plan, $250/month).

### Finding: KB Agent is absorbed into the general "agent" product, not a standalone SKU
**Confidence:** CONFIRMED
**Evidence:** docs.mintlify.com, mintlify.com/pricing

The term "KB Agent" does not appear anywhere in Mintlify's documentation or pricing pages. The functionality (Slack-to-GitHub PR, internal knowledge capture) is folded into:
- `docs/agent/slack` — Slack-triggered agent documentation
- `docs/guides/knowledge-base` — Internal KB setup guide referencing the agent
- `docs/agent/index` — Lists "capture knowledge from Slack conversations" as a use case

The product identity is "the Mintlify agent" — KB Agent is marketing copy from the blog, not a product name.

### Finding: No formal beta, waitlist, or opt-in — open availability
**Confidence:** INFERRED
**Evidence:** Blog post routes to standard Mintlify signup; no dedicated KB Agent signup page found

The CTA routes to standard Mintlify account creation. No waitlist URL, beta form, or separate opt-in page exists. This is consistent with bundling into the existing Pro plan rather than launching a separate product.

### Finding: Customer feature requests confirm real external usage
**Confidence:** CONFIRMED
**Evidence:** github.com/orgs/mintlify/discussions/categories/feature-requests

A GitHub Discussion titled "For Internal KB agent: People & Plays (to solve who, what, when)" was posted March 31, 2026 by user `nehahbo`. This requests expanded capabilities (people/process indexing), confirming the requester already has access and is using the product — not requesting access.

No other KB Agent-specific feature requests found in the discussions index.

### Finding: Old Slack bot deprecated, replaced by new agent
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/ai/slack-bot

The docs state: "New Slack bot installations are not available. Existing Slack bot integrations continue to work." This is a different, simpler Q&A-only product from the KB Agent. The deprecation signals the new agent (with write capabilities) is the go-forward Slack integration.

### Finding: No Slack App Directory listing found for KB Agent
**Confidence:** UNCERTAIN
**Evidence:** Slack App Directory search returned no results for "mintlify" (marketplace renders via JS, not fully scrapable)

The Slack integration appears to use an internal OAuth flow via the Mintlify dashboard (`Products > Agent > Settings > Connect Slack`) rather than a public Slack App Directory listing.

### Finding: No standalone architecture documentation published
**Confidence:** CONFIRMED
**Evidence:** Negative search across docs.mintlify.com

No standalone KB Agent architecture doc, API reference, or technical deep-dive exists beyond the marketing-grade blog post. The blog describes: OpenCode + Daytona as execution harness (same as Workflows), agentic search with iterative query reformulation, MCP server per KB site, Slack-to-GitHub PR pipeline. No technical follow-up has been published.

### Finding: April 10 changelog reveals Slack agent improvements
**Confidence:** CONFIRMED
**Evidence:** mintlify.com/docs/changelog (April 10 entry)

The April 10 changelog includes:
- **Slack agent: multi-deployment support** — one agent can serve multiple docs sites
- **Slack agent: read-only mode** — classifies message intent before granting write access

These are shipping improvements to the KB Agent's Slack integration, confirming active development (not vaporware).

**Implications:** The KB Agent assessment requires correction. It was soft-launched on March 22, not kept internal. However, it is early-stage (pre-GA quality), bundled rather than standalone, and has no dedicated product surface in docs or pricing. The April 10 Slack agent improvements confirm active shipping. This is meaningfully different from AFFiNE's pattern: Mintlify announced AND shipped (even if early), while AFFiNE announced but did not ship.

---

## Gaps / follow-ups

* Whether KB Agent has paying customers specifically for the internal KB use case (vs. existing Pro customers trying it incidentally) is unknown
* Roadmap for KB Agent productization (dedicated product page, pricing tier) is unknown
