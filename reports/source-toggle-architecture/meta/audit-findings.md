# Audit Findings: Source Toggle Architecture Report

**Auditor:** Cold-read audit by independent reviewer
**Date:** 2026-04-07
**Artifact:** `/Users/edwingomezcuellar/reports/source-toggle-architecture/REPORT.md`

---

## Finding 1

- **Severity:** MEDIUM
- **Category:** FACTUAL
- **Finding:** The report states Automerge 2.2 rich text was released at `https://automerge.org/blog/2024/04/06/richtext/` and describes it as having "productionized" the Peritext model. Automerge did introduce rich text support based on the Peritext model, but the characterization of it as fully "productionized" may overstate its maturity. As of early 2025, Automerge's ProseMirror binding (`automerge-prosemirror`) was still marked experimental, and production deployments of Automerge rich text were rare. The report uses this as strong evidence for an industry convergence narrative, which is directionally correct but the timeline and production-readiness claims should be hedged.
- **Recommendation:** Add a confidence qualifier to the Automerge "productionized" claim. Something like "Automerge shipped rich text support implementing the Peritext model, though production adoption remains early-stage." This does not change the conclusion (the directional trend is real) but prevents the report from being challenged on this specific characterization.

---

## Finding 2

- **Severity:** HIGH
- **Category:** MISSING
- **Finding:** The report does not evaluate a "read-only source view" option as a distinct architecture. This would be: toggle to source mode shows a non-editable markdown rendering of the current document (a code-highlighted, syntax-correct markdown preview). Zero round-trip risk because the user cannot modify the markdown. The user can copy text, inspect formatting, or verify markdown output — which covers a significant portion of the "why do users want source view" use cases (debugging formatting, copying raw markdown for pasting elsewhere, verifying what the agent produced). This option has strictly zero correctness risk, ~100 lines of implementation, and could ship as a P0 while any of the editable options (A/B/I) are validated in a spike. The report implicitly assumes source view must be editable, but never states or justifies this assumption.
- **Recommendation:** Add Option J (read-only source view) to the inventory, even if only to explicitly acknowledge and dismiss it. If the product requirement truly demands editable source, state that constraint explicitly. If it does not, this option dominates all others on risk and implementation speed for P0.

---

## Finding 3

- **Severity:** MEDIUM
- **Category:** COHERENCE
- **Finding:** The report claims Option I adds "~50 lines of awareness protocol code" over Option A in the Executive Summary, but the comparison matrix lists Option I at "~250 lines" vs Option A at "~200 lines." The delta is 50 lines, which is consistent — but the framing in the Executive Summary ("extends A with ~50 lines") undersells the total complexity. More importantly, the awareness-based locking requires UX design decisions not accounted for in the line count: What happens when User B wants to enter source mode while User A is already in it? Is it a hard block or a warning? What if User A closes their browser without toggling back — is there a timeout? The ~50-line framing treats this as trivial, but the awareness lock introduces a distributed systems coordination problem (stale awareness state) that the report does not address.
- **Recommendation:** Add a subsection under Option I addressing awareness state staleness: what happens when a client disconnects ungracefully while holding the source-mode lock. The Yjs awareness protocol has a built-in timeout (default 30 seconds), which is relevant here — mention it and note that the spike should validate this edge case. Adjust the framing from "~50 lines" to "~50 lines of awareness code plus UX for lock contention and stale-lock recovery."

---

## Finding 4

- **Severity:** LOW
- **Category:** FACTUAL
- **Finding:** The report states "y-prosemirror ships a `configureYProsemirror` command (commands.js line 38-66) that supports pausing sync and switching the bound Y.Type at runtime." The evidence file confirms this, but the description of this command as designed for "document switching" that "could serve toggle-with-lock patterns" is speculative inference about the command's design intent. The command may have been designed for any number of use cases. More importantly, the report does not clarify whether this command has been tested or used for the pause-and-resume pattern described in Option I. If it was designed for switching to a different document's Y.Type (i.e., a different Y.Doc), it may not behave correctly when used to pause sync on the current Y.Type and resume later — the internal state management could differ.
- **Recommendation:** Flag this as a spike validation item explicitly. The sentence should read something like: "y-prosemirror exports `configureYProsemirror` which can pause sync and rebind to a different Y.Type. Whether this supports a pause-and-resume pattern on the SAME Y.Type (needed for Option I) has not been tested and must be validated in the spike."

---

## Finding 5

- **Severity:** MEDIUM
- **Category:** MISSING
- **Finding:** The report does not address the merge conflict scenario on toggle-back under Options A/I. When the user edits in source mode (non-collaborative), and simultaneously an agent (or another user) edits the Y.XmlFragment, the toggle-back calls `updateYFragment` with the user's markdown-derived PM tree. The report says this is "diff-based" and will "merge." But `updateYFragment` is a structural diff algorithm that matches children left-to-right and right-to-left — it is NOT a three-way merge. It has no concept of a common ancestor. If the user changed paragraph 3 in source mode and the agent also changed paragraph 3 in Y.XmlFragment, `updateYFragment` will overwrite the agent's changes with the user's version (or produce an interleaving, depending on how the diff aligns). This is a data loss scenario that the report should explicitly acknowledge.
- **Recommendation:** Add a subsection under D4 (Product Implications) titled "Concurrent edit conflict on toggle-back" that explains: (1) `updateYFragment` performs a structural diff, not a three-way merge, (2) if the same paragraph was edited in both source mode and the CRDT concurrently, one edit will likely be lost, (3) Option I's awareness lock mitigates this for multi-human scenarios but does NOT mitigate it for agent writes (the agent has no awareness state and writes regardless of source-mode lock), (4) the UX mitigation (notification that agent wrote while in source mode) should recommend the user toggle back BEFORE making source-mode edits to the same region.

---

## Finding 6

- **Severity:** LOW
- **Category:** COHERENCE
- **Finding:** The report says "No block-canonical editor has ever shipped a source toggle" and frames this as differentiation. But the competitor evidence file shows Milkdown listed as "Text canonical, No built-in source toggle." Milkdown is actually a ProseMirror-based editor that uses markdown as its serialization format — it is closer to "markdown-canonical with a ProseMirror rendering layer" than a pure text-canonical editor. Milkdown's architecture (markdown in, ProseMirror rendering, markdown out) is structurally similar to what Options A/I propose but in reverse direction (markdown is canonical, not the tree). The report could note Milkdown as partial prior art for the serialize-on-toggle pattern, even though Milkdown does not have an explicit toggle UI.
- **Recommendation:** Clarify the Milkdown entry. Its architecture is relevant because it demonstrates that markdown-to-ProseMirror-to-markdown round-tripping is viable in production (Milkdown does this on every edit). This is mild evidence supporting the feasibility of the round-trip in Options A/I, and the report should note it rather than leaving Milkdown as a throwaway row.

---

## Finding 7

- **Severity:** LOW
- **Category:** FACTUAL
- **Finding:** The performance evidence file cites "markdown-it benchmarks (0.6-1.3ms for 7.7KB)" and extrapolates to 50KB. The extrapolation assumes roughly linear scaling, which is reasonable for markdown-it's parser (single-pass, line-oriented). However, the report's full round-trip estimate combines four operations, and the `updateYFragment` estimate (5-20ms at 50KB) is acknowledged as "extrapolated from algorithm structure, not measured." The report's Limitations section mentions this, which is good. However, the Executive Summary states "<30ms" as though it is a measured figure rather than an estimate. The confidence label should be INFERRED, not implied-CONFIRMED.
- **Recommendation:** In the Executive Summary, change "Full round-trip at 50KB is <30ms" to "Full round-trip at 50KB is estimated at <30ms (extrapolated; spike should benchmark)." The evidence file already has the appropriate caveats but the Executive Summary drops them.

---

## Finding 8

- **Severity:** MEDIUM
- **Category:** MISSING
- **Finding:** The report does not address the MDX/JSX round-trip problem for source toggle, even though it references a separate report on MDX-CRDT round-trip fidelity. The source toggle is especially important for MDX content because MDX components (JSX expressions, import statements) are the primary reason users WANT source view — to edit code that the WYSIWYG cannot represent. If the markdown serializer cannot faithfully round-trip JSX blocks, void nodes, or import statements, the source toggle's utility for its most important use case is compromised. The report lists MDX as "out of scope" but does not note the dependency: the source toggle's value proposition depends heavily on round-trip fidelity for the exact content types that motivate the feature.
- **Recommendation:** Add a brief note in D4 (Product Implications) or Limitations acknowledging this dependency: "The source toggle's primary value is editing content that WYSIWYG cannot represent (MDX components, imports, frontmatter). Round-trip fidelity for these content types is a prerequisite for the feature's utility. See [MDX CRDT round-trip report] for the current state of this dependency. If round-trip for MDX is lossy, source toggle may cause data corruption on the content types users most need it for."

---

## Finding 9

- **Severity:** LOW
- **Category:** COHERENCE
- **Finding:** The report recommends "Option I for P0, with Option A as the spike validation target." This is slightly confusing — it suggests building Option I for production but spiking Option A. The logical reading is that the spike validates the serialize-on-toggle core (which is shared between A and I), and then the production implementation adds the awareness lock. But the phrasing could be misread as: "spike A, and if it works, ship I" vs "spike I directly." Given that the awareness lock is described as ~50 lines and the core is shared, the spike should probably validate the awareness lock behavior too (especially the `configureYProsemirror` pause/resume pattern).
- **Recommendation:** Clarify the recommendation: "Spike should validate both the serialize-on-toggle core (Option A's mechanism) AND the awareness lock pause/resume pattern (Option I's extension). Ship Option I as the P0 architecture."

---

## Finding 10

- **Severity:** MEDIUM
- **Category:** MISSING
- **Finding:** The report does not discuss the "split view" architecture as a distinct option — showing WYSIWYG and source side-by-side simultaneously, with one being the leader and the other a read-only follower. This is distinct from HedgeDoc's split view (where source is the leader and preview is the follower). In this variant, WYSIWYG (Y.XmlFragment) remains canonical and the source panel is a continuously-updated read-only markdown rendering. No round-trip risk because the source panel is never edited. This gives users constant visibility into the markdown output without any toggle. If combined with Option A (clicking into the source panel makes it editable, entering "source mode"), it provides a superior UX to a pure toggle. Several developer tools (VS Code's markdown preview, Typora's hybrid mode) use this pattern.
- **Recommendation:** Evaluate this as a UX variant under Option A/I. Even if the report concludes it is a P1 enhancement rather than P0, it should be mentioned as a future path. The one-way serialization (tree to markdown, read-only) is trivially cheap and has zero correctness risk.

---

## Finding 11

- **Severity:** LOW
- **Category:** FACTUAL
- **Finding:** The evidence file on Yjs ecosystem trajectory references a "CRDT Representation Independence" paper at `https://arxiv.org/abs/2504.05398`. This arxiv ID corresponds to an April 2025 paper. The report does not describe what this paper contributes to the analysis or how it relates to the dual-representation problem. It appears in the "Key sources referenced" list but is never cited in any finding.
- **Recommendation:** Either remove the reference (if it was consulted but found irrelevant) or add a sentence explaining what it contributes. Dangling references reduce credibility.

---

## Finding 12

- **Severity:** HIGH
- **Category:** COHERENCE
- **Finding:** The report's strongest claim is that Option B's "bidirectional lossless markdown-to-tree conversion is the fundamental unsolved problem" and "no production system has achieved this." But the report does not actually demonstrate WHY this is unsolvable or even particularly hard. The evidence files contain no examples of specific round-trip failures. Markdown-to-ProseMirror and ProseMirror-to-markdown are well-established operations (prosemirror-markdown ships both). The actual difficulty — if it exists — lies in edge cases: trailing whitespace normalization, list marker style preservation, reference link handling, HTML-in-markdown passthrough. The report treats this as self-evident without providing a single concrete example of a lossy round-trip. This weakens the central argument for preferring A/I over B.
- **Recommendation:** Add 2-3 concrete examples of markdown structures that do not survive a round-trip through ProseMirror. For example: (1) indented code blocks vs fenced code blocks (ProseMirror normalizes to one style), (2) reference-style links vs inline links, (3) tight vs loose lists, (4) trailing whitespace in paragraphs, (5) HTML blocks. These examples would substantiate the "fundamental unsolved problem" claim and make the argument for bounded round-trips (A/I) vs continuous round-trips (B) much stronger.

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 2     |
| MEDIUM   | 4     |
| LOW      | 5     |

**Overall assessment:** The report is well-structured, demonstrates genuine source-code-level investigation, and reaches a defensible recommendation. The two HIGH findings are: (1) a missing architecture option (read-only source view) that could dominate the recommended option on risk for P0, and (2) a central claim ("bidirectional conversion is the fundamental unsolved problem") that lacks concrete evidence to substantiate it. Neither invalidates the recommendation, but both should be addressed before the report is used to make implementation decisions.

The report shows mild bias toward Option I — not unfairly, but it underexplores the risks of Option I (stale awareness locks, concurrent agent writes, `configureYProsemirror` untested for pause/resume) while thoroughly cataloguing Option B's risks. A balanced treatment would apply the same scrutiny to the recommended option.
