# Changelog — affine-strategic-deep-dive

## 2026-04-11 — Initial report + audit-driven corrections

- Initial Path A research pass across 7 dimensions (D1–D7) via 4 parallel subagents.
- Evidence files written for all dimensions.
- REPORT.md synthesis delivered.
- Audit run (cold-read, general-purpose agent w/ /audit skill) → 2 High, 4 Medium, 5 Low findings; findings persisted to `meta/audit-findings.md`.
- **H1 resolved:** BlockSuite commits in last 6 months corrected from "~20" to "zero on main since 2025-07-07." Directional verdict (downstream mirror → dormant) strengthens. Updated REPORT.md Executive Summary + D2 section + d2-blocksuite-architecture.md.
- **H2 resolved:** y-octo "no crates.io publication" corrected — crate IS published at v0.0.2 (last update 2026-01-10). Underlying "external-adoption viability weak" claim survives with nuance. Updated REPORT.md D6 + d6-y-octo-maturity.md.
- **M1 resolved:** v0.25.0 date pinned to 2025-10-13 per GitHub releases API (was flagged UNCERTAIN in report). Updated REPORT.md Limitations + d1-product-trajectory.md footnote.
- **M2 resolved:** `@blocksuite/blocks@0.19.5` publish date corrected from "~April 2025" to "2024-12-19" (~16 months stale, not ~1 year). Updated REPORT.md + d2 evidence file.
- **M3 resolved:** D5 evidence file updated — issues #6043 and #2854 re-labeled as "closed" (were "open, unresolved"); #6291 and #2872 remain open and carry the finding.
- **M4 resolved:** obsidian-skills star count standardized to 22,662 throughout (was "21K" / "22K" inconsistently). Multiplier corrected from "157×" to "~162×."
- **L1 resolved:** y-octo commit count corrected from "14" to "13"; DarkSky share restated as "11 of 13."
- L2, L4: confirmation-only (no edits needed).
- L3, L5: noted for future-pass consideration; not applied this pass.
