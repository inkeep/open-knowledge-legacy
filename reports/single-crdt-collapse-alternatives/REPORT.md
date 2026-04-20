---
title: "Single-CRDT Collapse Alternatives: Automerge, Peritext-on-Yjs-14, Loro, Custom PM-Native Comparison"
description: "Four-way comparison of candidate paths to eliminate Open Knowledge's dual-CRDT bridge (Y.XmlFragment + Y.Text). Evaluates production readiness, migration scope, ecosystem fit, effort estimates, and risk profile for Automerge 2.2+, Peritext-on-Yjs-14, Loro, and custom PM-native CRDT. Verifies claims against npm registry, GitHub issue trackers, library peer-dependency pins, and source code. Concludes Automerge 2.2+ is the recommended path on production-readiness + cost axes; Loro ranks first on greenfield alignment but blocked by active data-loss issue; Yjs 14 foundation is one-day-old RC with incompatible ecosystem peers; custom PM-native CRDT violates greenfield precedent #7."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Automerge
  - Peritext
  - Yjs 14
  - Loro
  - ProseMirror
  - TipTap
  - Hocuspocus
  - y-prosemirror
  - automerge-prosemirror
  - loro-prosemirror
topics:
  - CRDT migration
  - single-CRDT collapse
  - rich-text CRDT comparison
  - markdown collaborative editor architecture
  - dual-view editor sync
---

# Single-CRDT Collapse Alternatives

**Purpose:** Compare the four viable paths to eliminate the dual-CRDT bridge
(Y.XmlFragment ↔ Y.Text) that underlies Open Knowledge's editor. No
purely-state-based three-way merge can preserve content under arbitrary
interleavings (Khanna-Kunal-Pierce 2007); single-CRDT collapse is the only
structurally correct long-term fix. Ranks candidates across production
readiness, migration scope, risk, and greenfield alignment.

## Executive Summary

| Candidate | Realistic effort | Production users (exact version) | Verdict |
|---|---|---|---|
| **C1: Peritext-on-Yjs-14** | 10-16 weeks | **0 on v14** | Spike only — ecosystem foundation one day old |
| **C2: Automerge 2.2+** | 14-18 weeks | Ink & Switch Patchwork, Trellis | **Recommended (production-readiness + cost)** |
| **C3: Loro** | 16-22 weeks | SchoolAI (sole major) | Revisit in 6-12 months — open data-loss #77 |
| **C4: Custom PM-native CRDT** | 24-60+ weeks | 0 | Not viable (greenfield precedent #7 conflict) |

**Recommendation: C2 Automerge 2.2+** — the only candidate with (a) Peritext
semantics correct by construction, (b) production-maintained binding
(`@automerge/prosemirror` by Ink & Switch, Peritext's inventors), (c) effort
bounded inside a quarter (14-18 weeks), (d) every component has a named
library (no original-work tail risk). Automerge 3.0 (July 2025) removed the
previous memory-cost blocker (10x reduction: Moby Dick 700MB→1.3MB load).

**C3 Loro is the best structural fit** — single CRDT + Peritext correctness
+ native fork/merge with Fugue non-interleaving (unique among candidates) —
but blocked by [Issue #77](https://github.com/loro-dev/loro/issues/77)
(content wipe race in LoroSyncPlugin's docChanged-before-init() path; open
since 2026-03-28) and sole-maintainer bus factor. Reconsider when the issue
merges with regression test + ≥1 additional major production user.

**C1 Peritext-on-Yjs-14 is a FICTION as of 2026-04-16.** `@y/y@14.0.0-rc.13`
was published one day before this assessment; every Yjs ecosystem library
(TipTap, Hocuspocus, y-codemirror.next) still pins `yjs@^13`; `@y/codemirror`
hard-casts to string at `y-sync.js:209` blocking tree-delta dual-view. Plus:
Yjs 14 does NOT implement Peritext — it unifies the type system but the
`ContentFormat` boundary anomaly is byte-identical between 13.6.30 and
14.0.0-rc.13. "Yjs 14 = Peritext" conflates two separable concerns.

**C4 Custom PM-native CRDT** would make us the first production user of
whatever we build. CRDT correctness is empirically a multi-year engineering
effort (Yjs ~5 years to 1.0, Automerge decade-scale). Violates precedent #7
(confidently-broken capabilities worse than absent ones).

## Research Rubric

| ID | Dimension | Priority | Depth | Evidence |
|---|---|---|---|---|
| C1 | Peritext-on-Yjs-14 production readiness + migration scope | P0 | Deep | [evidence/c1-peritext-on-yjs-14.md](evidence/c1-peritext-on-yjs-14.md) |
| C2 | Automerge 2.2+ production readiness + migration scope | P0 | Deep | [evidence/c2-automerge.md](evidence/c2-automerge.md) |
| C3 | Loro production readiness + issue #77 status | P0 | Deep | [evidence/c3-loro.md](evidence/c3-loro.md) |
| C4 | Custom ProseMirror-native CRDT (prosemirror-collab / Weidner prototype / Peritext-on-Micromerge) | P1 | Moderate | [evidence/c4-custom-pm-native-crdt.md](evidence/c4-custom-pm-native-crdt.md) |
| Synth | Comparative ranking across 13 axes | P0 | Deep | [evidence/synthesis-comparison.md](evidence/synthesis-comparison.md) |

## Three-Axis Ranking

Single "rank first" is axis-dependent; see [evidence/synthesis-comparison.md](evidence/synthesis-comparison.md) for the full 13-axis table.

1. **Production readiness** (as of 2026-04-16): **C2 Automerge > C3 Loro > C1 Yjs 14 > C4 Custom**
   - Automerge has multiple production deployments; binding is beta-but-maintained
   - Loro has one major production user + open data-loss issue
   - Yjs 14 has zero production users on v14
   - Custom has zero production users (would be first)

2. **Greenfield alignment** (structural correctness, precedent-setting): **C3 Loro > C2 Automerge > C1 Yjs 14 > C4 Custom**
   - Loro uniquely offers: single CRDT + Peritext + native fork/merge (Fugue non-interleaving)
   - Automerge offers: single CRDT + Peritext (Ink & Switch reference implementation)
   - Yjs 14 does NOT implement Peritext (boundary anomaly preserved)
   - Custom would need to implement all three from scratch

3. **Migration cost** (cheaper → more expensive): **C1 Yjs 14 (spike) > C2 Automerge > C3 Loro > C4 Custom**
   - Yjs 14 advertised "2-4 weeks" was based on faulty ecosystem-ready assumptions; real cost under an independent fork is 10-16 weeks
   - Automerge 14-18 weeks with `@automerge/prosemirror` binding
   - Loro 16-22 weeks + custom sync server (no Hocuspocus equivalent)
   - Custom 24-60+ weeks

## Detailed Findings — Summary

### C1: Peritext-on-Yjs-14 (NOT recommended for current spec window)

**Production readiness:** ZERO production users on v14. `@y/y@14.0.0-rc.13`
published 2026-04-14 (one day before this research). `@tiptap/y-tiptap@3.0.3`
(8 days old) STILL pins `yjs@^13.5.38`. `@hocuspocus/server@4.0.0-rc.5`
(published 6 hours before this research) still pins `yjs@^13.6.8`. `y-prosemirror`
PR #208 (v14 rewrite) closed without merge 2026-03-19 by dmonad. `@y/codemirror@0.0.0-3`
is a skeleton pinned to stale RC.

**Category error in the "Yjs 14 = Peritext" framing:** Yjs 14 refactored the
type system (unified YType, delta protocol, content renderer API). It did
NOT change the formatting CRDT storage — `ContentFormat` marker items are
byte-identical between `yjs@13.6.30` and `@y/y@14.0.0-rc.13`. [Issue #291](https://github.com/yjs/yjs/issues/291)
(boundary anomaly) open since April 2021, preserved in v14.

**Realistic effort:** 10-16 weeks. The "2-4 weeks" estimate from the prior
report assumed working `y-prosemirror@14`, Yjs 14 stable, compatible
TipTap/Hocuspocus, and acceptable source-mode UX regression. **All four
assumptions are false as of 2026-04-16.**

### C2: Automerge 2.2+ (RECOMMENDED)

**Production readiness.** Automerge 3.0 (July 2025) backwards-compatible
file format. `@automerge/prosemirror@0.2.0` beta, maintained by Ink & Switch.
Automerge 3's 10x memory reduction removed previous disqualifier.
Production users: Ink & Switch Patchwork, Trellis.

**Migration scope.** ~1200 LOC bridge code deleted (merge-three-way.ts,
apply-diff.ts, server-observers.ts, observer-extension.ts, observers.ts,
merge-three-way.test.ts). Each of ~20 TipTap extensions needs
Automerge-annotated SchemaAdapter NodeSpec. No cursor plugin (custom
~1-2wk). No undo plugin (custom ~1-2wk). CodeMirror source-mode:
flat-span model structurally simpler than Y.XmlFragment tree, but still
needs span↔markdown projection. Hocuspocus replaced by
`automerge-repo-sync-server` + custom orchestration. ~10 server files
rewritten. Shadow-repo attribution journal streams AM changes instead of
Y.Doc updates.

**Effort:** Optimistic 10-12 weeks, realistic 14-18, conservative 18-24.
Plus Open Knowledge-specific shadow-repo rewrite (2-3 wk) and MDX extension
adapters (1-2 wk) = **realistic 16-22 weeks end-to-end**.

**Risk profile.** Binding is beta but maintained by Peritext inventors.
1.7MB WASM bundle (vs Yjs 69KB) — bundle-size budget sensitive. 4.5x larger
update messages. Full change DAG storage. Reverse migration very high
(no Yjs↔Automerge tooling).

**Advantages.** Peritext ExpandMark (before/after/both/none) correct by
construction. Highest-authority signal for rich-text CRDT correctness:
using the reference implementation. Bounded effort. Every component has
named libraries — no original-work tail risks.

### C3: Loro (reconsider in 6-12 months)

**Production readiness.** Core v1.10.8 solid (1.0 since Oct 2024).
`loro-prosemirror@0.4.3` pre-1.0. **[Issue #77](https://github.com/loro-dev/loro/issues/77)**
(content wipe race) opened 2026-03-28, STILL OPEN as of 2026-04-16 — the
dominant risk. Socket.dev: "1 open source maintainer." npm 18.6k/week. Sole
major production user: SchoolAI. No production sync server — SimpleServer
is testing-grade.

**Unique structural advantages.** Three simultaneous wins found in no
other candidate: (1) single CRDT, (2) correct Peritext, (3) native
fork/merge with Fugue non-interleaving (uniquely solves fork/merge
per `reports/crdt-branching-namespacing-prior-art`).

**Blocking issue.** #77 is product-fatal for a trustworthy knowledge base.
Reconsider when: (a) #77 merged with regression test, (b) ≥1 additional
major production user, (c) production-grade sync server emerges. Estimated
6-12 months.

### C4: Custom ProseMirror-native CRDT (NOT viable)

Three prior-art points: `prosemirror-collab` (OT not CRDT; no convergence
guarantee per Marijn); Weidner's `prosemirror-crdt` (author: "just a
prototype"); Peritext reference on Micromerge (proof-of-concept). Yjs took
~5 years to 1.0, Automerge decade-scale. Kevin Jahns has repeatedly
documented production CRDT correctness as multi-year engineering.

Effort: 24-60+ weeks. MAXIMUM risk. First production user of whatever
we build. Violates greenfield precedent #7.

## Recommendation

**Ship C2 Automerge 2.2+ when Open Knowledge commits to collapse.**

**When NOT to recommend C2:**
- **Fork/merge becomes a foundational product capability** → Loro's Fugue
  non-interleaving is uniquely strong. Signal: product roadmap elevates
  "review drafts" from feature to foundation.
- **Bundle size is a hard constraint** (1.7MB WASM) → revisit Yjs 14 with
  Hocuspocus fork. Signal: platform pivots to mobile/embedded/ambient.
- **TipTap-extension rewrite cost is unabsorbable** (~20 extensions need
  SchemaAdapter work) → C1 Yjs 14 with Hocuspocus fork preserves more
  TipTap investment if the ecosystem catches up.

**Reconsider in 6-12 months:** Loro if issue #77 resolves + 2nd major
production user materializes + production-grade sync server emerges.

**Reconsider in 12-24 months:** Yjs 14 if ecosystem peers (Hocuspocus, TipTap,
y-codemirror.next) ship with `yjs: ^14` peer dependency and at least one
major production deployment exists.

## Sources

- [npm registry: yjs](https://registry.npmjs.org/yjs)
- [npm registry: @y/y](https://registry.npmjs.org/@y/y)
- [y-prosemirror PR #208 (v14 rewrite, closed)](https://github.com/yjs/y-prosemirror/pull/208)
- [Moment.dev — Lies I Was Told (Yjs production experience)](https://www.moment.dev/blog/lies-i-was-told-pt-2)
- [Peritext paper (CSCW 2022)](https://dspace.mit.edu/bitstream/handle/1721.1/147641/3555644.pdf)
- [Peritext landing page (Ink & Switch)](https://www.inkandswitch.com/peritext/)
- [y-prosemirror Open Collective funding](https://opencollective.com/y-collective/projects/y-prosemirror)
- [Automerge 2.2 Rich Text announcement](https://automerge.org/blog/2024/04/06/richtext/)
- [Automerge 3.0 release notes](https://automerge.org/blog/2025/07/)
- [@automerge/prosemirror](https://github.com/automerge/automerge-prosemirror)
- [Loro #77 — content wipe race (OPEN)](https://github.com/loro-dev/loro/issues/77)
- [Loro landing](https://loro.dev)
- [loro-prosemirror](https://github.com/loro-dev/loro-prosemirror)
- [Yjs issue #291 — boundary anomaly (OPEN since April 2021)](https://github.com/yjs/yjs/issues/291)
- [prosemirror-collab documentation](https://prosemirror.net/docs/ref/#collab)
- [Weidner — prosemirror-crdt prototype](https://github.com/mweidner037/prosemirror-crdt)

## Related Research

- [reports/three-way-merge-content-preservation/REPORT.md](../three-way-merge-content-preservation/REPORT.md) — the impossibility result that motivates single-CRDT collapse
- [reports/peritext-on-yjs-feasibility/REPORT.md](../peritext-on-yjs-feasibility/REPORT.md) — standalone Yjs 14 feasibility (complements C1 here)
- [reports/automerge-prosemirror-migration-assessment/REPORT.md](../automerge-prosemirror-migration-assessment/REPORT.md) — standalone Automerge migration (complements C2 here)
- [reports/loro-ecosystem-readiness-assessment/REPORT.md](../loro-ecosystem-readiness-assessment/REPORT.md) — standalone Loro assessment (complements C3 here)
- [reports/crdt-branching-namespacing-prior-art/REPORT.md](../crdt-branching-namespacing-prior-art/REPORT.md) — fork/merge prior art (relevant to C3's Fugue advantage)
