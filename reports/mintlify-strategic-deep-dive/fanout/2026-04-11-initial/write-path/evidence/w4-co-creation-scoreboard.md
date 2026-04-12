# Evidence: W4 — 7 Co-Creation Primitive Scoreboard for Mintlify

**Dimension:** W4 (P0 Deep)
**Date:** 2026-04-11
**Sources:** Synthesized from W1-W3 evidence + Mintlify docs, blog, API reference, GitHub org
**Framework:** Same 7-primitive framework used in `reports/affine-strategic-deep-dive/evidence/d3-mcp-agent-surface.md`

---

## Scoreboard

### Primitive 1: Official first-party MCP server (write-capable)

**Status:** READ-ONLY CONFIRMED / WRITE NOT FOUND

**Evidence:**
- Mintlify auto-generates an MCP server for every hosted docs site at `{docs-url}/mcp`
- Exposes exactly 2 read-only tools: `search` and `get_page` ([MCP docs](https://www.mintlify.com/docs/ai/model-context-protocol))
- No `create_page`, `update_page`, `suggest_edit`, or any write tool exists in the MCP surface
- The MCP server is first-party (built and maintained by Mintlify, auto-deployed per site)
- Auth model supports public, partial-auth, and full-auth (OAuth + user groups) — all for read access

**Comparison to AFFiNE:** AFFiNE has no official first-party MCP server at all (only community DAWNCR0W/affine-mcp-server). Mintlify has an official first-party server but it's read-only. Mintlify is ahead on MCP presence but neither has write-capable MCP.

**How far to close the gap:** Mintlify's MCP server framework already exists with auth, rate limiting, and per-site deployment. Adding write tools that route through the Agent Job API infrastructure is an **integration task, not an architectural build**. Estimated: 2-4 weeks of engineering to add write tools to the existing MCP framework.

---

### Primitive 2: Agent identity (distinct from human)

**Status:** PARTIAL

**Evidence:**
- PRs created by Workflows/KB Agent are attributed to "mintlify[bot]" by default — a distinct GitHub identity ([Mintlify docs](https://www.mintlify.com/docs/agent))
- Users can optionally attribute PRs to their personal GitHub account
- However: there is no per-agent identity. All Mintlify agent writes (Workflows, KB Agent, API-triggered jobs) appear as the same "mintlify[bot]" actor
- No concept of "Agent X wrote this page, Agent Y wrote that page" — all agent writes are undifferentiated
- API keys are org-scoped (`mint_*`), not per-agent

**Comparison to AFFiNE:** AFFiNE has no agent identity at all — agents authenticate with the human user's PAT. Mintlify is ahead: mintlify[bot] IS a distinct actor in git history, even if all agent writes are lumped together.

**How far to close the gap:** Adding per-agent identity would require: (1) agent-scoped API keys or tokens, (2) passing agent identity through the Daytona sandbox to git config, (3) surfacing agent identity in the dashboard. Estimated: 4-6 weeks if prioritized. The git infrastructure supports it (git supports arbitrary author names); the platform plumbing is the work.

---

### Primitive 3: Per-edit attribution in history

**Status:** PARTIAL (via git, not via a dedicated system)

**Evidence:**
- When mintlify[bot] creates a PR, the commit author is mintlify[bot] — visible in git blame and PR history
- This provides commit-level attribution: "this commit was made by the agent"
- However: within a commit, there's no per-edit attribution. All changes in an agent PR are attributed to the same actor
- There's no "agent wrote line 5-10, human wrote line 11-15" granularity
- No dedicated attribution UI in the Mintlify dashboard beyond standard GitHub PR views

**Comparison to AFFiNE:** AFFiNE's BlockSuite uses Yjs `client_id` internally but does NOT expose attribution in any user-visible surface. Mintlify has functional attribution via git (commit author = mintlify[bot]) which is MORE than AFFiNE offers. However, neither has rich per-edit attribution.

**How far to close the gap:** Moving from commit-level to edit-level attribution would require a different architecture — either CRDT-based tracking (like open-knowledge) or a custom annotation layer. This is architecturally distant for Mintlify because their content model is git-based files, not CRDT documents. Estimated: months of work, and would require a fundamental shift in their content model. **This is a structural gap, not an engineering sprint.**

---

### Primitive 4: Staging / draft / review workflow

**Status:** CONFIRMED (functional, via git PRs)

**Evidence:**
- Default Workflow behavior: agent creates a PR for human review. Human approves and merges. ([Workflows docs](https://www.mintlify.com/docs/agent/workflows))
- Agent Job API supports `asDraft` parameter for draft PRs ([API docs](https://www.mintlify.com/docs/api/agent/create-agent-job))
- `automerge: true` bypasses review (direct push to deploy branch)
- Agent runs `mint validate` before creating PR to verify docs build
- Agent Suggestions surface proposed changes in the dashboard for human triage ([Suggestions docs](https://www.mintlify.com/docs/agent/suggestions))

**Key nuance:** The PR IS the staging primitive. There's no intermediate "propose a change and wait for approval before creating the PR" — the PR creation IS the proposal. This is functional staging via git, not a purpose-built staging system.

**Comparison to AFFiNE:** AFFiNE has NO staging/draft/review primitives whatsoever. All agent writes are immediate and live. Mintlify is categorically ahead — their git-based workflow provides a genuine human-in-the-loop review gate.

**How far to close the gap:** Already functional. The gap to "ideal" co-creation staging would be: (1) allowing agents to propose changes that are visible in the Mintlify dashboard WITHOUT creating a git PR (lighter-weight staging), (2) allowing agents to request review from specific people, (3) multi-agent review chains. These are product enhancements, not architectural gaps. Estimated: 2-4 weeks per enhancement.

---

### Primitive 5: Event subscription (push to agents)

**Status:** PARTIAL (inbound triggers exist, outbound subscriptions do not)

**Evidence:**
- **Inbound triggers exist:** Workflows can be triggered by git push events (code changes → agent runs). ([Workflows docs](https://www.mintlify.com/docs/agent/workflows))
- **Agent Suggestions monitors code repos:** detects changes and surfaces suggested updates ([Suggestions docs](https://www.mintlify.com/docs/agent/suggestions))
- **No outbound event subscription:** External agents cannot subscribe to content change events. No webhooks, SSE, or pub/sub for "page X was updated" or "new page created"
- **No MCP notification channel:** The MCP server is request-response only, no push capabilities

**Comparison to AFFiNE:** AFFiNE also has no event subscription for external agents. AFFiNE's WebSocket is for CRDT sync, not change events. Both platforms are equally absent on outbound event push.

**How far to close the gap:** Adding outbound webhooks ("fire when a page is created/updated/deleted") is a standard platform feature. Mintlify already has inbound webhook handling (GitHub push events) — adding outbound webhooks is estimated at 2-4 weeks. MCP-native notification channels would require MCP spec evolution (SSE transport), which is not Mintlify-specific.

---

### Primitive 6: Scoped permissions (per-workspace / per-page)

**Status:** PARTIAL (read scoping exists, write scoping does not)

**Evidence:**
- **MCP read scoping:** MCP server supports auth-scoped read access via user groups — different agents can see different pages based on permissions ([MCP docs](https://www.mintlify.com/docs/ai/model-context-protocol))
- **No write scoping:** API keys are org-scoped (`mint_*`). A key that can trigger an agent job can do so against any project in the org
- **GitHub App is repo-scoped:** The GitHub App controls which repos the agent can access, which provides repo-level write scoping. But within a repo, the agent has full access
- **No per-page write permissions:** Cannot grant an agent write access to specific sections/pages only

**Comparison to AFFiNE:** AFFiNE has no scoping at all — PATs are all-or-nothing under the user's workspaces. Mintlify is ahead on read scoping (user groups for MCP) and has implicit write scoping via GitHub App repo selection. But neither has fine-grained per-page write permissions.

**How far to close the gap:** Adding per-page or per-section write scoping would require: (1) a content-level permission model (which pages/sections can this agent edit?), (2) enforcement in the agent job pipeline (validate proposed changes against permissions), (3) dashboard UI for permission management. Estimated: 6-8 weeks. This is a meaningful product feature, not a trivial addition.

---

### Primitive 7: CRUD API surface

**Status:** READ ✓ (strong) / WRITE PARTIAL (LLM-mediated, not direct CRUD)

**Evidence:**
- **Read:** MCP Search + Get Page, llms.txt, llms-full.txt, content negotiation (text/markdown), `.md` URL suffix. Read surface is comprehensive and well-designed.
- **Write:** Agent Job API (`POST /v1/agent/{projectId}/job`) — Enterprise-only, admin API key, LLM-mediated. Does not accept raw content — accepts natural language instructions that the agent interprets.
- **No direct CRUD:** No `POST /pages` to create a page with specific content. No `PUT /pages/{id}` to update a page. No `DELETE /pages/{id}`. All writes go through the LLM agent pipeline.

**Comparison to AFFiNE:** AFFiNE (via community MCP server) has comprehensive direct CRUD: create_doc, update_doc, delete_doc, append_block, etc. Mintlify's write surface is more constrained (LLM-mediated, not direct). However, AFFiNE's CRUD is via a community server with one maintainer; Mintlify's Agent Job API is first-party and supported.

**How far to close the gap:** Adding direct CRUD (bypass the LLM agent, write raw content directly) would require: (1) a REST API for page CRUD, (2) content validation pipeline (ensure valid MDX, navigation updates), (3) the same auth/permission infrastructure. The LLM-mediated approach exists because docs have structure (navigation, cross-references, style) that raw CRUD would break. This is a deliberate product choice, not an oversight. Estimated: 4-6 weeks for a basic CRUD API, but Mintlify may intentionally avoid it to maintain content quality.

---

## Summary Scoreboard

| # | Primitive | Mintlify Status | AFFiNE Status | Mintlify Ahead? |
|---|---|---|---|---|
| 1 | Official 1P MCP server (write-capable) | READ-ONLY (first-party) | NOT FOUND (community only) | Yes (MCP exists, write gap smaller) |
| 2 | Agent identity | PARTIAL (mintlify[bot], not per-agent) | NOT FOUND (human PAT only) | Yes |
| 3 | Per-edit attribution | PARTIAL (commit-level via git) | NOT FOUND (Yjs client_id unexposed) | Yes |
| 4 | Staging / draft / review | CONFIRMED (git PRs) | NOT FOUND | Yes (categorically) |
| 5 | Event subscription | PARTIAL (inbound only) | NOT FOUND | Marginal |
| 6 | Scoped permissions | PARTIAL (read scoping, repo-level write) | NOT FOUND | Yes |
| 7 | CRUD API surface | READ ✓ / WRITE PARTIAL (LLM-mediated) | READ/WRITE via community MCP | Mixed (AFFiNE has direct CRUD) |

**Net assessment:** Mintlify scores PARTIAL or better on 6 of 7 primitives. AFFiNE scores NOT FOUND on 6 of 7. Mintlify is structurally closer to bidirectional co-creation on every dimension except direct CRUD (where AFFiNE's community server offers more granular write operations).

---

## Gaps / follow-ups

- Whether Mintlify intentionally avoids direct CRUD API to maintain content quality is a product strategy question
- Agent Job API v2 may address some gaps — not yet fully documented
- MCP spec evolution (write tools, notification channels) would change the landscape for all platforms
