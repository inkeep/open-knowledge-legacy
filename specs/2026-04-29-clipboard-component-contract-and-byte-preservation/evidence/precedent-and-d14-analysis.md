---
name: Precedent / STOP-rule contradiction analysis
description: Map every direction in the spec (D1-D4 + proposed Resolution items) against PRECEDENTS.md + CLAUDE.md STOP rules + 2026-04-16 SPEC LOCKED decisions. Find inherent contradictions, not just preferences.
date: 2026-04-29
sources:
  - "PRECEDENTS.md (36 precedents; #29 retracted)"
  - "CLAUDE.md (STOP/WARN rules section)"
  - "specs/2026-04-16-clipboard-mdast-canonical/SPEC.md §10 D14 LOCKED"
  - "Code: packages/app/src/editor/clipboard/serialize.ts:71-103 (clipboardSerializer.serializeFragment), packages/app/src/editor/clipboard/handle-paste.ts:96-104 (Branch C data-pm-slice)"
type: meta
---

# Precedent / STOP-rule contradiction analysis

## Method

Walked every direction surfaced so far (D1-D4 from intake + proposed Resolution items: Branch 0 OK MIME, toClipboardHast contract, is-markdown.ts JSX signals, storage-normalization carve-out) against:

1. The 36 numbered precedents in `PRECEDENTS.md`.
2. CLAUDE.md's STOP rules + WARN rules sections.
3. LOCKED decisions from `2026-04-16-clipboard-mdast-canonical/SPEC.md` §10.
4. LOCKED decisions from `2026-04-23-cb-v2-md-foundation/SPEC.md` + post-ship corrigenda.
5. LOCKED decisions from `2026-04-28-cb-v2-prop-file-upload/SPEC.md`.

For each direction × precedent intersection, classified as:

- **NO INTERSECTION** — precedent is in a different domain.
- **REINFORCES** — direction aligns with the precedent's pattern.
- **CONSTRAINS** — precedent restricts how the direction may be implemented.
- **CONTRADICTS** — direction violates the precedent.

## Findings

### Direction D1 (byte-for-byte source identity)

| Precedent / rule | Verdict | Notes |
|---|---|---|
| #15(d) sourceRaw passthrough | REINFORCES | Pristine round-trip via `data.sourceRaw` is the existing mechanism for byte preservation on the persistence path. D1 extends this discipline to the clipboard path. |
| #9 schema add-only | NO INTERSECTION | D1 doesn't change schema. |
| Storage normalizations NG1-NG11 (CLAUDE.md "Irreducible gaps") | CONSTRAINS | NG1-NG11 catalogue (blank-line counts, GFM table column widths, math/footnotes/alerts, doc-start `---`→`***`, ignore-typed-only docs synthesized empty paragraph, etc.) is the existing set of structural normalizations baked into the unified parse/serialize pipeline. **D1 must explicitly carve these out** as accepted normalizations — i.e., D1 reads "byte-for-byte source identity, modulo NG1-NG11." Without this carve-out, D1 is uncheckable because the persistence path already normalizes. |
| Storage-layer fidelity contract (CLAUDE.md "Storage-layer fidelity contract") | REINFORCES | "Storage never sanitizes; render-time layers do." D1's clipboard path discipline matches the persistence path's discipline. |

**Verdict for D1:** No contradictions. One CONSTRAINT — must enumerate NG1-NG11 as accepted-on-clipboard. This becomes a P0 deliverable (the storage-normalization carve-out enumeration in §6 FRs).

### Direction D2 (both views symmetric)

| Precedent / rule | Verdict | Notes |
|---|---|---|
| #19(b) WYSIWYG uses PM's documented hooks | REINFORCES | WYSIWYG side of D2 must use PM hooks (clipboardSerializer, clipboardTextSerializer, handlePaste). Already implemented; D2 doesn't change this. |
| #19(c) Source uses CM6 EditorView.domEventHandlers | REINFORCES | Source side of D2 must use CM6 DOM-event handlers. Already implemented. |
| #19 cross-view symmetry (FR-1 + FR-4) | REINFORCES | Same selection in both views must produce byte-identical text/html. D2 explicitly extends this to byte-identical text/plain too. |

**Verdict for D2:** No contradictions; reinforces #19. The two views' implementation mechanisms ARE different per #19(b)/(c) — the user-facing behavior is symmetric. D2's "symmetric" should be read as "same byte-preservation property holds," not "same code path."

### Direction D3 (toClipboardHast per-descriptor contract)

| Precedent / rule | Verdict | Notes |
|---|---|---|
| #19(b) DOM-level handleDOMEvents.copy/cut/dragstart **prohibited** on WYSIWYG | **CONSTRAINS — load-bearing** | The BlockNote prior-art (`~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts`) implements `toClipboard` via `handleDOMEvents.copy/cut/dragstart`. **OK CANNOT use this mechanism.** D3's contract surface (`descriptor.toClipboardHast: (node, ctx) => hast`) is OK; the dispatch site MUST be the existing `mdast-to-hast-handlers.ts:mdxJsxFlowHandler/mdxJsxTextHandler` path (which already runs through `clipboardSerializer.serializeFragment` per the existing pipeline). Extending this path is precedent-conformant. |
| #15(d) sourceRaw passthrough | REINFORCES | toClipboardHast is the natural sister to descriptor `serialize: (node, ctx) => mdast` (D-MF20 from cb-v2-md-foundation). Both arms (canonical + compat) declare it. Default fallback for descriptors without an explicit toClipboardHast = the existing Option B carve-out (`tryNativeHtmlPrimitive`) → fallback to `<pre class="mdx-component">` shape. |
| #9 schema add-only | NO INTERSECTION | toClipboardHast is descriptor-registry metadata, not PM schema. |
| FR-20 (mdast-to-hast escape contract) | REINFORCES | New toClipboardHast handlers MUST emit raw source via hast `text` nodes (auto-escaped by rehype-stringify), NEVER via hast `html` (passthrough). The contract inherits FR-20. |
| Storage-layer fidelity contract (CLAUDE.md "Storage never sanitizes") | NO INTERSECTION | D3 is outbound clipboard; doesn't touch persistence. |
| 2026-04-28 cb-v2-prop-file-upload D8 LOCKED (canonical/compat distinction = implementation detail, never user-surfaced) | CONSTRAINS | D3's toClipboardHast must be invisible to users in the cross-app destination. No "you pasted a GFMCallout" labeling, no Convert UI leakage. Pure HTML output, semantically meaningful but not OK-branded. |

**Verdict for D3:** One load-bearing CONSTRAINT (#19(b) prohibition). The mechanism (where the contract's dispatch happens) is forced — must thread through `clipboardSerializer.serializeFragment`, not `handleDOMEvents.copy`. The contract shape itself is unconstrained.

This is the SHARPEST finding of the analysis: **adopting BlockNote's toClipboardHast contract pattern verbatim violates precedent #19(b)**. We adapt the contract; we cannot adapt the mechanism.

### Direction D4 (cross-machine via raw markdown file transport)

| Precedent / rule | Verdict | Notes |
|---|---|---|
| FR-13 markdown-first ambiguous paste | REINFORCES | When text/plain looks like markdown, it wins over text/html. D4 strengthens this — when text/plain is markdown WITH JSX shape, it should also be recognized. |
| FR-14 isMarkdown heuristic | CONSTRAINS | Adding JSX shape signals to the heuristic is a P0 task. The signal threshold (`min(3, floor(lineCount/5))`) must be tuned so a single-line `<Component/>` paste triggers — the current threshold `Math.max(1, threshold)` requires ≥1 signal, so adding JSX as a recognized signal directly resolves D4's blocker. |

**Verdict for D4:** No contradictions; aligns with FR-13/FR-14.

### Direction "Branch 0 reads OK MIME ahead of Branch C"

| Precedent / rule | Verdict | Notes |
|---|---|---|
| #19(b) DOM-level handleDOMEvents prohibited | **CONTRADICTS if implemented as a sync-event MIME** | Writing a custom MIME (e.g., `vnd.open-knowledge/slice`) requires DOM-level `handleDOMEvents.copy`. PM's `clipboardSerializer.serializeFragment` returns a DocumentFragment that PM converts to text/html via setData; PM doesn't write any other MIMEs and doesn't expose a "write multiple MIMEs" hook. **The only PM-hook-compatible path to add a third MIME is to NOT add a third MIME** — instead encode the OK structural marker as a `data-ok-slice` attribute on the existing text/html (sister to PM's auto-attached `data-pm-slice`). Branch 0 detects the attribute via regex/querySelector, just like Branch C does for `data-pm-slice`. |
| FR-1 (text/plain + text/html only) | CONSTRAINS | Reinforces the above — the predecessor SPEC LOCKED two MIMEs. Adding a third without reopening D14 needs strong rationale; the data-attr alternative obviates the question. |
| 2026-04-16 SPEC §15 NG1 implementation sketch | DRIFTS | Sketch suggested a sync-event `text/x-ok-slice`. This sketch was non-binding; precedent #19(b)'s prohibition supersedes. The data-attr alternative wasn't surfaced in the original spec. |

**Verdict for Branch 0:** The current spec direction (sync-event custom MIME) **CONTRADICTS** precedent #19(b). The data-attr-on-HTML alternative — `data-ok-slice` co-resident with `data-pm-slice` on the first element of text/html — is precedent-conformant and works through the existing `clipboardSerializer.serializeFragment` factory. **This is the spec's most decision-implicating finding.** Open question Q2 (wire format) and Q3 (MIME-write strategy) collapse into a single design choice.

### Direction "is-markdown.ts JSX shape signals"

| Precedent / rule | Verdict | Notes |
|---|---|---|
| FR-14 isMarkdown heuristic | REINFORCES | Adding signals is the documented extension path. |
| #15(a) generic primitives over specific | REINFORCES | Adding a generic JSX-shape regex (e.g., `/<[A-Z]\w*[\s\/>]/` for capitalized; `/<[a-z]+[\s\/>][^<]*\/>$/m` for self-closing void HTML primitive form) is more reusable than per-component-name patterns. |
| WARN: storage-layer fidelity (CLAUDE.md) | NO INTERSECTION | Heuristic decides routing; doesn't touch storage. |

**Verdict:** No contradictions.

### Direction "storage-normalization carve-out enumeration"

| Precedent / rule | Verdict | Notes |
|---|---|---|
| Storage-layer fidelity contract | REINFORCES | Already says "irreducible gaps NG1-NG11." Spec just makes the existing carve-out explicit on the clipboard path. |
| #17 byte-for-byte equivalence validators gate high-risk refactors | REINFORCES | The clipboard path can adopt the same equivalence-validator pattern: a one-time validator over the corpus assert `paste(copy(disk_bytes)) === disk_bytes` modulo NG1-NG11. |

**Verdict:** No contradictions.

## Summary

| Direction | Contradictions | Constraints | Net |
|---|---|---|---|
| D1 byte-for-byte | None | NG1-NG11 enumeration required | Clean with explicit carve-out |
| D2 both views symmetric | None | Mechanism asymmetric per #19(b)/(c) | Clean |
| D3 toClipboardHast contract | None | Dispatch site forced through PM hooks (#19(b)) | Clean — mechanism BlockNote uses is prohibited; contract shape is fine |
| D4 cross-machine markdown | None | None | Clean |
| Branch 0 OK marker (sync-event MIME) | **Contradicts #19(b)** | — | **Reopen Q2/Q3 → use data-attr-on-HTML instead** |
| Branch 0 OK marker (data-attr) | None | Co-resides with `data-pm-slice` on first element | Clean |
| is-markdown.ts JSX signals | None | None | Clean |
| Storage-norm carve-out | None | None | Clean |

**No "nonsensical" assumptions** — but one architectural premise (sync-event MIME) IS contradicted by precedent. The data-attr-on-HTML mechanism resolves the contradiction without weakening the structural-payload property.

## What changes for the spec

1. Q2 (wire format) and Q3 (MIME-write strategy) collapse into a single decision: **data-attr-on-HTML** (recommended) vs sync-event MIME (would require reopening D14 + #19(b)).
2. D3's contract shape (toClipboardHast as sister to descriptor.serialize) is unblocked; mechanism is forced through `clipboardSerializer.serializeFragment`.
3. D1 needs an explicit "byte identity modulo NG1-NG11 storage normalizations" qualifier in §6 FRs and §10 D1 row.
