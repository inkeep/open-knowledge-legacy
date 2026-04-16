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
  - Turndown
  - rehype-remark
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
6. **Do not override `clipboardSerializer` (text/html).** Let PM's default DOMSerializer produce HTML — that's what Slack, Notion, Google Docs, Apple Notes actually read.
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
