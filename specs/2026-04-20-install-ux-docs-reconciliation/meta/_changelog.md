---
title: Install UX Docs Reconciliation — Changelog
description: Append-only process history for the spec.
tags: [spec, meta]
---
# Changelog

## 2026-04-20 — Spec initialized

- Created SPEC.md from [[reports/bunx-npx-usage-audit/REPORT]] findings + PR #227.
- User confirmed intake §4: all-three co-equal motivation; D5 (generated-artifact rationale) investigated as open decision.
- SCR drafted + 5 stress-test probes passed.
- Baseline commit stamped at `3f069185`.
- Parent spec ([[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]]) D1/D2 locked; this spec operationalizes D1's implication.

## 2026-04-20 — Iterative loop (autonomous mode, D3-D8 resolved)

User directed autonomous resolution. Two parallel investigations dispatched:

- **D5 investigation** ([[evidence/d5-runner-choice-analysis]]) — 291 lines, code-verified runner-detection feasibility, prior art across husky/playwright/esbuild/package-manager-detector, Mastra posture check, Claude Desktop PATH issue documented. **Recommendation: Option 1** (keep `npx` hardcoded + add Node prereq + document rationale) with explicit escalation triggers for Option 2 promotion.
- **D6 investigation** ([[evidence/d6-canonical-source-analysis]]) — 291 lines, Fumadocs `<include>` verified in pinned `fumadocs-mdx@14.0.4`, unused `remark-mdx-snippets` flagged for deletion, `tsdown` markdown-inline capability confirmed. **Recommendation: Option B** (plain-markdown canonical + Fumadocs `<include>` + `scripts/sync-install-matrix.ts` + CI drift check).

Decisions resolved based on evidence:

- **D3 LOCKED:** `bunx` primary (preserves shipped root-README pattern + parent spec §8 precedent).
- **D4 LOCKED:** Fumadocs `<Tabs groupId="bin">` for bin-form toggle in guides; fenced-block matrix in plain-MD surfaces.
- **D5 LOCKED:** Keep `npx` hardcoded; prereq + rationale prose; Option 2 promoted to Explored-Future-Work with triggers.
- **D6 LOCKED:** Fumadocs `<include>` + sync script + CI drift check; delete unused `remark-mdx-snippets`.
- **D7 LOCKED:** Prose `ok <cmd>`; code blocks use D4 Tabs matrix.
- **D8 LOCKED:** Two-level prereq (runner + MCP-spawning Node caveat).

Updated sections: §10 (Decision Log), §11 (Open Questions), §12 (Assumptions), §14 (Future Work), §15 (Rollout), §16 (Agent Constraints). Status moved Drafting → In Review.

## 2026-04-20 — Audit + design-challenge + assess-findings (autonomous resolution)

Two parallel subagents spawned:

- **Auditor** ([[meta/audit-findings]]) — 20 findings: 0 HIGH, 3 MED (F01/F12/F20 over-claim "verified in mcp.test.ts:356" — test is simulation not execution; F02 broken Mastra citation chain), 17 LOW (drafting polish).
- **Challenger** ([[meta/design-challenge]]) — 10 challenges: 4 STRONG (C2 Tabs hide `ok`; C3 D5 doesn't close G3; C7 D2 co-equality aspirational; C9 escalation unobservable), 4 reveal trade-off (C1 audience-skew bet; C4 D6 not "minimum viable"; C5 prose/code translation cost; C8 phasing), 2 WEAK (C6, C10).

**Assessment applied via /assess-findings:**

*Pure corrections applied:*
- F01/F12/F20 weakened: §2.3 Complication 3 now says "mechanically plausible by inspection; the test simulates the stderr string but does not execute kernel-level ENOENT end-to-end."
- F02 citation fix: Mastra source now linked directly in evidence file (both occurrences) + cited inline in D5 Evidence column.
- F03 FR-G3 placeholders filled (Node ≥ 22, pnpm ≥ 10).
- F04 self-spawn.ts line range corrected to `1-17`.
- F05 remarkInclude range clarified (function at 128-205; module section 64-209).
- F06 D8 phrasing tightened to name Bun-only/pnpm-only cohort explicitly.
- F07 "D-n decision" stale refs in §6 replaced with specific D-row refs.
- F08 Sync-script developer workflow documented in D6 Implications + §15 Phase 4.
- F09 SCOPE/EXCLUDE clarified: behavior-level changes vs comment-only annotations.
- F15 `docs/_snippets/` directory deletion added to D6 Implications + §15 Phase 2.
- F16 30-day vs 90-day window reconciled in §7 Metric 2 (both triggers documented).
- F17 A5 confidence downgraded to MEDIUM; probe commit committed as Phase 1 task.
- F18 NG4 stale "Placeholder" language removed.
- F19 User-journey `ok init` → "the init step writes" per runner form.
- F20 corrigendum noted for audit report in §14 or Phase 1 work.
- A7 (new) added explicitly documenting the mcp.test.ts:356 simulation limitation.

*Design findings: applied as spec refinements (LOCKED decisions preserved, framing improved):*
- C2 (Tabs hide `ok`): D4 now explicitly includes a top-of-page callout on every `guides/*.mdx`. Compromise closes discoverability gap without reopening Tabs choice.
- C3 (G3 not "closed"): G3 goal wording re-framed from "silent-failure path closed" to "silent-failure path upgraded to documented-with-escalation." Honest characterization matches D5 Option 1's actual scope.
- C7 (D2 co-equality): D2 reframed to "V0-polish + D1 compliance primary; silent-correctness secondary via documentation pending escalation." Honest priority ordering.
- C9 (escalation unobservable): D5 now includes operational monitoring commitment (Andrew greps issues + Slack weekly for 90 days post-launch; release notes solicit bug reports). §7 Metric 2 spells out both 30-day and 90-day triggers.

*Trade-off acknowledgments added inline (per REVEALS A TRADE-OFF findings):*
- C1 (D3 audience-skew bet): D3 now names "explicit bet: V0 docs-site visitors are Bun-adjacent or indifferent."
- C4 (D6 not "minimum viable"): D6 now says "this is three mechanisms ... optimizes for edit-path ergonomics, pays complexity in setup."
- C5 (D7 translation cost): D7 now acknowledges "readers alternate between prose `ok start` and fenced `bunx @inkeep/open-knowledge start` within a page, asking them to maintain two mental models. D4's top-of-page callout partially compensates."
- C8 (phasing): §15 now includes "Phasing trade-off acknowledged: Phase 1 validates G6 on the root README rather than the docs site. Chosen because Phase 1 is reversible..."

*Weak findings:*
- C6 (D8 single-level alternative): D8 rationale expanded to explain why Level 1 exists even though MCP is universal.
- C10 (G6 scaling): No action; future-work entry already covers Homebrew Cask surface addition.

No LOCKED decision was reopened. All findings resolved via wording/rationale updates or Future Work promotion. Spec status remains In Review.

Next: finalize.
