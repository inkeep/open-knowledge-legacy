---
topic: Internal prior art challenges D1/D2 direction
sources:
  - reports/just-bash-virtual-filesystem-analysis/REPORT.md:54
  - reports/just-bash-virtual-filesystem-analysis/REPORT.md:461
  - reports/just-bash-virtual-filesystem-analysis/REPORT.md:463-466
  - reports/just-bash-virtual-filesystem-analysis/REPORT.md:474-484
  - reports/just-bash-virtual-filesystem-analysis/REPORT.md:491-517
confidence: HIGH
---

# Internal prior art challenges D1/D2 direction

An in-repo 14-dimension research report (`reports/just-bash-virtual-filesystem-analysis/`, CONFIRMED status on all P0 dimensions) reaches conclusions that challenge our locked decisions, specifically D2 (L2 prompting posture) and refines D1 (single-exec implementation).

## 1. Hybrid architecture, not exec-primary

**Quote (REPORT.md:461, :517):** "exec() is composable but not enrichable; semantic tools are enrichable but not composable. The hybrid architecture provides both."

**Quote (REPORT.md:54):** "Single exec() tool wins on composability; semantic tools win on enrichment. The hybrid architecture is optimal: 5-6 semantic tools + 1 bash escape hatch = 6-7 tools total."

**Decision triggers cited (REPORT.md:463-466):**
- Coding agents, enrichment not needed → single exec() sufficient.
- General-purpose or enrichment critical → semantic tools required.
- **Both audiences exist → hybrid.**

Our personas (SPEC §4) explicitly include both P1 (coding agents) AND P2 (doc-authoring agents via ingest/research/consolidate) — the report's "both audiences" criterion. This supports hybrid; it does NOT support demoting semantic tools.

## 2. Tool-count-anxiety may be overcalibrated

| Tool count | Performance | Source (REPORT.md:474-484) |
|---|---|---|
| 10 | Perfect 20/20 | Speakeasy |
| 20 | 19/20 (large models) | Speakeasy |
| 50+ | 2-3× response time | industry survey |
| 107 | Both models fail | Speakeasy |

Our current count is 15 tools (worldmodel.md §1a). That is in the "functional" band, not "collapsed." GitHub Copilot cut 40→13 (below our 15) for a 2-5% benchmark improvement. The Dust.tt / "min-tool-count is #1 failure predictor" citation in SPEC §1 is *valid* but possibly over-applied for our scale — we're not near the danger zone.

## 3. MCP `structuredContent` is a cleaner enrichment channel

**Quote (REPORT.md:491, :495-508):** MCP spec 2025-11-25 defines two response fields: `content` (text for the agent) and `structuredContent` (typed JSON for client/UI programmatic use). Tools can return **both in the same response**.

Report example (read tool):
```json
{
  "content": [{ "type": "text", "text": "# API Auth..." }],
  "structuredContent": {
    "frontmatter": { "title": "API Auth", "tags": ["auth"] },
    "backlinks": ["/docs/oauth.md"],
    "wordCount": 1247
  }
}
```

This is a refinement to SPEC FR6 ("raw stdout + appended `### Referenced files` markdown block"). Alternative: raw stdout in `content`, `EnrichedMeta[]` in `structuredContent`. Cleaner for machine consumption, same info density for LLM readers.

**Checked against current codebase:** `packages/cli/src/mcp/tools/shared.ts:14-22` defines `textResult()` returning only `{content:[{type:'text',...}]}`. No current tool uses `structuredContent`. Adoption would be new-in-repo.

## 4. Report supports MCP-layer enrichment, not command-level

**Quote (REPORT.md:511-514):**
- Command-level enrichment (inside just-bash via defineCommand) breaks pipe fidelity.
- **MCP-level enrichment (recommended): wrap exec() results, add metadata in the MCP response layer. just-bash stays pure; the MCP server adds value.**

This is aligned with our D1 implementation plan (parse command → runPipeline → extract paths → enrich at MCP layer). The "exec is not enrichable" framing applies to command-level approaches, not to our wrap-at-MCP-layer approach. Our approach is compatible with the report's recommendation *for the enrichment mechanism*.

## What this means for our spec

**D1 (single exec with pipes)** — largely stands. Implementation should consider `structuredContent` for enrichment delivery as a refinement to FR6.

**D2 (L2 prompting, semantic demoted)** — directly challenged. The report's recommendation (keep full hybrid, both surfaces equally available) is more conservative and aligns with our P1+P2 persona mix. Options:

- **D2-alt-A (report-aligned):** Register `exec`, update INSTRUCTIONS to mention it alongside existing tools *without demoting* them. No prompting flip.
- **D2-alt-B (soft L2):** Lead with `exec` for "quick read/list/grep" use cases but keep `read_document`/`search` prominent for "when you need the full enriched read." Splits by intent, not by hierarchy.
- **D2 as locked (aggressive L2):** Keep current plan; demote semantic tools to "also available" section.

**A1 (accept external prior art)** — needs update. Internal prior art is more skeptical of the exec-primary thesis than external citations. The Dust.tt / min-tool-count argument holds but doesn't clearly cross our 15-tool threshold into danger.
