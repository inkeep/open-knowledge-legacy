# Evidence: Peritext Ecosystem State (2026-04-16 Update)

**Dimension:** Pull-in assessment — Q2 (Peritext-on-Yjs state of ecosystem)
**Date:** 2026-04-16
**Sources:** Ink & Switch Peritext project page, GitHub `inkandswitch/peritext` issues, npm search for peritext-related packages, Yjs main-branch commit log, `y-prosemirror/PROJECT_GOALS.md` (via fetch)

---

## Key fact: Yjs 14 is NOT itself Peritext-compliant

Reading from the `@y/prosemirror` (v2 rewrite) PROJECT_GOALS.md, fetched 2026-04-16:

> "One of the core features in the next version of `@y/y` is the concept of a 'content renderer'"

The Yjs 14 "content renderer" capability is the key new API that enables showing diffs / suggestions / other derived views of the same underlying CRDT without mutating it. This is orthogonal to Peritext.

Crucially, the goals document **does not discuss Peritext or ExpandMark semantics in any form**. A direct web-fetch summary:

> "The document does not mention: Yjs 14 [as a stability claim], Peritext, Dual-view capabilities."

Yjs's core CRDT representation for formatting is still `ContentFormat` marker items (from `@y/y` source, inherited from `yjs` v13) — zero-length markers in the sequence. Yjs 14 refactored the type layer (unified YType with delta protocol) but did NOT change the storage model for formatting. The "anomalous boundary behavior" the Peritext paper identifies as a Y.Text limitation is **preserved** in Yjs 14.

Yjs issues search for `peritext|ExpandMark|boundary` returned **zero open issues** on this topic.

## No production Peritext-on-Yjs binding exists

Searched npm + GitHub (via search endpoint) for: `peritext` as package, `peritext-yjs`, packages depending on `peritext` + `yjs` / `@y/y`. Result: Zero production libraries binding Peritext semantics to Yjs / Y.Text.

The only Peritext reference implementations are:
- **inkandswitch/peritext** — Micromerge-based (their custom CRDT, not Yjs). [Last commit Apr 2024 per repo scan]. Research prototype.
- **Automerge 2.2+** — Peritext adopted with `ExpandMark` enum.
- **Loro (loro-dev/crdt-richtext)** — Peritext + Fugue, Rust core, JS bindings.

Ink & Switch Peritext project page (inkandswitch.com/project/peritext): The stated "future work to extend to block elements" was published with the November 2022 paper. **There has been no public follow-up essay or implementation update from Ink & Switch extending Peritext to blocks as of 2026-04-16.** Their newer research has shifted to other directions (Patchwork, essays on different CRDT work).

## No Peritext-on-Yjs community project

Checked:
- `discuss.yjs.dev` search: No thread proposing a Peritext-on-Yjs implementation.
- GitHub search for `peritext yjs` as a repo: matches only research discussions + the existing `reports/peritext-on-yjs-feasibility` report on Open Knowledge's own repo.
- No Open Collective / Github Sponsors project proposing to build one.

This is the same "zero production binding" state the original 2026-04-07 report established. Nothing has changed in 9 days.

## Implication: "Yjs 14 = Peritext" is a category error

The prior report's executive summary wording ("Yjs 14's unified YType is the game-changer") is about the **type system** (single YType class, type-agnostic sync infrastructure). It is NOT about the formatting semantics being Peritext-compliant. A pull-in for Option B would still require:

1. Implementing Peritext ExpandMark boundary semantics ON TOP of `@y/y`'s sequence CRDT — either in userland (interpreting marks at the binding layer, applying ExpandMark logic when composing/querying) or as a patch to `@y/y` itself.
2. OR accepting Yjs's weaker "marker items at RGA positions" semantics and living with the known boundary anomaly in concurrent overlapping-format scenarios.

Option #2 is what the prior report's **Architecture C** does. It ships "dual-view behavior" (not Peritext semantics) via a shared delta. The confusion is that the research lives in a report titled "Peritext-on-Yjs Feasibility" — which a challenger may (reasonably) interpret as "Peritext the semantic model is coming on Yjs." It isn't. The Architecture C path is a **markdown-text serialization toggle**, closer to the "source-toggle-architecture Option I" the report cross-references, than to Peritext.

## Findings

- **CONFIRMED:** Yjs 14's "unified YType" is a type-system refactor, not a semantic change to how formatting marks are stored — it does NOT make Yjs Peritext-compliant.
- **CONFIRMED:** No Peritext-on-Yjs library exists. No one is building one.
- **CONFIRMED:** Ink & Switch has not published follow-up Peritext research extending to blocks since November 2022.
- **INFERRED:** "Pulling Peritext into this spec's scope" via Yjs 14 would actually mean "pulling the Architecture C dual-view delta-protocol approach into scope" — the Peritext name is doing heavy lifting that the technical substance doesn't support.
