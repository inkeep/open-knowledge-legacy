---
title: "AFFiNE Strategic Deep Dive: Pivot Execution, BlockSuite Substrate, and the Missing Agent Layer"
description: "Deep investigation of AFFiNE's announced AI knowledge base pivot, BlockSuite/y-octo as alternative editor substrates, MCP tool surface, and the absence of a SKILL.md-style agent distribution strategy. Ground truth for calibrating AFFiNE's competitive position against an agent-native knowledge platform bet."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - AFFiNE
  - BlockSuite
  - y-octo
  - toeverything
  - Obsidian
  - obsidian-skills
topics:
  - competitive analysis
  - CRDT editor substrate
  - MCP agent surface
  - agent co-creation primitives
  - OSS knowledge platform
---

# AFFiNE Strategic Deep Dive: Pivot Execution, BlockSuite Substrate, and the Missing Agent Layer

**Purpose:** AFFiNE is the only MIT-licensed CRDT-native rich editor at scale (67K stars) and was ranked Tier-1 ("Medium probability of overlap — most technically capable potential entrant") in the openknowledge-competitive-landscape report (updated 2026-04-07). That ranking rested on three load-bearing claims: an announced "AI knowledge base" pivot (v0.25.0), BlockSuite as a reusable editor toolkit, and a CRDT architecture that "could technically support agents as Yjs peers." This report stress-tests each claim against shipped code + changelogs + community signals through April 2026.

---

## 1. Executive Summary

Every load-bearing claim softens or falls on inspection.

**The AI knowledge base pivot is announced, not executing.** AFFiNE v0.25.0 introduced multi-model AI + an MCP token UI. The subsequent stable trajectory (v0.26.0 → v0.26.3, Feb 6–Feb 25, 2026) shipped zero new AI features and one MCP bug fix, while shipping four infrastructure/self-host features (S3 compat, admin panel redesign, blob lazy-load for mobile, server sync). Daily canary builds through April 10, 2026 continue this pattern. The pivot narrative is vendor marketing; the execution is enterprise self-host consolidation.

**BlockSuite is not a reusable toolkit — it's a dormant downstream mirror of AFFiNE.** The standalone `toeverything/blocksuite` repo has had **zero commits on `main` in the last 9 months** (last sync PR `#9149` dated 2025-07-07); only renovate vulnerability-bump branches show activity. Published npm packages are version-fragmented (`@blocksuite/store` at 0.22.4, `@blocksuite/blocks` at 0.19.5, last publishes 9–16 months stale) and pre-1.0 with 1337+ cumulative versions. Zero credible non-AFFiNE production adopters. Architecturally Web Components / Lit-based — not a substitute for ProseMirror/TipTap ecosystems.

**y-octo is internal infrastructure, not an external reference implementation.** Pre-1.0 forever (v0.0.2), three maintainers, 13 commits in 6 months. Yjs-compatible for update v1 but v2 is still WIP. The crate is published to crates.io but stalled at 0.0.2 (last update 2026-01-10, never reached 0.1.0); the Node binding (`y-octo-node`) is unpublished (`"private": true`); Swift/Kotlin bindings "coming soon" but not in the public repo. Production use limited to AFFiNE + Mysc (both toeverything-adjacent).

**The MCP surface is real but all-CRUD, and it's a single-maintainer community project.** There is no first-party AFFiNE MCP server — the product ships a UI that generates JSON config for external servers. The sole production implementation is `DAWNCR0W/affine-mcp-server` (v1.13.0, April 10, 2026), with ~36 canonical tools (or ~107 including semantic workflows). The landscape report's "76 tools" count was a mid-version snapshot; the exact number drifts weekly. More consequentially, six of the seven agent co-creation primitives that open-knowledge's thesis depends on are absent: no agent identity, no per-edit attribution, no staging/review workflow, no event subscriptions, no scoped permissions — only CRUD, under the human user's PAT.

**AFFiNE has no D8-equivalent.** Searched GitHub, npm, agentskills.io, Claude plugin marketplace, and community repos: no SKILL.md for AFFiNE, no `.claude-plugin/`, no cursor-rules, no `npx skills add` registry entry. The largest AFFiNE-AI community repo is 140 stars (DAWNCR0W MCP server) — 0.6% the reach of Obsidian's kepano-led agent-skills ecosystem (22.6K stars). This is structural: AFFiNE's AI strategy is product-bundled (BYOK + in-product LLMs), not ecosystem-externalized.

**Business signals reinforce the execution gap.** No new funding since October 2023 ($18M total across two seed rounds). Team ~21 people, Singapore-based, founder-led. No named enterprise customers. No public layoff or distress signal, but no aggressive hiring either — consistent with a runway-preserving posture focused on enterprise-tier completion (the E.E. tier is "yet to be published").

**Key findings:**

- **AI-KB pivot not executing.** v0.26.x trajectory is infrastructure and editor polish, not agent-native features.
- **BlockSuite reusability is aspirational.** Downstream mirror, version-fragmented packages, zero external adopters, architecturally incompatible with ProseMirror.
- **y-octo is toeverything-internal plumbing.** Useful as a Rust-CRDT reference; not a practical external dependency.
- **MCP is CRUD-only; 6 of 7 co-creation primitives absent.** No identity, attribution, staging, events, or scoped permissions.
- **No SKILL.md-style agent distribution.** Structural feature of AFFiNE's architecture + business model, not a gap that will close organically.
- **Capital-constrained.** 17+ months post-seed, small team, enterprise GTM incomplete. Cannot fund parallel AI-agent + platform workstreams.

---

## 2. Research Rubric

| # | Dimension | Priority | Stance |
|---|---|---|---|
| D1 | Product trajectory + AI-KB pivot execution | P0 Deep | Factual — verify the landscape report's "announced but not shipped" verdict |
| D2 | BlockSuite architecture + reusability | P0 Deep | Factual — assess the "reusable toolkit" claim in 2026 |
| D3 | MCP surface + agent co-creation primitives | P0 Deep | Factual — enumerate tools; check identity/attribution/staging/events |
| D4 | Agent/format distribution strategy (D8-equivalent audit) | P0 Deep | Factual — scan for obsidian-skills analog |
| D5 | Content-format fidelity + git-compat | P1 Moderate | Factual — verify markdown adapter data-loss caveats |
| D6 | y-octo CRDT engine maturity | P1 Moderate | Factual — assess external-adoption viability |
| D7 | Business + community signals | P2 Quick | Factual — calibrate threat context |

**Non-goals:** self-hosting operational reality; whiteboard/Canvas feature depth; performance benchmarks; open-knowledge architecture recommendations (3P framing — implications flow to the competitive landscape via Path C, not this report).

---

## 3. Detailed Findings

### D1: Product trajectory + AI-KB pivot execution

**Finding:** AFFiNE's shipped trajectory through April 2026 is inconsistent with an AI knowledge base pivot. It is consistent with "LLM-assisted editing + standard editor + enterprise self-host consolidation."

**Evidence:** [evidence/d1-product-trajectory.md](evidence/d1-product-trajectory.md)

**Shipping categorization (v0.26.0 → v0.26.3 aggregate, Feb 6 – Feb 25, 2026):**

| Category | Count | Representative |
|---|---|---|
| Infrastructure / self-host | 4 | S3 compat, admin panel redesign, blob lazy-load (mobile OOM fix), server sync |
| Editor / blocks | 3 | Typst code blocks, markdown frontmatter, PDF rendering |
| Collaboration | 2 | Google Calendar integration, workspace sharing |
| AI / agent / MCP (new features) | 0 | — |
| AI / MCP (bug fixes) | 1 | "Fixed MCP token display issues" |

Daily canary releases through v2026.4.10-canary.928 (April 10, 2026) continue this pattern without new AI feature announcements.

**Implications:**
- The landscape report's verdict ("announced pivot, executing as LLM-assisted editor") holds through April 2026.
- Enterprise self-host is the de facto product direction; AI-KB is marketing positioning.
- The v0.26.3 "MCP token display" bug fix four months after initial MCP release is a weak iteration signal for agent features.

**Decision triggers (when this matters):**
- If AFFiNE ships any of: agent identity in MCP, per-edit attribution, staging/review workflow, SKILL.md registry entry — the pivot claim becomes real. None of these appeared in v0.26.x or current canary.
- If v0.26.3 was a pre-pivot consolidation and v0.27.x launches with agent-native features, this assessment flips. No public signal of such plans as of 2026-04-11.

**Remaining uncertainty:** affine.pro/blog returned HTTP 402 to independent web fetchers; vendor marketing claims since Oct 2024 could not be audited directly. Only shipped code + public changelogs were verified. If the blog carries unannounced commitments to agent-native features that later ship, this finding becomes stale faster.

---

### D2: BlockSuite architecture + reusability

**Finding:** BlockSuite is operationally a downstream mirror of the AFFiNE monorepo, not an independently maintained reusable toolkit. The "reusable toolkit" framing in the landscape report is aspirational; the 2026 reality is a fragmented, pre-1.0, architecturally-bound library with zero external production adopters.

**Evidence:** [evidence/d2-blocksuite-architecture.md](evidence/d2-blocksuite-architecture.md)

**Key evidence points:**
- Last 9 months of blocksuite repo activity: **zero commits on `main`**. The most recent sync PR (`#9149` "chore: sync affine blocksuite to packages") dates to 2025-07-07. Only renovate vulnerability-bump branches show activity since.
- Published npm state: `@blocksuite/store@0.22.4` (9 months old, last publish 2025-07-01), `@blocksuite/blocks@0.19.5` (~16 months old, last publish 2024-12-19). 1337+ cumulative versions, no semver majors.
- `defineBlockSchema` API is CRDT-native and functional; no CHANGELOG tracks breaking changes.
- Architecture: Web Components / Lit — no ProseMirror or TipTap compatibility. Not a drop-in substitute for any ProseMirror-based editor.
- Adapter layer exists (markdown, notion-html, plain-text) but fidelity is undocumented; live bugs in markdown export (see D5).
- No credible non-AFFiNE production adopter identified.

**Implications:**
- BlockSuite is not a competitive substrate for a TipTap/ProseMirror project. Architectural and organizational barriers are both substantial.
- BlockSuite *is* a useful reference for CRDT-native block schema design — `defineBlockSchema` encodes structured content over Yjs cleanly — but adoption would require forking or rewriting against an unstable upstream.
- The landscape report's "most architecturally ambitious editor in the landscape" description should be read as "most ambitious within AFFiNE," not "most credible as a reusable platform."

**Decision triggers:**
- A BlockSuite 1.0.0 + unified versioning + independent maintenance + external adopters would reopen this assessment. None of these signals are present.

---

### D3: MCP surface and agent co-creation primitives

**Finding:** AFFiNE's MCP surface is a capable but vendor-less CRUD API. Six of seven co-creation primitives that distinguish agent-native platforms from CRUD-with-agents platforms are absent.

**Evidence:** [evidence/d3-mcp-agent-surface.md](evidence/d3-mcp-agent-surface.md)

**Tool catalog summary** (DAWNCR0W/affine-mcp-server v1.13.0, the only production MCP for AFFiNE):

- ~36 canonical atomic tools (Glama schema count)
- ~107 total entries when semantic workflows (`semantic_page`, `compose_database_from_intent`) and batch operations are included
- Read-only: ~10 (workspace/doc enumeration, search, histories, notifications, current_user)
- Read-write: ~26 (CRUD on docs, blocks, comments, databases, collections, blobs, PATs)

The landscape report's "76 tools" count was a v1.x mid-version snapshot; the number drifts upward with each release as semantic workflows are added.

**Co-creation primitive scoreboard:**

| Primitive | AFFiNE state |
|---|---|
| Official first-party MCP server | ✗ — community single-maintainer (DAWNCR0W) only |
| Agent identity (distinct from human) | ✗ — agents use human's PAT |
| Per-edit attribution in history | ✗ — document snapshots + timestamps, no per-edit author |
| Staging / draft / review workflow | ✗ — all writes immediate |
| Event subscription (push to agents) | ✗ — polling only; WebSocket is for CRDT sync |
| Scoped permissions (per-workspace / per-page) | ✗ — PATs are all-or-nothing |
| CRUD API surface | ✓ — comprehensive |

**Implications:**
- AFFiNE's MCP surface is a CRUD-with-agents platform, not agent-native. Matches the landscape report's broader finding that *no* competitor supports agent co-creation — but AFFiNE's gap is unusually clean: it has the CRDT plumbing (Yjs `client_id` per client) but does not expose per-edit attribution at any user-visible surface.
- The single-maintainer community server is both the strongest AFFiNE-AI integration and a bus-factor risk.

**Decision triggers:**
- If AFFiNE ships a first-party MCP server with agent-scoped PATs and attribution exposure, 3 of 7 primitives close at once.
- If DAWNCR0W adds a draft-mode wrapper, the staging/review gap closes for power users (not the product proper).

---

### D4: Agent/format distribution strategy (D8-equivalent audit)

**Finding:** AFFiNE has no SKILL.md-style agent distribution. The gap is structural, not accidental.

**Evidence:** [evidence/d4-distribution-strategy.md](evidence/d4-distribution-strategy.md)

**Negative-search summary:**

| Search | Result |
|---|---|
| SKILL.md in toeverything org | NOT FOUND |
| `.claude-plugin/` in AFFiNE repo | NOT FOUND |
| AFFiNE entry in `skills` npm registry / agentskills.io | NOT FOUND |
| cursor-rules for AFFiNE in community rule repos | NOT FOUND |
| `@blocksuite/agent-skills` or `@affine/skills` on npm | NOT FOUND |
| Any kepano-equivalent community figure for AFFiNE | NOT FOUND |

**Scale comparison:**

| Project | Stars (2026-04-11) |
|---|---|
| `kepano/obsidian-skills` | 22,662 |
| `DAWNCR0W/affine-mcp-server` (largest AFFiNE-AI community repo) | 140 |
| `tomohiro-owada/affine-cli` | 9 |

AFFiNE's agent-integration community is ~0.6% the scale of Obsidian's (roughly 162× smaller).

**Structural explanation** (why the gap won't close organically):
1. **CRDT-binary canonical format is not agent-friendly.** obsidian-skills works because agents can `read/write /path/to/note.md` directly. AFFiNE agents need MCP orchestration through a lossy adapter (see D5).
2. **Product-bundled LLM strategy is ecosystem-suppressing.** AFFiNE sells in-product AI. Externalizing format intelligence competes with their own LLM revenue capture.
3. **No CEO-scale distribution figure.** Obsidian has `@kepano` with a 22.6K-star personal authority. AFFiNE's founders do not have a comparable community distribution engine.

**Implications:**
- AFFiNE is structurally absent from the agent-format-distribution layer. Obsidian (markdown + kepano) owns it by default.
- Open-knowledge's opportunity to own "agent-native knowledge primitives" distribution (markdown + git + CRDT + co-creation) is uncontested by AFFiNE.

**Decision triggers:**
- If AFFiNE publishes `@blocksuite/agent-skills`, an MCP-native format spec at scale, or a Claude-plugin marketplace entry with >500 stars, the structural framing breaks. As of 2026-04-11, no such artifact exists or is signaled.

---

### D5: Content-format fidelity and git-compat

**Finding:** AFFiNE's markdown adapter is documented-lossy and practice-buggy. CRDT binary remains canonical; no markdown-as-canonical direction is signaled.

**Evidence:** [evidence/d5-format-fidelity.md](evidence/d5-format-fidelity.md)

**Key evidence:**
- docs.affine.pro carries verbatim language: *"adapters may result in data loss during the conversion process, as the target format might not support all the structures present in the original data."* Example given: background colors cannot be represented in plain text.
- Live BlockSuite issues confirm practical fidelity issues:
  - [#6043](https://github.com/toeverything/blocksuite/issues/6043) "Broken formatting when exporting as markdown"
  - [#2854](https://github.com/toeverything/blocksuite/issues/2854) "Empty content in exported file"
  - [#6291](https://github.com/toeverything/blocksuite/issues/6291) ongoing markdown import/export work
- 2026 docs still describe CRDT snapshot as canonical. No markdown-canonical mode in v0.26.x release notes.

**Implications:**
- Git-native workflows on AFFiNE content (edit-in-AFFiNE → commit-as-markdown → review-merge) are infeasible today. Binary diffs on the canonical format + lossy-buggy markdown export make this structurally hard, not just tactically missing.
- AFFiNE's format philosophy is not converging toward the Obsidian/Mintlify/open-knowledge markdown-canonical camp. The divergence is deep in BlockSuite's foundations.

**Decision triggers:**
- A markdown-canonical mode for AFFiNE would be an architecturally major undertaking. No signal.

---

### D6: y-octo CRDT engine maturity

**Finding:** y-octo is a toeverything-internal Rust/Node CRDT library with legitimate technical merits (addressing real yrs safety issues) but is impractical as an external dependency.

**Evidence:** [evidence/d6-y-octo-maturity.md](evidence/d6-y-octo-maturity.md)

**Key evidence:**
- Version: `0.0.2` on crates.io — last update 2026-01-10, never reached 0.1.0.
- Maintainers: 3 named; 13 commits in last 6 months; one contributor (DarkSky) accounts for 11 of 13.
- Yjs-compat: update v1 done, v2 WIP. Not a drop-in replacement.
- yrs rejection is technically defensible: a 4-byte input to `Update::decode_v1` allocates 538 MB in yrs; yrs panics instead of returning `Result`; yrs lacks `Send`/`Sync`.
- Distribution: crates.io publication stalled at 0.0.2 (pre-alpha); no public npm package for `y-octo-node` (`"private": true`); no Swift/Kotlin bindings in-repo despite Mysc using them in production.
- Production users named: AFFiNE + Mysc only.

**Implications:**
- For a JS/TS editor stack using yjs + y-prosemirror, y-octo is not applicable — it's a Rust/mobile infrastructure library.
- As a reference for *designing* Rust-backed CRDT servers, the `yrs-is-unsafe` critique is the most valuable public artifact in the repo.

**Decision triggers:**
- If y-octo reaches 1.0.0 on crates.io (currently stalled at 0.0.2), publishes `y-octo-node` to npm, and gains external non-toeverything adopters, external-dependency viability opens.

---

### D7: Business and community signals

**Finding:** 17+ months without new capital. Small team. Enterprise tier incomplete. No public distress signal, but no aggressive expansion either. Consistent with a runway-preserving posture that constrains parallel AI + platform execution.

**Evidence:** [evidence/d7-business-signals.md](evidence/d7-business-signals.md)

**Key evidence:**
- Last funding round: $10M seed, October 2023 (Redpoint + Sinovation). $18M total across 2 seed rounds. No Series A.
- Team: ~21 employees per Tracxn ("11–50" band per LinkedIn). Singapore HQ. Founder-led.
- No layoffs, hiring freezes, or news signals of distress.
- No named enterprise customers. Enterprise tier ("E.E.") docs list SSO and rebranding as "yet to be published."
- Release cadence healthy (daily canary, 2–3 week stable) but content-categorization (D1) shows infra focus.
- External contributor base thin; development is core-team-driven.

**Implications:**
- Capital constraint explains the shipped-trajectory prioritization: enterprise self-host (which has a monetization path) over AI-KB innovation (which competes with deep-pocketed incumbents).
- Small team + no recent capital → cannot pursue collaboration + AI-agent + enterprise GTM + ecosystem distribution in parallel. Current choices prioritize enterprise over ecosystem.

**Decision triggers:**
- A Series A announcement would shift capacity assumptions. None reported.
- Named enterprise customer wins would validate the GTM direction. None public.

---

## 4. Synthesis: The Coherent Pattern

The dimensional findings converge on a coherent story. AFFiNE's 2026 posture is a **runway-constrained enterprise-self-host play with AI marketing**, not an agent-native knowledge platform contender. Three mutually reinforcing forces sustain this:

1. **Capital constraint (D7)** → prioritizes monetization-near work (enterprise tier, self-host polish).
2. **Architectural constraint (D2/D5/D6)** → CRDT-binary canonical format + Web Components substrate + internal CRDT engine → rules out markdown-native agent workflows and gates community adoption.
3. **Strategic constraint (D3/D4)** → product-bundled LLM strategy suppresses ecosystem externalization; no SKILL.md-style distribution emerged; no agent co-creation primitives shipped.

Each constraint would be hard to unwind; together they are nearly locked. A true agent-native pivot would require: new capital (Series A), architectural work on attribution/staging/events (D3), and ecosystem externalization that competes with in-product LLM revenue (D4). None is currently signaled.

**The landscape report's Tier-1 placement for AFFiNE ("Medium probability of overlap — most technically capable potential entrant") overweights technical capability and announced pivot, and underweights execution, economics, and ecosystem structure.** Technical capability alone does not produce a competing product when capital and strategy are aligned elsewhere.

---

## 5. Competitive Positioning Implications (3P framing)

*These observations characterize AFFiNE's external-facing competitive posture. Decisions about how open-knowledge should act on these findings flow through derivative updates to the `openknowledge-competitive-landscape/` report — not this document.*

- **AFFiNE's axis of competition is enterprise self-host + rich collaborative editing**, not agent-native knowledge management. Products targeting the same space would compete with Notion, Confluence, and Outline — not with agent-native entrants.
- **BlockSuite is not a substrate substitute** for ProseMirror/TipTap ecosystems. Any editor-framework competitive pressure on open-knowledge comes from the TipTap/Yjs stack itself, not from BlockSuite.
- **The agent-format-distribution layer is still owned by Obsidian** (via kepano/obsidian-skills, 22.6K stars, 33+ compatible agents). AFFiNE does not contest this surface.
- **Agent co-creation primitives remain unclaimed** across the landscape. AFFiNE's 6-of-7-gap matches the landscape report's broader finding that no competitor has built these primitives.

---

## 6. Limitations & Open Questions

### Dimensions not fully covered

- **Blog content unverified.** affine.pro/blog returned HTTP 402 to independent fetchers. All vendor-marketing claims since Oct 2024 (e.g., the Dec "What's New" positioning) could not be audited against primary sources. If the blog commits to unannounced agent-native features, D1's verdict becomes stale faster. Flagged as UNCERTAIN.
- **Discord / Twitter community sentiment not surveyed.** GitHub-based signals for community demand (D1) may undercount. Unlikely to change dimensional findings but could shift confidence on "community demand is weak."
- **Hands-on fidelity benchmark (D5) not performed.** Documented data-loss language + live bugs support the finding, but a write-export-reimport-diff test would quantify degradation.
- **v0.25.0 date: confirmed Oct 13, 2025** (per GitHub releases API, resolved during audit). Originally flagged as uncertain; now pinned. The adjacent minor versions (v0.25.5 Nov 2025, v0.25.7 Dec 2025, v0.26.0 Feb 2026) are internally consistent with this date.

### Out-of-scope per rubric

- Self-hosting operational reality (covered in `electron-desktop-app-operations-2025` and landscape D5)
- Whiteboard / Canvas feature depth
- Performance benchmarks for BlockSuite or y-octo
- Open-knowledge architecture recommendations (handled via Path C to landscape report, not this document)

### Tensions internal to the findings

- **D3 vs D1:** If Subagent C's MCP catalog had revealed substantive agent primitives (identity, attribution, events), that would contradict D1's "pivot not executing" verdict. It did not. The dimensions are coherent — the MCP surface has grown (tool count) without gaining agent-native primitives (structure).
- **Vendor-source reliance in D1.** AFFiNE's own release notes + blog are the sole source for some D1 claims. Independent verification via the DAWNCR0W MCP server (D3) corroborates the "CRUD expansion without co-creation" pattern, partially offsetting the vendor-bias risk.

---

## 7. References

### Evidence Files

- [evidence/d1-product-trajectory.md](evidence/d1-product-trajectory.md) — shipping categorization v0.25→v0.26.3, MCP bug fix context, community MCP server, blog paywall
- [evidence/d2-blocksuite-architecture.md](evidence/d2-blocksuite-architecture.md) — sync-PR pattern, npm version fragmentation, defineBlockSchema API, adapter source, Lit vs ProseMirror
- [evidence/d3-mcp-agent-surface.md](evidence/d3-mcp-agent-surface.md) — tool catalog, auth model, co-creation primitive scoreboard, negative searches
- [evidence/d4-distribution-strategy.md](evidence/d4-distribution-strategy.md) — D8-equivalent negative searches, community repo census, structural explanation
- [evidence/d5-format-fidelity.md](evidence/d5-format-fidelity.md) — doc-quoted data-loss language, live issues, CRDT-canonical philosophy
- [evidence/d6-y-octo-maturity.md](evidence/d6-y-octo-maturity.md) — versioning, maintainer count, yjs-compat, yrs critique
- [evidence/d7-business-signals.md](evidence/d7-business-signals.md) — funding history, team size, Cloud pricing, layoff trackers

### External Sources

- [github.com/toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) — main product repo (67,178 stars 2026-04-11)
- [github.com/toeverything/blocksuite](https://github.com/toeverything/blocksuite) — BlockSuite editor toolkit
- [github.com/toeverything/y-octo](https://github.com/toeverything/y-octo) — Rust CRDT engine
- [github.com/DAWNCR0W/affine-mcp-server](https://github.com/DAWNCR0W/affine-mcp-server) — community MCP (v1.13.0)
- [docs.affine.pro: Transformer & Adapter](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter) — adapter data-loss language
- [docs.affine.pro: AI admin](https://docs.affine.pro/self-host-affine/administer/ai) — BYOK + bundled LLM config
- [pitchbook.com AFFiNE](https://pitchbook.com/profiles/company/520468-75) — funding history
- [npmjs.com/package/@blocksuite/store](https://www.npmjs.com/package/@blocksuite/store) — package version state
- [BlockSuite issue #6043](https://github.com/toeverything/blocksuite/issues/6043) — markdown export bug
- [Glama schema: DAWNCR0W MCP](https://glama.ai/mcp/servers/DAWNCR0W/affine-mcp-server/schema) — canonical tool catalog

### Related Research

- [`reports/openknowledge-competitive-landscape/`](../openknowledge-competitive-landscape/) — 7-competitor landscape in which AFFiNE occupies Tier-1; this report's findings feed derivative Path C updates to D2, D6, Tier-1 threat ranking, and a potential new D9.
- [`reports/obsidian-karpathy-workflow-deep-dive/`](../obsidian-karpathy-workflow-deep-dive/) — the symmetric Obsidian deep-dive; parallel structural inquiry.
- [`reports/open-core-split-licensing-engineering/`](../open-core-split-licensing-engineering/) — general OSS licensing dynamics relevant to AFFiNE's MIT + Cloud model.
