# Changelog

## 2026-04-08 — Initial scaffold

- Created SPEC.md with problem statement, goals, non-goals, personas, user journeys
- Locked D1: Ink for select surfaces (startup banner, future interactive), not full TUI
- Locked D2: CLI package only; server logging is separate pino workstream
- Created evidence files: ink-research.md, color-libraries.md, current-cli-output.md
- Open questions Q1-Q6 identified and prioritized

## 2026-04-08 — Backlog extraction and investigation

- Resolved Q1 → D3: picocolors for non-Ink colored output (6KB, 0 deps, native NO_COLOR)
- Resolved Q3 → D4: Color utility is CLI-internal (not in core)
- Resolved Q5 → D5: Node >= 22 already required, matches Ink v7
- Resolved Q7 → D6: Ink render() → unmount() pattern for one-shot banner
- Resolved Q8 → D7: Dynamic import of Ink only in start command
- Resolved Q9 → D8: Early argv --no-color detection sets process.env.NO_COLOR before imports
- Resolved Q10: Two color libraries acceptable (chalk via Ink + picocolors independently)
- Added Q7-Q10 from systematic extraction (walk-through, tensions, negative space probes)
- Created evidence/ink-lifecycle.md, evidence/build-pipeline.md
- Drafted proposed solution (§9) with architecture, color scheme, file list
- Drafted In Scope items (S1-S4) with acceptance criteria
- Remaining open: Q2 (tsdown bundling verification), Q4 (startup overhead benchmark), Q6 (banner design)

## 2026-04-08 — Build pipeline verified, Q2 resolved

- Resolved Q2 → D9: Only tsconfig.json change needed (`"jsx": "react-jsx"`). yoga-layout is base64 WASM (not native), no externalization needed. Verified end-to-end with tsdown v0.21.7.
- Verified A2: tsdown bundles Ink correctly
- Downgraded build pipeline risk from Medium to Low
- Simplified S4 (build pipeline) — no tsdown.config.ts changes needed
- Remaining open: Q4 (startup overhead — presented to user), Q6 (banner design — presented to user)

## 2026-04-08 — All P0 questions resolved

- Resolved Q4 → D10: ~118ms Ink overhead on Bun accepted (one-time cost for long-running process)
- Resolved Q6 → D11: Vite-style boxed banner (Ink Box with border)
- All 11 open questions resolved. 11 decisions made (D1-D11). Scope stable.
- Moving to audit phase.

## 2026-04-08 — Audit findings assessed

### Corrections applied:
- Fixed picocolors ESM claim → CJS (bundler/Bun handles transparently)
- Fixed kleur "CJS-only" claim → dual ESM/CJS with conditional exports
- Fixed D3 rationale to remove incorrect kleur CJS claim
- Fixed --no-color handler: now also deletes FORCE_COLOR (flagged by both auditor and challenger)
- Fixed detection hierarchy documentation to reflect that CLI flags are highest priority (per no-color.org)

### Dismissed (stale web data):
- Auditor H1 (Ink v7 doesn't exist): DISMISSED — `npm view ink version` confirms v7.0.0 published 2026-04-08. Auditor's web search returned stale results.
- Auditor H2 (fabricated issue numbers): NOTED — issue numbers from WebFetch AI may be approximate. Claims about Ink's unofficial Bun support are directionally correct but issue numbers are unverifiable.
- Auditor M3 (react ^19.2.0): DISMISSED — `npm view ink peerDependencies` confirms react >= 19.2.0 for v7.
- Auditor L1 (benchmark version-specific): DISMISSED — benchmarks are for actual v7.0.0.

### Presented to user (design challenges):
- DC1: Whether Ink is justified for a one-shot banner (G4 overlaps NG2)
- DC2: Server logs invisible to color system (G1 partially achieved)
- DC4: A1 unverified + no fallback specified

## 2026-04-08 — Major scope change: Ink removed, lightweight stack adopted

User decisions on audit findings:
1. **DC1 accepted:** Switch from Ink to picocolors + boxen/cli-boxes. Ink deferred to Future Work (Explored tier).
2. **DC2 skipped:** Server logs remain CLI-only scope (unchanged from D2).
3. **DC4 moot:** Ink scoped out entirely — no Bun compat risk, no fallback needed.

Cascade:
- D1 superseded: "Ink for select surfaces" → "No Ink; picocolors + boxen/cli-boxes"
- D6, D7, D9, D10 superseded (all Ink-specific)
- D11 retained: Vite-style boxed banner (now via boxen/cli-boxes instead of Ink)
- G4 removed (future Ink foundation = premature for deferred scope)
- NG2 updated: Ink itself is now the deferred item
- A1, A2 eliminated (Ink-specific assumptions)
- A4 added: boxen/cli-boxes works with Bun + tsdown (HIGH confidence)
- S3 simplified: boxed banner via console.log, no React lifecycle
- S4 eliminated: no build pipeline changes needed
- All Ink-related risks removed from risk table
- Future Work: Ink moved to Explored tier with full investigation summary
- Agent Constraints populated (SCOPE, EXCLUDE, STOP_IF, ASK_FIRST)
- Spec status: Draft → Approved
- Assumptions A1-A3 recorded (A3 verified)
