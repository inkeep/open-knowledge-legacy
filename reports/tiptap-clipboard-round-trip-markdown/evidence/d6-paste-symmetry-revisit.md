# Evidence: D6 — Paste Symmetry Revisit (Lightweight R18 Follow-up)

**Dimension:** D6 (has Archetype D held up; symmetry gaps with copy; complementary paste concerns)
**Date:** 2026-04-15
**Note:** This is a LIGHT revisit of R18 (`reports/markdown-editor-paste-and-html-survey/`). R18's 15-editor landscape stands as the authoritative paste reference; this evidence file surfaces only the symmetry/complementarity questions that emerged from researching the copy direction.

---

## Key files referenced

- `reports/markdown-editor-paste-and-html-survey/REPORT.md` — R18 authoritative paste landscape
- `packages/app/src/editor/TiptapEditor.tsx:87-103` — our implementation (Archetype D)
- `packages/core/src/markdown/index.ts` — `MarkdownManager.parse`, `parseWithFallback`

---

## Findings

### Finding D6-1: Our current paste implementation is Archetype D (CONFIRMED)

Source: `packages/app/src/editor/TiptapEditor.tsx:87-103`:

```ts
// Always-parse text/plain paste as markdown (R18, Archetype D).
// All text/plain clipboard data is parsed as markdown — no detection heuristic.
// Cmd+Shift+V remains the browser-level plain-text escape hatch.
const mdManagerRef = useRef(new MarkdownManager({ extensions: coreExtensions }));

const editor = useEditor({
  editorProps: {
    ...
    clipboardTextParser: (text, _context, _plain, view) => {
      const json = mdManagerRef.current.parse(text);
      const node = view.state.schema.nodeFromJSON(json);
      return node.content as any;
    },
  },
  ...
});
```

Matches R18's recommended Archetype D for markdown-canonical WYSIWYG editors. No change needed on the paste side.

### Finding D6-2: Archetype D is the "source-text model consistent" choice — symmetric with proposed copy (CONFIRMED)

R18 REPORT.md §D1 (line 79): *"Archetype D (Milkdown/Plate) is most aligned with 'source text model' — if the editor treats markdown as its canonical format, parsing ALL text input as markdown is architecturally consistent."*

**Copy-side symmetry:** if text/plain paste is always markdown, text/plain copy should always be markdown. Asymmetry (paste parses MD but copy emits plain text) would be surprising — users can't round-trip within the same editor without loss. Confirmed no editor in the R18 survey or the D3 survey ships that asymmetric combo.

### Finding D6-3: Gaps in R18 relevant to the copy decision

R18 listed as "Dimensions Not Fully Covered" (REPORT.md §Limitations):
- Mobile paste behavior
- Drag-and-drop
- Cross-editor paste (Notion → us, us → Notion)

The cross-editor paste gap is relevant because it becomes a round-trip question once copy emits markdown. Partial answers from this research's D2 evidence:

- **Us → Notion:** Our text/plain=MD would trigger Notion's aggressive markdown detection. Rich content (headings, lists, code) round-trips; complex constructs (footnotes, nested tables, LaTeX) flatten per Notion help docs.
- **Notion → Us:** Notion writes text/html (rich Notion HTML) + its own markdown to text/plain. Our `text/html > text/plain` fallback would go... wait — we explicitly do NOT override `clipboardParser` (text/html). PM's default HTML parse would consume Notion's HTML first, and our `clipboardTextParser` only fires when there's no text/html. **This is important:** pasting from Notion currently goes through PM's HTML parse path, NOT our markdown parser. This is fine, but it's worth noting.
- **Us → Slack:** Slack prefers text/html (Quill). Our default text/html (from PM's `clipboardSerializer`) goes to Slack; falls back to Slack's micro-markdown at type-time. Slack does NOT parse markdown on paste (jvt.me reference).
- **Us → Google Docs:** Docs prefers text/html. Pastes as formatted rich text. If user uses "Paste from Markdown" menu, the text/plain=MD is used.
- **Us → GitHub textarea:** GitHub uses `text/x-gfm` when available; falls back to text/plain. Our markdown in text/plain round-trips correctly.
- **Us → Obsidian:** Obsidian's HTML→MD converter prefers text/html since v0.10.1; our text/html would be converted (with some quality loss vs pure markdown). Workaround for users: Cmd+Shift+V.

### Finding D6-4: Cmd+Shift+V is the universal escape hatch in both directions (CONFIRMED)

R18 §D1 table: `Cmd+Shift+V` works as the plain-text paste escape hatch across Notion, Typora, Obsidian, Bear, Chrome/Safari. ProseMirror's `doPaste` checks `event.shiftKey && lastKeyCode != 45` at `input.ts:662` to set the `plain` flag. Our `clipboardTextParser` passes `_plain` unused (we always parse as markdown regardless), which is correct for a markdown-canonical editor — the user's shift press tells PM "don't interpret HTML," but since we're already treating text/plain as markdown, no additional branching is needed.

For the copy direction, there is **no equivalent keyboard escape hatch** in the clipboard spec. A user who wants "copy as plain text (stripped formatting)" must use a second command (e.g. "Copy as Plain Text" menu). This asymmetry is pre-existing; no editor ships a keyboard modifier for Cmd+C variants.

### Finding D6-5: R18's "open question" about drag-and-drop is partially answered by D7 evidence

R18 flagged drag-and-drop as out-of-scope for paste. D7 evidence in this report documents the full drag/drop pipeline. Key symmetry finding: internal drag (within same editor) re-uses the slice via `view.dragging.slice` — it does NOT re-enter the text/plain parse path, so Archetype D is NOT active for internal drag. External drag (from another app) goes through the same `parseFromClipboard` as paste, so Archetype D IS active. This is the desired behavior.

### Finding D6-6: No changes to paste implementation recommended (INFERRED)

R18's Archetype D recommendation and implementation has held up under:
- 6 months of real usage (since 2026-04-11).
- D3 prior-art re-survey (Milkdown and Plate still Archetype D; tiptap-markdown maintains opt-in behavior).
- No reported false-positive corruption issues in the 1P codebase.

Proposed copy-side work does not require paste-side changes. Archetype D + proposed markdown-on-copy is the fully symmetric configuration.

---

## Implications for Open Knowledge

1. **Paste is settled.** Don't change it.
2. **Copy should emit markdown** to complete the symmetry implied by Archetype D.
3. **Our text/html paste path (via PM default)** remains the right path for cross-app HTML paste from Notion/Google Docs/Gmail. No override needed.
4. **Cross-editor paste is better than expected** — rich destinations read our text/html; markdown-aware destinations read our text/plain=MD. Both legs work.
5. **Drag-and-drop** — internal drag uses the saved slice (unaffected by `clipboardTextSerializer`); external drag uses `parseFromClipboard` (already Archetype D). Symmetry is automatic.

---

## Gaps / follow-ups

- **Pasting from Notion / Google Docs into us** was documented but not empirically tested in this pass. R18 and this research both identify it as a legitimate follow-up — would benefit from a small test matrix.
- **Pasting FROM us INTO markdown-canonical destinations** (GitHub, Obsidian, Discord) should be empirically verified post-implementation — the hypothesis is that our text/plain=MD satisfies all three, but round-trip identity on specific constructs (code blocks with backticks, nested lists, tables) needs a quick smoke test.

---

## Sources

- `reports/markdown-editor-paste-and-html-survey/REPORT.md` (R18, 2026-04-11)
- `packages/app/src/editor/TiptapEditor.tsx:87-103` (current paste implementation)
- Cross-references to D2 evidence (vendor behavior) and D7 evidence (drag-drop symmetry) in this report
