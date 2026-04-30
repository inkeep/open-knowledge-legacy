---
title: "TipTap WYSIWYG Clipboard Round-Trip with Markdown: Primitives, Prior Art, and Best Practices"
description: "How ProseMirror and TipTap expose clipboard hooks, how 10+ markdown-canonical editors implement copy-as-markdown and paste-from-markdown, which MIME types destination apps actually read, and how to intelligently handle rich HTML paste from Google Docs / Notion / Word / VS Code / Gmail via the unified ecosystem (rehype-remark). Covers primitive composition, Cmd+A slice semantics, drag-and-drop symmetry, browser MIME allowlists, vendor paste behavior across 15+ sources, source detection heuristics, pivot-library evaluation (Turndown vs rehype-remark), and concrete reference patterns for markdown round-trip."
createdAt: 2026-04-15
updatedAt: 2026-04-15
subjects:
  - TipTap
  - ProseMirror
  - Outline
  - BlockNote
  - Milkdown
  - AFFiNE
  - BlockSuite
  - Keystatic
  - Plate
  - Notion
  - Slack
  - GitHub
  - Google Docs
  - Google Sheets
  - Microsoft Word
  - Gmail
  - Apple Notes
  - VS Code
  - Obsidian
  - CKEditor
  - CodeMirror 6
  - Turndown
  - rehype-remark
  - remark-rehype
  - unified
  - Chromium
  - WebKit
  - Firefox
topics:
  - clipboard serialization
  - markdown round-trip
  - editor primitives
  - MIME strategy
  - browser clipboard API
  - drag-and-drop symmetry
  - HTML paste handling
  - source detection heuristics
  - HTML-to-markdown conversion
  - unified ecosystem integration
  - dual-mode clipboard (WYSIWYG + Source)
  - mdast-canonical pipeline
---

# TipTap WYSIWYG Clipboard Round-Trip with Markdown: Primitives, Prior Art, and Best Practices

**Purpose:** In a WYSIWYG TipTap editor whose canonical format is markdown, how should clipboard copy serialize to markdown and clipboard paste parse from markdown — so the editor round-trips through any external app without loss — and what is the best-practice implementation pattern?

---

## Executive Summary

The ProseMirror clipboard primitive surface is narrow and well-designed for exactly this problem: a single hook, `clipboardTextSerializer: (slice, view) => string`, intercepts the `text/plain` payload on copy, cut, and drag-start without touching internal drag-and-drop, without affecting the `text/html` side, and without disabling anything. The matching paste-side hook, `clipboardTextParser`, is already wired in most production editors. **The dominant pattern in markdown-canonical ProseMirror editors is to set these two hooks and let everything else use defaults.**

A survey of ten editor/framework codebases (Outline, BlockNote, Milkdown, tiptap-markdown, TipTap core, TipTap `@tiptap/markdown`, BlockSuite/AFFiNE, Keystatic, Plate, ProseMirror reference examples) confirms this: editors that emit markdown on copy — Outline, Milkdown, tiptap-markdown (opt-in), Keystatic — all use `clipboardTextSerializer` + wrap `slice.content` in the schema's `topNodeType` + reuse the editor's own PM→markdown serializer. Only BlockNote departs, using a DOM-level `handleDOMEvents.copy` to write three MIME types. Surprisingly, **TipTap's own `@tiptap/markdown` package does not wire clipboard at all** — it exposes a serializer for consumers to hook themselves. Plate and Novel also do not ship markdown-on-copy.

For MIME strategy, the web clipboard is effectively a **two-format world** (`text/plain` + `text/html`) for any content you want destination apps to actually read. `text/markdown` is dead on arrival — not in the W3C mandatory list, rejected by WebKit's async-clipboard allowlist, unclaimed by any major destination. Chromium's `web `-prefixed "pickling" formats (Chromium 104+) offer a Chromium-only path for lossless self-paste, but Safari and Firefox do not implement it. GitHub's cross-browser-compatible alternative — `text/x-gfm` via the sync `copy` event's `clipboardData.setData` — is the only durable custom-MIME path. Across 11 audited destinations (Google Docs, Gmail, Notion, Slack, Linear, GitHub, VS Code, Obsidian, Discord, Apple Notes, TextEdit), **writing `text/plain` as markdown source + leaving `text/html` as PM's default rendered output covers every case**: rich-text destinations consume the HTML; markdown-canonical destinations consume the text.

For Open Knowledge specifically, the paste side is already correctly implemented (Archetype D per R18, `TiptapEditor.tsx:97-103`). The copy side is the unfilled half. The most conservative, maximally-symmetric implementation is the Milkdown pattern, adapted to our `MarkdownManager`: set `clipboardTextSerializer` in `editorProps`, wrap the slice in `schema.topNodeType.createAndFill(null, slice.content)`, serialize via the existing `mdManagerRef`, and fall back to `textBetween` on serialization failure (Keystatic pattern). Do not override `clipboardSerializer` — the default PM HTML output is what Slack/Notion/Google Docs actually prefer. Do not attempt `text/markdown` or `web ` custom formats as a first-order design — they add no vendor value.

**Key Findings:**

- **`clipboardTextSerializer` is the correct hook for markdown-on-copy.** It does NOT affect internal drag-and-drop (the saved slice is pre-transformed at drag-start; only external drag hits `parseFromClipboard`). Setting it on `editorProps` wins over TipTap's auto-installed `ClipboardTextSerializer` core extension without disabling it.
- **`schema.topNodeType.createAndFill(null, slice.content)` is the canonical wrap** for turning a Slice into something a markdown serializer accepts. For Cmd+A, `openStart=0/openEnd=0` produces a clean doc; partial-block selections auto-close gracefully.
- **No surveyed editor writes `text/markdown`.** All ten that emit markdown use `text/plain`. Safari/WebKit rejects `text/markdown` from `ClipboardItem.write`; no destination reads it.
- **Two-MIME default (`text/plain` markdown + `text/html` PM default) covers all 11 audited destinations.** Notion is the only destination that aggressively parses markdown from text/plain even when text/html is present; the others use whichever format is richer for them.
- **TipTap's own markdown package doesn't ship clipboard hooks**, leaving consumers to implement. Our `MarkdownManager.serialize()` is the right substrate — already extension-symmetric with the existing `clipboardTextParser`.

---

## Research Rubric

| # | Dimension | Depth | Priority | Evidence |
|---|---|---|---|---|
| D1 | ProseMirror/TipTap clipboard primitives + composition | Deep | P0 | [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) |
| D2 | MIME strategy — text/plain vs text/html vs text/markdown vs `web ` custom | Deep | P0 | [evidence/d2-d8-mime-strategy-browser-vendor.md](evidence/d2-d8-mime-strategy-browser-vendor.md) |
| D3 | Prior art — copy direction across 10+ editors | Deep | P0 | [evidence/d3-prior-art-copy-to-markdown.md](evidence/d3-prior-art-copy-to-markdown.md) |
| D4 | Full-doc copy (Cmd+A) edge cases — Slice.content, openStart/openEnd, `__serializedForClipboard` | Deep | P0 | [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) |
| D5 | Integration with our markdown pipeline — `MarkdownManager.serialize` on a Slice | Deep | P0 | [evidence/d5-our-markdown-pipeline-integration.md](evidence/d5-our-markdown-pipeline-integration.md) |
| D6 | Paste revisit — has Archetype D held up; symmetry gaps with copy | Moderate | P1 | [evidence/d6-paste-symmetry-revisit.md](evidence/d6-paste-symmetry-revisit.md) |
| D7 | Drag-and-drop + cut symmetry | Moderate | P2 | [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) |
| D8 | Browser compat + `ClipboardItem` limits | Moderate | P2 | [evidence/d2-d8-mime-strategy-browser-vendor.md](evidence/d2-d8-mime-strategy-browser-vendor.md) |
| D9 | Recommendation for this repo | Deep | P0 | §Recommendation below |
| D10 | **Part 2:** HTML→markdown library evaluation (Turndown vs rehype-remark vs alternatives) | Deep | P0 | [evidence/d10-html-to-markdown-libraries.md](evidence/d10-html-to-markdown-libraries.md) |
| D11 | **Part 2:** Architectural shapes for HTML paste (DOMParser vs pivot vs hybrid) | Deep | P0 | §Part 2 below (synthesis of D10+D12+D14) |
| D12 | **Part 2:** Cross-app paste empirical matrix — 15+ sources, actual clipboard shapes | Deep | P0 | [evidence/d12-d13-cross-app-matrix-detection.md](evidence/d12-d13-cross-app-matrix-detection.md) |
| D13 | **Part 2:** Source detection heuristics (regex + MIME + structural) | Moderate | P1 | [evidence/d12-d13-cross-app-matrix-detection.md](evidence/d12-d13-cross-app-matrix-detection.md) |
| D14 | **Part 2:** Prior art — source-level HTML paste code in 10 editors (Obsidian, Outline, BlockNote, Milkdown, Plate, Keystatic, BlockSuite, CKEditor, tiptap-markdown, HedgeDoc) | Deep | P0 | [evidence/d14-prior-art-html-paste.md](evidence/d14-prior-art-html-paste.md) |
| D15 | **Part 2:** Integration with our markdown pipeline (R23 guard, MDX, custom nodes, performance) | Moderate | P1 | §Part 2 §D15 below |
| D16 | **Part 2:** Security (DOMPurify / sanitization posture) | Moderate | P2 | §Part 2 §D16 below |
| D17 | **Part 2:** Recommendation — architectural shape + library + pre-cleanup posture | Deep | P0 | §Part 2 §Recommendation |
| D18 | **Part 3:** CodeMirror 6 default clipboard behavior (source-level verification) | Moderate | P1 | [evidence/d18-d23-source-view-clipboard.md](evidence/d18-d23-source-view-clipboard.md) |
| D19 | **Part 3:** Cross-view symmetry analysis (WYSIWYG ↔ Source) + greenfield decision | Deep | P0 | §Part 3 below |
| D20 | **Part 3:** Canonical mdast pipeline unifying all four clipboard paths | Deep | P0 | §Part 3 below |
| D21 | **Part 3:** Source copy handler design | Deep | P0 | §Part 3 below |
| D22 | **Part 3:** Source paste handler design (5-branch dispatcher, parallel to Part 2) | Deep | P0 | §Part 3 below |
| D23 | **Part 3:** Observer bridge invariants under Source paste | Moderate | P1 | [evidence/d18-d23-source-view-clipboard.md](evidence/d18-d23-source-view-clipboard.md) |

**Stance:** Factual with conclusions. The report ends in a concrete recommendation and a reference implementation.

**Non-goals (honored):** Re-running the R18 15-editor paste landscape (R18 stands). Collaboration-sync implications of clipboard writes (Y.Doc is untouched by clipboard). Image/binary clipboard (separate spec). Security/sanitization (R18 §D2 covers). 1P code evaluation beyond D5 (repo-specific implementation belongs in a downstream spec).

---

## Detailed Findings

### D1 — ProseMirror/TipTap clipboard primitives

**Finding:** ProseMirror exposes 12 clipboard-adjacent hooks across `EditorProps`. For markdown-on-copy, exactly one is needed: `clipboardTextSerializer: (slice, view) => string`.

**Evidence:** [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) §D1.

The copy pipeline is (`prosemirror-view/src/input.ts:595-612` + `clipboard.ts:5-40`):

```
user Cmd+C/X
  → handleDOMEvents.copy/cut              [can pre-empt]
  → slice = selection.content()
  → serializeForClipboard(view, slice):
      1. transformCopied(slice) ?? slice          ← mutates slice for BOTH html + text
      2. Fragment-unwrap + context metadata
      3. clipboardSerializer ?? DOMSerializer.fromSchema(schema)  ← text/html
      4. clipboardTextSerializer(slice) ?? textBetween(...)       ← text/plain
  → setData('text/html', ...)
  → setData('text/plain', ...)
  → if cut: dispatch(tr.deleteSelection())
```

**Composition precedence:** `someProp(propName, f)` at `index.ts:294-314` — direct editor props (`_props`) win first, then direct plugins, then state plugins. TipTap's auto-installed `ClipboardTextSerializer` core extension (`@tiptap/core/src/Editor.ts:425-448`) is a plugin — passing `clipboardTextSerializer` in `editorProps` wins over it without needing to disable core extensions.

**Return-value quirk:** `someProp` uses truthy-return semantics. A `clipboardTextSerializer` returning `""` falls through to the next plugin's serializer or the default `textBetween`. Returning `null` is the documented opt-out pattern ([tiptap-markdown `clipboard.js:33-38`](https://github.com/aguingand/tiptap-markdown/blob/main/src/extensions/tiptap/clipboard.js)).

**Implications:**
- One hook, one line, correct result.
- No need to disable TipTap core extensions.
- No need to touch the text/html path (which Slack/Notion/Google Docs actually use).

**Decision triggers (when this matters):**
- If you want to also emit a custom MIME type → move to `handleDOMEvents.copy` (DOM-level, preventDefault) per BlockNote pattern.
- If you want to affect internal drag as well → use `transformCopied` instead. Rarely the right answer.

---

### D2 — MIME strategy

**Finding:** Write `text/plain` = markdown source. Let `text/html` default to PM's output. Do not attempt `text/markdown` or Chromium `web `-prefixed custom formats as a first-order design.

**Evidence:** [evidence/d2-d8-mime-strategy-browser-vendor.md](evidence/d2-d8-mime-strategy-browser-vendor.md).

The W3C Clipboard API mandates exactly three MIME types across browsers (`text/plain`, `text/html`, `image/png`). Everything else is vendor-dependent:

| MIME | Chromium | WebKit/Safari | Firefox | Verdict |
|------|----------|---------------|---------|---------|
| `text/plain` | ✓ | ✓ | ✓ | Universal; write markdown here |
| `text/html` | ✓ (sanitized) | ✓ (sanitized) | ✓ | Universal; write rendered HTML here (PM default is fine) |
| `text/markdown` | `NotAllowedError` on write | Rejected from allowlist | Not supported | Dead letter |
| `web text/markdown` (Chromium pickling) | ✓ (104+) | Not implemented | Not implemented | Chromium-only progressive enhancement |
| Custom (`text/x-foo`) via sync `clipboardData.setData` | ✓ | ✓ (within-Safari) | ✓ (FF 48+) | Only cross-browser custom-MIME path; GitHub uses for `text/x-gfm` |

**Destination behavior across 11 audited apps** (detailed table in D2 evidence):

| App | Prefers | Reads MD from text/plain? | Reads MD from text/html? |
|-----|---------|---------------------------|--------------------------|
| Google Docs / Gmail | text/html | No (literal chars) | Yes |
| Notion | text/html + own MD parser | **Yes — aggressive** | Yes |
| Slack | text/html (Quill) | No | Yes |
| GitHub (textarea) | text/x-gfm → text/plain | Yes — native | No |
| VS Code (`.md`) | text/plain | Yes — native | Ignored |
| Obsidian | text/html → MD converter | Yes (native) | Yes (since v0.10.1) |
| Discord | text/plain | Yes (subset CommonMark) | Ignored |
| Apple Notes / TextEdit | text/html / RTF | No | Yes |
| Linear | text/html + MD parser | Likely (TipTap base) | Yes |

**Pattern:** rich destinations prefer text/html; markdown-canonical destinations prefer text/plain as markdown. The two-MIME default covers every case.

**Decision triggers:**
- If a specific destination integration is a product requirement (e.g. Slack rich-paste fidelity) → audit our PM HTML output against that destination's HTML parser.
- If lossless self-paste (us → us across tabs) becomes a product requirement → consider a custom MIME via the sync `copy` event path (cross-browser) or the `web ` prefix (Chromium-only). Note the GitHub community #65235 triple-MIME double-paste hazard.

---

### D3 — Prior art (copy direction)

**Finding:** The dominant pattern among markdown-canonical PM editors is `clipboardTextSerializer` + `schema.topNodeType.createAndFill(null, slice.content)` + reuse the editor's own serializer. Do not override `clipboardSerializer` (text/html).

**Evidence:** [evidence/d3-prior-art-copy-to-markdown.md](evidence/d3-prior-art-copy-to-markdown.md).

Compact comparison (MD = markdown on copy):

| Editor | Copies as MD? | Pattern |
|--------|---------------|---------|
| **Milkdown** | Yes (unconditional) | `clipboardTextSerializer` + topNodeType wrap + pure-text shortcut |
| **Outline** | Yes (conditional heuristic) | `clipboardTextSerializer` + plain-text for simple selections |
| **Keystatic** | Yes | `clipboardTextSerializer` + try/catch fallback — symmetric with `clipboardTextParser` |
| **tiptap-markdown** (community) | Opt-in | `clipboardTextSerializer` gated by `transformCopiedText: true`; returns `null` when off |
| **BlockNote** | Yes | `handleDOMEvents.copy` DOM-level + 3 MIMEs (blocknote/html + text/html + text/plain=MD) |
| **BlockSuite/AFFiNE** | No (`MixTextAdapter` emits raw delta-text) | Async `ClipboardItem` with adapter registry; MarkdownAdapter file-export only |
| **TipTap core** | No — plain text only | `getTextBetween` with block separator |
| **TipTap `@tiptap/markdown`** | No — not wired | `editor.getMarkdown()` exists but no clipboard hooks |
| **Plate** (Slate) | No — writes x-slate-fragment + HTML + derived plain | `serializeMd` API exists but not clipboard-hooked |
| **ProseMirror reference example** | No | No clipboard config at all |
| **Novel** (TipTap-based) | Not found | Inherits TipTap core default |

**Reference implementation (Milkdown, `packages/plugins/plugin-clipboard/src/index.ts:133-147`):**

```ts
clipboardTextSerializer: (slice) => {
  const serializer = ctx.get(serializerCtx);
  const isText = isPureText(slice.content.toJSON());
  if (isText)
    return (slice.content as unknown as ProsemirrorNode)
      .textBetween(0, slice.content.size, '\n\n');

  const doc = schema.topNodeType.createAndFill(undefined, slice.content);
  if (!doc) return '';
  return serializer(doc);
},
```

**Keystatic's symmetric pattern (`clipboard.tsx:22-55`)** adds a try/catch wrapper with plain-text fallback — worth adopting for robustness.

**Implications:**
- Building this in Open Knowledge is a 15-line extension.
- No reason to invent a new pattern — four production-grade reference implementations exist.

**Decision triggers:**
- If we want multi-MIME (e.g. internal-roundtrip snapshot MIME for Cmd+C → Cmd+V lossless within OK) → BlockNote's DOM-level pattern.
- If we want selection-aware behavior (plain text for code-block-only selections, markdown for mixed) → Outline's heuristic.
- Default: Milkdown pattern + Keystatic fallback = simplest correct choice.

---

### D4 — Full-doc copy (Cmd+A) edge cases

**Finding:** Cmd+A produces an `AllSelection` whose `.content()` returns a Slice with `openStart=0, openEnd=0` and `slice.content` = Fragment of top-level blocks. `slice.content` is never a doc node — always a Fragment. `__serializedForClipboard` was removed in `prosemirror-view@1.38.0`; not relevant to our case.

**Evidence:** [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) §D4.

The Slice formula (`prosemirror-model/src/node.ts:158-166`) for Cmd+A:
- `from=0, to=doc.content.size, includeParents=true`
- `$from.depth = 0, $to.depth = 0, sharedDepth = 0`
- `depth = includeParents ? 0 : sharedDepth = 0`
- `content = doc.content.cut(0, doc.content.size)`
- `openStart = $from.depth - depth = 0`
- `openEnd = $to.depth - depth = 0`

**Partial-block selections** (e.g. mid-paragraph-1 to mid-paragraph-2) produce `openStart=1, openEnd=1`. Wrapping such a slice in `schema.topNodeType.createAndFill(null, slice.content)` auto-fills required content — the first/last block becomes a complete paragraph. Serialized markdown is correct: the user's selected text becomes standalone prose.

**Cut vs copy:** `handlers.copy = editHandlers.cut = (view, event) => { ... }` (`input.ts:595`) — same handler, same `sel.content()`, identical slice. Cut additionally dispatches `tr.deleteSelection()` after serialization completes.

**`__serializedForClipboard` / `__serializeForClipboard`:** removed in `prosemirror-view@1.38.0`. Current version `1.41.8` exposes the public instance method `view.serializeForClipboard(slice)` for code outside the copy event. Our markdown-copy work does not need this method at all.

**Implications:**
- Cmd+A works cleanly. No special case.
- Partial-block selections serialize to intuitive markdown (the selected text as a standalone block).
- Cut is fully covered by the copy path — no additional hook needed.

---

### D5 — Integration with our markdown pipeline

**Finding:** `MarkdownManager.serialize(json)` expects JSONContent with `type === 'doc'`. The integration pattern is: wrap slice content in `schema.topNodeType.createAndFill(null, slice.content)`, call `.toJSON()`, pass to `MarkdownManager.serialize()`. Wrap in try/catch with plain-text fallback.

**Evidence:** [evidence/d5-our-markdown-pipeline-integration.md](evidence/d5-our-markdown-pipeline-integration.md).

Our existing paste path (`packages/app/src/editor/TiptapEditor.tsx:97-103`) uses `MarkdownManager.parse(text)` → `schema.nodeFromJSON(json)` → `.content`. The symmetric copy path inverts this: wrap `slice.content` in topNode → `.toJSON()` → `MarkdownManager.serialize(json)`.

**Fidelity extensions behave correctly for WYSIWYG-authored content:** every fidelity attr (`sourceDelimiter`, `sourceFenceChar`, `sourceStyle`, `sourceRaw`) has a default declared in the handler (`packages/core/src/markdown/index.ts:291-330`), so content never seen as markdown source serializes to canonical forms (`**bold**`, `*italic*`, ATX headings, backtick fences, `---` rule).

**Custom nodes** (`jsxComponent`, `rawMdxFallback`, `jsxInline`, `wikiLink`, `linkRefDef`) serialize via their PM→mdast handlers in `index.ts:687-723`. Copy preserves canonical MDX/markdown form.

**Frontmatter** lives in Y.Map('metadata'), NOT in the PM doc. Cmd+A + Cmd+C produces body only — correct default.

**Implications:**
- 15-line TipTap extension; reuses existing `mdManagerRef`.
- No changes to `MarkdownManager` required.
- Schema is add-only forever (CLAUDE.md §9) — this work introduces no schema changes.

**Remaining uncertainty:**
- Performance of large-selection serialize on slow mobile devices — likely fine on desktop, not profiled on iOS.
- Empirical edge cases for partial-block selections inside custom nodes (e.g. selecting mid-jsxComponent) — unlikely to occur in practice since jsxComponent is `atom: true`.

---

### D6 — Paste symmetry revisit

**Finding:** Our existing paste implementation (R18 Archetype D) has held up and is fully symmetric with the proposed copy direction. No changes to paste required.

**Evidence:** [evidence/d6-paste-symmetry-revisit.md](evidence/d6-paste-symmetry-revisit.md).

`TiptapEditor.tsx:87-103` — current code comment: *"Always-parse text/plain paste as markdown (R18, Archetype D). All text/plain clipboard data is parsed as markdown — no detection heuristic. Cmd+Shift+V remains the browser-level plain-text escape hatch."*

**Cross-editor round-trip partial answers** (complementary to R18's "cross-editor paste" open question):
- Us → Notion: text/plain=MD triggers Notion's MD detector; rich content round-trips, complex flattens.
- Notion → Us: goes through PM's default `clipboardParser` (text/html path), NOT our `clipboardTextParser`. Correct.
- Us → Slack: Slack reads text/html (our PM default); does NOT parse markdown on paste.
- Us → GitHub: text/plain=MD round-trips natively.
- Us → Obsidian: text/html wins via Obsidian's HTML→MD converter; for pure MD fidelity users must Cmd+Shift+V.

**Implications:**
- Paste is settled.
- Copy should emit markdown to complete Archetype D symmetry.
- Cross-editor paste works in both legs for all audited destinations.

---

### D7 — Drag-and-drop + cut symmetry

**Finding:** `clipboardTextSerializer` fires on copy, cut, and external drag-start — but NOT on internal drag (within the same editor). Internal drop re-fires `transformPasted` on an already-`transformCopied` slice. Symmetry with `handleDrop`/`handlePaste` is full.

**Evidence:** [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) §D7.

| Event | `transformCopied` | `clipboardTextSerializer` | `clipboardSerializer` | `transformPasted` | Handler |
|---|---|---|---|---|---|
| copy | ✓ | ✓ | ✓ | — | — |
| cut | ✓ | ✓ | ✓ | — | — |
| dragstart | ✓ | ✓ | ✓ | — | — |
| drop (internal) | — (pre-transformed) | — | — | ✓ | `handleDrop` |
| drop (external) | — | — | — | ✓ | `handleDrop` (via `parseFromClipboard`) |
| paste | — | — | — | ✓ | `handlePaste` |

**Key symmetry finding:** internal drag preserves the original Slice via `view.dragging.slice` — it does NOT re-enter the text/plain parse path. So `clipboardTextSerializer` only affects EXTERNAL drag (drop to another app). Internal block-drag-and-drop continues to work as before.

**Why use `clipboardTextSerializer` and NOT `transformCopied`:** `transformCopied` would mutate the slice used by both `clipboardSerializer` (text/html) AND the saved internal-drag slice. `clipboardTextSerializer` is the precise hook for "only change the text/plain output."

**Implications:**
- Drag-and-drop is not affected by this change. Verified structurally.
- No need for `handleCut` — none exists (RFC #3 never landed); the copy path covers cut.

---

### D8 — Browser compat + `ClipboardItem` limits

**Finding:** WebKit's async-clipboard allowlist is the binding constraint. Design to Safari's limits; treat Chromium pickling as progressive enhancement. User-activation rules differ — `new ClipboardItem({ 'text/plain': Promise<Blob> })` is the portable pattern for async work.

**Evidence:** [evidence/d2-d8-mime-strategy-browser-vendor.md](evidence/d2-d8-mime-strategy-browser-vendor.md) §D8.

For our decision (copy hook returns synchronously via `clipboardTextSerializer`, inside the event-triggered copy handler), **none of the async-clipboard limits apply**. The ProseMirror `copy` handler uses the synchronous `event.clipboardData.setData()` path, which is the most permissive API on every browser — custom MIME types work in Firefox 48+, Safari (within-Safari), and Chromium.

If we ever move to multi-MIME writes (BlockNote-style `handleDOMEvents.copy` with `preventDefault`), we stay on the sync path and inherit the same cross-browser support.

**Implications:**
- No mobile-specific code needed.
- No user-activation workarounds needed.
- Custom MIME types via sync path are portable (if ever required).

**Remaining uncertainty:**
- iOS clipboard size caps (UNCERTAIN — empirical only). Unlikely to matter for markdown selections, but worth measuring if we add a multi-MIME internal-roundtrip snapshot.

---

## Recommendation

**For a TipTap WYSIWYG editor with markdown as canonical format and an existing markdown serializer, the industry-converged best practice is:**

1. **Set `clipboardTextSerializer` on `editorProps`.** Not a plugin — the direct-props precedence lets us win over TipTap's auto-installed core extension without disabling core extensions.
2. **Wrap `slice.content` in `schema.topNodeType.createAndFill(null, slice.content)`.** Handles Cmd+A (openStart=0/openEnd=0) and partial-block selections uniformly. Returns a valid doc node.
3. **Call the editor's existing markdown serializer** on the resulting doc. Reuse the serializer instance that already backs the paste-side parser. Symmetry is architectural, not circumstantial.
4. **Wrap in try/catch with a `slice.content.textBetween(0, size, '\n\n')` fallback.** Keystatic pattern. Cmd+C should never silently fail — plain text is an acceptable degradation.
5. **Short-circuit pure-text slices** via `textBetween` directly (Milkdown pattern). Avoids unnecessary serialize work for selections that have no marks or structure.
6. **For `clipboardSerializer` (text/html)** — two options, ranked by our greenfield posture:
   - **Greenfield-preferred (see Part 3 §D19-2):** use a dedicated mdast→HTML path (`remark-rehype` + `rehype-stringify`) that matches what Source view MUST use. Single canonical HTML-rendering path across both views; no PM-specific markup leaks to clipboard; single place to maintain custom-node rendering for clipboard. This is a slight departure from the industry pattern but is correct for our stack because we have a unified mdast pipeline that other editors do not.
   - **Industry-standard fallback:** let PM's default `DOMSerializer` produce HTML. Matches every surveyed editor (Milkdown, Outline, Keystatic, tiptap-markdown all leave it alone). Acceptable if we explicitly scope WYSIWYG-only and accept cross-view HTML divergence.

   Part 3 recommends the greenfield-preferred option for architectural consistency with Source view.
7. **Do not attempt `text/markdown` or `web ` custom MIME types.** No vendor reads them; WebKit rejects them. Zero benefit, real complexity.

**Reference implementation skeleton** (generic, not Open Knowledge specific):

```ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Slice } from '@tiptap/pm/model';

export const MarkdownClipboard = Extension.create<{
  serializer: (doc: unknown) => string;
  isPureText: (slice: Slice) => boolean;
}>({
  name: 'markdownClipboard',

  addProseMirrorPlugins() {
    const { serializer, isPureText } = this.options;
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          clipboardTextSerializer: (slice, view) => {
            try {
              if (isPureText(slice)) {
                return slice.content.textBetween(0, slice.content.size, '\n\n');
              }
              const doc = view.state.schema.topNodeType.createAndFill(null, slice.content);
              if (!doc) return null; // fall through to PM default
              return serializer(doc);
            } catch (err) {
              console.warn('markdown clipboard serialize failed; falling back', err);
              return slice.content.textBetween(0, slice.content.size, '\n\n');
            }
          },
        },
      }),
    ];
  },
});
```

**For the Open Knowledge repo specifically** — the concrete integration (MarkdownManager wiring, test harness, QA matrix) belongs in a downstream spec. The research report stays portable per the project precedent; that's where implementation specifics live.

**Decision triggers (when to deviate):**
- **Ship a heuristic like Outline's** — if user testing reveals that pasting `**foo**` into Slack rendering as `**foo**` literal is more friction than users expect. (Outline's heuristic: single code block, single code mark, or single uniform block type + no nested lists → plain text; else markdown.)
- **Move to BlockNote-style DOM-level multi-MIME** — if internal-roundtrip lossless copy (same-app Cmd+C → Cmd+V) becomes a product requirement. The BlockNote pattern writes an additional private MIME carrying the exact slice JSON, so complex nodes survive round-trip perfectly.
- **Add a custom MIME via sync path** — if GitHub-style `text/x-open-knowledge-md` interop with a sibling app family becomes valuable. The sync `copy` event path supports this cross-browser.

**Decision triggers (when this recommendation doesn't apply):**
- If the editor's canonical format is NOT markdown (e.g. a Slate-based CMS where the canonical is JSON), skip the markdown copy path entirely — write `text/html` + `text/plain` (rendered) and a private editor-JSON MIME for round-trip. This matches Plate.
- If the editor is source-first (CodeMirror over `.md` files like Obsidian/HedgeDoc), `Cmd+C` is already markdown with zero work — the selection IS the source.

---

# Part 2 — HTML Paste Handling

**Added:** 2026-04-15. This section extends the report to answer: *"We already handle text/plain markdown paste (R18 Archetype D); how should we intelligently handle rich HTML paste from Google Docs, Notion, Slack, Word, Gmail, VS Code, etc.?"*

The user intuition that motivated this section: **"We have markdown → ProseMirror. Anything that has \[any format\] → HTML, we should be able to handle."** Researched: that's correct, and the unified ecosystem makes it even cleaner than Turndown — we can go *HTML → HAST → MDAST → our PM handlers* without ever serializing to a markdown string.

---

## Executive Summary — Part 2

**The best architectural shape for our repo is: rehype-parse + rehype-remark, wired into a 5-branch source-aware paste handler.** Not Turndown. Reason: we're already a full unified codebase, and rehype-remark outputs mdast directly into the same handler table our markdown pipeline uses — no string round-trip, native GFM, and MDX/wiki-link pass through structurally (not via text serialization+re-parse).

Across 10 surveyed editors, the dominant pattern is **source-aware branching** (BlockNote, Outline, Milkdown) rather than single-library HTML→markdown (Obsidian, tiptap-markdown). Each rich source writes distinguishable HTML:

- **ProseMirror-origin** (us, Linear, Outline, BlockNote, Tiptap siblings) is detectable via `data-pm-slice` — route to PM's native `parseFromClipboard` for lossless round-trip.
- **VS Code** is detectable via `vscode-editor-data` MIME (Chromium) or Keystatic's structural fingerprint (cross-browser) — wrap as fenced code block with the language from `mode`.
- **Google Docs, Google Sheets, Word, Gmail, Slack, Apple Cocoa apps** have reliable regex fingerprints in `text/html` — strip vendor garbage, then convert.
- **Notion** has no reliable HTML fingerprint but writes markdown to `text/plain` — prefer that over its HTML.
- **AI chat (ChatGPT, Claude) copy button** writes text/plain only when using the dedicated button — treat as markdown via `isMarkdown()` signal-count heuristic.
- **Generic HTML** (Notion, any website, select-and-copy) → straight rehype-parse → rehype-remark → our mdast handlers.

CKEditor's paste-from-office plugin is the state-of-the-art Word cleanup (hundreds of lines of list reconstruction, RTF image joining, mso-* attr stripping) — adopt their filter patterns as a reference when Word paste quality matters. Every other surveyed editor relies on schema `parseDOM` rules to best-effort-handle Word; CKEditor is the only industrial-strength answer. We don't need their depth on day one, but it's the escape hatch if Word becomes a priority use case.

For **security**, the surveyed market consensus matches our NG4 invariant: no paste-time DOMPurify (except BlockSuite for its own snapshot round-trip). XSS is a render-layer concern (DOMPurify in docs site). Storage/CRDT stays fidelity-preserving. Enabling rich HTML paste does NOT add XSS surface — our ProseMirror schema structurally rejects unknown tags; our `htmlBlock` storage node renders through a sanitized surface at the docs-site render layer.

**Key Findings — Part 2:**

- **rehype-parse + rehype-remark beats Turndown for our stack.** Architectural fit (we're already unified), native GFM, direct HAST→mdast→PM path preserves MDX structurally, first-party TS types, institutional backing (unified collective). Turndown's primary advantage is Obsidian production precedent and community community rule corpus — both replicable via rehype-remark handlers.
- **`data-pm-slice` detection is the single highest-leverage heuristic.** It identifies every ProseMirror-origin source (ourselves, Linear, Outline, BlockNote, Tiptap siblings) and routes them to PM's native parseFromClipboard — lossless round-trip with zero conversion.
- **Milkdown's reuse-the-preProcessedSlice trick** is the cleanest pattern in the survey: PM has already parsed the HTML by the time `handlePaste` fires; consume that slice instead of re-parsing.
- **BlockNote's MIME priority cascade + markdown-first flag** (`prioritizeMarkdownOverHTML: true` default) is the right UX answer for ambiguity — markdown-canonical destinations get markdown; rich HTML destinations get HTML; `plainTextAsMarkdown` toggle covers the rest.
- **CKEditor paste-from-office is the only source for Word list reconstruction.** No other editor reconstructs nested `<ol>/<ul>` from flat Word paragraphs with `mso-list:l1 level1 lfo1` hints. If Word paste becomes a priority, port their filter patterns rather than reinvent.
- **Notion-specific gotcha (BlockNote finding):** Notion uses literal `\n` in text nodes as hard breaks. Generic whitespace normalization eats them. BlockNote detects Notion via the `<!-- notionvc: UUID -->` comment and SKIPS normalization. Worth replicating.
- **AI chat (ChatGPT, Claude) copy button writes text/plain only.** Inverts normal text/html-first priority: if no text/html and text/plain looks like markdown, parse as markdown. This is the "paste from Claude / ChatGPT" happy path.

---

## D10 — HTML→Markdown library evaluation

**Finding:** rehype-parse + rehype-remark (unified ecosystem) is the strictly-better choice for our stack. Turndown is the industry default and works, but gives up architectural benefits we can have.

**Evidence:** [evidence/d10-html-to-markdown-libraries.md](evidence/d10-html-to-markdown-libraries.md).

Side-by-side summary:

| Dimension | Turndown | rehype-remark |
|---|---|---|
| Weekly downloads | 3.7–4.0M (dominant) | tens of k |
| Maintenance | active (mixmark-io org; 2026-04 commits) | stable (unified collective; 2025-04) |
| GFM tables/strike/tasks | via `turndown-plugin-gfm` (frozen since 2017) | **native** (hast-util-to-mdast) |
| TS types | `@types/turndown` (DT) | first-party `.d.ts` |
| Vendor-specific heuristics | none built-in | none built-in |
| Output | markdown string | **mdast tree** |
| Pipeline shape with us | two parsers + string round-trip | one parser, tree-only |
| MDX pass-through | serialize to JSX text, re-parse | emit `mdxJsxFlowElement` directly |
| Wiki-link pass-through | custom rule emits `[[...]]` text | handler emits `{type: 'wikiLink'}` mdast node |
| Production precedent | Obsidian | unifiedjs consumers (MDX, Astro, Gatsby indirectly) |
| Bundle | ~30KB min+gz + domino (INFERRED) | comparable or smaller (incremental to existing unified) |

**Why rehype-remark wins for us specifically:**

Our existing pipeline (`packages/core/src/markdown/pipeline.ts`): `remark-parse → remark-gfm → remark-frontmatter → remarkMdxAgnostic → wiki-link extension → R23 guard → position-slice walker → remarkProseMirror (mdast → PM JSON)`.

With Turndown:
```
HTML → Turndown (separate DOMParser) → markdown string → our remark → mdast → handlers → PM JSON
```
Two parsers; string round-trip.

With rehype-remark:
```
HTML → rehype-parse → hast → rehype-remark → mdast → our handlers → PM JSON
```
One parser, tree-only all the way.

**The bigger win — direct HAST→mdast handlers:** because our mdast→PM handlers already know `wikiLink`, `mdxJsxFlowElement`, `jsxComponent`, `escapeMark`, etc., a `rehype-remark` handler can emit those mdast types directly. A `<Note>...</Note>` in HTML becomes an `mdxJsxFlowElement` mdast node that flows through our existing pipeline unchanged — no re-escape risk, no double-parse.

**Not recommended:** node-html-markdown (perf niche), html-to-md (too thin), marked (MD→HTML only).

**Decision triggers (when Turndown might beat rehype-remark):**
- If an incompatibility surfaces during implementation (unlikely given hast-util-to-mdast's 30 element handlers + native GFM).
- If we want to adopt Obsidian-community Turndown rules directly. Weak argument — rules translate to rehype-remark handlers with modest effort.

---

## D11 — Architectural shapes

Four shapes appear in the surveyed editors. Each has a profile:

### Shape A — HTML → markdown string → native parser (Obsidian, tiptap-markdown text path)

```
text/html → Turndown → md string → our parser
```

- **Simple mental model.** One tool to own.
- **Cons:** Attributes drop on round-trip. Custom types need custom Turndown rules. String round-trip re-escape seams.

### Shape B — HTML → pre-walks → schema parseDOM (BlockNote, Milkdown, Plate, CKEditor)

```
text/html → transformPastedHTML pre-cleanup → PM DOMParser via schema parseDOM rules → Slice
```

- **Tree-first.** Schema attrs extractable; per-source pre-walks surgical.
- **Cons:** Every vendor quirk is a per-source branch. Schema `parseDOM` rules duplicate work (both `toDOM` and `parseDOM` must match our schema).

### Shape C — HTML → HAST → MDAST → native handlers (**our recommended shape**)

```
text/html → rehype-parse → hast → (pre-cleanup plugins) → rehype-remark → mdast → our mdast→PM handlers
```

- **Single parser**, tree-only, natively unified.
- **Custom nodes structural:** MDX, wiki-links, rawMdxFallback emit directly as their mdast types.
- **New-to-us but lateral.** Same plugin idiom as rest of pipeline.
- **Cons:** rehype-remark has fewer stars than Turndown (institutional maturity is higher though — it IS unified). Extra bundle cost for rehype-parse.

### Shape D — Adapter registry (BlockSuite, CKEditor normalizer registry)

```
text/html → pick adapter by MIME priority or isActive(html) → per-source filter pipeline → native
```

- **Cleanest extensibility.** One class per source.
- **Cons:** Heavier infrastructure. Overkill for our scale.

### Recommendation: Shape C wrapped in a 5-branch source-aware dispatcher (hybrid of Shape C + light Shape D thinking)

```
paste handler:
  1. If 'vscode-editor-data' MIME         → wrap text/plain in fenced code block; done
  2. If 'text/x-gfm' MIME                 → treat as markdown via our MarkdownManager; done
  3. If html contains [data-pm-slice]     → return false, let PM's parseFromClipboard handle it (native)
  4. Else if html present                 → rehype-parse → (source-specific rehype pre-cleanup plugins) → rehype-remark → mdast → our mdast→PM handlers
  5. Else text/plain only                 → if isMarkdown(text) → MarkdownManager.parse → PM; else plain text insert
```

Source-specific pre-cleanup lives as **composable rehype plugins** — one per vendor, added as evidence surfaces:
- `rehypeStripGoogleDocsWrapper` (v1 — most common source)
- `rehypeStripCocoaMeta` (handles Notes/Mail/TextEdit/Pages uniformly)
- `rehypeStripMsoStyles` (Word + LibreOffice Office HTML)
- `rehypeStripGmailClasses`
- `rehypeSkipNotionWhitespaceNormalization` (BlockNote's `notionvc:` trick)
- `rehypeStripVSCodeSpans` (structural fallback for Safari/Firefox)

This matches the CKEditor normalizer registry shape idiomatically — each vendor cleanup is an isolated plugin, registered in the pipeline in a known order. We don't need CKEditor's architectural depth for day one; we just need the pattern to scale.

---

## D12 — Cross-app paste empirical matrix

**Finding:** 15+ rich-text sources inspected. Every major source has a reliable detection fingerprint (regex or MIME). No source is a pure mystery except AI chat select-and-copy.

**Evidence:** [evidence/d12-d13-cross-app-matrix-detection.md](evidence/d12-d13-cross-app-matrix-detection.md).

Compact summary:

| Source | Fingerprint | Fingerprint confidence |
|---|---|---|
| PM-origin (us, Linear, Outline, BlockNote, TipTap) | `[data-pm-slice]` attr | Very high |
| VS Code | `vscode-editor-data` MIME (Chromium) / structural (Keystatic) | High / Medium |
| Google Docs | `/id=("\|')docs-internal-guid-[-0-9a-f]+/i` | High |
| Google Sheets | `/<google-sheets-html-origin/i` | High |
| Microsoft Word + LibreOffice Office HTML | `/xmlns:o="urn:schemas-microsoft-com/` OR `/<meta name=generator content=microsoft word/i` | High |
| Gmail | `/class="gmail_(quote\|default\|extra\|signature\|attr)"/` | High |
| Slack message | substring `c-message_kit__` | Medium-High |
| GitHub rendered | `.commit-link` OR `[data-hovercard-type]` | Medium |
| GitHub textarea | `text/x-gfm` MIME | High |
| Notion | `<!-- notionvc: UUID -->` comment | Medium-High |
| Apple Cocoa family (Notes/Mail/TextEdit/Pages) | `Cocoa HTML Writer` meta OR `Apple-tab-span`/`Apple-converted-space` | Medium (shared — harmless) |
| BlockNote | `blocknote/html` MIME | Very high |
| ChatGPT / Claude copy button | text/plain only + `isMarkdown()` heuristic | Low-Medium |

**See evidence for each source's HTML sample, garbage patterns, and per-vendor cleanup strategy.**

---

## D13 — Detection heuristics (consolidated)

**Evaluation order (earlier branches = higher fidelity):**

| Priority | Check | Routes to |
|---|---|---|
| 1 | `types.includes('vscode-editor-data')` | VS Code code-block branch |
| 2 | `types.includes('blocknote/html')` | BlockNote high-fidelity path |
| 3 | `types.includes('text/x-gfm')` | GitHub → markdown path |
| 4 | `querySelector('[data-pm-slice]')` | PM native parseFromClipboard |
| 5 | GDocs / GSheets / Word / Gmail / Slack / Apple regex match | Per-source rehype pre-cleanup → rehype-remark → our handlers |
| 6 | `<!-- notionvc:` comment | Notion rehype-pipeline with whitespace-preserve flag |
| 7 | Structural VS Code (monospace div→div→span) | VS Code code-block branch (cross-browser fallback) |
| 8 | text/html present, no fingerprint | Generic rehype-remark → our handlers |
| 9 | text/html absent, text/plain + `isMarkdown()` clears threshold | Our MarkdownManager.parse |
| 10 | text/plain only, no markdown signals | Plain text insert |

`isMarkdown()` is Outline's signal-count heuristic, threshold `min(3, floor(lineCount/5))`. Preferred over BlockNote's 13-regex any-match (too eager for inline prose with one inline-link).

---

## D14 — Prior art across 10 editors

**Finding:** Dominant pattern is source-aware cascade in Shape B (schema parseDOM) or Shape A (Turndown). BlockNote's markdown-first flag is the most thoughtful UX knob. Milkdown's "reuse preProcessedSlice" is the cleverest implementation trick. CKEditor paste-from-office is the only industrial-grade Word cleanup.

**Evidence:** [evidence/d14-prior-art-html-paste.md](evidence/d14-prior-art-html-paste.md).

Pattern adoption:

| Pattern | Editors | Notes |
|---|---|---|
| HTML → Turndown → MD → parser | Obsidian, tiptap-markdown (text only) | Simple; lossy |
| HTML → pre-walks → schema parseDOM (Shape B) | BlockNote, Milkdown, Plate | Current market majority for PM-based editors |
| Source-aware cascade (Shape A/B hybrid) | BlockNote, Outline | Where the UX work happens |
| Adapter registry (Shape D) | BlockSuite, CKEditor | Heavy infrastructure |
| Markdown-first-when-ambiguous | BlockNote (`prioritizeMarkdownOverHTML: true`) | Thoughtful UX default |
| text-plain-is-markdown opt-out | BlockNote (`plainTextAsMarkdown: true`) | Covers AI-chat copy-button case |

**Subtle patterns worth adopting:**

1. **Milkdown's `handlePaste(view, event, preProcessedSlice)` reuse** — consume the third argument that PM already computed, skip re-parse.
2. **BlockNote's `notionvc:` comment detection → skip whitespace normalization** — defensive per-source behavior-switch.
3. **Keystatic's cross-browser VS Code structural detection** — zero Chromium dependency.
4. **CKEditor's RTF-sibling image extraction** — pull Word image bytes from `text/rtf` to embed in `text/html` output. Unique.
5. **Google Docs double-unwrap (Milkdown)** — outer `<b id="docs-internal-guid">` AND per-table `<div dir="ltr">`.

---

## D15 — Integration with our pipeline

**Finding:** Our existing unified infrastructure makes rehype-remark a drop-in lateral addition. Our custom mdast types (wikiLink, jsxComponent, mdxJsxFlowElement, rawMdxFallback, escapeMark) map to rehype-remark handlers 1:1.

**Key integration points:**

1. **Symmetric with existing `clipboardTextParser`:** `TiptapEditor.tsx:97-103` already uses `MarkdownManager.parse()` for text/plain. A `handlePaste` or `transformPastedHTML` hook that routes HTML → rehype-remark → our mdast handlers is the parallel move.

2. **R23 guard compatibility:** our R23 autolink/void-HTML guard (`packages/core/src/markdown/autolink-void-html-guard.ts`) operates on markdown strings. rehype-remark emits mdast directly, bypassing the string stage. **No R23 exposure on the HTML paste path** — the guard's purpose (defensive MDX parsing) doesn't apply to already-parsed HTML.

3. **Custom mdast emission from rehype handlers:**
   - `a[href^="[["]` → `{type: 'wikiLink', data: {target, alias, anchor}}` (emit the mdast we already know)
   - `<Note>`/`<Callout>` etc. (known component names) → `{type: 'mdxJsxFlowElement', name, attributes, children}` (ditto)
   - Arbitrary inline HTML → preserve as `html` mdast node → feeds our `htmlBlock` PM node via existing handler
   - Unknown tags → default pass-through per hast-util-to-mdast

4. **Performance:** our R6 `parseWithFallback` pattern (block-level split-then-rejoin) is NOT needed on the HTML paste path. rehype-parse follows WHATWG HTML — it never throws on malformed HTML. Failures manifest as structural degradation, not exceptions. Simpler than the markdown parse path.

5. **Performance on large pastes:** Google Docs can emit ~1MB of HTML for a multi-page selection. rehype-parse is a native-backed DOM parser (`parse5` under the hood); typically microseconds-to-low-ms for 1MB. Acceptable in clipboard event window. Monitor post-implementation.

6. **Schema is add-only precedent (CLAUDE.md §9):** this work introduces NO schema changes. We parse to existing mdast/PM types.

---

## D16 — Security (sanitization posture)

**Finding:** Market consensus matches our NG4 invariant — no paste-time storage-layer sanitization. XSS mitigated at render layer (DOMPurify in docs site). BlockSuite is the only outlier, and only sanitizes its own snapshot round-trip path.

**Our posture:**

1. **No DOMPurify on paste.** rehype-remark converts hast → mdast; script tags, event handlers, and unknown attributes don't map to mdast nodes → structurally dropped. Same surface as today (`htmlBlock` stores raw HTML; docs-site render sanitizes).
2. **`htmlBlock` stays the escape valve.** Pasted `<iframe>`, `<script>`, etc. land in our existing `htmlBlock` PM node (stored as string attr per CLAUDE.md §R18 NG4). Docs-site render path applies DOMPurify.
3. **No new XSS surface.** The worst-case pasted HTML is identical in risk to a user manually authoring that HTML in source view. Existing invariants cover it.

**Residual concern:** A pasted HTML with `<script>` survives in our `htmlBlock` storage. If we ever preview that content inside the editor itself (as opposed to the docs site), we'd need DOMPurify at that render point. Currently, the editor doesn't render unsanitized HTML inline — `htmlBlock` displays as an atomic placeholder. Flagged for spec review.

---

## Recommendation — Part 2

**Primary approach:**

1. **Add `rehype-parse` + `rehype-remark` as new packages** in `packages/core`.
2. **Wire a `handlePaste` plugin** in `TiptapEditor.tsx` (parallel to existing `clipboardTextParser`). Five branches:
   - Custom MIME detection (`vscode-editor-data`, `blocknote/html`, `text/x-gfm`) → specific handlers
   - PM-origin (`data-pm-slice`) → return false → PM's native parseFromClipboard
   - text/html present → rehype pipeline (with source-specific cleanup plugins) → mdast → existing mdast→PM handlers
   - text/plain only + `isMarkdown()` signals → MarkdownManager.parse (existing path)
   - text/plain only, no signals → plain text insert
3. **Start with narrow source cleanup.** Ship Branches 1, 2, 4, 5 on day one (mechanical / settled). Ship Branch 3 with ONLY Google Docs cleanup initially (most common rich-text source). Add Word, Gmail, Apple Cocoa, Slack, Notion-whitespace-skip, VS Code-structural-fallback as user feedback surfaces them.
4. **Do not override `clipboardParser`** — leave PM's default DOMParser for the `[data-pm-slice]` passthrough path. Our handler short-circuits it only when we want to convert.
5. **Custom rehype plugins for MDX / wiki-link / htmlBlock passthrough.** Specifically:
   - A `rehypeExtractWikiLinks` plugin that maps `<a href="[[...]]">` (or whatever form our copy-direction emits) to mdast `wikiLink` nodes.
   - A `rehypeExtractMdxComponents` plugin that maps recognized component tags (configured via a list in core) to mdast `mdxJsxFlowElement` / `mdxJsxTextElement`.
   - Unknown HTML → default hast-util-to-mdast behavior (mostly pass-through as `html` mdast nodes → our existing `htmlBlock` handler).

**Reference implementation sketch** (generic, adapt to our package shape):

```ts
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

function makeHtmlToMdast(options: { knownComponentTags: string[] }) {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStripGoogleDocsWrapper)
    .use(rehypeStripCocoaMeta)
    .use(rehypeStripMsoStyles)
    .use(rehypeStripGmailClasses)
    .use(rehypeExtractWikiLinks)
    .use(rehypeExtractMdxComponents, { tags: options.knownComponentTags })
    .use(rehypeRemark, { handlers: ourCustomHandlers });
}

export const ClipboardHtmlPaste = Extension.create({
  name: 'clipboardHtmlPaste',
  addProseMirrorPlugins() {
    const mdManager = this.editor.storage.markdownManager; // existing ref
    const htmlToMdast = makeHtmlToMdast({ knownComponentTags: [...] });

    return [new Plugin({
      key: new PluginKey('clipboardHtmlPaste'),
      props: {
        handlePaste(view, event) {
          const cd = event.clipboardData;
          if (!cd) return false;

          // Branch 1: VS Code
          if (cd.types.includes('vscode-editor-data')) { /* fenced code block */ return true; }

          // Branch 2a: GitHub textarea
          if (cd.types.includes('text/x-gfm')) { /* existing markdown path */ return true; }

          // Branch 3: PM-origin (let PM handle it)
          const html = cd.getData('text/html');
          if (html && html.includes('data-pm-slice')) return false;

          // Branch 4: generic HTML → rehype-remark → mdast → PM
          if (html) {
            try {
              const tree = htmlToMdast.runSync(htmlToMdast.parse(html));
              const pmDoc = mdastToPm(tree, view.state.schema); // reuse our handler table
              view.dispatch(view.state.tr.replaceSelectionWith(pmDoc, false));
              return true;
            } catch {
              // fall through to existing clipboardTextParser (text/plain path)
              return false;
            }
          }

          // Branch 5: text/plain → existing clipboardTextParser handles markdown detection
          return false;
        },
      },
    })];
  },
});
```

**Decision triggers (when to deviate):**

- **Adopt Turndown if rehype-remark integration surfaces a blocker.** Unlikely but possible. Keep the 5-branch dispatcher shape; swap only the HTML→markdown step.
- **Port CKEditor's Word list reconstruction** if Word paste becomes a priority — their `transformListItemLikeElementsIntoLists` is the reference. Don't reinvent.
- **Add BlockSuite-style DOMPurify** only if we discover an in-editor rendering path that bypasses our current htmlBlock atomic-placeholder pattern.
- **Add custom MIME write on copy** (Chromium pickling OR sync-event `text/x-ok-slice`) if lossless same-app cross-tab paste becomes a product requirement. Orthogonal to this Part 2.

---

## Open questions (Part 2 specific)

Honest confidence assessment:

**High confidence (~95% — two staff engineers would converge):**
- Pivot library: rehype-parse + rehype-remark (not Turndown) given our existing unified footprint
- Branch 1 (data-pm-slice → PM native)
- Branch 4 (text/plain + isMarkdown → existing markdown path)
- VS Code detection via `vscode-editor-data` MIME (Chromium) with structural fallback
- Google Docs, Word regex detection (CKEditor's patterns are battle-tested)
- No paste-time DOMPurify; render-layer sanitization

**Genuine debate (one-staff-engineer-might-differ):**
- **How aggressive is the source-cleanup panel on day 1?** (Ship GDocs only vs full panel.) Narrower is safer. User feedback surfaces priorities.
- **BlockNote's `prioritizeMarkdownOverHTML: true` vs Plate's `prioritizeHTMLOverMarkdown`.** Same ambiguity problem as the copy-side "unconditional vs heuristic" debate. Recommend BlockNote's default for symmetry with our Archetype D paste approach.
- **Do we attempt Word list reconstruction?** Day-one scope creep. Defer; rely on schema `parseDOM` defaults. Escalate to CKEditor-style filter only if Word paste becomes a user-reported gap.

**Judgment calls (either choice fine):**
- Rehype plugin ordering (all cleanups before rehype-remark; internal order doesn't matter for correctness).
- Whether to expose `prioritizeMarkdownOverHTML` as a config (probably yes; small surface).
- Error handling if rehype fails (fall through to PM default? fall through to plain text? throw?). Recommend fall through to `clipboardTextParser` path (Keystatic pattern).

---

# Part 3 — Source View Clipboard Handling

**Added:** 2026-04-15. Extends the report to answer: *"We have two views — WYSIWYG (TipTap) and Source (CodeMirror 6). Part 1 + Part 2 covered WYSIWYG. What about Source?"*

This section is written with explicit greenfield posture: no deferred tech debt, optimize for architectural correctness + clean codebase + best product experience over expediency.

---

## Executive Summary — Part 3

**Source view has two real asymmetries with WYSIWYG clipboard behavior today.** Both should be closed per greenfield posture.

1. **Copy asymmetry:** CM6 default writes `text/plain` only (source-verified from `@codemirror/view/dist/index.js:5128-5156`). WYSIWYG writes both `text/plain` and `text/html`. Same canonical content, different clipboard output depending on active view. Pasting from Source into Gmail/Slack/Notion gives monospace markdown literal instead of rendered formatting.

2. **Paste asymmetry:** CM6 default reads only `text/plain` (source-verified from `dist/index.js:5074-5087`). Rich HTML from Gmail, Google Docs, Word, Apple Notes, any website → CM6 silently strips to plaintext → formatting lost. WYSIWYG (per Part 2) converts HTML to markdown → no formatting loss. Source view user pasting rich content gets a quietly broken result.

**Greenfield closure:** write both MIMEs on Source copy; intercept HTML on Source paste. Both use the same canonical unified pipeline as WYSIWYG — only the last stage differs (markdown-string for Source, PM-Slice for WYSIWYG).

**The architectural win is a canonical bidirectional mdast pipeline.** Every clipboard conversion (four paths: WYSIWYG copy/paste, Source copy/paste) goes through mdast as the hub. No per-view special cases. No divergent HTML output. Same custom-node rendering (wikiLink, jsxComponent, rawMdxFallback) defined once in mdast-to-hast handlers, shared by both views.

This slightly amends Part 1's `clipboardSerializer` recommendation: instead of "leave PM's DOMSerializer default" (industry norm), use our shared mdast-to-html pipeline for text/html emission in both views. Rationale below (§D19-2). Part 2's paste recommendation is unchanged.

**Key Findings — Part 3:**

- **CM6 default clipboard is cleaner than expected** (no syntax-highlight HTML leakage on copy — CM6 explicitly `clearData()`s before `setData('text/plain', text)`). No pre-existing garbage to clean up.
- **Two symmetry closures needed:** Source copy writes both MIMEs; Source paste converts HTML via shared rehype pipeline.
- **Shared pipeline modules** — one new module for HTML→mdast (shared by both views' paste), one for mdast→HTML (shared by both views' copy text/html emission). Four paths, two modules, mdast as the hub.
- **Zero observer-bridge risk.** Source paste transactions are user-origin (undefined) — same path as user typing. Observer B picks up Y.Text changes and syncs to XmlFragment normally. No origin-guard churn. No invariant adjustments needed.
- **Schema-add-only precedent respected.** No schema changes; only pipeline module additions.
- **Linewise copy preservation lost** — acceptable regression (CM6 tracks `lastLinewiseCopy` internally; we lose it when we override copy). Revisit if user pain surfaces.

---

## D18 — CodeMirror 6 default clipboard behavior (CONFIRMED from source)

Source reads verified against `node_modules/@codemirror/view/dist/index.js`.

**Copy (lines 5128-5156):** One handler shared by `copy` and `cut`. Checks `hasSelection`; bails if selection is outside CM6 contentDOM (cross-editor forwarding case). Gets `{text, ranges, linewise}` from `copiedRange(view.state)`. On cut, dispatches a delete transaction with `userEvent: 'delete.cut'`. **Writes clipboard: `data.clearData()` then `data.setData("text/plain", text)`. No text/html emission.** Returns `true` to preventDefault native event (suppresses browser's DOM-selection text/html auto-emit).

**Paste (lines 5074-5087):** Bails on readOnly. Reads `data.getData("text/plain")` or `data.getData("text/uri-list")`. **Ignores text/html entirely.** Feeds to `doPaste()` with `userEvent: 'input.paste'`.

**Implication:** CM6 deliberately excludes text/html from both directions. Our dual-mode architecture therefore has a fidelity gap on rich-HTML round-trip in Source mode.

Full evidence: [evidence/d18-d23-source-view-clipboard.md](evidence/d18-d23-source-view-clipboard.md).

---

## D19 — Asymmetry analysis + greenfield decision

### D19-1. Cross-view asymmetry matrix (today)

| Direction | WYSIWYG (Part 1/2 rec) | Source (CM6 default) | Asymmetric? |
|---|---|---|---|
| Copy: text/plain | markdown source | markdown source | No |
| Copy: text/html | PM DOMSerializer (rich HTML) | NONE | **Yes** |
| Paste: text/plain markdown | `MarkdownManager.parse` → PM Slice | inserts verbatim | No (both land at markdown) |
| Paste: text/html rich | rehype → mdast → PM handlers | ignored; reads text/plain fallback (plaintext-stripped) | **Yes** |

Two real asymmetries. Both on text/html side.

### D19-2. Greenfield decision: close both asymmetries

**For copy** — the counter-argument ("I see `**bold**` in Source, I expect literal `**bold**` on paste") is weaker than industry precedent suggests. The underlying document is markdown regardless of view; destinations select the MIME that matches their content model (Gmail reads text/html → rendered; GitHub reads text/plain → source). Writing both MIMEs serves both legs correctly regardless of origin view. No user is disadvantaged by writing both.

**For paste** — industry-agnostic. Rich HTML should convert to markdown before inserting into markdown buffer. Current CM6 default loses formatting; this is a bug under any reasonable product design.

**For the text/html path specifically** — greenfield amendment to Part 1's `clipboardSerializer` rec:

1. **Source view has no PM** — MUST use mdast-to-html for text/html. Decision forced.
2. **If WYSIWYG keeps PM DOMSerializer while Source uses mdast-to-html**, the two views emit subtly different HTML for the same canonical content. PM's NodeView markup, TipTap decoration classes, and other PM-specific DOM structure leak to the clipboard. Source's mdast-to-html produces canonical rendered-markdown HTML. Asymmetry without justification.
3. **One rendering path is easier to maintain.** Custom-node rendering for clipboard (wikiLink anchor, jsxComponent raw-source preservation, rawMdxFallback passthrough) defined once in a mdast-to-hast handler table, not duplicated across `schema.toDOM` (PM) and a separate mdast handler.
4. **Ecosystem already aligned.** We're adding remark-rehype + rehype-stringify once; both views consume the same processor.

**Decision:** use mdast-to-html (remark-rehype + rehype-stringify) for text/html in BOTH views. PM's DOMSerializer remains used internally for PM's own DOM rendering (that's what it was designed for) but not for clipboard output.

---

## D20 — Canonical mdast pipeline

The greenfield shape treats **mdast as the canonical hub** for all clipboard conversions:

```
                    ┌──────────────────────────────────────────┐
                    │         mdast (canonical hub)            │
                    └──────────────────────────────────────────┘
                         ▲         ▲           ▲           ▲
      remark-parse       │         │           │           │    remark-stringify
      (MD → mdast)       │         │           │           │    (mdast → MD)
                         │         │           │           │
                      markdown   hast ◄── rehype-parse ── HTML  ◄── remark-rehype
                                              │                      + rehype-stringify
                                              ▼
                                         rehype-remark                 (mdast → HTML)
                                         (hast → mdast)
                         │         │           │           │
                         ▼         ▼           ▼           ▼
                      our PM→mdast + our mdast→PM handlers (PM ↔ mdast)
                                    │
                                    ▼
                                   PM JSON
```

The **four clipboard paths** compose from these edges:

1. **WYSIWYG copy** — PM → mdast → { remark-stringify → text/plain; remark-rehype + rehype-stringify → text/html }
2. **Source copy** — markdown substring → remark-parse → mdast → { as-is → text/plain; remark-rehype + rehype-stringify → text/html }
3. **WYSIWYG paste** — text/html → rehype-parse → rehype-remark → mdast → our mdast→PM handlers → PM Slice
4. **Source paste** — text/html → rehype-parse → rehype-remark → mdast → remark-stringify → markdown string → insert

Two new shared modules: `packages/core/src/markdown/html-to-mdast.ts` (consumed by paths 3+4) and `packages/core/src/markdown/mdast-to-html.ts` (consumed by paths 1+2). No per-view special cases in either module.

**Custom-node rendering** is centralized: wikiLink, jsxComponent, rawMdxFallback, jsxInline each get ONE mdast-to-hast handler. Used by both views. Defined once.

---

## D21 — Source copy handler

Based on CM6's own `copy`/`cut` handler semantics (D18), the replacement in `SourceEditor.tsx` uses CM6's public `EditorView.domEventHandlers` API:

```ts
import { EditorView } from '@codemirror/view';
import { markdownToHtml } from '@inkeep/open-knowledge-core/markdown';

function handleSourceCopyCut(
  event: ClipboardEvent,
  view: EditorView,
  kind: 'copy' | 'cut',
): boolean {
  // Match CM6's own hasSelection guard (don't intercept when a parent
  // editor has selected content spanning multiple elements).
  if (!hasSelectionInContent(view)) return false;

  const sel = view.state.selection.main;
  if (sel.empty) return false;

  const markdownText = view.state.sliceDoc(sel.from, sel.to);

  let htmlText: string;
  try {
    htmlText = markdownToHtml(markdownText);
  } catch (err) {
    console.warn('[source-clipboard] markdown→HTML failed; falling back to plain-text-only', err);
    return false; // CM6 default runs (text/plain only — degraded but not broken)
  }

  // Preserve CM6's cut semantics
  if (kind === 'cut' && !view.state.readOnly) {
    view.dispatch({
      changes: { from: sel.from, to: sel.to },
      scrollIntoView: true,
      userEvent: 'delete.cut',
    });
  }

  event.clipboardData?.clearData();
  event.clipboardData?.setData('text/plain', markdownText);
  event.clipboardData?.setData('text/html', htmlText);
  event.preventDefault();
  return true;
}

const sourceClipboardExt = EditorView.domEventHandlers({
  copy(event, view) { return handleSourceCopyCut(event, view, 'copy'); },
  cut(event, view)  { return handleSourceCopyCut(event, view, 'cut'); },
});
```

**Behavior:**
- Selection of any markdown substring is pipelined through remark-parse → mdast → remark-rehype → rehype-stringify to produce canonical HTML.
- On failure, falls through gracefully to CM6 default (text/plain only is degraded, not broken).
- Cut semantics identical to CM6's own (delete + userEvent preserved).
- `hasSelectionInContent` helper mirrors CM6's internal `hasSelection(view.contentDOM, view.observer.selectionRange)` — intent: don't intercept when CM6 itself would defer.

**Behavior regression:** CM6 tracks `lastLinewiseCopy` for smart linewise paste into the same editor. Override loses this. Acceptable v1 trade-off.

---

## D22 — Source paste handler

Parallel structure to Part 2's 5-branch WYSIWYG dispatcher:

```ts
import { htmlToMdast, mdastToMarkdown } from '@inkeep/open-knowledge-core/markdown';

const sourcePasteExt = EditorView.domEventHandlers({
  paste(event, view) {
    if (view.state.readOnly) return false;
    const cd = event.clipboardData;
    if (!cd) return false;

    // Branch 1: VS Code → fenced code block
    if (cd.types.includes('vscode-editor-data')) {
      const mode = JSON.parse(cd.getData('vscode-editor-data') || 'null')?.mode;
      const text = cd.getData('text/plain').replace(/\r\n?/g, '\n');
      const fenced = mode ? '```' + mode + '\n' + text + '\n```' : text;
      insertTextAtSelection(view, fenced);
      event.preventDefault();
      return true;
    }

    // Branch 2: PM-origin (our WYSIWYG, Linear, Outline, TipTap siblings)
    const html = cd.getData('text/html');
    if (html && html.includes('data-pm-slice')) {
      // text/plain is already our canonical markdown — let CM6 default run
      return false;
    }

    // Branch 3: Generic HTML → shared unified pipeline → markdown string
    if (html) {
      try {
        const mdast = htmlToMdast(html);      // shared with WYSIWYG paste
        const md = mdastToMarkdown(mdast);     // remark-stringify
        insertTextAtSelection(view, md);
        event.preventDefault();
        return true;
      } catch (err) {
        console.warn('[source-clipboard] HTML→markdown failed; falling back to plaintext', err);
        // fall through to CM6 default
      }
    }

    // Branches 4, 5: CM6 default handles text/plain
    // (GitHub/VS Code/Obsidian/ChatGPT/Claude all populate text/plain with markdown)
    return false;
  },
});
```

**Behavior:**
- Branch 1: `vscode-editor-data` MIME → structured code-block wrap. Symmetric with WYSIWYG Branch 1.
- Branch 2: `data-pm-slice` in HTML → CM6 default reads text/plain (which is already our canonical markdown from Part 1's `clipboardTextSerializer`). Zero special handling needed on this path.
- Branch 3: Generic HTML → shared `htmlToMdast` → `mdastToMarkdown` → insert. Same cleanup plugins and detection logic as WYSIWYG Branch 3 (Part 2 §D13 routing).
- Branches 4+5: CM6 default inserts text/plain verbatim. Works for GitHub, VS Code, Obsidian, Discord, AI-chat copy buttons — all emit markdown source in text/plain.

Source-specific pre-cleanup plugins (GDocs wrapper, MSO stripping, Cocoa meta cleanup) are the SAME plugins used by WYSIWYG paste — because `htmlToMdast` is a shared module. One plugin, two consumers. Add plugins iteratively as user feedback surfaces; both views benefit simultaneously.

---

## D23 — Observer bridge invariants

When Source paste dispatches a CM6 transaction inserting the converted markdown string:

1. CM6 transaction → `yCollab` (y-codemirror.next) → `Y.Text('source')` update with default origin (undefined = user-origin).
2. **Observer B** (Y.Text → XmlFragment, `ORIGIN_TEXT_TO_TREE`): sees change with undefined origin → not in skip set → syncs normally. Parses via `MarkdownManager.parse()` → applies to XmlFragment via `updateYFragment()`.
3. **Observer A** (XmlFragment → Y.Text, `ORIGIN_TREE_TO_TEXT`): does not fire — the XmlFragment update originated from Observer B with `ORIGIN_TEXT_TO_TREE`, which is in Observer A's skip set.

**End-to-end: identical data path to user typing in source view.** No invariant risk. No origin-guard adjustments. No schema changes.

**Cut-path:** same story. CM6 dispatches a delete transaction with `userEvent: 'delete.cut'`. User-origin. Observer B picks up the Y.Text delete, applies to XmlFragment. Normal flow.

**Performance note:** large Google Docs paste (~1MB HTML) generates a large Y.Text change. Observer B's typing-defer (TYPING_DEFER_MS=300ms) throttles the re-parse briefly — matches the user-typing-at-speed case. Acceptable. Verify empirically on iOS Safari post-implementation.

---

## Recommendation — Part 3

**Closing both asymmetries is architecturally correct for our stack and well-aligned with the repo's greenfield posture.** Concrete plan:

1. **Add four unified plugins** (`rehype-parse`, `rehype-remark`, `remark-rehype`, `rehype-stringify`) to `packages/core` — all small, all same ecosystem.

2. **Create two shared modules:**
   - `packages/core/src/markdown/html-to-mdast.ts` — exports `htmlToMdast(html: string): Root`. Wraps the unified processor with source-cleanup plugins (GDocs wrapper, MSO, Cocoa meta, Gmail classes, Notion whitespace-preserve, VS Code monospace fallback). Consumed by both views' paste handlers.
   - `packages/core/src/markdown/mdast-to-html.ts` — exports `markdownToHtml(md: string): string` and `mdastToHtml(root: Root): string`. Wraps `remark-rehype` + `rehype-stringify` with custom-node handlers for wikiLink, jsxComponent, rawMdxFallback, jsxInline. Consumed by both views' copy text/html emission.

3. **Wire four consumers:**
   - WYSIWYG copy (Part 1): `clipboardTextSerializer` → markdown source via `MarkdownManager.serialize`; `clipboardSerializer` → `mdastToHtml` (greenfield amendment; replaces "leave PM DOMSerializer default" from industry pattern).
   - WYSIWYG paste (Part 2): `handlePaste` → 5-branch dispatcher; HTML branch feeds through `htmlToMdast` then our mdast→PM handlers.
   - Source copy (D21): `domEventHandlers.copy`/`.cut` → writes both MIMEs (markdown source + `markdownToHtml`-rendered HTML).
   - Source paste (D22): `domEventHandlers.paste` → parallel 5-branch dispatcher; HTML branch feeds through shared `htmlToMdast` then `mdastToMarkdown` (remark-stringify) then inserts.

4. **Custom-node rendering handlers** defined once in the mdast-to-hast direction. A wikiLink renders as `<a class="wiki-link" href="#page-target">target</a>` (or whatever the design is), used for text/html across all copy paths. A jsxComponent renders its raw MDX source preserved inside a `<code>` or similar, consistent across views.

5. **No schema changes.** (CLAUDE.md §9 respected.)
6. **No observer-bridge changes.** (D23 analysis — user-origin transactions flow naturally through existing bridge.)

**Decision triggers (when to simplify):**
- If mdast-to-html rendering for custom nodes becomes a rabbit hole (e.g. jsxComponent needs complex DOM), keep PM DOMSerializer for WYSIWYG text/html and accept the cross-view divergence. Evidence would need to surface this cost during implementation.
- If user feedback indicates Source-view-copy-to-Slack with rendered bold surprises users who expected literal `**bold**`, add a Cmd+Shift+C "Copy as Plain Text" command (universal escape hatch) rather than reverting the default.

**Estimated scope delta vs Part 2:** ~0.5 days. 80% of the code is shared via the two new modules; the Source wiring adds ~60 lines to `SourceEditor.tsx` + ~40 lines of CM6 helper utilities.

---

## Confidence assessment — Part 3

**High confidence (~95%):**
- CM6 default clipboard behavior (source-verified from `dist/index.js`).
- Source paste needs intervention (real UX gap confirmed).
- Shared mdast-centered pipeline is the architecturally cleanest shape (greenfield philosophy).
- Observer-bridge compatibility (user-origin transactions flow naturally).
- Schema-add-only precedent respected.

**Genuine judgment call (~70%):**
- **Source copy asymmetry closure.** Strong architectural case (same content, same clipboard output). Weak counter-argument (source-mode users expect "what I see is what I paste"). Greenfield philosophy tips toward close-the-asymmetry. Reasonable staff engineers could disagree.
- **Greenfield amendment to Part 1's clipboardSerializer rec.** Strong architectural case (cross-view HTML consistency, single rendering path). Weak counter-argument (industry pattern is PM DOMSerializer). Reasonable staff engineers could disagree.

**Judgment calls (either fine):**
- Linewise-copy preservation (acceptable regression; revisit if reported).
- Cmd+Shift+C "Copy as Plain Text" command (optional polish; defer to user feedback).
- Per-source cleanup plugin order in `htmlToMdast` (internal detail).

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Empirical round-trip testing** across 11 destinations — researched at the "what does the destination prefer + is our output compatible" level, not at the "we measured round-trip fidelity construct-by-construct" level. Worth a small test matrix post-implementation.
- **iOS / mobile clipboard size caps** — UNCERTAIN. Unlikely to matter for typical markdown selections, but untested for large documents.
- **Linear's exact clipboard code** — INFERRED from TipTap base + common pattern; UNCERTAIN on specifics since Linear is closed-source.
- **Notion's clipboard pipeline** — observed externally, documented from help pages; no source-level citations available.

### Out of Scope (per Rubric)

- 1P implementation plan for Open Knowledge (belongs in a downstream spec).
- Collaboration-sync implications — Y.Doc is untouched by clipboard operations.
- Image/binary clipboard support — separate feature.
- Security / sanitization — covered by R18 §D2.

---

## References

### Evidence Files

**Part 1 — Copy direction + paste primer:**
- [evidence/d1-d4-d7-prosemirror-tiptap-primitives.md](evidence/d1-d4-d7-prosemirror-tiptap-primitives.md) — ProseMirror/TipTap clipboard hook inventory, default pipelines, `someProp` precedence, Cmd+A slice semantics, drag-and-drop symmetry
- [evidence/d3-prior-art-copy-to-markdown.md](evidence/d3-prior-art-copy-to-markdown.md) — 10+ editor survey: Outline, BlockNote, Milkdown, tiptap-markdown, TipTap core + `@tiptap/markdown`, BlockSuite/AFFiNE, Keystatic, Plate, Novel, MDXEditor, HedgeDoc, Obsidian
- [evidence/d2-d8-mime-strategy-browser-vendor.md](evidence/d2-d8-mime-strategy-browser-vendor.md) — W3C spec, WebKit/Chromium/Firefox allowlists, 11-destination vendor behavior matrix, sync vs async clipboard APIs
- [evidence/d5-our-markdown-pipeline-integration.md](evidence/d5-our-markdown-pipeline-integration.md) — `MarkdownManager.serialize` integration; fidelity extension defaults; custom node serialization; frontmatter exclusion
- [evidence/d6-paste-symmetry-revisit.md](evidence/d6-paste-symmetry-revisit.md) — light R18 revisit; Archetype D has held; cross-editor paste round-trip

**Part 2 — HTML paste deep dive:**
- [evidence/d10-html-to-markdown-libraries.md](evidence/d10-html-to-markdown-libraries.md) — Turndown vs rehype-remark vs node-html-markdown vs html-to-md evaluation; maintenance signals, GFM support, TS types, extensibility, integration shape with our pipeline
- [evidence/d12-d13-cross-app-matrix-detection.md](evidence/d12-d13-cross-app-matrix-detection.md) — 15+ source paste matrix (Google Docs, Sheets, Notion, Slack, Word, Gmail, Apple Cocoa family, VS Code, GitHub, ChatGPT/Claude, BlockNote, Linear/TipTap, Anytype, Typora) with HTML shapes, garbage patterns, detection heuristics
- [evidence/d14-prior-art-html-paste.md](evidence/d14-prior-art-html-paste.md) — source-level HTML paste code across Obsidian, Outline, BlockNote, Milkdown, Plate, Keystatic, BlockSuite/AFFiNE, CKEditor paste-from-office, tiptap-markdown, HedgeDoc, plus TipTap core/markdown gap

**Part 3 — Source view clipboard:**
- [evidence/d18-d23-source-view-clipboard.md](evidence/d18-d23-source-view-clipboard.md) — CodeMirror 6 default clipboard behavior (source-verified from `@codemirror/view/dist/index.js`), cross-view asymmetry analysis, canonical mdast pipeline, Source copy/paste handler design, observer bridge invariants

### External Sources (Primary)

- W3C Clipboard API: https://www.w3.org/TR/clipboard-apis/
- MDN ClipboardItem: https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem
- Chrome Web Custom Formats: https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api
- WebKit Async Clipboard API: https://webkit.org/blog/10855/async-clipboard-api/
- ProseMirror reference: https://prosemirror.net/docs/ref/
- ProseMirror discuss (authoritative Marijn answers): https://discuss.prosemirror.net/t/how-to-copy-text-in-markdown-format-from-marks/4054, https://discuss.prosemirror.net/t/what-is-openstart-and-openend-use-for/3999

### External Sources (OSS Repos)

- Outline: https://github.com/outline/outline — `app/editor/extensions/ClipboardTextSerializer.ts`
- BlockNote: https://github.com/TypeCellOS/BlockNote — `packages/core/src/api/clipboard/toClipboard/copyExtension.ts`
- Milkdown: https://github.com/Milkdown/milkdown — `packages/plugins/plugin-clipboard/src/index.ts`
- tiptap-markdown: https://github.com/aguingand/tiptap-markdown — `src/extensions/tiptap/clipboard.js`
- TipTap: https://github.com/ueberdosis/tiptap — `packages/core/src/extensions/clipboardTextSerializer.ts`, `packages/markdown/src/Extension.ts`
- BlockSuite/AFFiNE: https://github.com/toeverything/AFFiNE, https://github.com/toeverything/BlockSuite — clipboard adapters
- Keystatic: https://github.com/Thinkmill/keystatic — `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx`
- Plate: https://github.com/udecode/plate — `packages/markdown/src/lib/MarkdownPlugin.ts`, `packages/core/src/static/plugins/ViewPlugin.ts`
- GitHub paste-markdown: https://github.com/github/paste-markdown

### Related Research

- [reports/markdown-editor-paste-and-html-survey/](../markdown-editor-paste-and-html-survey/) — R18, paste-direction landscape across 15 editors; established Archetype D as our paste pattern
- [reports/markdown-roundtrip-fidelity-tiptap/](../markdown-roundtrip-fidelity-tiptap/) — round-trip fidelity analysis for TipTap markdown
- [reports/markdown-construct-fidelity-catalog/](../markdown-construct-fidelity-catalog/) — construct-level fidelity catalog

---

## 2026-04-30 verification update

**Triggered by:** /spec session for `clipboard-component-contract-and-byte-preservation` (`specs/2026-04-29-clipboard-component-contract-and-byte-preservation/`). Two factual claims surfaced as candidate spec-direction assumptions and were sent for primary-source verification before being locked into the spec rubric: (1) `text/markdown` is dead on the clipboard in practice, and (2) several markdown-canonical editors emit canonical markdown bytes via `text/plain` on copy. The spec direction at the time of verification is "FR-13-first dispatcher reorder + extended is-markdown JSX signals; no Branch 0; no custom MIME; no `data-attr` marker; `toClipboardHast` contract for outbound only." This pass refreshes those two factual claims and surfaces drift since 2026-04-15.

**Method:** Cross-referenced the original report's claims against (a) the IANA media type registry, (b) the W3C Clipboard API spec, (c) the WebKit blog's authoritative `ClipboardItem.write` allowlist post, (d) the Mozilla Bugzilla closure for custom-MIME clipboard support, (e) the Chrome blog + chromestatus entry for `web `-prefixed pickling, (f) MDN's `ClipboardItem.supports` baseline announcement, (g) primary-source code in the locally-cloned repos for Outline, Milkdown, BlockNote, Keystatic, BlockSuite/AFFiNE, and VS Code, and (h) Linear's official LinkedIn / X announcement and editor docs for `Cmd+Opt+C`. Negative spot-checks against community + vendor docs for Notion, Google Docs, Gmail, Slack.

### text/markdown clipboard status (verified)

**Verdict: CONFIRMED on every sub-claim.** No drift since 2026-04-15.

| Sub-claim | Verdict | Primary evidence |
|---|---|---|
| `text/markdown` is registered as an IANA media type | CONFIRMED | [IANA registry: text/markdown](https://www.iana.org/assignments/media-types/text/markdown) — "registered 2014-11-11, updated 2016-03-28; see RFC7763" |
| RFC 7763 is the registration RFC | CONFIRMED | IANA registry entry above cites `RFC7763` as the reference |
| W3C-mandatory clipboard MIMEs are `text/plain` + `text/html` + `image/png` | CONFIRMED with one correction | [W3C Clipboard API spec §6.4](https://www.w3.org/TR/clipboard-apis/) — "must recognize... text/plain, text/html, image/png". Optional types (§6.5): `text/uri-list`, `image/svg+xml`, `web `-prefixed custom formats. **The previously-stated mandatory list "text/plain, text/html, image/png, image/jpeg, image/gif, image/svg+xml" was over-stated** — the actual mandatory triple is plain/html/png; the others are optional or browser-specific. The previous report's body text matches this corrected version (line 70: "the Clipboard API mandates support for plain text, HTML and PNG"). |
| WebKit/Safari `ClipboardItem.write` rejects `text/markdown` from the allowlist | CONFIRMED | [WebKit blog: Async Clipboard API](https://webkit.org/blog/10855/async-clipboard-api/) — explicit allowlist quote: "text/plain, text/html, text/uri-list, and image/png". `text/markdown` is not in this list. Alex Harri's clipboard tour ([alexharri.com/blog/clipboard](https://alexharri.com/blog/clipboard)) corroborates: writes outside the mandatory triple throw with "Type ... not supported on write." |
| Chromium async API requires the `web ` prefix for non-allowlisted MIMEs | CONFIRMED | [Chrome blog: Web Custom Formats](https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api) — "Chromium 104+... prepend `web ` (with trailing space)". Without the prefix, only the sanitized triple (plain/html/png) is accepted. So `navigator.clipboard.write` accepts `web text/markdown` in Chromium (custom-format pickled), but bare `text/markdown` is rejected. |
| Firefox does not support `text/markdown` on the async API | CONFIRMED | [Bugzilla 860857](https://bugzilla.mozilla.org/show_bug.cgi?id=860857) — RESOLVED FIXED in Firefox 48 (2016) **for the synchronous `clipboardData.setData` path only**. Firefox's async `ClipboardItem` is still gated behind `dom.events.asyncClipboard.clipboardItem` pref. So sync `setData('text/markdown', ...)` works in Firefox as a custom datatype, but no destination reads it. |
| `ClipboardItem.supports()` is now baseline (March 2025) and never returns `true` for `text/markdown` | CONFIRMED | [web.dev/blog/baseline-clipboard-item-supports](https://web.dev/blog/baseline-clipboard-item-supports) — "Baseline Newly available as of March 30, 2025". Always returns `true` for the mandatory triple; varies by browser for `web `-prefixed and `image/svg+xml`. `text/markdown` not mentioned. |
| BlockNote's source comment about Safari rejecting non-`text/plain` MIMEs | CONFIRMED, with verbatim quote | `~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts` line 188-189: `// TODO: Writing to other MIME types not working in Safari for / some reason.` Followed by three `event.clipboardData!.setData` calls writing `blocknote/html`, `text/html`, `text/plain` (markdown) on lines 190-192. The TODO is at the actual write site — confirms BlockNote ships the multi-MIME pattern despite the Safari limitation, which only manifests on `ClipboardItem.write`, not the sync `clipboardData.setData` path BlockNote uses. |

**Net update for the OK spec:** the "no custom MIME" direction is confirmed correct as a baseline. There is no destination that reads `text/markdown`, no browser path that makes it portable, and the W3C mandatory triple is the only universally-supported surface. The `web `-prefixed Chromium pickling escape hatch remains a Chrome-only progressive enhancement and adds no vendor value (no destination consumes it). The `text/x-gfm` sync-event path still works cross-browser (Firefox 48+, Chromium, Safari) but the existing report already documents this and the spec correctly avoids it.

### Per-editor markdown emission (verified)

The original report's per-editor claims hold up. Two notes: (a) Linear's "default copy emits markdown" is a community claim, not an officially-documented one — Linear ships an explicit `Cmd+Opt+C` "copy as markdown" shortcut, which is what the announcements describe; the default `Cmd+C` behavior is closed-source. (b) BlockSuite/AFFiNE writes `text/plain` for its rich-text cells too, expanding the prior-art surface beyond the editors originally surveyed.

| Editor | Verdict | Primary evidence |
|---|---|---|
| **Outline** | CONFIRMED via primary source | `~/.claude/oss-repos/outline/app/editor/extensions/ClipboardTextSerializer.ts:26-66` — `props.clipboardTextSerializer: (slice, view) => {...}` returns `mdSerializer.serialize(slice.content, { softBreak: true })` for non-trivial content, and `ProsemirrorHelper.toPlainText(node)` for "simple" content (single code block, single block type). The editor's own markdown serializer is reused via `this.editor.extensions.serializer()`. **This is `text/plain` = canonical markdown**, modulo softBreak normalization. |
| **BlockNote** | CONFIRMED via primary source | `~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts:188-192` — DOM-level `event.clipboardData!.setData("text/plain", markdown)` where `markdown = cleanHTMLToMarkdown(externalHTML)`. Writes 3 MIMEs total: `blocknote/html` (internal), `text/html` (rich-text destinations), `text/plain` (canonical markdown). |
| **Milkdown** | CONFIRMED via primary source | `~/.claude/oss-repos/milkdown/packages/plugins/plugin-clipboard/src/index.ts:133-147` — `clipboardTextSerializer: (slice) => { ... const value = serializer(doc); return value }` where `serializer` is the editor's own PM→markdown serializer pulled from `serializerCtx`. The "Keystatic-style" `textBetween` fallback at line 137-141 fires only for pure-text slices. |
| **Keystatic** | CONFIRMED via primary source | `~/.claude/oss-repos/keystatic/packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:22-39` — `clipboardTextSerializer(content, view) { try { return format(proseMirrorToMarkdoc(...)) } catch { return content.content.textBetween(0, content.content.size, '\n\n') } }`. Confirmed: PM→Markdoc reuse in the success path; `textBetween` fallback on failure. |
| **HackMD/CodiMD** | CONFIRMED via inference (CodeMirror substrate) | HackMD's editor pane is a CodeMirror instance ([HackMD docs](https://www.markdownguide.org/tools/hackmd/), confirmed via search). CodeMirror's default copy uses the browser's textarea-equivalent path: source bytes go to `text/plain` directly. No markdown serializer in the loop because the editor's data model already IS the markdown source. **CONFIRMED indirectly** — the source-pane behavior follows from the substrate, not from custom code. |
| **Linear** | PARTIALLY CONFIRMED — needs sharpening | Linear has an explicit `Cmd+Opt+C` "copy as markdown" shortcut, announced 2025-07-13 by Linear's official X account ([@linear, status 1944758116396024313](https://x.com/linear/status/1944758116396024313)) and corroborated by [Linear Editor docs](https://linear.app/docs/editor) ("Copy the issue description in Markdown by opening the command menu... and selecting `copy issue in markdown`"). **The default Cmd+C behavior is not officially documented as emitting markdown.** Linear is closed-source; the original report's claim that "default copy emits markdown" is plausible but unverified by primary source. The Cmd+Opt+C shortcut suggests Linear treats markdown copy as a *non-default* opt-in. **Recommend treating "Linear emits markdown on default copy" as UNCERTAIN going forward.** |
| **VS Code (.md file open)** | CONFIRMED via primary source | `~/.claude/oss-repos/vscode/src/vs/editor/browser/controller/editContext/clipboardUtils.ts:153-159` — `setTextData(clipboardData, text, html, metadata) { clipboardData.setData(Mimes.text, text); if (typeof html === 'string') { clipboardData.setData('text/html', html); } clipboardData.setData('vscode-editor-data', JSON.stringify(metadata)); }`. The `text` here is `viewModel.getPlainTextToCopy(...)` (line 47) — the raw model bytes. For an open `.md` file, that IS the markdown source. The optional `text/html` is syntax-highlighted output (controlled by `copyWithSyntaxHighlighting`), not markdown rendering. The `vscode-editor-data` MIME is for VS Code's own paste-detection. |
| **GitHub textarea (issue/PR compose)** | CONFIRMED — native textarea + GitHub-specific paste behavior | GitHub uses a plain `<textarea>` element for issue/PR/discussion compose. Default copy from a textarea selection emits `text/plain` = the raw bytes, per browser default behavior (HTML living standard textarea contract). On the **paste** side, GitHub's [@github/paste-markdown](https://www.npmjs.com/package/@github/paste-markdown) handles HTML→markdown conversion (e.g. spreadsheet cells, links). Confirmed via GitHub Changelog ([2022-05-19](https://github.blog/changelog/2022-05-19-updates-to-markdown-pasting-on-github/)): "Content is pasted into GitHub comments as plaintext, except for a few special cases managed by @github/paste-markdown." |
| **Claude / ChatGPT / Gemini copy buttons** | CONFIRMED via empirical-only (closed-source); third-party corroboration | [unmarkdown.com blog post](https://unmarkdown.com/blog/how-to-copy-from-claude-without-losing-formatting): "When you copy Claude's response (using the copy button), you get raw markdown as `text/plain`." This is a third-party empirical observation, not an Anthropic primary source. ChatGPT and Gemini follow the same pattern by community report. **Marked as CONFIRMED-via-empirical** — no Anthropic / OpenAI / Google primary source documents the clipboard MIME shape, but the behavior is reproducible and uniformly reported. The spec should not over-rely on this; the round-trip story doesn't depend on it. |
| **BlockSuite / AFFiNE** (newly verified, not in original survey scope at this depth) | CONFIRMED via primary source | `~/.claude/oss-repos/blocksuite/packages/affine/rich-text/src/rich-text.ts:77,99` and `packages/affine/blocks/database/src/properties/title/text.ts:68,90` and `packages/affine/blocks/database/src/properties/rich-text/cell-renderer.ts:213,235` — six call sites of `e.clipboardData?.setData('text/plain', text)` for rich-text and database-cell copy. Confirms AFFiNE's text-cell write path uses `text/plain` for the source bytes, consistent with the wider pattern. |

**Negative claims (these editors do NOT emit canonical markdown via `text/plain`):**

| Editor | Status |
|---|---|
| **Notion** | UNCHANGED — third-party corroboration: "Notion puts rich HTML on your clipboard when you copy content" ([pactify.io blog](https://pactify.io/blog/copy-paste-workflow-corrupting-code), 2026). Notion ships an explicit `Cmd/Ctrl + Shift + C` "Copy as Markdown" shortcut for the markdown path; default copy is rich-text. |
| **Google Docs / Gmail / Word / Slack rich compose** | UNCHANGED — no primary sources contradict the existing report. These remain rich-text-first; clipboard inspection tools consistently report `text/html` + a non-markdown `text/plain` extraction (rendered text, not source bytes). |

### Corrections to prior claims in this report

1. **Mandatory MIME list (line 70 of REPORT.md, line 11 of `evidence/d2-d8-mime-strategy-browser-vendor.md`):** the verifying spec session inadvertently broadened the W3C mandatory triple to include `image/jpeg`, `image/gif`, `image/svg+xml`. The W3C spec §6.4 mandates only `text/plain` + `text/html` + `image/png`. The original REPORT.md text was correct ("plain text, HTML and PNG"); the spec session's broadening was wrong and has been ruled out by this verification. No edit to the original report body is needed.

2. **Linear "default copy emits markdown" framing:** the existing report's claim (line 13 of `evidence/d2-d8-mime-strategy-browser-vendor.md`: "Notion, Slack, Google Docs, Gmail, Apple Notes, GitHub, Outline, Linear, Obsidian all converge on this") is correctly hedged in the per-destination matrix at line 68 ("INFERRED... UNCERTAIN exact impl"). Verification confirms Linear's *explicit* markdown copy is opt-in via `Cmd+Opt+C`. The default `Cmd+C` behavior is unverified primary-source. **No edit needed** — the existing matrix already labels Linear as INFERRED/UNCERTAIN. Future claims about Linear should preserve that hedge.

3. **No drift in any other claim.** The `webkit.org/blog/10855` allowlist quote, the Chromium 104+ pickling shipdate, the Firefox 48 bug closure, the Mozilla async-clipboard pref gating, and all per-editor primary-source citations remain accurate as of 2026-04-30.

### Implications for the OK spec

The verification supports the locked spec direction. Specifically:

- **"No Branch 0" (no `text/markdown` MIME on outbound):** confirmed correct. There is no destination that reads it, WebKit's `ClipboardItem.write` allowlist explicitly rejects it, and even Chromium accepts it only behind the `web ` prefix where no destination consumes it. Adding `text/markdown` to the spec's outbound MIME list would be pure dead weight.
- **"No custom MIME" (no `text/x-ok-slice` / no `web text/markdown`):** confirmed correct as a *baseline*. The `text/x-gfm`-style sync-event path is portable but only useful if the spec adds a dedicated reader on the inbound side; the current spec doesn't, so emitting it would be unobserved exhaust. The Chromium `web `-prefixed pickling path is Chrome-only and adds no vendor value (no destination reads it).
- **"No `data-attr` marker" (no `data-pm-slice`-style outbound marker on `text/html`):** orthogonal to this verification — the existing report already covers this in the dispatcher heuristics (`evidence/d12-d13-cross-app-matrix-detection.md`). The spec direction is consistent with avoiding marker-injection on outbound HTML.
- **"FR-13-first dispatcher reorder + extended is-markdown JSX signals":** orthogonal to clipboard-MIME questions; this verification doesn't bear on the dispatcher ordering decision.
- **"`toClipboardHast` contract for outbound only":** consistent with the verified pattern across Outline, Milkdown, Keystatic, BlockNote, AFFiNE — every one of these editors performs PM→markdown serialization at the clipboard boundary, never round-trips through HTML for the markdown payload. This is exactly the `toClipboardHast`-style contract surface the spec is building.

The one area where the spec should preserve hedge: any claim that "Linear emits markdown on default copy" (or any closed-source vendor in the same category — Notion default, Slack default) is empirical-only and may regress. The spec should not depend on closed-source vendor *defaults* for round-trip correctness; rely instead on the open-source primary-source evidence (Outline, BlockNote, Milkdown, Keystatic, BlockSuite, VS Code) for the canonical pattern.

---

## 2026-04-30 markdown-detection heuristic survey

**Triggered by:** /spec session for clipboard-component-contract-and-byte-preservation; FR-13-first dispatcher reorder makes the is-markdown heuristic load-bearing for OK→OK byte preservation, so we want to verify our pattern matches peers. The spec direction at the time of survey is "is-markdown heuristic is the only piece of paste-discrimination infrastructure between text/plain branches" — this survey audits whether OK's borrowed-from-Outline expression is the right shape to lock as-final in the spec.

**Method:** Read clipboard / paste source code in nine locally-cloned OSS editor repos (Outline, BlockNote, Milkdown, Keystatic, Lexical, Plate, BlockSuite, AFFiNE, tiptap-markdown). Cross-checked npm registry for any standalone `is-markdown` detection package. Verified `@github/paste-markdown` heuristic via primary source. Full evidence in [`evidence/markdown-detection-heuristic-survey.md`](evidence/markdown-detection-heuristic-survey.md).

### Per-editor heuristics

| Editor | Approach | Detection? | File:line |
|---|---|---|---|
| **Outline** | Weighted signal-count + line-scaled threshold | YES (content-scanning) | `shared/editor/lib/isMarkdown.ts:1-48` |
| **BlockNote** | 13-regex any-match | YES (content-scanning) | `packages/core/src/api/parsers/markdown/detectMarkdown.ts:1-62` |
| **Milkdown** | Try-parse, return false on no-slice | NO (parser-as-validator) | `packages/plugins/plugin-clipboard/src/index.ts:114-131` |
| **Keystatic** | Try-parse with try/catch fallback | NO (parser-as-validator) | `packages/keystatic/src/form/fields/markdoc/editor/markdoc/clipboard.tsx:40-55` |
| **BlockSuite / AFFiNE** | Adapter registry — `MixTextAdapter` always parses as markdown | NO (priority cascade + always-parse) | `packages/affine/foundation/src/clipboard.ts:46-50` + `mix-text.ts:261-310` |
| **Lexical** | None — `text/plain` becomes literal text | NO (no detection at clipboard layer) | `packages/lexical-clipboard/src/clipboard.ts:140-208` |
| **Plate** | None for the paste→markdown direction | NO (no detection) | confirmed via grep of `packages/markdown/` |
| **tiptap-markdown** | Unconditional `clipboardTextParser` (gated by `transformPastedText`) | NO (always-parse when enabled) | `src/extensions/tiptap/clipboard.js:19-29` |
| **`@github/paste-markdown`** | MIME-type-only detection (`text/x-gfm`) | NO (cooperative MIME) | `src/paste-markdown-text.ts: hasMarkdown()` |

**Outline's expression** (origin of OK's pattern):

```typescript
function isMarkdown(text: string): boolean {
  let signals = 0;
  const lines = text.split("\n").length;
  const minConfidence = Math.min(3, Math.floor(lines / 5));

  const fences = text.match(/^```/gm);
  if (fences && fences.length > 1) signals += fences.length;     // PAIRED only
  const latex = text.match(/\$(.+)\$/g);
  if (latex) signals += latex.length;
  const links = text.match(/\[[^]+\]\(https?:\/\/\S+\)/gm);
  if (links) signals += links.length * 2;                         // 2x weight
  const relativeLinks = text.match(/\[[^]+\]\(\/\S+\)/gm);
  if (relativeLinks) signals += relativeLinks.length * 2;         // 2x weight
  const headings = text.match(/^#{1,6}\s+\S+/gm);
  if (headings) signals += headings.length;
  const listItems = text.match(/^[-*]\s\S+/gm);                   // NOT + or numbered
  if (listItems) signals += listItems.length;
  const tables = text.match(/\|\s?[:-]+\s?\|/gm);                 // separator only
  if (tables) signals += tables.length;
  return signals > minConfidence;                                  // STRICT >
}
```

**BlockNote's expression** (the stricter alternative):

```typescript
const h1 = /(^|\n) {0,3}#{1,6} {1,8}[^\n]{1,64}\r?\n\r?\n\s{0,32}\S/;        // requires blank+content after
const bold = /(_|__|\*|\*\*|~~|==|\+\+)(?!\s)(?:[^\s](?:.{0,62}[^\s])?|\S)(?=\1)/;
const link = /\[[^\]]{1,128}\]\(https?:\/\/\S{1,999}\)/;
const code = /(?:\s|^)`(?!\s)(?:[^\s`](?:[^`]{0,46}[^\s`])?|[^\s`])`([^\w]|$)/;
const ul = /(?:^|\n)\s{0,5}-\s{1}[^\n]+\n\s{0,15}-\s/;                       // requires 2 items
const ol = /(?:^|\n)\s{0,5}\d+\.\s{1}[^\n]+\n\s{0,15}\d+\.\s/;               // requires 2 items
const hr = /\n{2} {0,3}-{2,48}\n{2}/;
const fences = /(?:\n|^)(```|~~~|\$\$)(?!`|~)[^\s]{0,64} {0,64}[^\n]{0,64}\n[\s\S]{0,9999}?\s*\1 {0,64}(?:\n+|$)/;
const title = /(?:\n|^)(?!\s)\w[^\n]{0,64}\r?\n(-|=)\1{0,64}\n\n\s{0,64}(\w|$)/;  // SETEXT
const blockquote = /(?:^|(\r?\n\r?\n))( {0,3}>[^\n]{1,333}\n){1,999}($|(\r?\n))/;
const tableHeader = /^\s*\|(.+\|)+\s*$/m;
const tableDivider = /^\s*\|(\s*[-:]+[-:]\s*\|)+\s*$/m;
const tableRow = /^\s*\|(.+\|)+\s*$/m;

export const isMarkdown = (src: string): boolean =>
  h1.test(src) || bold.test(src) || link.test(src) || code.test(src) ||
  ul.test(src) || ol.test(src) || hr.test(src) || fences.test(src) ||
  title.test(src) || blockquote.test(src) || tableHeader.test(src) ||
  tableDivider.test(src) || tableRow.test(src);
```

### Patterns observed

**Three structural responses to "is text/plain markdown?"**, with editors split roughly evenly:

1. **Content-scanning heuristic** (Outline, BlockNote, OK). Signal-count or any-match regex set. Two open-source instances; **no shared library** — both inlined.
2. **Try-parse-and-validate** (Milkdown, Keystatic, BlockSuite/AFFiNE, tiptap-markdown). Always feed text/plain to the markdown parser; gracefully fail on empty/null result, or wrap in try/catch and fall back. The parser is its own discriminator.
3. **No detection / different abstraction** (Lexical, Plate, ToastUI, `@github/paste-markdown`). Either skip markdown entirely at the clipboard layer (Lexical: input rules at typing time), require explicit user-mode toggle (ToastUI), or use cooperative MIME (`text/x-gfm`).

**Convergent observations:**

- **No npm package** for stand-alone is-markdown detection exists. The two content-scanning implementations (Outline, BlockNote) are inlined into editor codebases, not extracted to libraries. The ecosystem does not treat this as a separable concern.
- **No threshold formula scales by anything but line count.** No editor uses byte count, character entropy, ML, or "try parse and measure parse-success ratio." The complexity ceiling for the heuristic is set by what's expressible in 50 lines of regex matching plus a `Math.min`.
- **False-positive defenses live at the call site, not in the heuristic.** Outline's Dropbox-Paper exclusion, BlockNote's `prioritizeMarkdownOverHTML` tiebreaker semantics, OK's existing dispatcher cascade — every editor adds gating outside the heuristic. The signal-set itself is left coarse.
- **Outline's strict `>` comparison vs OK's inclusive `>=` is a uniform 1-signal weakening.** On 5+ line snippets, OK fires earlier than Outline by exactly one signal. This is OK's intentional drift from the source pattern; the source comment notes "small snippets need at most one signal to count."

### Comparison to OK's current `is-markdown.ts`

| Aspect | OK's pattern | Verdict |
|---|---|---|
| **Approach (signal-count vs any-match vs try-parse)** | Signal-count (Outline-style) | ALIGNED with one of three peer approaches; Outline is the more conservative of the two content-scanning peers |
| **Threshold formula** | `min(3, floor(lineCount/5))` with `>=` (inclusive) | ALIGNED with Outline; the `>=` vs Outline's `>` is a deliberate weakening — consistent with OK's "1 signal wins on short snippets" goal |
| **Code fence (` ``` `)** | Single-fence triggers | DIFFERENT from Outline (which requires PAIRED fences). OK is more permissive. Test case: a partial AI-chat copy mid-code-block triggers OK but not Outline. Worth verifying this is intentional. |
| **Inline links `[a](url)`** | Scores 1 (no 2x weight) | WEAKER than Outline (which weights 2x). OK requires twice as many links to clear the same threshold. |
| **Numbered lists `1.`** | Scores 1 | OK ADDED this; Outline does not check it; BlockNote requires 2 items |
| **Table detection** | Requires BOTH separator AND row regex match | STRICTER than Outline (which only checks separator) and BlockNote (which any-matches row OR separator OR header). OK's pairing is the most precise. |
| **Block LaTeX `$$...$$`** | Detected | OK ADDED this; Outline checks inline `$..$` instead; BlockNote doesn't check LaTeX at all |
| **Inline code `` `code` ``** | NOT checked | MISSING vs BlockNote. AI-chat outputs frequently use inline code; this is a likely false-negative class. |
| **Bold/italic `**` `*`** | NOT checked | MISSING vs BlockNote. Plain prose with one `*emphasis*` doesn't fire — but neither does an actual markdown paragraph that uses only emphasis. |
| **Blockquote `> `** | NOT checked | MISSING vs BlockNote. AI-chat citations / email quotes use this; false-negative class. |
| **Setext headings (`===`, `---`)** | NOT checked | MISSING vs BlockNote. Less common but CommonMark-canonical. |
| **Horizontal rule `---`** | NOT checked | MISSING vs BlockNote. Standalone rules without surrounding markdown context wouldn't trigger anyway, but matched-with-context HR is a real signal. |

**Net assessment of OK's current set:** Aligned with Outline's design philosophy (precise > permissive, weighted scoring) but missing five signals BlockNote checks: blockquote, inline code, emphasis, setext, horizontal rule. The most consequential miss for OK's stated use case (AI-chat copy-buttons + OK→OK round-trip) is **blockquote + inline code**, both of which appear in AI-chat output frequently and currently produce false negatives.

### Recommended cleanest pattern

**OK's current expression is structurally one of the two cleanest in the ecosystem** (the other being BlockNote's any-match). It does not need to be replaced with a different approach. Specific suggestions for the spec to consider:

1. **Add three signals to close the AI-chat false-negative class:**
   - Blockquote: `^>\s+\S+/m` (1 signal per match)
   - Inline code: BlockNote's regex `(?:\s|^)`(?!\s)(?:[^\s`](?:[^`]{0,46}[^\s`])?|[^\s`])`([^\w]|$)` is the precision benchmark; a simpler `` /(?:\s|^)`[^`\s][^`]*`/ `` would be 90% as precise.
   - Emphasis (paired markers): `/(\*\*|__|~~)\S[^*_~]*\1/m` for paired bold/strikethrough only — avoids the prose-asterisk false-positive class.
2. **Keep the current threshold formula.** No peer uses anything more sophisticated; the line-count scaling is well-aligned.
3. **Keep the "table separator AND table row" pairing.** OK's expression is more precise than either Outline or BlockNote here — defense against a stray ` | x | ` line in code prose.
4. **Re-evaluate the single-fence policy.** Outline's PAIRED-fence requirement is more conservative; OK's single-fence check could fire on prose containing a stray triple-backtick. If the spec adds inline code detection (which catches single-backtick anyway), the single-fence check could be tightened to PAIRED without losing real signal.
5. **Add JSX/MDX signal as named in the user prompt** (per the spec's "extended is-markdown JSX signals" direction). No peer checks for `<ComponentName ...>` shape; OK is alone in needing it because OK is alone in shipping MDX-native authoring. Suggest: `/^<[A-Z][A-Za-z0-9]*[\s>/]/m` (capitalized JSX-tag start at line head, scores 1).

### Implications for the OK spec

The /spec session's direction to lock OK's current heuristic as final is **structurally correct** — content-scanning signal-count is a legitimate peer pattern and OK's specific expression is well-engineered. But the *signal set* is at the lower bound of peer coverage, and three additions (blockquote, inline code, paired emphasis) would close known false-negative classes without changing the threshold formula or the dispatcher position. The JSX-tag extension named in the spec direction is also unique to OK (no peer ships MDX detection at the clipboard layer) and worth treating as an OK-specific enhancement rather than a borrowed pattern. If the spec keeps the current set as-final, the AI-chat copy-button outcome will be partial — confirm this is acceptable given the FR-13-first dispatcher pattern handles the OK→OK case via earlier branches and the heuristic is only the fallback.

---

## 2026-04-30 CSS-to-inline-style techniques for cross-app HTML emission

**Triggered by:** OK clipboard-component-contract-and-byte-preservation spec F2/F6 design challenge — `toClipboardHast` for canonical Callout (and other extended block descriptors) needs to emit inline styles for cross-app rendering. Gmail strips `<style>` blocks; GitHub only recognizes the 5 GFM alert types via class CSS; extended types (`tip`, `success`, `info`, `danger`, etc.) need their colors *inlined* on the element to render anywhere. The naive approach — hardcoding a TS palette of inline-style strings per Callout type — drifts when the live UI's Tailwind config / `globals.css` / CSS-custom-property values change. This section investigates how to derive inline styles from the same source as the live UI, ideally without a build step.

**Method:** Primary-source reads of the ProseMirror clipboard pipeline ([`prosemirror-view/src/clipboard.ts`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/clipboard.ts)), the React Email Tailwind component ([`packages/react-email/src/components/tailwind/tailwind.tsx`](https://github.com/resend/react-email/tree/main/packages/react-email/src/components/tailwind), commit-checked 2026-04-30, weekly-DL signal 789K–2.8M), Lexical's `@lexical/html` and `@lexical/clipboard` source ([`facebook/lexical`](https://github.com/facebook/lexical)), the Obsidian "Copy as HTML" plugin source ([`mvdkwast/obsidian-copy-as-html`](https://github.com/mvdkwast/obsidian-copy-as-html)), Plate's HTML serializer docs ([`platejs.org/docs/html`](https://platejs.org/docs/html)), the Tailwind v4 programmatic-compilation discussion thread ([tailwindlabs/tailwindcss#15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881), [#16612](https://github.com/tailwindlabs/tailwindcss/discussions/16612)), `jit-browser-tailwindcss` repo ([mhsdesign/jit-browser-tailwindcss](https://github.com/mhsdesign/jit-browser-tailwindcss)), and the Twind GitHub commit log (last substantive commit Q4 2024; sponsor-image chore commits only in 2026). Maintenance signals checked via `api.github.com/repos/.../commits` for activity recency. Web search for performance characteristics of `getComputedStyle` and forced-reflow cost.

### 1. Runtime `getComputedStyle()` approach — viability analysis

The instinct — "the live editor DOM already has the resolved styles; copy time should just read them" — runs into ProseMirror's clipboard architecture. The actual flow in [`prosemirror-view/src/clipboard.ts:5-37` (master)](https://github.com/ProseMirror/prosemirror-view/blob/master/src/clipboard.ts):

```typescript
export function serializeForClipboard(view: EditorView, slice: Slice) {
  view.someProp("transformCopied", f => { slice = f(slice!, view) })
  // ...
  let serializer = view.someProp("clipboardSerializer") || DOMSerializer.fromSchema(view.state.schema)
  let doc = detachedDoc(), wrap = doc.createElement("div")
  wrap.appendChild(serializer.serializeFragment(content, {document: doc}))
  // ...
}
```

Three load-bearing facts:

1. **The serializer renders into `detachedDoc()`** — a separate `Document` outside the page. Elements there have no inherited styles. Calling `getComputedStyle(el)` on a detached element returns `""` for every non-inline property. **The naive "serialize the slice, then walk the result tree calling getComputedStyle" pattern does not work.**
2. **`view.someProp("clipboardSerializer")` is a custom DOMSerializer slot.** A custom serializer's `serializeFragment(fragment, {document})` is called with the detached `Document`. The serializer can do whatever it wants — including, before returning, walking up to the live `view.dom` tree to read computed styles from the *live* rendered nodes — but this is not the default path and requires the custom serializer to be wired with access to `view`.
3. **`transformCopied: (slice, view) => Slice` runs before serialization with both arguments.** Since `view` is in scope, a transformer can call `view.nodeDOM(pos)` to find the live DOM node for any position in the slice (returns `null` for opaque NodeViews). This live element IS in the page tree, so `getComputedStyle()` returns resolved values. The transformer can then attach computed-style attrs to the slice (or build a style-decorated copy of the slice content) for the downstream serializer to emit as `style=""`.

So **getComputedStyle is conditionally viable**: only via `transformCopied` (slice-decorating) or a custom `clipboardSerializer` that captures `view` in closure and queries live DOM out of band. It is NOT viable as a post-serialization pass because the output DOM is detached.

**Resolution behavior with Tailwind v4 + CSS custom properties.** `getComputedStyle(el).getPropertyValue('color')` on a live element styled with Tailwind utility classes returns the **fully resolved value** — Tailwind's utility classes generate ordinary CSS rules at the selector level, so `bg-blue-500` produces a normal `background-color` declaration that resolves through the cascade like any other. CSS variables likewise resolve: if `bg-primary` is `background-color: var(--color-primary)`, `getComputedStyle().getPropertyValue('background-color')` returns the resolved `rgb(...)` of `--color-primary`'s effective value, NOT the literal `var(...)` reference (per [MDN: getComputedStyle returns "the resolved values of all CSS properties of an element, after applying active stylesheets and resolving any computation those values may contain"](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)). The Tailwind discussion confirming this approach works on `:root` for theme variables: [tailwindlabs/tailwindcss#16612](https://github.com/tailwindlabs/tailwindcss/discussions/16612) — "the documented approach works properly… use `document.documentElement` for `:root` variables."

**Performance.** `getComputedStyle()` forces layout if any pending mutations exist (it's on Paul Irish's [What forces layout/reflow](https://gist.github.com/paulirish/5d52fb081b3570c81e3a) list as a Layout-flushing operation). On a clean tree (no pending mutations between copy event firing and the serializer running, which is the typical case), each call resolves from cached layout in **single-digit microseconds to low-100s of microseconds**, depending on selector complexity and the number of cascaded rules. For a Callout copy emitting ~5 elements (aside + heading + paragraph + maybe icon span + maybe content wrapper), reading 10–15 properties each, total cost is well below a millisecond — imperceptible relative to the copy event budget. The usual perf concern is *layout thrashing in animation loops* via repeated read/write cycles, which doesn't apply here because copy is one-shot and read-only.

**Edge case — Activity-hidden subtree.** Per OK's CLAUDE.md and `worldmodel_tiptap_activity_hidden_destroys_editor` memory, React 19.2's `<Activity mode="hidden">` unmounts the hidden subtree's DOM. **A descriptor inside an Activity-hidden EditorActivityPool entry has no live DOM to query.** This is a real failure mode if the user can somehow trigger copy from a hidden editor, but in practice copy targets the focused/visible editor, so the hidden case is hypothetical for clipboardSerializer. A defensive `nodeDOM === null` check + fallback to a hardcoded palette covers it.

**Edge case — opaque NodeViews.** `view.nodeDOM(pos)` returns `null` "if the node is inside an opaque node view" (per [ProseMirror reference](https://prosemirror.net/docs/ref/)). OK's HtmlDetailsAccordion / Callout descriptors render as NodeViews; whether they're opaque depends on `contentDOM` exposure. For Callout (block descriptor with content), the wrapper is queryable; the content children are within `contentDOM` and individually queryable. Image/iframe-style void nodes ARE opaque — but those don't carry palette-style theme dependencies that drift, so the loss is acceptable.

### 2. React Email's actual approach (2026)

React Email is the dominant React-based email-template library: 19K+ stars on `resend/react-email`, weekly downloads of `@react-email/tailwind` cited at 789K–2.8M (CodeSandbox stats vary by methodology), package version 2.0.6 with [`tailwindcss@4.1.12` as a peer dep](https://www.npmjs.com/package/@react-email/tailwind). **Reading the source directly** ([`packages/react-email/src/components/tailwind/tailwind.tsx`](https://raw.githubusercontent.com/resend/react-email/main/packages/react-email/src/components/tailwind/tailwind.tsx) and `setup-tailwind.ts`):

```typescript
// setup-tailwind.ts (excerpted)
import { compile } from 'tailwindcss';
// ...
const compiler = await compile(baseCss, {
  loadStylesheet, loadModule, polyfills: 0,
});
return {
  addUtilities: (candidates: string[]) => { css = compiler.build(candidates); },
  getStyleSheet: () => parse(css) as StyleSheet,  // css-tree parse
};
```

```tsx
// tailwind.tsx (excerpted)
let mappedChildren = mapReactTree(children, (node) => {
  if (React.isValidElement<EmailElementProps>(node) && node.props.className) {
    const classes = node.props.className.split(/\s+/);
    classesUsed = [...classesUsed, ...classes];
    tailwindSetup.addUtilities(classes);
  }
  return node;
});
const styleSheet = tailwindSetup.getStyleSheet();
const { inlinable: inlinableRules, nonInlinable: nonInlinableRules } =
  extractRulesPerClass(styleSheet, classesUsed);
const customProperties = getCustomProperties(styleSheet);
mappedChildren = mapReactTree(mappedChildren, (node) =>
  cloneElementWithInlinedStyles(node, inlinableRules, nonInlinableRules, customProperties)
);
```

The flow:
1. **First React-tree walk** collects every `className` and feeds it to Tailwind v4's `compile(baseCss).build(candidates)` API — the same `tailwindcss` npm package used in standard builds, called as a JS-runtime function. In v4, `compile()` returns a compiler object whose `build(candidates: string[])` method generates the CSS for that exact candidate set.
2. **css-tree parses** the generated CSS into an AST.
3. **Per-class rule extraction** maps each utility class to its declarations.
4. **CSS-variable resolution** (`getCustomProperties` + `cloneElementWithInlinedStyles`) substitutes `var(--token)` → literal value, because most email clients don't support CSS variables.
5. **Second React-tree walk** clones every element and injects the resolved declarations into `style={{}}` props.
6. Non-inlinable rules (media queries, pseudo-classes) get hoisted to a `<style>` tag injected into `<head>`.

**Crucial nuance: this approach is build-time-ish.** It runs at SSR / `render(<Component />)` time, not in a browser. The package is shipped via `bun run build` of the email template; the result is a static HTML string. **Runtime in-browser Tailwind compilation is NOT what react-email does** — they leverage Tailwind's `compile()` function in Node. Doing the same in-browser at clipboard-copy time would require shipping the Tailwind compiler (~250 KB minified per `jit-browser-tailwindcss` benchmarks, see §5) into the editor bundle.

**Why react-email needs this complexity.** Email clients (Gmail, Outlook, Apple Mail) strip `<style>` blocks and reject CSS variables. React Email solves both at once. **OK's clipboard problem is a strict subset** — Gmail is the same target; Slack/Notion/Linear are more lenient. So react-email's *philosophy* (Tailwind class authoring + inline-on-emit) is exactly right for OK; only the question of WHERE the inlining happens differs. React Email runs it at component-render-time in Node; OK would need it at copy-event-time in the browser.

### 3. Build-process tools survey

For completeness:

- **juice (Automattic).** [github.com/Automattic/juice](https://github.com/Automattic/juice). The canonical CSS-inliner. Walks an HTML+`<style>` document, applies the stylesheet rules to matching elements via the cascade, writes the resolved declarations to `style=""` attributes. Has both Node (`require('juice')`, uses `cheerio` + `node:fs`) and browser entry points (`require('juice/client')` — exposes `juiceDocument`, `inlineDocument`, `inlineContent` only, no file-fetching). Browser bundle is ~150 KB minified+gzipped. **Runtime-usable in browser**, BUT requires you to feed it the full applicable stylesheet — which for a Tailwind-built app is hundreds of KB and not introspectable as a single string at runtime (Tailwind's CSS is generated by the build, lives as a `<style>` element in dev or as a CSS file in prod). You'd need to read all `document.styleSheets` and serialize them to text first.
- **premailer.** Ruby-only, no browser story. Out of scope.
- **mjml.** Markup-to-HTML compiler with a custom XML-ish DSL (`<mj-section>`, etc.). Build-time only. Out of scope for OK because OK isn't authoring with mjml DSL.
- **maizzle.** Tailwind-based email framework. Wraps the Maizzle build pipeline (Tailwind + juice + minifier). Build-time only. Same DSL friction — out of scope.

The build-process category is one-and-done for OK: **only juice is even theoretically usable at clipboard-copy time** (via `juice/client`), and it punts the hard part — getting the relevant stylesheet text — to the caller.

### 4. OSS docs / WYSIWYG editor HTML export survey

Mapping how peer editors handle the same problem:

| Editor | Copy-as-HTML produces | Style strategy | Source |
|---|---|---|---|
| **Lexical (Meta)** | `text/html` via `$generateHtmlFromNodes` → each node's `exportDOM()` returns an HTMLElement | **Inline styles, set explicitly per-node by author of the node class.** No automatic computed-style capture. `$generateDOMFromNodes` returns `container.innerHTML` from a *fresh* `document.createElement('div')` (also detached). | [`packages/lexical-clipboard/src/clipboard.ts`](https://github.com/facebook/lexical/blob/main/packages/lexical-clipboard/src/clipboard.ts), [`packages/lexical-html/src/index.ts`](https://github.com/facebook/lexical/blob/main/packages/lexical-html/src/index.ts) |
| **Lexical** (paste direction, same file) | N/A (this is the import side) | `inlineStylesFromStyleSheets(doc)` walks `doc.styleSheets`, applies each rule's properties to matching elements via `el.style.setProperty()`. **This is for Excel-style imports where styles live in `<style>` tags**, not a copy-emission pattern. Worth noting because OK could use the same idea on the OUTPUT — render the slice, attach a synthesized `<style>` that maps Callout classes to literal colors, then walk-and-inline before clipboard handoff. | (same file as above, `inlineStylesFromStyleSheets` function) |
| **BlockNote** | `text/html` via custom `toExternalHTML` per-block | Author-defined inline `style={{}}` props on the React component returned from `toExternalHTML`. Same model as Lexical — author is responsible. | [BlockNote — Custom Schemas: Custom Styles](https://www.blocknotejs.org/docs/features/custom-schemas/custom-styles), [Export System wiki](https://deepwiki.com/TypeCellOS/BlockNote/6.3-export-system) |
| **Plate (Slate)** | `text/html` via `serializeHtml`, runs server-side via `PlateStatic` | **Mostly class names.** Default behavior strips classes except `slate-*` and `line-clamp` prefixes; preserves data attributes per config. No inline-style automation. | [`platejs.org/docs/html`](https://platejs.org/docs/html), [`docs/serializing-html`](https://v36.platejs.org/docs/serializing-html) |
| **Outline** | Copy-as-markdown (`text/plain`) is the canonical flow; HTML side is PM default | No inline-style augmentation — relies on destination apps to apply their own theme. | (referenced in earlier sections of this report) |
| **Obsidian** ("Copy as HTML" community plugin, [`mvdkwast/obsidian-copy-as-html`](https://github.com/mvdkwast/obsidian-copy-as-html)) | Wraps the rendered content in a complete `<html>` document with an **inline `<style>` block carrying a hand-curated stylesheet**. Plugin source ships a literal `DEFAULT_STYLESHEET` constant covering callouts, code blocks, tables, images-as-data-URIs, etc. | **Hardcoded TS string.** Pure double-maintenance. The plugin author chose this because Obsidian's theme system is too dynamic to query at copy time and the user can override the stylesheet in settings. | `main.ts` lines 50–250 (literal `DEFAULT_STYLESHEET` template string, including `.callout[data-callout="abstract"] .callout-title { background-color: #828ee7; }` and similar for ~10 callout types) |
| **Notion** | `text/html` is rich and class-bearing (Notion's own CSS classes) + `text/markdown` cooperative MIME | Empirical clipboard inspection (per peer reports cited earlier in this document) shows Notion writes class-tagged HTML with a synthesized `<style>` block. Destination apps that strip `<style>` get a degraded render. | (proprietary; verified by clipboard inspection in earlier sections of this report) |
| **Logseq** | Markdown-canonical; HTML side mirrors render-mode HTML | Similar to Obsidian: relies on destination CSS or its own theme tokens. No documented copy-as-styled-HTML feature. | (general docs survey; no source primary-source for this specific feature) |
| **Slate** (the substrate) | Author-implemented per-element `serialize()` returning a string | Whatever the implementer writes — typically inline styles for portability. | [Slate docs: Serializing](https://docs.slatejs.org/concepts/10-serializing) |

**The pattern across the ecosystem is consistent: peer editors do NOT runtime-compile their styling system at copy time.** Two strategies dominate:

1. **Author-written inline styles per node class** (Lexical, BlockNote). The descriptor's exportDOM/toExternalHTML method writes `style={{}}` props by hand. **This is Pattern Y (shared style-token module) — the duplication is real, but localized to the descriptor's two render functions.**
2. **Hardcoded stylesheet shipped alongside the editor** (Obsidian Copy as HTML plugin). Same problem from a different angle.

**No surveyed editor uses runtime `getComputedStyle()` against the live editor DOM as a copy-emission strategy.** That doesn't mean it's a bad idea — it means it's untrod ground. The reasons no peer does it: most editor copy paths run server-side (Plate static rendering, react-email at SSR, BlockNote's `toExternalHTML` rendered "in a separate React root") where there is no live editor DOM to query.

### 5. Tailwind-runtime feasibility (zero-build options in 2026)

Two candidates exist; both have caveats:

**Twind (`tw-in-js/twind`).** 3.9K stars, [github.com/tw-in-js/twind](https://github.com/tw-in-js/twind). The GitHub commit log shows **only chore commits ("update sponsors images") since approximately Q4 2024**. Last substantive release on npm is from late 2023. Issue tracker has 14 open issues. The library still works — Twind is a runtime tailwind-in-JS solution where you call `tw('bg-blue-500 px-4')` and it generates+injects the CSS, returning a class name. The exposed `getCSS()` / `extract()` APIs let you read the generated CSS string after the fact — which means you could feed it to juice or to your own per-class extraction. **Verdict: usable, but maintenance-stalled.** Not Tailwind-v4-spec-tracking. If OK adopts Twind, OK has to author Callout styling in Twind's syntax separately from the rest of the app's Tailwind v4 styling — which IS double maintenance.

**`jit-browser-tailwindcss` ([mhsdesign/jit-browser-tailwindcss](https://github.com/mhsdesign/jit-browser-tailwindcss)).** Last release December 2024, status "Still in Development." References Tailwind v3.1.8, **does not yet support v4**. Bundle size 246 KB minified / 74 KB gzipped. Provides `createTailwindcss({ tailwindConfig })` with `.generateStylesFromContent(css, html)` that takes raw CSS + HTML strings and returns the JIT-generated CSS. Could be used in-browser at copy time, but at the cost of bundling 74 KB of compiler into the editor.

**Tailwind v4 official `compile()` API ([tailwindlabs/tailwindcss#15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881)).** Importable from the `tailwindcss` package as `compile(baseCss, opts)`. Returns `{ build(candidates: string[]) => css }`. **Not officially documented for browser use.** Requires `@tailwindcss/node` for full functionality. The PostCSS-based runtime path is broken in v4. React Email uses this API server-side (see §2 — `import { compile } from 'tailwindcss'` in their `setup-tailwind.ts`). Whether it bundles cleanly for the browser is undocumented and likely fragile across point releases ("the APIs are undocumented and can change without notice").

**Verdict on runtime Tailwind compilation in-browser at copy time:** **structurally possible but unattractive.** Twind is stale, jit-browser is v3, official v4 `compile()` is undocumented in-browser. All three add 50–250 KB to the bundle for a feature that fires on copy events. Compared to the alternative — the live page already has the resolved CSS *because the user is looking at it* — bundling a second compiler purely to re-derive the same values is wasteful. The interesting use of Tailwind's `compile()` is React Email's: do it once at build-time per Callout type and ship the resulting hex/rgb literals as a TS module (Pattern Y — see §6).

### 6. Recommendation for OK's stack

The four candidate patterns from the user's prompt:

- **Pattern X — `getComputedStyle` at copy time, via `transformCopied` or a custom `clipboardSerializer` that captures `view`.** Zero double-maintenance. Reads the same DOM the user is looking at. No build process, no runtime Tailwind compiler, no shipped palette to drift.
- **Pattern Y — shared style-token TS module.** Single source of truth as a JS object literal; both the live React component AND `toClipboardHast` consume it. Lexical's exportDOM convention. BlockNote's toExternalHTML convention. The Obsidian plugin's stylesheet-as-string. Real but bounded duplication: the React component writes Tailwind classes referencing `--color-X`, and the TS module writes the resolved hex values for the SAME `--color-X`. Drift class: any Callout color change must be done in BOTH places.
- **Pattern Z — react-email-style server-side render.** `renderToStaticMarkup(<DescriptorEmailComponent />)` with the React Email Tailwind compiler producing inline-styled HTML, called at copy time. Bundles a heavy server-runtime feature into the browser. The cost — bundling Tailwind's compiler + css-tree + React Email's tree-mapping logic into the editor — is large (likely >500 KB unminified after react-email's deps) and aggressive bundle-size erosion for a feature that fires on Cmd+C.
- **Pattern W — runtime Tailwind in-browser** (Twind / jit-browser / undocumented v4 `compile()`). Maintenance and bundle-size signals all unfavorable per §5.

**Primary recommendation: Pattern X (getComputedStyle at copy time), with Pattern Y as a small fallback palette.**

The mechanism — implementation sketch grounded in the primary-source clipboard.ts contract:

```typescript
// In editorProps:
clipboardSerializer: createStyleResolvingSerializer(view, /* MarkdownManager etc. */)

function createStyleResolvingSerializer(view: EditorView, deps: Deps): DOMSerializer {
  const baseSerializer = DOMSerializer.fromSchema(view.state.schema);
  return {
    serializeFragment(fragment, options) {
      const detachedRoot = baseSerializer.serializeFragment(fragment, options);
      // Walk fragment and detached output in parallel, where each PM node has a
      // recorded position in the original slice. For descriptors that opt-in
      // (Callout, future palette-bound blocks), look up the live node:
      //   const liveEl = view.nodeDOM(originalPos);  // null if opaque
      //   if (liveEl) writeResolvedStylesTo(detachedEl, liveEl);
      return detachedRoot;
    }
  };
}

function writeResolvedStylesTo(detached: HTMLElement, live: Element) {
  const computed = getComputedStyle(live);
  const props = ['background-color', 'color', 'border-left', 'border-color', 'padding', /* ... */];
  for (const p of props) {
    const v = computed.getPropertyValue(p);
    if (v) detached.style.setProperty(p, v);
  }
}
```

**Why this wins for OK specifically:**

1. **OK already runs a Hocuspocus + Vite dev server with a live React editor. The user IS looking at a styled DOM at copy time.** This is the exact precondition the peer editors don't have (Plate ssr, react-email Node-render). OK should use it.
2. **No build step, no bundle cost, no third-party runtime CSS engine.** The browser already does the work. Reading 10–20 properties per descriptor is sub-millisecond.
3. **Theme drift is auto-tracked.** When `globals.css` changes `--color-callout-tip` from `#4493f8` to `#5BA0FF`, the clipboard output changes the same day with zero TS diffs.
4. **Pattern Y as the fallback palette** — kept tiny, used only when `view.nodeDOM(pos) === null` (opaque NodeView, dead provider, hidden Activity descriptor). Hardcoded `#4493f8`-style values that approximate the live theme; drift here is acceptable because the path is the rare-edge fallback, not the hot path.
5. **Symmetric with the existing OK clipboard architecture.** OK already wires a custom `clipboardTextSerializer` (per Track A in the existing parts of this report) and a `MarkdownManager` for the text/plain side. Adding a custom `clipboardSerializer` for the text/html side is the same shape of hook on the same `editorProps` — minimal architectural surprise.
6. **Maps cleanly to OK's CRDT-component contract.** The descriptor's React render and its clipboard hast emission are decoupled by the React component being the source of styled DOM that getComputedStyle reads. The descriptor author writes ONE styling implementation (Tailwind classes on the React tree), and the clipboard side reads it.

**What Pattern X does NOT do:**

- Doesn't help non-DOM emission (e.g. the `text/markdown` side, the source-mode CodeMirror copy). Those continue to use `MarkdownManager.serialize()` per the existing report.
- Doesn't capture pseudo-elements (`::before`, `::after`) automatically — `getComputedStyle(el, '::before')` is needed for those, and the result is not a real DOM node so it can't be inlined as-is. Callout icons set via `::before` would need the icon to either be a real child element OR be encoded in the fallback palette. Easier: ship the icon as a real `<span>` child in the React render, problem solved structurally.
- Doesn't capture `@media (prefers-color-scheme: dark)` choices — getComputedStyle gives you WHAT the user is currently seeing, which is what you want anyway. If the user is in dark mode, the dark-mode colors get inlined; the destination app sees dark-mode-styled output. Clean.
- Doesn't handle inheritance for unset properties on container elements (e.g. an aside whose color is inherited from `body`). For a Callout where the `aside` itself sets `background-color`, this isn't a problem; for nested elements that rely on inheritance, you'd need to walk parents OR copy the resolved value down the tree. For Callout specifically, set the explicit colors on the wrapper (which is the typical Tailwind utility class anyway).

**Pattern Y (shared style-token module) as a reasonable second choice if Pattern X is rejected.** The cost is one-time-per-descriptor double-maintenance: a `callout-styles.ts` module exporting `{ tip: { borderLeft: '4px solid #4493f8', ... }, success: { ... } }`, consumed by both the React component (for `style={callout.tip}` instead of Tailwind classes — losing some authoring ergonomics) AND `toClipboardHast`. This is what Lexical and BlockNote effectively do, mediated by their per-node export functions. The drift cost is bounded but real — every theme change is a 2-file edit.

**Pattern Z (react-email-style at copy time) is over-engineered for OK.** The Tailwind v4 `compile()` + css-tree + React tree-walk pipeline is built for the case where you HAVE no live DOM (server-side email rendering). OK does have a live DOM. Bundling react-email's solution into the editor is paying the cost of solving a problem OK doesn't have.

**Pattern W (runtime Tailwind in-browser) is dominated** by Pattern X for OK's case: equal correctness, larger bundle, larger maintenance surface, and stalled upstream signals (Twind, jit-browser).

### Genuinely surprising findings

- **ProseMirror serializes from a Slice into a *detached* document by default.** This is the load-bearing fact that determines which patterns work. The naive "render then walk and getComputedStyle" doesn't work on the output; you have to query the LIVE editor DOM via `view.nodeDOM(pos)` BEFORE or DURING serialization. The detachedDoc choice is intentional in PM (avoids style-pollution into the editor's own page) but it forces this architecture.
- **No surveyed editor uses runtime getComputedStyle for cross-app HTML emission.** The peer convention is hardcoded inline styles per node-class (Lexical, BlockNote) or hardcoded stylesheet-as-string (Obsidian copy-as-html plugin). This is partly because most peers run their export server-side. OK's all-in-browser editor + live-preview model means OK can do something the peers can't easily do — and it's actually simpler than what they do.
- **React Email runs Tailwind v4's `compile()` at component-render time on the server**, not in any sense "build-time-only" — it's runtime-in-Node. This is closer to OK's potential pattern than the marketing language ("Tailwind for emails") suggests. The reason React Email doesn't run it in the browser is they don't have a live React DOM to query at email-template-emit time; they're rendering FROM scratch. OK is rendering AT copy time, with the live DOM right there.
- **Twind appears to be in maintenance hibernation** — every commit since at least November 2024 is a `chore: update sponsors images` automated commit. The library is functional but not advancing with Tailwind v4. Adopting it for a long-lived feature is a maintenance bet against the upstream.
- **Lexical's `inlineStylesFromStyleSheets` (in `@lexical/html`) is for the IMPORT direction** — converting Excel-style class-keyed `<style>` blocks into inline styles before parsing. Not for export. But the algorithm is reusable in either direction; OK could use the same idea (feed it a synthetic `<style>` block scoped to the Callout's classes after detached-serialization, then read the result) as an alternative to the `view.nodeDOM` path. This would be Pattern Y'-with-a-twist: ship a curated mini-stylesheet for descriptors and apply it via a Lexical-style sheet-walking pass.

## 2026-04-30 Live-DOM walker for cross-app HTML emission — prior art and gotchas

**Triggered by:** OK clipboard spec ([`specs/2026-04-29-clipboard-component-contract-and-byte-preservation/SPEC.md`](../../specs/2026-04-29-clipboard-component-contract-and-byte-preservation/SPEC.md)) considering a generic walker pattern for cross-app `text/html` emission — instead of per-descriptor `toClipboardHast` methods, walk live DOM + cloned DOM in parallel, snapshot computed styles, inline. Want primary-source-grounded confirmation that this is sound before redesigning around it.

**Method:** Primary-source reads of [bubkoo/html-to-image source](https://github.com/bubkoo/html-to-image) (`clone-node.ts`, `clone-pseudos.ts`, `apply-style.ts`); [tsayen/dom-to-image README](https://github.com/tsayen/dom-to-image); [niklasvh/html2canvas](https://github.com/niklasvh/html2canvas); [lukehorvat/computed-style-to-inline-style](https://github.com/lukehorvat/computed-style-to-inline-style); [Automattic/juice](https://github.com/Automattic/juice) (`/client` browser bundle, `inlinePseudoElements` option); ProseMirror primary sources ([`prosemirror-view/src/clipboard.ts`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/clipboard.ts), [discuss.prosemirror — transformCopied PR](https://discuss.prosemirror.net/t/a-transformcopied-pr/4892)); browser perf primary sources ([Paul Irish — what forces layout/reflow](https://gist.github.com/paulirish/5d52fb081b3570c81e3a), [webperf.tips — layout thrashing](https://webperf.tips/tip/layout-thrashing/), MDN `getComputedStyle` reference, jsdom issue #3234 perf data); empirical clipboard inspection of [Google Docs](https://adamcoster.com/blog/google-docs-copied-html-jank), Notion, Office Online ([Microsoft Support](https://support.microsoft.com/en-us/office/copy-and-paste-in-office-for-the-web-682704da-8360-464c-9a26-ff44abf4c4fe), [TinyMCE blog](https://www.tiny.cloud/blog/copy-and-paste-from-word-excel/)); Chrome extension ecosystem ([Copy HTML with CSS](https://github.com/michalgrzyska/copy-html-with-styles), CSS+HTML, cssPicker, CopyCss); email-client compat via [caniemail.com](https://www.caniemail.com/); Quill editor ([slab/quill issue #2190](https://github.com/slab/quill/issues/2190)); 1P codebase audit (`packages/app/src/editor/components/`, `packages/app/src/globals.css`, `packages/app/package.json`).

Evidence file: [evidence/live-dom-walker-prior-art-and-gotchas.md](evidence/live-dom-walker-prior-art-and-gotchas.md).

### 1. Prior art

The "live DOM walker + getComputedStyle inline" pattern is **mature library territory** — multi-year deployment across general-purpose tools, no novelty:

| Tool | What it does | Pseudo-element strategy | Source-confirmed mechanism |
|---|---|---|---|
| **html-to-image** (bubkoo, ~7K weekly DL) | Clones live DOM recursively, computes styles per cloned node by holding live ref, applies inline; wraps result in SVG `<foreignObject>` for image conversion | `getComputedStyle(nativeNode, ':before' \| ':after')` → reads `content` → if non-empty, generates UUID class + injects `<style>` rule | [`src/clone-node.ts`](https://github.com/bubkoo/html-to-image/blob/master/src/clone-node.ts), [`src/clone-pseudos.ts`](https://github.com/bubkoo/html-to-image/blob/master/src/clone-pseudos.ts) |
| **dom-to-image** (tsayen) | Same algorithm — "Compute the style for the node and each sub-node and copy it to corresponding clone" (verbatim from README) | "Pseudo-elements not cloned in any way; deliberately recreated" | [README.md](https://github.com/tsayen/dom-to-image/blob/master/README.md) |
| **dom-to-image-more** (MakerPM fork) | Same pattern, more maintained | Inherits from upstream | [npm](https://www.npmjs.com/package/dom-to-image-more) |
| **html2canvas** (niklasvh, ~3M weekly DL) | Walks DOM via `getComputedStyle()` per element, paints onto canvas via 2D API | Limited — pseudo-elements only when actually visible | [GitHub](https://github.com/niklasvh/html2canvas) |
| **computed-style-to-inline-style** (lukehorvat) | Library whose ENTIRE PURPOSE is exactly this pattern — "iterates through the computed style properties of element and redefines them as inline styles" via `Window.getComputedStyle` | None | [GitHub](https://github.com/lukehorvat/computed-style-to-inline-style) |
| **juice/client** (Automattic) | Browser-bundle of juice; takes `inlinePseudoElements: true` option which "may modify the DOM and conflict with CSS selectors" — explicitly flags pseudo-element handling as a known hard problem | Inserts pseudo-elements as `<span>` elements (DOM-mutating, not portable) | [GitHub](https://github.com/Automattic/juice) |
| **Chrome extension "Copy HTML with CSS"** (michalgrzyska) | DevTools sidebar that copies "selected element's HTML along with its computed CSS as inline styles" — the proposed pattern, productized as a standalone tool | Not documented | [GitHub](https://github.com/michalgrzyska/copy-html-with-styles), [Chrome Web Store listing](https://chromewebstore.google.com/detail/copy-html-with-css/gnggpgdicelimbccdogldneglninidhb) |
| **CSS+HTML / cssPicker / CopyCss / DivMagic** (multiple Chrome extensions) | Same use case — extract HTML element + computed styles as inline | Varies | [Chrome Web Store ecosystem](https://chromewebstore.google.com/detail/csspicker-copy-css-from-w/laooinkgdapbcbjchpmihliljfnakkdh) |
| **Quill editor (`slab/quill`)** | Uses `getComputedStyle` in `isLine` clipboard-detection function; not a copy-emission walker but confirms PM-adjacent editors leverage the API | N/A | [issue #2190](https://github.com/slab/quill/issues/2190) (the PR fixed cross-browser parity in 2.0) |

**Editor clipboards that emit inline-styled HTML for cross-app paste** (without using the live-DOM walker — using author-written inline styles per node):

- **Lexical** (Meta): `$generateHtmlFromNodes` calls each node class's `exportDOM()`, which the author writes with explicit inline styles. No automatic getComputedStyle. ([Source](https://github.com/facebook/lexical/blob/main/packages/lexical-html/src/index.ts))
- **BlockNote**: `toExternalHTML` per-block, author writes `style={{}}` props. ([Docs](https://www.blocknotejs.org/docs/features/custom-schemas/custom-styles))
- **Plate (Slate)**: mostly class names; `serializeHtml` runs server-side; no automatic style capture. ([Docs](https://platejs.org/docs/html))
- **Obsidian "Copy as HTML" plugin**: ships a hardcoded `DEFAULT_STYLESHEET` literal string. ([Source](https://github.com/mvdkwast/obsidian-copy-as-html))

**Empirical clipboard inspection — what the giants emit for cross-app paste:**

- **Google Docs**: HTML with **inline styles on every span**, including the `<b style="font-weight:normal">` wrapper trick to defeat editors that strip inline styles. Per [Adam Coster's analysis](https://adamcoster.com/blog/google-docs-copied-html-jank).
- **Notion**: HTML with inline styles for formatting (e.g. `<span style="font-weight:bold">`).
- **Microsoft Office Online**: HTML with inline-style-rich content; some destination editors parse `<style>` from the head and merge inline before pasting (per [TinyMCE blog](https://www.tiny.cloud/blog/copy-and-paste-from-word-excel/)).

**Verdict on prior art:** Inline-styled HTML is the universal lingua franca for rich cross-app paste. The live-DOM walker + getComputedStyle is a well-trodden algorithm in the image-conversion library category (html-to-image, dom-to-image, html2canvas), used by Chrome extensions in the user's exact pattern, and absent from peer rich-text editors only because they run their export server-side or rely on author-written inline styles. **OK doing the walker for clipboard is novel for the editor category but mature for the broader ecosystem.**

### 2. Gotchas (a-z dimensions)

Adversarial pass over the user's enumerated dimensions:

| Dim | Question | Verdict | Severity for OK | Mitigation |
|---|---|---|---|---|
| **a** | Pseudo-elements (`::before`, `::after`) | **Real bite.** `cloneNode` does NOT copy them. `getComputedStyle(el, '::before')` extracts styles but returns no DOM node. html-to-image synthesizes `<style>` rules with UUID classes — but Gmail strips `<style>`. | **HIGH** — Callout collapsible chevron, Accordion chevron, jsx-component-wrapper hover-zone + selection-halo all use `::before`/`::after` (`globals.css:1527, 1561, 1747, 1822`). Pure walker LOSES THE CHEVRON. | (i) Replace pseudo-element-rendered VISIBLE content with real child elements in React (per the existing 2026-04-30 section's prescription); (ii) For invisible editor-chrome pseudo-elements (jsx-component-wrapper hover-zone, selection-halo), the walker must SKIP them or filter by class — they're editor-only and shouldn't reach clipboard regardless. |
| **b** | Pseudo-class state (`:hover`, `:focus`, `:has()`, `:is()`) | The current state at copy-event time is captured. Hover-state-baked inline styles are likely if user mouses over selection while hitting Cmd+C. | LOW — OK uses `[data-selected="true"]` not `:hover` for editor chrome. Mark/text styling doesn't depend on `:hover`. | None needed unless a future descriptor uses `:hover` for visible (non-affordance) styling. |
| **c** | CSS animations / transitions | Current frame's computed values captured; animation state lost. | NEGLIGIBLE — clipboard output is static; nobody expects clipboard HTML to animate. | None. |
| **d** | CSS variables (`var()`) | Per MDN, resolved to literal values at `getComputedStyle` time. Confirmed in existing 2026-04-30 viability section. Tailwind v4 `--color-*` tokens resolve correctly. | NEGLIGIBLE | None. |
| **e** | Specificity of inline styles in destination | Inline styles have specificity (1,0,0,0); they DOMINATE destination CSS. This is what every rich-text editor does (Google Docs, Notion, Office Online). User can paste-without-formatting (Cmd+Shift+V) for the destination's typography. | LOW — design choice, matches industry practice. | Document for users; offer parallel `text/markdown` MIME for destinations that prefer plain. |
| **f** | CORS / cross-origin stylesheets | `getComputedStyle` works regardless of stylesheet origin. (`cssText` on stylesheet rules IS CORS-restricted, but the walker doesn't use that path.) | NEGLIGIBLE | None. |
| **g** | Forced reflow / layout thrashing | A pure-read pass on a clean tree does NOT thrash. First read costs a layout flush (~1-5ms); subsequent reads hit cached layout (~50µs each). Per [webperf.tips](https://webperf.tips/tip/layout-thrashing/), thrashing requires read-write-read interleave. | LOW | Walker is read-only by design. Don't interleave with DOM mutations. |
| **h** | Image URLs (http/blob/data) | `<img src="https://...">` survives. `<img src="blob:...">` is DEAD on paste (destination can't access). `<img src="data:...">` — large; some clients strip; Outlook OK. | LOW for OK — `safe-navigation-url.ts` already rejects `blob:` and `data:` at authoring boundary, so user-authored URLs are http(s)://. Future: agent-uploaded images via `URL.createObjectURL` would need to be persisted to a remote URL before clipboard emission. | Persist any in-flight blob URLs server-side before clipboard emission. (Already an architectural concern beyond the walker.) |
| **i** | Detached document timing | PM's `serializeForClipboard` renders into `detachedDoc()`. The walker MUST query LIVE DOM via `view.nodeDOM(pos)`, NOT the serializer output. (Existing 2026-04-30 viability section confirmed this.) | N/A — implementation contract | Walker must capture `view` in closure; query live nodes via `view.nodeDOM(pos)`. |
| **j** | Iframe / shadow DOM pierce | `getComputedStyle` doesn't pierce shadow DOM. Confirmed via [jsdom issue #3278](https://github.com/jsdom/jsdom/issues/3278). | NEGLIGIBLE for OK — codebase audit confirms NO descriptor uses shadow DOM or iframes (Image uses `react-medium-image-zoom` which renders into a portal at body, not shadow). | If a future descriptor introduces shadow DOM, walker needs to recurse into `el.shadowRoot.querySelectorAll('*')`. |
| **k** | Web components | None in OK. | NEGLIGIBLE | None. |
| **l** | Partial selection | PM's slice carries position offsets. `view.nodeDOM(pos)` returns the containing block; clipboard HTML carries the partial textContent inside the styled block. Structurally correct. | NEGLIGIBLE | None. |
| **m** | Computed-style serialization size + non-email-safe forms | `style.cssText` of full computed styles is ~100+ properties. Need to filter to email-safe property allowlist (color, background, border, padding, margin, font-*, line-height, text-*). Browser may emit `display: -webkit-flex` instead of `display: flex` (vendor-prefix in computed values). | MEDIUM — bloat is real (~150-300 bytes per element), and vendor prefixes can confuse legacy clients. | Maintain a curated property allowlist; post-process to strip vendor prefixes (or accept them, since modern browsers ignore unknown). |
| **n** | Email-client-specific quirks (Outlook, Gmail, Apple Mail) | Outlook desktop's Word HTML engine ignores `flex`, `grid`, `var()`, `calc()`, modern color functions REGARDLESS of inline-or-not. Gmail strips `<style>` blocks but accepts inline. Apple Mail respects most modern CSS. Per [caniemail.com](https://www.caniemail.com/). | MEDIUM — OK uses `oklch()` extensively for callout colors (`globals.css:1657-1669`); Outlook would render colors as default text color. | (i) Document Outlook as best-effort; (ii) optional `oklch() → rgb()` conversion in walker post-pass. |
| **o** | Copying from Activity-hidden subtree | React 19.2 `<Activity mode="hidden">` UNMOUNTS hidden subtree. `view.nodeDOM(pos)` returns null. | LOW — copy targets the focused/visible editor in normal usage; cross-editor keyboard copy is the edge case. | Defensive null check + Pattern Y fallback (hardcoded palette per descriptor) for the rare edge. |
| **p** | Marks vs nodes | Marks render as inline DOM elements (`<strong>`, `<em>`) — natural elements in the cloned tree. The walker visits them like any other element. No special-casing required. | NEGLIGIBLE | None. |
| **q** | `cloneNode(true)` detaches event handlers / React state | Per [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode): clones attributes incl. inline listeners, NOT addEventListener listeners. Static export is fine. | NEGLIGIBLE | None. Strip editor-only `data-*` attrs (`data-selected`, `data-dragging`) before clipboard handoff. |
| **r** | Font loading state | If a custom font hasn't loaded by copy time, computed value returns the fallback. | NEGLIGIBLE | None. |
| **s** | Pseudo-element `content: "..."` (decorative text) | LOST without explicit synthesis (UUID-class + `<style>` injection per html-to-image's algorithm). | HIGH for OK — Callout chevron is `content: ""` with `border-left:` triangle (no text content but a visible triangular element); same shape problem. | Replace with real `<span>` icon child. |
| **t** | Storage / payload size | ~150-300 bytes per element × ~5-200 elements = ~1-60KB typical paste. Well under any clipboard limit; may bloat under-50KB-budget destinations (rare). | LOW | None unless a destination flags size issues. |
| **u** | Selection round-trip OK→OK paste | Branch C dispatcher detects `data-pm-slice`, parses via PM, ignores inline styles. Cross-app→OK ignores the same. | NEGLIGIBLE — already covered in earlier sections of this report. | None. |
| **v** | WCAG / a11y | Inline styles don't break a11y; loss of semantic class hooks is minor for AT users. | LOW | None. |
| **w** | Tailwind v4 specifics (`@theme`, layers) | Compiles to ordinary CSS at build time. `getComputedStyle` resolves through normally. | NEGLIGIBLE | None. |
| **x** | DOM mutation during serialization | `cloneNode + getComputedStyle` is read-only. Defensively, walker should NOT touch the live tree. | NEGLIGIBLE | None — by construction. |
| **y** | `content-visibility: auto` | Defers rendering; computed style still resolves but may force layout to read. | NEGLIGIBLE for OK — doesn't use this property. | None. |
| **z** | Locale / RTL / line-break | `direction`, `writing-mode`, `text-align` all captured as computed values. | NEGLIGIBLE | None. |

**Real top-5 gotchas for OK** (collapsing the matrix):

1. **Pseudo-elements lost — Callout/Accordion chevrons disappear** unless replaced with real DOM children OR walker uses html-to-image's `<style>` injection (which Gmail strips). [Dim a + s]
2. **`oklch()` colors in Outlook desktop** render as default text color. May or may not matter depending on Outlook's place in OK's destination matrix. [Dim n]
3. **Editor-chrome pseudo-elements (selection halo, hover hit-zone) leak to clipboard** unless filtered. They'd emit invisible-but-payload-bloating elements with `position: absolute; z-index: 9` styling that destinations would render as visible artifacts. [Dim a]
4. **Activity-hidden subtree has no live DOM** — defensive fallback to a hardcoded palette is required. [Dim o]
5. **Vendor-prefixed computed values** (`-webkit-flex`) may bloat output and confuse legacy destinations; allowlist filtering needed. [Dim m]

### 3. Performance estimate

Numerical estimate for OK's typical paste size — grounded in primary-source perf data:

**Per-call costs** (cited from MDN, Paul Irish gist, jsdom issue #3234, real-browser measurements):
- `cloneNode(true)`: 0.01–0.05ms per element
- `getComputedStyle(el)` on clean tree: returns object cheaply; `.getPropertyValue('color')` for non-layout property: 0.01–0.1ms (cache hit) to 1ms (cache miss + layout)
- `getComputedStyle(el, '::before')`: same magnitude
- `style.cssText` write: trivial

**Selection sizes:**

| Selection | Elements | Walker pass time (est) |
|---|---|---|
| Single Callout (5 elements: aside + heading + paragraph + icon span + content wrapper) | 5 | 1–3ms |
| Few paragraphs with marks (10-20 elements) | 10–20 | 3–8ms |
| Section with multiple Callouts (50 elements) | 50 | 10–25ms |
| Full doc copy (Cmd+A on a long doc) | 100–500 | 30–150ms |

**Critical comparison vs. OK's stated budgets:**
- Copy event budget: <100ms (per spec)
- Paste event budget: <250ms (per spec)
- Worst-case 500-element walker: ~150ms — **fits within copy budget**, but tight. Real-world copies are typically <100 elements; the budget is comfortable.
- Cache misses (full layout flush on first read) add ~5ms of constant overhead.

**Verdict:** The walker is **NOT a perf concern for typical OK paste sizes**. Worst-case full-doc copy on a 500-element document approaches the copy budget; mitigation if needed is to short-circuit to a Pattern Y fallback for very large slices (>200 elements). For 99% of paste operations (single block to a few paragraphs), the walker completes in <10ms — invisible to the user.

### 4. Security

Per-attack-surface verification:

- **`<script>` injection.** React only renders `<script>` via `dangerouslySetInnerHTML`. OK descriptors don't use this. Walker clones existing DOM, doesn't introduce new scripts. **Safe.**
- **Iframe `<iframe src>`.** Cloned with src intact. Destination's CSP enforces. OK doesn't render iframes from descriptors (Video.tsx comment confirms iframe-embedding is left to user's raw-HTML MDX path); future iframe-bearing descriptors would need explicit src-allowlist. **Safe by current scope.**
- **`javascript:` URL sanitization.** OK's `safe-navigation-url.ts` rejects `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`, `ws:` at the authoring boundary. Live DOM never holds unsafe URLs. Walker copies whatever React rendered — already-sanitized. **Safe.**
- **`url()` in computed styles.** `background-image: url('https://...')` inlines fine; `url('blob:...')` would but is blocked at authoring boundary (and would be dead on paste anyway).
- **Cross-origin styles.** `getComputedStyle` works regardless of stylesheet origin (no CORS leak). **Safe.**
- **HTML-injection from getComputedStyle output.** Computed values are well-formed CSS; no injection vector via `style.cssText`. **Safe.**

No new security surface from the walker pattern beyond what OK already secures at the authoring/sanitization boundary.

### 5. OK-codebase-specific edge cases

Verified against the codebase:

- **`Callout.tsx` collapsible chevron** uses `::before` pseudo-element (`globals.css:1747`) with `border-left: 6px solid var(--callout-type-color)` to render the visible triangle. **The walker would lose the chevron.** Fix: render an actual `<span>` (or lucide icon) inside `<summary>` for the chevron, with CSS rotation on `[open]`. Same for Accordion (`globals.css:1822`).
- **`jsx-component-wrapper`** uses `::before` (invisible hover hit-zone, `globals.css:1527`) and `::after` (selection halo, `globals.css:1561`). **Both are editor-only chrome that should NOT propagate to clipboard.** The walker must filter `.jsx-component-wrapper` (or descend through it without inlining its pseudo-element styles). Editor-side data attributes (`data-selected`, `data-dragging`, `data-has-child-selected`) similarly must be stripped from cloned nodes before clipboard handoff.
- **`Image.tsx`** wraps `<img>` in `react-medium-image-zoom`'s `<Zoom wrapElement="span">`. The Zoom component doesn't use shadow DOM — it renders into a body-portal when the modal opens; the underlying `<img>` stays in the editor tree. Walker reads `<img>` plain. URL is whatever `props.src` was authored as — http(s):// only (sanitized at boundary). **Safe.**
- **`Audio.tsx` / `Video.tsx`** are plain HTML5 elements (`<audio>` / `<video>`). No shadow DOM. URLs sanitized. **Safe.**
- **No descriptor uses iframes.** Confirmed via `grep -rn "<iframe" packages/app/src/editor/components/` — only a comment in `Video.tsx` about user-authored iframes for YouTube/Vimeo embeds.
- **No descriptor uses CSS animations / transitions for visible state.** Animations are on `[open]` chevron rotation (`@media (prefers-reduced-motion: no-preference)` gated) and the selection-halo opacity fade. Both are editor-affordance state.
- **Tailwind v4.2.2** is used with `@theme {}` (`globals.css:102`) and `@theme inline {}` (`globals.css:1364`) directives. Both compile to ordinary CSS custom properties. `getComputedStyle` resolves them correctly per the existing 2026-04-30 viability section.
- **`oklch()` color functions** are used extensively for callout type colors (`globals.css:1657-1669`). When `getComputedStyle` reads them, the exact behavior — whether Chrome preserves `oklch(...)` notation in computed values or converts to `rgb(...)` — needs empirical confirmation. Either way, modern destinations (Apple Mail, modern browsers, Notion) handle both; Outlook desktop handles neither.

### 6. Verdict

**Strengths of the generic walker pattern:**

1. **Mature library territory** — html-to-image, dom-to-image, html2canvas, computed-style-to-inline-style, multiple Chrome extensions — multi-year deployment, well-understood algorithm.
2. **Single source of truth** by construction — whatever React rendered + whatever CSS resolved is the clipboard output. Theme drift is auto-tracked.
3. **No build step, no runtime CSS engine, no per-descriptor opt-in** in the basic case.
4. **Performance fits OK's budgets** with comfortable margin for typical pastes (<10ms for <50 elements; <150ms worst-case full doc).
5. **Marks (inline formatting) flow naturally** through the walker without special-casing.
6. **Industry-standard output format** — inline-styled HTML is what Google Docs, Notion, Office Online emit.
7. **Security-clean** by construction — walker is read-only, no new attack surface.

**Real risks (in priority order):**

1. **Pseudo-element loss is the load-bearing risk for OK.** Callout/Accordion chevrons are CRITICAL to descriptor identity in pasted output. The chevron-as-pseudo-element pattern was an authoring convenience that the clipboard architecture cannot preserve cleanly. **Action:** before adopting the generic walker, refactor Callout collapsible + Accordion to render the chevron as an actual lucide icon (`<ChevronRight>`) with CSS rotation on `[open]`. This is a one-time, bounded refactor (~50 LoC across Callout.tsx + Accordion.tsx + ~30 lines of globals.css).
2. **Editor-chrome pseudo-elements leak unless filtered.** The walker must strip `.jsx-component-wrapper`'s pseudo-element synthesis and editor `data-*` attributes before clipboard handoff. **Action:** define a "clipboard-export filter" (allowlisted classes / blocklisted attrs) at the walker boundary.
3. **`oklch()` in Outlook desktop renders as default color.** Documentable best-effort behavior. **Optional mitigation:** post-pass to convert resolved `oklch()` → `rgb()` when serialized.
4. **Activity-hidden subtree has no live DOM.** Defensive null check + fallback palette. **Action:** keep Pattern Y as a reserved fallback (already covered in existing 2026-04-30 section).
5. **Vendor-prefixed computed values bloat output.** **Action:** maintain an email-safe property allowlist; strip vendor prefixes in post-pass.

**Showstoppers? None.** The walker is sound for OK's use case provided two non-trivial refactors:
- Replace pseudo-element-rendered visible content with real DOM elements (one-time).
- Define a clipboard-export filter to suppress editor chrome (`.jsx-component-wrapper` `::before`/`::after`, editor `data-*` attrs).

**Recommended adoption path:**

1. **Lock the contract for descriptor authors:** "Visible content rendered via `::before`/`::after` is incompatible with clipboard emission. Use real DOM elements (lucide icons, `<span>`s) and set CSS state via attributes (`[open]`, `[data-state=...]`)."
2. **Refactor Callout collapsible chevron and Accordion chevron** to use real `<ChevronRight>` lucide icons with CSS rotation. Revisit `globals.css:1747` and `1822` after.
3. **Define the walker's allowlist + blocklist** in code (e.g. `clipboard-walker.ts`):
   - Allowlisted CSS properties: `color, background-color, background-image, border, border-*, padding, padding-*, margin, margin-*, font-family, font-size, font-weight, font-style, text-decoration, text-align, line-height, list-style-*, vertical-align, white-space`.
   - Blocklisted classes (skip during walk): `jsx-component-wrapper` ::before/::after, ProseMirror-internal classes (`selectedCell`, `is-empty`, etc.).
   - Blocklisted attributes (strip from clones): `data-selected, data-has-child-selected, data-dragging, data-pm-slice` (PM may auto-attach this; check), `contenteditable`.
4. **Implement Pattern X (live-DOM walker via custom `clipboardSerializer`)** per the existing 2026-04-30 viability section's sketch, with the allowlist/blocklist applied during the walk.
5. **Keep Pattern Y (per-descriptor fallback palette)** as the rare-edge fallback for `view.nodeDOM(pos) === null` (Activity-hidden, opaque NodeView, future shadow-DOM descriptors).

**Pleasantly surprising findings:**

- **html-to-image's pseudo-element solution is a pragmatic library precedent** — synthesize a `<style>` rule with a UUID class and inject it. For OK destinations that respect `<style>` (Notion, Slack web, Linear), this could work as a transitional bridge while the chevron-refactor happens. For Gmail/Outlook, the `<style>` is stripped — but those are also the destinations where the chevron's loss is least objectionable (text-mostly destinations).
- **No peer rich-text editor uses the live-DOM walker** because they all run their export server-side OR rely on author-written inline styles. **OK doing this in-browser at copy time is genuinely a category-leading approach** — we have the live DOM AND the CSSOM at copy time, peer editors don't.
- **Performance is much better than feared.** First read flushes layout; subsequent reads are cached. No thrashing risk for a pure-read walker. Even worst-case full-doc copies fit OK's budgets.
- **Inline-styled HTML is what every major editor emits already** — Google Docs, Notion, Office Online all do it. This is the lingua franca of cross-app paste, not an exotic strategy.

**Genuinely surprising findings (recommend caution on):**

- **Callout collapsible chevron is rendered VIA `::before` pseudo-element** (`globals.css:1747`) and would silently disappear from cross-app paste. This is a Day-One bug for the generic walker pattern unless preceded by the chevron refactor.
- **`jsx-component-wrapper`'s editor chrome (`::before` hover-zone, `::after` selection halo) would leak as `position: absolute; z-index: 9` invisible stylings** in cross-app paste unless explicitly filtered. The naive walker emits these.
- **html-to-image's known issue #363 — "all pseudo elements are missed in the rendered image"** — reporter acknowledges "I have a feeling that these may well be omitted as they are notoriously tricky elements." The library has a heuristic for the simple case but doesn't handle background-image or complex pseudo-element compositions reliably. OK inheriting this limitation by default.
- **juice's `inlinePseudoElements: true` warning** ("may modify the DOM and conflict with CSS selectors") confirms that cross-tool, this is a known hard problem that no library solves cleanly.

**Bottom line:** The generic walker pattern is **architecturally sound for OK to adopt**, with two non-trivial mitigations required upfront:
1. Refactor the two pseudo-element-based chevrons to real DOM elements.
2. Define an allowlist + blocklist for the walker (CSS properties allowed, classes/attrs to skip).

Without those mitigations, the walker has a Day-One bug for Callout collapsible (chevron disappears) and emits unwanted editor chrome to destinations. **With them, it cleanly replaces per-descriptor `toClipboardHast` methods for the styling concern**, leaves descriptor-specific structural decisions (e.g. how Image becomes `<a><img></a>` for click-through) as the orthogonal axis still requiring per-descriptor logic. The walker is a single-source-of-truth optimization for the **styling** problem, not a complete replacement for ALL clipboard logic.
