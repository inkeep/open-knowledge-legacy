---
date: 2026-04-29
type: meta
sources:
  - packages/app/src/editor/clipboard/handle-paste.ts
  - packages/app/src/editor/clipboard/source-clipboard.ts
  - packages/app/src/editor/clipboard/serialize.ts
  - packages/app/src/editor/TiptapEditor.tsx (editorProps wiring lines 244-257)
  - node_modules/prosemirror-view/src/input.ts (handlers.copy line 595, doPaste line 634, handlers.dragstart line 681, handleDrop line 728)
  - node_modules/prosemirror-view/src/clipboard.ts (serializeForClipboard line 5, parseFromClipboard line 43)
  - packages/core/src/markdown/mdast-to-html.ts (markdownToHtml + mdastToHtml)
  - packages/core/src/markdown/mdast-to-hast-handlers.ts (mdxJsxFlowHandler / mdxJsxTextHandler dispatch site)
  - packages/core/src/markdown/index.ts (markHandlers wiring lines 1120-1223 + nodeHandlers around line 685)
  - packages/core/src/markdown/autolink-void-html-guard.ts (LOWERCASE_HTML_TAG_RE protection lines 207-230, restoreFromMdx 437-457)
  - packages/core/src/markdown/to-markdown-handlers.ts (text/safeText with stripped `<` line 555)
  - packages/core/src/markdown/pipeline.ts (parseMd uses protectFromMdx; markdownToHtml does NOT)
  - packages/core/src/extensions/shared.ts (no Underline disable in StarterKit configure)
  - node_modules/@tiptap/starter-kit/dist/index.js (default-imports Underline)
  - node_modules/@tiptap/extension-underline/dist/index.js (parseHTML `tag: 'u'`, no markdown handler)
  - node_modules/@handlewithcare/remark-prosemirror/lib/mdast-util-from-prosemirror.js (line 105 — unhandled marks silently dropped)
  - node_modules/hast-util-to-mdast/lib/handlers/index.js line 202 (`u: em`)
  - node_modules/mdast-util-to-hast/lib/handlers/html.js (drops mdast `html` when allowDangerousHtml unset)
  - packages/app/tests/stress/paste-fidelity.e2e.ts (FR-22 dragstart parity, F4 QA-043 drag-in)
---

# Q9 / Q10 / Q28 — Track C runtime verification

Three runtime traces to verify the FR-13-first dispatcher reorder (D5/D13) and `toClipboardHast` contract (D10/D11) preserve drag-and-drop fidelity (Q9), cross-view symmetry (Q10), and the `<u>foo</u>` raw-HTML-inline round-trip (Q28). Source-grounded against the canonical PM hooks and the OK markdown pipeline.

## Q9 — Drag-and-drop fidelity through dispatcher reorder

PM owns three drag scenarios. Each is verified against `prosemirror-view/src/input.ts` and `prosemirror-view/src/clipboard.ts`.

### Q9.1 — Drag-out (OK selection → external app)

Code path verified. `handlers.dragstart` (`input.ts:681-708`) calls `serializeForClipboard(view, draggedSlice)` at line 700 — the same function `handlers.copy` calls at line 602. `serializeForClipboard` (`clipboard.ts:5-39`) reads:

- `clipboardSerializer` via `view.someProp("clipboardSerializer")` at line 17.
- `clipboardTextSerializer` via `view.someProp("clipboardTextSerializer")` at line 36.

Both hooks are wired in `TiptapEditor.tsx:254-255` and produce the same outputs as Cmd+C. The new `toClipboardHast` dispatch lives downstream of `serializeFragment` inside `markdownToHtml(...)`'s `remark-rehype` step (`mdast-to-hast-handlers.ts:148/181`). Dragstart therefore inherits the same dispatch.

**Existing E2E coverage.** `paste-fidelity.e2e.ts:507-540` (`'dragstart writes both text/plain markdown AND text/html with data-pm-slice'`) asserts the parity invariant by capturing `setData` calls on a `DataTransfer` during `editor.dispatchEvent(new DragEvent('dragstart', ...))`. Adding a `toClipboardHast` invocation under this trace requires no new e2e fixture — extending the existing one with a `<Callout>` selection seeded ahead of dispatchEvent suffices to prove `data-callout-type` lands in the captured `text/html`.

**Behavior preserved: yes.** No code path bypasses serialize hooks for the outbound side. FR-13-first reorder lives entirely in the **inbound** dispatcher (`handle-paste.ts`), so drag-out is structurally untouched.

### Q9.2 — Drag-in (external content → OK editor)

Code path verified. `editHandlers.drop` (`input.ts:720-726`) calls `handleDrop` (line 728), which at line 738 invokes `parseFromClipboard(view, getText(event.dataTransfer), event.dataTransfer.getData("text/html"), false, $mouse)` — the **same call signature** PM uses inside `doPaste` (`input.ts:635`) for ⌘V.

Both paths then reach `view.someProp("handlePaste", f => f(view, event, slice || Slice.empty))` (drop at line 742, paste at line 636). `handlePaste` is wired in `TiptapEditor.tsx:256` to the dispatcher returned by `createHandlePaste`. **One dispatcher, both events.** The FR-13-first reorder applies on drag-in identically to ⌘V.

**Existing E2E coverage.** `paste-fidelity.e2e.ts:791-834` (`QA-043 external drag-in from a Gmail-shaped HTML payload routes through Branch D`) dispatches `dragover` + `drop` with a Gmail `<div class="gmail_quote">` payload and asserts the cleanup-plugin output (no `gmail_quote`/`gmail_default` survives) — proving Branch D fired through the drop pipeline. The same coverage shape extends to the FR-13-first reorder: a fixture pasting the markdown `# Title\n\n**bold**` via `drop` should land through Branch B (FR-13) post-reorder. ~20 LoC of fixture coverage in Q11.

**Behavior preserved: yes.** Both ⌘V and external drag-in route through the same `handlePaste` hook → same dispatcher → same FR-13-first reorder.

### Q9.3 — Internal drag (within-OK selection moved to another position)

Code path verified. `handlers.dragstart` at line 708 sets `view.dragging = new Dragging(slice, dragMoves(view, event), node)` — a sync-time capture of the original PM slice. `handleDrop` at line 734 reads `slice = dragging && dragging.slice` BEFORE calling `parseFromClipboard`. The `if (slice) { ... } else { slice = parseFromClipboard(...) }` branch (lines 734-740) means **internal drags never re-enter the parse pipeline** — PM uses the captured Slice directly via `tr.replaceRange(pos, pos, slice)` at line 765.

The FR-13-first reorder lives in the dispatcher hooked to `handlePaste`. `handleDrop` does call `view.someProp("handleDrop", f => f(view, event, slice || Slice.empty, move))` at line 742 — but OK does NOT register a `handleDrop` editorProp (`grep handleDrop packages/app/src/editor/TiptapEditor.tsx` returns no match). So PM's default drop runs `tr.replaceRange` with the captured slice intact.

**Behavior preserved: yes.** Internal drag bypasses the dispatcher entirely. The fast path is structurally untouched by FR-13-first.

### Q9 verdict

All three scenarios preserved. Existing E2E coverage at `paste-fidelity.e2e.ts:495-540` (FR-22 dragstart parity) and `paste-fidelity.e2e.ts:779-834` (F4 drag-in) covers the structural invariants. The FR-13-first reorder needs incremental fixture coverage in Q11 for two cells:

1. Drag-out of a `<Callout>` selection — assert `data-callout-type` lands in the captured `text/html` (`toClipboardHast` invocation through dragstart hook).
2. External drag-in of `# H\n\n**b**` markdown — assert Branch B fires through drop (FR-13-first applies to drag-in symmetrically).

No gaps in PM's drag mechanics that the reorder could break.

## Q10 — Cross-view symmetry under toClipboardHast

The cross-view symmetry invariant (precedent #19, FR-7, D2/D4): same logical selection in WYSIWYG and Source views must produce byte-identical text/plain and text/html on copy.

### Q10.1 — Outbound paths share the markdown intermediate

WYSIWYG copy (`serialize.ts:79-99` + `109-125`):
1. `clipboardTextSerializer` → `sliceToMarkdown(slice, schema, mdManager)` → `mdManager.serialize(...)` → markdown string. Sets `text/plain`.
2. `MdastClipboardSerializer.serializeFragment` → `renderFragmentToHtml(fragment, schema, mdManager)` → `sliceToMarkdown(...)` (SAME markdown string) → `markdownToHtml(markdown)` → HTML string. Set as `text/html` by PM's `serializeForClipboard` (`clipboard.ts:5-39`).

Source copy (`source-clipboard.ts:91-95`):
1. `view.state.sliceDoc(from, to)` → markdown string. Sets `text/plain`.
2. `markdownToHtml(markdown)` → HTML string. Sets `text/html`.

**Equivalence point: the markdown string.** Both views funnel into `markdownToHtml(md)` (`mdast-to-html.ts:148-165`) which is the SAME unified processor every time:

```
remarkParse → remarkFrontmatter['yaml'] → remarkMdxAgnostic → remarkGfm
  → remarkWikiLink → remarkRehype { handlers: customNodeHandlers }
  → rehypeSanitizeUrls → rehypeStringify
```

`customNodeHandlers` (`mdast-to-hast-handlers.ts:246-257`) is the canonical dispatch site for `mdxJsxFlowHandler` and `mdxJsxTextHandler` — the new `toClipboardHast` lookup will sit inside both at the same call site, guaranteed to fire on both copy paths.

### Q10.2 — Same descriptor → same `toClipboardHast` invocation

The handlers receive `node: MdxJsxFlowElement | MdxJsxTextElement` from remark-rehype. Whether the mdast tree was produced via `remarkParse(sourceMarkdown)` (Source path) OR via `mdManager.serialize → fromProseMirror → remark-stringify → remarkParse` (WYSIWYG path), the **mdast shape** at the dispatch site is identical for the same logical content. `node.name`, `node.attributes`, and `node.data?.sourceRaw` are stable across the two arms — verified by the `serialize: (node, ctx) => mdast` round-trip discipline (D-MF20).

**Symmetry verified: yes.** A future `toClipboardHast` invocation for, say, `Callout`-named flow elements will dispatch via `mdxJsxFlowHandler` lookup keyed on `node.name`. Both copy arms reach this site with the same `node` shape, so both produce the same hast output, so both produce the same `text/html` bytes.

### Q10.3 — FR-21 chunked Y.Text insert preservation

`source-clipboard.ts:265-325` keeps the chunked-insert path. The dispatcher reorder (D13 — FR-13 ahead of `data-pm-slice`) lives **above** Branch D's `tryBranchDHtml` invocation. Walk-through:

- Branch A (vscode-editor-data) at lines 137-145 — unchanged.
- (NEW under D13) FR-13 markdown-first ahead of Branch C — operates on `text/plain` only; bytes inserted via `view.dispatch` of the markdown text. Source's underlying CRDT is markdown, so a small/medium markdown insert via CM6 dispatch is the natural path. **No chunked code touched.**
- Branch C (`data-pm-slice`) at lines 151-159 — unchanged behavior (return false, let CM6 default insert text/plain verbatim).
- Branch D (HTML) at lines 162-180 — unchanged. Inside `tryBranchDHtml` at 264-272 the `shouldChunk = markdown.length > 500 * 1024` gate routes >500KB pastes through `chunkedYTextInsert`. **D13 doesn't modify this branch.**

The FR-13-first reorder does not bypass or restructure the chunked insert. The largest payloads land via Branch D where chunked insert lives; FR-13 routes only when `text/plain` is present and `isMarkdown(plain)` returns true. If a Branch B FR-13 hit produced a >500KB markdown insert, current Source dispatcher uses CM6's `view.dispatch` directly (no chunking) — but this is the **existing** behavior in the predecessor SPEC's text/x-gfm Branch B path, not new.

**FR-21 preserved: yes.** No change to the chunked insert gate or the `chunkedYTextInsert` call site. If Track C wants to extend chunking to Branch B FR-13 (a separate ask), that's additive ~10 LoC to mirror the >500KB gate.

### Q10 verdict

Cross-view symmetry holds under `toClipboardHast`. Both WYSIWYG and Source copy funnel into the same `markdownToHtml(md)` processor, reaching the same `mdxJsxFlowHandler/mdxJsxTextHandler` dispatch site with the same mdast shape for the same logical content. FR-21 chunked insert is structurally untouched.

## Q28 — `<u>foo</u>` cross-view symmetry runtime trace

The user's specific UNVERIFIED flag: copy `<u>foo</u>` from one OK view, paste into another OK view (or doc). Mental runtime trace, not executed.

### Q28.1 — Underline mark IS active in OK (not what the question premised)

`packages/core/src/extensions/shared.ts:62-75` configures StarterKit but does NOT pass `underline: false`. `node_modules/@tiptap/starter-kit/dist/index.js` shows `if (this.options.underline !== false) extensions.push(Underline.configure(...))`. Therefore **TipTap's `Underline` mark is registered** in the OK schema with:

- `parseHTML: [{tag: 'u'}, {style: 'text-decoration', getAttrs: s => s.includes('underline') ? {} : false}]`
- `renderHTML: ['u', mergeAttributes(...), 0]`
- Keyboard shortcut: `Mod-u` toggles the mark.
- TipTap's `parseMarkdown` / `renderMarkdown` are present BUT not wired through OK's pipeline (OK uses unified/remark, not TipTap's markdown helpers).

### Q28.2 — There is NO markHandler for underline in OK's PM→mdast layer

`packages/core/src/markdown/index.ts:1120-1223` registers markHandlers only for emphasis, strong, code, delete/strike, link, escapeMark, sourceLiteral. **No `markHandlers.underline` exists.** The upstream library at `node_modules/@handlewithcare/remark-prosemirror/lib/mdast-util-from-prosemirror.js:105` is explicit: `const handler = state.markHandlers[mark.type.name]; if (!handler) return children;` — **unhandled marks are silently dropped** and the wrapped children pass through naked.

**Consequence:** any time an Underline mark exists on a PM tree, `mdManager.serialize(...)` strips it. The mark only survives as long as the PM tree lives in memory. On disk persistence, on copy via the markdown serializer, on cross-view propagation through Y.Text — Underline is gone.

### Q28.3 — Disk → PM round-trip for `Some <u>foo</u> text`

1. Disk bytes: `Some <u>foo</u> text`.
2. `mdManager.parse(bytes)` runs through `pipeline.ts:236` which calls `protectFromMdx(source)` first. `autolink-void-html-guard.ts:208-230` matches `</u>` via `HTML_CLOSE_TAG_RE` and `<u>` via `LOWERCASE_HTML_TAG_RE` (lowercase not in `LOWERCASE_JSX_CANONICAL_TAGS = {img, video, audio}`). PUA sentinels replace `<` and `>`.
3. `remark-parse` sees `Some ufoo/u text` — pure text, no inline HTML claim.
4. `restoreFromMdx` (`autolink-void-html-guard.ts:437-457`) walks mdast and replaces PUA sentinels back to `<` and `>` on `text.value`/`url`/`title`/`alt` fields.
5. mdast: paragraph with single text node `value: 'Some <u>foo</u> text'`. **No `data.sourceRaw`** — `position-slice.ts` does NOT attach sourceRaw to text nodes (only to thematicBreak, mdxJsx*, link with empty children, trailing-backslash text).
6. mdast → PM: `handlers.text(node)` at `index.ts:458-505` reads `node.data?.sourceRaw` (undefined), `node.data?.escapedChars` (undefined) → falls to `schema.text(value.replaceAll(' ', ' '))` at line 481. Returns text node with literal value `Some <u>foo</u> text` and **no marks**.

**Disk → WYSIWYG state:** no Underline mark applied. The literal characters `<` `u` `>` etc. render as inert text glyphs in WYSIWYG. **The PM Underline mark's markdown representation does not exist** — it's bypassed entirely. Underline mark application never lands on disk-loaded content.

### Q28.4 — WYSIWYG copy → text/plain bytes

`serialize.ts:46-55` → `sliceToMarkdown(slice, schema, mdManager)` → `mdManager.serialize(docJson)`:
- `fromProseMirror` walks PM tree. Text node value `Some <u>foo</u> text`, no marks.
- mdast text node: `{ type: 'text', value: 'Some <u>foo</u> text' }`. No marks → no markHandler invoked.
- `to-markdown-handlers.ts:43-74` text handler: `node.data?.sourceRaw` undefined → `safeText(state, value, info)` at line 73.
- `safeText` (line 551) strips `<` from unsafe list — output preserves literal `<u>foo</u>` chars.

**text/plain output bytes: `Some <u>foo</u> text`** ✓ (matches input bytes)

### Q28.5 — WYSIWYG copy → text/html bytes

`serialize.ts:109-125` → `markdownToHtml('Some <u>foo</u> text')`:
- `mdast-to-html.ts:148-165` builds `unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkMdxAgnostic).use(remarkGfm).use(remarkWikiLink).use(remarkRehype, { handlers: customNodeHandlers }).use(rehypeSanitizeUrls).use(rehypeStringify)`.
- **`markdownToHtml` does NOT call `protectFromMdx`** (verified — `pipeline.ts:236` is `parseMd`, separate function from the `markdownToHtml` builder).
- `remarkParse` sees the bytes and tokenizes per CommonMark: `<u>` and `</u>` are recognized as inline raw HTML. mdast: paragraph with children `[text 'Some ', html '<u>', text 'foo', html '</u>', text ' text']`.
- `remark-rehype` with default options (no `allowDangerousHtml`). `mdast-util-to-hast/lib/handlers/html.js:19-28` returns `undefined` when `allowDangerousHtml` is unset → mdast `html` nodes are dropped from hast.
- hast paragraph with text children `[text 'Some ', text 'foo', text ' text']` → rehype-stringify → `<p>Some foo text</p>`. **`<u>` tags erased.**

**text/html output bytes: `<p>Some foo text</p>` (no `<u>`).** Existing test asserts this at `mdast-to-html.test.ts:92-99` (`'script HTML in markdown passthrough is dropped (no allowDangerousHtml)'`) — design-intentional NG7 storage-fidelity behavior.

### Q28.6 — Source copy → text/plain + text/html

`source-clipboard.ts:91-95`:
- `view.state.sliceDoc(from, to)` returns CM bytes verbatim: `Some <u>foo</u> text`.
- `dt.setData('text/plain', markdown)` — bytes preserved.
- `markdownToHtml(markdown)` — same pipeline as Q28.5 → `<p>Some foo text</p>`.

**Cross-view symmetry on outbound: HOLDS BYTE-FOR-BYTE.** Both views produce identical text/plain (`Some <u>foo</u> text`) and identical text/html (`<p>Some foo text</p>`).

### Q28.7 — OK→OK paste-back behavior

The cross-view symmetry holds on the COPY side. The PASTE side reveals an asymmetry. Walking the dispatcher:

- text/plain on clipboard: `Some <u>foo</u> text`. text/html on clipboard: `<p data-pm-slice="0 0 [...]">Some foo text</p>` (PM auto-attaches `data-pm-slice` per `clipboard.ts:32-34` regardless of element shape).
- WYSIWYG paste with FR-13-first dispatcher (`handle-paste.ts:106-112`): `isMarkdown(plain)` → 0 signals match → returns false. FR-13 does NOT fire. Branch C `data-pm-slice` at lines 96-104 detects the marker → returns false → PM's `parseFromClipboard` runs.
- PM parses text/html through TipTap's parseDOM rules. Since `<u>` tags were erased upstream, the parsed slice is text "Some foo text" with NO Underline mark. **`<u>` lost.**
- Source paste with FR-13-first dispatcher (`source-clipboard.ts:151-159`): Branch C returns false → CM6 default insert of text/plain verbatim → bytes `Some <u>foo</u> text` preserved.

**Source → Source: bytes preserved. Source → WYSIWYG: bytes lost. WYSIWYG → Source: bytes preserved (text/plain). WYSIWYG → WYSIWYG: bytes lost.**

The asymmetry is on the WYSIWYG INBOUND side. Branch C wins because `isMarkdown` doesn't recognize raw HTML inline as a markdown signal.

### Q28.8 — Shape of the fix

Two viable fixes, ordered by alignment with the spec's proposed solution:

**Fix A (preferred): extend `is-markdown.ts` with a raw-HTML-inline signal.** Add a regex like `/<[a-z]+>[^<\n]*<\/[a-z]+>/` (lowercase paired tags) to D8's signal extension. Estimated ~8 LoC + 3 fixture cases. Effect: text/plain `Some <u>foo</u> text` would have 1 signal; combined with the existing threshold formula `min(3, floor(lineCount/5))` and the `Math.max(1, threshold)` floor (assumed in D8), a single-line raw-HTML-inline payload would hit the threshold of 1 → Branch B routes via mdManager.parse → bytes preserved through the protectFromMdx → restoreFromMdx round-trip → PM text node value `Some <u>foo</u> text` (no marks). **Round-trip byte-identical OK→OK.**

A2 false-positive risk: a single signal triggers Branch B for any line containing a paired lowercase tag. Worst case: prose containing `<i>foo</i>` would route through markdown parse. Since the markdown-to-PM path also preserves `<u>foo</u>` bytes verbatim (via the same protectFromMdx round-trip), this is byte-stable for the prose-with-incidental-tags case too. Acceptable.

**Fix B (out of scope): pass `allowDangerousHtml: true` to `remarkRehype` and `rehypeStringify` in `markdownToHtml`/`mdastToHtml`.** Effect: text/html would preserve `<u>` tags. Branch C parseDOM would then apply the Underline mark, but on serialize-back the unhandled-mark drop kicks in (Q28.2) — bytes not preserved through the round-trip. Plus this contradicts NG7 (no paste-time DOMPurify; storage-fidelity contract). Reject.

**Fix C (out of scope): add `markHandlers.underline` that emits `html` mdast nodes.** Effect: PM Underline mark survives serialize as `<u>foo</u>` bytes. But the disk-loaded path never APPLIES the Underline mark (Q28.3) — text node value is literal `<u>foo</u>` chars without the mark. So the markHandler would only matter for transient editor state where the user pressed Cmd+U. Doesn't fix the cross-view paste-back asymmetry.

### Q28 verdict

- **Cross-view symmetry on COPY: HOLDS byte-for-byte.** Both views write identical text/plain and identical text/html. Verified through source-grounded trace of `markdownToHtml`, `safeText`, the protect/restore guard, and the unhandled-mark drop in remark-prosemirror.
- **Cross-view symmetry on PASTE-BACK: BREAKS for WYSIWYG inbound.** Branch C wins because `isMarkdown` doesn't recognize raw HTML inline; PM's parseFromClipboard parses the (already-stripped) text/html. text/plain bytes are not consulted.
- **Underline mark: effectively a no-op feature in OK** — applied transiently in the editor (Cmd+U), silently dropped on every PM→mdast serialize. Latent bug separate from Q28 but worth surfacing.
- **Fix shape: Fix A — extend `is-markdown.ts` with a raw-HTML-inline signal**, ~8 LoC + fixture coverage. Threads the spec's proposed solution (D8 heuristic extension) without architectural change. Verifies under D5/D13 dispatcher reorder because Branch B (FR-13) would precede Branch C, and the markdown-parse round-trip preserves bytes via `protectFromMdx`/`restoreFromMdx`.

Recommendation: add the raw-HTML-inline signal to D8 alongside the 5 already-locked signals. Cite Q28 evidence in the D8 amendment.
