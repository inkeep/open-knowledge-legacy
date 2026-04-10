# Evidence: D1 — Ingestion Capabilities

**Dimension:** Ingestion capabilities — Can you get content INTO Mintlify beyond writing MDX files?
**Date:** 2026-04-02
**Sources:** Mintlify official docs, blog posts, web editor documentation, KB Agent blog, Workflows docs

---

## Key pages referenced
- https://www.mintlify.com/docs/editor/getting-started — Web editor capabilities
- https://www.mintlify.com/docs/agent/workflows — Workflows (automated agent tasks)
- https://www.mintlify.com/blog/kb-agent — Internal KB Agent (Slack -> docs)
- https://www.mintlify.com/docs/quickstart — Getting started / content flow
- https://www.mintlify.com/docs/api/introduction — REST API endpoints

---

## Findings

### Finding: Mintlify has no dedicated content ingestion pipeline
**Confidence:** CONFIRMED
**Evidence:** Mintlify official docs, quickstart guide

Content enters Mintlify through exactly three paths:
1. **Git push** — Write MDX files, push to connected GitHub/GitLab repo, Mintlify auto-builds
2. **Web editor** — Create/edit pages in browser, changes auto-committed to git
3. **Mintlify Agent (Workflows)** — Automated agent reads code repos and creates documentation PRs

There is no import tool, no bulk ingestion API, no content migration utility, no file upload for raw sources (articles, PDFs, papers). The REST API has endpoints for triggering updates, creating agent jobs, and querying analytics — but NO endpoint for creating or uploading content.

**Implications:** For Karpathy's workflow, the "raw/" directory concept has no analog. You cannot ingest a collection of articles, papers, or repos into Mintlify. You must manually author MDX files or have an external agent push them via git.

### Finding: The web editor supports paste-and-edit but not structured import
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor/getting-started

The web editor allows:
- Visual (WYSIWYG) and Markdown editing modes
- Live preview
- AI-powered content generation, rewriting, restructuring
- Drag-and-drop navigation management
- Media asset management (image/video upload)

You CAN paste markdown content into the editor. But there is no "import from URL," "import from PDF," "import from clipboard with structure preservation," or batch import.

### Finding: The KB Agent (internal) demonstrates Slack-to-docs ingestion
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/kb-agent

The internal KB Agent can:
- Read Slack conversations and synthesize them into documentation
- Open GitHub PRs with the synthesized content
- Use agentic search (reformulates queries, searches variations)
- Follow AGENTS.md style guidelines

Key quote: "KB, document the case study pipeline from the thread above" — the agent reads the thread context and creates a structured doc page.

BUT: This is NOT a shipped product feature. It is described as an internal tool Mintlify built for itself. No product page, no pricing, no customer-facing documentation exists.

### Finding: Workflows can read from up to 5 external repos but only write docs
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/agent/workflows

Workflows configuration:
- `context`: Up to 5 additional repositories for read access
- The agent clones code and docs repos in ephemeral Daytona sandbox
- Can read code diffs and generate documentation updates
- Creates PRs or pushes directly

But Workflows are scoped to documentation maintenance — syncing docs with code, not ingesting arbitrary knowledge sources. The agent operates in a sandbox that "cannot install additional packages or tools at runtime" and "package registries and other external services are not reachable from the sandbox."

### Finding: External agents CAN push content via git
**Confidence:** CONFIRMED
**Evidence:** Mintlify architecture (git as source of truth)

Since Mintlify's content is MDX files in a git repo, any external system can:
1. Clone the repo
2. Write MDX files
3. Push to a branch
4. Mintlify auto-builds

This is not a Mintlify feature — it's a consequence of the git-backed architecture. An external agent (Claude Code, custom script) could implement ingestion by writing files to the repo.

---

## Negative searches

* Searched: "Mintlify import content", "Mintlify migration tool", "Mintlify bulk upload" — No import/migration tools found
* Searched: "Mintlify content API create page" — REST API has no content creation endpoints
* Searched: "Mintlify ingest PDF articles papers" — No document ingestion capabilities found

---

## Gaps / follow-ups

* The KB Agent's capabilities suggest Mintlify has the infrastructure for conversational ingestion — but it's not productized
* Whether external agents pushing via git triggers proper indexing for search/MCP is confirmed (auto-build on push)
