---
name: Concurrent mark + structured-attribute CRDT semantics
description: Survey of how production collaborative editors handle concurrent overlapping mark toggles and structured attribute merges. Finding: commercial editors converged on structured-marks + LWW attrs; char-RGA on serialized marks ships only in niche Yjs-on-Y.Text markdown editors (HedgeDoc 2, Obsidian Relay).
type: research
date: 2026-04-17
depth: deep
status: complete
---

# Concurrent Mark & Structured-Attribute CRDT Semantics in Production Collaborative Editors

## Reader guide

This report answers: **when two users concurrently edit overlapping text spans (toggling bold/italic/link on the same range) or concurrently edit the same structured attribute, what CRDT/OT semantics do production editors ship? Is character-level resolution ever accepted in production?**

3P-factual research. Does not contain 1P recommendations.

- **Central question first:** Executive Summary + §D9 Peritext + §D11 HedgeDoc are the minimum load-bearing set.
- **Ecosystem-wide patterns:** Convergence table + §D1-D5 (commercial closed editors).
- **Source-level OSS evidence:** §D6 y-prosemirror + §D7 y-quill + §D11 HedgeDoc have the deepest code traces.
- **Academic grounding:** §D9 Peritext + §D12 Academic literature. Peritext's "Example 3" in §D9 is the canonical artifact demonstrating the char-RGA failure mode.
- **Structured-attribute findings (not marks):** §D1 Notion + §D2 Linear + §D4 Figma.

12 evidence files at `evidence/d1-notion.md` through `d12-academic.md`.

---

## Executive summary

The production collaborative-editor ecosystem has **nearly unanimously converged on structured marks + LWW attributes**, NOT character-level merging of serialized marks.

**Is char-RGA on serialized source marks ever shipped in production?** Yes — but only in small-scale OSS markdown editors, specifically **HedgeDoc 2** and **Obsidian's Relay/Peerdraft plugins**. In those systems `**bold**` literally lives as `*` characters in a shared Y.Text, subject to RGA-style interleaving artifacts. In every commercial-scale production editor surveyed (Notion, Linear, Google Docs, Figma, Confluence, TipTap-based editors, Quill-based editors), marks are structured annotations on spans or text nodes, and structured attributes resolve via last-writer-wins registers — NOT sequence-char merging.

The academic literature (Peritext 2022, Fugue 2023, Eg-walker 2024, Kleppmann-Gomes interleaving-anomalies catalogues) is unequivocal: char-RGA on serialized rich-text source is a known-incorrect approach for concurrent overlapping mark operations. The canonical artifact is **Peritext's "Example 3"**:

> Alice bolds "The fox" → `**The fox** jumped.`
> Bob concurrently bolds "fox jumped" → `The **fox jumped.**`
> Naive character merge produces `**The **fox** jumped.**` which renders as "**The** fox **jumped**" with "fox" **non-bold** despite both users intending it bold.

Yjs's `ContentFormat` marker items (zero-length inline control-character pairs) are explicitly argued by Peritext to suffer the same class of failure.

### Top findings

1. **Char-RGA on serialized marks IS shipped** — HedgeDoc 2 and Obsidian Relay, both using Yjs + CodeMirror 6 with Y.Text holding raw markdown source. Peritext Example 3 artifact is structurally unavoidable; no widely-reported user complaints, compatible with small userbases, rare concurrent-same-span-mark workflows, self-healing-via-re-selection, and artifacts attributed to "sync glitch."
2. **Commercial-scale editors ship structured marks or whole-value LWW.** Google Docs uses OT with range-typed `ApplyStyle` ops. Figma uses per-property LWW and explicitly disclaims concurrent text merge. Linear uses OT + LWW for structured fields, CRDT (Y.XmlFragment via y-prosemirror shape) for descriptions only. Notion merges text via CRDT but falls back to LWW for non-text properties.
3. **y-prosemirror binds to Y.XmlFragment, NOT Y.Text.** Marks are ProseMirror mark objects on text nodes; bold is a structural attribute, not a character. Known defects: y-prosemirror #34 drops one of two same-type-different-attr concurrent marks; Yjs #291 produces inconsistent boundary results under delayed delivery.
4. **Quill/y-quill uses structured `attributes: {bold:true}` maps.** Merging shallow on the attribute map; underlying CRDT is Y.Text with ContentFormat markers. y-quill includes an "expected vs actual delta" reconciliation repair loop — tacit acknowledgment that Y.Text's concurrent-format resolution sometimes drifts from local expectations.
5. **Academic consensus:** Peritext + Fugue + Eg-walker + Kleppmann-Gomes jointly formalize that (i) sequence CRDTs can interleave characters at concurrent inserts even without marks, and (ii) mark semantics MUST be expressed via per-mark `expand` flags at character anchors — not inline source characters or control markers.
6. **Structured attributes — LWW is unanimous.** No surveyed editor does character-level merging of attribute VALUES. Figma LWW register, Notion non-text LWW, Linear structured-field LWW, Google Docs typed-field OT ops, Confluence Synchrony. No evidence of char-level merging of MDX-style `<Component prop="value" />` prop values anywhere.
7. **No "semantic mark emitter" as a named pattern** — but the entire ProseMirror ecosystem implicitly implements one: `addMark`/`removeMark` commands produce typed ops that are NOT decomposed into character insert/delete pairs by the binding. Yjs ContentFormat markers are the CRDT-layer expression of atomic-whole-mark emission.

---

## Convergence table

| Editor | Mark representation | Concurrent mark merge | Structured attr merge | Shared-source char-CRDT? |
|---|---|---|---|---|
| Google Docs | Range-typed `ApplyStyle` OT op | Orthogonal styles compose; bounds transform | OT on typed field ops | No — structural OT |
| Notion | Annotation objects on rich_text spans | CRDT on text body (opaque internal) | LWW for non-text | No |
| Linear | ProseMirror-tree JSON (description) | Yjs-shaped CRDT (presumed Y.XmlFragment) | LWW via OT | No |
| Figma | Text is a single atomic property | **NONE (LWW whole-value)** | LWW register | No |
| Confluence | Atlaskit/ProseMirror ADF marks | Synchrony merge graph (undisclosed) | Synchrony graph | No |
| TipTap + y-prosemirror | ProseMirror marks in Y.XmlFragment | Yjs ContentFormat markers | Map-LWW or mark attrs | No — tree CRDT |
| Quill + y-quill | Delta `attributes:{}` on typed insert/retain | Y.Text ContentFormat + repair loop | Shallow-merge attr map | No — typed ops |
| Automerge + automerge-prosemirror | Peritext-compatible spans | Peritext expand-flag boundaries | Map entries | No |
| Loro | Peritext + Fugue | Peritext boundary semantics | Map entries | No |
| Diamond-types / Ethersync | N/A — plain text only | N/A | N/A | Plain-text only; no marks |
| **Obsidian Relay** | **Literal `**` in Y.Text** | **Yjs YATA on characters** | N/A | **YES — markdown in Y.Text** |
| **HedgeDoc 2 / CodiMD** | **Literal `**` in Y.Text** | **Yjs YATA on characters** | N/A | **YES — markdown in Y.Text** |

Two clear camps — **structured-marks (10 of 12)** vs **char-source (2 of 12, both niche OSS markdown)**.

Notable absence: **zero** surveyed editors ship character-level merging of structured-attribute values.

---

## Detailed per-dimension findings

### D1 — Notion: structured annotations + LWW on non-text

Notion blocks are JSON with `properties` maps. Rich text in `title` is an array of `[text, annotations]` tuples — annotations are structural. Text body merges via internal CRDT; non-text (select fields, dates, relations) uses LWW. See `evidence/d1-notion.md`.

### D2 — Linear: OT + LWW for structured fields; CRDT only for descriptions

Per Artman (Linear CTO): "Linear didn't use CRDTs until recently, and even now, it only uses them for issue descriptions." Non-text fields resolve LWW via centralized OT. Comment bodies are ProseMirror JSON, strongly suggesting Y.XmlFragment + y-prosemirror backing. See `evidence/d2-linear.md`.

### D3 — Google Docs: OT with typed range operations

All edits reduce to insert/delete/apply-style typed ops. `{ApplyStyle italic @10-20}` transformed against `{ApplyStyle font-color=red @0-30}` — no conflict, both apply. Marks are NEVER inline source chars. OT invented at MCC Austin (Ellis & Gibbs 1989), NOT Xerox PARC. See `evidence/d3-google-docs.md`.

### D4 — Figma: per-property LWW; text is atomic

Figma blog (Evan Wallace, verbatim): "simultaneous editing of the same text value doesn't work in Figma. If the text value is B and someone changes it to AB at the same time as someone else changes it to BC, the end result will be either AB or BC but never ABC. That's ok with us because Figma is a design tool, not a text editor."

Data model: `Map<ObjectID, Map<Property, Value>>`; fractional indexing for ordered sequences. See `evidence/d4-figma.md`.

### D5 — Confluence: Synchrony service, Atlaskit/ADF tree

Synchrony microservice "maintains a graph of all the changes." ProseMirror-based editor (Atlaskit) with ADF tree storage. Central-server coordination signaled by 12-user concurrent-edit cap. Exact CRDT vs OT algorithm not public. See `evidence/d5-confluence.md`.

### D6 — y-prosemirror: canonical OSS stack, Y.XmlFragment tree, ContentFormat markers

y-prosemirror binds ProseMirror to Y.XmlFragment (NOT Y.Text). Marks are ProseMirror objects on text nodes; CRDT-level formatting uses zero-length ContentFormat marker items. Peritext explicitly argues inline-control-character approaches suffer the same failure mode as literal markdown chars.

Known defects: y-prosemirror #34 (same-type-different-attr marks dropped silently), Yjs #291 (delayed-delivery boundary inconsistency). The Peritext "rest of document becomes bold" pathology is theoretical but not widely user-reported. See `evidence/d6-y-prosemirror.md`.

### D7 — Quill + y-quill: structured attributes, shallow merge, repair loop

Quill Delta represents formatting as `attributes:{bold:true}` on typed ops. y-quill translates to Y.Text `applyDelta`. Delta's OT algebra (compose/transform/invert) is for local history only; peer merge rides Y.Text's marker-item algorithm.

y-quill has an **expected-vs-actual delta repair loop** — tacit acknowledgment that Y.Text's concurrent-format resolution drifts from local expectations. See `evidence/d7-y-quill.md`.

### D8 — Diamond-types / Ethersync: plain text only

Diamond-types: "only supports plain text editing." Seph Gentle stated Peritext interest but hasn't shipped. Ethersync uses diamond-types for code/filesystem sync. Eg-walker (Gentle & Kleppmann 2024) is plain-text with Peritext integration in progress via Loro. See `evidence/d8-diamond-types-ethersync.md`.

### D9 — Peritext: the canonical statement that char-RGA-on-markdown is broken

**Example 3** (the load-bearing artifact):

- Alice bolds "The fox" → `**The fox** jumped.`
- Bob concurrently bolds "fox jumped" → `The **fox jumped.**`
- Naive char merge: `**The **fox** jumped.**`
- Renders as "**The** fox **jumped**" — "fox" is **NON-BOLD** despite both users intending bold.

Paper argues Yjs's ContentFormat marker approach suffers the same class of problem — nested `</bold>` closes outer bold prematurely.

Peritext's solution: per-mark `expand` flags (before/after/both/none) at character anchors, with mark-operation SETS accumulated per-position. Bold has `expand: "after"` (text inserted at end inherits bold); links have `expand: "before"` at end (text after link doesn't inherit). For mutually-exclusive marks, LWW via opId.

Reference implementation is Micromerge (Automerge-derived), NOT Yjs. Loro's `crdt-richtext` and automerge-peritext ship Peritext-compatible semantics. **Yjs does NOT, and no public Yjs roadmap adds boundary semantics.** See `evidence/d9-peritext.md`.

### D10 — Obsidian: Relay plugin uses Yjs + y-codemirror.next on Y.Text of raw markdown

No official Obsidian realtime collab; Sync is file-level LWW. Relay plugin binds Y.Text (containing raw markdown source) to CodeMirror 6. Server is y-sweet fork. **This IS a production instance of char-level CRDT operating on serialized markdown source.**

No widely-reported user complaints of garbled-markdown from concurrent bold toggles in forums — compatible with small userbase and rare concurrent-overlapping-mark workflows. See `evidence/d10-obsidian.md`.

### D11 — HedgeDoc 2 / CodiMD: THE canonical production example of char-CRDT on serialized markdown

Full rewrite adopted Yjs. Verified: both `backend/package.json` and `frontend/package.json` list `yjs: 13.6.29`. Editor is CodeMirror 6. Shared CRDT is Y.Text containing raw markdown source — `**bold**` is literal `*` characters in Y.Text. **Peritext Example 3 artifact is structurally unavoidable.**

HedgeDoc 1 (CodiMD) used a custom EtherPad-inspired OT protocol — different algorithm, same surface (serialized markdown).

Community forum and issue tracker have no top-level widely-reported concurrent-formatting garbled-markdown bug — but HedgeDoc's userbase is small and concurrent-overlapping-bold workflows are rare. Either (a) artifact is rare in practice, (b) users tolerate brief garbled states, or (c) self-heal via re-selection masks artifacts. See `evidence/d11-hedgedoc-codimd.md`.

### D12 — Academic literature

- **Peritext (2022):** mark semantics via anchor-based operation sets with per-mark expand flags.
- **Fugue (2023):** sequence CRDTs can interleave characters even without marks; "maximal non-interleaving" as formal correctness property; FugueMax satisfies it.
- **Eg-walker (2024):** DAG-based algorithm, plain-text-only, Peritext integration in progress via Loro.
- **Kleppmann & Gomes:** systematic catalogue of interleaving anomalies in published text CRDTs.

No paper 2022–2025 proposes or defends char-RGA-on-serialized-marks as valid. Academic position is consensus. Loro's `crdt-richtext` is a production-usable Rust implementation. See `evidence/d12-academic.md`.

---

## Direct answers to the central research questions

**Q1: Is char-RGA mark composition shipped anywhere in production?**

**YES** in HedgeDoc 2 and Obsidian Relay/Peerdraft. **NO** in every surveyed commercial editor.

**Q2: Visual artifacts and persistence?**

Peritext Example 3 artifact is **persistent** in the merged CRDT — not transient, not self-healing without user intervention. Likely self-heal path: user re-selects + re-bolds, producing additional `**` markers that may or may not produce the intended render. Markdown's asterisk-count-parity semantics make recovery unpredictable.

**Q3: Has boundary-expansion been user-visible in y-prosemirror-based editors?**

Not widely. Two formal defect reports (y-prosemirror #34, Yjs #291). Peritext "rest of document becomes bold" pathology is theoretical — can be constructed but doesn't appear in normal workflow bug reports. Tree-CRDT + ContentFormat-marker architecture damps the failure enough that users don't notice often.

**Q4: Structured attrs — char-level merging anywhere?**

**Attr-LWW, unanimously.** Zero surveyed editors merge structured-attribute values character-by-character. All use whole-value LWW, typed OT ops on the field as a unit, or undisclosed-but-clearly-not-char-level.

**Q5: "Semantic mark emitter" pattern?**

Not named as a pattern, but the entire ProseMirror ecosystem implicitly implements one — `addMark`/`removeMark` produces typed ops that are NOT decomposed into character insert/delete pairs. Atomic whole-mark emission at the typed-op boundary is the dominant design across structured-marks editors.

---

## Limitations & open questions

**Not fully covered:**
- Atlassian Synchrony internals — trade secret.
- Linear description editor specifics — not publicly described.
- Empirical artifact rates — no published measurements from HedgeDoc or Relay deployments.
- HedgeDoc 1 (CodiMD) legacy OT-protocol — not deeply traced.

**Out of scope (per rubric):**
- Any recommendation for a specific product's architecture.
- Benchmarking / latency / performance characterization.
- Schema design for a specific product.

**Questions the literature/ecosystem does not answer:**
- Practical tolerance for Peritext anomalies (no user research published).
- Self-healing dynamics (no published analysis).
- Scale thresholds (no public data on artifact rate vs concurrency).

---

## Confidence calibration

- **CONFIRMED** (primary-source verified): D1, D3, D4, D6 (partial), D7, D9, D11, D12
- **CONFIRMED via exhaustive search:** D5 "no official CRDT algorithm public"
- **INFERRED** (shape-based reasoning, not confirmed): D2 Linear description = Y.XmlFragment
- **NOT ACCESSIBLE:** D5 Synchrony algorithm (Atlassian trade secret), empirical artifact rates in shipping Yjs-on-Y.Text markdown editors

---

## References

### Primary academic
- [Peritext: A CRDT for Rich-Text Collaboration](https://www.inkandswitch.com/peritext/) — Ink & Switch (Litt, Lim, Kleppmann, van Hardenberg 2022)
- [Peritext CSCW paper PDF](https://www.inkandswitch.com/peritext/static/cscw-publication.pdf)
- [The Art of the Fugue](https://arxiv.org/abs/2305.00583) — Weidner & Kleppmann 2023
- [Collaborative Text Editing with Eg-walker](https://arxiv.org/abs/2409.14252) — Gentle & Kleppmann 2024

### Primary industrial
- [How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) — Evan Wallace
- [The data model behind Notion's flexibility](https://www.notion.com/blog/data-model-behind-notion) — Notion
- [Scaling the Linear Sync Engine](https://linear.app/now/scaling-the-linear-sync-engine) — Tuomas Artman
- [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — 3P reverse engineering, endorsed by Linear CTO
- [What's different about the new Google Docs](https://idl.uw.edu/future-scholarly-communication/files/2010-GoogleDocs-OT.pdf) — 2010 OT paper
- [Atlassian Confluence collaborative editing](https://developer.atlassian.com/cloud/confluence/collaborative-editing/)

### OSS source / issues
- [y-prosemirror](https://github.com/yjs/y-prosemirror) · [issue #34](https://github.com/yjs/y-prosemirror/issues/34)
- [Yjs issue #291](https://github.com/yjs/yjs/issues/291)
- [y-quill](https://github.com/yjs/y-quill) · [Quill Delta design guide](https://quilljs.com/docs/guides/designing-the-delta-format)
- [HedgeDoc](https://github.com/hedgedoc/hedgedoc) · [HedgeDoc 2 frontend architecture](https://deepwiki.com/hedgedoc/hedgedoc/2.2-frontend-architecture)
- [Relay for Obsidian](https://github.com/No-Instructions/Relay)
- [Peritext reference implementation](https://github.com/inkandswitch/peritext)
- [Loro crdt-richtext](https://github.com/loro-dev/crdt-richtext)
