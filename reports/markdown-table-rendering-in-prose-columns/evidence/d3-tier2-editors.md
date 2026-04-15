# Evidence: D3 — Tier 2 folder-of-markdown editors (Logseq, SilverBullet, HedgeDoc, Zettlr, Dendron, Foam)

**Dimension:** How markdown-native editors render markdown tables
**Date:** 2026-04-14
**Sources:** OSS-local (Logseq, Dendron, Foam), OSS-GitHub (SilverBullet, HedgeDoc, Zettlr)

---

## Key files / pages

- `logseq/src/main/frontend/components/table.css` — Logseq's table CSS
- `dendron/packages/common-assets/styles/scss/main-plugin.scss` — Dendron's markdown preview overrides
- `foam/packages/foam-vscode/static/preview/style.css` — Foam's VS Code preview CSS (no table rules)
- HedgeDoc issue #5568 (wider tables): https://github.com/hedgedoc/hedgedoc/issues/5568
- HedgeDoc issue #2828 (fullscreen): https://github.com/hedgedoc/hedgedoc/issues/2828
- SilverBullet community: https://community.silverbullet.md/t/custom-colorful-table-styles-for-dark-theme/1620
- Zettlr custom CSS docs: https://docs.zettlr.com/en/core/custom-css/

---

## Findings

### Finding: Logseq implements custom React table components with fixed-height rows and virtual scroll viewport for database tables, plus `overflow-x-auto` wrapper for classic markdown tables
**Confidence:** CONFIRMED
**Evidence:** `logseq/src/main/frontend/components/table.css` (full file)

- `.ls-table-row` — `h-[33px] min-h-[33px] max-h-[33px]` (cells force `whitespace-nowrap text-ellipsis overflow-hidden`)
- `.query-table, .classic-table` — `@apply w-full border-none; <th>, <td> { @apply p-1.5 border border-collapse; }`
- Virtual viewport for database tables: `div[data-viewport-type="window"] { min-width: 100%; width: auto !important; }`
- Markdown tables use `.force-visible-scrollbar { !overflow-x-auto pb-1 }`

**Implications:** Logseq maintains **two separate rendering paths** — database tables (fixed row height, virtual scroll) and classic/markdown tables (full-width with `overflow-x-auto` on a wrapper). The markdown path falls into the Wrapper-scroll family. The database path is a data-grid, not a content table — outside the scope of this report's primary question.

---

### Finding: Dendron applies minimal CSS overlay on top of VS Code markdown preview; uses `-webkit-overflow-scrolling: touch` on `.table-responsive` wrapper
**Confidence:** CONFIRMED
**Evidence:** `dendron/packages/common-assets/styles/scss/main-plugin.scss:48-70, base.scss:34-40`

```scss
.vscode-light table, td, th { border: 1px solid black; padding: 10px; }
.vscode-dark  table, td, th { border: 1px solid white; padding: 10px; }
.table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
```

No `display`, `width`, or `table-layout` rules in Dendron's own CSS.

**Implications:** Dendron does not define the primary table CSS — it inherits VS Code's defaults. When a `.table-responsive` wrapper is present (Dendron's templates or markdown output), horizontal scroll activates. This is the Wrapper-scroll family, author-opt-in.

---

### Finding: Foam's preview CSS contains zero table rules; rendering delegated entirely to VS Code
**Confidence:** CONFIRMED
**Evidence:** `foam/packages/foam-vscode/static/preview/style.css` contains only Foam-specific classes (`.foam-note-link`, `.foam-placeholder-link`, `.foam-cyclic-link-warning`, `.foam-embed-*`). No selectors matching `table`, `th`, `td`.

**Implications:** Foam's strategy is "not our problem" — the host IDE governs. Falls into the Host-delegated family, which in practice inherits VS Code's built-in markdown preview (which uses `overflow-wrap: break-word` and `display: block` on tables per VS Code's bundled CSS).

---

### Finding: HedgeDoc constrains markdown view-only mode to ~758px max-width; no table-specific strategy; wide tables overflow/scroll with document
**Confidence:** INFERRED from user issues
**Evidence:**
- Issue #2828 "add fullscreen option: remove 758px width limitation" https://github.com/hedgedoc/hedgedoc/issues/2828
- Issue #5568 "Wider tables in view-only mode" https://github.com/hedgedoc/hedgedoc/issues/5568

**Implications:** HedgeDoc's rendering pipeline is markdown-it → HTML → default CSS. Wide tables render as normal browser tables inside the width-constrained document container. There's no table-specific wrapper or overflow handling documented. Whether tables overflow the 758px container or are clipped is not clearly documented — the open issues suggest users experience this as a problem.

---

### Finding: SilverBullet and Zettlr rely on user-customizable CSS for table styling; no default overflow strategy documented
**Confidence:** UNRESOLVED (no accessible authoritative CSS)
**Evidence:**
- SilverBullet: users customize via "Space Style" (fenced CSS blocks) — community CSS examples at https://community.silverbullet.md/t/custom-colorful-table-styles-for-dark-theme/1620
- Zettlr: export via Pandoc + user CSS (docs.zettlr.com/en/core/custom-css/); editor view shows markdown source (CodeMirror 5), so tables render only on export or preview

**Implications:** Both products treat table styling as author/user responsibility rather than shipping defaults. For Zettlr specifically, the editing surface is a text-canonical CodeMirror view — there's no rendered HTML table inside the editor, only in export output.

---

## Cross-editor summary

| Editor | Renderer | Default strategy | Family |
|---|---|---|---|
| **Logseq** | Custom React | `.classic-table` with `overflow-x-auto` wrapper | Wrapper-scroll |
| **Dendron** | VS Code preview | `.table-responsive` wrapper (opt-in) | Wrapper-scroll (author-opt-in) |
| **Foam** | VS Code preview | (delegates entirely to host) | Host-delegated |
| **HedgeDoc** | markdown-it | 758px document width constraint, no table wrapper | Column-width-cap at document level |
| **SilverBullet** | markdown-it | User-CSS | Author-controlled |
| **Zettlr** | Pandoc (export) + CM5 (editor) | User-CSS on export; editor is source view | Author-controlled / N/A in editor |

---

## Gaps / follow-ups

- VS Code's own markdown preview CSS is the de-facto default for Dendron and Foam. Inspecting that (`vscode/src/vs/workbench/contrib/markdown/` or the extension-side `markdown.css`) would make the inheritance chain concrete.
- SilverBullet's default table CSS (before user customization) — the repo's `web/styles/` was not directly verified. A targeted grep would resolve this.
- HedgeDoc's actual overflow behavior at viewport widths below 758px is worth confirming via a live test page.
