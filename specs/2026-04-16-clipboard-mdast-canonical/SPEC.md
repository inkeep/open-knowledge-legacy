# Clipboard Round-Trip with Markdown (mdast-canonical) — Spec

**Status:** Approved
**Owner(s):** Nick
**Last updated:** 2026-04-16
**Baseline commit:** `bb655f7`
**Links:**
- Research report: [reports/tiptap-clipboard-round-trip-markdown/REPORT.md](../../reports/tiptap-clipboard-round-trip-markdown/REPORT.md) (Parts 1 + 2 + 3)
- Research evidence: 8 files under `reports/tiptap-clipboard-round-trip-markdown/evidence/`
- Spec evidence: `./evidence/` (spec-local 1P findings)
- Companion reports: R18 paste landscape (`reports/markdown-editor-paste-and-html-survey/`)

---

## 1) Problem statement

**Situation.** Open Knowledge is a dual-mode markdown-canonical editor: WYSIWYG (TipTap over `Y.XmlFragment`) + Source (CodeMirror 6 over `Y.Text`), kept in sync by bidirectional observers. Today's clipboard behavior:

- **WYSIWYG copy:** produces ProseMirror's default `text/plain` (DOM-text extraction, loses markdown markers) + `text/html` (PM schema toDOM). The canonical markdown of the selection is NOT on the clipboard.
- **WYSIWYG paste:** `text/plain` is parsed as markdown via `MarkdownManager.parse` (Archetype D, correct). `text/html` uses PM's default schema parseDOM — works for trivial cases, but rich HTML from Google Docs/Notion/Word/Gmail either degrades silently or stuffs vendor-garbage (Google Docs guid wrappers, Word `mso-*` styles) into the doc.
- **Source copy:** CM6 default writes `text/plain` only (markdown source — good). No `text/html`. Pasting from Source into Gmail/Slack/Notion renders as monospace markdown-literal with no formatting.
- **Source paste:** CM6 default reads `text/plain` only, ignores `text/html`. Rich HTML from any external source silently loses formatting.

**Complication.** Our target users and product positioning both depend on seamless round-trip between our editor and adjacent tools:

- **Humans** constantly move content between email, docs, chat, and knowledge bases. Notion, Obsidian, and the modern docs ecosystem set the UX bar at "paste from anywhere, get structured content" and "copy from here, get formatting where I paste." We fall short on all four clipboard paths.
- **Agents** increasingly produce output in chat interfaces (Claude, ChatGPT) that users copy into our editor — this is the paste case. Agents also produce content in our editor that users paste into email/docs/Slack for review — this is the copy case.
- **Greenfield posture.** We're building new architecture; incrementally bolting on clipboard handling per-view without a canonical pipeline would set the wrong precedent. Every other rich-editor ecosystem already has its canonical conversion hub (PM schema parseDOM for Notion, Slate deserializers for Plate, adapter registries for BlockSuite). We don't, yet.
- **Observer bridge invariant.** The existing Y.XmlFragment ↔ Y.Text bridge imposes an architectural constraint on *how* we handle paste into Source — CRDT transactions must be user-origin to flow through Observer B correctly.

**Resolution.** Build a canonical unified pipeline with **mdast as the intermediate hub** for all four clipboard paths. Two new shared modules (`html-to-mdast`, `mdast-to-html`) serve both views symmetrically; the only per-view divergence is the final stage (PM handlers for WYSIWYG, remark-stringify for Source). Custom nodes (wikiLink, jsxComponent, rawMdxFallback, jsxInline) get first-class mdast representations, with distinct serialization paths for markdown and HTML — so a wikiLink renders as `[[Page]]` in text/plain and as a semantic anchor in text/html. Source-specific cleanup (Google Docs wrappers, Word `mso-*`, Gmail classes, etc.) lives as composable rehype plugins, added iteratively as destinations surface pain.

## 2) Goals

- **G1.** Copy from either view writes both `text/plain` (canonical markdown source) and `text/html` (canonical rendered HTML) such that pasting the same selection into Gmail, Slack, Notion, GitHub, VS Code, or Obsidian produces the semantically-correct result in each destination — and pasting back into Open Knowledge round-trips losslessly via the text/plain path.
- **G2.** Paste into either view preserves structure from rich HTML sources (Gmail, Google Docs, Notion, Word, Apple Notes, VS Code, generic websites). Markdown in text/plain continues to round-trip via Archetype D. PM-origin clipboard (our own WYSIWYG, Linear, Outline, other TipTap siblings) routes through the native path.
- **G3.** Single canonical conversion pipeline with mdast as the hub. No per-view special cases in the pipeline modules. Custom-node rendering (wikiLink, MDX components) defined once, consumed by both views.
- **G4.** Drag-and-drop and cut symmetric with copy/paste — no regressions to existing DnD behavior.
- **G5.** Observer bridge invariants preserved — Source paste is user-origin, flows through Observer B normally, no new origin-guard churn.

## 3) Non-goals

- **[NOT NOW]** NG1: BlockNote-style private MIME (`blocknote/html` or `web text/x-ok-slice`) for lossless internal-roundtrip of custom nodes. — Revisit if: users report round-trip fidelity loss on OK → OK cross-tab paste that text/plain markdown can't recover.
- **[NOT NOW]** NG2: Cmd+Shift+C "Copy as Plain Text" command (strip-all-formatting variant). — Revisit if: users report pasting from Source into Slack with rendered bold surprises them (they expected literal `**bold**`).
- **[NOT NOW]** NG3: CKEditor-grade Word list reconstruction (`mso-list:l1 level1 lfo1` hint extraction + nested ol/ul rebuild). — Revisit if: Word paste becomes a priority use case and the MVP mso-* stripping isn't sufficient.
- **[NOT NOW]** NG4: Image paste — dedicated handling (binary MIME routing, RTF sibling-data extraction, drag-and-drop image support). — Revisit if: image paste is prioritized; separate spec. **Mixed paste behavior (prose + inline images in one clipboard)**: rehype-remark's default handling maps `<img>` → mdast `image` → `![alt](url)` markdown → our PM image node. URLs from source apps (e.g. googleusercontent.com, cid: references) typically 403 or fail to resolve outside their context — user sees broken image placeholder and must re-upload manually. A `rehypeStripInlineImages` opt-in plugin is catalogued in §15 Future Work: Identified.
- **[NOT NOW]** NG9: Complex table features beyond simple rectangular GFM tables — colspan/rowspan reconstruction, Google Sheets `data-sheets-value`/`data-sheets-formula` preservation, Word nested tables, Apple Numbers cell metadata. Basic rectangular tables from Google Docs, Gmail rich HTML, Apple Notes round-trip via rehype-remark's default GFM table handling. Complex tables degrade to best-effort GFM (cells preserved; colspan/rowspan lost). — Revisit if: table paste fidelity becomes a reported gap.
- **[NEVER]** NG5: `text/markdown` MIME emission. Safari/WebKit rejects it from `ClipboardItem.write`, zero destinations read it. Evidence: Part 1 §D2.
- **[NEVER]** NG6: `web`-prefixed Chromium pickling custom MIMEs as a first-order design. Chromium-only, zero Safari/Firefox coverage, no production editor in our survey uses them. Evidence: Part 1 §D2.
- **[NEVER]** NG7: Paste-time DOMPurify / storage-layer sanitization. XSS is a render-layer concern (R18 Archetype Z + CLAUDE.md's storage-fidelity invariant). rehype-remark converts hast → mdast (structurally drops script/attr attacks); anything surviving lands in our existing `htmlBlock` atomic node. Evidence: Part 2 §D16.
- **[NOT UNLESS]** NG8: Preserving CM6's internal `lastLinewiseCopy` smart-linewise-paste state. — Only if: Source-view users report losing this behavior materially impacts their workflow.

## 4) Personas / consumers

- **P1 — Docs writer (human, primary).** Writes agent-ready wiki content in OK. Copies from OK to paste into GitHub PR descriptions, README files, Slack threads, Gmail. Pastes from Google Docs, Gmail, Confluence into OK while migrating content. Expects parity with Notion's clipboard ergonomics.
- **P2 — Knowledge worker (human, primary).** Uses OK as a personal KB. Copies from ChatGPT/Claude (markdown via copy-button; rich HTML via select-and-copy) into OK. Pastes snippets from OK into email and messaging apps.
- **P3 — Agent (via clipboard indirectly).** Agents write directly via MCP tools (not clipboard). But agent-produced content is routinely moved by humans via clipboard, so agent fidelity flows through human clipboard behavior.

## 5) User journeys

Primary flows documented per `references/user-journeys` pattern. Full path-by-path coverage:

### WYSIWYG copy → external destination

| Destination | Happy path | Failure/recovery | "Aha moment" | Debug |
|---|---|---|---|---|
| Gmail web | Cmd+C → paste → email renders bold/headings/lists | If serialize fails, fall through to PM default text extraction (no crash) | "It just pastes as a formatted email" | console.warn on serialize fail |
| GitHub textarea | Cmd+C → paste → markdown source in issue body | N/A | "My markdown round-trips to GitHub" | n/a |
| Slack compose | Cmd+C → paste → formatted rich-text in Slack | N/A | n/a | n/a |
| VS Code `.md` | Cmd+C → paste → markdown source | N/A | n/a | n/a |
| Another OK tab | Cmd+C → paste → identical document state | N/A | "Same content, different tabs stay in sync" | n/a |

### WYSIWYG paste ← external source

| Source | Happy path | Failure/recovery | Detection |
|---|---|---|---|
| Gmail rich HTML | Cmd+V → bold/headings/lists as PM nodes | On html→mdast fail, fall through to text/plain insert | Gmail CSS class fingerprint |
| Google Docs | Cmd+V → wrapped bold stripped, paragraphs as PM | On fail, fall through | `docs-internal-guid` regex |
| Notion | Cmd+V → text/plain Notion-flavored markdown parsed | Fall through to html path if plain empty | `notionvc:` comment heuristic |
| Word | Cmd+V → `mso-*` stripped, paragraphs as PM | Fall through | `xmlns:o` or Generator meta |
| VS Code | Cmd+V → fenced code block with language from `mode` | Fall through | `vscode-editor-data` MIME |
| Our WYSIWYG / Linear / Outline (PM-origin) | Cmd+V → PM native parseFromClipboard | PM handles | `data-pm-slice` attr |
| GitHub textarea | Cmd+V → markdown parsed via MarkdownManager | Fall through | `text/x-gfm` MIME or isMarkdown(text/plain) |
| Generic web | Cmd+V → rehype-remark → mdast → PM | Fall through | No fingerprint → generic branch |

### Source copy/paste journeys — parallel to WYSIWYG; divergence only in final insertion stage.

See Part 3 §D21, D22 of the research report for detailed per-source flows.

### Interaction state matrix

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| WYSIWYG copy | N/A | Empty selection → default PM (no-op) | serialize throws → fall through to PM default | text/plain + text/html set | N/A |
| WYSIWYG paste | N/A | Empty clipboard → no-op | html→mdast throws → fall through to clipboardTextParser | slice replaces selection | Partial rehype cleanup OK |
| Source copy | N/A | Empty selection → CM6 default | markdown→html throws → fall through to text/plain-only | text/plain + text/html set | N/A |
| Source paste | N/A | Empty clipboard → no-op | html→mdast throws → fall through to CM6 default | markdown string inserted | N/A |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR-1: WYSIWYG copy writes text/plain = canonical markdown AND text/html = canonical rendered HTML via PM's documented clipboard hooks (`clipboardTextSerializer` + `clipboardSerializer` subclassing `DOMSerializer`). Both hooks share the pmToMdast intermediate (via a memoized per-copy-event helper), then diverge: `clipboardTextSerializer` → mdastToMarkdown; `clipboardSerializer.serializeFragment` → mdastToHtml wrapped in `<div data-pm-slice="{openStart} {openEnd} {context}">` then parsed to DocumentFragment via `DOMParser`. PM's default copy/cut/dragstart handlers compose on top — `view.dragging` is set naturally, internal DnD fast path preserved. | Cmd+A + Cmd+C in WYSIWYG produces clipboard text/plain that round-trips through MarkdownManager.parse → PM identical to original doc (modulo NG1–NG11 fidelity catalog gaps). Paste into Gmail → rendered formatting. Paste into GitHub → markdown source. Paste into another OK tab → PM-native parseFromClipboard detects `data-pm-slice` and round-trips losslessly. | Research Part 1 §Recommendation + D3 + D14 (flipped to PM hooks under strict greenfield per Q7 resolution) |
| Must | FR-2: text/html emission uses canonical mdast-to-html pipeline (`remark-rehype` + `rehype-stringify`), NOT PM DOMSerializer — no OK-private `data-*` markup leaks to clipboard. Same pipeline used by Source copy (cross-view symmetry). | Paste into Gmail shows semantic HTML (`<a>`, `<strong>`, `<h2>`) with no `data-wiki-link`/`data-jsx-*` attrs | Research Part 3 §D19-2 greenfield amendment |
| Must | FR-3: WYSIWYG paste routes via 5-branch dispatcher: (1) VS Code MIME → fenced code block; (2) text/x-gfm → markdown path; (3) data-pm-slice → PM native parseFromClipboard; (4) generic text/html → rehype pipeline → mdast → PM handlers; (5) text/plain → existing MarkdownManager.parse | Each branch produces the canonical result for its source; unit + integration tests per branch | Research Part 2 §Recommendation |
| Must | FR-4: Source copy via `EditorView.domEventHandlers` overrides CM6 default, writes text/plain = markdown source (CM6 sliceDoc) AND text/html = canonical mdast-to-html | Cmd+A + Cmd+C in Source produces clipboard identical (byte-for-byte) to the equivalent WYSIWYG copy | Research Part 3 §D21 |
| Must | FR-5: Source paste via `EditorView.domEventHandlers` uses a **4-branch dispatcher** parallel to WYSIWYG's 5 (text/x-gfm handling collapses into the text/plain CM6-default path because Source's insertion IS markdown text); HTML branch uses shared `htmlToMdast` → `remark-stringify` → markdown string inserted at selection | Rich HTML from Gmail/Google Docs/Word produces markdown source in Source buffer; observer B propagates to XmlFragment | Research Part 3 §D22 (spec collapses to 4-branch — text/x-gfm redundant in Source because CM6 default already inserts markdown from text/plain) |
| Must | FR-6: Shared module `packages/core/src/markdown/html-to-mdast.ts` exports `htmlToMdast(html: string): Root` wrapping `rehype-parse` + source-cleanup rehype plugins + `rehype-remark`. Used by FR-3 and FR-5. | One module; both consumers call it; no duplication | Research Part 3 §D20 |
| Must | FR-7: Shared module `packages/core/src/markdown/mdast-to-html.ts` exports `markdownToHtml(md: string): string` and `mdastToHtml(tree: Root): string`. Wraps `remark-rehype` + custom-node handlers + `rehype-stringify`. Used by FR-2 and FR-4. | One module; both consumers call it; no duplication | Research Part 3 §D20 |
| Must | FR-8: Custom nodes (wikiLink, jsxComponent, jsxInline, rawMdxFallback) have first-class mdast representations, each with distinct serialization handlers for markdown (existing `to-markdown-handlers.ts`) and HTML (new `mdast-to-html.ts` handlers). The HTML emission uses semantic elements (e.g., wikiLink → `<a class="wiki-link">`) instead of the current opaque `<span data-wiki-link>` wrapper. OK-specific metadata (target, anchor, alias) may persist as `data-*` attrs on the semantic element for paste round-trip self-detection — this is round-trip metadata on a semantic container, NOT opaque data-wrapped content. Non-stable state (e.g. `data-resolved`) is NOT emitted to clipboard since it's server-computed and re-derivable. | Gmail paste of a wikiLink-containing selection shows a clickable link; markdown round-trip via text/plain produces `[[Page]]` | **[NEW DECISION — see §10 D7]** |
| Must | FR-9: Source cleanup is composable rehype plugins. Day-one panel is the **full set of 9 plugins** covering every source with a detection fingerprint in research Part 2 §D13: `rehypeStripGoogleDocsWrapper`, `rehypeStripMsoStyles` (Word + LibreOffice Office HTML), `rehypeStripCocoaMeta` (Apple Notes/Mail/TextEdit/Pages), `rehypeStripGmailClasses`, `rehypeSkipNotionWhitespace`, `rehypeStripVscodeSpans` (structural VS Code fallback), `rehypeStripGsheetsWrapper` (Google Sheets), `rehypeStripSlackClasses`, `rehypeStripGithubHovercard`. Each plugin: (a) a standalone unified plugin ~50–100 LoC, (b) a colocated test file with at least one real captured paste sample as fixture, (c) registered in `html-to-mdast.ts`'s cleanup array in a deterministic order (detection-specific before generic). | Each plugin has a real-sample fixture test passing; both WYSIWYG and Source paste paths register them identically via the shared `htmlToMdast` module | D9 LOCKED under strict greenfield per Q9 resolution; expanded from 6 to 9 per Auditor #7 (adds GSheets/Slack/GitHub-rendered to close all D13 fingerprint gaps) |
| Must | FR-10: Paste into a code block (WYSIWYG) short-circuits to plain-text insert (BlockNote pattern). | Cursor inside codeBlock + paste of any content → text/plain inserted verbatim, no markdown parsing, no HTML conversion | Research Part 2 §D14-3 |
| Must | FR-11: Error-path discipline — on any conversion failure (html→mdast throw, markdown→html throw), fall through to the layer below (Keystatic pattern). No Cmd+C/Cmd+V silently drops content. console.warn with bracket-prefix `[clipboard]` per logging conventions. | Unit test: malformed HTML paste → markdown fallback path; unit test: unserializable PM doc → textBetween fallback. | Research Part 3 §D21 |
| Must | FR-12: Cut inherits copy's MIME-writing behavior. WYSIWYG cut is handled by PM's unified copy/cut handler path (`prosemirror-view/src/input.ts:595`): PM calls both `clipboardTextSerializer` and `clipboardSerializer.serializeFragment`, sets both MIMEs, then (on cut) dispatches `tr.deleteSelection().setMeta('uiEvent', 'cut')`. No explicit cut-specific code on our side — PM handles the symmetry. Source cut via parallel `handleSourceCopyCut` helper (see FR-4) that dispatches delete transaction on `kind === 'cut'`. | Cut from either view produces same clipboard payload as copy + deletes the selection. | Research Part 1 §D7-4, Part 3 §D21; D14 mechanism (PM hooks) |
| Must | FR-13: Ambiguous paste (text/plain AND text/html both present, text/plain looks like markdown) prefers markdown-first (BlockNote `prioritizeMarkdownOverHTML: true` pattern). Hard-coded behavior, no config option. | Paste of markdown-shaped text/plain + simple text/html → parses text/plain as markdown (preserves markdown markers); paste of plaintext text/plain + rich text/html → uses text/html (rich content) | D8 LOCKED — user confirmed |
| Must | FR-14: `isMarkdown(text)` heuristic for Branch 5 (text/plain-only) follows Outline's signal-count pattern: min(3, floor(lineCount/5)) signals across fences, latex, links, headings, bullets, tables. | Unit tests: pasting simple prose does NOT parse as markdown; pasting content with 3+ markdown signals DOES parse. | Research Part 2 §D13 |
| Should | FR-15: Empty-selection copy in either view is a no-op (no clipboard mutation). | Cmd+C with empty selection → clipboard unchanged. | Mirror CM6's own empty-selection guard and PM's. |
| Must | FR-16: Drag-and-drop preserved automatically by PM's default handlers. `clipboardTextSerializer` + `clipboardSerializer` fire on copy/cut/dragstart via PM's own `serializeForClipboard`; PM sets `view.dragging.slice` at dragstart (internal drag fast path preserved — verifiable via `prosemirror-view/src/input.ts:681-709`); internal drop re-uses the saved slice without re-entering paste pipeline; external drag-in goes through full paste pipeline via `parseFromClipboard`. Day-one test coverage: (1) internal drag (drag-within-editor) preserves slice fidelity, (2) external drag-in from Chrome tab routes through paste pipeline, (3) external drag-out to another app produces both text/plain=markdown + text/html=canonical-rendered. | All three drag scenarios land as E2E tests day-one; existing drag tests continue to pass. | Research Part 1 §D7; PM hooks mechanism preserves DnD semantics without special-casing |
| Must | FR-17: Cmd+Shift+V (plain-text paste escape hatch) works across both views via browser-level shift detection. PM: existing `event.shiftKey` flag via `doPaste`. CM6: our handler respects `event.shiftKey` and inserts text/plain verbatim regardless of html presence. | Shift+Cmd+V from Gmail into Source → plaintext inserted, not converted to markdown. | Universal escape hatch per R18; Q3 LOCKED |
| Must | FR-18: Performance instrumentation via structured JSON `console.warn` — shape-mirrors existing `mdx-block-fallback` / `unknown-mdast-type` warn format; purpose is perf instrumentation (timing) rather than parse-fallback counting. Threshold: paste > 250ms, copy > 100ms. Event shape: `{event: 'clipboard-slow-op', op, view, elapsed_ms, branch, source, html_bytes}`. | Slow paste emits the structured warn; log aggregators can derive distributions. | Q6 LOCKED — shape mirrors `packages/core/src/markdown/parse-with-fallback.ts:36,59,69` + `index.ts:513-519,528-534,561-567` |
| Must | FR-19: Copy of a selection entirely inside a code block emits the fenced code block form (``` ```lang\n…\n``` ```) in text/plain and `<pre><code class="language-lang">…</code></pre>` in text/html. No special-case code in our pipeline — this is the natural output of `schema.topNodeType.createAndFill(null, slice.content)` + `mdastToMarkdown` / `mdastToHtml`. | Cmd+C inside a WYSIWYG TypeScript code block, paste into VS Code `.md` → fenced code block. Paste into Gmail → rendered code block. Paste back into OK → round-trips to codeBlock. | Q4 LOCKED — Option A |
| Must | FR-20: Custom-node HTML emission is escape-correct. `mdast-to-hast-handlers.ts` must HTML-entity-encode `<`, `>`, `&`, `"`, `'` in raw source strings (jsxComponent `content`, jsxInline `sourceRaw`, rawMdxFallback text) before injecting into hast text nodes — emit as hast `text` (auto-escaped by rehype-stringify), NOT hast `html` (passthrough). Test coverage: unit tests for each custom node with adversarial input (`<script>alert(1)</script>`, null bytes, XML namespaces, HTML entities); assert output contains `&lt;script&gt;` NOT `<script>`. Fuzz test in `mdast-to-html.test.ts` generates random adversarial content; asserts output has no unescaped `<script>` substring. | Per-node escape test + fuzz test pass in CI. | Security correctness for copy direction — complements D10 (paste-side structural drop) |
| Must | FR-21: Large-paste ergonomic guard (ships day-one, unconditionally — not contingent on benchmark). For any paste whose converted markdown exceeds 500KB, the Y.Text insertion is chunked in ~50KB segments separated by `await new Promise(requestAnimationFrame)` to yield the main thread between chunks. This keeps the UI responsive during conversion + insert. The final Observer B re-parse (one pass on full Y.Text) remains O(total doc size) — documented known tradeoff for v1; incremental re-parse is Future Work: Identified. | E2E test: paste 1MB HTML fixture into a doc containing 5MB of existing text; measure UI frame timing — no frame >16ms during chunked insertion phase (60fps maintained). | Strict greenfield: ship the mitigation day-one rather than "benchmark first, fix if visible." Proactive over reactive. |
| Must | FR-22: Drag-and-drop parity with copy. External drag-out (drag selection from OK editor into another app) writes the same two MIME pair as copy — both text/plain = canonical markdown and text/html = canonical rendered HTML wrapped in `data-pm-slice`. PM's `dragstart` handler (in `input.ts:681-709`) calls `serializeForClipboard` which invokes our `clipboardTextSerializer` + `clipboardSerializer`; the `event.dataTransfer` receives both MIMEs. | E2E test: drag a selection from WYSIWYG onto a "drop target" DOM element in an adjacent iframe (simulating cross-origin drop); verify both MIMEs are present on `dataTransfer`. | Research Part 1 §D7 — PM's dragstart handler uses the same clipboard serializer hooks as copy/cut |

### Non-functional requirements

- **Performance (with napkin math).** Targets for 1MB Google Docs clipboard (largest realistic paste):
  - Desktop sync pipeline target <500ms (rehype-parse ~20-50ms + ~6 cleanup plugin walks ~5-10ms each = ~30-60ms + rehype-remark ~10-30ms + mdast→PM handlers ~20-50ms + PM replaceSelection ~1-5ms = **~100-200ms sync**; 2.5x safety margin).
  - iOS Safari sync pipeline target <1s (JSC typically 1.5-2x slower than V8 on string + tree work).
  - **Observer B re-parse is O(total Y.Text size), not O(paste size)**: for an 11MB doc (10MB existing + 1MB paste), Observer B re-parse may exceed 1s. This is a known failure mode — mitigation via large-paste guard (see A7) or incremental re-parse (Future Work).
  - Measure via benchmarks during implementation; if any target missed, ship the A7 guard before release.
- **Reliability.** Conversion failure never loses user content. Three-layer fallback: rehype pipeline fails → html→markdown fails → text/plain insert. All paths instrumented with `[clipboard]` warnings.
- **Security/privacy.** No paste-time DOMPurify. rehype-remark converts hast→mdast which structurally drops script tags and event-handler attrs. Render-layer sanitization unchanged (DOMPurify in docs site for `htmlBlock`). Matches CLAUDE.md's storage-fidelity invariant.
- **Observability.** Structured JSON console.warn events for: `event: 'clipboard-serialize-fail'`, `event: 'clipboard-html-conversion-fail'`, `event: 'clipboard-source-detected'` (with source identifier: gdocs / word / gmail / vscode / pm-origin / notion / ai-chat / generic / plaintext). Aggregatable in log tooling.
- **Cost.** Four new unified plugins (rehype-parse, rehype-remark, remark-rehype, rehype-stringify) add ~20-40KB min+gz bundle (estimate; measure at implementation time). All share unified infrastructure already installed.
- **Operability.** All work is client-side; no server or infra changes. CRDT transactions flow through existing observer bridge unchanged.

## 7) Success metrics & instrumentation

**Primary signal — clipboard round-trip fidelity (golden-path tests):**
- Metric: % of per-destination round-trip scenarios passing (baseline 0, target 100% for day-one supported sources).
- Instrumentation: Playwright E2E test at `packages/app/tests/stress/paste-fidelity.e2e.ts` extended with copy-from-OK + paste-into-destinations scenarios for Gmail/GitHub/VS Code/OK (same tab) via virtual clipboard.

**Secondary signal — source-detection coverage:**
- Metric: % of real-world paste samples whose source is correctly identified via MIME or HTML fingerprint.
- Instrumentation: Telemetry `event: 'clipboard-source-detected'` emits source id. Dashboard tracks distribution.

**Secondary signal — failure rate:**
- Metric: Rate of `clipboard-html-conversion-fail` events per paste attempt.
- Instrumentation: Existing console.warn aggregation; target <1% of paste attempts.

**Adoption/value:**
- Rich HTML paste success (Gmail → OK paste of a real email) becomes a demoable magic moment — tracked qualitatively via user feedback.

## 8) Current state (how it works today)

**WYSIWYG:**
- Copy: PM default emits text/plain via DOM-text extraction (loses markdown markers — e.g., `**bold**` becomes `bold`), text/html via schema DOMSerializer with OK-private `data-*` attrs leaking to destinations.
- Paste: `clipboardTextParser` at `packages/app/src/editor/TiptapEditor.tsx:97-103` parses text/plain as markdown via `MarkdownManager.parse()` — correct (Archetype D). `text/html` handled by PM default parseDOM with schema rules — passes through but does NOT clean vendor garbage.

**Source:**
- Copy: CM6 default writes text/plain only (source-verified from `@codemirror/view/dist/index.js:5128-5156`). No text/html.
- Paste: CM6 default reads text/plain only (source-verified from `dist/index.js:5074-5087`). Ignores text/html.

**Custom nodes (`packages/core/src/extensions/`):**
- wikiLink: `renderHTML` → `<span data-wiki-link data-target=... data-alias=... data-anchor=... data-resolved=...>text</span>`. `parseHTML` matches.
- jsxComponent: `renderHTML` → `<div data-jsx-component data-content=...></div>`. `parseHTML` matches.
- jsxInline: `renderHTML` → `<span data-jsx-inline data-source-raw=... contenteditable="false"><children></span>`. `parseHTML` matches.
- rawMdxFallback: `renderHTML` → `<div data-raw-mdx-fallback data-raw-badge="raw" data-reason="..." class="raw-mdx-fallback" contenteditable="false">text</div>`. The visual `<pre>` wrapper lives only in `addNodeView`; clipboard serialization takes `renderHTML`'s path (div with text content), not the NodeView's.

**PM → mdast handlers (`packages/core/src/markdown/index.ts:687-723`):**
- All four custom nodes currently emit `{type: 'html', value: raw_source}` mdast nodes. Works for markdown round-trip (remark-stringify emits the raw source verbatim). Does NOT work for `remark-rehype` → `rehype-stringify` → HTML: those handlers treat the `html` mdast value as literal HTML to pass through, so `value: '[[Page]]'` would emit `[[Page]]` as literal text in HTML output.

**Key constraints:**
- Schema is add-only forever (CLAUDE.md §9). No narrowing.
- Observer bridge origin-guard (CLAUDE.md "Origin-guard truth table"). New transactions must use user-origin (undefined) or an existing tagged origin.
- All text/plain paste must round-trip markdown (R18 Archetype D, locked in TiptapEditor.tsx).

**Known gaps/bugs discovered during 1P investigation:**
- Custom-node mdast emission as `html` passthrough is fine for markdown but problematic for HTML output — surfaces D7 decision below.
- No existing infrastructure for source-cleanup rehype plugins — net-new work.
- Paste fidelity test infra (`tests/stress/paste-fidelity.e2e.ts`) exists but scope may need extension.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

**Dashboard/admin UI:** N/A.

**API/SDK:** Two new public modules in `@inkeep/open-knowledge-core`:
- `html-to-mdast.ts` — `htmlToMdast(html: string, opts?): Root`. Unified processor wrapping rehype-parse + all registered cleanup plugins + rehype-remark with our mdast-type handlers (so wikiLink / jsxComponent / etc. come back as first-class mdast, not `html` passthrough).
- `mdast-to-html.ts` — `markdownToHtml(md: string): string`, `mdastToHtml(tree: Root): string`. Unified processor wrapping remark-parse (for the string entry point) + remark-rehype with our custom-node handlers + rehype-stringify.

**CLI:** N/A.

**Docs/onboarding:** No docs-site impact.

**Error messages:** `console.warn(JSON.stringify({event: 'clipboard-html-conversion-fail', ...}))` per structured-log convention. No user-facing errors (silent fallback preserves content).

**Billing/limits:** N/A.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/` (editor) | `packages/app/src/editor/TiptapEditor.tsx` | WYSIWYG clipboard behavior on every paste/copy/cut |
| `/` (editor, source-view-toggled) | `packages/app/src/editor/SourceEditor.tsx` | Source clipboard behavior; cross-view equivalence |

### System design

**Architecture overview — canonical mdast pipeline:**

```
                        mdast (canonical hub)
                           ▲  ▲  ▲  ▲
      remark-parse ────────┘  │  │  └──── remark-stringify
                              │  │
                             hast ◄── rehype-parse ── HTML
                              │                       ▲
             rehype-remark ───┘       remark-rehype + rehype-stringify
                                      (mdast → hast → HTML)
                           │  │  │  │
                           ▼  ▼  ▼  ▼
                    our PM↔mdast handlers (PM ↔ mdast)
                              │
                              ▼
                             PM JSON
```

**Four clipboard paths:**

1. **WYSIWYG copy** — PM Slice → wrap in `schema.topNodeType.createAndFill` → `pmToMdast` → {`remark-stringify` → markdown string (text/plain); `mdastToHtml` → HTML (text/html)}.
2. **WYSIWYG paste** — 5-branch dispatcher:
   - Branch A (vscode-editor-data MIME) → fenced code block with language.
   - Branch B (text/x-gfm MIME) → markdown string → `MarkdownManager.parse` → PM Slice.
   - Branch C (HTML contains `[data-pm-slice]`) → let PM's native `parseFromClipboard` handle.
   - Branch D (generic HTML) → `htmlToMdast` (via shared module) → `mdastToPm` handlers → PM Slice.
   - Branch E (text/plain only) → `isMarkdown(text)` ≥ threshold → `MarkdownManager.parse` → PM Slice; else → plain-text insert.
3. **Source copy** — CM6 `sliceDoc(from, to)` → markdown string (text/plain); `markdownToHtml(md)` (via shared module) → HTML (text/html); both emitted via `event.clipboardData.setData` + `event.preventDefault()`.
4. **Source paste** — 5-branch dispatcher parallel to #2, but final stage is:
   - Branch A → fenced code block string inserted at selection.
   - Branch B → markdown string inserted.
   - Branch C (data-pm-slice) → let CM6 default read text/plain (which IS our markdown from #1).
   - Branch D → `htmlToMdast` → `remark-stringify` → markdown string inserted.
   - Branch E → CM6 default (text/plain inserted verbatim; works for GitHub/Obsidian/VS Code/AI-chat which all emit markdown in text/plain).

**Data model:** No schema changes. The existing ProseMirror schema + mdast types + `packages/core/src/markdown/mdast-augmentation.ts` cover everything. Custom-node mdast types promoted from `html` passthrough to first-class (see D7 below).

**API/transport:** Client-side only; no network or server changes.

**Auth/permissions:** N/A.

**Enforcement point(s):** `packages/app/src/editor/TiptapEditor.tsx` (WYSIWYG editor hooks) + `packages/app/src/editor/SourceEditor.tsx` (Source editor extensions). Shared modules in `packages/core/src/markdown/`.

**Observability:** Structured JSON `console.warn` events (enumerated in §6 NFR). No server-side observability (client-only feature).

#### Data flow diagram

- **Primary flow (copy):** user selection in view → normalization (Slice/sliceDoc) → pm-to-mdast OR remark-parse → mdast tree → {mdast-to-markdown, mdast-to-html} → clipboard MIME pair.
- **Primary flow (paste):** clipboard → source detection (MIME + HTML fingerprint) → branch selection → {identity path, rehype cleanup + convert, MarkdownManager.parse} → mdast → {mdast-to-pm, mdast-to-markdown} → target view (PM Slice or CM6 insert).

**Shadow paths to test:**
- **nil / missing:** clipboardData null → graceful no-op (existing browser behavior).
- **empty:** empty selection on copy → no MIME mutation; empty clipboard on paste → no-op.
- **wrong type:** binary MIME (image/png) → ignore in this spec; covered by existing file-handler extension.
- **timeout:** pipeline synchronous; no timeout path.
- **conflict:** cross-view concurrent edits during paste → existing observer-A/B bridge handles; paste is a user-origin transaction, no new race.
- **partial failure:** rehype pipeline throws mid-conversion → try/catch falls through to next branch.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| WYSIWYG clipboardTextSerializer | PM→mdast throws | caught in try/catch | fall through to `slice.content.textBetween(0, size, '\n\n')` | text/plain degrades from canonical markdown to flat text, one Cmd+C |
| WYSIWYG clipboardSerializer | mdast→html throws | caught | fall through to `null` (PM default DOMSerializer runs) | text/html degrades from canonical to PM-DOM form, one Cmd+C |
| WYSIWYG handlePaste | rehype pipeline throws | caught | fall through → return false → PM default parseFromClipboard runs on text/html OR our `clipboardTextParser` on text/plain | Paste lands as PM default or markdown-parsed text/plain; formatting may degrade but no data loss |
| Source copy | markdown→html throws | caught | fall through → CM6 default writes text/plain only | text/html missing that one copy; subsequent copies unaffected |
| Source paste | rehype pipeline throws | caught | fall through → CM6 default inserts text/plain | plaintext inserted (like today's behavior); no regression |
| Custom-node mdast→hast handler throws | Per-node exception | node-scoped try/catch | emit fallback hast: `{type: 'text', value: '[unsupported node]'}` + log | One node renders as placeholder in that one HTML payload |

### Alternatives considered

- **Turndown for HTML→markdown** (industry-standard choice, used by Obsidian). Rejected: our unified-native stack makes rehype-remark architecturally superior (native GFM, direct mdast output, institutional backing, same plugin idiom, MDX passes through structurally). Research Part 2 §D10.
- **PM DOMSerializer for WYSIWYG text/html** (industry norm, used by every surveyed PM editor). Rejected: produces OK-private `data-*` markup in clipboard, diverges from Source view's HTML output (which MUST use mdast-to-html because it has no PM). Greenfield amendment per Part 3 §D19-2: single canonical HTML path across both views.
- **CM6 default for Source copy** (zero-effort, matches VS Code precedent). Rejected: asymmetric with WYSIWYG, breaks "same content → same clipboard output" architectural principle. Research Part 3 §D19.
- **Adapter-registry pattern (BlockSuite/CKEditor style)** for paste source dispatch. Rejected: overkill for our scope. A 5-branch `if/else` dispatcher in a single function is simpler and equally extensible via composable rehype plugins.
- **Keep custom nodes as `html` mdast passthrough** (simplest; no new handlers). Rejected: breaks HTML emission to external destinations (wikiLink `[[Page]]` would render literal). Promoting to first-class mdast types is the architecturally-correct answer per greenfield posture.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Pivot library for HTML→markdown is `rehype-remark` + `rehype-parse`, not Turndown | T | LOCKED | Reversible (single module swap) | Unified-native fit; native GFM; direct mdast; first-party TS; MDX round-trips structurally | Research Part 2 §D10 | Adds 2 unified plugins; no per-rule Turndown config |
| D2 | Pivot library for markdown→HTML is `remark-rehype` + `rehype-stringify` | T | LOCKED | Reversible | Same ecosystem as D1; single source-of-truth for HTML rendering | Research Part 3 §D20 | Adds 2 unified plugins; shared by copy paths across views |
| D3 | WYSIWYG copy writes BOTH `text/plain` (markdown) AND `text/html` (canonical rendered HTML via mdast-to-html, NOT PM DOMSerializer) | X | LOCKED | 1-way (sets precedent) | Cross-view consistency; no OK-private markup leaks to clipboard; single HTML rendering path | Research Part 3 §D19-2 (greenfield amendment) | Part 1 recommendation amended |
| D4 | Source copy writes BOTH `text/plain` AND `text/html` (symmetric with WYSIWYG via shared mdast-to-html) | X | LOCKED | 1-way (sets precedent) | Close the cross-view asymmetry; same content = same clipboard regardless of active view | Research Part 3 §D19 | Departs from VS Code/CM6 default; deliberate greenfield choice |
| D5 | Source paste routes via 4-branch dispatcher parallel to WYSIWYG's 5 (text/x-gfm collapses into CM6's text/plain default path because Source's insertion IS markdown text); shared rehype pipeline; final stage is `remark-stringify` to markdown string | T | LOCKED | Reversible | Closes rich-HTML paste gap; mirrors WYSIWYG structure minus the redundant text/x-gfm branch; single rehype pipeline | Research Part 3 §D22 + Auditor #4 correction (5→4 branches) | Net-new domEventHandlers extension on CM6 |
| D6 | Paste source detection: 5 branches (vscode-editor-data → text/x-gfm → data-pm-slice → generic HTML → text/plain+isMarkdown) | T | LOCKED | Reversible (add/remove branches) | Highest-fidelity branch wins; covers 10+ real sources | Research Part 2 §D13 | Shared routing module used by both views |
| D7 | **Custom-node mdast emission: full promotion from `html` passthrough to first-class types with distinct markdown- and HTML- serialization handlers.** wikiLink → new mdast type `{type: 'wikiLink', data: {target, anchor, alias}, children: [{type: 'text', value: label}]}`; jsxComponent → existing `mdxJsxFlowElement` (from mdast-util-mdx, already installed); jsxInline → existing `mdxJsxTextElement`; rawMdxFallback → new mdast type `{type: 'rawMdxFallback', data: {reason, originalSpan}, value: rawSource}`. Markdown handlers emit canonical `[[Page]]` / `<Component/>` source (bit-exact equivalent to today's output on the persistence path). HTML handlers per Q1 shapes. | T | LOCKED | Reversible (handler refactor) | Under strict greenfield posture: the existing `html` passthrough is a type lie (mdast `html` is for raw HTML like `<iframe>`, not wiki-link syntax `[[Page]]`). Full promotion fixes embedded tech debt. The narrow alternative (apply transform only at mdast→hast boundary, leave PM→mdast + mdast→markdown handlers with html passthrough) preserves the type lie as existing tech debt — rejected. "Don't worry about blast radius" + "NO DEFERRED TECH DEBT" explicitly removes the argument against full promotion. Precedent value: future custom nodes land as first-class types from day one. | Spec-surfaced by 1P investigation; Q8 resolution confirms full promotion under strict greenfield | Touches `packages/core/src/markdown/index.ts` PM→mdast + mdast→PM handlers + new `mdast-augmentation.ts` types + updated `to-markdown-handlers.ts` + new `mdast-to-hast-handlers.ts` |
| D8 | **Ambiguous paste (both text/plain and text/html present, text/plain looks like markdown): prefer markdown-first** (BlockNote `prioritizeMarkdownOverHTML: true`) | P | DIRECTED | Reversible (config toggle) | Symmetric with our Archetype D text/plain=markdown stance; avoids HTML lossy-conversion when markdown source is available | Research Part 2 §D14-3 | Overridable via extension option |
| D9 | Day-one source cleanup panel is the **full set of 9 rehype plugins**, one per vendor fingerprint in research Part 2 §D13: GDocs, Word/MSO, Apple Cocoa, Gmail, Notion-whitespace, VS Code structural fallback, Google Sheets, Slack, GitHub-rendered. Each plugin ships with a real captured paste sample as test fixture. | P | LOCKED | Reversible (add/remove) | Under strict greenfield posture: "NO DEFERRED TECH DEBT" + "don't lean heavily on defer to future" explicitly rejects the narrow alternative (ship 2, add others on user report). All 9 vendors are known, have documented HTML shapes, and fit the same composable-plugin pattern. Shipping 2 plugins with the same testing approach as 9 doesn't reduce bit-rot risk symmetrically; it just defers 4-7 pieces of work. Real fixtures (captured today) provide ground-truth testing for all 9. | Web search 2026-04-16 — no rehype-strip-{gdocs,mso,gmail,cocoa,gsheets,slack,github} npm packages exist; CKEditor's paste-from-office is in-house monolith. See evidence/d9-rehype-cleanup-landscape.md (expanded to 9 plugins) | 9 plugins + tests + fixtures; total ~900-1200 LoC new code. Closes Auditor #7 finding (D13 fingerprint coverage) by adding the 3 previously-deferred plugins. |
| D10 | No paste-time DOMPurify / storage-layer sanitization | X | LOCKED | 1-way (invariant, matches NG4) | rehype-remark structurally drops script/event-handler attrs; XSS is render-layer concern | Research Part 2 §D16 | Consistent with R18 + CLAUDE.md NG4 |
| D11 | Linewise copy preservation in Source deliberately not preserved | T | LOCKED | Reversible (can re-add) | CM6's `lastLinewiseCopy` is module-internal; preserving requires patching CM6 or tracking in parallel. Accept regression for v1. | Research Part 3 §D21-2 | Flag in release notes; revisit if reported |
| D12 | Error-path fallback discipline: three-layer graceful degradation (rehype fails → markdown fails → text/plain), never silent content drop | T | LOCKED | Reversible | Keystatic pattern; user content is sacred | Research Part 3 §D21 | All conversion calls wrapped in try/catch with `console.warn` |
| D13 | **Package layout: both shared modules live in `packages/core/src/markdown/`** — specifically `html-to-mdast.ts` and `mdast-to-html.ts` — alongside existing `pipeline.ts`, `handlers.ts`, `to-markdown-handlers.ts`. Cleanup plugins under `packages/core/src/markdown/rehype-plugins/` (new dir). | T | DELEGATED (implementer owns details) | Reversible | Colocates with existing unified pipeline; testable in isolation; re-usable by future surfaces | — | Test files colocated. `mdast-to-html.ts` wraps a unified pipeline that internally calls `mdast-to-hast-handlers.ts` (custom-node rendering per D7/Q1/FR-20). |
| D14 | **WYSIWYG copy/cut/dragstart mechanism: PM's documented hooks — `clipboardTextSerializer` for text/plain, `clipboardSerializer` (a `DOMSerializer` subclass) for text/html.** Both hooks share a memoized per-event `pmToMdast` call; `clipboardTextSerializer` → `mdastToMarkdown`; `clipboardSerializer.serializeFragment` → `mdastToHtml` + wrap with `data-pm-slice` + parse to DocumentFragment via `DOMParser`. PM's default copy/cut/dragstart handlers compose on top: `view.dragging.slice` is set naturally at dragstart (internal DnD fast path preserved); cut's `tr.deleteSelection()` dispatches via PM's default path after our hooks fire. | T | LOCKED | Reversible | Under strict greenfield: (1) PM's documented hooks are the platform contract — `someProp` composition + ecosystem standard (Milkdown, Outline, Keystatic). (2) `DOMSerializer` subclass is ~15 LoC with a single `new DOMParser().parseFromString()` — challenger #3 showed the "clunky" argument doesn't hold under inspection. (3) PM's default dragstart sets `view.dragging` correctly without us reproducing internal state. (4) `data-pm-slice` wrapper on our canonical HTML is natural — resolves challenger #1's cross-PM-editor interop concern for free. Source view retains `EditorView.domEventHandlers` because CM6 has no equivalent API; implementation asymmetric, user-facing behavior symmetric. | Research Part 1 §D1 (PM hook composition); `@types/prosemirror-view` `dist/index.d.ts:818` (`clipboardSerializer?: DOMSerializer`); `prosemirror-view/src/clipboard.ts:17,36` (hook invocation); `input.ts:681-709` (dragstart sets `view.dragging`) | Q7 LOCKED Option B; challenger #1 + #3 findings resolved. No `event.preventDefault` needed — PM invokes the hooks and handles `setData` itself. |
| D15 | **Markdown-first on ambiguous paste hard-coded `true` — no config option exposed.** | P | LOCKED | Reversible (config can be added) | Symmetric with R18 Archetype D canonical text/plain = markdown; no consumer need identified for HTML-first; keeps surface area minimal. Cmd+Shift+V remains the escape hatch. | Q1/Q2 LOCKED — user confirmed Option A | FR-13 implementation has no config surface |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What is the exact HTML rendering for each custom node? (wikiLink as `<a>` — what class? jsxComponent with unknown tags — render the raw source as `<pre>` escaped? jsxInline — render children with a wrapper span?) | T | P0 | — | User approved shapes: wikiLink→`<a class="wiki-link" data-target data-anchor data-alias href="#slug">label</a>` (`data-resolved` intentionally dropped — server-computed non-stable state, re-derivable on parse, meaningless to external destinations); jsxComponent→`<pre class="mdx-component"><code>escaped</code></pre>`; jsxInline→`<span class="mdx-inline">children</span>`; rawMdxFallback→`<pre class="mdx-fallback"><code>raw</code></pre>` + leading `<!-- Parse error: reason -->` | Resolved |
| Q2 | `prioritizeMarkdownOverHTML` as config vs hard-coded? | P | P0 | — | Hard-coded `true`; no config. D15 LOCKED. | Resolved |
| Q3 | Cmd+Shift+V plain-paste handling in Source's domEventHandlers | T | P0 | — | Implementation: handler checks `event.shiftKey`; if true, returns false to let CM6 default insert text/plain verbatim. FR-17 LOCKED. | Resolved |
| Q4 | Copy-inside-code-block WYSIWYG behavior | P | P0 | — | Option A (emit fenced code block). FR-19 LOCKED — this is the natural output of `schema.topNodeType.createAndFill` + markdown/html serialization; zero extra code. | Resolved |
| Q5 | Day-one cleanup priorities beyond GDocs+Word | P | P2 | — | Superseded by D9 LOCKED — ship full panel of 6 plugins day-one. | Resolved |
| Q6 | Performance instrumentation | T | P0 | — | Yes, add — structured JSON console.warn pattern mirroring existing `mdx-block-fallback` / `unknown-mdast-type`. FR-18 LOCKED. | Resolved |
| Q7 | D14 mechanism — DOM-level vs PM hooks | T | P0 | — | **Option B (PM hooks) LOCKED under strict greenfield.** Ecosystem standard, preserves PM's drag-and-drop semantics automatically, natural `data-pm-slice` integration, ~15 LoC. D14 flipped to LOCKED. | Resolved |
| Q8 | D7 mdast promotion scope — full vs narrow | T | P0 | — | **Option A (full promotion) LOCKED under strict greenfield.** Narrow alt preserves type-lie tech debt on persistence path; full promotion fixes it + sets correct precedent for future custom nodes. "Don't worry about blast radius" + "NO DEFERRED TECH DEBT" removes arguments against. | Resolved |
| Q9 | D9 cleanup panel scope — narrow vs full | P | P0 | — | **Option A (full 9 plugins) LOCKED under strict greenfield.** Expanded from 6 to 9 by adding GSheets/Slack/GitHub-rendered (closes Auditor #7 D13 fingerprint gap). Narrow alt = "defer 4-7 plugins" which explicitly violates "NO DEFERRED TECH DEBT." Real-sample fixtures ground-truth all 9. | Resolved |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Adding `rehype-parse`, `rehype-remark`, `remark-rehype`, `rehype-stringify` to `packages/core` does not conflict with existing unified plugin versions | HIGH | Run `bun install` locally; verify no peer-dep warnings | Before finalization | Active |
| A2 | Bundle size impact of the four new plugins is acceptable (<50KB min+gz combined) | MEDIUM | Measure with `bun build` + size-limit tooling after implementation | During implementation | Active |
| A3 | Custom-node HTML rendering (wikiLink as `<a>`, jsxComponent escaped) does not introduce XSS — DOMPurify at docs-site render layer remains sufficient | HIGH | Security review during implementation; existing render-layer DOMPurify handles `htmlBlock`; new clipboard HTML is structurally-constrained by rehype pipeline | Before finalization | Active |
| A4 | Observer B's typing-defer (TYPING_DEFER_MS=300ms) handles large (1MB) Source paste without visible lag | MEDIUM | Benchmark test with 1MB Google Docs paste sample; measure Observer B re-parse time | During implementation | Active |
| A5 | CM6 `EditorView.domEventHandlers` running via our extension takes precedence over CM6 built-in handlers for copy/cut/paste | HIGH | Source-verified: built-in handlers only run when our handler returns `false`. Confirmed pattern in D21/D22 code sketches. | N/A (verified) | Verified |
| A6 | `y-codemirror.next@0.3.5` does not intercept copy/paste events in a way that conflicts with our handlers | HIGH | Grepped `node_modules/y-codemirror.next/src/**/*` + `dist/*` for `handleDOMEvents\|addEventListener.*(copy\|cut\|paste)` — zero hits (2026-04-16). `YSyncConfig` + `yUndoPlugin` operate at ChangeSet/transaction level; no DOM event registration. | N/A (verified) | Verified |
| A7 | **Superseded by FR-21** — moved from "assumption contingent on benchmark" to a day-one Must requirement. Benchmark still informs the chunk size tuning during implementation. | — | See FR-21 acceptance criteria. | N/A | Superseded |

## 13) In Scope (implement now)

**Goal:** Deliver the full canonical mdast-centered clipboard pipeline across both views with day-one source cleanup for Google Docs + Word, landing all four clipboard paths at production quality.

**Non-goals (in-scope ones):** Don't tackle NG1-NG8 in this spec.

**Requirements with acceptance criteria:** See §6 (FR-1 through FR-17).

**Proposed solution:** See §9.

**Owner(s)/DRI:** Nick.

**Next actions:**
1. Add unified plugins to `packages/core/package.json` (rehype-parse, rehype-remark, remark-rehype, rehype-stringify).
2. Write `packages/core/src/markdown/html-to-mdast.ts` + test.
3. Write `packages/core/src/markdown/mdast-to-html.ts` + test.
4. Write initial source-cleanup rehype plugins (`rehype-strip-gdocs-wrapper.ts`, `rehype-strip-mso-styles.ts`) + tests.
5. Promote custom-node mdast types (wikiLink, jsxComponent, jsxInline, rawMdxFallback) per D7 — new mdast-augmentation types + updated PM→mdast handlers + new mdast→markdown handlers (preserve existing behavior) + new mdast→hast handlers.
6. Wire WYSIWYG clipboard via PM's documented hooks in `TiptapEditor.tsx`'s `editorProps`: `clipboardTextSerializer` (mdast → markdown), `clipboardSerializer` (subclass of `DOMSerializer` — mdast → HTML + data-pm-slice wrapper → DocumentFragment via `DOMParser`), `handlePaste` (5-branch dispatcher). No `handleDOMEvents.copy/cut/dragstart` — PM's default copy/cut/dragstart handlers compose on top and handle `setData` + `view.dragging` natively.
7. Wire Source clipboard: `EditorView.domEventHandlers.copy/cut/paste` in `SourceEditor.tsx`.
8. Extend paste-fidelity E2E test (`packages/app/tests/stress/paste-fidelity.e2e.ts`) with cross-view + cross-source scenarios. **Add a `simulateCopyAndRead(selection)` helper** — dispatches synthetic copy event, intercepts `event.clipboardData.setData` via capture handler, returns `{plain, html}` — needed because existing harness only supports paste-side (DataTransfer injection). Copy-side E2E coverage is a day-one requirement, not a Future Work item, since FR-1/FR-2/FR-4's acceptance criteria depend on it. At minimum 5 copy-side scenarios day-one: WYSIWYG→plain, WYSIWYG→HTML with wikiLink, Source→plain, Source→HTML, empty-selection no-op.
9. Write new integration tests (`packages/core/src/markdown/html-to-mdast.test.ts`, `mdast-to-html.test.ts`) covering each branch + each custom node.
10. Update `packages/app/CLAUDE.md` or repo-root `CLAUDE.md` with clipboard precedent (greenfield amendment, mdast-centered pipeline, promoted custom-node mdast types).

**Risks + mitigations:** See §14.

**What gets instrumented/measured:**
- `clipboard-serialize-fail` / `clipboard-html-conversion-fail` counters.
- `clipboard-source-detected` distribution.
- Paste fidelity E2E pass rate.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Bundle size | Measure before/after via `bun build` output + size-limit tool | No >50KB regression on `packages/app` bundle |
| Cross-browser | Chrome, Safari, Firefox tested via Playwright (desktop) + BrowserStack (optional) | paste-fidelity.e2e runs on all three |
| CRDT bridge invariants | Run full `bun run check` (bridge-matrix, stress, fuzz) pre-merge | All tiers green |
| Observer bridge typing-defer on large paste | Benchmark 1MB paste; verify <1s visible lag | A4 verification |
| Rollback | Feature-flagged? | Not needed — additive; clipboard only triggered by user action |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Custom-node HTML rendering introduces subtle escaping bugs | MEDIUM | MEDIUM | Proactive: FR-20 unit + fuzz tests for each custom node with adversarial input; rehype-stringify's default text-node escaping is structurally safe when handlers emit hast `text` not `html` | Nick |
| rehype-remark converts some GFM constructs (tables with complex colspan) unexpectedly | MEDIUM | LOW | Day-one tests cover basic GFM; complex Word-style tables deferred to NG3 | Nick |
| Ambiguous paste markdown-first default (D8) occasionally misfires on benign text | LOW-MED | LOW | isMarkdown heuristic (3+ signal threshold) tuned in research; Cmd+Shift+V always available as escape | Nick |
| Bundle size regression from 4 new unified plugins | LOW | LOW | Measure; if >50KB, investigate lazy-loading paths | Nick |
| Cross-browser differences in sync event preventDefault semantics | LOW | MEDIUM | Test on all three browsers day-one; return-true pattern matches CM6's own handlers | Nick |
| Observer-B re-parse latency on 1MB+ paste causes visible lag | LOW | MEDIUM | Proactive: FR-21 ships chunked Y.Text insertion (rAF-yielded) day-one. Final Observer B re-parse on completed doc is a documented known tradeoff; incremental re-parse is Future Work: Identified | Nick |
| Large-paste UI freeze on iOS Safari (low-throughput JSC) | MEDIUM | MEDIUM | Proactive: FR-21 chunked insertion keeps frame times <16ms during input phase; A7 retired (superseded) | Nick |
| rehype pipeline throws on malformed HTML | MED | LOW | Three-layer fallback (D12); test with fuzz-generated malformed HTML | Nick |

## 15) Future Work

### Explored

- **BlockNote-style private MIME for lossless internal round-trip.**
  - What we learned: `blocknote/html` / `web text/x-ok-slice` patterns preserve complex custom-node state across tabs. Chromium pickling (web-prefix) is Chromium-only; sync-event `text/x-ok-slice` is cross-browser.
  - Recommended approach: Sync-event path via `handleDOMEvents.copy` emitting a compact JSON snapshot alongside text/plain + text/html.
  - Why not in scope now: v1 scope risk; users can achieve lossless round-trip via text/plain markdown today. Priority uncertain without usage data.
  - Triggers to revisit: Users report repeated loss of custom-node attrs during OK → OK tab paste; or complex custom nodes (e.g. richer jsxComponent attrs) get added and markdown round-trip becomes insufficient.
  - Implementation sketch: New `vnd.open-knowledge/slice` MIME written by both views' copy handlers; paste-side detects first and consumes via `Slice.fromJSON` (PM) or raw markdown insert (Source).

- **Cmd+Shift+C "Copy as Plain Text" command.**
  - What we learned: No editor in our survey has this. Universal escape hatch for paste exists (Cmd+Shift+V); no equivalent for copy.
  - Recommended approach: Add a keymap command that writes text/plain = source-stripped text (no markdown markers, no formatting).
  - Why not in scope now: Polish, not critical path.
  - Triggers to revisit: User feedback that pasting from OK into Slack gives rendered bold when they wanted literal `**bold**`.

- **CKEditor-grade Word list reconstruction.**
  - What we learned: CKEditor's `transformListItemLikeElementsIntoLists` (hundreds of lines) is the reference. Reconstructs nested `<ol>/<ul>` from flat Word paragraphs with `mso-list:l1 level1 lfo1` hints.
  - Recommended approach: Port CKEditor's filter as a rehype plugin (`rehype-word-list-reconstruction.ts`).
  - Why not in scope now: Significant investment; unclear Word paste is a priority use case for OK.
  - Triggers to revisit: Word paste becomes a reported priority use case; day-one mso-* stripping is insufficient for structure.

### Identified

- **Image paste (including base64 from Word RTF sibling).** Needs own spec. Related to existing image-upload extension.
- **Incremental Observer B re-parse.** Current: on any Y.Text change, Observer B re-parses full doc via `MarkdownManager.parse`. For large docs this is O(doc size) per paste. An incremental re-parse (parsing only the changed range and merging the mdast tree) would make paste duration O(paste size). Significant Observer B refactor; defer until large-doc-paste scenarios become a reported user-pain pattern beyond what FR-21's chunked insertion mitigates.
- **`rehypeStripInlineImages` opt-in plugin.** For users who paste a lot from content behind auth walls (e.g. Google Workspace corp deployments) and don't want broken image references in their markdown. Ships as an extension config option, not a default. Implementation ~30 LoC + tests.
- **Playwright cross-browser clipboard virtualization edge cases.** Once the baseline `simulateCopyAndRead` harness from §13 ships, follow-up investigation on Firefox + WebKit quirks as they surface.

### Noted

- **Mobile (iOS Safari, Chrome Android) clipboard edge cases.** User activation rules differ; may need `Promise<Blob>` payload pattern for iOS Safari per Part 1 §D8.
- **Accessibility: copying screen-reader-friendly text.** Current proposal emits rendered HTML in text/html; screen readers usually read text/plain. No regression but not optimized.
- **Analytics: paste sources distribution.** Could inform which rehype cleanup plugins to prioritize beyond day-one.

## 16) Agent constraints

- **SCOPE:** 
  - `packages/core/src/markdown/html-to-mdast.ts` (new)
  - `packages/core/src/markdown/mdast-to-html.ts` (new)
  - `packages/core/src/markdown/rehype-plugins/` (new dir — all NINE plugins day-one per D9, each with colocated test + real-sample fixture):
    - `strip-gdocs-wrapper.ts` + `.test.ts` + `fixtures/gdocs-sample.html`
    - `strip-mso-styles.ts` + `.test.ts` + `fixtures/word-sample.html`
    - `strip-cocoa-meta.ts` + `.test.ts` + `fixtures/apple-notes-sample.html`
    - `strip-gmail-classes.ts` + `.test.ts` + `fixtures/gmail-sample.html`
    - `skip-notion-whitespace.ts` + `.test.ts` + `fixtures/notion-sample.html`
    - `strip-vscode-spans.ts` + `.test.ts` + `fixtures/vscode-sample.html`
    - `strip-gsheets-wrapper.ts` + `.test.ts` + `fixtures/gsheets-sample.html`
    - `strip-slack-classes.ts` + `.test.ts` + `fixtures/slack-sample.html`
    - `strip-github-hovercard.ts` + `.test.ts` + `fixtures/github-comment-sample.html`
  - `packages/core/src/markdown/index.ts` (PM→mdast handler edits per D7)
  - `packages/core/src/markdown/to-markdown-handlers.ts` (new handlers per D7)
  - `packages/core/src/markdown/mdast-to-hast-handlers.ts` (new — custom-node HTML rendering per D7/Q1)
  - `packages/core/src/markdown/mdast-augmentation.ts` (new types per D7)
  - `packages/core/package.json` (add 4 unified plugins: rehype-parse, rehype-remark, remark-rehype, rehype-stringify)
  - `packages/app/src/editor/TiptapEditor.tsx` (`editorProps.clipboardTextSerializer` + `editorProps.clipboardSerializer` as a `DOMSerializer` subclass + `editorProps.handlePaste` per D14)
  - `packages/app/src/editor/SourceEditor.tsx` (EditorView.domEventHandlers.copy/cut/paste)
  - `packages/app/tests/stress/paste-fidelity.e2e.ts` (extend)
  - `packages/core/src/markdown/*.test.ts` (new unit tests)
  - `CLAUDE.md` (append precedent #14: greenfield clipboard pipeline — mdast-canonical hub; PM's documented clipboard hooks for WYSIWYG (clipboardTextSerializer + DOMSerializer subclass); `EditorView.domEventHandlers` for Source (no CM6 equivalent); promoted custom-node mdast types; full 9-plugin cleanup panel day-one)

- **EXCLUDE:**
  - ProseMirror schema files (`packages/core/src/extensions/`) — NO narrowing per schema-add-only precedent
  - Observer files (`packages/app/src/editor/observers.ts`) — bridge invariants preserved; no origin-tag changes
  - Server code (`packages/server/`) — client-only feature
  - Docs site (`docs/`) — no doc-site impact
  - Image paste / file handler (`packages/app/src/editor/image-upload/`) — spec NG4 (image paste deferred)

- **STOP_IF:**
  - FR-20 adversarial-input fuzz test produces any unescaped `<script>` in output
  - rehype-parse or rehype-remark peer-dep conflicts with existing unified version
  - Bundle size regression exceeds 50KB (A2 verification)
  - Observer bridge invariant violations surface in bridge-matrix tests
  - FR-21 chunked-insertion E2E fails the 60fps frame-timing assertion on iOS Safari
  - Any proposed change to `schema.parseDOM` on existing custom nodes (signals schema narrowing)
  - Any proposed use of `handleDOMEvents.copy/cut/dragstart` to override PM's clipboard path on WYSIWYG (D14 LOCKED uses PM hooks; DOM-level override would re-introduce the drag-and-drop coupling problem that caused the flip)

- **ASK_FIRST:**
  - Adding a fifth unified plugin beyond the four specified
  - New MIME types beyond `text/plain` + `text/html` (NG5, NG6 forbid)
  - Any DOMPurify usage in the clipboard pipeline (NG7 / D10 forbid)
  - Changing the `data-pm-slice` detection string (affects cross-editor interop)
  - Promoting a P2 Future Work item into the implementation
