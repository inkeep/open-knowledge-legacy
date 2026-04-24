# Evidence: Academic / industry design patterns from local-first + CRDT UX literature

**Dimension:** Ink & Switch, Replicache, Peritext, Automerge, and adjacent research — what does the local-first community say about content-loss UX?
**Date:** 2026-04-16
**Sources:** Ink & Switch publications, Replicache docs, published CRDT UX research.

---

## Key pages referenced

- [Ink & Switch — Research Lab](https://www.inkandswitch.com/)
- [Replicache — Reset Strategy](https://doc.replicache.dev/strategies/reset)
- [Replicache — How It Works](https://doc.replicache.dev/concepts/how-it-works)
- [Comparing local-first frameworks](https://neon.com/blog/comparing-local-first-frameworks-and-approaches) — 2024 survey
- [Neon blog — Comparing local-first](https://neon.com/blog/comparing-local-first-frameworks-and-approaches) — Automerge, Yjs, Loro comparison

---

## Findings

### Finding: Local-first philosophy frames "content loss" as an engineering-correctness problem, not a UX problem
**Confidence:** INFERRED
**Evidence:** [Automerge design docs](https://automerge.org/docs/how-it-works/); [Ink & Switch essays](https://www.inkandswitch.com/); broad survey of local-first publications.

The local-first position: CRDTs are designed to prove content preservation at the algorithm level. If content is lost, the CRDT implementation is broken; fix the algorithm. UX-layer notifications are a workaround for broken algorithms.

> (Automerge docs) "Automerge never deletes anything and stores every change made to a document with efficient compression"

**Implications:** From the local-first purist perspective, our D3 decision to surface bridge-merge loss is an admission of algorithmic imperfection. The "correct" long-term answer is D4 (collapse to single CRDT, e.g. Peritext on Yjs 14 or Automerge). But as of 2026-04-16, our dual-CRDT bridge is the architecture we have. The spec correctly identifies D4 as out-of-scope for THIS spec but the target for a subsequent one.

---

### Finding: Replicache's "reset" strategy signals lost state, but UX is application-delegated
**Confidence:** CONFIRMED
**Evidence:** [Replicache — Reset Strategy](https://doc.replicache.dev/strategies/reset); [Replicache — How It Works](https://doc.replicache.dev/concepts/how-it-works)

Replicache's server signals client-view-reset when it loses knowledge of a client. The SDK signals this via a flag in the client view; the application decides what UX to render. Replicache explicitly hands the UX decision back to the developer.

> "When the server loses its state, it signals this to clients. ... The app presumably has a subscription to watch for this bit being set, and the UI shows the room as unavailable and notifies the user that the reservation failed."

**Implications:** Replicache's pattern is structurally close to what we'd do: the server detects a content-risk event, signals it via a side channel, the client renders application-specific UX. Our `Y.Map('activity')` side channel is directly analogous to Replicache's "bit in the client view." **This validates that side-channel-signal-with-client-rendered-UX is an established local-first pattern.**

---

### Finding: Peritext / rich-text CRDT research acknowledges merge-anomaly edge cases but does not prescribe UX
**Confidence:** INFERRED
**Evidence:** [Peritext paper — Ink & Switch 2021](https://www.inkandswitch.com/peritext/); Automerge's text implementation docs.

Peritext's rich-text model is designed to prevent cases where formatted-text operations produce surprising results under concurrent editing. But the paper does not address UX for when the CRDT does produce an unexpected result — it instead argues the CRDT itself should produce intuitive results.

**Implications:** Peritext's philosophy is the D4 target: "design the CRDT so that surprises can't happen." Until we migrate to Peritext-on-Yjs-14, we need a UX-layer stopgap. Post-Peritext, the stopgap can be retired.

---

### Finding: Ink & Switch's Patchwork notebook explicitly explores "diffs and history" as collaborative primitives
**Confidence:** INFERRED
**Evidence:** [Ink & Switch — Patchwork](https://www.inkandswitch.com/patchwork/); the specific notebook page 08 on "History and diffs" returned empty from our fetch, but referenced in other I&S materials.

Patchwork explores version-history-as-UX as a first-class design concern in local-first editors. The framing: "diffs are the UX of CRDTs." Every significant state transition should be inspectable and revertable via history, not pushed as a live notification.

**Implications:** This is a strong argument for the **"silent log + version history is already sufficient"** position. If our version-history UX is well-designed (it is — TimelinePanel + rollback), users can recover from content loss without a push notification. The counter-argument: they have to KNOW content was lost to go looking in history. If the loss is silent and the user doesn't notice, version history is useless.

---

### Finding: The local-first community's open question: "how do we communicate the non-obvious?"
**Confidence:** INFERRED
**Evidence:** Aggregated from Ink & Switch essays, Riffle papers, Automerge community discussions.

The broader local-first research community has an open question about ambient signaling of CRDT-layer anomalies. The question "should we tell users about merge outcomes?" is contested. There's no consensus pattern.

> (summary of Ink & Switch's position) Supporting better versioning tools for collaborative work, with notable alignment between tools needed for concurrent offline editing and version control tools.

**Implications:** We are in genuinely uncharted UX territory. Inventing a "toast with version-history CTA" for bridge-merge loss is defensible but not industry-ratified. It's also cheap to build and cheap to remove if it doesn't pan out — which argues for shipping it as an experiment rather than committing to it as a pattern.

---

## Negative searches

- "Ink & Switch merge conflict toast UX" → No hits.
- "Automerge conflict notification" → Automerge conflicts are exposed as `.conflicts` field on values; UX is application-defined, no pattern prescribed.
- "CRDT bridge merge loss notification" → No hits; terminology specific to our architecture.

---

## Gaps / follow-ups

- Full fetch of Ink & Switch Patchwork notebook (page 08) failed; worth retry with different fetcher or direct HTML scrape.
- Riffle-style CRDT-over-SQLite systems may have divergent UX patterns; not surveyed.
- The Loro ecosystem (reports/loro-ecosystem-readiness-assessment/) has relevant context on single-CRDT alternatives.
