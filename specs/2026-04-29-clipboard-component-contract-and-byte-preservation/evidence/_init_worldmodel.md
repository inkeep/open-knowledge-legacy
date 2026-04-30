---
name: Worldmodel — paste byte preservation end-to-end
description: Multi-channel topology for the OK clipboard paste pipeline — surfaces, connections, entities, patterns, prior art. Non-prescriptive grounding for spec drafting.
date: 2026-04-29
sources:
  - "Predecessor specs: specs/2026-04-16-clipboard-mdast-canonical/SPEC.md, specs/2026-04-23-cb-v2-md-foundation/SPEC.md + meta/_changelog.md"
  - "Pre-research stub: reports/cb-v2-round-trip-preservation-audit/README.md"
  - "Research report: reports/tiptap-clipboard-round-trip-markdown/REPORT.md (1171 LoC)"
  - "Companion report: reports/markdown-editor-paste-and-html-survey/REPORT.md"
  - "Code channel (inline scan): packages/app/src/editor/clipboard/* + packages/core/src/markdown/* + packages/core/src/extensions/* + packages/core/src/registry/types.ts"
  - "OSS channel: ~/.claude/oss-repos/blocknote (toClipboard/fromClipboard); also tiptap, prosemirror-remark, slate-yjs, automerge-prosemirror, outline, lexical, hocuspocus, y-prosemirror, y-codemirror.next, mdast-util-mdx, mdast-util-mdx-jsx, prosemirror-unified, remark-prosemirror, remark-wiki-link"
  - "Web channel: 4 divergent probes (PM clipboardSerializer / toClipboardHast contract; BlockNote private MIME; ClipboardItem.write web-prefix pickling; tiptap handlePaste rich HTML round-trip; Linear/Outline copy-as-markdown)"
  - "ARCHITECTURE.md, PRECEDENTS.md (canonical glossary + 36 architectural rules), CLAUDE.md (STOP/WARN rules)"
depth: full
type: meta
---

# Worldmodel — Paste Byte Preservation End-to-End

Topology for the **clipboard / paste / copy round-trip pipeline** in Open Knowledge. Maps surfaces, connections, entities, patterns, personas, 3P landscape, prior research, current state, and adjacent risks. **Non-prescriptive** — reports what exists, who's affected, and what patterns are visible. Spec drafting consumes this.

Scope (locked at intake):
- **D1** Preservation = byte-for-byte source identity (the bytes a paste produces equal the bytes the source emitted, when both speak OK-canonical markdown).
- **D2** Both WYSIWYG (TipTap over `Y.XmlFragment`) + Source (CodeMirror 6 over `Y.Text`) views symmetric.
- **D3** `toClipboardHast`-style per-descriptor contract for custom OK components — architectural foundation, in scope for OK→external too.
- **D4** Cross-machine paste via "raw markdown file emailed/Slacked from one machine, pasted into OK on another" in scope.

---

## 1. Surfaces

### Product surfaces (user-facing)

| Surface | Trigger | Code site |
|---|---|---|
| WYSIWYG copy / cut | ⌘C / ⌘X with selection in TipTap view | `packages/app/src/editor/TiptapEditor.tsx` editorProps; `clipboard/serialize.ts` `createClipboardTextSerializer` + `createClipboardHtmlSerializer` |
| WYSIWYG paste | ⌘V into TipTap view | `clipboard/handle-paste.ts` `createHandlePaste` (5-branch dispatcher A/B/C/D/E) |
| WYSIWYG plain-text paste | ⌘⇧V escape hatch | `clipboard/shift-tracker.ts` `pasteShiftHeld` — keyboard-event tracker because `ClipboardEvent.shiftKey` not exposed |
| Source copy / cut | ⌘C / ⌘X with selection in CodeMirror view | `clipboard/source-clipboard.ts` `handleCopyOrCut` via `EditorView.domEventHandlers` |
| Source paste | ⌘V into CodeMirror view | `clipboard/source-clipboard.ts` `handlePaste` (4-branch dispatcher; Branch B/text-x-gfm collapsed into CM6 default) |
| Drag-out (external) | drag selection → adjacent app | PM `dragstart` handler reuses `clipboardTextSerializer` + `clipboardSerializer` (no separate code site) |
| Drag-in (external) | drag content from Chrome tab → OK | PM `parseFromClipboard` runs the same `handlePaste` dispatcher path |
| Internal drag (within OK) | drag selection within editor | PM `view.dragging.slice` fast path; never re-enters paste pipeline |
| Edit menu Cut/Copy/Paste | (latent — no native menu wired) | N/A in current code; OS-level Edit menu fires the same DOM events |

### Internal surfaces (engine-facing)

| Module | Role | File |
|---|---|---|
| WYSIWYG paste dispatcher | 5-branch router (A vscode-editor-data; B text/x-gfm; C `data-pm-slice`; D generic HTML; E text/plain markdown-first / plain-text) | `packages/app/src/editor/clipboard/handle-paste.ts` |
| WYSIWYG outbound serializer | `clipboardTextSerializer` (mdast→markdown) + `MdastClipboardSerializer extends DOMSerializer` (markdown→HTML) | `packages/app/src/editor/clipboard/serialize.ts` |
| Source clipboard extension | CM6 `EditorView.domEventHandlers.{copy,cut,paste}` | `packages/app/src/editor/clipboard/source-clipboard.ts` |
| Clipboard source detection | regex/MIME → `ClipboardSource` enum | `packages/app/src/editor/clipboard/detect-source.ts` |
| `isMarkdown` heuristic | Outline-style signal-count threshold for text/plain Branch E + the markdown-first ambiguity tiebreak | `packages/app/src/editor/clipboard/is-markdown.ts` |
| Telemetry | structured-JSON `console.warn` events (`clipboard-source-detected`, `clipboard-html-conversion-fail`, `clipboard-slow-op`, `clipboard-chunked-insert-failed`) | `packages/app/src/editor/clipboard/instrument.ts` |
| Shift-key tracker | window-level `keydown`/`keyup` cache; `pasteShiftHeld(event)` reads it | `packages/app/src/editor/clipboard/shift-tracker.ts` |
| Paste-failure toast | sonner toast on degraded paste | `packages/app/src/editor/clipboard/paste-failure-toast.ts` |
| Shared inbound `htmlToMdast` | rehype-parse → 9 cleanup plugins → rehype-remark | `packages/core/src/markdown/html-to-mdast.ts` |
| Shared outbound `mdastToHtml` / `markdownToHtml` | remark-rehype → custom-node handlers + `rehypeSanitizeUrls` → rehype-stringify | `packages/core/src/markdown/mdast-to-html.ts` |
| Custom-node hast handlers | wikiLink / mdxJsxFlowElement / mdxJsxTextElement / rawMdxFallback → hast | `packages/core/src/markdown/mdast-to-hast-handlers.ts` |
| Option B carve-out | `HTML_PRIMITIVE_TAGS = {img, video, audio}` + `tryNativeHtmlPrimitive` for cross-app outbound rendering | `packages/core/src/markdown/mdast-to-hast-handlers.ts:72-104` |
| Vendor cleanup rehype plugins | 9 plugins (gdocs/word/cocoa/gmail/notion/vscode/gsheets/slack/github) | `packages/core/src/markdown/rehype-plugins/*.ts` |
| Custom-node mdast types | promoted first-class types (wikiLink + rawMdxFallback) + remark-mdx mdxJsxFlow/Text | `packages/core/src/markdown/mdast-augmentation.ts` |
| Custom-node markdown handlers | mdast → markdown emission | `packages/core/src/markdown/to-markdown-handlers.ts` |
| `MarkdownManager.parse / .serialize` | core PM↔mdast↔markdown round-trip | `packages/core/src/markdown/index.ts` (PM↔mdast handlers, lines 687-723 cited in 2026-04-16 SPEC) |
| `JsxComponent` PM extension | block JSX node, `parseHTML: 'div[data-jsx-component]'`, `renderHTML: <div data-jsx-component data-component-name data-source-raw>` | `packages/core/src/extensions/jsx-component.ts:55-80` |
| `Image` PM extension (TipTap built-in) | `tag: 'img[src]'` `parseDOM` rule wins for any native `<img>` HTML; configured `inline: true` | `packages/core/src/extensions/shared.ts:82` |
| `WikiLink` extension | `parseHTML` matches `span[data-wiki-link]`; `renderHTML` emits same | `packages/core/src/extensions/wiki-link.ts:83,103,137` |
| `RawMdxFallback` extension | block PM node with `data-raw-mdx-fallback` parseHTML | `packages/core/src/extensions/raw-mdx-fallback.ts:34,48` |
| `JsxInline` extension | inline PM node `data-jsx-inline contenteditable="false"` | `packages/core/src/extensions/jsx-inline.ts:35,39` |
| Paste fidelity E2E | virtual DataTransfer harness (paste-side); copy-side `simulateCopyAndRead` per US-014 | `packages/app/tests/stress/paste-fidelity.e2e.ts` + `_helpers/clipboard.ts` |
| Chunked Y.Text insert | `chunkedYTextInsert` + `ChunkedInsertError` for >500KB Source paste | `packages/core/src/...` (re-exported via `@inkeep/open-knowledge-core`); FR-21 of 2026-04-16 SPEC |

### MIME registry (current)

**Read on paste (in detection precedence):**
1. `vscode-editor-data` — Branch A trigger (fenced code block + language ident)
2. `text/x-gfm` — Branch B trigger (markdown path)
3. `text/html` containing `data-pm-slice` — Branch C trigger (PM-origin native parseFromClipboard)
4. `text/html` containing vendor fingerprint — Branch D + source label (`gdocs` / `word` / `gmail` / `notion` / `apple` / `slack` / `gsheets` / `github`)
5. `text/html` generic — Branch D + `generic` source label
6. `text/plain` only — Branch E (`isMarkdown(text)` ≥ threshold ⇒ markdown-text; else plaintext-verbatim)

**Written on copy:** `text/plain` (canonical markdown via mdManager.serialize) + `text/html` (canonical mdast→hast→HTML via shared `markdownToHtml` / `mdastToHtml`); PM's `serializeForClipboard` automatically attaches `data-pm-slice` to first element of returned fragment.

**Locked NOT-emitted:** `text/markdown` (NG5 NEVER — Safari rejects, zero destinations read), `web `-prefixed Chromium pickling (NG6 NEVER as first-order; Chromium-only, zero Safari/Firefox).

---

## 2. Connections & dependencies

### Composition graph

```
                        mdast (canonical hub for both inbound + outbound)
                           ▲  ▲  ▲  ▲
       remark-parse ───────┘  │  │  └──── remark-stringify
                              │  │
                             hast ◄── rehype-parse ── HTML
                              │              ▲
              rehype-remark ──┘              │
                                  remark-rehype + rehype-stringify
                                  (mdast→hast→HTML; custom-node handlers + rehypeSanitizeUrls)
                                          │
                              PM↔mdast handlers (markdown/index.ts)
                                          │
                                       PM JSON ──→ doc.transact (user-origin) ──→ Y.XmlFragment
                                                             │
                                                  Server Observer A bridge (XmlFragment→Y.Text)
                                                             ▼
                                                          Y.Text ◄── Source paste branch D
                                                  Server Observer B bridge (Y.Text→XmlFragment)
```

### Primary forward connections (paste → state)

- **Branch A (vscode-editor-data) → fenced code block** with `language` ident validated by `LANG_IDENT = /^[A-Za-z0-9_+-]+$/` (security-significant; defangs newline/fence-injection).
- **Branch B (text/x-gfm) → mdManager.parse → PM JSON → schema.nodeFromJSON → `tr.replaceSelection`.**
- **Branch C (data-pm-slice) → return false** → PM's native `parseFromClipboard` reconstructs the slice via `parseHTML` rules registered by all custom-node extensions (jsxComponent, wikiLink, jsxInline, rawMdxFallback) + TipTap's Image (`img[src]`).
- **Branch D (generic HTML) → htmlToMdast (rehype-parse + 9 cleanup plugins + rehype-remark) → mdastToMarkdown → mdManager.parse → PM JSON.**
- **Branch E (text/plain) → if isMarkdown(text) → mdManager.parse; else `tr.replaceSelectionWith(schema.text(text))` verbatim.**
- **Source view all branches → CM6 dispatch into Y.Text → yCollab observes → Server Observer B → XmlFragment** (bridge invariant; user-origin).
- **WYSIWYG ⌘V into Y.XmlFragment → Server Observer A → Y.Text** (bridge invariant).

### Primary outbound connections (selection → clipboard)

- **WYSIWYG copy:** Slice → `schema.topNodeType.createAndFill(null, slice.content)` → mdManager.serialize → `text/plain` (markdown). For `text/html`, the markdown is fed BACK through `markdownToHtml` (re-parse + remark-rehype + custom handlers + rehypeSanitizeUrls + rehype-stringify) → DocumentFragment via `DOMParser`.
- **Source copy:** `view.state.sliceDoc(from,to)` → `text/plain` direct; same string → `markdownToHtml` → `text/html`.
- **Cross-view symmetry invariant:** for the same selection expressed in both views, `markdownToHtml(sourceView.sliceDoc(...))` and `mdastToHtml(pmToMdast(wysiwyg.slice()))` produce byte-identical HTML (US-014). The WYSIWYG path takes a Slice → markdown → markdown → HTML; the Source path takes string → markdown→HTML. The intermediate markdown string is the equivalence point.

### Bridge invariants this surface intersects

- **OBSERVER_SYNC_ORIGIN.** Server-side observer cross-CRDT writes (XmlFragment↔Y.Text) MUST use this origin. Paste handlers are user-origin (undefined or session origin) — **not** OBSERVER_SYNC_ORIGIN.
- **`paired:true` markers.** Origins that atomically mutate BOTH XmlFragment and Y.Text in a single `doc.transact(..., ORIGIN)` declare `context.paired:true`. Paste is single-CRDT, single-transact — does not touch the paired-write surface.
- **Schema add-only.** Paste must not add or narrow PM schema attrs. Custom-node parseHTML rules (`data-pm-slice` + `data-jsx-component` + `data-wiki-link` + `data-jsx-inline` + `data-raw-mdx-fallback`) are stable and add-only.
- **Item-preservation.** PM Slice replacement preserves `Y.UndoManager({ trackedOrigins })` attribution through bridge cycles.

### Markdown round-trip pipeline coupling

- **`unified + remark` core** (precedent #15(d)). `@handlewithcare/remark-prosemirror` (pinned `0.1.5`, patched) bridges mdast↔ProseMirror. `mdast-util-mdx` provides `mdxJsxFlowElement` / `mdxJsxTextElement` types.
- **R23 PUA-sentinel guard** in `autolink-void-html-guard.ts` — the `LOWERCASE_JSX_CANONICAL_TAGS` set (sister to `HTML_PRIMITIVE_TAGS`) gates which lowercase tags reach remark-mdx as JSX vs PUA-protected as raw HTML text. Same v1 5-pack coincidence; distinct purposes.
- **Storage-layer fidelity contract** (CLAUDE.md "Storage never sanitizes"). NG7 NEVER bans paste-time DOMPurify. URL-scheme sanitization (rehype `rehypeSanitizeUrls`) runs only on outbound copy HTML, never on stored content.
- **NG1-NG11 catalogue gaps** (intentional storage normalizations) — blank-line counts, GFM table column widths, math/footnotes/alerts, non-ambiguous `\foo` backslashes, R23 PUA reserved sentinels, doc-start `---` → `***`, ignore-typed-only docs synthesized empty paragraph. These are baseline-acceptable normalizations that the spec's byte-preservation contract must explicitly enumerate as "structural" and exclude from "byte" identity.

### Editor lifecycle interaction

- **React Compiler** — no `forwardRef` / `memo` / `useMemo` / `useCallback`. Clipboard hooks built via `createClipboardTextSerializer(deps)` factory closures over MarkdownManager; safe to construct before editor mounts.
- **Hybrid render tree** (`DocumentErrorBoundary` → `Suspense` → `EditorActivityPool` → `Activity` → `DocumentBoundary`). Clipboard handlers fire on the active editor view; STOP-rule "don't collapse the hybrid render tree" applies. Activity-hidden TipTap destroys editor (memory `project_tiptap_activity_hidden_destroys_editor`); copy/paste handlers must tolerate teardown.

### React Compiler / TipTap lifecycle bug surface

- TipTap `editor.view` is a throwing proxy before mount. Touching `editor.view.dom` during recycle/remount crashes the nearest ErrorBoundary. Clipboard subscribe-to-`'create'` pattern (cf. `TiptapEditor.tsx`) is the only safe path.

---

## 3. Entities & terminology

Repo glossaries scanned: `CLAUDE.md`, `ARCHITECTURE.md`, `PRECEDENTS.md` (esp. #14 client-side cross-CRDT delete, #19 clipboard pipeline mdast-canonical, #1 paired-write origins, #9 schema add-only, #25 writer-ID taxonomy).

### Branch labels (paste dispatcher)

| Branch | Trigger | Pipeline |
|---|---|---|
| A | `vscode-editor-data` MIME | text/plain → fenced code block w/ language |
| B | `text/x-gfm` MIME | text/plain → mdManager.parse |
| C | `text/html` contains `data-pm-slice` | return false → PM's parseFromClipboard runs natively |
| D | generic `text/html` (vendor or unknown) | htmlToMdast → mdastToMarkdown → mdManager.parse |
| E | text/plain only | isMarkdown(text) ⇒ B-shaped; else verbatim plaintext |

Source view: parallel **4-branch** (A vscode / C pm-origin / D generic HTML / E plaintext). Branch B collapsed because Source's insertion IS markdown text — no transform needed.

### Custom node types (PM ↔ mdast)

| PM node | mdast type (post-D7 promotion) | parseHTML | renderHTML |
|---|---|---|---|
| `jsxComponent` | `mdxJsxFlowElement` (capitalized JSX block, e.g., Callout/Accordion) | `div[data-jsx-component]` | `<div data-jsx-component data-component-name data-source-raw>` |
| `jsxInline` | `mdxJsxTextElement` (inline JSX) | `span[data-jsx-inline]` | `<span data-jsx-inline contenteditable="false">` |
| `wikiLink` | `wikiLink` (first-class promoted) | `span[data-wiki-link]` (incl. data-pm-slice round-trip path) | `<span data-wiki-link data-target data-alias data-anchor data-resolved>` |
| `rawMdxFallback` | `rawMdxFallback` (first-class promoted) | `div[data-raw-mdx-fallback]` | `<div data-raw-mdx-fallback data-raw-badge="raw" data-reason class="raw-mdx-fallback" contenteditable="false">` |
| TipTap built-in `Image` (configured `inline: true`) | `image` (mdast core) | TipTap default `tag: 'img[src]'` | TipTap default `<img>` |

### Descriptor surface taxonomy (post-PR #310)

- **`surface: 'canonical' | 'compat'`** — discriminated-union `JsxComponentMeta = CanonicalMeta | CompatMeta`.
- **5 canonicals (post-2026-04-27 lowercase pivot):** `Callout`, `img`, `video`, `audio`, `Accordion`. (PropPanel + slash menu show `displayName: "Image"/"Video"/"Audio"` — capitalized labels for lowercase descriptor names.)
- **3 compats:** `GFMCallout`, `CommonMarkImage`, `HtmlDetailsAccordion`. Compat = source-form preservation: descriptor identity carries `> [!NOTE]` vs `<Callout>`, `![alt](src)` vs `<img/>`, `<details>` vs `<Accordion>`. Each compat owns `serialize: (node, ctx) => mdast` + `rendersAs: <canonical-name>` + `translateProps`.
- **`SerializeContext`** = `{all, registry, serializeChildren}`. Mirrors remark-prosemirror's internal `State`; field names must stay in lockstep with `markdown/index.ts:MdastToPmState`.
- **Slash menu** filtered to `surface === 'canonical'` (no user-facing way to insert a compat node from scratch).
- **Convert button** existed briefly per D-MF20 then trimmed 2026-04-28 (compat→canonical promote UX leaks the registry shape; users delete-and-reinsert via slash menu instead).

### Outbound-cross-app shape nomenclature

- **Option A** (pre-PR #310 baseline): `<pre class="mdx-component"><code>{escaped raw}</code></pre>` for ALL JSX (including `<img>` / `<video>` / `<audio>`). Rendered as escaped source in cross-app destinations.
- **Option B** (PR #310 SHIPPED): name-keyed carve-out for `HTML_PRIMITIVE_TAGS = {img, video, audio}` only. `tryNativeHtmlPrimitive` emits real `<img>` / `<video>` / `<audio>` hast. Capitalized JSX (Callout, Accordion) still falls through to `<pre>` shape.
- **Option C** (DEFERRED — D3 of this spec): per-descriptor `toClipboardHast` contract on `JsxComponentMeta`. Canonical and compat arms each declare how their node renders into clipboard hast for cross-app destinations. This spec's D3 LOCKED.
- **Option D** (DEFERRED — NG1 of 2026-04-16, revisit criterion now MET): private `text/x-ok-slice` MIME (sync-event) for OK→OK lossless round-trip. Wire format Q2.

### MIME / clipboard-payload nomenclature

- **`text/plain`** — canonical markdown source. Dominant ecosystem MIME. Read by every destination. NG5 NEVER `text/markdown`.
- **`text/html`** — canonical rendered HTML. PM's `serializeForClipboard` auto-attaches `data-pm-slice` to first returned element with `openStart openEnd context` — paste-side detection via `querySelector("[data-pm-slice]")`.
- **`text/x-gfm`** — explicit GitHub-flavored-markdown MIME (read in Branch B; not currently written by OK).
- **`vscode-editor-data`** — VS Code's structured paste metadata (`mode` for language ident).
- **`web text/x-ok-slice`** (proposed Option D, NOT shipped) — Chromium pickling (`web `-prefix). Chromium 104+ only; Safari/Firefox never.
- **`text/x-ok-slice`** (proposed sync-event variant) — cross-browser via `event.clipboardData.setData`. BlockNote uses `blocknote/html` analogously.
- **`vnd.open-knowledge/slice`** — alternative sync-event MIME suggested in 2026-04-16 SPEC §15 NG1 implementation sketch.

### R-numbered references in 2026-04-16 SPEC

- **R18** = the predecessor 15-editor paste landscape report (`reports/markdown-editor-paste-and-html-survey/REPORT.md`).
- **R23** = the R23 PUA-sentinel guard / autolink-void-HTML-guard.

### FR-numbered contracts (from 2026-04-16 SPEC, still in force)

- **FR-3:** WYSIWYG paste 5-branch dispatcher.
- **FR-5:** Source paste 4-branch dispatcher.
- **FR-13:** Markdown-first ambiguous paste (text/plain markdown wins over text/html when both present).
- **FR-14:** `isMarkdown` heuristic — Outline-style signal-count, threshold `min(3, floor(lineCount/5))`.
- **FR-17:** `Cmd+Shift+V` plain-paste escape hatch (both views).
- **FR-19:** Copy-inside-codeBlock emits fenced markdown.
- **FR-20:** mdast→hast escape contract — raw source through hast `text` (auto-escaped), NEVER hast `html` (passthrough).
- **FR-21:** Chunked Y.Text insert for >500KB Source paste (rAF-yielded, Y.RelativePosition pinned).
- **NG1-NG11:** parking lot — NG1 (private MIME) revisit criterion is met by the user's OK→OK `<img>` regression in this session's intake.

### Telemetry events (`instrument.ts`)

- `clipboard-source-detected` (per-paste source label distribution)
- `clipboard-html-conversion-fail` (per-stage failure with `errorClass` + `htmlBytes`)
- `clipboard-serialize-fail` (per-kind copy failure)
- `clipboard-slow-op` (paste >250ms or copy >100ms)
- `clipboard-chunked-insert-failed` (typed `ChunkedInsertError` partial-progress fields)

### `ClipboardSource` enum values

`vscode | gfm | pm-origin | gdocs | word | gmail | notion | apple | slack | gsheets | github | generic | markdown-text | plaintext | local`. (`local` is the copy-side token; `ai-chat` was declared-but-never-emitted, removed under precedent #7.)

### PRECEDENTS cited at clipboard sites

- **#1 (paired-write origin marker)** — origins atomically writing BOTH CRDTs declare `context.paired:true`. Paste is single-CRDT.
- **#9 (schema add-only forever)** — `parseHTML` rules + node attrs are append-only. Pasting in foreign HTML must not require attr widening.
- **#14 (client-side cross-CRDT writes deletion)** — observer.ts client-side write paths deleted; bridge runs server-side via OBSERVER_SYNC_ORIGIN. Paste path is single-CRDT, doesn't reintroduce.
- **#15(d) (sourceRaw passthrough)** — pristine round-trip via `data.sourceRaw`. Paste-imported content has no `sourceRaw` → falls into the "dirty" path → descriptor `serialize()` reconstructs MDX form.
- **#19 (clipboard pipeline mdast-canonical with per-view hook mechanisms)** — the canonical home of clipboard rules. WYSIWYG uses PM hooks; Source uses CM6 `EditorView.domEventHandlers`. DOM-level `handleDOMEvents.copy/cut/dragstart` is **prohibited** on WYSIWYG (would re-introduce drag-and-drop coupling that caused D14 to flip).
- **#25 (writer-ID taxonomy)** — `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`. Paste is principal-origin.

---

## 4. Patterns

### Paste dispatcher branch pattern

Highest-fidelity branch wins. Detection precedence climbs from MIME-explicit (vscode, x-gfm) through structural (data-pm-slice) to fingerprinted-HTML to generic HTML to plaintext. Each branch wraps its conversion in `try/catch`; failures fall through to the layer below (Keystatic three-layer fallback). Per-stage telemetry pinpoints the failing pipeline component instead of a single bracket-prefixed warning.

### Descriptor `serialize:(node, ctx) => mdast` pattern (D-MF20 from 2026-04-23)

Both canonical and compat arms own a `serialize` method. Canonical descriptors emit `mdxJsxFlowElement(<Name>)`. Compat descriptors emit native source form (blockquote for GFMCallout, paragraph+image for CommonMarkImage, html-block for HtmlDetailsAccordion). Pristine-path round-trip is upstream via `data.sourceRaw`; descriptors only own the dirty path. The pattern naturally extends to a sister `toClipboardHast: (node, ctx) => hast` method on each descriptor — D3 of this spec.

### Hast `tryNativeHtmlPrimitive` carve-out pattern (PR #310, Option B)

Set-membership gate on JSX element name (`HTML_PRIMITIVE_TAGS`). Returns null when (a) name not in set, or (b) any attribute is a spread / expression value (`{...rest}`, `width={400}`) — those can't faithfully render as static HTML attrs. URL-scheme sanitization runs downstream (`rehypeSanitizeUrls`) so dangerous `src` schemes are stripped after this helper returns.

### FR-20 outbound escape contract

Raw source strings (jsxComponent `sourceRaw`, jsxInline `sourceRaw`, rawMdxFallback `value`) emit as hast `text` nodes — auto-escaped by `rehype-stringify`. NEVER hast `html` (passthrough). Per-node fuzz tests assert `<script>` adversarial input survives as `&lt;script&gt;`.

### `data-pm-slice` PM-origin detection pattern

PM's `serializeForClipboard` automatically attaches `data-pm-slice="{openStart} {openEnd} {context}"` to the first returned element on copy. Paste-side detection via `querySelector("[data-pm-slice]")` routes Branch C through PM's native `parseFromClipboard`. Cross-PM-editor interop (Linear/Outline/BlockNote/Milkdown/another OK tab) — all PM-based editors emit and detect this attribute the same way.

### Observer bridge OBSERVER_SYNC_ORIGIN

Server-side observer cross-CRDT writes use this distinct origin. Paste handlers are user-origin (undefined or session origin) — never OBSERVER_SYNC_ORIGIN. `applyAgentMarkdownWrite` is the agent equivalent (also not used in paste path).

### Three-layer fallback (Keystatic pattern)

Inbound: rehype pipeline fails → markdown fails → text/plain insert. Outbound: text serializer throws → `slice.content.textBetween` fallback; HTML serializer throws → empty DocumentFragment so PM default `DOMSerializer` runs. No silent content drop.

### Cross-view symmetry invariant

Same selection in both views ⇒ byte-identical `text/html` output. Source path: string → `markdownToHtml` → HTML. WYSIWYG path: Slice → markdown → `markdownToHtml` → HTML. The intermediate markdown string is the equivalence point. Exercised by US-014's `simulateCopyAndRead` E2E.

### `_helpers/` barrel-import

Shared E2E helpers live in `packages/app/tests/stress/_helpers/` with `index.ts` barrel. Consumers import from `./_helpers` only — never inner files (D-Q11 LOCKED). Clipboard E2E tests follow this pattern.

### React-Compiler discipline

Factory closures (`createClipboardTextSerializer(deps)`) without `useMemo`/`useCallback`. PM hooks built once at editor construction, deps closed-over; React Compiler handles re-render decisions.

---

## 5. Personas & audiences

### Primary persona

**OK author (human knowledge worker).** Single primary persona per `evidence/_user_outcomes.md`. Three direct outcomes:
1. "Byte preservation in all paste scenarios."
2. Copy OK content to a target destination, see it render usefully there (toClipboardHast architecture).
3. Move OK content as a raw markdown file via email/Slack, paste it back into OK losslessly.

User journeys (J1–J4):
- **J1** — OK→OK same-machine (cross-tab / cross-doc).
- **J2** — OK→external (paste into Slack/Notion/Gmail/GitHub/VS Code).
- **J3** — external→OK where source produced OK-canonical bytes (markdown-shaped text/plain).
- **J4** — external→OK where source did NOT produce OK-canonical bytes (rich HTML — Gmail/GDocs/Notion/Word) — best-effort cleanup pipeline applies.

### Secondary destinations (data targets, not user personas)

External destination apps consume OK clipboard payload. Per 2026-04-16 SPEC §5 + the 1171-line research report: Gmail web, GitHub textarea, Slack compose, VS Code `.md`, Notion, Google Docs, Discord, Apple Notes, TextEdit, Linear, Outline. Each has a different MIME-priority / sanitization posture; the `text/plain` markdown + `text/html` rendered combo covers all surveyed.

### Secondary sources (data origins)

Same 11 destinations as paste sources. Plus AI chat surfaces (Claude / ChatGPT) — emit markdown via copy-button, rich HTML via select-and-copy.

### AI agents — out of clipboard path

Agents write directly via MCP tools (`write_document`, `edit_document`); never via clipboard. Agent-produced content moves through clipboard only when humans copy from a chat surface and paste into OK. Agent-write attribution is via `extractAgentIdentity` at handler entry — separate path from `principal-<UUID>` paste origin.

---

## 6. 3P landscape

### Editor framework primitives

- **TipTap clipboard hooks** (in `editorProps`): `clipboardTextSerializer: (slice, view) => string`, `clipboardSerializer: DOMSerializer`, `clipboardTextParser: (text, $context, plain, view) => Slice`, `handlePaste: (view, event, slice) => boolean`. PM's `serializeForClipboard` wraps these on copy/cut/dragstart. Drag-out, internal drag, external drag-in all go through the same hooks.
- **TipTap paste rules** (`addPasteRules`) — pattern-based markdown shortcut transforms; orthogonal to dispatcher.
- **CodeMirror 6 `EditorView.domEventHandlers`** — DOM-level `copy`/`cut`/`paste` handlers. CM6 has no analog to PM's `clipboardSerializer` hook surface.
- **`@codemirror/view` clipboard plumbing:** built-in handlers at `dist/index.js:5074-5087` (paste reads text/plain only) and `:5128-5156` (copy writes text/plain only). Default ignores text/html on both sides.

### Markdown ↔ HTML libraries (unified ecosystem)

- **`@handlewithcare/remark-prosemirror`** (pinned `0.1.5`, patched). Bridges mdast↔ProseMirror. Two upstream patch hunks must apply cleanly per upgrade protocol.
- **`mdast-util-mdx`** + **`mdast-util-mdx-jsx`** + **`mdast-util-mdx-expression`** + **`mdast-util-mdxjs-esm`** — first-party MDX mdast types. `mdxJsxFlowElement` / `mdxJsxTextElement` are the canonical promoted types for capitalized JSX.
- **`mdast-util-to-hast`** — `Handlers` API; per-type handler dispatch. The integration point for `customNodeHandlers` (wikiLink, mdxJsxFlow/Text, rawMdxFallback).
- **`remark-rehype`** + **`rehype-stringify`** — outbound: mdast → hast → HTML. Custom-node handlers + `rehypeSanitizeUrls` plugin.
- **`rehype-parse`** + **`rehype-remark`** — inbound: HTML → hast → mdast. 9 cleanup plugins between parse + remark steps.
- **`remark-stringify`** — mdast → markdown. Used by Source-paste Branch D after htmlToMdast.
- **`remark-gfm`** — GFM autolink-literal promotion. Source of one current bug: bare URLs in prose attribute strings get rewritten to `[url](url)`. Catalogued in `cb-v2-round-trip-preservation-audit/README.md`.
- **`remark-frontmatter`** — frontmatter passthrough.
- **`remark-mdx-agnostic`** — internal OK plugin permitting tolerant MDX parsing.
- **`remark-github-alerts`** (hyoban) — GFM alert blockquote tokenization for Callout MD-form.
- **`remark-wiki-link`** — wikiLink `[[Page]]` micromark extension.

### Prior-art editors (point at existing report — don't re-research)

`reports/tiptap-clipboard-round-trip-markdown/REPORT.md` is the canonical 1171-line study. Surveyed: **Outline** (sets `clipboardTextSerializer`; emits text/plain markdown only), **BlockNote** (DOM `handleDOMEvents.copy` writes 3 MIMEs including `blocknote/html` private MIME — **the canonical OSS toClipboardHast prior-art**, see OSS section below), **Milkdown** (clipboardTextSerializer reuses editor's own PM→markdown), **tiptap-markdown** (no clipboard hooks ship — opt-in for consumers), **Plate** (no markdown-on-copy), **Novel** (no markdown-on-copy), **Keystatic** (clipboardTextSerializer + textBetween fallback), **BlockSuite/AFFiNE** (adapter-registry pattern), **CKEditor** (paste-from-office in-house monolith — no NPM extraction), **Linear** (Cmd+Opt+C copy-as-markdown via command menu, `.md` URL suffix; recent 2026 feature).

### MIME landscape

- **W3C `text/plain` + `text/html`** — universal mandatory, every destination reads.
- **`text/markdown`** — DEAD on arrival. Safari/WebKit rejects from `ClipboardItem.write`; no destination reads.
- **Chromium pickling (`web `-prefix)** — Chromium 104+. `unsanitized` option Chromium-only; no Safari/Firefox cross-origin support.
- **Sync-event custom MIMEs** — `event.clipboardData.setData('text/x-something', ...)` — works cross-browser. GitHub uses `text/x-gfm`, BlockNote uses `blocknote/html`. The only durable cross-browser custom-MIME path.

### Browser quirks

- **PM `serializeForClipboard`** at `prosemirror-view/src/clipboard.ts:32-34`: sets `data-pm-slice` attr on first returned element with computed `{openStart} {openEnd} {context}`. Hand-written wrapper attribute is overwritten — dead code.
- **PM `dragstart`** at `input.ts:681-709`: sets `view.dragging.slice` for internal drag fast path; same hooks fire as copy/cut so `text/plain` + `text/html` go on `dataTransfer` automatically.
- **iOS Safari** — JSC string + tree work 1.5-2x slower than V8. FR-21 chunked Y.Text insert keeps frame time <16ms during input phase.
- **Safari ClipboardItem.write** rejects unknown MIMEs more aggressively than Chrome. BlockNote's TODO comment ("Writing to other MIME types not working in Safari for some reason") confirms.
- **Browser `WebSocket` API can't set headers** — collab-otel uses query-param trace propagation. Orthogonal but illustrates the OS/browser plumbing this stack works around.

### OSS deep-dive: BlockNote `toClipboard` / `fromClipboard`

Located at `~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/`. **The single most relevant OSS prior-art for D3.**

- `toClipboard/copyExtension.ts` — `Extension.create('copyToClipboard')` registers a Plugin with `props.handleDOMEvents.{copy, cut, dragstart}`.
- Each handler calls `selectedFragmentToHTML(view, editor)` → returns `{ clipboardHTML, externalHTML, markdown }`.
  - `clipboardHTML` = PM's default DOMSerializer output (used as the `blocknote/html` private MIME — round-trip identity).
  - `externalHTML` = built via `createExternalHTMLExporter(view.state.schema, editor)` — distinct converter for cross-app destinations.
  - `markdown` = `cleanHTMLToMarkdown(externalHTML)`.
- Writes 3 MIMEs (TODO comment: Safari rejects two of three): `blocknote/html` (private OK→OK round-trip), `text/html` (cross-app rendered), `text/plain` (markdown).
- `fromClipboard/acceptedMIMETypes.ts` — `['vscode-editor-data', 'blocknote/html', 'text/markdown', 'text/html', 'text/plain', 'Files']` in priority order.
- `fromClipboard/pasteExtension.ts` + `handleVSCodePaste.ts` + `handleFileInsertion.ts` — branch-style dispatcher symmetric with OK's 5-branch.

This is exactly the Option D pattern the OK 2026-04-16 SPEC parked as NG1.

### OSS prior-art for cross-CRDT (relevant, orthogonal to clipboard)

`automerge-prosemirror`, `slate-yjs`, `y-prosemirror`, `y-codemirror.next`, `y-tiptap`, `prosemirror-remark`, `prosemirror-unified`, `remark-wiki-link`, `outline`, `lexical`, `hocuspocus`. Used by 2026-04-16 SPEC research for the bridge invariants — not paste-specific.

---

## 7. Prior research

All on path C (existing reports — point, don't re-research):

| Report | Year | Lines | Coverage |
|---|---|---|---|
| `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` | 2026-04-15 | 1171 + 9 evidence files | The canonical clipboard ecosystem study. ProseMirror primitives (D1/D4/D7), MIME strategy + browser/vendor (D2/D8), 10+ editor copy-direction prior art (D3), HTML→markdown library evaluation (D10), 15+ source paste matrix (D12), source detection (D13), 10-editor HTML-paste prior art (D14), CM6 default behavior (D18), cross-view symmetry (D19), Source copy/paste design (D21/D22), bridge invariants (D23). |
| `reports/markdown-editor-paste-and-html-survey/REPORT.md` (R18) | 2026-04-11 | 5 files | 15-editor paste landscape. Archetypes A-Z. |
| `reports/cb-v2-round-trip-preservation-audit/README.md` | 2026-04-29 | stub | Names the round-trip preservation bug class. Disk-side instances enumerated (iframe attr URL, autolink-literal in THIRD_PARTY_NOTICES, duplicate-content regression on PROJECT/README/STORIES/PRECEDENTS, wiki-link bracket form residue). Paste pipeline NOT YET enumerated — explicit gap. |
| `reports/markdown-construct-fidelity-catalog/REPORT.md` | 2026-04-11 | 6 files | 118-case fidelity test catalog. Disk round-trip via `@tiptap/markdown` + `y-tiptap`. |
| `reports/markdown-roundtrip-fidelity-tiptap/REPORT.md` | 2026-04-11 | 8 files | Round-trip fidelity through `@tiptap/markdown`. |
| `reports/mdx-crdt-roundtrip-fidelity/REPORT.md` | 2026-04-03 | 10 files | MDX round-trip through CRDT-backed visual editors. Plate/TinaCMS, Milkdown/ProseMirror. Boundary identification. |
| `reports/cb-v2-callout-superset-research/REPORT.md` | 2026-04 | — | Per-component superset prop shape. |
| `reports/cb-v2-image-superset-research/REPORT.md` | 2026-04 | — | Image superset prop shape (informs PR #310 lowercase pivot). |
| `reports/cb-v2-video-superset-research/REPORT.md` | 2026-04 | — | Video superset prop shape. |
| `reports/cb-v2-audio-superset-research/REPORT.md` | 2026-04 | — | Audio superset prop shape. |
| `reports/cb-v2-toggle-superset-research/REPORT.md` | 2026-04 | — | Accordion (Toggle) superset prop shape. |
| `reports/cb-v2-iframe-embed-pattern/REPORT.md` | 2026-04 | — | Iframe canonical descriptor (cited in audit stub). |
| `reports/config-edit-paths/REPORT.md` | 2026-04-25 | 7 files | YAML round-trip — orthogonal to clipboard but relevant as a "round-trip byte-fidelity" sibling pattern. |

### Predecessor specs

- **`specs/2026-04-16-clipboard-mdast-canonical/SPEC.md`** (476 lines) — APPROVED. Established the 5-branch dispatcher (FR-3) + 4-branch Source dispatcher (FR-5) + shared `htmlToMdast` + `mdastToHtml` modules + 9 cleanup rehype plugins + custom-node mdast promotion (D7) + FR-20 escape contract + FR-21 chunked Y.Text + NG1 (private MIME) `[NOT NOW]` with revisit criterion `users report round-trip fidelity loss on OK→OK cross-tab paste that text/plain markdown can't recover`.
- **`specs/2026-04-23-cb-v2-md-foundation/SPEC.md`** (~850 lines + extensive `meta/_changelog.md`) — APPROVED + post-ship corrigenda. 5-pack canonical descriptors (Callout / img / video / audio / Accordion) + 3 compat (GFMCallout / CommonMarkImage / HtmlDetailsAccordion). Lowercase media canonical pivot 2026-04-27. Shipped Option B for `<img>/<video>/<audio>` JSX → native HTML elements. Did NOT ship Option C (per-descriptor toClipboardHast for capitalized JSX) or Option D (private MIME for OK→OK).
- **`specs/2026-04-24-preview-attach-once-per-session/SPEC.md`** — supersedes `2026-04-15-preview-url-pre-edit/`. Orthogonal but referenced by CLAUDE.md MCP block.
- **`specs/2026-04-28-cb-v2-prop-file-upload/`** — adjacent in-flight. Trimmed Convert button (D-MF20 follow-up); locked the canonical/compat distinction as implementation detail.

### What this spec adds beyond existing research

- Path C eligible for any clipboard-ecosystem additions beyond the 1171-line report.
- The specific "byte-for-byte source identity preservation" stance (D1) is novel — the existing research framed cross-view symmetry, NOT byte identity, as the invariant.
- The cross-machine "raw markdown file emailed/Slacked" lens (D4) is novel — existing research treats "OK→OK" as same-machine clipboard.
- The audit stub's pre-research enumeration of disk-side bugs is the seed; paste-side enumeration is this spec's Step 5 (Q1).

---

## 8. Current state (code-verified)

### What ships today (post PR #310 + 2026-04-27 lowercase pivot + 2026-04-28 Convert-button trim)

**WYSIWYG paste — 5-branch dispatcher** (`clipboard/handle-paste.ts:50-147`) routes through:

1. `pasteShiftHeld(event)` short-circuit → verbatim plaintext insert.
2. `isCursorInCodeBlock(view)` short-circuit → verbatim plaintext insert.
3. Branch A (`vscode-editor-data` MIME + valid `mode` matching `LANG_IDENT`) → fenced code block.
4. Branch B (`text/x-gfm` MIME) → `mdManager.parse` → JSON slice replace.
5. Branch C (`/data-pm-slice/i.test(html)`) → `return false` → PM default `parseFromClipboard`.
6. FR-13 markdown-first ambiguity tiebreak (text/plain isMarkdown + text/html present) → Branch B path.
7. Branch D (generic HTML) → `htmlToMdast` → `mdastToMarkdown` → `mdManager.parse` → JSON slice replace. Per-stage telemetry.
8. Branch E (text/plain only) → isMarkdown ⇒ B-shaped; else `tr.replaceSelectionWith(schema.text(text))`.

**Source paste — 4-branch dispatcher** (`clipboard/source-clipboard.ts:119-187`):

1. Shift-held → return false → CM6 default verbatim plaintext.
2. Branch A vscode → fenced markdown string at selection.
3. Branch C `data-pm-slice` → return false → CM6 default reads text/plain (which IS canonical markdown when source is OK).
4. Branch D HTML → `htmlToMdast` → `mdastToMarkdown` → CM6 dispatch (or `chunkedYTextInsert` for >500KB).
5. Branch E plaintext → return false → CM6 default verbatim.

**WYSIWYG copy** (`clipboard/serialize.ts`):

- `clipboardTextSerializer` → `mdManager.serialize(sliceToDocJson(slice))` → text/plain.
- `clipboardSerializer = MdastClipboardSerializer extends DOMSerializer` → `serializeFragment(fragment, _options, target)`: re-emits markdown via `mdManager.serialize`, then `markdownToHtml(markdown)` → `DOMParser` → DocumentFragment. PM's `serializeForClipboard` auto-attaches `data-pm-slice` to first child.
- Empty-target path returns `target ?? document.createDocumentFragment()` (FR-15 empty-selection no-op preserved).

**Source copy/cut** (`source-clipboard.ts:75-117`):

- Empty-selection: `event.preventDefault()` + return true (FR-15) — explicitly suppresses CM6's line-copy default.
- Non-empty: `view.state.sliceDoc(from,to)` → text/plain; `markdownToHtml(markdown)` → text/html. `event.preventDefault()` + dispatch delete on cut.

**Outbound HTML pipeline** (`mdast-to-html.ts`):

- `markdownToHtml(md)` and `mdastToHtml(tree)` entry points.
- Composes: remark-parse + remark-frontmatter + remark-gfm + remarkMdxAgnostic + remarkWikiLink → remark-rehype (with `customNodeHandlers`) → rehypeSanitizeUrls → rehype-stringify.
- `SAFE_URL_SCHEME = /^(https?:|mailto:|tel:|ftp:|sms:|\/|#|\?|\.\/|\.\.\/)/i`. Drops `href`/`src` if scheme not allowed.

**Inbound HTML pipeline** (`html-to-mdast.ts`):

- `htmlToMdast(html, opts)` — composes: rehype-parse (fragment mode, `emitParseErrors:false`) + 9 cleanup plugins + rehype-remark + remark-gfm + remark-stringify-handlers.
- `HTML_MAX_BYTES = 5MB` ceiling throws `HtmlPayloadTooLargeError` (paste dispatcher falls through to plaintext).

**Custom-node hast handlers** (`mdast-to-hast-handlers.ts`):

- `wikiLinkHandler` → `<a class="wiki-link" data-target data-anchor data-alias href>`.
- `mdxJsxFlowHandler` → `tryNativeHtmlPrimitive` (Option B) → native `<img>/<video>/<audio>` if eligible; else `<pre class="mdx-component"><code>{escaped raw}</code></pre>`.
- `mdxJsxTextHandler` → `tryNativeHtmlPrimitive` (inline carve-out for lowercase media) else `<span class="mdx-inline">{escaped raw}</span>`.
- `rawMdxFallbackHandler` → `<!-- Parse error: reason -->` + `<pre class="mdx-fallback"><code>{escaped raw}</code></pre>`.

**Custom-node parseHTML rules** (PM extensions):

- jsxComponent: `tag: 'div[data-jsx-component]'`. **Only matches OK's structural shape** — native `<img>` HTML doesn't match.
- TipTap built-in `Image.configure({ inline: true })`: `tag: 'img[src]'` — wins for any cross-app `<img>` HTML.
- wikiLink: `span[data-wiki-link]` (custom round-trip path also reconstructs from `data-pm-slice`-tagged HTML).
- jsxInline: `span[data-jsx-inline]`.
- rawMdxFallback: `div[data-raw-mdx-fallback]`.

### Byte-preservation properties that hold today (selection-level)

- WYSIWYG copy → text/plain markdown round-trips through Branch B/E (markdown-first) on paste back into OK losslessly for trivial documents (pure prose, lists, headings, basic tables, basic links).
- WYSIWYG copy → text/html with `data-pm-slice` round-trips through Branch C losslessly (PM-native `parseFromClipboard`).
- Source copy → Source paste between two OK tabs round-trips losslessly via text/plain (Source's insertion IS markdown).
- Cross-view symmetry holds for the same selection: `markdownToHtml(sourceView.sliceDoc(...))` ≡ `mdastToHtml(pmToMdast(wysiwyg.slice()))`.
- Lowercase media (`<img>/<video>/<audio>` JSX) round-trips through `text/html` to cross-app destinations via Option B native carve-out.
- `<img>` → external destination → real `<img>` in Gmail/Notion.
- All 9 vendor-cleanup plugins cover known fingerprinted sources.
- FR-20 escape contract — adversarial input survives but cannot re-enter HTML-parse with special meaning.
- FR-21 chunked insert keeps frame time <16ms on 1MB+ Source paste.

### Byte-preservation properties that fail today (input to Q1 enumeration)

The user's intake hit one regression personally: "after merging in pr 310, when i paste in an `<image>` thing, it pastes as markdown instead." Mechanism (code-verified, not yet in evidence): WYSIWYG copy of an `<img/>` JSX selection emits `text/plain` = `![alt](src)` (CommonMark, the `Image` mdast type's natural markdown form) NOT `<img alt="..." src="..." />`. Paste back into OK: Branch B/E markdown-first wins → `mdManager.parse('![alt](src)')` → emits `image` mdast → renders through CommonMarkImage compat (or canonical `img` if paste-side hasn't run the image-promoter). User sees the form change (`<img>` → `![](...)`).

Other paths likely failing (Q1 task-area, NOT yet investigated, surfaces from worldmodel scan):

- **Capitalized JSX (Callout, Accordion) round-trip OK→OK** — outbound HTML emits `<pre class="mdx-component"><code>...</code></pre>` (Option B/Option A pre-PR #310). When a destination strips `<pre>` (any rich-text editor) the structural identity is lost. Paste back into OK Branch C `data-pm-slice` path RECOVERS via PM-native `parseFromClipboard` IF the destination preserves the `data-pm-slice` attribute. `text/plain` path emits `<Callout type="note">...body...</Callout>` source via remark-stringify via `mdxJsxFlowElement` `to-markdown-handlers.ts` — which on paste back parses identically. So the OK→OK Callout path SHOULD round-trip via text/plain markdown — but only if the dirty path serializer emits canonical MDX form, not the source-form preserved by compat descriptor (`> [!NOTE]\nbody`). Unverified path-by-path.
- **Compat descriptor source-form preservation through clipboard.** `<details>` ↔ HtmlDetailsAccordion ↔ `<Accordion>`. A user copies a `<details>` in OK; the descriptor-`serialize()` emits the source-form mdast (html-block per `htmlBoundary` escape hatch). What does `text/plain` look like? What does `text/html` look like? Does paste back recreate the HtmlDetailsAccordion compat or promote to canonical Accordion?
- **wikiLink** `[[Page]]` round-trip through `text/html`. The `<a class="wiki-link" data-target>` shape is OK-private. Cross-app destinations strip the data-attrs (Gmail keeps `<a>` href; Slack rewrites). Paste back into OK loses the wikiLink identity unless the `data-pm-slice` Branch C path preserves it.
- **rawMdxFallback** content. Self-describing comment + `<pre>` shape is preserved by `data-pm-slice` round-trip. Cross-app paste loses the comment in destinations that strip comments.
- **`is-markdown.ts` heuristic gap.** Doesn't include JSX shape signals. A text/plain payload of `<Callout type="note">\nbody\n</Callout>` from email/Slack would produce zero markdown signals (no `#`, no `-`, no `[](`)— Branch E falls through to verbatim plaintext insert. The MDX form is the OK-canonical bytes — and OK doesn't recognize them. The cross-machine D4 scenario surfaces this directly.
- **Storage normalizations vs byte identity.** NG1-NG11 catalogue (blank-line counts, GFM table column widths, doc-start `---` → `***`, ignore-typed-only docs synth empty paragraph, etc.) — these collide with D1's byte-identity stance. Spec must explicitly enumerate which normalizations are excluded from "byte" (structural normalizations are accepted).
- **Bare-URL preservation in prose** (audit stub, disk-side). Same code path runs on paste — does `htmlToMdast` → `mdastToMarkdown` re-promote bare URLs the same way?
- **Duplication regression** (audit stub, disk-side). Class also produced 768× duplicate in `01-callout.mdx` once. Could a paste path re-trigger?

---

## 9. Unresolved / adjacent

### ADJACENT — connected, outside paste topology

- **PR #270 (`specs/2026-04-16-editor-asset-and-embed-surface/`)** — wiki-embed `![[file.ext]]` parse + asset upload + dedup + basename index. Coordinates with image upload flows but is upstream-orthogonal to paste. Visual drift between `![[photo.jpg]]` and `<img src>` documented as NG24 — paste pipeline could trigger the inconsistency if a wiki-embed is copied as text/plain and pasted into a non-OK destination.
- **`specs/2026-04-28-cb-v2-prop-file-upload/`** — D8 LOCKED removed the Convert button from PropPanel. Locked the canonical/compat distinction as "implementation detail, never surfaced to users." Constrains how a `toClipboardHast` contract can surface descriptor identity to cross-app destinations.
- **NG4 (image paste, separate spec).** Binary MIME routing, RTF sibling-data extraction, drag-drop image support. Out of scope here. Mixed paste behavior (prose + inline images) currently maps `<img>` → `image` mdast → broken `googleusercontent.com` references.
- **NG3 (Word list reconstruction).** CKEditor-grade `mso-list:l1 level1 lfo1` hint extraction. Day-one MVP `mso-*` stripping is sufficient; promotion criterion = Word becomes priority paste source.
- **NG9 (table structure preservation).** Complex table features beyond rectangular GFM. Colspan/rowspan, Google Sheets `data-sheets-value`, Word nested tables.
- **NG5 NEVER (`text/markdown` MIME).** Hard-locked. Adding violates Safari and zero destinations read.
- **NG8 NOT UNLESS (CM6 `lastLinewiseCopy`).** Linewise smart-paste behavior deliberately not preserved.
- **`reports/cb-v2-iframe-embed-pattern/REPORT.md`** — iframe canonical descriptor (cited by audit stub disk-side bug). Iframe paste paths may trigger the same `iframe src="[https://...](https://...)"` autolink-literal corruption as disk.

### UNRESOLVED — searched all channels, specifics murky

- **Wire format for OK→OK structural payload (Q2).** Four candidates surfaced: PM JSON (via `Slice.toJSON` + `data-pm-slice`), canonical mdast tree (JSON-serialized), OK-private mdast subset, markdown-pinned-to-envelope. BlockNote ships PM JSON inside HTML attribute (`blocknote/html` carries PM's default `view.serializeForClipboard().dom.innerHTML`). 2026-04-16 SPEC §15 NG1 implementation sketch suggests "compact JSON snapshot" via sync-event MIME. Trail: no consumer-side decision; spec resolves.
- **MIME-write strategy (Q3).** Sync `event.clipboardData.setData` (cross-browser, BlockNote/GitHub pattern, current OK) vs Chromium pickling `web `-prefix (Chromium-only) vs both. Existing 1171-line research has the verified facts; the consolidation is a spec exercise.
- **`toClipboardHast` contract shape (Q4).** Sister to descriptor `serialize: (node, ctx) => mdast`. Likely shape: `toClipboardHast: (node, ctx) => HastNodes` on `JsxComponentMetaBase`. Open: who calls it (rehype plugin or direct mdast→hast handler dispatch), fallback path (when descriptor doesn't define one — fall through to current `<pre class="mdx-component">` or pass through `data.sourceRaw`?), `ctx` shape (likely sister to `SerializeContext`).
- **Cross-machine vs same-machine differences (Q5, user-asked).** Five transports surfaced: clipboard same-machine, clipboard cross-browser (Cmd+C in Chrome → Cmd+V in Safari same machine), clipboard cross-OS (macOS → iCloud Universal Clipboard → iOS), file → email/Slack → paste, OS clipboard managers (Alfred/Maccy/Raycast). Each has a different MIME-survival signature. Trail: pickling round-trip is Chromium-only; sync-event MIMEs survive same-machine cross-browser; only `text/plain` survives email-and-paste. iCloud Universal Clipboard preserves common MIMEs but unverified on custom MIMEs. OS clipboard managers strip unknown MIMEs (Maccy keeps text/html + text/plain only).
- **`is-markdown.ts` JSX-shape signals.** Heuristic doesn't recognize JSX. Adding `/<[A-Z][a-zA-Z]*/` (capitalized JSX open tag) and `/<[a-z]+\s+[a-z]+="/` (lowercase JSX with attr) as signals would cover the cross-machine D4 case. Surfaces an open question about how aggressively to fire on patterns that legitimately appear in non-markdown code samples.
- **Compat descriptor clipboard semantics.** When user copies a GFMCallout (`> [!NOTE]\n...`), what's in `text/plain`? The descriptor's `serialize()` emits blockquote mdast → remark-stringify → `> [!NOTE]\n...` — same source bytes. What's in `text/html`? Currently runs through `markdownToHtml(sourceText)` which re-parses, hits the alerts plugin again, promotes to compat descriptor again, rendered via canonical's React component as a Callout-shaped `<blockquote>` or `<aside>`. Trail: round-trip OK→OK should preserve source form; cross-app should produce semantic Callout-shaped HTML. Possibly already correct via the existing pipeline; needs trace.
- **Drag-and-drop preservation under D3.** PM's dragstart fires the same hooks as copy/cut. `toClipboardHast` would naturally apply. Drag-out into Gmail (rich destination) gets the new descriptor-defined shape. Internal drag uses `view.dragging.slice` fast path — never touches the new contract. Verified consistent with D14 precedent #19.
- **Performance budget for `toClipboardHast`.** Per-descriptor handler dispatch on 1MB selection. Existing performance gate is `paste > 250ms / copy > 100ms`. New contract adds at most O(descriptor count) dispatch overhead per node — negligible for v1's 5 canonical + 3 compat.

### Channel availability

All channels ran except where noted:
- Web channel: 4 probes (PM clipboardSerializer / toClipboardHast contract → no industry-standard hit; BlockNote private MIME → confirmed cross-browser sync-event pattern; ClipboardItem.write web-prefix pickling → confirmed Chromium-only with W3C explainer + intent-to-ship; tiptap handlePaste → confirmed editorProps API; Linear copy-as-markdown → confirmed 2026 feature). Did not chase OS clipboard manager-specific behavior (Alfred/Maccy/Raycast) — adjacent thread, MAC-only ecosystem.
- Code channel: full inline scan of all 17 clipboard module files + 4 markdown pipeline files + 4 custom-node extensions + registry types.
- OSS channel: BlockNote toClipboard/fromClipboard fully read; tiptap, prosemirror-remark, slate-yjs, lexical, hocuspocus, y-prosemirror surfaced as adjacent.
- Reports channel: 7 relevant reports surfaced from CATALOGUE; deep-read on tiptap-clipboard-round-trip + audit stub.
- Catalogs: no `product-surface-areas` / `internal-surface-areas` / `audience-impact` skills exist in repo `.claude/skills/`.
- User sources: predecessor specs + audit stub + user outcomes + changelog all read.

### Contradictions / stale claims surfaced across the four sources

1. **2026-04-16 SPEC §15 NG1 revisit criterion is now MET** — "users report round-trip fidelity loss on OK → OK cross-tab paste that text/plain markdown can't recover." User intake reports this directly. Should be promoted from `[NOT NOW]` to in-scope here. SPEC §15 NG1 prose still reads NOT NOW; does not reflect the unblocking.

2. **2026-04-16 SPEC FR-3 Branch labeling vs current code** — SPEC says branches "(1) VS Code MIME → fenced code; (2) text/x-gfm → markdown; (3) data-pm-slice → PM native; (4) generic text/html → rehype; (5) text/plain → MarkdownManager.parse". Current code at `handle-paste.ts` labels them A/B/C/D/E in different telemetry strings (`branch: 'A'/'B'/'C'/'D'/'E'`). Identical semantics, divergent labels. Spec drafting should pick one and stop drift.

3. **2026-04-16 SPEC §8 "Current state" describes pre-implementation behavior** — "Copy: PM default emits text/plain via DOM-text extraction (loses markdown markers)…" That's pre-implementation; the spec was approved and shipped. SPEC § text now stale, code is the truth. The `cb-v2-round-trip-preservation-audit/README.md` is a more accurate post-ship description but covers disk side, not paste.

4. **2026-04-23 SPEC has gone through SIX major architectural revisions** post-baseline (§1 corrigendum + 2026-04-25 canonical/compat split + 2026-04-27 lowercase pivot + 2026-04-28 Convert-button trim). The SPEC.md prose in §6 Functional requirements (FR-1..FR-21) PARTIALLY matches the post-corrigendum code — the lowercase media canonical pivot (Image→img) is acknowledged in §1 corrigendum banner but lower in the SPEC the prose still uses `Image` capitalized. This is the post-ship corrigendum-annotation pattern formalized in CLAUDE.md but the SPEC doesn't follow it consistently.

5. **2026-04-23 SPEC §I12 invariant status RESTORED i16** vs `evidence/cut-inventory.md` "i16 deletion" — `_changelog.md` 2026-04-23 session-2 records the flip; SPEC.md and evidence files updated. No contradiction in current state, just historical drift through the audit cycle. (Listed for completeness.)

6. **`blocknote/html` private MIME observed in OSS** — BlockNote's `acceptedMIMETypes.ts` reads `blocknote/html` BEFORE `text/markdown` BEFORE `text/html`. 2026-04-16 SPEC NG5 NEVER `text/markdown` while BlockNote READS `text/markdown` (their inbound, not outbound). This is consistent — NG5 banned OK from EMITTING text/markdown; reading it (when present from another app) is fine. But the inbound dispatcher could be widened to read `text/markdown` for sources that emit it (none surveyed). Potential future addition; no contradiction.

7. **2026-04-16 SPEC §16 STOP_IF #5** — "FR-21 chunked-insertion E2E fails the 60fps frame-timing assertion on iOS Safari" + 2026-04-17 chromium-only CI. STOP_IF references iOS Safari but CI runs chromium-only. Test enforcement gap noted but not a new contradiction.

8. **SPEC §16 STOP rule "use `handleDOMEvents.copy/cut/dragstart` to override PM's clipboard path on WYSIWYG (D14 LOCKED uses PM hooks)"** — BlockNote's prior-art for the toClipboardHast contract uses exactly that pattern (DOM `handleDOMEvents.copy/cut/dragstart`). The OK STOP rule banning DOM-level overrides is for WYSIWYG only and is per-precedent-#19(b); BlockNote's pattern is cross-OK-precedent. **Adopting BlockNote's exact mechanism on WYSIWYG would violate STOP.** A toClipboardHast contract on the OK side has to thread through PM's `clipboardSerializer.serializeFragment` hook, not DOM-level events. This is decision-implicating for D3.

9. **`is-markdown.ts` JSX gap.** Heuristic doesn't include JSX shape signals. The cross-machine D4 scenario (raw `<Callout>` markdown emailed/Slacked, pasted into OK as text/plain only) directly hits this — Branch E with zero markdown signals → verbatim plaintext insert. The OK-canonical bytes (MDX form) are not recognized. Surfaces D4 as a P0 gap. (Also called out in Q1 enumeration above.)

---

## 10. Suggested next steps (for spec orchestrator, NOT prescriptive)

The spec's Step 5 (Iterate) should:

- Resolve Q1 by a path-by-path enumeration: cross every product surface (J1-J4) with every dispatcher branch (A-E) and every custom node type (jsxComponent capitalized / lowercase media via Option B / wikiLink / jsxInline / rawMdxFallback / compat descriptors GFMCallout / CommonMarkImage / HtmlDetailsAccordion). Construct the byte-identity matrix.
- Resolve Q2-Q4 by adapting BlockNote's `selectedFragmentToHTML` shape (`{clipboardHTML, externalHTML, markdown}`) to the descriptor-keyed registry. The `toClipboardHast` contract is sister to `serialize`; the dispatch site is `mdast-to-hast-handlers.ts` (`mdxJsxFlowHandler` + `mdxJsxTextHandler` currently call `tryNativeHtmlPrimitive` first — this is where descriptor lookup goes).
- Resolve Q5 by enumerating the 5 transports and checking what survives each. Most decisive: cross-machine markdown-via-email path requires `is-markdown.ts` to recognize JSX shape signals, since text/plain is the only surviving channel.
- For OK→OK same-machine Q1 cases: the existing `data-pm-slice` Branch C path is the lossless answer; failures there are bugs (the user's `<img>` regression). For OK→OK cross-tab via clipboard managers (Maccy/Raycast strip unknown MIMEs): Option D private MIME revisits as decision-implicating.
- For the D3 contract: BlockNote's prior-art pattern + the existing `JsxComponentMetaBase.serialize` give a near-trivial extension — `toClipboardHast: (node, ctx) => HastNodes` with default fallback to `tryNativeHtmlPrimitive`-or-`<pre>`.
