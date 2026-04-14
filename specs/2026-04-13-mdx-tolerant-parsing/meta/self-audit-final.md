# Self-Audit (final pass)

**Artifact:** SPEC.md
**Audit date:** 2026-04-13
**Method:** `/assess-findings` over own audit output. Adversarial on own claims.

## Cuts applied

| ID | Item | Classification | Rationale |
|---|---|---|---|
| H1 | R9 componentName attr | Valid improvement (cut) | Speculative without a caller in this spec. T1 re-spec will add with concrete readers. R10 add-only guarantees safe later addition. |
| H2 | R12 R23 tag-matcher refactor | Valid improvement (cut) | R23's scanner and R6's region-finder are complementary, not shared. Inline helper in R6 (~30 LoC) is simpler than factoring (~60 LoC + R23 retest). Noted as §15 revisit trigger if `<Namespace.Component>` support emerges. |
| M1 | rawMdxInlineFallback node | Valid improvement (cut) | R6 never produces inline fallbacks (always block-granular). R8 inline unknowns use plain text nodes. R13 inline schema throws fire rarely enough (narrow schema-drift window) that log+skip is proportional. If R14 observability shows real inline R13 frequency, reopen. |

## Net effect

- R-count: 15 → 14 (R9, R12 deleted; R14 observability added; R12 mid-type E2E folded into renamed R12)
- D-count: 14 → 13 (D7, D12 deleted)
- Total LoC scope: ~483 → ~398
- Schema surface: 1 fewer node type
- No functional regression; all user-facing scenarios preserved

## Additions (via same audit)

| ID | Item | Rationale |
|---|---|---|
| R14 | Observability counters | Validates A3 (R6 coverage) + R10 (add-only holding) in production. Ships the defensive safety nets WITH the telemetry to verify they work. |
| M9 / R12 aug | P3 mid-type recovery E2E test | Most-frequent user-facing R6 scenario. Browser-specific TipTap + y-prosemirror materialization interactions only surfaceable in E2E. |

## Future Work items added (not scope creep — concrete triggers)

1. Document-level schema versioning (Outline pattern) — triggered when R10 blocks a genuinely correct narrowing change
2. Inline-granularity diagnostics UX (Obsidian pattern) — triggered if R14 data shows high single-tag-error rate
3. Continuous crash-class probe — triggered next dependency bump affecting parser
4. R13 patch maintenance protocol — triggered first y-prosemirror upgrade attempt
5. R23 tag-matcher factoring revisit — triggered if `<Namespace.Component>` support emerges
6. `componentName` attr (now owned by T1 re-spec)

Each has a concrete trigger. None are "might want later."

## Confidence calibration

- HIGH: H1, M2 (cost sizing), R14 observability addition, R12 E2E addition — directly grounded in codebase + user directive.
- MEDIUM: H2, M1 — valid counter-arguments exist; cuts are right now but revisit conditions documented in §15.
- HELD HIGH: R1-R13 defended items — each pressure-tested with concrete caller analysis.

## What I did NOT cut (defended on second pass)

R3 Layer 3 shape, R8 catch-all, R9 isolating, R10 add-only, R11 ref-def hoist, R13 y-prosemirror patch — each has a concrete user-facing failure mode if removed. Evidence in §DEFENDED section of the assess-findings output (conversation transcript).
