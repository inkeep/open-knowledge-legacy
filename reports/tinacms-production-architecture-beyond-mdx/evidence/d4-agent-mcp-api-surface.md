# Evidence: D4 — Agent / MCP / API Surface

**Dimension:** Agent / MCP / API surface for machine writes
**Date:** 2026-04-12
**Sources:** `~/.claude/oss-repos/tinacms`; tina.io; github.com; npm; mcp.so

---

## Key files / pages referenced

- `~/.claude/oss-repos/tinacms/AGENTS.md` (80 lines) — contributor guide for AI coding tools
- `~/.claude/oss-repos/tinacms/CLAUDE.md` (9 bytes, literal content: `AGENTS.md`) — text pointer to AGENTS.md
- `packages/@tinacms/graphql/src/builder/index.ts:307-411` — `createDocument` / `updateDocument` / `deleteDocument` mutation builders
- `packages/tinacms/src/unifiedClient/index.ts:1-200` — public `TinaClient` with `X-API-KEY` header, targets `content.tinajs.io`
- `packages/@tinacms/cli/src/index.ts:1-35` — CLI commands: `dev`, `build`, `audit`, `init`, `codemod`, `searchindex` (no agent/MCP)
- `packages/@tinacms/graphql/src/spec/forestry-sample/mutations/createDocument/_mutation.forestry.gql` — example mutation
- [tina.io/roadmap](https://tina.io/roadmap) — "MCP Server" under **Coming Soon** (accessed 2026-04-12)
- [tina.io/docs/vibe-coding](https://tina.io/docs/vibe-coding) — "Vibe Coding with TinaCMS" page, no MCP reference (accessed 2026-04-12)
- [tina.io/conference](https://tina.io/conference) — TinaCon 2025 MCP sessions (accessed 2026-04-12)
- [github.com/tinacms/github-content-auditor](https://github.com/tinacms/github-content-auditor) — official AI-powered content auditor GitHub Action
- [github.com/tinacms/tinacms/issues/6156](https://github.com/tinacms/tinacms/issues/6156) — Epic issue (open, 3/10 sub-issues done) for auditor
- [github.com/calumjs/TinaMCP](https://github.com/calumjs/TinaMCP) — third-party C# MCP prototype
- [tina.io/docs/reference/content-api/content-delivery](https://tina.io/docs/reference/content-api/content-delivery) (accessed 2026-04-12)
- [tina.io/blog/Introducing-TinaGPT-Chatbot-](https://tina.io/blog/Introducing-TinaGPT-Chatbot-) (accessed 2026-04-12)

---

## Findings

### Finding 1: `AGENTS.md` + `CLAUDE.md` are contributor guides for AI coding tools, NOT a consumer-facing agent API

**Confidence:** CONFIRMED
**Evidence:** Read full `AGENTS.md` (80 lines), accessed 2026-04-12. CLAUDE.md is a 9-byte text pointer containing only the string `AGENTS.md`.

Content is generic monorepo orientation: "This monorepo contains the core packages, CLI, admin app, and framework example apps," kitchen-sink collections table, build commands (`pnpm install`, `pnpm build`, `pnpm dev`, `pnpm test`), coding standards (Biome, strict TS, pnpm-only), a "Standardized Stack" table. Zero mentions of MCP, agent APIs, content-mutation workflows, or Tina-user agent integration. Purely aimed at AI agents helping contribute code to the repo.

**Implications for OK:** Tina has done the basic AI-coding hygiene (AGENTS.md + CLAUDE.md pointer) but has not published any equivalent for consumers writing agent workflows. OK ships an MCP server in the CLI itself — a leapfrog on the "machine write" axis.

---

### Finding 2: TinaCMS has a first-class typed GraphQL write API (create/update/delete document mutations)

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/graphql/src/builder/index.ts:307-411`. Builders `buildCreateCollectionDocumentMutation`, `buildUpdateCollectionDocumentMutation`, `buildDeleteCollectionDocumentMutation` produce schema-typed mutations:

```graphql
mutation {
  createDocument(collection: "stuff", relativePath: "my-stuff.md",
    params: { stuff: { template_1: { title: "Ok" } } }) { __typename }
}
```

Mutations are driven by the user's collection schema — an agent writing content via Tina writes *typed* content, schema-validated at the mutation boundary.

**Implications for OK:** Tina has a strong *existing* programmable write surface that an agent can use today without any MCP wrapper. Real competitive consideration: mutation API is schema-typed (better than "write arbitrary markdown to a file") — advantage over OK's current markdown append/prepend/replace. OK's patch API and targeted find/replace remain distinct, but Tina's typed mutations give agents stronger field-level validation.

---

### Finding 3: Tina's content write API uses a Tina Cloud `X-API-KEY` token; writes require a "wildcard token"

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/unifiedClient/index.ts:6` defines `TINA_HOST = 'content.tinajs.io'`; line 93 appends `X-API-KEY` header.

Public docs (tina.io/docs/reference/content-api/content-delivery, accessed 2026-04-12): *"Requests can be made to the Tina Content API with Read Only Tokens."* Web search confirmed: *"For write operations... the token must be a wildcard token (*) and can be generated from the tina dashboard."*

**Implications for OK:** Tina's write auth is a coarse "wildcard" token generated in Tina Cloud dashboard — not scoped by collection or operation. For agent workflows this is powerful but risky (one leaked token = full content-repo write). OK's server-side auth (trust the local CLI process) is simpler for local dev but doesn't generalize to cloud.

---

### Finding 4: TinaCMS has NO official MCP server implementation in the repo (but has it on the roadmap as "Coming Soon")

**Confidence:** CONFIRMED
**Evidence:** Grep over `~/.claude/oss-repos/tinacms` for `mcp|Model Context Protocol` (case-insensitive) returned only `pnpm-lock.yaml` — matches were base64-like integrity hashes, not substantive. Zero source-code matches.

[tina.io/roadmap](https://tina.io/roadmap) (accessed 2026-04-12) lists **MCP Server under "Coming Soon"**:

> "We're working on some ways to leverage AI in the content creation process."

Also listed: "Copilot Instructions" (planned) and `/llms.txt` exploration.

**Implications for OK:** Tina has *intent* but not *implementation*. OK shipped MCP in the CLI (`open-knowledge mcp`). OK's MCP-first posture is a ~6–12 month lead if Tina's "Coming Soon" reflects typical cadence. Differentiation window to market aggressively ("MCP-native since day one") before Tina closes the gap.

---

### Finding 5: The only TinaCMS MCP server is a third-party C# prototype — 1 star, experimental, presented at TinaCon 2025

**Confidence:** CONFIRMED
**Evidence:** [github.com/calumjs/TinaMCP](https://github.com/calumjs/TinaMCP) (accessed 2026-04-12 via mcp.so and GitHub fetch):

- C# implementation, **1 star, 0 forks, created April 29, 2025, single commit**
- Author `calumjs` = Calum Simpson, Solution Architect at SSW (hosts TinaCon). No affiliation with TinaCMS team
- Exposes ~12 tools: collection listing, document CRUD, move/copy/rename, frontmatter manipulation, schema inspection
- Operates on local file system, not through Tina's GraphQL API
- README: *"This enables AI models or other MCP clients to list, read, create, update, and delete content files within a TinaCMS site via the standardized MCP."*

Presented at TinaCon 2025 as **"Hacking Content Creation: Building a TinaCMS MCP Prototype"** by Calum Simpson, 3-4 PM slot ([tina.io/conference](https://tina.io/conference), accessed 2026-04-12):

> "I'll walk you through an experimental Tina MCP Server — a prototype for generating and managing TinaCMS content using MCP workflows."

**Implications for OK:** Community-level MCP traction for Tina is microscopic (1-star, single-commit prototype). No npm package for `tinacms-mcp`, `tina-mcp`, or `@tinacms/mcp`. OK's Node/TypeScript MCP server dramatically out-serves the JS ecosystem once people go looking — C# is an odd choice for a TypeScript CMS's audience.

---

### Finding 6: Tina shipped an AI-powered content auditor GitHub Action (not MCP, but agentic) in December 2025

**Confidence:** CONFIRMED
**Evidence:** [github.com/tinacms/github-content-auditor](https://github.com/tinacms/github-content-auditor) (accessed 2026-04-12):

- **Created December 8, 2025**, 190 commits on main, Apache-2.0, TypeScript 67.8% / MDX 28.6%, 0 stars / 0 forks at time of check
- README: *"This repository provides a reusable GitHub Action workflow and helper scripts to audit content in a TinaCMS-powered repo. It queries your Tina content, runs AI feedback on selected files, opens issues with suggestions, and creates a PR to update the `lastChecked` timestamp."*
- Uses **GitHub Models** (not Anthropic / OpenAI directly) with customizable `TINA_AUDITOR_SYSTEM_PROMPT`
- Three jobs: `query-tina-content`, `generate-feedback`, `update-checked`
- Triggered via `workflow_dispatch`

Spec issue [#6156](https://github.com/tinacms/tinacms/issues/6156) (opened Nov 24, 2025 by Calinator444/Caleb Williams at SSW) — Epic with 3/10 sub-issues complete — routes content updates to **GitHub Copilot** for drafting with human review gates.

**Implications for OK:** Tina's agent posture is *GitHub-Action-centric* (batch, scheduled, CI-driven) rather than *interactive-editor-centric* (local MCP, agent co-editing in the editor). Different axis entirely. OK's interactive-agent posture (in-editor awareness of agent writes via Y.Map('activity') flash) is orthogonal — Tina has nothing like it. Potential partnership angle: Tina's editors could consume OK's collaboration primitives for live agent co-edit. Competitive angle: OK's story is "real-time agent + human in one editor"; Tina's is "periodic AI freshness checks via PR." Very different selling motions.

---

### Finding 7: The copilot-swe-agent GitHub bot has authored ~5+ TinaCMS core PRs

**Confidence:** CONFIRMED
**Evidence:** Grep in changelogs: `packages/tinacms/CHANGELOG.md:278,298,350,409`, `packages/create-tina-app/CHANGELOG.md:64`, and 5 more packages. Examples: "[#6206] Redirect to collection page after creating content on protected branch" (Thanks [@copilot-swe-agent]), "[#5822] Migrate from react-beautiful-dnd to dnd-kit" (Thanks [@copilot-swe-agent]). GitHub Copilot autonomous-agent-authored PRs merged into mainline.

**Implications for OK:** Tina *uses* agents for their own development. Dogfooding at contributor level but doesn't ship anything to Tina consumers.

---

### Finding 8: Tina has a "Vibe Coding" docs page for AI-assisted development — but about IDE usage, not exposing Tina to agents

**Confidence:** CONFIRMED
**Evidence:** [tina.io/docs/vibe-coding](https://tina.io/docs/vibe-coding) (accessed 2026-04-12). Recommends "Visual Studio Code with GitHub Copilot or Cursor" and "GitHub Copilot CLI." Eight collaboration patterns. Philosophy: *"AI won't build your site for you, but it will build with you."* **No MCP mention.** No agent-authoring-content workflow.

This is about using AI to help a *developer* build a Tina-powered site, not about agents *writing content* through Tina.

**Implications for OK:** Tina's "agent" posture in docs is entirely developer-ergonomics (build-time), not content-authoring (run-time). OK targets run-time content-authoring — different customer job-to-be-done.

---

### Finding 9: TinaGPT is a support chatbot, not a content-editing agent

**Confidence:** CONFIRMED
**Evidence:** [tina.io/blog/Introducing-TinaGPT-Chatbot-](https://tina.io/blog/Introducing-TinaGPT-Chatbot-) (announced June 6, 2024, accessed 2026-04-12). Core claim: *"It has access all the Tina documentation."* Orange chat bubble UI. No ability to mutate content. No MCP. Framed as doc-Q&A only.

**Implications for OK:** TinaGPT is retrieval-augmented doc chatbot (standard SaaS feature). Not competitive with OK's MCP agent-write API.

---

### Finding 10: Tina's CLI has no agent/MCP commands

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/cli/src/index.ts:24-29` registers only: `DevCommand`, `BuildCommand`, `AuditCommand`, `InitCommand`, `CodemodCommand`, `SearchIndexCommand`. No `mcp`, `agent`, `server`, or equivalent.

**Implications for OK:** OK's `open-knowledge mcp` CLI command is a distinct product surface with no Tina equivalent. OK's MCP-in-CLI is a clean differentiator.

---

## Negative searches

- `mcp|Model Context Protocol` across TinaCMS source → only pnpm-lock.yaml hash collisions, zero substantive matches
- npm search `tinacms-mcp`, `tina-mcp`, `@tinacms/mcp` → **zero packages published**
- `anthropic|claude|openai|llm|ai|agent` (case-insensitive) in TinaCMS source → only CHANGELOG entries crediting `@copilot-swe-agent` contributor PRs; `schema-tools` test file matched on word "ai" inside schema names; Hugo example robots.txt. Zero product code.
- Official Tina-authored MCP repo under `github.com/tinacms/*` → not found. Only Tina-org AI work is `tinacms/github-content-auditor`.
- Tina docs for "agent" as machine-consumer → all hits about human editors or the CMS admin app, not MCP-style agent access.

---

## Gaps / follow-ups

- **TinaCon 2026 slate** — TinaCon 2025 had two AI/MCP sessions (Hajir Lesani + Calum Simpson). Worth checking Q4 2026 whether Tina signals more formal MCP commitment.
- **Roadmap slot velocity** — "MCP Server" is currently "Coming Soon." Tracking how long it stays there vs. moves to "Working on It Now" tells us how serious Tina is.
- **Calum Simpson / SSW relationship** — SSW hosts TinaCon and employs the only TinaCMS MCP prototype author. Worth understanding if SSW is effectively Tina's AI skunkworks.
- **Write-token scoping** — Confirmed wildcard token for writes. Didn't dig into whether Tina plans per-collection or per-operation scoping.
- Did not verify 118-case mutation behavior against Tina Cloud hosted GraphQL; only verified local schema generation in source.
