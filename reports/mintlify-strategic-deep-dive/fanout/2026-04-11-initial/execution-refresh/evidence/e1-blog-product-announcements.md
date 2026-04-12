# Evidence: E1 — Post-April-2 Blog + Product Announcements

**Dimension:** Post-April-2026 blog + product announcements
**Date:** 2026-04-11
**Sources:** mintlify.com/blog, mintlify.com/docs/changelog, github.com/mintlify, HN Algolia

---

## Key pages referenced

- https://mintlify.com/blog/improved-cli — "The improved Mintlify CLI" (Apr 7)
- https://mintlify.com/blog/state-of-ai — "The state of agent traffic in documentation" (Apr 3)
- https://mintlify.com/blog/docs-on-autopilot — "Docs on autopilot" (Apr 3)
- mintlify.com/docs/changelog — April 10 and April 3 changelog entries
- https://news.ycombinator.com/item?id=47618223 — ChromaFs HN submission (Apr 2, 409 points)

---

## Findings

### Finding: Three blog posts published in the April 2–11 window
**Confidence:** CONFIRMED
**Evidence:** Direct page fetches from mintlify.com/blog

| Date | Title | Author | Category | Summary |
|------|-------|--------|----------|---------|
| Apr 7 | The improved Mintlify CLI | Han Wang (CEO) | Product launch | `mint analytics`, `mint login`/`logout`/`status`/`signup`, AI Assistant + search in local `mint dev`; positions CLI as interface for AI coding agents (Claude Code, Cursor, Devin) |
| Apr 3 | The state of agent traffic in documentation (March 2026) | Han Wang (CEO) | Data-driven positioning | 790M requests across Mintlify docs in 30 days: AI agents = 45.3% (357.6M), browsers = 45.8%; Claude Code alone = 199.4M requests (more than Chrome on Windows); Claude Code + Cursor = 95.6% of identified agent traffic |
| Apr 3 | Docs on autopilot: From zero to self-maintaining with Mintlify | Peri Langlois | Positioning / best practices | Combines auto-generate-from-GitHub + Workflows agent for self-maintaining docs |

**Vendor bias flag:** The "45.3% AI agent traffic" statistic comes from Mintlify's own analytics across their customer base. Methodology not independently verified. The data is plausible given Mintlify's position but should be treated as vendor-sourced.

### Finding: Two dense product changelogs shipped in the window
**Confidence:** CONFIRMED
**Evidence:** mintlify.com/docs/changelog, verified against GitHub mintlify/docs commits

#### April 10 Changelog — "CLI analytics, directory listings, multi-skill support, Slack bot improvements, and more"

New capabilities:
- `mint analytics` command with `stats`, `search`, `feedback`, `conversation list` subcommands; supports `--format json|table|graph|plain`
- **Directory listings** — navigation groups render child pages as "accordion" or "card" layout; targets help center use cases
- **Multi-skill support** — `.mintlify/skills/` directory with subdirectory-per-skill discovery
- **Slack agent improvements** — multi-deployment support; new read-only mode classifies intent before granting write access
- **Client credentials for authenticated MCP** — programmatic MCP access without browser login; for CI/CD and server-side integrations
- `mint new --template` flag for pre-defined project templates
- CLI auto-refreshes expired access tokens
- Assistant available in `mint dev` local previews
- OpenAPI `x-group` extension for grouping endpoints
- Workflows surface in dashboard inbox with PR names
- `mint export` now includes OpenAPI-generated API reference pages
- Finnish added as localization language

#### April 3 Changelog — "get_page MCP tool, password-protected previews, SAML group role mappings, and more"

New capabilities:
- **`get_page` MCP tool** — Mintlify-generated MCP servers now expose a `get_page` tool for full page content retrieval by path
- **Password-protected preview links**
- **SAML group role mappings** — auto-assign dashboard roles from SAML group attributes
- Editor configuration settings page redesigned with autosave
- OpenAPI-generated pages appear read-only in web editor
- Video support (mp4/webm/mov) in `mint dev` preview
- Workflows can be disabled/re-enabled from dashboard
- Assistant analytics show usage by source (web vs API)
- Authenticated MCP search filters by user auth groups
- Slack agent responses show tool call summaries

### Finding: Significant GitHub activity across multiple repos
**Confidence:** CONFIRMED
**Evidence:** GitHub mintlify org repository activity

| Repo | Activity Window | Notable |
|------|----------------|---------|
| mintlify/docs | 100+ commits, Apr 2–11 | Agent-generated translations (es/fr/zh), AGENTS.md + CLAUDE.md added Apr 2, MCP client credentials docs, multi-skill docs |
| mintlify/templates | Apr 10 | New `help-center-starter` template shipped (was "Banyan" internally) |
| mintlify/mintlify-claude-plugin | Apr 5–6 | Updated to match new CLI commands; dropped deprecated `mint rename` |
| mintlify/components | Apr 8 | `Columns` multi-column breakpoint fix |

No formal GitHub releases (tags) published in any mintlify/* repo during the window.

### Finding: ChromaFs HN post achieved 409 points
**Confidence:** CONFIRMED
**Evidence:** https://news.ycombinator.com/item?id=47618223

The "How we built a virtual filesystem for our Assistant" blog post (published March 24) was submitted to HN on April 2 by `denssumesh` (Mintlify engineer). 409 points, 43 comments. Mintlify employee `skeptrune` (Nick Khami, former Trieve co-founder) participated in comments. Top ~5% of that week's HN stories.

### Finding: No ProductHunt launch in the window
**Confidence:** CONFIRMED
**Evidence:** producthunt.com/products/mintlify/launches — last launch June 23, 2025 (#3 of day)

### Finding: Reddit activity not confirmable
**Confidence:** NOT FOUND
**Evidence:** Reddit API rate-limited unauthenticated requests. Web search for `site:reddit.com mintlify 2026` returned no indexed results.

### Finding: Pricing updated — Pro plan now $250/month (was $300 in prior research)
**Confidence:** CONFIRMED
**Evidence:** mintlify.com/pricing (fetched April 11, 2026)

| Plan | Price | AI Features |
|------|-------|-------------|
| Hobby | $0/month | No AI features, MCP/llms.txt auto-generated |
| Pro | $250/month | Agent, Assistant, Workflows |
| Enterprise | Custom | SSO, SAML, RBAC, SOC 2 |

The $300 figure in prior research appears stale. Multiple third-party review sites still cite $300, suggesting a quiet price reduction occurred between the April 2 snapshot and now.

**Implications:** Mintlify shipped at least 20+ discrete product improvements in 9 days. This is not an AFFiNE-style "announced but not shipped" pattern. The shipping velocity is notably high for a ~40-person team.

---

## Gaps / follow-ups

* Twitter/X activity blocked behind authentication — @mintlify and @handotdev tweets in the window could not be directly retrieved
* Reddit signal entirely opaque for this window
