# RUN — v0 Day-Zero Delight Research

**Date.** 2026-04-14
**Requested by.** Nick
**Plan.** `/Users/edwingomezcuellar/.claude/plans/elegant-weaving-flurry.md`
**Output root.** `reports/v0-day-zero-delight/`

## Research question

How can Open Knowledge's v0 launch feel special, differentiated, and shareable on day 0 — for a "developer or non-developer" user looking to use it locally as an Obsidian or Notion alternative? Specifically across five dimensions: (1) differentiation-exploit, (2) delightful onboarding, (3) time-to-wow, (4) teammate-share trigger, (5) social-share trigger.

## Methodology

Four-phase research driven by the `gtm:worldmodel` + `eng:nest-claude` skills.

- **Phase A — Harvest + synthesize a shareable worldmodel.** Tap every available channel (PROJECT.md + stories + specs + codebase UX audit + reports corpus + competitive landscape + web probes + OSS cache scan). Emit as `worldmodel.md`, a reusable standalone artifact. Evidence files in `evidence/`.
- **Phase A gate.** Nick reviews the worldmodel before any further work. Cheapest place to catch drift.
- **Phase B — 20 nested divergent agents via `eng:nest-claude`.** Each agent ingests the full worldmodel + one specific divergent lens. Raw outputs in `divergent-agents-raw/`. Lens matrix: 4 differentiation-exploit + 4 onboarding-warmth + 3 time-to-wow + 3 teammate-share + 4 social-share + 2 cross-cutting.
- **Phase C — Consolidate.** Cluster + tag (dimension / emotion / differentiation-reinforcement / shareability vector). Curate top-20 by creative × differentiation × emotional value (not by engineering cost — unbounded horizon).
- **Phase D — Report.** `REPORT.md` with TL;DR, worldmodel recap, 5-dim landscape, top-20 shortlist with demo sentences, 4-6 tagline options, 3 alternative day-0 story arcs, open questions for Nick. Register in `reports/CATALOGUE.md`.

## Channels harvested

| Channel | Source | Output |
|---|---|---|
| Product identity | PROJECT.md, stories, specs | §1, §2 of worldmodel |
| UX audit | packages/cli + packages/app | §5, §9 of worldmodel |
| Reports corpus | reports/CATALOGUE.md + 12+ deep-reads | §3, §4, §8 of worldmodel |
| Competitive landscape | openknowledge-competitive-landscape + prior-art-eight-sources + three Karpathy deep-dives + agent-retrieval + MCP-design + licensing | §3, §4, §8 of worldmodel |
| Web probe 1 — viral dev-tool launches 2024-2026 | WebSearch + WebFetch | `evidence/viral-dev-tool-launches-2024-2026.md` → §7 |
| Web probe 2 — dev-tool mascots + voice | WebSearch + WebFetch | `evidence/dev-tool-mascots-voice.md` → §6 |
| Web probe 3 — cute/warm/gamified onboarding | WebSearch + WebFetch | `evidence/warm-cute-gamified-onboarding.md` → §6 |
| OSS channel — cached repo positioning scan | `~/.claude/oss-repos/` | `evidence/oss-repo-positioning-scan.md` → §6, §9b |

## Status — completed 2026-04-14

- ✅ **Phase A — Worldmodel harvest + synthesis.** 8 channels tapped (PROJECT.md, stories, specs, codebase UX audit, reports corpus, competitive landscape reports, 3 web probes, light OSS scan). Produced `worldmodel.md` (~537 lines) + 4 evidence files (~488 lines total). Preserved verbatim in `evidence/` for downstream reference.
- ✅ **Phase A gate.** Nick approved the worldmodel without adjustments.
- ✅ **Phase B — 20 parallel nested divergent agents.** Lens matrix dispatched: 4 D1 (differentiation-exploit) + 4 D2 (onboarding-warmth) + 3 D3 (time-to-wow) + 3 D4 (teammate-share) + 4 D5 (social-share) + 2 X (cross-cutting). Raw outputs in `divergent-agents-raw/` — 20 files, ~4,800 lines, ~400 raw ideas. Each agent seeded with the full worldmodel + evidence files + its specific lens.
- ✅ **Phase C — Consolidation.** Single consolidation agent read all 20 raw files, produced `consolidation.md` (~513 lines) with 17 thematic clusters, convergence heatmap, tagged idea universe, top-20 curated shortlist with extended pitches, 3 day-0 story spines, 12 tagline candidates, 15 wild-cards, do-not-use dead-ends.
- ✅ **Phase D — Synthesis report.** `REPORT.md` (~394 lines / ~6,000 words) with TL;DR, worldmodel recap, 17-cluster landscape + convergence heatmap, top-20 curated proposals with demo sentences, 3 distinct day-0 story spines, 12 tagline candidates, wild-card bank, do-not-use list, 11 open narrative questions for Nick, coined-terms appendix.

## Total output

- `REPORT.md` (394 lines) — primary synthesis
- `worldmodel.md` (537 lines) — reusable topology artifact
- `consolidation.md` (513 lines) — clustered and tagged idea universe
- `evidence/` (488 lines across 4 files) — verbatim probe outputs
- `divergent-agents-raw/` (4,813 lines across 20 files) — raw divergent ideation preserved
- `meta/RUN.md` (this file)

**Convergence standouts** (ideas appearing in 5+ independent agents):
- Deterministic mascot/species per user — 10 agents
- Shareable URL per session — 8 agents
- Two-cursor visible co-editing — 7 agents
- Demo-agent-on-init (Olly) — 7 agents
- Cmd+Z the Agent — 6 agents
- Karpathy lineage hijack — 6 agents
- Anti-Notion manifesto / pick-a-fight — 5 agents
- Benchmark-as-flywheel (okbench) — 5 agents
- Named-agent attribution in git log — 5 agents

**Three coined terms preserved across artifacts:** Quill (Octocat-archetype corvid mascot) · Bramble (pet-KB hatching companion) · Olly (demo agent that holds your seat) · OK Cards (trading-card artifact per page) · okbench (agent knowledge-maintenance benchmark) · The Gavel (one-click approve+merge) · `/bring-me-there` (verb to open editor in agent environment) · Alt-Reveal (the one-gesture muscle memory) · `.okclip` (CRDT-replay share-artifact format) · co-wiki-ing (the phrase to seed) · Haunted Wiki (Ada-seeded lived-in install flavor) · openknowledge.dev/live (24/7 ambient spectacle).

**Downstream asks for Nick:** review REPORT.md + the three spines; pick a primary register; answer the 11 open narrative questions. Everything downstream is spec work.
