# Evidence: Synthesis — Four-Way Comparison

**Dimension:** D9 (comparative synthesis)
**Date:** 2026-04-16

---

## Shared starting point

All four candidates share the same top-line goal: **replace the dual Y.XmlFragment + Y.Text CRDTs with a SINGLE CRDT so the bridge disappears and content preservation becomes a structural property.** Each path delivers this — the differences are in cost, ecosystem fit, and residual complexity.

## Comparative matrix

| Dimension | C1: Peritext-on-Yjs14 | C2: Automerge | C3: Loro | C4: Custom PM-native |
|---|---|---|---|---|
| **Core library version** | @y/y@14.0.0-rc.13 (1 day old) | @automerge/automerge@3.0 + @automerge/prosemirror@0.2.0 beta | loro@1.10.8 + loro-prosemirror@0.4.3 | Either prosemirror-collab (mature) or Weidner prototype or from scratch |
| **Production users (our scale)** | ZERO on v14 | Ink & Switch projects, Trellis | SchoolAI | ZERO (for the "CRDT from scratch" path) |
| **Peritext boundary semantics** | NOT SOLVED (ContentFormat unchanged) | CORRECT (ExpandMark) | CORRECT (per-mark expand flag) | Depends on build path |
| **Fork/merge non-interleaving** | NO | LIMITED (via heads changes) | YES (Fugue) | Would have to build |
| **Hocuspocus compatible** | NO (peerDep pin yjs@^13) | NO (replaced by automerge-repo) | NO | NO |
| **TipTap 3.0 compatible** | NO (yjs@^13 pin) | Custom wrapper | Custom wrapper | Yes via prosemirror-collab |
| **CodeMirror dual-view** | Gap (tree-delta incompatible) | Same gap | Bindings OK but block markers non-markdown | Novel problem |
| **Bundle size impact** | ~+0KB (Yjs stays pure JS) | +1.7MB WASM | +970KB WASM | +0-300KB |
| **Bridge code deleted** | ~1200 lines (observers ×2, apply-by-prefix-suffix, diff-lines-fast, merge3, extension) | Same ~1200 | Same ~1200 | Same ~1200 |
| **Hocuspocus code deleted/rewritten** | ~3000 (all server files) OR fork Hocuspocus (1-2 days) | ~3000 (all server files) | ~3000 (all server files) | ~3000 (all server files) |
| **Optimistic effort (weeks)** | 2-4 (spike only) | 10-12 | 12-16 | 16-22 |
| **Realistic effort (weeks)** | 10-16 | 14-18 | 16-22 | 24-32 |
| **Conservative effort (weeks)** | 16-26 | 18-24 | 20-28 | 40-60 |

## Ranking by each axis

### Production readiness (2026-04-16), best → worst

1. **C2 Automerge** — stable 3.0 core, beta ProseMirror plugin (but beta documented + Ink & Switch backs it).
2. **C3 Loro** — 1.0 core (Oct 2024), pre-1.0 binding with ACTIVE data-loss bug.
3. **C1 Yjs 14** — core RC 1 day old, zero production users.
4. **C4 Custom** — depends on path; OT (prosemirror-collab) path is mature but not a CRDT; CRDT path is prototype-or-scratch.

### Greenfield alignment (structural correctness; precedent-setting)

1. **C3 Loro** — three simultaneous structural wins (single CRDT + correct boundary semantics + fork/merge). Most precedent-setting.
2. **C2 Automerge** — single CRDT + correct Peritext + version-history built-in.
3. **C1 Yjs 14** — single CRDT (barely — tree-delta-only in practice today), boundary anomaly persists.
4. **C4 Custom** — conceptually most aligned (we own everything), practically builds debt proportional to ambition.

### Migration cost, cheapest → most expensive

1. **C1 Yjs 14 SPIKE** (2-4 weeks) — but does not meet production bar.
2. **C2 Automerge** (14-18 weeks realistic) — ecosystem trade-off is clear but bounded.
3. **C3 Loro** (16-22 weeks realistic) — plus ongoing binding stabilization risk.
4. **C1 Yjs 14 PRODUCTION** (10-16 weeks realistic with Hocuspocus fork) — lower floor, but original-work CodeMirror binding adds uncapped tail risk.
5. **C4 Custom** (24-32+ weeks) — highest with longest uncapped tail.

### Risk, lowest → highest

1. **C2 Automerge** — beta but behind a mature org, clear 3.0 stability, known limitations.
2. **C1 Yjs 14** — bet on a one-day-old RC at the foundation, low bundle risk but ecosystem risk uncapped.
3. **C3 Loro** — active data-loss bug + sole-maintainer bus factor is acute.
4. **C4 Custom** — CRDT correctness is a solved problem BY SOMEONE ELSE. Doing it ourselves re-raises the correctness question.

### Code deleted from current codebase

Approximately identical across all four (~4200 lines including bridge + Hocuspocus-dependent code + tests). The difference is what REPLACES them — size and quality of the replacement.

### New complexity introduced

1. **C2 Automerge** — bounded (defined library APIs, defined PM binding, defined sync server shape).
2. **C1 Yjs 14** — bounded BUT two loose ends (Hocuspocus fork-or-replace, CM binding original work).
3. **C3 Loro** — bounded + custom sync server (Hocuspocus-equivalent) is a known unknown.
4. **C4 Custom** — unbounded; we own the novel surface.

## Why C1 looks cheap but isn't

Prior Peritext-on-Yjs-feasibility report flagship claim: "Architecture C in 2-4 weeks." 2026-04-16 refresh sharpened this:
- **2-4 weeks is the SPIKE estimate, not the production estimate.**
- No public dual-view dual-editor binding exists — first production user does original work.
- `@y/codemirror` CANNOT consume a tree delta at `y-sync.js:209` — hard cast to string.
- The Yjs ecosystem (Hocuspocus, TipTap, y-codemirror.next, y-partykit, @liveblocks/yjs, @lexical/yjs, @platejs/yjs) ALL pin yjs@^13. Adopting v14 means whole-stack swap to `@y/*` scope OR fork Hocuspocus.

## Why C4 is not on the table

- We would be first production user of anything we build.
- Yjs took ~5 years to 1.0. Automerge took a decade. Loro core reached 1.0 in Oct 2024, binding still pre-1.0.
- Correctness requires formal reasoning (convergence, intention preservation, bounded history) we don't have time to internalize.
- Greenfield precedent #7: shipping confidently-broken capabilities is worse than absent ones. A CRDT with undiscovered correctness holes is confidently broken.

## Why C3 is NOT THE RECOMMENDATION despite strongest structural story

- Active data-loss bug (#77) unresolved.
- One maintainer on the binding.
- No production sync server.
- For a product positioning as a trustworthy knowledge base, an active data-loss bug is product-fatal.
- **Revisit when: binding #77 resolved AND at least one other major production user identified AND a production-grade sync server emerges.**

## Why C2 wins

- Single CRDT collapse: delivered.
- Peritext semantics correct by construction: delivered.
- Built-in version history (change DAG): bonus.
- Backed by Ink & Switch (the researchers who invented Peritext) — highest authority signal on rich-text CRDT correctness.
- Beta binding BUT documented, maintained, predictable.
- Effort: 14-18 weeks realistic — bounded, plannable, inside a quarter.
- Ecosystem trade-off (give up Hocuspocus/TipTap extensions) is KNOWN and SCOPED.
