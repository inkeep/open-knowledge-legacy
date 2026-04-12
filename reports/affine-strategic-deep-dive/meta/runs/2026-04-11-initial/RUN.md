---
run-id: 2026-04-11-initial
status: Active
orchestrator: Claude (main session)
started: 2026-04-11
---

# Run: 2026-04-11-initial

## Purpose

Initial research pass for `affine-strategic-deep-dive` — a new Path A standalone report that will propagate Path C updates back to `reports/openknowledge-competitive-landscape/` (D2, D6, Tier-1 threat, possibly a new D9).

The landscape report was written against AFFiNE **v0.25.0** (early April 2026). Current stable is **v0.26.3** (Feb 25, 2026), with canary builds through April 10, 2026. One-minor-version delta is within the scope of the staleness check (D1).

## Scope (delta rubric for this run)

| Dim | Priority | Owner | Focus |
|---|---|---|---|
| D1 | P0 | Subagent A | Pivot execution: v0.25→v0.26 delta, releases post-Feb-25, blog/comms |
| D2 | P0 | Subagent B | BlockSuite as reusable toolkit: npm packages, defineBlockSchema, adapters |
| D3 | P0 | Subagent C | MCP tool surface + agent co-creation primitives (verify "76 tools, R+W" claim) |
| D4 | P0 | Subagent D | D8-equivalent audit: agentskills.io, npx skills, Claude plugins, community repos |
| D5 | P1 | Subagent D | Markdown adapter round-trip fidelity, documented data-loss caveats |
| D6 | P1 | Subagent B | y-octo maturity, production users beyond AFFiNE, yjs-compat claims |
| D7 | P2 | Subagent A | Funding post-Oct-2023, team size, commit velocity, Cloud pricing, named customers |

## Canonical sources (anchors)

### Primary (code)
- **AFFiNE monorepo:** github.com/toeverything/AFFiNE
  - Latest stable: v0.26.3 (2026-02-25)
  - Canary: v2026.4.10-canary.928 (active development)
- **BlockSuite:** github.com/toeverything/blocksuite
  - Separately maintained OSS toolkit
  - Last confirmed stable: v0.22.4 (2025-07-01) — verify current state
  - npm scope: `@blocksuite/*` — `store`, `inline`, `block-std`, `blocks`, `presets`
- **y-octo:** github.com/toeverything/y-octo
  - Rust Yjs-compatible CRDT with Node bindings
  - Known production users: AFFiNE, Mysc

### Primary (docs / blog)
- docs.affine.pro
- affine.pro/blog
- github.com/toeverything/AFFiNE/releases (changelog)
- github.com/toeverything/AFFiNE/issues (open issue sentiment)

### Secondary (distribution / ecosystem)
- agentskills.io/specification (spec for SKILL.md format)
- npmjs.com/package/skills (npx skills add registry)
- github.com/search for "affine" in .claude-plugin/, SKILL.md, cursor rules
- MCP community registries (modelcontextprotocol.io, glama.ai, mcp.so)

### Tertiary (business signals)
- Crunchbase, PitchBook for funding (Oct-2023 onward)
- GitHub insights (commit cadence, contributors)
- docs.affine.pro for Cloud pricing
- LinkedIn for team size

## Known facts (verified during pre-flight)

- v0.26.3 changelog mentions "Fixed MCP token display issues" — AFFiNE has shipped MCP UI/auth plumbing. Tool catalog TBD.
- v0.26.3 backend: "Redesigned admin panel with improved dashboard interface," "Enhanced S3 provider compatibility," "Lazy loading of blobs" — suggests enterprise/self-host focus in recent work, not AI-KB pivot acceleration.
- BlockSuite README states it was open-sourced independently because it outgrew being AFFiNE's in-house editor — framing as general framework.
- y-octo explicitly addresses why it wasn't built on yrs (Rust Yjs impl) — safety concerns documented in dedicated README.

## Evidence writing

**Subagents return structured Markdown findings in their responses.** Orchestrator writes evidence files to `../../evidence/` based on findings:

- `evidence/d1-product-trajectory.md`
- `evidence/d2-blocksuite-architecture.md`
- `evidence/d3-mcp-agent-surface.md`
- `evidence/d4-distribution-strategy.md`
- `evidence/d5-format-fidelity.md`
- `evidence/d6-y-octo-maturity.md`
- `evidence/d7-business-signals.md`

## Output contract for subagents

Each subagent returns a Markdown response structured as:

```
## Dimension(s) covered
## Key findings
### Finding: <declarative claim>
- Confidence: CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND
- Evidence: <file:line OR URL, accessed date>
- Snippet: <minimal proof>
- Implication for open-knowledge: <1 sentence>
## Gaps / negative searches
## Key sources (top 5-10)
```

Workers do NOT write files to the run folder. Orchestrator synthesizes evidence from responses + re-verifies critical citations against primary sources.

## Status

- [ ] Subagent A dispatched
- [ ] Subagent B dispatched
- [ ] Subagent C dispatched
- [ ] Subagent D dispatched
- [ ] Gap analysis checkpoint
- [ ] Evidence files written
- [ ] REPORT.md synthesized
