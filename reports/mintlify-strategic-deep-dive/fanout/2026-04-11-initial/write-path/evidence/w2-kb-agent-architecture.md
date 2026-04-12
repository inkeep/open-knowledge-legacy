# Evidence: W2 — KB Agent Architecture

**Dimension:** W2 (P0 Deep)
**Date:** 2026-04-11
**Sources:** Mintlify blog, Mintlify docs, Mintlify GitHub org

---

## Key pages referenced

- [We Replaced Our Internal Wiki With a Slack Bot. You Should Too.](https://www.mintlify.com/blog/kb-agent) — KB Agent launch post (2026-03-22)
- [Workflows blog post](https://www.mintlify.com/blog/workflows) — confirms shared infrastructure
- [What is the agent? — Mintlify Docs](https://www.mintlify.com/docs/agent) — agent overview
- [Workflows — Mintlify Docs](https://www.mintlify.com/docs/agent/workflows) — Workflow technical reference
- [AI agents are shipping faster than anyone can document](https://www.mintlify.com/blog/knowledge-management-agent-era) — Daytona + OpenCode confirmation
- [Mintlify + Claude Opus 4.6](https://www.mintlify.com/blog/opus-4-6) — LLM details
- [Mintlify pricing](https://www.mintlify.com/pricing) — plan availability
- [Mintlify GitHub org](https://github.com/mintlify) — open-source check

---

## Findings

### Finding: KB Agent is the same infrastructure as Workflows, differentiated by trigger mechanism
**Confidence:** CONFIRMED
**Evidence:** Blog post: "KB is powered by the same purpose-built harness that runs all of Mintlify's AI, built on OpenCode and Daytona, the same stack behind Workflows." Workflows blog: "the same infrastructure that powers our Slack agent."

The distinction is trigger mechanism only:
- **Workflows:** triggered by git push events or cron schedules
- **KB Agent:** triggered by Slack @-mentions (conversational trigger)
- Both run in Daytona sandboxes with headless OpenCode

**Implications:** This is critical for the bidirectional MCP question. KB Agent is NOT a separate service with different capabilities — it's the same write pipeline with a Slack input instead of a git/cron input. Adding an MCP input would be another trigger mechanism on the same infrastructure.

### Finding: KB Agent is customer-facing, available on Pro ($250/mo) and Enterprise plans
**Confidence:** CONFIRMED
**Evidence:** Blog post ends with: "You can sign up for Mintlify, connect your Slack, and try the KB agent out for yourself." The agent feature set (including KB Agent) is available on Pro and Enterprise plans.

**Note:** Blog post describes it as "very early" with rapid iteration, suggesting soft beta as of March 2026. No formal waitlist or gate — any Pro/Enterprise subscriber can access it.

### Finding: KB Agent originated as an internal tool, then was externalized
**Confidence:** CONFIRMED
**Evidence:** Blog post: "We tripled in headcount and ran straight into the problem ourselves." Mintlify's Chief of Staff built the entire internal KB in one afternoon. They ran it internally for 66 days (419 contributions, ~6.3/day) before announcing.

**Implications:** This is the pattern to watch. Mintlify builds internal tools → validates them → externalizes them. If they build internal bidirectional MCP tooling, the same pattern predicts eventual externalization.

### Finding: KB Agent authenticates to Slack via Mintlify Slack App (bot token pattern)
**Confidence:** INFERRED
**Evidence:** Setup requires users to "Connect under Slack integration" in dashboard settings and add the Mintlify app to their Slack workspace. If workspace requires admin approval for apps, admin must approve first. No technical details (bot token vs user token, OAuth scopes) are publicly documented.

### Finding: KB Agent authenticates to GitHub via the same Mintlify GitHub App as Workflows
**Confidence:** CONFIRMED
**Evidence:** Same GitHub App installation requirement. PRs attributed to "mintlify[bot]" by default; user-attributable option.

### Finding: KB Agent creates PRs by default — never commits directly to main
**Confidence:** CONFIRMED
**Evidence:** Blog post and docs: "The agent never commits directly to your main branch." `automerge: true` option exists for bypassing review.

### Finding: KB Agent can create new pages AND update existing ones
**Confidence:** CONFIRMED
**Evidence:** Blog post describes both creating net-new documentation from Slack threads and "migrating ten pages" (updating existing structure). Agentic search with iterative query reformulation finds the right section in existing docs.

### Finding: AGENTS.md is the style enforcement mechanism
**Confidence:** CONFIRMED
**Evidence:** Blog post: "You define your formatting and style preferences once, and the agent follows them every time." AGENTS.md is placed in `.mintlify/` directory and "appended to the agent's system prompt, so they apply to all tasks."

### Finding: LLM is Claude Opus 4.6 for agentic write tasks
**Confidence:** CONFIRMED (for Workflows infrastructure — shared by KB Agent)
**Evidence:** Mintlify blog confirms Opus 4.6 for the OpenCode sessions. KB Agent blog post itself doesn't name the LLM, but shared infrastructure implies shared model.

**Note:** Mintlify's AI assistant (chat/search) uses Claude Sonnet 4.6 — suggesting a two-tier model: Sonnet for Q&A, Opus for write tasks. KB Agent does both (Q&A from Slack and PR creation), so it may use different models for different modes.

### Finding: KB Agent is customer-configurable — connects to customer's Slack + docs repo
**Confidence:** CONFIRMED
**Evidence:** Blog post: "we built this for ourselves and now you can use it too." Setup: sign up for Mintlify, connect GitHub repo via Mintlify GitHub App, connect Slack workspace via Mintlify Slack App, define style rules in `.mintlify/AGENTS.md`, @mention `@kb` in Slack.

**Constraint:** KB Agent writes to whatever docs repo the customer has connected to Mintlify. It cannot be pointed at an arbitrary GitHub repo that isn't part of the Mintlify docs platform (INFERRED).

### Finding: Autonomous detection is on the roadmap
**Confidence:** CONFIRMED
**Evidence:** Blog post: "Right now, KB works because a human tells the agent to document something. But we're building toward the agent detecting on its own when a conversation has resolved." Specifically detecting signals like "aligned" or "ack" replies to auto-trigger documentation.

**Implications:** This moves KB Agent from human-triggered to event-triggered, converging with the Workflow model. Combined with push-event Workflows, Mintlify is building toward autonomous documentation agents that detect when docs need updating and act without human initiation.

### Finding: KB Agent is NOT open-sourced
**Confidence:** CONFIRMED (via negative search)
**Evidence:** Mintlify GitHub org (26 public repos) contains no KB Agent code, no agent runner code, no sandbox management code. Public repos limited to: documentation content, UI components, MDX parser, IDE plugins, GitHub Actions helpers.

---

## Negative searches

- Searched mintlify GitHub org for "kb-agent", "kb_agent", "slack-agent" → NOT FOUND
- Searched for detailed Slack OAuth scopes → NOT FOUND in public docs
- Searched for KB Agent as a standalone product (separate from Mintlify Agent) → NOT FOUND (it's part of the unified Agent feature)

---

## Gaps / follow-ups

- Exact Slack authentication mechanism (bot token vs user token, specific OAuth scopes) is undocumented
- Whether KB Agent uses different LLMs for Q&A mode vs write mode is unconfirmed
- Whether KB Agent can be pointed at repos outside the Mintlify docs platform is unconfirmed
- Timeline for autonomous detection feature is undisclosed
