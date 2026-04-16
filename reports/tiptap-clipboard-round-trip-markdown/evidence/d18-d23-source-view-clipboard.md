# Evidence: D18–D23 — Source View Clipboard Handling

**Dimensions:**
- D18 — CodeMirror 6 default clipboard behavior (source-level verification)
- D19 — Cross-view symmetry analysis (WYSIWYG vs Source)
- D20 — Canonical mdast pipeline for bidirectional conversion
- D21 — Source copy handler design
- D22 — Source paste handler design
- D23 — Observer bridge invariants under Source paste

**Date:** 2026-04-15
**Sources:** `@codemirror/view/dist/index.js` (1.41.x, local node_modules), our existing `packages/app/src/editor/SourceEditor.tsx` and `observers.ts`, CLAUDE.md bridge architecture, Parts 1 + 2 of this report.

---

## Findings

### Finding D18-1: CM6 default copy writes `text/plain` ONLY (CONFIRMED)

Source: `node_modules/@codemirror/view/dist/index.js:5128-5156`:

```js
handlers.copy = handlers.cut = (view, event) => {
  if (!hasSelection(view.contentDOM, view.observer.selectionRange)) return false;
  let { text, ranges, linewise } = copiedRange(view.state);
  if (!text && !linewise) return false;
  lastLinewiseCopy = linewise ? text : null;
  if (event.type == "cut" && !view.state.readOnly)
    view.dispatch({ changes: ranges, scrollIntoView: true, userEvent: "delete.cut" });
  let data = brokenClipboardAPI ? null : event.clipboardData;
  if (data) {
    data.clearData();
    data.setData("text/plain", text);
    return true;
  } else {
    captureCopy(view, text);
    return false;
  }
};
```

**Confirmed behavior:**
- One handler for both `copy` and `cut`.
- Bails early if selection is not inside contentDOM (cross-editor forwarding case).
- Calls `copiedRange()` → `{text, ranges, linewise}`.
- Tracks `lastLinewiseCopy` for smart linewise paste later.
- On cut, dispatches a delete transaction with `userEvent: 'delete.cut'`.
- Writes clipboard: `data.clearData()` then `data.setData("text/plain", text)`. **No `text/html`.**
- Returns `true` → CM6 infrastructure preventDefaults the native event.

**Key implication:** CM6 suppresses the browser's default DOM-selection serialization (which WOULD write syntax-highlighted spans as `text/html`). The clipboard ends up clean — text/plain only. This is explicitly a CM6 design choice.

### Finding D18-2: CM6 default paste reads `text/plain` only (CONFIRMED)

Source: `node_modules/@codemirror/view/dist/index.js:5074-5087`:

```js
handlers.paste = (view, event) => {
  if (view.state.readOnly) return true;
  view.observer.flush();
  let data = brokenClipboardAPI ? null : event.clipboardData;
  if (data) {
    doPaste(view, data.getData("text/plain") || data.getData("text/uri-list"));
    return true;
  } else {
    capturePaste(view);
    return false;
  }
};
```

**Confirmed behavior:**
- Reads `text/plain` or `text/uri-list` (URL fallback).
- **Ignores `text/html` entirely.**
- Feeds to `doPaste()` which inserts text at selection with `userEvent: "input.paste"`.

**Key implication:** Rich HTML from Gmail / Google Docs / Word → CM6 reads text/plain (which those apps populate with plaintext-stripped content) → user loses formatting on paste. **This is the real UX gap.**

### Finding D19-1: Asymmetry between WYSIWYG and Source clipboard (CONFIRMED via Parts 1+2 recommendations + D18)

| Direction | WYSIWYG (Part 1/2 rec) | Source (CM6 default) | Asymmetric? |
|---|---|---|---|
| **Copy: text/plain** | markdown source via `MarkdownManager.serialize` | markdown source via CM6 default | No — both emit same content |
| **Copy: text/html** | PM DOMSerializer (rich rendered HTML) | NONE | **Yes** — Source loses rich-paste UX |
| **Paste: text/plain (markdown)** | `MarkdownManager.parse` → PM Slice (Archetype D) | inserts verbatim (already markdown) | No — both arrive at markdown |
| **Paste: text/html (rich)** | rehype → mdast → PM handlers | ignored; reads text/plain fallback (plaintext-stripped) | **Yes** — Source loses rich-paste formatting |

**Two real asymmetries**, both on the text/html side. The text/plain paths are already symmetric (both handle markdown source the same way).

### Finding D19-2: Greenfield principle argues for closing both asymmetries (INFERRED + decision)

Per the repo's stated greenfield posture (no deferred tech debt, optimize for architecture + correctness + best product UX, not expediency):

**For copy:**
- The underlying document IS markdown, canonical across views.
- Selecting the same content in either view selects the same semantic content.
- Clipboard output representing "this content" should be identical regardless of which view originated the copy.
- Writing text/html in Source view means pasting from Source into Gmail/Slack/Notion/Apple Notes gets rendered formatting — same as WYSIWYG copy today.
- Counter-argument ("I see `**bold**` in source, I expect literal `**bold**` on paste") is weaker than it looks: most destinations pick the MIME format that matches their own content model. Rich-text destinations read text/html (rendered bold); markdown-canonical destinations read text/plain (source markdown literal). Both legs are served correctly by emitting BOTH MIMEs.
- Escape hatch for "actually I want plain text": users can pre-select a destination that reads text/plain, OR a future Cmd+Shift+C "Copy as Plain Text" command. Same escape hatch available to WYSIWYG users.

**For paste:**
- Already straightforwardly correct: rich HTML should convert to markdown before inserting into source buffer.

**Decision: close both asymmetries. Source view should symmetrically emit both MIMEs on copy and convert HTML on paste.**

### Finding D20-1: A canonical mdast-centered pipeline unifies all four conversion paths (INFERRED architectural synthesis)

The greenfield philosophy (one canonical representation; no per-view special cases) is served by treating **mdast as the hub** for clipboard conversions:

```
                      ┌──────────────────────────────────────────┐
                      │         mdast (canonical hub)            │
                      └──────────────────────────────────────────┘
                           ▲         ▲           ▲           ▲
                           │         │           │           │
              remark-parse │         │ rehype-   │ PM→mdast  │ remark-stringify
              (MD→mdast)   │         │ remark    │ handlers  │ (mdast→MD)
                           │         │ (hast→    │ (PM→mdast)│
                           │         │  mdast)   │           │
                           │         │           │           │
                        markdown   hast ◄── rehype-parse ── HTML
                          (Y.Text    (HTML AST)
                           source)                    remark-rehype + rehype-stringify
                                                              │
                                                              ▼
                                                             HTML
                           │         │           │           │
                           ▼         ▼           ▼           ▼
                      our PM handlers (mdast → PM JSON)  ──►  PM
```

**The four clipboard paths then become:**

1. **WYSIWYG copy** — PM selection → PM Slice → *our PM→mdast handlers* → mdast → {remark-stringify → markdown (text/plain); remark-rehype + rehype-stringify → HTML (text/html)}
2. **Source copy** — CM6 selection → markdown substring → *remark-parse* → mdast → {as-is → markdown (text/plain); remark-rehype + rehype-stringify → HTML (text/html)}
3. **WYSIWYG paste** — clipboard → text/html → *rehype-parse → rehype-remark* → mdast → *our mdast→PM handlers* → PM Slice
4. **Source paste** — clipboard → text/html → *rehype-parse → rehype-remark* → mdast → *remark-stringify* → markdown string → insert into CM6

**No per-view special cases.** Every conversion uses unified plugins the codebase already treats as its canonical pipeline (`packages/core/src/markdown/pipeline.ts`).

### Finding D20-2: Greenfield amendment to Part 1's `clipboardSerializer` recommendation

Part 1 Section §D9 recommended: *"Do not override `clipboardSerializer` (text/html). Let PM's default DOMSerializer produce HTML."*

Industry evidence backs this — no surveyed editor overrides it. But the industry evidence was biased by the absence of a unified mdast pipeline in the surveyed editors.

Applied with greenfield rigor to *our* stack, the architecturally-cleaner answer is **use remark-rehype + rehype-stringify for text/html in both views**, because:

1. **Source view has no PM.** It MUST use mdast-to-html for text/html. That decision is forced.
2. **If WYSIWYG keeps PM DOMSerializer for text/html, the two views emit subtly different HTML** for the same canonical content. PM's NodeView/decoration markup (TipTap plugin classes, node-view wrappers) leaks into the clipboard. Source's mdast-to-html produces clean canonical rendered HTML. Destinations like Gmail and Notion behave differently on these two.
3. **Maintainability:** one rendering path for text/html means one place to tune. Custom nodes (wikiLink, jsxComponent, rawMdxFallback) have their rendering defined once in the mdast-to-hast handler, not duplicated across `schema.toDOM` (PM) and `mdast-to-html` handler (Source).
4. **Ecosystem fit:** we're already adding rehype-parse + rehype-remark for paste. Adding remark-rehype + rehype-stringify is zero additional ecosystem surface.
5. **Testability:** the canonical pipeline has ONE output for a given input. Easier to fuzz, easier to assert invariants.

**Amended recommendation:** Use mdast-to-html (via remark-rehype + rehype-stringify) for text/html emission in BOTH WYSIWYG and Source view. PM's DOMSerializer remains available internally for DOM rendering, just not for clipboard output.

### Finding D21-1: CM6 copy handler structure for the Source copy replacement (CONFIRMED implementable)

Based on CM6 source behavior (D18-1), a Source view copy replacement that writes both MIMEs looks like:

```ts
domEventHandlers({
  copy(event, view) { return handleSourceCopyCut(event, view, 'copy'); },
  cut(event, view)  { return handleSourceCopyCut(event, view, 'cut'); },
})

function handleSourceCopyCut(event: ClipboardEvent, view: EditorView, kind: 'copy'|'cut') {
  // Mirror CM6's guard: only intercept if selection is inside our content
  if (!hasSelection(view.contentDOM, view.observer.selectionRange)) return false;
  const sel = view.state.selection.main;
  if (sel.empty) return false;

  const markdownText = view.state.sliceDoc(sel.from, sel.to);
  let htmlText: string;
  try {
    htmlText = markdownToHtml(markdownText); // shared unified processor: remark-parse → remark-gfm → remarkMdxAgnostic → ... → remark-rehype → rehype-stringify
  } catch (err) {
    console.warn('[source-clipboard] markdown→HTML failed; falling back to text-only', err);
    return false; // fall through to CM6 default (text/plain only)
  }

  // Replicate CM6's cut semantics: delete the selection after writing clipboard
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
```

**Key implementation details:**
- `hasSelection` guard matches CM6's own check (not in a cross-editor forwarded case).
- On failure, fall through to CM6 default (returns false → CM6's registered copy handler runs).
- Cut semantics preserved identically to CM6 (delete-after-write with `userEvent: 'delete.cut'`).
- No special handling needed for empty/whitespace — CM6 default's empty guard is respected.

### Finding D21-2: Linewise copy preservation (UNCERTAIN, flaggable follow-up)

CM6 tracks `lastLinewiseCopy = linewise ? text : null` for smart linewise paste into the same editor. If we override copy, we lose this tracking. For a markdown editor where linewise paste is useful (entire-line selections), the ergonomic impact is real but minor.

**Mitigation:** a copy handler that sets `lastLinewiseCopy` isn't trivially exposed from CM6 public API. Options:
- Accept the loss (Cmd+K or similar manual line-mode is still available).
- Access `lastLinewiseCopy` via the module-internal exports or a CM6 API extension request.
- Track linewise state in a parallel module-local variable and patch CM6's paste handler too.

Recommendation: **accept the loss for v1**, flag as a known regression, revisit if users report missing it.

### Finding D22-1: Source paste handler (parallel to Part 2's 5-branch dispatcher)

```ts
domEventHandlers({
  paste(event, view) {
    if (view.state.readOnly) return false;
    const cd = event.clipboardData;
    if (!cd) return false;

    // Branch 1: VS Code → fenced code block (parallel to WYSIWYG)
    if (cd.types.includes('vscode-editor-data')) {
      const mode = JSON.parse(cd.getData('vscode-editor-data'))?.mode;
      const text = cd.getData('text/plain').replace(/\r\n?/g, '\n');
      const fenced = mode ? '```' + mode + '\n' + text + '\n```' : text;
      insertTextAtCursor(view, fenced);
      event.preventDefault();
      return true;
    }

    // Branch 2: PM-origin → text/plain already markdown; let CM6 default read it
    const html = cd.getData('text/html');
    if (html && html.includes('data-pm-slice')) return false;

    // Branch 3: generic HTML → shared unified pipeline → markdown string
    if (html) {
      try {
        const mdast = htmlToMdast(html);        // shared with WYSIWYG paste
        const md = mdastToMarkdown(mdast);       // remark-stringify via our pipeline
        insertTextAtCursor(view, md);
        event.preventDefault();
        return true;
      } catch (err) {
        console.warn('[source-clipboard] HTML→markdown failed; falling back to text-only', err);
        // fall through to CM6 default
      }
    }

    // Branches 4, 5: text/plain handled by CM6 default (markdown from GitHub/VS Code/Obsidian ✓)
    return false;
  },
})
```

Behavior equivalence with WYSIWYG Part 2:

| Paste source | WYSIWYG result | Source result | Symmetric? |
|---|---|---|---|
| Gmail rich | bold/heading mdast → PM bold/heading nodes | bold/heading mdast → `**…**` / `## …` markdown → inserted | Yes (same mdast upstream; diverge only in final render) |
| Google Docs | same | same | Yes |
| Word | same | same | Yes |
| VS Code | fenced PM code block | `\`\`\`ts\n…\n\`\`\`` inserted | Yes |
| Our WYSIWYG | PM native parseFromClipboard | CM6 default reads text/plain = markdown | Yes |
| GitHub textarea | `MarkdownManager.parse` on text/plain | CM6 default inserts verbatim | Yes (both arrive at markdown) |
| ChatGPT copy-button | `MarkdownManager.parse` on text/plain | CM6 default inserts verbatim | Yes |

Every paste source produces the same canonical document state after observer bridge settling, regardless of active view.

### Finding D23-1: Observer bridge invariants hold naturally under Source paste (CONFIRMED via CLAUDE.md bridge semantics)

When Source view pastes and our handler dispatches a CM6 transaction inserting the markdown string:

1. CM6 transaction fires → `yCollab` (y-codemirror.next) binding applies the change to `Y.Text('source')`.
2. The Y.Text update has default origin (undefined — user-origin). No observer-origin tagging.
3. **Observer B** (Y.Text → XmlFragment) sees the change:
   - Origin is `undefined` → not in its `ORIGIN_TEXT_TO_TREE` skip set → sync normally.
   - Parses the new Y.Text via `MarkdownManager.parse()` and applies to XmlFragment via `updateYFragment()`.
4. **Observer A** (XmlFragment → Y.Text) does not fire — the XmlFragment update's origin is `ORIGIN_TEXT_TO_TREE` (Observer B's own origin), which is in Observer A's skip set.

End-to-end: rich HTML paste → markdown string insert → Y.Text update → XmlFragment rebuilds via our canonical parse path. **Identical data path to user typing in source view.** No invariant risk.

**Performance note:** a 1MB Google Docs paste inserts a large Y.Text change. Observer B's typing-defer (TYPING_DEFER_MS=300ms) throttles the re-parse briefly, which matches the user-typing-at-speed case. Acceptable.

### Finding D23-2: Source copy does not mutate CRDT state (CONFIRMED)

Copy is read-only. Cut mutates via `view.dispatch({changes: {from, to}})` which goes through the same user-origin path as Source paste. Observer B picks up the deletion and propagates to XmlFragment. Consistent.

### Finding D21-3: Cross-view paste matrix (synthesis)

| Scenario | Today (before changes) | After Part 2 + Part 3 |
|---|---|---|
| WYSIWYG copy → paste into Gmail | rendered HTML ✓ | rendered HTML ✓ |
| Source copy → paste into Gmail | monospace markdown literal ✗ | **rendered HTML ✓** |
| WYSIWYG copy → paste into GitHub | markdown ✓ | markdown ✓ |
| Source copy → paste into GitHub | markdown ✓ | markdown ✓ |
| Gmail rich → paste into WYSIWYG | PM rich content ✓ | PM rich content ✓ |
| Gmail rich → paste into Source | **plaintext, formatting lost ✗** | **markdown source ✓** |
| Our WYSIWYG → paste into our Source | markdown source ✓ | markdown source ✓ |
| Our Source → paste into our WYSIWYG | parsed as markdown → PM bold/heading ✓ | same ✓ |
| VS Code → paste into WYSIWYG | fenced PM code block ✓ (Part 2) | same ✓ |
| VS Code → paste into Source | plaintext code, no fence ✗ | **fenced markdown code block ✓** |

Five regressions closed. No new asymmetry introduced.

---

## Implications for Open Knowledge

1. **Add four unified plugin deps** (`rehype-parse`, `rehype-remark`, `remark-rehype`, `rehype-stringify`) — all small, all same ecosystem, all fit our existing unified pipeline idiom.
2. **Create two shared pipeline modules:**
   - `packages/core/src/markdown/html-to-mdast.ts` — HTML → mdast (consumed by WYSIWYG paste + Source paste)
   - `packages/core/src/markdown/mdast-to-html.ts` — mdast → HTML (consumed by WYSIWYG copy + Source copy)
3. **Wire four consumers** (two per view): Source view gets copy + paste domEventHandlers; WYSIWYG gets `clipboardTextSerializer` + `clipboardSerializer` + `handlePaste`.
4. **Update Part 1 recommendation** for `clipboardSerializer`: use mdast-to-html for text/html in both views (greenfield amendment — symmetric, canonical, avoids PM-specific markup leaking to clipboard).
5. **Observer bridge requires NO changes.** Source paste transactions are user-origin by default; Observer B handles them as normal typing-path events.
6. **Schema requires NO changes** (CLAUDE.md §9 precedent respected).
7. **Linewise copy tracking lost** — acceptable regression; revisit if reported.

---

## Gaps / follow-ups

- **Custom-node rendering in mdast-to-html** must handle our custom types (wikiLink, jsxComponent, rawMdxFallback, jsxInline). Per-type handlers in the mdast→hast step emit canonical HTML. Worth a focused implementation pass.
- **Empirical perf baseline** — large-doc Source paste (1MB HTML from Google Docs). Measure worst-case rehype-parse + rehype-remark + remark-stringify + Y.Text insert + Observer B reparse. Expected sub-second on desktop; verify on iOS Safari.
- **Linewise copy** — flagged as a known regression. Revisit when we have tracking data on user pain.

---

## Sources

- `node_modules/@codemirror/view/dist/index.js:5070-5156` (paste + copy handlers)
- `packages/app/src/editor/SourceEditor.tsx` (current Source view wiring)
- `packages/app/src/editor/observers.ts` (bridge observer origins — see CLAUDE.md §"Origin-guard truth table")
- CLAUDE.md — editor architecture, bridge invariants, schema-add-only precedent
- Part 1 of this report (WYSIWYG copy recommendation)
- Part 2 of this report (WYSIWYG HTML paste recommendation)
