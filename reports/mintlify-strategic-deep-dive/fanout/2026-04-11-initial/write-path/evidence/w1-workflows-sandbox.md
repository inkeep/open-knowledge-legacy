# Evidence: W1 — Workflows Sandbox Architecture Deep-Dive

**Dimension:** W1 (P0 Deep)
**Date:** 2026-04-11
**Sources:** Mintlify docs, Mintlify blog, Daytona GitHub + docs, Northflank/pixeljets comparisons, Mintlify GitHub org

---

## Key pages / repos referenced

- [Workflows — Mintlify Docs](https://www.mintlify.com/docs/agent/workflows) — canonical Workflow configuration reference
- [What is the agent? — Mintlify Docs](https://www.mintlify.com/docs/agent) — agent overview + GitHub App permissions
- [AI agents are shipping faster than anyone can document](https://www.mintlify.com/blog/knowledge-management-agent-era) — confirms Daytona + OpenCode stack
- [Mintlify + Claude Opus 4.6](https://www.mintlify.com/blog/opus-4-6) — LLM confirmation
- [Daytona Sandbox Dockerfile](https://github.com/daytonaio/daytona/blob/main/images/sandbox/Dockerfile) — pre-installed tooling
- [Daytona Sandboxes Docs](https://www.daytona.io/docs/en/sandboxes/) — resource defaults
- [Daytona Limits Docs](https://www.daytona.io/docs/en/limits/) — rate/resource limits
- [AI Sandboxes: Daytona vs microsandbox (pixeljets)](https://pixeljets.com/blog/ai-sandboxes-daytona-vs-microsandbox/) — isolation model comparison
- [Daytona vs E2B (Northflank)](https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes) — Docker container confirmation
- [GitHub — Mintlify Docs](https://www.mintlify.com/docs/deploy/github) — GitHub App permissions

---

## Findings

### Finding: Workflows run inside Daytona ephemeral Docker containers
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog ("Mintlify's agent runs on OpenCode and Daytona, inside sandboxed environments provisioned with your documentation and codebase"). Independent comparisons (pixeljets, Northflank) confirm Daytona uses Docker containers (OCI-compatible), not Firecracker microVMs. Daytona marketing language ("dedicated kernel, filesystem, network stack") is positioning — the GitHub README and architecture analysis confirm Docker containers with sub-90ms cold starts.

**Implications:** Docker container isolation is lighter than VM isolation. The sandbox is ephemeral — spun up per workflow run, destroyed after. This is a standard CI/CD-style execution model, not a persistent agent environment.

### Finding: The agent shell is headless OpenCode powered by Claude Opus 4.6
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog ("a headless OpenCode session powered by Opus 4.6 reads your content, plans the changes, edits files"). OpenCode is open-source; Mintlify runs it headlessly inside the Daytona sandbox.

**Implications:** The agent is a coding agent (OpenCode) with filesystem access, not a custom docs-editing agent. This means the write path is general-purpose: clone repo → run agentic coding loop → commit → PR. The agent can do anything a developer can do in a terminal, constrained only by the sandbox.

### Finding: Pre-installed tooling is developer-oriented, not docs-specific
**Confidence:** CONFIRMED
**Evidence:** Daytona Dockerfile reveals: Node.js v25, TypeScript, ts-node, Bun, git, GitHub CLI (`gh`), Mintlify CLI (`mint`), Python ML stack (NumPy, LangChain, Anthropic SDK), shell utilities (grep, sed, awk, curl, ripgrep), Chromium + VNC stack.

**Implications:** The sandbox is a full development environment, not a documentation-specific tool. This is consistent with Mintlify's Workflow model being a general-purpose agent runner that happens to be pointed at docs repos.

### Finding: Hard sandbox constraints — no runtime package installs, no external network
**Confidence:** CONFIRMED
**Evidence:** Mintlify docs: "cannot install additional packages or tools at runtime, package registries and other external services are not reachable."

**Implications:** This is the key architectural constraint. The sandbox is hermetic at runtime — it can read cloned repos and run pre-installed tools, but cannot fetch external data, install new tools, or reach external APIs. This fundamentally limits what the agent can do: it can edit files and create PRs, but cannot call external services, validate against live APIs, or pull in external context beyond the cloned repos.

### Finding: Resource limits — 1 vCPU, 1 GB RAM, 3 GB disk (default tier)
**Confidence:** CONFIRMED
**Evidence:** Daytona sandbox docs. Organization max: 4 vCPU, 8 GB RAM, 10 GB disk.

### Finding: Rate limit — 50 runs/day per workflow
**Confidence:** CONFIRMED
**Evidence:** Mintlify Workflows docs. Failed runs do not count. Cron-scheduled workflows queue within 10 minutes of scheduled time and may take up to 10 minutes to execute.

### Finding: Execution timeout — ~15 minutes (inferred from Daytona auto-stop)
**Confidence:** INFERRED
**Evidence:** Daytona's default auto-stop interval is 15 minutes of inactivity; ephemeral sandboxes are auto-deleted once stopped. Mintlify does not publicly disclose a hard timeout, but 15 minutes is the upper bound implied by the infrastructure.

### Finding: GitHub App authentication for PR creation
**Confidence:** CONFIRMED
**Evidence:** Mintlify docs: GitHub App must be installed on all referenced repos. Required permissions: checks (R/W), contents (R/W), deployments (R/W), pull requests (R/W), metadata (R).

PRs are attributed to "mintlify[bot]" by default. Users can connect personal GitHub accounts to attribute PRs to themselves instead.

For GitLab: personal access token with merge permissions required.

**Implications:** The authentication model is GitHub App server-to-server tokens (not user OAuth). The agent acts as the Mintlify bot, not as the user. This is a meaningful identity distinction — mintlify[bot] IS a distinct actor in git history.

### Finding: Full clone, up to 5 read-only context repos
**Confidence:** CONFIRMED
**Evidence:** Mintlify Workflows docs: "When a workflow runs, the agent clones any specified repositories as context." Docs repo gets write access (branch + PR); context repos are read-only. Up to 5 context repos.

### Finding: Binary approval model — PR review or automerge bypass
**Confidence:** CONFIRMED
**Evidence:** `automerge: false` (default) → agent opens a regular PR for human review. `automerge: true` → agent pushes directly to deploy branch (bypasses review). No intermediate draft PR mode. No multi-step approval gate beyond the PR itself.

**Implications:** The PR is the staging primitive. There is no concept of "propose a change and wait for approval before creating the PR" — the PR IS the proposal. This is functional staging via git, not a purpose-built staging system.

### Finding: Workflow runner is proprietary; Daytona and OpenCode are open-source
**Confidence:** CONFIRMED
**Evidence:** Mintlify GitHub org (26 public repos) contains no workflow execution infrastructure. Daytona is open-source (daytonaio/daytona, MIT-adjacent, 15k+ stars). OpenCode is open-source.

### Finding: AWS us-east-1 as primary cloud (inferred from egress IP)
**Confidence:** INFERRED
**Evidence:** Mintlify's GitHub IP allowlist docs list egress IP 54.242.90.151, which is an AWS us-east-1 IP.

---

## Negative searches

- Searched mintlify GitHub org for "workflow runner", "sandbox", "daytona" → no proprietary runner code found
- Searched for hard execution timeout → not publicly disclosed by Mintlify
- Searched for concurrency model (parallel workflow runs) → not documented
- Searched for credential injection mechanism (how GitHub App token enters sandbox) → not documented

---

## Gaps / follow-ups

- Exact credential injection mechanism into Daytona sandbox is undisclosed
- Whether Mintlify uses a custom Daytona image vs default sandbox image is unknown
- Concurrency model (parallel runs per org) is undocumented
- OOM behavior and timeout handling are undocumented
