# Evidence: D6 — Operational Transformation (OT) Three-Way Merge Historical Context

**Dimension:** OT's content-preservation properties; why OT was largely superseded by CRDTs.
**Date:** 2026-04-16
**Sources:** Wikipedia OT article, ot.js.org documentation, Raph Levien "Towards a unified theory of OT and CRDT", IJCA OT survey 2010.

---

## Key sources referenced

- [Operational transformation (Wikipedia)](https://en.wikipedia.org/wiki/Operational_transformation)
- [Operational Transformation (ot.js.org)](https://ot.js.org/docs/operational-transformation/)
- [Towards a unified theory of OT and CRDT — Raph Levien](https://medium.com/@raphlinus/towards-a-unified-theory-of-operational-transformation-and-crdt-70485876f72f)
- [A Survey on Operational Transformation Algorithms (IJCA 2010)](https://www.ijcaonline.org/volume3/number12/pxc3871115.pdf)

---

## Findings

### Finding F6.1: OT works on operation streams, not snapshots — content preservation is operational

**Confidence:** CONFIRMED
**Evidence:** Standard OT framing. From the survey paper and ot.js.org:

OT operates on a stream of operations applied at each replica. When concurrent operations arrive, a transform function `T(op_a, op_b)` adjusts each operation to account for the other's effect. Both operations are *applied* — neither is dropped.

For example, if op_a inserts "X" at position 5 and op_b (concurrent) inserts "Y" at position 5, the transform produces:
- At replica that did op_a first: apply T(op_b, op_a) — "Y" is inserted at position 6 (shifted because "X" was already there).
- At replica that did op_b first: apply T(op_a, op_b) — "X" is inserted at position 6.

**Both insertions survive.** Final state at both replicas: "...XY..." or "...YX..." depending on tie-breaking. This is operationally content-preserving by construction (similar to how RGA-CRDTs handle concurrent inserts).

### Finding F6.2: TP1 and TP2 — the formal convergence properties

**Confidence:** CONFIRMED
**Evidence:** Wikipedia OT + IJCA survey 2010:

> TP1 is a transformation property where for two concurrent operations O1 and O2, the transform function (T) satisfy TP1 if O1 ∘ T(O2, O1) ≡ O2 ∘ T(O1, O2)
>
> TP2, for three concurrent operations O1, O2 and O3, requires that the transform function (T) satisfy TP2 if T(O3, O1 ∘ T(O2, O1)) ≡ T(O3, O2 ∘ T(O1, O2))
>
> Satisfying TP1 and TP2 is required to guarantee convergence for any number of sites that apply concurrent operations in different orders.

**Implication for content preservation:** TP1 and TP2 are *convergence* properties — they guarantee replicas reach the same state. They do NOT directly state content preservation, but in practice the transform functions for insert/delete operations are designed to preserve all inserted characters (no insert is ever discarded; only its position is adjusted).

### Finding F6.3: dOPT puzzle — the historical bug class

**Confidence:** CONFIRMED
**Evidence:** Wikipedia OT, dOPT puzzle history.

The original dOPT algorithm (Ellis & Gibbs 1989) failed in some cases — the "dOPT puzzle" — where transforms didn't satisfy TP2 and convergence was lost. Later algorithms (GOTO, SOCT2/3, COT) addressed these.

**Implication:** OT's correctness is fragile — designing transform functions that satisfy TP2 is hard. The IJCA 2010 survey notes that "approximately the last 21 years of academic work having essentially no impact" on production systems, which still rely on the simpler 1995 Jupiter system.

### Finding F6.4: OT requires central server for typical text operations

**Confidence:** CONFIRMED
**Evidence:** Wikipedia OT, ShareJS / Wave architectures.

> Current frameworks designed with built-in mechanisms for consistency management include Apache Wave and ShareJS that work with a centralized server, linear history buffer, and operation transformation for managing the global state.

**Implication:** OT in practice usually requires a central total-ordering server (Jupiter / Wave / ShareJS pattern). For purely peer-to-peer or asynchronous editing (offline + sync), OT is significantly harder than CRDTs. This is the historical reason CRDTs (Yjs, Automerge, Loro) supplanted OT for the offline-first / collaborative-editing use case.

### Finding F6.5: OT and CRDTs are equivalent in expressive power for text

**Confidence:** CONFIRMED
**Evidence:** [Raph Levien — Towards a unified theory of OT and CRDT](https://medium.com/@raphlinus/towards-a-unified-theory-of-operational-transformation-and-crdt-70485876f72f).

For text-only operations (insert / delete characters), OT and CRDTs solve the same problem with the same content-preservation properties. The choice between them is engineering (sync architecture, complexity) not theoretical.

**Implication for our bridge question:** OT does not offer a structural advantage over CRDT for content preservation in plaintext concurrent editing. Both preserve all inserted characters; both have deterministic conflict resolution at the character level.

For the bridge problem specifically, OT would not help: the bridge's two CRDTs would become two OT histories, and the bridge would still need to translate between them — re-introducing the same content-preservation issues at the translation boundary.

### Finding F6.6: OT and three-way merge are different problems

**Confidence:** CONFIRMED
**Evidence:** Standard CSCW literature framing.

OT operates on a *continuous* stream of operations from each replica — it does NOT do three-way merge. There's no "base" snapshot. Each operation arrives in order with awareness of the linear history.

Three-way merge (diff3, git) operates on snapshots: (A, O, B). It's a state-based reconciliation, not an operation-based one.

**Implication:** OT is not a drop-in replacement for diff3+DMP in our bridge. It would require fundamental architectural change (the bridge becomes an op-stream consumer rather than a snapshot reconciler). And as F6.5 shows, OT's content-preservation properties are no better than CRDTs' for this purpose.

---

## Negative searches

- Searched for OT-based three-way merge → NOT FOUND. OT is exclusively operation-stream-based; three-way merge is its complement (state-based).
- Searched for OT applied to dual-CRDT bridge problems → NOT FOUND. The OT literature does not address translation between heterogeneous representations.

---

## Gaps / follow-ups

- The historical Wave system used OT for both rich-text and structured (XML) data, but the type-boundary problem in our bridge (markdown source ↔ rich-text tree) was not part of Wave's design space.
