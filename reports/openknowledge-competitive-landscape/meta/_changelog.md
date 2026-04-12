# Changelog — openknowledge-competitive-landscape

## 2026-04-11 — Path C propagation from affine-strategic-deep-dive

Derivative updates flowing from [`../../affine-strategic-deep-dive/`](../../affine-strategic-deep-dive/) (the standalone AFFiNE deep-dive, audit-cleared 2026-04-11). No new primary research was conducted for this pass; all claims are sourced from the deep-dive's evidence files.

### Edits applied

- **D1 Editing Experience (AFFiNE paragraph):** Qualified the "most architecturally ambitious editor" framing as applying *within the AFFiNE product*, not as a reusable toolkit. Added pointers to the deep-dive's findings on dormant `main` branch (zero commits since 2025-07-07), `@blocksuite/blocks` ~16 months stale, zero non-AFFiNE adopters, Web Components / Lit architecture incompatible with ProseMirror/TipTap ecosystems.

- **D2 AI/Agent Story (cross-cutting paragraph):** Added a specific note on AFFiNE's MCP situation paralleling the Mintlify one — no first-party server, single-maintainer community project `DAWNCR0W/affine-mcp-server` (~36 canonical tools R+W, no co-creation primitives), six of seven primitives absent.

- **D6 Strategic Direction (AFFiNE paragraph):** Rewrote to incorporate the pinned v0.25.0 date (2025-10-13) and the v0.26.0–v0.26.3 shipping-category histogram (0 new AI features, 1 MCP bug fix, 4 infra/self-host). Added the three-constraint synthesis from the deep-dive (capital / architecture / strategy).

- **D7 Developer Experience (AFFiNE extensibility paragraph):** Re-audited the "reusable toolkit" framing; replaced with the deep-dive's evidence on BlockSuite's dormant state, version fragmentation, and zero external adopters.

- **Section 4 Positioning Matrix (MCP Server row, AFFiNE cell):** Updated from "Community (76 tools, R+W)" to "Community single-maintainer (~36 tools, R+W, no co-creation)."

- **New D9 section:** "AFFiNE's Agent-Distribution Audit (2026-04-11)" — symmetric to D8, closes the landscape report's asymmetric coverage of Obsidian's and AFFiNE's respective agent-distribution strategies. Contains the scale-comparison table (22,662 vs 140 stars), the three-constraint structural explanation, and the bridge to the threat re-classification in Section 6.

- **Section 6 Threat Assessment — AFFiNE re-classified from Tier 1 (Medium) to Tier 3 (Low).**
  - Tier 1 item #2 now carries a redirect note pointing to the new Tier 3 item #9, preserving the audit trail.
  - Tier 3 item #9 (new) contains the updated rationale — execution gap, capital constraint, architectural lock-in, and absent ecosystem distribution layer collectively outweigh "most technically capable."

### Claims not revised

- Mintlify's Tier 1 #1 ranking — unchanged.
- Chroma, Notion, Confluence, Outline rankings — unchanged.
- D3 (Storage & Format Model), D4 (Collaboration & Multiplayer), D5 (OSS Licensing & Pricing) — AFFiNE claims there were already consistent with the deep-dive findings; no updates needed.
- D8 (Obsidian's Agent Skills Strategy) — unchanged; stands as the symmetric counterpart to the new D9.
- Section 5 (Strategic White Space), Section 7 (Landscape Summary), Section 8 (Limitations) — unchanged.

## 2026-04-11 — Path C propagation from mintlify-strategic-deep-dive

Derivative updates flowing from [`../../mintlify-strategic-deep-dive/`](../../mintlify-strategic-deep-dive/) (nested-fanout stress test of Mintlify's Tier-1 #1 ranking, applying the same adversarial audit posture that downgraded AFFiNE earlier the same day). 4 parallel sub-reports consolidated via /consolidate into a 353-line parent report with 42-claim inventory.

### Edits applied

- **D6 Strategic Direction (Mintlify paragraph):** Rewrote to incorporate deep-dive findings — 20+ product improvements in 9 days (passed execution test AFFiNE failed), production-grade internal write pipeline (Daytona + OpenCode + Opus 4.6 running Workflows + KB Agent + Agent Job API), bidirectional MCP 4–8 weeks away, three-constraint profile (capital MODERATE / architecture NEGLIGIBLE / strategy MODERATE-HIGH), cash runway as binding constraint.

- **Section 4 Positioning Matrix (MCP Server row, Mintlify cell):** Updated from "Auto-generated (2 tools, R only)" to "Auto-generated R-only externally; 1P write pipeline internally (4–8wk to bidirectional)" to reflect the internal write path reality.

- **New D10 section:** "Mintlify's Agent-Distribution — The 'Third Position'" — symmetric to D8 (Obsidian) and D9 (AFFiNE). Documents the decentralized auto-generation distribution model, the three-way comparison table, and the time-bound convenience-bundling moat. Closes the distribution-layer coverage of all Tier-1 competitors.

- **Section 6 Tier 1 #1 (Mintlify paragraph):** Re-grounded with a visible "Ranking re-grounded 2026-04-11" note. Ranking HOLDS (Medium-High) but with different justification: engineering delta to bidirectional MCP is 4–8 weeks (not a category shift), 6 of 7 co-creation primitives PARTIAL+ (contrast AFFiNE NOT FOUND on 6), gate is business-case friction not architecture, Series B dependency named explicitly. Decision triggers added: bidirectional MCP ship hardens threat; Series B delay softens it.

### Baseline corrections propagated from deep-dive

- KB Agent soft-launched to customers 2026-03-22 (prior research: "internal-only")
- Trieve acquired 2025-07-24 (prior research: "December 2024")
- "Context-1" is Chroma's 20B retrieval model (prior research: "Trieve's model")

These corrections were captured in the deep-dive's Limitations section and are now reflected in the landscape prose via the deep-dive pointer.

### Claims not revised

- Tier rankings for Mintlify (Tier 1 #1 holds, re-grounded), AFFiNE (Tier 3, from earlier same-day pass), Obsidian/Notion/Confluence/Outline/Chroma/Semiont — unchanged.
- D1 (Editing Experience), D2 (AI/Agent Story cross-cutting), D3 (Storage & Format), D4 (Collaboration), D5 (OSS Licensing), D7 (Developer Extensibility) — not directly touched in this pass beyond the existing AFFiNE updates. The Mintlify deep-dive findings are surfaced via D6 + D10 + Section 6 rather than re-writing those sections.
- D8 (Obsidian Agent Skills Strategy) — unchanged; stands alongside D9 (AFFiNE) and D10 (Mintlify) as the completed distribution-layer audit triptych.
- Section 5 (Strategic White Space), Section 7 (Landscape Summary), Section 8 (Limitations) — unchanged.
