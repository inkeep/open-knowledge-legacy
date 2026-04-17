# Evidence: Effort Recalibration (2026-04-16 Update)

**Dimension:** Pull-in assessment — Q5 (validate 2-4 week estimate)
**Date:** 2026-04-16
**Sources:** Prior REPORT.md, 2026-04-16 ecosystem evidence, CLAUDE.md precedents, spec SPEC.md §3 non-goals

---

## The prior 2-4 week estimate (reconstructed)

The prior report's Architecture C estimate itemized:

| Component | LOC | Time |
|---|---|---|
| Delta-to-markdown serializer | 200-400 | — |
| Markdown-to-delta parser | 200-400 | — |
| CodeMirror adapter | 100-200 | — |
| **TOTAL** | **500-1000** | **2-4 weeks** |

Assumption set (per `evidence/implementation-effort.md`):
- y-prosemirror v14 works with a flat YType "as-is" (empirical validation needed — marked a gap)
- Yjs 14 is stable enough for production (marked "currently RC" — caveat acknowledged)
- Source view being non-collaborative is acceptable
- CodeMirror adapter is a trivial 1-2 day piece

## What today's evidence says

### Assumption 1: y-prosemirror v14 works as-is

**Status: FALSE**. The `@y/prosemirror` v2 package exists only as `2.0.0-2` on npm (stale since 2025-12-16). The rewrite PR #208 was closed-without-merge on 2026-03-19. No replacement has shipped. For 2-4 weeks from today, the library we'd build on is:

- **Option 1:** Fork and maintain our own `@y/prosemirror` copy. +2-4 weeks of maintenance burden perpetually.
- **Option 2:** Wait for dmonad's modular refactor. No ETA, no guarantee.
- **Option 3:** Use the stale `2.0.0-2` at our own risk. Unclear production readiness.

Each option changes the effort estimate materially.

### Assumption 2: Yjs 14 is stable enough for production

**Status: FALSE (as of 2026-04-16).** 

- Yjs 14 ships under a different npm scope (`@y/y` vs `yjs`).
- Active release-candidate pace is ~1 RC/day in the April 2026 window.
- `14.0.0-rc.7` was momentarily marked non-prerelease then reverted.
- Known packaging bugs in the pre-RC series (#751).
- No discovered production deployment.

### Assumption 3: Source view being non-collaborative is acceptable

**Status: UNDEFINED for Open Knowledge**. The bridge-correctness spec exists because Open Knowledge today DOES support concurrent WYSIWYG + source editing with CRDT convergence. C1-C10 integration tests exercise this. The source-mode editor (`packages/app/src/editor/SourceEditor.tsx`) uses `y-codemirror.next` for Y.Text binding — multi-writer. Removing that is a UX regression.

If "source view becomes read-only" is the cost of pull-in, that's a product-visible change that needs product-owner sign-off, not an engineering effort-estimate. This question was **not addressed** in the prior report.

### Assumption 4: CodeMirror adapter is trivial

**Status: UNCLEAR**. The CodeMirror integration in the prior report says "bridge between CodeMirror and the markdown text" for the Architecture C path. If the bridge is "CodeMirror edits markdown string, parser converts to delta, writes to Peritext YType, peers re-render markdown via serializer" — that's a client-side version of the bridge we're trying to delete. Racy, convergence-risky, and needs its own testing infrastructure.

The 100-200 LOC estimate was plausible IF CodeMirror can speak Peritext directly via a `@y/codemirror`-like binding. But `@y/codemirror` is a Y.Text binding, not a Peritext-semantic one. The adapter would have to be written from scratch.

## Revised estimate: 8-16 weeks minimum for an in-scope Option B

If we pulled Option B (Peritext-on-Yjs-14 as FW-1 done now) into this spec:

| Line item | LOC | Time | Assumptions |
|---|---|---|---|
| Yjs 14 package migration (yjs → @y/y, all call sites) | 100-300 | 1-2 weeks | Breaking imports across core/server/app/cli |
| TipTap binding replacement (`@y/prosemirror` fork or roll-our-own) | 500-1500 | 3-5 weeks | Rewrite is closed; we maintain a fork |
| CodeMirror source-mode preservation (NOT regression) | 300-800 | 2-4 weeks | Requires non-trivial client-side integration |
| Port y-prosemirror@1.3.7 patch forward | 100-200 | 0.5-1 week | Plus re-verification via snapshot tests |
| Hocuspocus/Tiptap Yjs-14 peer dep conflict resolution | — | 1-2 weeks | Monkey-patch resolutions or wait for upstream |
| applyAgentMarkdownWrite + applyExternalChange refactor | 200-400 | 1 week | Single-CRDT target |
| Test harness + C1-C10 rewrite against new model | 500-1000 | 2-3 weeks | Rebuild convergence tests |
| Fidelity invariants I1-I7 re-baseline under new storage | — | 1 week | Re-run + fix divergences |
| **TOTAL** | **~1,800-4,500** | **~12-19 weeks** | **Assuming Yjs 14 stabilizes by mid-spec** |

This is the Yjs 14 path. The Automerge path the SPEC references at §3 is 12-20 weeks per the sister report.

## The "2-4 weeks" re-read

Under the most charitable reading, "2-4 weeks" was the size of the HAPPY-PATH pure prototype (`@y/y` + `@y/prosemirror` + a markdown serializer on a greenfield app with no adjacent deps, no source-mode collaboration, no schema-safety patch). That's a research spike, not a production migration.

For Open Knowledge specifically — with:
- `yjs ^13` pinned across 4 workspace packages + 2 Tiptap peers + Hocuspocus peer,
- A 100-line `y-prosemirror@1.3.7` safety patch (CLAUDE.md precedent #9, R13),
- C1-C10 concurrent-edit convergence tests to preserve,
- Fidelity invariants I1-I7 to re-baseline,
- A CodeMirror 6 source editor with collaborative editing expected,

the honest estimate is **not 2-4 weeks**. It's a quarter (12-19 weeks) minimum. The SPEC §3 non-goal status for "single-CRDT collapse" is correct on risk/scope grounds, regardless of the architecture choice.

## Findings

- **CONFIRMED:** The 2-4 week estimate was conditional on assumptions (y-prosemirror v2 stable, Yjs 14 stable, source-mode non-collaborative) that are all **false** as of 2026-04-16.
- **CONFIRMED:** Recalibrated order-of-magnitude for Open Knowledge's pull-in: 12-19 weeks.
- **CONFIRMED:** This aligns with the SPEC's current D4-LOCKED scope decision (single-CRDT collapse is out-of-scope for bridge-correctness).
- **INFERRED:** A lighter pull-in (retroactively renaming FW-1 to something smaller like "source mode becomes read-only") is possible but incurs product regressions not evaluated by the prior report.
