# Evidence: Candidate 4 — Custom ProseMirror-Native CRDT

**Dimension:** Primary candidate (no existing prior-art report)
**Date:** 2026-04-16
**Sources:** Matthew Weidner prosemirror-crdt prototype, `prosemirror-collab`, `prosemirror-automerge` (saranrapjs experiment), Peritext reference on Micromerge, Ink & Switch CSCW 2022 paper, `reports/three-way-merge-content-preservation`

---

## A. Production Readiness (2026-04-16)

**Three identified prior-art points:**

1. **`prosemirror-collab` (official, Marijn Haverbeke).** Ships with ProseMirror itself. OT-style rebase protocol. Documented as "pseudo-OT" — transforms steps relative to each other but **without convergence guarantee**. Requires central server for total ordering. Production users: many (Automattic/WordPress, Confluence via some internal fork, etc.), but each deployment rolls its own server. **Not a CRDT** — requires authoritative server and has the "intention preservation" weakness OT systems share.

2. **Matthew Weidner's `prosemirror-crdt` (CRDT-inspired adaptation of prosemirror-collab).** GitHub: `mweidner037/prosemirror-crdt`. PROTOTYPE STATUS — author's own description: "It is just a prototype for now, but I wanted to share it." No production users identified. Uses Weidner's `list-positions` library (immutable character IDs) to avoid client resubmission on rebase. Still requires central server for total ordering. No unit tests yet, no reconnection handling, no performance optimization. Personal research project.

3. **Peritext reference on Micromerge (Ink & Switch).** ProseMirror bridge proof-of-concept. Micromerge is purpose-built CRDT. `inkandswitch/peritext` repo. Experimental, not production-grade. Cited in CSCW 2022 paper. Has not been extracted into a reusable library.

**Negative signal on "DIY CRDT":** Kevin Jahns (Yjs author) has repeatedly (on discuss.prosemirror.net, HN) stated that rolling a production-correctness CRDT is a multi-year effort with subtle correctness pitfalls. Raph Levien's "Towards a unified theory of OT and CRDT" argues the two models are fundamentally isomorphic but the engineering complexity differs dramatically.

**Confidence:** CONFIRMED (direct GitHub + discuss.prosemirror.net + Weidner blog trace).

---

## B. Migration Scope — Structural

**Architecture options:**

**(a) Pure OT via `prosemirror-collab` + central authoritative server.**
- Give up CRDTs. Accept central-server requirement. Give up local-first / offline-edit property.
- `prosemirror-collab` transforms are operation-based, not snapshot-based — so it avoids the Khanna-Kunal-Pierce class by using operations with known intent.
- Source-mode view still needs translation — OT applies to PM transactions; markdown source is text. No native dual-view support.
- Requires custom server (hand-written transform function for every step type).

**(b) Weidner's prosemirror-crdt approach.**
- Same as (a) but IDs annotate steps — client doesn't resubmit on rebase, server appends to log.
- Still requires central authoritative server (total ordering).
- Same source-mode problem.
- **Prototype code; we are the first production user.**

**(c) Build Peritext-on-Micromerge-equivalent from scratch.**
- Following Ink & Switch's reference. Entirely original work.
- Peritext paper + reference implementation exist — but library-quality productionization is original work.
- 6-10 engineer-months minimum per Candidate 1's Architecture A estimate.

**File-by-file 1P impact (option b, most plausible):**

Bridge code DELETED: same as Candidates 1-3 (server-observers, observers, merge code, etc.)

Client editor integration:
- `@tiptap/extension-collaboration` REPLACED with custom `@tiptap/extension-collab-crdt` wrapping `prosemirror-collab` + Weidner's rebase protocol.
- TipTap can keep its extension model — this is the LOWEST editor-side migration cost of all candidates.

Source-mode integration (CodeMirror):
- Novel problem. No published CM-side binding for prosemirror-collab.
- Either (i) build CM ↔ PM transaction projection layer (original work, ~2-4 weeks), OR (ii) keep dual-CRDT (which defeats the purpose).

Server persistence (Hocuspocus):
- **Hocuspocus is Yjs-specific.** Custom server required: log append, per-doc step ordering, transform rebase, persistence, lifecycle hooks, auth, presence.
- Or fork `prosemirror-collab`'s reference server as a starting point — but that reference is a minimal toy (~200 lines).
- Estimate: 6-10 weeks for production-grade custom server matching Hocuspocus capability surface.

Fidelity invariants: preserved at markdown pipeline boundary (PM JSON ↔ markdown unchanged).

---

## C. Ecosystem Integration

**Hocuspocus:** INCOMPATIBLE. Must build custom server from scratch.

**Markdown pipeline:** unchanged.

**Source-mode:** novel problem. CodeMirror has its own `@codemirror/collab` for OT — could map to `prosemirror-collab` transforms but requires bespoke mapping layer.

**Undo/redo:** `prosemirror-history` local-only. Collaborative undo requires additional work (prosemirror-collab has `closeHistoryCollab`, but semantics under concurrent edits are weak).

---

## D. Effort Estimate (engineer-weeks)

**This is the highest-variance candidate.** Estimates depend heavily on correctness standard.

| Sub-path | Weeks |
|---|---|
| prosemirror-collab server (OT, no CRDT guarantees) | 8-12 |
| Weidner prototype hardened to production | 12-20 |
| Full Peritext-on-Micromerge (Architecture A-equivalent from Candidate 1 report) | 24-40 (6-10 months) |
| Plus CM dual-view layer | +4-8 |
| Plus testing + edge cases + CRDT-correctness fuzzing | +4-8 |

| Scenario | Weeks |
|---|---|
| Optimistic (OT path, accept central-server) | 16-22 |
| Realistic (Weidner prototype hardened) | 24-32 |
| Conservative (full CRDT from scratch) | 40-60+ |

**Ranges cross the 1-year mark at the conservative end.** Rolling a production CRDT is multi-year per historical evidence (Yjs took Kevin Jahns ~5 years from initial to 1.0; Automerge's current maturity represents a decade of Ink & Switch work).

---

## E. Risk Profile

- **Beta risk (Weidner prototype):** MAXIMUM. Author-documented prototype status. No tests. No reconnection handling. Zero production users.
- **Correctness risk:** CRDT correctness requires formal reasoning — concurrent-edit convergence proofs, intention preservation, bounded history growth, cursor stability. Every production CRDT library (Yjs, Automerge, Loro) fixed fundamental correctness bugs between 0.x and 1.0. **We would be the first production user of whatever we build.**
- **Migration breakage:** bridge test suite + Hocuspocus tests (~70 test files) DELETED/REWRITTEN. Our custom CRDT would need its own fuzz suite (like `bridge-convergence.fuzz.test.ts` became for the current bridge) — weeks of testing infrastructure.
- **Performance:** unknown. Weidner's approach has documented concurrent-same-position anomalies ("appear in reverse receipt order"). list-positions index lookup is O(log N).
- **Reverse migration cost:** HIGHEST. No export format. Every custom wire protocol/state representation is ours to maintain.
- **Greenfield alignment:** builds technical debt proportional to ambition. Maintenance cost ongoing forever.
- **Maintenance risk:** zero external maintainer. All bug fixes internal.

---

## F. Key Advantage

**Total control over semantics.** We own the wire protocol, the state representation, the rebase logic, the intention-preservation rules. No external library constraints our schema or our MDX semantics. Zero external dependency churn risk.

If built on the OT path (option a), we get the intention-preservation benefit that CRDTs structurally cannot provide.

---

## G. Key Disadvantage

**Massive engineering liability.** 16-60+ weeks. Zero off-the-shelf maintenance. No production users to copy from. No community to answer correctness questions. We become our own Kevin Jahns, maintaining correctness proofs for the lifetime of the product.

Violates greenfield precedent #7 ("remove broken capabilities rather than shipping them") transitively: any shipped feature whose correctness we cannot prove is a broken capability in disguise.

---

## Gaps / follow-ups

- Is there a fourth prior-art point I missed? (List-positions ecosystem beyond Weidner; automerge-prosemirror fork candidates; Jazz CoLists.)
- What's the empirical bug density in Yjs / Automerge / Loro 0.x → 1.0 history? (Proxy for "how hard did they find this.")
