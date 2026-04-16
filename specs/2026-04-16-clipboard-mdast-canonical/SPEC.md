# Clipboard Round-Trip with Markdown (mdast-canonical) — Spec

**Status:** Draft
**Owner(s):** Nick
**Last updated:** 2026-04-16
**Baseline commit:** `0e2ed52`
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
- **[NOT NOW]** NG4: Image paste (including base64 embedding from Word RTF sibling data). — Revisit if: image paste is prioritized; separate spec.
- **[NEVER]** NG5: `text/markdown` MIME emission. Safari/WebKit rejects it from `ClipboardItem.write`, zero destinations read it. Evidence: Part 1 §D2.
- **[NEVER]** NG6: `web`-prefixed Chromium pickling custom MIMEs as a first-order design. Chromium-only, zero Safari/Firefox coverage, no production editor in our survey uses them. Evidence: Part 1 §D2.
- **[NEVER]** NG7: Paste-time DOMPurify / storage-layer sanitization. XSS is a render-layer concern (R18 Archetype Z + our NG4 storage-fidelity invariant). rehype-remark converts hast → mdast (structurally drops script/attr attacks); anything surviving lands in our existing `htmlBlock` atomic node. Evidence: Part 2 §D16.
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
| Must | FR-1: WYSIWYG copy writes text/plain = canonical markdown via `MarkdownManager.serialize` on Slice wrapped in schema.topNodeType | Cmd+A + Cmd+C in WYSIWYG produces clipboard text/plain that round-trips through MarkdownManager.parse → PM identical to original doc (modulo NG1-NG11 fidelity catalog gaps) | Research Part 1 §Recommendation |
| Must | FR-2: WYSIWYG copy writes text/html via canonical mdast-to-html pipeline (`remark-rehype` + `rehype-stringify`), NOT PM DOMSerializer | Pasted into Gmail, shows formatted rich-text (bold, headings, lists) with NO OK-private `data-*` attrs | Research Part 3 §D19-2 greenfield amendment |
| Must | FR-3: WYSIWYG paste routes via 5-branch dispatcher: (1) VS Code MIME → fenced code block; (2) text/x-gfm → markdown path; (3) data-pm-slice → PM native parseFromClipboard; (4) generic text/html → rehype pipeline → mdast → PM handlers; (5) text/plain → existing MarkdownManager.parse | Each branch produces the canonical result for its source; unit + integration tests per branch | Research Part 2 §Recommendation |
| Must | FR-4: Source copy via `EditorView.domEventHandlers` overrides CM6 default, writes text/plain = markdown source (CM6 sliceDoc) AND text/html = canonical mdast-to-html | Cmd+A + Cmd+C in Source produces clipboard identical (byte-for-byte) to the equivalent WYSIWYG copy | Research Part 3 §D21 |
| Must | FR-5: Source paste via `EditorView.domEventHandlers` mirrors WYSIWYG's 5-branch dispatcher; HTML branch uses shared `htmlToMdast` → `remark-stringify` → markdown string inserted at selection | Rich HTML from Gmail/Google Docs/Word produces markdown source in Source buffer; observer B propagates to XmlFragment | Research Part 3 §D22 |
| Must | FR-6: Shared module `packages/core/src/markdown/html-to-mdast.ts` exports `htmlToMdast(html: string): Root` wrapping `rehype-parse` + source-cleanup rehype plugins + `rehype-remark`. Used by FR-3 and FR-5. | One module; both consumers call it; no duplication | Research Part 3 §D20 |
| Must | FR-7: Shared module `packages/core/src/markdown/mdast-to-html.ts` exports `markdownToHtml(md: string): string` and `mdastToHtml(tree: Root): string`. Wraps `remark-rehype` + custom-node handlers + `rehype-stringify`. Used by FR-2 and FR-4. | One module; both consumers call it; no duplication | Research Part 3 §D20 |
| Must | FR-8: Custom nodes (wikiLink, jsxComponent, jsxInline, rawMdxFallback) have first-class mdast representations, each with distinct serialization handlers for markdown (existing `to-markdown-handlers.ts`) and HTML (new `mdast-to-html.ts` handlers). The HTML emission is canonical rendered form (e.g., wikiLink → `<a class="wiki-link" href="...">target</a>`), NOT the OK-private data-attr form. | Gmail paste of a wikiLink-containing selection shows a clickable link; markdown round-trip via text/plain produces `[[Page]]` | **[NEW DECISION — see §10 D7]** |
| Must | FR-9: Source cleanup is composable rehype plugins. Day-one plugins: `rehypeStripGoogleDocsWrapper`, `rehypeStripMsoStyles`. Future plugins: `rehypeStripCocoaMeta`, `rehypeStripGmailClasses`, `rehypeSkipNotionWhitespace`, `rehypeStripVSCodeSpans`. | Each plugin is a standalone unified plugin; both consumers register them identically | Research Part 2 §D11, D13 |
| Must | FR-10: Paste into a code block (WYSIWYG) short-circuits to plain-text insert (BlockNote pattern). | Cursor inside codeBlock + paste of any content → text/plain inserted verbatim, no markdown parsing, no HTML conversion | Research Part 2 §D14-3 |
| Must | FR-11: Error-path discipline — on any conversion failure (html→mdast throw, markdown→html throw), fall through to the layer below (Keystatic pattern). No Cmd+C/Cmd+V silently drops content. console.warn with bracket-prefix `[clipboard]` per logging conventions. | Unit test: malformed HTML paste → markdown fallback path; unit test: unserializable PM doc → textBetween fallback. | Research Part 3 §D21 |
| Must | FR-12: Cut inherits copy's MIME-writing behavior (same pipeline, same both-MIME emission) + deletion. WYSIWYG cut via PM's unified copy-and-cut handler (our `clipboardTextSerializer` + `clipboardSerializer` fire on both). Source cut via parallel `handleSourceCopyCut` helper (see FR-4) that dispatches delete transaction on `kind === 'cut'`. | Cut from either view produces same clipboard payload as copy + deletes the selection. | Research Part 1 §D7-4, Part 3 §D21 |
| Should | FR-13: Ambiguous paste (text/plain AND text/html both present, text/plain looks like markdown) prefers markdown-first (BlockNote `prioritizeMarkdownOverHTML: true` pattern). | Paste of markdown-shaped text/plain + simple text/html → parses text/plain as markdown (preserves markdown markers); paste of plaintext text/plain + rich text/html → uses text/html (rich content) | **[JUDGMENT CALL — see §10 D8]** |
| Must | FR-14: `isMarkdown(text)` heuristic for Branch 5 (text/plain-only) follows Outline's signal-count pattern: min(3, floor(lineCount/5)) signals across fences, latex, links, headings, bullets, tables. | Unit tests: pasting simple prose does NOT parse as markdown; pasting content with 3+ markdown signals DOES parse. | Research Part 2 §D13 |
| Should | FR-15: Empty-selection copy in either view is a no-op (no clipboard mutation). | Cmd+C with empty selection → clipboard unchanged. | Mirror CM6's own empty-selection guard and PM's. |
| Should | FR-16: Drag-and-drop within same WYSIWYG editor unaffected by clipboard changes. `clipboardTextSerializer` fires on drag-start; internal drop re-uses the saved slice (does NOT re-enter paste pipeline). External drag-in goes through full paste pipeline. | Existing drag tests continue to pass; new test: drag from external app into WYSIWYG → rich HTML routed through paste pipeline. | Research Part 1 §D7 |
| Could | FR-17: Cmd+Shift+V (plain-text paste escape hatch) works across both views via browser-level shift detection. PM: existing `event.shiftKey` flag via `doPaste`. CM6: our handler respects `event.shiftKey` and inserts text/plain verbatim regardless of html presence. | Shift+Cmd+V from Gmail into Source → plaintext inserted, not converted to markdown. | Universal escape hatch per R18 |

### Non-functional requirements

- **Performance.** A 1MB Google Docs clipboard (largest realistic paste) must complete html→mdast→insert within the user-gesture window (<500ms on desktop; <1s on iOS Safari). Measure post-implementation.
- **Reliability.** Conversion failure never loses user content. Three-layer fallback: rehype pipeline fails → html→markdown fails → text/plain insert. All paths instrumented with `[clipboard]` warnings.
- **Security/privacy.** No paste-time DOMPurify. rehype-remark converts hast→mdast which structurally drops script tags and event-handler attrs. Render-layer sanitization unchanged (DOMPurify in docs site for `htmlBlock`). Matches NG4 storage-fidelity invariant.
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
- rawMdxFallback: `renderHTML` → `<div data-raw-mdx-fallback data-raw-badge="raw" data-reason="..."><pre>source</pre></div>`.

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
| D5 | Source paste routes via 5-branch dispatcher parallel to WYSIWYG; shared rehype pipeline; final stage is `remark-stringify` to markdown string | T | LOCKED | Reversible | Closes rich-HTML paste gap; mirrors WYSIWYG structure; single rehype pipeline | Research Part 3 §D22 | Net-new domEventHandlers extension on CM6 |
| D6 | Paste source detection: 5 branches (vscode-editor-data → text/x-gfm → data-pm-slice → generic HTML → text/plain+isMarkdown) | T | LOCKED | Reversible (add/remove branches) | Highest-fidelity branch wins; covers 10+ real sources | Research Part 2 §D13 | Shared routing module used by both views |
| D7 | **Custom-node mdast emission: promote from `html` passthrough to first-class types with distinct markdown- and HTML- serialization handlers** | T | DIRECTED (pattern set; per-node details at implementation) | Reversible (handler refactor) | `html` passthrough works for markdown round-trip but breaks HTML emission to external destinations. Promoting to first-class types is architecturally-correct under greenfield posture. Markdown handler emits `[[Page]]`/`<Component>`; HTML handler emits `<a>`/semantic HTML. | Spec-surfaced by 1P investigation (see evidence/custom-node-mdast-promotion.md — to write). | Touches `packages/core/src/markdown/index.ts` PM→mdast handlers + `mdast-augmentation.ts` + new mdast-to-hast handlers |
| D8 | **Ambiguous paste (both text/plain and text/html present, text/plain looks like markdown): prefer markdown-first** (BlockNote `prioritizeMarkdownOverHTML: true`) | P | DIRECTED | Reversible (config toggle) | Symmetric with our Archetype D text/plain=markdown stance; avoids HTML lossy-conversion when markdown source is available | Research Part 2 §D14-3 | Overridable via extension option |
| D9 | Day-one source cleanup panel: Google Docs + Word (`mso-*`). Others (Cocoa, Gmail, Notion-whitespace, VS Code structural) added iteratively as user feedback surfaces | P | DIRECTED | Reversible (add plugins) | Narrow MVP surface; most-common rich sources first; plugin architecture makes extension trivial | Research Part 2 §D13 | 4 other plugins deferred to Future Work / iterative ship |
| D10 | No paste-time DOMPurify / storage-layer sanitization | X | LOCKED | 1-way (invariant, matches NG4) | rehype-remark structurally drops script/event-handler attrs; XSS is render-layer concern | Research Part 2 §D16 | Consistent with R18 + CLAUDE.md NG4 |
| D11 | Linewise copy preservation in Source deliberately not preserved | T | LOCKED | Reversible (can re-add) | CM6's `lastLinewiseCopy` is module-internal; preserving requires patching CM6 or tracking in parallel. Accept regression for v1. | Research Part 3 §D21-2 | Flag in release notes; revisit if reported |
| D12 | Error-path fallback discipline: three-layer graceful degradation (rehype fails → markdown fails → text/plain), never silent content drop | T | LOCKED | Reversible | Keystatic pattern; user content is sacred | Research Part 3 §D21 | All conversion calls wrapped in try/catch with `console.warn` |
| D13 | **Package layout: both shared modules live in `packages/core/src/markdown/`** — specifically `html-to-mdast.ts` and `mdast-to-html.ts` — alongside existing `pipeline.ts`, `handlers.ts`, `to-markdown-handlers.ts` | T | DELEGATED (implementer owns details) | Reversible | Colocates with existing unified pipeline; testable in isolation; re-usable by future surfaces | — | Test files `html-to-mdast.test.ts` + `mdast-to-html.test.ts` alongside |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | What is the exact HTML rendering for each custom node? (wikiLink as `<a>` — what class? jsxComponent with unknown tags — render the raw source as `<pre>` escaped? jsxInline — render children with a wrapper span?) | T | P0 | Yes (blocks D7 implementation) | User picks (see §Items needing input) | Open |
| Q2 | Should we add the `prioritizeMarkdownOverHTML` behavior as a user-configurable extension option, or hard-code it to `true`? | P | P0 | No (default true per D8; config is UX polish) | User picks | Open |
| Q3 | Should we prepare a Cmd+Shift+V plain-paste guardrail inside Source's domEventHandlers? CM6 default respects `event.shiftKey` naturally; our wrapper needs explicit passthrough. | T | P0 | Yes (behavior must be correct day-one) | Implementation detail — default to "respect shift, pass through to CM6 default on shift" | Open |
| Q4 | Should copy while cursor is inside code block in WYSIWYG degrade to plain-text (inverse of FR-10's paste behavior), or emit canonical markdown (code block fence + content)? | P | P0 | No (can ship either) | User picks or delegate | Open |
| Q5 | Day-one-plus source cleanup priorities beyond Google Docs + Word: which next? User testing might quickly surface Gmail (very common) or Cocoa (Apple Notes paste) as critical | P | P2 | No (iterative; not blocking v1) | Ship GDocs + Word day-one; add others when evidence surfaces | Open |
| Q6 | Performance ceiling: should we instrument a paste-duration warning (e.g. > 250ms sync) to catch performance regressions early? | T | P2 | No | Observability follow-up | Open |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | Adding `rehype-parse`, `rehype-remark`, `remark-rehype`, `rehype-stringify` to `packages/core` does not conflict with existing unified plugin versions | HIGH | Run `bun install` locally; verify no peer-dep warnings | Before finalization | Active |
| A2 | Bundle size impact of the four new plugins is acceptable (<50KB min+gz combined) | MEDIUM | Measure with `bun build` + size-limit tooling after implementation | During implementation | Active |
| A3 | Custom-node HTML rendering (wikiLink as `<a>`, jsxComponent escaped) does not introduce XSS — DOMPurify at docs-site render layer remains sufficient | HIGH | Security review during implementation; existing render-layer DOMPurify handles `htmlBlock`; new clipboard HTML is structurally-constrained by rehype pipeline | Before finalization | Active |
| A4 | Observer B's typing-defer (TYPING_DEFER_MS=300ms) handles large (1MB) Source paste without visible lag | MEDIUM | Benchmark test with 1MB Google Docs paste sample; measure Observer B re-parse time | During implementation | Active |
| A5 | CM6 `EditorView.domEventHandlers` running via our extension takes precedence over CM6 built-in handlers for copy/cut/paste | HIGH | Source-verified: built-in handlers only run when our handler returns `false`. Confirmed pattern in D21/D22 code sketches. | N/A (verified) | Verified |
| A6 | `y-codemirror.next@0.3.5` does not intercept copy/paste events in a way that conflicts with our handlers | HIGH | Grepped its source — no copy/paste event overrides. Y.Text binding is transaction-level only. | N/A (verified) | Verified |

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
6. Wire WYSIWYG clipboard: `clipboardTextSerializer` + `clipboardSerializer` + `handlePaste` in `TiptapEditor.tsx`.
7. Wire Source clipboard: `EditorView.domEventHandlers.copy/cut/paste` in `SourceEditor.tsx`.
8. Extend paste-fidelity E2E test (`packages/app/tests/stress/paste-fidelity.e2e.ts`) with cross-view + cross-source scenarios.
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
| Custom-node HTML rendering introduces subtle escaping bugs | MEDIUM | MEDIUM | Per-node test coverage; security review during implementation; render-layer DOMPurify as safety net | Nick |
| rehype-remark converts some GFM constructs (tables with complex colspan) unexpectedly | MEDIUM | LOW | Day-one tests cover basic GFM; complex Word-style tables deferred to NG3 | Nick |
| Ambiguous paste markdown-first default (D8) occasionally misfires on benign text | LOW-MED | LOW | isMarkdown heuristic (3+ signal threshold) tuned in research; Cmd+Shift+V always available as escape | Nick |
| Bundle size regression from 4 new unified plugins | LOW | LOW | Measure; if >50KB, investigate lazy-loading paths | Nick |
| Cross-browser differences in sync event preventDefault semantics | LOW | MEDIUM | Test on all three browsers day-one; return-true pattern matches CM6's own handlers | Nick |
| Observer-B re-parse latency on 1MB+ paste causes visible lag | LOW | MEDIUM | Benchmark (A4); if visible, add paste-size warning + offer paste-as-plain via UI | Nick |
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
- **Playwright cross-browser clipboard virtualization strategy.** Current E2E uses Playwright's clipboard API; need to verify it covers all five branches + cross-view.
- **Paste-duration performance telemetry.** Q6 follow-up.

### Noted

- **Mobile (iOS Safari, Chrome Android) clipboard edge cases.** User activation rules differ; may need `Promise<Blob>` payload pattern for iOS Safari per Part 1 §D8.
- **Accessibility: copying screen-reader-friendly text.** Current proposal emits rendered HTML in text/html; screen readers usually read text/plain. No regression but not optimized.
- **Analytics: paste sources distribution.** Could inform which rehype cleanup plugins to prioritize beyond day-one.

## 16) Agent constraints

- **SCOPE:** 
  - `packages/core/src/markdown/html-to-mdast.ts` (new)
  - `packages/core/src/markdown/mdast-to-html.ts` (new)
  - `packages/core/src/markdown/rehype-plugins/` (new dir: `strip-gdocs-wrapper.ts`, `strip-mso-styles.ts`)
  - `packages/core/src/markdown/index.ts` (PM→mdast handler edits per D7)
  - `packages/core/src/markdown/to-markdown-handlers.ts` (new handlers per D7)
  - `packages/core/src/markdown/mdast-augmentation.ts` (new types per D7)
  - `packages/core/package.json` (add 4 unified plugins)
  - `packages/app/src/editor/TiptapEditor.tsx` (clipboardTextSerializer + clipboardSerializer + handlePaste)
  - `packages/app/src/editor/SourceEditor.tsx` (domEventHandlers.copy/cut/paste)
  - `packages/app/tests/stress/paste-fidelity.e2e.ts` (extend)
  - `packages/core/src/markdown/*.test.ts` (new unit tests)
  - `CLAUDE.md` (append precedent: greenfield clipboard pipeline, promoted custom-node mdast types)

- **EXCLUDE:**
  - ProseMirror schema files (`packages/core/src/extensions/`) — NO narrowing per schema-add-only precedent
  - Observer files (`packages/app/src/editor/observers.ts`) — bridge invariants preserved; no origin-tag changes
  - Server code (`packages/server/`) — client-only feature
  - Docs site (`docs/`) — no doc-site impact
  - Image paste / file handler (`packages/app/src/editor/image-upload/`) — NG4

- **STOP_IF:**
  - Custom-node HTML rendering surfaces XSS concerns not mitigated by existing render-layer DOMPurify
  - rehype-parse or rehype-remark peer-dep conflicts with existing unified version
  - Bundle size regression exceeds 50KB (A2 verification)
  - Observer bridge invariant violations surface in bridge-matrix tests
  - Performance on 1MB+ paste exceeds 1s total latency
  - Any proposed change to `schema.parseDOM` on existing custom nodes (signals schema narrowing)

- **ASK_FIRST:**
  - Adding a fifth unified plugin beyond the four specified
  - New MIME types beyond `text/plain` + `text/html` (NG5, NG6 forbid)
  - Any DOMPurify usage in the clipboard pipeline (NG7 / D10 forbid)
  - Changing the `data-pm-slice` detection string (affects cross-editor interop)
  - Promoting a P2 Future Work item into the implementation
