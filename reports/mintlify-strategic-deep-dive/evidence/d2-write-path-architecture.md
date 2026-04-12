# Evidence: D2 — Write-Path Architecture + Bidirectional MCP Feasibility

**Dimension:** D2 (P0 Deep)
**Date:** 2026-04-11
**Sources:** docs.mintlify.com, mintlify.com/blog, daytona.io/docs, opencode.ai

---

## Key findings

### Finding: Three internal write channels exist, all on Daytona + OpenCode + Opus 4.6
**Confidence:** CONFIRMED
**Evidence:** [Workflows docs](https://www.mintlify.com/docs/agent/workflows), [KB Agent blog](https://www.mintlify.com/blog/kb-agent): "KB is powered by the same purpose-built harness that runs all of Mintlify's AI, built on OpenCode and Daytona." [Opus 4.6 blog](https://www.mintlify.com/blog/opus-4-6): confirms LLM. [Agent Job API docs](https://www.mintlify.com/docs/api/agent/create-agent-job): REST endpoint.
**Implication:** Production-grade write pipeline already exists and is customer-facing.

### Finding: Daytona sandbox specs — 1 vCPU, 1 GB RAM, 3 GB disk, sub-90ms cold starts
**Confidence:** CONFIRMED
**Evidence:** [Daytona limits docs](https://www.daytona.io/docs/en/limits/), [Daytona sandboxes docs](https://www.daytona.io/docs/en/sandboxes/). Hard sandbox: "Cannot install additional packages or tools at runtime, package registries and other external services are not reachable."
**Implication:** Hermetic execution — no external API calls, no runtime installs. All writes produce git PRs.

### Finding: 6 of 7 co-creation primitives PARTIAL or better
**Confidence:** CONFIRMED
**Evidence:** Primitive 1 (MCP server): [MCP docs](https://www.mintlify.com/docs/ai/model-context-protocol) — first-party, read-only. Primitive 2 (agent identity): PRs attributed to "mintlify[bot]" per [GitHub deploy docs](https://www.mintlify.com/docs/deploy/github). Primitive 4 (staging): all writes produce git PRs. Primitive 5 (events): [Workflows docs](https://www.mintlify.com/docs/agent/workflows) — triggered by git push, cron, Slack. Primitive 6 (permissions): repo-level via GitHub App installation tokens.
**Implication:** Categorically ahead of AFFiNE (NOT FOUND on 6/7).

### Finding: Engineering distance to bidirectional MCP — 4–8 weeks (Model A)
**Confidence:** INFERRED
**Evidence:** Model A (LLM-mediated write MCP) requires: MCP tool wrappers around existing Agent Job API + OAuth write scopes + rate limiting. All three base components exist. The Agent Job API already accepts natural language instructions via [REST endpoint](https://www.mintlify.com/docs/api/agent/create-agent-job).
**Implication:** The MCP framework, write pipeline, and API surface all exist. The delta is integration, not architecture.

### Finding: Per-edit attribution is a structural gap (git-based content model)
**Confidence:** CONFIRMED
**Evidence:** Mintlify content is MDX files in git. Attribution is at commit granularity (git blame). No CRDT or annotation layer exists.
**Implication:** Edit-level attribution ("agent wrote lines 5–10") would require a fundamentally different content model. Months, not weeks.

### Finding: No public signals from leadership about bidirectional MCP
**Confidence:** NOT FOUND
**Evidence:** Searched mintlify.com/blog, @handotdev (Twitter), HN comments for "bidirectional MCP", "write MCP", "agent write access" → no results. Public positioning emphasizes their agent as the exclusive write path.
**Implication:** Absence of signals does not mean absence of internal planning, but Mintlify is not telegraphing this direction.

---

## Vendor bias flag
All write-path capabilities are sourced from Mintlify's own docs and blog. No independent third-party validation of Agent Job API reliability, Workflow success rates, or KB Agent quality was found. Daytona specifications come from Daytona's own docs.
