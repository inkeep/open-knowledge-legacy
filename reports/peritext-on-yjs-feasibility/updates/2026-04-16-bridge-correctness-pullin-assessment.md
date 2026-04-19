---
title: "Peritext-on-Yjs Pull-In Assessment for bridge-correctness spec"
description: "Fresh evidence-backed verdict on whether the bridge-correctness spec should pull Peritext-on-Yjs-14 into scope today (Option B), or ship 4 state-based buckets with Peritext as a subsequent spec (Option A). Validates the prior 2-4 week effort estimate against current (2026-04-16) ecosystem state."
createdAt: 2026-04-16
updatedAt: 2026-04-16
relatedReport: peritext-on-yjs-feasibility
relatedSpec: 2026-04-16-bridge-correctness
subjects:
  - Yjs 14
  - "@y/y"
  - "@y/prosemirror"
  - y-prosemirror
  - y-codemirror.next
  - "@hocuspocus/server"
  - "@tiptap/extension-collaboration"
  - Peritext
topics:
  - CRDT migration feasibility
  - Yjs 14 ecosystem readiness
  - spec scope assessment
---

# Peritext-on-Yjs Pull-In Assessment (bridge-correctness spec, 2026-04-16)

**Purpose.** The bridge-correctness spec at `specs/2026-04-16-bridge-correctness/SPEC.md` has two scope options on the table:
- **Option A (current plan):** Ship 4 buckets (Bucket 0 / A / B / C) of state-based bridge fixes, with Peritext-on-Yjs as subsequent spec FW-1. D4 is LOCKED to this.
- **Option B (challenger's greenfield argument):** Pull Peritext-on-Yjs-14 into this spec's scope now.

The prior `reports/peritext-on-yjs-feasibility/REPORT.md` (2026-04-07) estimated 2-4 weeks for "Architecture C" as the bridge-eliminating path and cited that estimate as support for Option B pull-in feasibility.

This update re-runs the assumption set against 2026-04-16 ecosystem state and concludes: **the 2-4 week estimate is stale and does not apply to Open Knowledge's actual migration surface. D4's current LOCKED state (single-CRDT collapse out-of-scope) should stand. Option A ships; Option B becomes a separate spec after Bucket A's post-condition (R1) generates production-rate signal.**

---

## Executive summary

**The 2-4 week estimate relied on four assumptions. All four are false as of 2026-04-16:**

| Assumption from prior REPORT.md | Status today | Evidence |
|---|---|---|
| y-prosemirror v14 works with flat YType "as-is" | FALSE — rewrite PR #208 **closed without merge** on 2026-03-19 by dmonad | [adjacent-library-compat.md](../evidence/2026-04-16-updates/adjacent-library-compat.md) |
| Yjs 14 stable enough for production | FALSE — still in active `rc.N` phase (rc.13 shipped 2026-04-14), under a DIFFERENT npm scope (`@y/y`, not `yjs`), with RC velocity ~1/day | [yjs-14-release-status.md](../evidence/2026-04-16-updates/yjs-14-release-status.md) |
| Hocuspocus/Tiptap stack compatible | FALSE — `@hocuspocus/server@4.0.0-rc.5` (shipped 6 h before this assessment) still pins `yjs: ^13.6.8`; `@tiptap/extension-collaboration@3.22.3` still pins `yjs: ^13` | [adjacent-library-compat.md](../evidence/2026-04-16-updates/adjacent-library-compat.md) |
| Source-mode UX regression acceptable | UNDEFINED — Architecture C's non-collaborative source view is a REGRESSION from current C1-C10-tested behavior. Product impact unpriced. | [file-by-file-migration-scope.md](../evidence/2026-04-16-updates/file-by-file-migration-scope.md) |

**Recalibrated effort for Open Knowledge specifically: 12-19 weeks**, not 2-4.

**Additionally**, the prior report conflated "Peritext semantics" with "Yjs 14's unified YType" — but Yjs 14 did NOT add ExpandMark / BoundaryPosition semantics. It refactored the **type system**, not the **formatting CRDT storage**. A Yjs 14 pull-in still would NOT give us Peritext semantics. The term "Peritext" in `FW-1` does heavy rhetorical work that the technical substance doesn't support.

**Verdict:** Keep D4 locked. Ship Option A. The Bucket A post-condition (R1) generates production signal that will tell us whether a future single-CRDT migration spec is warranted — AND by that time, one or more of the three blocking assumptions above may have resolved.

---

## Research questions & resolved findings

### Q1: Yjs 14 release status — is it production-deployable today?

**Answer: No.** Evidence: [yjs-14-release-status.md](../evidence/2026-04-16-updates/yjs-14-release-status.md) + [adjacent-library-compat.md](../evidence/2026-04-16-updates/adjacent-library-compat.md).

- The Yjs 14 line was renamed from `yjs` (npm) to `@y/y` (npm) on 2026-02-25. Active RC cadence is on `@y/y`.
- Latest `@y/y` is `14.0.0-rc.13`, published 2026-04-14. 13 RCs in ~2 months. Prior series had 22 numeric pre-releases since April 2025 — so v14 has been in pre-release for a full year.
- `14.0.0-rc.7` was briefly published as non-prerelease on 2026-03-27, then rewound to `prerelease=True` with rc.8 within hours — inconsistent with a "stabilizing" signal.
- **Adjacent-library non-compatibility:** `@hocuspocus/server@4.0.0-rc.5` (shipped 2026-04-16 — six hours before this assessment) still pins `yjs: ^13.6.8`. `@tiptap/extension-collaboration@3.22.3` (latest stable, 2026-04-08) pins `yjs: ^13`. Neither has an open PR for Yjs 14 / `@y/y` support.
- No blog post, Liveblocks announcement, Notion / Atlassian / Tiptap reveal, or `discuss.yjs.dev` post was found documenting a Yjs 14 production deployment.

Peer-dep conflicts for the Open Knowledge stack under an immediate pull-in: immediate.

### Q2: Peritext-on-Yjs ecosystem state

**Answer: Zero production bindings. Yjs 14 is NOT itself Peritext-compliant.** Evidence: [peritext-ecosystem-state.md](../evidence/2026-04-16-updates/peritext-ecosystem-state.md).

- No npm package binds Peritext semantics to Yjs. No one is building one.
- Yjs 14's "unified YType" refactor is a TYPE-SYSTEM change, not a CRDT-semantics change. `ContentFormat` marker-item storage is unchanged between Yjs 13.6 and `@y/y 14.0.0-rc.13`. The Peritext boundary anomaly the prior report documents in D1 is **preserved** in Yjs 14.
- The `y-prosemirror/PROJECT_GOALS.md` document (authored during the v2 rewrite effort) discusses Yjs 14's new "content renderer" API and delta protocol — but does NOT mention Peritext, ExpandMark, boundary semantics, or dual-view capabilities.
- Ink & Switch has published no follow-up essay extending Peritext to block elements since the November 2022 paper. The "future work" promised in the essay has not materialized.

**Implication for the spec's FW-1 label:** "Single-CRDT collapse via Peritext on Yjs 14" (SPEC §15 FW-1) is two distinct things: (a) single-CRDT collapse, which is about eliminating the bridge, and (b) Peritext semantics, which is about boundary correctness for concurrent overlapping format ops. Yjs 14 delivers (a)'s type-system premise only; it does NOT deliver (b). Renaming or splitting FW-1 may clarify.

### Q3: File-by-file migration scope

**Answer: Deletes ~2,400 LOC; writes ~1,800-4,500 LOC, not 500-1000.** Evidence: [file-by-file-migration-scope.md](../evidence/2026-04-16-updates/file-by-file-migration-scope.md).

Highlights:
- Prior report's Architecture C (500-1000 LOC) undercounted:
  - CodeMirror source-mode preservation (+300-800 LOC if we avoid UX regression).
  - Port of the 100-line `y-prosemirror@1.3.7` patch (R13 safety net per CLAUDE.md precedent #9) forward to `@y/prosemirror` v2's architecturally-different delta applier.
  - Yjs 14 package-rename call-site fix-ups across `packages/{core,server,app,cli}/package.json` + source imports.
  - New Hocuspocus / Tiptap peer-dep resolution (monkey-patch overrides in `bun.lock` or wait for upstream).
  - Test harness rebuild: C1-C10 convergence tests, `attachBridgeInvariantWatcher`, fuzz harness, network-control — all retire or rebuild.
- The markdown-translation problem **relocates** to server-side ingest (W3: `applyAgentMarkdownWrite`, W4: `applyExternalChange`) — it doesn't disappear. Single-CRDT collapse simplifies the propagation matrix (1 write direction per surface) but doesn't make the translation code zero.

### Q4: Dual-view viability on a single Peritext CRDT

**Answer: Architecture C delivers dual VIEW but NOT dual EDITING — regression from current behavior.** Evidence: [file-by-file-migration-scope.md §"Two load-bearing questions"](../evidence/2026-04-16-updates/file-by-file-migration-scope.md).

The prior report §D5 flagged this exact gap:
> "The escape is full only if the source-mode editor speaks Peritext directly."

Architecture C (the 2-4 week path) explicitly states "Source view is non-collaborative." Open Knowledge today supports concurrent WYSIWYG + source-mode editing (C1-C10 tests defend this). Architecture C ships a regression here. Options for avoiding the regression:
- **C-a:** Client-side markdown ↔ Peritext bridge. Re-introduces the problem we're eliminating, just relocated to the client. Racy, convergence-risky, needs testing infrastructure.
- **C-b:** CodeMirror binds to the Peritext tree directly. Implausible — CodeMirror is a text editor, not a tree editor.
- **C-c:** Source mode becomes read-only. UX regression that needs product-owner sign-off.

The prior report did NOT price any of C-a/C-b/C-c. The 2-4 week estimate presumed one of them without quantifying the tradeoff.

### Q5: Effort estimate validation

**Answer: Recalibrated to 12-19 weeks.** Evidence: [effort-recalibration.md](../evidence/2026-04-16-updates/effort-recalibration.md).

The prior 2-4-week estimate was defensible for a greenfield prototype. For Open Knowledge specifically — with 4 workspace packages pinning `yjs ^13`, a critical `y-prosemirror@1.3.7` safety patch, defended C1-C10 concurrent-edit convergence, and a collaborative source editor — the honest number is a full quarter minimum.

### Q6: Risk enumeration for Option B (pull FW-1 in now)

Evidence pulls from all of: [yjs-14-release-status](../evidence/2026-04-16-updates/yjs-14-release-status.md), [adjacent-library-compat](../evidence/2026-04-16-updates/adjacent-library-compat.md), [peritext-ecosystem-state](../evidence/2026-04-16-updates/peritext-ecosystem-state.md), [file-by-file-migration-scope](../evidence/2026-04-16-updates/file-by-file-migration-scope.md).

1. **Ecosystem-bleeding-edge risk (HIGH).** Yjs 14 is `rc.13` under a new npm scope. RC velocity ~1/day means we ship on a moving target. Issue #751 confirmed the v14 line has had packaging bugs recently. Open Knowledge would be a first-adopter alongside small experimental projects.

2. **Transitive-library breakage risk (HIGH).** `@hocuspocus/server@4.0.0-rc.5`, `@tiptap/extension-collaboration@3.22.3`, `@tiptap/y-tiptap@3.0.3`, and `y-codemirror.next@0.3.5` all peer-pin `yjs: ^13`. Resolution options: (a) fork each, (b) monkey-patch via `bun.lock` overrides + hope semver-compat is actual-compat, (c) wait for upstream. None is safe or fast.

3. **Rewrite-rejection risk (HIGH).** The specific y-prosemirror v2 rewrite we'd migrate to was CLOSED WITHOUT MERGE on 2026-03-19 by Kevin Jahns. Whatever replaces it is at dmonad's discretion and undefined timeline. We could build on `@y/prosemirror@2.0.0-2` (last published 2025-12-16, pinning a now-stale `@y/y@14.0.0-16`), then get a rug-pull when the real modular refactor lands and breaks API.

4. **Source-mode UX regression risk (MEDIUM-HIGH).** If Architecture C is the vehicle, source-mode collaborative editing dies. Open Knowledge's product-differentiated feature set includes live markdown editing alongside WYSIWYG — C1-C10 tests are the guard. Regressing this needs product sign-off.

5. **Schema-evolution preservation risk (MEDIUM).** CLAUDE.md precedent #9 ("schema is add-only forever") is enforced by:
   - `packages/core/src/schema-invariant.test.ts` snapshot test.
   - The 100-line `patches/y-prosemirror@1.3.7.patch` replacing destructive-delete with `rawMdxFallback` substitution (R13 safety net).
   Under Peritext: the schema storage model shifts to flat text + marks + block markers; the "schema.node() throws" failure mode from `y-prosemirror@1.3.7/sync-plugin.js` does not exist in the same form. But the underlying concern (schema change destroys CRDT items) recurs differently. The safety-net patch must be re-ported to `@y/prosemirror` v2's delta applier. Re-verification via the snapshot test is required. This is a workstream of its own, not free.

6. **Yjs-14-beta regression risk (MEDIUM).** Moment.dev's March 2026 production experience ([article](https://www.moment.dev/blog/lies-i-was-told-pt-2)) documented that on Yjs 13 "`schema.node()` threw exceptions due to schema invalidity, and the node appeared to be permanently deleted, and that deletion was propagated to all peers." This IS what precedent #9 is guarding against. Any Yjs 14 migration needs to verify the equivalent path is safe — no regression on Yjs 14 has been documented either way yet.

7. **Fidelity-invariant re-baseline risk (MEDIUM).** Markdown round-trip invariants I1-I7 (CLAUDE.md §"Storage-layer fidelity contract") pass today against the dual-CRDT model. Under Peritext / single-CRDT, the storage representation changes; each invariant must be re-verified. Some invariants (I3 canonicality, I6 multi-client preservation) could develop new divergence-by-default behavior. ~1 week budget item to re-run + fix.

---

## Recommendation (unchanged from SPEC §3 D4)

**Keep Option A LOCKED.** Ship the 4 buckets of bridge-correctness work. Treat Peritext-on-Yjs-14 (FW-1) as a separate spec per the greenfield directive — "not deferred, separable by design."

**Revise the prior REPORT.md's executive summary.** The "2-4 weeks for dual-view" claim is misleading for Open Knowledge. Add a conditional block stating the estimate was for a greenfield prototype and requires all four assumptions to hold.

**Consider renaming / splitting FW-1** once this spec ships, since "Peritext semantics" and "single-CRDT collapse" are two distinct things Yjs 14 does NOT both deliver.

**Let Bucket A's R1 telemetry generate the signal** that tells us whether FW-1 urgency is real. Per SPEC §7 M4 / §11 Q6, the 30-day post-ship observation window for `bridge-merge-content-loss` events is the objective trigger. If the rate is high and concentrated at specific interleavings, FW-1 becomes urgent. If it's sparse, D4's patience was correct.

**Revisit in 2026 Q3 (approx).** Good signals for reopening pull-in:
- Yjs 14 reaches `@y/y` `latest` tag at a non-pre-release version.
- `@tiptap/extension-collaboration` or `@hocuspocus/server` ships a version with `yjs: ^14` peer pin.
- The y-prosemirror modular-refactor vision dmonad described becomes concrete (PR opened or discussion resumed).
- Ink & Switch publishes Peritext extension to blocks (low probability — their research direction has shifted).

---

## Confidence labels

All labeled evidence below is CONFIRMED unless explicitly marked INFERRED or UNCERTAIN.

| Finding | Confidence |
|---|---|
| `@y/y` 14.0.0-rc.13 is the current v14 head; `yjs` v14 pre-releases are 4-month-stale | CONFIRMED |
| `@y/prosemirror` v2 rewrite was closed without merge on 2026-03-19 | CONFIRMED |
| `@hocuspocus/server@4.0.0-rc.5` and `@tiptap/extension-collaboration@3.22.3` peer-pin `yjs: ^13` | CONFIRMED |
| `@y/codemirror@0.0.0-3` is a skeleton, not a production CodeMirror Peritext binding | CONFIRMED |
| Yjs 14 does NOT add Peritext ExpandMark / BoundaryPosition semantics | CONFIRMED |
| No production Peritext-on-Yjs library exists | CONFIRMED |
| Open Knowledge stack uses `yjs ^13.6.30` across 4 packages + 3 transitive peer-pinned libraries | CONFIRMED |
| "2-4 weeks" is charitable for a greenfield prototype, not Open Knowledge's migration surface | INFERRED |
| 12-19 weeks is the realistic recalibrated range for Open Knowledge | INFERRED |
| Architecture C's non-collaborative source mode is a product regression | CONFIRMED (C1-C10 tests are the defense) |
| D4's "out-of-scope for bridge-correctness" scope decision remains correct | CONFIRMED |

---

## References

### Fresh evidence files (this update)
- [../evidence/2026-04-16-updates/yjs-14-release-status.md](../evidence/2026-04-16-updates/yjs-14-release-status.md)
- [../evidence/2026-04-16-updates/adjacent-library-compat.md](../evidence/2026-04-16-updates/adjacent-library-compat.md)
- [../evidence/2026-04-16-updates/peritext-ecosystem-state.md](../evidence/2026-04-16-updates/peritext-ecosystem-state.md)
- [../evidence/2026-04-16-updates/file-by-file-migration-scope.md](../evidence/2026-04-16-updates/file-by-file-migration-scope.md)
- [../evidence/2026-04-16-updates/effort-recalibration.md](../evidence/2026-04-16-updates/effort-recalibration.md)

### Prior report sections
- [../REPORT.md §D1](../REPORT.md) — Y.Text formatting API / boundary semantics
- [../REPORT.md §D5](../REPORT.md) — TipTap/Hocuspocus blast radius
- [../REPORT.md §D7](../REPORT.md) — Three-architecture effort estimate
- [../evidence/implementation-effort.md](../evidence/implementation-effort.md) — Original LOC breakdown

### Spec context
- `specs/2026-04-16-bridge-correctness/SPEC.md` — §3 (non-goals, D4-LOCKED), §11 (Q6 — production rate signal), §15 (FW-1)
- `specs/2026-04-16-bridge-correctness/evidence/bridge-surface-map.md` — file-by-file map of the bridge layer

### External sources
- [npm registry: `yjs`](https://registry.npmjs.org/yjs) — dist-tags + version history
- [npm registry: `@y/y`](https://registry.npmjs.org/@y/y) — dist-tags + version history
- [npm registry: `@y/prosemirror`](https://registry.npmjs.org/@y/prosemirror) — version history + peer deps
- [npm registry: `@y/codemirror`](https://registry.npmjs.org/@y/codemirror) — version history + peer deps
- [npm registry: `@hocuspocus/server`](https://registry.npmjs.org/@hocuspocus/server) — 4.0.0-rc.5 peer deps
- [npm registry: `@tiptap/extension-collaboration`](https://registry.npmjs.org/@tiptap/extension-collaboration) — 3.22.3 peer deps
- [GitHub: yjs/yjs releases](https://github.com/yjs/yjs/releases)
- [GitHub: yjs/y-prosemirror PR #208](https://github.com/yjs/y-prosemirror/pull/208) — rewrite closed without merge
- [Moment.dev: Lies I was Told About Collaborative Editing Pt 2](https://www.moment.dev/blog/lies-i-was-told-pt-2) — production Yjs experience, schema-node-throws failure mode
- [Open Collective: y-prosemirror funding proposal](https://opencollective.com/y-collective/projects/y-prosemirror) — $30k threshold for rewrite
