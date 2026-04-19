# Evidence: D5 — Peritext / Automerge Single-CRDT Approach

**Dimension:** Peritext CRDT and Automerge as architectural alternatives where the type-boundary bridge doesn't exist.
**Date:** 2026-04-16
**Sources:** Peritext paper (CSCW 2022), Automerge 2.2 rich text docs, Ink & Switch website. Existing report `peritext-on-yjs-feasibility/REPORT.md`.

---

## Key sources referenced

- [Peritext: A CRDT for Collaborative Rich Text Editing (CSCW 2022)](https://dspace.mit.edu/bitstream/handle/1721.1/147641/3555644.pdf?sequence=1&isAllowed=y) — Litt, Lim, Kleppmann, van Hardenberg
- [Peritext Ink & Switch landing page](https://www.inkandswitch.com/peritext/)
- [Automerge 2.2: Rich Text (April 2024)](https://automerge.org/blog/2024/04/06/richtext/)
- Existing report: `reports/peritext-on-yjs-feasibility/REPORT.md`
- Existing report: `reports/automerge-prosemirror-migration-assessment/REPORT.md`

---

## Findings

### Finding F5.1: Peritext stores formatting OUTSIDE the character sequence

**Confidence:** CONFIRMED
**Evidence:** [Peritext landing page](https://www.inkandswitch.com/peritext/), key idea statement:

> The key idea is to store formatting spans alongside the plaintext character sequence, linked to a stable identifier for the first and last character of each span, and then to derive the final formatted text from these spans in a deterministic way that ensures concurrent operations commute.

**Implication:** In Peritext, the underlying text is a flat sequence (RGA-like). Formatting (bold, italic, headings, etc.) is represented as a SET of spans pointing to character IDs. There is no tree structure that competes with the flat character sequence — both views (rich-text rendering and plain-text source) are derived from the same character sequence + spans data.

**Why this matters for content preservation:** the bridge problem in Open Knowledge — "translating between Y.XmlFragment tree and Y.Text flat string" — does not exist in Peritext. There is one source of truth (chars + spans) and two read-only projections (rich-text view via spans application, plain-text view via spans omission).

### Finding F5.2: Peritext provably preserves character content under concurrent insert

**Confidence:** CONFIRMED
**Evidence:** [Ink & Switch Peritext page](https://www.inkandswitch.com/peritext/) on concurrent insert ordering:

> If two users concurrently insert at the same position (i.e. with the same `afterId`), we order the insertions by their `opId`.

And on content loss:

> Peritext does not lose user-generated content. Both concurrent insertions survive, formatting operations accumulate (even conflicting ones use deterministic last-write-wins resolution), and deletions are tracked via tombstones rather than discarded.

**Implication:** Peritext's RGA-like character algorithm guarantees that two concurrent inserts at the same position both survive. They interleave in a deterministic total order (by `opId`). **No character is ever lost** — this is structural CRDT content preservation, exactly the property that state-based merge (D3) cannot guarantee.

The convergence proof in the Peritext CSCW 2022 paper formalizes this: any two replicas that have observed the same set of operations converge to byte-identical state.

### Finding F5.3: Peritext acknowledges intent preservation is BOUNDED, not universal

**Confidence:** CONFIRMED
**Evidence:** [Peritext page](https://www.inkandswitch.com/peritext/):

> "it is impossible for an algorithm to always merge edits perfectly."

The paper handles 9 documented scenarios (Examples 1-9 in the paper) and validates against a property-based test corpus. Beyond those, the authors explicitly disclaim universal "perfect intent preservation."

**Implication:** Even Peritext, the strongest current rich-text CRDT, does not promise that every concurrent edit produces a result the *user would have wanted*. It promises:
1. **Convergence** — all replicas reach the same state.
2. **No content loss** — every character ever inserted is preserved (subject to explicit deletion).
3. **Documented intent preservation for 9 specific scenarios.**

For *formatting* conflicts (e.g., user A bolds a span while user B unbolds the overlapping span), Peritext picks a deterministic winner — content (chars) is never lost; format (the bold attribute) might be one or the other.

**For the bridge question:** if we adopted Peritext as our single-CRDT architecture, character content preservation would be a **structural property** — we couldn't lose user content even by trying. Format conflicts would be a separate, smaller problem. This is a strict improvement over plaintext three-way merge.

### Finding F5.4: Automerge 2.2 implements Peritext for its Text type

**Confidence:** CONFIRMED
**Evidence:** Automerge documentation and existing report `automerge-prosemirror-migration-assessment/REPORT.md` finding:

> Automerge's Text is an implementation of the Peritext CRDT, which was a significant development in collaborative editing. A formatting span has a beginning and an end within the text sequence and a flag detailing whether the span should expand when characters are inserted at the boundaries of the span.

And:

> The underlying data structure is an RGA sequence, which means that concurrent insertions and deletions can be merged in a manner which attempts to preserve user intent. When processing character positions, the existing RGA algorithm is used to determine the insertion position for the new character by counting the number of non-deleted characters that precede the insertion position.

**Implication:** Automerge ships the Peritext model as a production library. The dual-view problem (Y.XmlFragment + Y.Text in Yjs) doesn't arise because Automerge has ONE rich-text type that satisfies both rendering needs (with `automerge-prosemirror` as the binding adapter).

### Finding F5.5: But: dual-view markdown source ≠ rich-text formatting

**Confidence:** CONFIRMED
**Evidence:** Existing report `automerge-prosemirror-migration-assessment/REPORT.md` Executive Summary:

> Automerge's flat text sequence contains block marker objects (not markdown text), so CodeMirror cannot display it directly as markdown source. A translation layer between Automerge spans and markdown is still required.

**This is critical.** Even if we adopted Peritext / Automerge, the bridge problem reappears in a different form: the user wants to see *markdown source* in the source editor, not Peritext's internal representation of spans + chars. The translation `peritext_doc → markdown_string` and back is still needed.

**The reduction:** Peritext eliminates the two-CRDT architecture (one source of truth instead of two). It does NOT eliminate the markdown ↔ rich-text translation problem. But it converts a *bidirectional CRDT bridge* into a *unidirectional read-only render*. The render can be lossy without affecting CRDT state, because the CRDT state is the canonical source.

If users edit the source view and that edit needs to flow back into the CRDT, you're back to a translation layer that can lose content. **Unless the source view ALSO speaks Peritext directly** — e.g., a markdown-aware editor that emits Peritext char+span ops directly rather than parsing the markdown string at boundary time.

### Finding F5.6: Loro and Y-CRDT 2 also expose Peritext-style models

**Confidence:** CONFIRMED
**Evidence:** [Loro rich text blog](https://loro.dev/blog/loro-richtext) (cited as Loro intro to its rich-text CRDT model). Existing reports `loro-ecosystem-readiness-assessment/REPORT.md` for Loro maturity. Existing report `peritext-on-yjs-feasibility/REPORT.md` for the Yjs 14 unification status.

The CRDT ecosystem has converged on Peritext as the de-facto rich-text CRDT model. Implementations:
- **Automerge 2.2+** — production, RGA + Peritext spans
- **Loro** — production, similar semantics
- **Yjs 14 (beta)** — unified YType, makes Peritext semantics implementable

**Implication:** the architectural direction the field has taken is single-CRDT-with-spans, not two-CRDT-with-bridge. Open Knowledge's two-CRDT design is a deliberate trade-off to leverage Yjs 13 + TipTap + CodeMirror today, accepting the bridge complexity. The long-term architectural direction in the ecosystem is single-CRDT.

### Finding F5.7: The "collapse to one CRDT" question — current Open Knowledge cost

**Confidence:** INFERRED
**Evidence:** Existing reports `peritext-on-yjs-feasibility/REPORT.md` (recommends 2-4 weeks for Architecture C dual-view on Yjs 14), `automerge-prosemirror-migration-assessment/REPORT.md` (recommends NOT migrating to Automerge: 12-20 week cost vs marginal Yjs 14 path).

Per the existing reports, the collapse-to-one-CRDT decision has two paths:
1. **Yjs 14 + Architecture C (delta-protocol dual view)** — 2-4 weeks engineering, keeps TipTap + Hocuspocus, eliminates the type-boundary bridge.
2. **Migrate to Automerge** — 12-20 weeks, replaces the entire stack.

**For the immediate three-way-merge problem:** Path 1 (Yjs 14) is the architecturally correct long-term answer. The plaintext three-way merge problem disappears because Y.XmlFragment vs Y.Text is no longer a thing.

**For 1P decision framing (out of this 3P report's scope):** the choice is between:
- (a) Continue investing in the diff3+DMP hybrid, knowing it has fundamental content-preservation limitations (D3 + D8 evidence).
- (b) Invest 2-4 weeks in Yjs 14 / Architecture C migration to eliminate the bridge entirely.

This 3P report does not recommend a path — but it documents that (b) is the only way to eliminate the content-loss class structurally.

### Finding F5.8: Peritext does not solve the three-way merge problem if you keep two CRDTs

**Confidence:** INFERRED
**Evidence:** F5.5 + general framing.

A subtle point: Peritext's content-preservation guarantee is for *its own model* — concurrent inserts in the SAME Peritext doc. If we kept two Peritext docs (one for "rich text" representation, one for "markdown source") and tried to bridge them, **the same three-way merge problem would recur** in the bridge. Peritext doesn't fix the bridge — it eliminates the *need* for the bridge by being a single CRDT that satisfies both views.

**The real lesson:** content preservation under concurrent edits is a CRDT property, not a "merge algorithm" property. Any architecture with **two distinct CRDTs whose states must agree** has a bridge that can lose content. The escape is: (a) one CRDT, two projections; or (b) accept the loss and ship best-effort merge.

---

## Negative searches

- Searched for Peritext-yjs implementations → NOT FOUND. Yjs 13 cannot host Peritext (mark boundary semantics differ); Yjs 14 makes it possible but no production library exists.
- Searched for hybrid two-CRDT-with-Peritext architectures → NOT FOUND. The architectural pattern is single-CRDT or migrate to two with manual bridging.
- Searched for academic comparisons of Peritext vs RGA-only vs OT for content preservation → NOT EXHAUSTIVELY AUDITED; the 9 Peritext examples + property-based tests are the canonical evaluation suite.

---

## Gaps / follow-ups

- Whether Yjs 14's unified YType is production-ready as of 2026-04-16 — see existing `peritext-on-yjs-feasibility/REPORT.md` (Yjs 14.0.0-16 beta, ecosystem readiness caveats).
- Whether any markdown-source editor exists that operates directly on Peritext char+span ops (rather than re-parsing markdown strings) — would eliminate the translation layer that re-introduces three-way merge concerns.
