# Evidence: D1 — Product trajectory and AI-KB pivot execution

**Dimension:** D1 (P0 Deep)
**Date:** 2026-04-11
**Sources:** github.com/toeverything/AFFiNE releases page, affine.pro/blog (402-paywalled), community MCP servers, vendor blog posts

---

## Key sources

- [GitHub releases (AFFiNE)](https://github.com/toeverything/AFFiNE/releases) — authoritative changelog, release cadence, dated tags
- [v0.25.0 release notes](https://github.com/toeverything/AFFiNE/releases/tag/v0.25.0) — AI-KB pivot announcement with Claude Sonnet 4.5 + Gemini 2.5 Pro + MCP
- [v0.26.0 release notes](https://github.com/toeverything/AFFiNE/releases/tag/v0.26.0) — Typst blocks, Google Calendar, local indexing, S3 compat
- [v0.26.3 release notes](https://github.com/toeverything/AFFiNE/releases/tag/v0.26.3) — MCP token fix, admin panel redesign, blob lazy-load (mobile)
- [DAWNCR0W/affine-mcp-server](https://github.com/DAWNCR0W/affine-mcp-server) — community MCP server, independent of toeverything
- affine.pro/blog — inaccessible (402 paywall), cannot independently verify vendor marketing claims

---

## Findings

### Finding: Post-v0.25.0 release trajectory does not reflect AI-KB pivot acceleration

**Confidence:** CONFIRMED
**Evidence:** GitHub releases page (v0.25.0 → v0.26.3), cross-referenced with changelog categorization

**Shipping categorization (v0.26.0–v0.26.3 aggregate):**

| Category | Count | Representative items |
|---|---|---|
| Infrastructure / self-host | 4 | S3 compat, admin panel redesign, blob lazy-load (mobile OOM), server-sync improvements |
| Editor / blocks | 3 | Typst code blocks, markdown frontmatter, PDF rendering |
| Collaboration | 2 | Google Calendar integration, workspace sharing |
| AI / agent / MCP | 0 new features (1 bug fix only: "Fixed MCP token display issues" in v0.26.3) |
| Bug-fix cluster | ~many | table sorting, Windows/Linux rendering, concurrent history dedup |

**Implication:** v0.26.x execution pattern is "platform maturity + enterprise self-host + editor polish," NOT "agent-native knowledge management." The landscape report's verdict ("announced pivot, executing as LLM-assisted editor") holds through Feb 2026. As of April 2026 canary builds, no reversal detected in stable trajectory.

---

### Finding: Release cadence is healthy but unrelated to pivot execution

**Confidence:** CONFIRMED
**Evidence:** Daily canary releases through v2026.4.10-canary.928 (April 10, 2026). Stable tags: v0.26.0 (Feb 6), v0.26.2 (Feb 8), v0.26.3 (Feb 25, 2026). 2–3 week stable cadence.

```text
v0.25.0 — AI-KB pivot + MCP + multi-model support  (see vendor claim, date uncertain*)
v0.25.5 — Nov (presumed 2025); external contributors cited
v0.25.7 — Dec (presumed 2025)
v0.26.0 — Feb 6, 2026  — Typst, Calendar, S3
v0.26.2 — Feb 8, 2026
v0.26.3 — Feb 25, 2026 — MCP token fix, admin panel, mobile blob lazy-load
canary daily — through April 10, 2026
```

*v0.25.0 date resolved during audit: **2025-10-13** per GitHub releases API (`GET /repos/toeverything/AFFiNE/releases/tags/v0.25.0` → `published_at: 2025-10-13T14:24:12Z`). The adjacent minor versions (v0.25.5 Nov 2025, v0.25.7 Dec 2025, v0.26.0 Feb 2026) are internally consistent with this date. ~6-month gap from pivot announcement (Oct 2025) to report date (April 2026) reinforces the "announced but not executing" verdict.

**Implication:** Cadence is not a proxy for feature magnitude. Daily canary + 2–3 week stable indicates mature CI/CD and active development, but the *content* of that development is infra-heavy, not AI-forward.

---

### Finding: Official MCP shipped in v0.25.0 but community built an alternative (DAWNCR0W/affine-mcp-server)

**Confidence:** CONFIRMED
**Evidence:** v0.25.0 release notes mention MCP feature exporting JSON config to Cursor/Claude. v0.26.3 release notes list "Fixed MCP token display issues" as an explicit bug fix. github.com/DAWNCR0W/affine-mcp-server exists as a separate community implementation.

```text
v0.26.3 changelog excerpt:
  "Fixed MCP token display issues"
```

**Implication:** (1) Official MCP exists but was shipped incomplete (bugs 4+ months after initial release suggest low iteration priority). (2) Community felt the need to build an alternative, suggesting the official surface does not meet agent-developer needs. Both are signals that MCP is a "checkbox feature," not a strategic pillar. (Detailed tool-catalog analysis is Subagent C's territory — see `d3-mcp-agent-surface.md`.)

---

### Finding: No new AI model integrations shipped in 2026 (v0.26.x)

**Confidence:** INFERRED (from absence in changelogs; blog paywalled)
**Evidence:** v0.25.0 added Claude Sonnet 4.5 + Gemini 2.5 Pro. v0.26.0 through v0.26.3 changelogs contain no new model announcements. Third-party summary references v0.25.0's multi-model support but lists no v0.26.x model updates.

**Negative search:** Searched GitHub releases for "GPT", "Claude", "Gemini", "model" in v0.26.x tags → no matches beyond v0.25.0.

**Implication:** If AFFiNE were actively pivoting to agent-native, model updates and agent capabilities would be visible in releases. Their absence through April 2026 supports the staleness verdict: the pivot is stated, not executed.

---

### Finding: Community demand signal for AI-KB features is weak on GitHub

**Confidence:** UNCERTAIN (GitHub may not be the primary channel for AFFiNE community; Discord not indexed)
**Evidence:** [Feature Request #13262 "API/MCP Support"](https://github.com/toeverything/AFFiNE/issues/13262) exists but engagement metrics not captured. Search for "MCP agent knowledge base 2026" in issues returned no organized thread.

**Negative search:** Searched issues for "agent co-creation", "attribution", "draft workflow" → no active threads found.

**Implication:** No organized community pressure on GitHub for agent-native features. Possibilities: (a) users don't expect AFFiNE to play in that space, (b) community has moved to Discord and we lack visibility, (c) power users who want agent features picked Obsidian + obsidian-skills instead. Any is plausible.

---

### Finding: Blog content (affine.pro/blog) inaccessible for independent verification

**Confidence:** NOT FOUND (tool limitation)
**Evidence:** affine.pro/blog returned HTTP 402 to the web fetcher. Cannot confirm or deny any post-Oct 2024 AI marketing.

**Negative search:** Attempted direct fetch + search-engine-cached copies of 2026 blog posts → paywall/inaccessible.

**Implication:** Vendor's own AI narrative cannot be audited from public sources. Any claim sourced from AFFiNE marketing (including "AI capability leap" phrasing from the Dec "What's New" post) must be treated as vendor-incentive biased and confirmed against shipped code / changelogs before use. **This limitation should be acknowledged in the final REPORT.md.**

---

## Vendor-bias flag

AFFiNE / toeverything is the vendor of the product under analysis. Release notes, pricing pages, and blog posts are vendor-incentive sources. Where findings rely on vendor claims without independent corroboration (e.g., "multi-model AI support" — we have the release note but not the code verification), confidence is capped at INFERRED.

---

## Gaps / follow-ups

- v0.25.0 exact release date (Oct 2024 vs Oct 2025) — verify from git tag timestamp during Path C propagation.
- Blog content verification requires authenticated access or alternative source (Wayback Machine, RSS archives).
- Discord / community-sentiment channel not covered in this pass; could change the "community demand is weak" finding.
- **Tension with Subagent C (when returned):** if Subagent C's MCP tool catalog reveals substantive agent primitives (identity, attribution, staging), that would contradict this dimension's "pivot not executing" verdict. Resolve in synthesis.
