# Evidence: W3 — Content Negotiation and Write-Adjacent Surfaces

**Dimension:** W3 (P1 Moderate)
**Date:** 2026-04-11
**Sources:** Mintlify docs, Mintlify blog, Mintlify API reference

---

## Key pages referenced

- [Improved agent experience with llms.txt and content negotiation](https://www.mintlify.com/blog/context-for-agents) — content negotiation details
- [llms.txt — Mintlify Docs](https://www.mintlify.com/docs/ai/llmstxt) — llms.txt specification + feedback endpoint
- [Create agent job — Mintlify API](https://www.mintlify.com/docs/api/agent/create-agent-job) — Agent Job API
- [API Introduction — Mintlify](https://www.mintlify.com/docs/api/introduction) — full API surface
- [Tutorial: Auto-update documentation when code changes](https://www.mintlify.com/docs/guides/automate-agent) — automation guide
- [Feedback — Mintlify Docs](https://www.mintlify.com/docs/insights/feedback) — feedback system
- [Agent suggestions — Mintlify Docs](https://www.mintlify.com/docs/agent/suggestions) — suggestion system
- [Model Context Protocol — Mintlify Docs](https://www.mintlify.com/docs/ai/model-context-protocol) — MCP server reference
- [The improved Mintlify CLI](https://www.mintlify.com/blog/improved-cli) — CLI capabilities

---

## Findings

### Finding: Content negotiation is pure read — no POST/PUT path
**Confidence:** CONFIRMED
**Evidence:** Content negotiation serves clean Markdown when `Accept: text/markdown` is set. Also available via `.md` URL suffix. HTTP response headers (`Link: </llms.txt>`, `X-Llms-Txt: /llms.txt`) are discovery-only. No documentation or signals of POST/PUT handling on content-negotiated URLs.

**Implications:** The read surface is well-engineered for agent consumption (30x token reduction). But it is architecturally one-directional — there is no reverse channel.

### Finding: One feedback POST endpoint exists — routes to dashboard queue, not docs
**Confidence:** CONFIRMED
**Evidence:** `POST https://www.mintlify.com/docs/_mintlify/feedback/{orgSlug}/agent-feedback` accepts `{ "path": "/current-page-path", "feedback": "Description of the issue" }`. This is a reader-facing feedback submission baked into Mintlify's llms.txt documentation page.

**Implications:** This is the closest thing to an inbound agent write surface, but it is a feedback queue, not a content write path. Feedback routes to the dashboard for human triage — it does not update docs directly or trigger an agent job.

### Finding: Agent Job API is the only genuine programmatic write surface
**Confidence:** CONFIRMED
**Evidence:** `POST https://api.mintlify.com/v1/agent/{projectId}/job` with bearer token (`mint_*` admin API key). Parameters:
- `messages`: Array of `{role, content}` — natural language instructions, NOT raw markdown
- `branch`: Branch name for PR creation
- `asDraft`: Boolean (draft vs ready PR)
- `model`: "sonnet" or "opus"

Response: SSE stream with `X-Session-Id` and `X-Branch-Name` headers.

**Critical constraint:** The messages field takes task instructions, not page content. The agent interprets the instructions, reads existing docs for context, edits files, and opens a PR. There is no "drop in markdown and get a page" endpoint. v1 is deprecated; v2 exists but is not fully documented.

**Access constraint:** Enterprise-only. Requires admin API key + Mintlify GitHub App installed with write access.

**Implications:** This is architecturally significant. Mintlify already has a programmatic write API — it's just mediated through an LLM agent rather than being a direct CRUD endpoint. An external system can programmatically trigger docs updates by calling this API. The gap to bidirectional MCP is: wrapping this in MCP tool format + adding permission scoping.

*Note: Mintlify is the sole source for this API's capabilities and constraints. Product-incentive bias is possible — the API may be less robust or more limited in practice than documentation suggests.*

### Finding: No llms.txt reverse path exists
**Confidence:** NOT FOUND
**Evidence:** llms.txt and llms-full.txt are auto-generated read-only indexes. No "llms.txt → docs" import path documented or signaled.

### Finding: Mintlify CLI has no write-back capability
**Confidence:** CONFIRMED
**Evidence:** CLI commands: `mint dev` (local preview), `mint analytics` (read-only), `mint login/logout/status/signup`, `mint validate` (lint). No `mint push`, `mint publish`, or any write command. Roadmap mentions "parity with the dashboard" but all future.

### Finding: Suggestion system is Mintlify-internal outbound only
**Confidence:** CONFIRMED
**Evidence:** Agent Suggestions monitors connected code repos, detects changes, and surfaces suggested docs updates in the Mintlify dashboard. Docs owners choose to run the agent job or dismiss. This is an outbound signal FROM Mintlify TO the docs owner. No external API for submitting suggestions.

### Finding: Feedback widget captures data but doesn't auto-update docs
**Confidence:** CONFIRMED
**Evidence:** Chat/AI assistant widget captures thumbs up/down, free-form feedback, code snippet feedback. Data appears in analytics dashboard (`GET /api/analytics/feedback`). Feedback can be triaged (Pending/In Progress/Resolved/Dismissed). No automated trigger turns feedback into docs updates without human authorization.

### Finding: MCP server remains read-only — no write tools
**Confidence:** CONFIRMED
**Evidence:** Auto-generated MCP server at `{docs-url}/mcp` exposes exactly 2 tools: `search` and `get_page`. No `create_page`, `update_page`, or `submit_content` tools.

---

## Write Surface Summary

| Surface | Direction | Programmatic? | Gating |
|---|---|---|---|
| Content negotiation (`Accept: text/markdown`) | READ only | Yes | None |
| `.md` URL variant | READ only | Yes | None |
| `/llms.txt` + `/llms-full.txt` | READ only | Yes | None |
| MCP server (`/mcp`) | READ only | Yes (MCP) | None / OAuth for authed |
| Agent Job API | WRITE (LLM-mediated) | Yes (REST) | Enterprise + admin key |
| Feedback POST endpoint | WRITE (feedback queue) | Yes | No auth shown |
| `feedback.suggestEdit` | WRITE (GitHub PR) | Human UI only | GitHub fork |
| Agent Suggestions | WRITE (Mintlify-internal) | No external API | Dashboard UI |
| CLI (`mintlify`) | READ / local preview | CLI | — |

---

## Negative searches

- Searched for POST/PUT documentation on content-negotiated URLs → NOT FOUND
- Searched for webhook inbound endpoint → NOT FOUND (only outbound GitHub webhooks for triggering workflows)
- Searched for `mint push` or `mint publish` CLI commands → NOT FOUND
- Searched for external suggestion submission API → NOT FOUND

---

## Gaps / follow-ups

- Agent Job API v2 is not fully documented — may have additional capabilities
- Whether the feedback POST endpoint requires authentication is unclear
- Whether Agent Suggestions will get an external API is unknown
