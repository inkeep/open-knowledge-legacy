# Evidence: D6 — Other CM-based markdown source editors (Zettlr, HedgeDoc, Logseq, VS Code, Foam, Dendron)

**Dimension:** D6 — Survey across OSS markdown source editors
**Date:** 2026-04-14
**Sources:** GitHub repos + locally cloned copies

---

## Findings summary table

| Product | Editor engine | Line-wrap on/off | Table decoration | Pattern family |
|---|---|---|---|---|
| **Zettlr** | CM6 (migrated) | UNRESOLVED | UNRESOLVED | UNRESOLVED |
| **HedgeDoc** | CM5 (fork `@hedgedoc/codemirror-5`) | ON | NO | pure source (text-canonical) |
| **Logseq** | `<textarea>` with React overlays; CM5 for block syntax highlight only | N/A (textarea `white-space: pre-wrap`) | NO (block-level) | host-delegated / custom |
| **VS Code** (markdown) | Monaco | OFF (default for `.md`) | NO | host-default |
| **Foam** | inherits Monaco | OFF | NO | host-delegated |
| **Dendron** | inherits Monaco | OFF | NO | host-delegated |

---

## Per-product findings

### Finding D6-1: HedgeDoc (CM5) enables `lineWrapping: true` without any table-specific handling
**Confidence:** CONFIRMED
**Evidence:** `public/js/lib/editor/index.js` includes `lineWrapping: true` in `CodeMirror.fromTextArea` options; `package.json` confirms CodeMirror 5

Implication: Long pipe table rows in HedgeDoc soft-wrap with no decoration assistance — the same pathology we're researching. HedgeDoc's view-only mode imposes a separate 758px document-max-width cap; within the editor pane, wrap-and-flow is the only strategy.

### Finding D6-2: Zettlr is on CM6 but specific table handling could not be inspected from public sources
**Confidence:** UNRESOLVED
**Evidence:** `package.json` shows `@codemirror/view: ^6.41.0` + `@codemirror/lang-markdown: ^6.5.0`; source files on specific table handling were not located via WebFetch during this pass.

Gap: To close this, clone the repo and grep for `Decoration.replace`, `TableWidget`, or `table` in its editor config. Within the scope of this report, Zettlr is unresolved.

### Finding D6-3: Logseq's primary editor is a `<textarea>`, not CodeMirror; CM5 exists only for syntax-highlighting rendered code blocks
**Confidence:** CONFIRMED
**Evidence:** `src/main/frontend/components/editor.cljs` — Rum component wrapping `ls-textarea`; markdown parsing via `marked` and `mldoc`. CodeMirror 5 in `package.json` but not primary editor engine.

Implication: Logseq is OUT OF SCOPE for CM-pattern comparison. Its long-line handling inherits `<textarea>` behavior + CSS `white-space: pre-wrap`. Tables in raw markdown are rendered via `marked` for display, but edits happen in the textarea where there's no per-line decoration.

### Finding D6-4: VS Code's default for markdown files is `editor.wordWrap: 'off'`
**Confidence:** CONFIRMED
**Evidence:** `src/vs/editor/common/config/editorOptions.ts` sets `wordWrap: 'off'` as default.

Users must opt in per-language via:

```jsonc
"[markdown]": { "editor.wordWrap": "on" }
```

Implication: VS Code's canonical answer to long pipe table rows is **horizontal scroll by default**. The markdown extension (`extensions/markdown-language-features`) provides only the preview pane; no source-editor table decoration ships in-box.

### Finding D6-5: Foam and Dendron extensions add no source-editor decorations
**Confidence:** CONFIRMED (Foam), INFERRED (Dendron)
**Evidence:** Foam's `static/preview/style.css` contains only Foam-specific link/embed classes; no CodeMirror or Monaco editor decoration sources in either repo's structure.

Implication: Both inherit VS Code's Monaco defaults — no wrap, no per-line decoration, no widget-replace for tables. Their value-add is navigation/graph features, not source-view rendering.

---

## Cross-product observation

**Of seven surveyed products, only SilverBullet (D5) ships a live-preview-hybrid source-view with block-widget replace.** HedgeDoc uses pure wrap; Logseq uses textarea; VS Code/Foam/Dendron default to no-wrap horizontal scroll; Zettlr is unresolved. This is consistent with the broader Tier-2 pattern from the prior `markdown-table-rendering-in-prose-columns` report — folder-of-markdown editors tend toward text-canonical, not widget-layered, source views.

---

## Gaps / follow-ups

- Zettlr — needs direct source inspection to resolve
- Logseq's textarea behavior on very long lines (does it horizontal-scroll? Does the outliner break lines at all?) not directly tested
- VS Code Monaco's behavior when the user opts into `word wrap: on` for markdown — does it wrap markdown table rows well, or does it have the same pathology? Worth confirming.
