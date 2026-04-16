# Source-view minimal polish

**Status:** draft · **Author:** Nick · **Date:** 2026-04-15

Five opt-in visual improvements to CodeMirror source mode. Everything else about source rendering stays as plain CodeMirror. This spec replaces and supersedes `specs/2026-04-14-source-view-polish-engine/` — the prior PR is being abandoned; start from `main`.

---

## 1. Problem

Plain-CM6 source mode is functional but a few specific patterns are harder to read than they should be:

- Broken `[[wikilinks]]` and broken `[text][missing-label]` link-refs look indistinguishable from valid ones — authors don't notice until they follow the link.
- `~~strikethrough~~` renders as plain text in source mode (no line-through). The intent is invisible.
- Long list items wrap to column 0, breaking visual grouping — the continuation no longer looks like it belongs to the item above it.
- Fenced-code blocks have no visible language indicator; the reader has to look at the opening fence to know what language the content is.
- Source-level indentation inside long wrapped code lines collapses to column 0 on wrap, breaking the visual hierarchy of the code.
- Tables have no issues — they already render fine as plain text.

## 2. Goals

Deliver exactly the five improvements below. Nothing else.

1. **Broken-link diagnostics** — red wavy underline on unresolved wikilinks and unresolved link-references.
2. **Strikethrough rendering** — `~~text~~` shows with `text-decoration: line-through`.
3. **List hanging-indent on wrap** — wrapped continuation of a list item aligns under the item's text; the marker (`-`, `*`, `+`, `1.`, `- [ ]`) stays in its natural source position.
4. **Code-block language badge** — small visible pill next to the opening fence showing the language token (`typescript`, `python`, ...). Syntax highlighting stays unchanged (already present via the `codeLanguages` allowlist).
5. **Code-block wrap preserves indent** — when a long indented code line wraps, the continuation aligns under the code's own indentation, not under column 0. Source-literal leading whitespace on each line stays visible.

## 3. Non-goals

Everything the abandoned `2026-04-14-source-view-polish-engine` spec included except for the five items above. Explicitly NOT in scope:

- Blockquote line-tint / left-border / depth-ramp
- Heading size hierarchy (H1 1.25×, etc.)
- YAML frontmatter fence borders or line tint
- Emphasis / strong / inline-code tint or marker dimming
- Link-text / link-URL / link-mark / ref-def-label coloring
- Thematic-break rendering (no fade-to-transparent, no `border-bottom` rule)
- HTML-block purple tint
- Task-marker pills (`[ ]` / `[x]` stay as plain bracket text)
- Code-block line tint, left/top/bottom borders, compact font sizing
- Table row tint, cell color bands, accent bar, compact sizing, hanging-indent — **tables render as plain paragraph text**
- Gutter contrast tweaks, `.cm-gutters` color overrides
- Any "polish engine" registry, Compartment, or auto-bail mechanism
- Any dev-mode performance ceiling or reconfigure path

If a future feature justifies shared infrastructure, build it then — not speculatively now.

## 4. Invariants (LOCKED)

These carry over from the prior spec and remain non-negotiable:

- **D1 — Addressability.** Every source char is cursor-reachable (`ArrowLeft`/`ArrowRight`), `Cmd+A` → `Cmd+C` is byte-identical to the source, `Cmd+F`/multi-cursor/column-select match plain CodeMirror. No decoration hides or replaces a character.
- **D2 — Primitive set.** Only `Decoration.line`, `Decoration.mark`, and `Decoration.widget({ side: 1 })`. No `Decoration.replace({ block: true })`, no `atomicRanges`, no block widgets.
- **D3 — Source mode only.** WYSIWYG (TipTap) is untouched. No schema change, no TipTap extension change.

## 5. User journeys

### 5.1 Author editing a doc with broken links
1. Author types `[[New Page]]` referencing a page that doesn't exist yet.
2. Within 2s the text shows a red wavy underline. Author notices and either creates the page or fixes the typo.
3. Author writes `[click here][intro]` without defining `[intro]:` anywhere.
4. Within 2s the text shows a red wavy underline. Same fix loop.

### 5.2 Author reading `~~deprecated~~` text
1. Author sees the `~~` markers with the text between them rendered with a line through it.
2. Cursor walks through `~~` chars normally.

### 5.3 Author reading a long list
1. A bullet contains a long explanation that wraps across 3 visual lines.
2. Visual line 1: `- Long explanation that starts here and continues onto...`
3. Visual line 2 (wrapped): continuation text aligns under `L` (the first text char), not under `-`.
4. Visual line 3: same alignment as line 2.
5. Adjacent bullets at the same depth align the same way. Nested items at depth 2 use their own hanging-indent anchored at the nested text.

### 5.4 Author reading / writing a fenced code block
1. Author types ` ```typescript `.
2. Near the opening fence, a small pill reading `typescript` becomes visible.
3. Code inside the fence has syntax highlighting (unchanged from today).
4. A long indented line like `        const result = someVeryLongExpression(arg1, arg2, arg3);` wraps; the continuation aligns under `const`, not under the fence-column.
5. Short indented lines (no wrap) render with their source leading whitespace visible — the indent structure of the code is readable.

### 5.5 Author reading a table
1. Table lines render with the same font, size, and background as the paragraphs around them.
2. `|`, `---`, column text all visible and addressable. No decoration applied.

## 6. Acceptance criteria

### 6.1 Broken-link diagnostics
- AC1 `[[ThisDoesNotExist]]` → text carries `.cm-wiki-link-broken` (wavy red underline) within 2s of doc load.
- AC2 `[text][no-such-label]` (no matching `[no-such-label]: url` definition anywhere in doc) → text carries `.cm-link-ref-broken` (wavy red underline) within 2s of doc load.
- AC3 Valid `[[Existing Page]]` (matching a page in the sidebar cache) carries `.cm-wiki-link` WITHOUT `.cm-wiki-link-broken`.
- AC4 Valid `[text][defined-label]` (with matching `[defined-label]: url` definition) carries no broken-ref class.
- AC5 Editing the doc to add/remove a matching definition updates the broken-ref state within one transaction.
- AC6 Every bracket, text, and URL character remains cursor-walkable and Cmd+C-copyable byte-identical to source.

### 6.2 Strikethrough rendering
- AC1 `~~deprecated~~` → the text `deprecated` (NOT the `~~` delimiters) carries `.cm-del` with CSS `text-decoration: line-through`.
- AC2 The two `~~` delimiters stay visible in the doc (no fade, no hiding).
- AC3 Cursor walks through `~~` chars normally.

### 6.3 List hanging-indent on wrap
- AC1 `- A long bullet that wraps…` — visual line 1 starts at the marker's natural x-position. The marker `-` is at the same x it would have with no polish applied.
- AC2 Visual line 2 (wrapped continuation of the same logical source line) starts at the x-position of the first text character of the item, NOT at the marker's x.
- AC3 Works for unordered markers `-`, `*`, `+`, ordered markers `1.`, `1)`, and task markers `- [ ] `, `- [x] `.
- AC4 Works at nested depths: a depth-2 bullet's wrap aligns under its own text, not under the depth-1 text.
- AC5 Selecting the bullet + Cmd+C produces the exact source bytes (including any leading indent for nested items).

### 6.4 Code-block language badge
- AC1 Opening fence ` ```<lang> ` where `<lang>` is any non-empty token → a widget renders near that fence, visible, reading `<lang>` in small text.
- AC2 Badge background and foreground contrast satisfy WCAG AA for small text (≥4.5:1) in both light and dark themes.
- AC3 Opening fence with no language (just ` ``` `) → no badge rendered (or an empty/suppressed badge; the widget must not show an empty pill).
- AC4 Cursor walks through every char of the opening fence, including the ` ``` ` and the language token. The badge is a side-widget, not a replacement of the language token text.

### 6.5 Code-block wrap preserves indent
- AC1 A fenced code line with `N` leading spaces in source renders with those `N` spaces visible (leading whitespace is not pulled off-screen or collapsed).
- AC2 A long indented line that wraps to visual line 2 — the continuation aligns under the code's own leading-whitespace position (i.e. under the first non-whitespace character of the source line), NOT under column 0.
- AC3 No background tint on code lines. No left/top/bottom border around the code block.
- AC4 Syntax highlighting continues to work for every language in the existing `codeLanguages` allowlist (the spec does not modify the allowlist).
- AC5 Cursor walks every char including leading whitespace. Selection is byte-identical.

### 6.6 Tables (negative AC)
- AC1 Table lines carry NO polish-added class. No `.cm-table-row`, `.cm-table-header`, `.cm-table-cell-band-*`, or equivalent.
- AC2 Computed background, font-size, font-family, and line-height of a table line matches a plain paragraph line in the same document.
- AC3 `|` separators, `---` delimiters, and cell content are all visible and addressable.

### 6.7 Cross-cutting
- AC1 `bun run check` passes.
- AC2 Playwright E2E suite passes.
- AC3 No regression in WYSIWYG (TipTap) behavior — the schema is untouched.
- AC4 No regression in existing source-mode behaviors (wiki-link-source, md-link-source, agent-flash, cursor collaboration).

## 7. Non-functional requirements

- **First-paint target:** ≤ 10 ms on a 1000-line doc with the five decoration types exercised. (Baseline to beat: plain CM6 first-paint of the same doc.)
- **Per-keystroke p95:** ≤ 3 ms at viewport-typical decoration count.
- **Bundle impact:** < 5 KB minified + gzipped for the new code + CSS combined.
- **No runtime config:** no feature flag, no user-visible toggle, no settings UI. The five decorations are always on.
- **No auto-bail:** scope is small enough that pathological documents (thousands of lines, heavy nesting) remain handleable by the same viewport-scoped primitives CM6 uses for syntax highlighting. If perf ever regresses, fix the regression — don't add a kill-switch.

## 8. Current state (what exists today on `main`)

- **Wiki-link plugin.** `packages/app/src/editor/plugins/wiki-link-source.ts` already detects `[[...]]` patterns and decorates them. It consults `pagesCache` for existence. Broken-wikilink handling — specifically the `.cm-wiki-link-broken` class — was added in the abandoned branch; on `main` the plugin only decorates valid/unvalidated wikilinks uniformly. **We port the broken-wikilink detection back into this plugin as part of §6.1.**
- **Markdown code languages.** `packages/app/src/editor/markdown-code-languages.ts` — the explicit allowlist that gives fenced code blocks syntax highlighting without pulling all ~150 `@codemirror/language-data` chunks. Already wired into `SourceEditor.tsx`. **Keep as-is; no changes.**
- **GFM extension.** `markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages, htmlTagLanguage: html({ matchClosingTags: false }) })` in `SourceEditor.tsx` — provides the `Strikethrough`, `Table`, and `TaskMarker` lezer nodes. **Keep as-is.**
- **Source editor.** `packages/app/src/editor/SourceEditor.tsx` — CM6 wiring with `y-codemirror.next` for CRDT sync, Compartment-based theme hot-swap, agent-flash plugin, wiki-link-source, md-link-source. **Extend: add the new ViewPlugin + StateField + one CSS file import.**
- **Globals CSS.** `packages/app/src/globals.css` — where theme tokens, CM6 overrides, and all `.cm-*` rules live. **Extend: add the small CSS block described in §9.**
- **No polish-engine code exists** — abandoning the prior branch means the `polish-engine/` submodule, construct configs, auto-bail, and all related CSS are never introduced.

## 9. Proposed solution

### 9.1 Architecture

One small file adds all five features. No generic "engine," no registry, no Compartment.

```
packages/app/src/editor/source-polish/
├── index.ts              — sourcePolishExtensions(): Extension[]
├── view-plugin.ts        — viewport-scoped lezer walk; emits .cm-del, .cm-list-item, .cm-fenced-code-line, .cm-code-language-badge widget
├── broken-ref-field.ts   — StateField: doc-wide cross-scan for [text][label] without [label]: url, emits .cm-link-ref-broken
└── index.test.ts         — unit tests for broken-ref logic
```

Wire-up in `SourceEditor.tsx`: append `...sourcePolishExtensions()` to the extensions array.

Broken-wikilink detection is already in `wiki-link-source.ts`; no new module needed — we port the 5-line change that emits `.cm-wiki-link-broken` on cache miss.

### 9.2 Decoration mapping

| Feature | Source | Lezer node(s) | Decoration | Class |
|---|---|---|---|---|
| Strikethrough | `~~x~~` | `Strikethrough` (content children, NOT delimiters) | `Decoration.mark` | `.cm-del` |
| List hanging indent | `- foo`, `1. foo`, `- [ ] foo` | `ListItem` (line at item start) | `Decoration.line` | `.cm-list-item` |
| Code wrap-preserve-indent | Indented line inside `FencedCode` body | `FencedCode` content lines | `Decoration.line` + inline `style` for `padding-inline-start` (wrap-anchor only; no text-indent) | `.cm-fenced-code-line` |
| Code language badge | ``` ```typescript ``` | `CodeInfo` inside `FencedCode` | `Decoration.widget({ side: 1 })` rendering a `<span>` | `.cm-code-language-badge` |
| Broken link-ref | `[text][missing]` | StateField: enumerate `LinkReference` nodes and `LinkReference` definitions across doc | `Decoration.mark` | `.cm-link-ref-broken` |
| Broken wikilink | `[[Missing]]` | Existing `wiki-link-source.ts` regex + `pagesCache` | `Decoration.mark` | `.cm-wiki-link-broken` (existing class) |

### 9.3 CSS additions to `globals.css`

```css
/* Source-view minimal polish */

/* Strikethrough — line-through, no color change. */
.cm-del {
  text-decoration: line-through;
}

/* List hanging-indent: wrapped continuation aligns under item text.
   Achieved by padding-inline-start only — marker stays at source-natural x.
   The hanging amount per depth is set via a --list-hang custom property
   emitted inline by the ViewPlugin (derived from listItem nesting). */
.cm-list-item {
  padding-inline-start: var(--list-hang, 2ch);
  text-indent: calc(-1 * var(--list-hang, 2ch));
}
/* NOTE: text-indent:-<N>ch only affects the FIRST visual line; wrapped lines inherit
   padding-inline-start: <N>ch. Result:
   - visual line 1 first char at x=0 (the marker, exactly as plain CM would render)
   - wrapped lines at x=<N>ch (under the text, not under the marker) */

/* Fenced code — wrap-preserve-indent via padding-inline-start only (no text-indent).
   The ViewPlugin sets --line-indent per-line to the leading-whitespace count.
   NO tint, NO border — the code block visually blends with paragraph text
   except for monospace font and syntax-highlight colors (already applied by CM). */
.cm-fenced-code-line {
  padding-inline-start: calc(var(--line-indent, 0) * 1ch);
  /* No text-indent: leading whitespace in source renders naturally on line 1;
     the padding-inline-start only affects wrapped continuation. */
}

/* Code language badge — visible pill next to opening fence.
   Uses --color-primary (dark text in light, light text in dark) against a muted
   background that passes WCAG AA. */
.cm-code-language-badge {
  display: inline-block;
  margin-left: 0.5ch;
  padding: 0 4px;
  font-size: 0.75em;
  font-family: var(--font-mono);
  color: var(--color-primary);
  background: color-mix(in oklab, var(--color-primary) 12%, transparent);
  border-radius: 2px;
  vertical-align: baseline;
}

/* Broken link-ref — wavy red underline (LSP convention). */
.cm-link-ref-broken {
  text-decoration: underline wavy;
  text-decoration-color: oklch(55% 0.15 25);
}

/* Broken wikilink — same wavy red underline. Class already exists on main
   via wiki-link-source.ts; this rule adds it to globals.css alongside
   the other source-polish rules. */
.cm-wiki-link-broken {
  text-decoration: underline wavy;
  text-decoration-color: oklch(55% 0.15 25);
}
```

### 9.4 Implementation notes

- **List hanging-indent depth.** The `listItem` nesting depth determines the hang amount. A simple heuristic: count ancestor `ListItem` / `List` nodes in the syntax tree; emit `--list-hang: <depth * 2>ch` (or whatever feels right) as an inline style on the line decoration. This is a DELEGATED decision — the AC only cares about correct alignment relative to the marker.
- **Code wrap-preserve-indent.** Count leading ASCII spaces in the source line (tabs count as 4 visual columns — or match whatever CM's tab-size is; the two should agree). Emit `--line-indent: <N>` inline. **Crucially, do NOT apply negative text-indent** — the failure mode of the prior spec was that `text-indent: -<N>ch` pulled the leading whitespace off-screen, flattening visual indent to column 0. The corrected formulation uses `padding-inline-start` only, which affects wrap anchoring without touching first-line x.
- **Strikethrough target.** Apply `.cm-del` to the text *between* the two `~~` delimiters, not to the delimiters themselves. Delimiters remain plain.
- **Language badge as widget.** `Decoration.widget({ side: 1 })` attached at the end of the `CodeInfo` node keeps the source `typescript` text addressable and adds the pill after it. If `CodeInfo` is absent (no language specified) no widget is emitted.
- **Broken-ref StateField scope.** Run the cross-scan only when `tr.docChanged`. Build two sets: `{ definitions: Set<label> }` and `{ references: Array<{ range, label }> }`. For each reference whose label isn't in the definitions set, emit a `Decoration.mark`. Same approach the prior branch used; keep that logic.

## 10. Test matrix

Keep tight. The AC list is small; the test list matches.

| Category | Test | Target AC(s) |
|---|---|---|
| Unit | `broken-ref-field.test.ts`: given fixtures with valid/invalid refs, assert decoration ranges | §6.1 AC2, AC4, AC5 |
| Unit | `wiki-link-source.test.ts`: extend existing tests to cover `.cm-wiki-link-broken` emission on cache miss | §6.1 AC1, AC3 |
| Playwright | `source-polish.e2e.ts` — single test file, one describe block per feature: | |
| Playwright | `~~deprecated~~` → `.cm-del` present on text, absent on `~~` | §6.2 AC1–AC3 |
| Playwright | Long list item wrap → wrapped continuation x > marker x | §6.3 AC1–AC2 |
| Playwright | ` ```typescript ` → `.cm-code-language-badge` visible and reads `typescript` | §6.4 AC1 |
| Playwright | ` ``` ` (no language) → no badge | §6.4 AC3 |
| Playwright | Indented code line → first non-whitespace char x > code-block-left-edge x | §6.5 AC1 |
| Playwright | Long indented code line → wrapped continuation aligns under indent | §6.5 AC2 |
| Playwright | Table line → same computed style as adjacent paragraph line | §6.6 AC1–AC2 |
| Playwright | Addressability: Cmd+A → Cmd+C === source bytes on a doc containing all five construct types | §6.7 AC1 (cross-cutting invariant) |

No screenshot-diff suite, no `§10.7b`-style capture — the scope is small enough that textual assertions on classes + computed styles suffice.

## 11. Decision log

- **D1 — LOCKED** — Addressability invariant (cursor-walkable, byte-identical copy, no atomic ranges, no block replacement).
- **D2 — LOCKED** — Only the five features in §2. Anything else is out of scope.
- **D3 — LOCKED** — No "engine," no registry, no Compartment, no auto-bail.
- **D4 — LOCKED** — Tables receive no decoration. Plain paragraph text.
- **D5 — LOCKED** — Code blocks get NO background tint and NO border. Only syntax highlighting (which they have today via `codeLanguages`) and the language badge.
- **D6 — LOCKED** — Source-indent preservation via `padding-inline-start` only; NEVER apply negative `text-indent`. The prior spec's formulation flattened first-line indent to column 0, which is the failure mode we're fixing.
- **D7 — LOCKED** — For broken-link coloring, use a specific wavy-red `oklch(55% 0.15 25)`. Do NOT use `var(--color-accent)` for foregrounds anywhere — in shadcn's light theme it resolves to `oklch(0.97)` (near-white background token), making text invisible.
- **D8 — DELEGATED** — List hanging-indent exact ch-per-depth (2ch? marker-width-aware?) left to implementation, as long as §6.3 AC1–AC4 pass.
- **D9 — DELEGATED** — Language badge exact visual (color hue, padding, position) left to implementation, as long as AC2 contrast passes.

## 12. Open questions

- **Q1:** Should `.cm-del` also dim the content color (e.g. to muted-fg), or keep the text at normal color with just the line-through? **Default: normal color + line-through only.** Easy to change if the reading feels off.
- **Q2:** Code-block language badge position — before or after the opening fence's language token? `Decoration.widget({ side: 1 })` puts it *after*. Some editors put the badge at the top-right of the block as a floating label. **Default: inline after the `CodeInfo` text, which is the D2 primitive-set-compatible form.** Floating labels would require a block widget, which is forbidden.
- **Q3:** Nested code blocks inside list items — the source has extra leading whitespace to stay inside the list. Should the code content render with that outer indent visible too, or should the code block visually "return to column 0" inside the list item? **Default: source-literal (whatever the source has, render it). If the outer indent bothers users in practice, address in a follow-up.**

## 13. Rollout

- Branch from `main`, NOT from `spec/source-view-polish-engine`.
- Close and delete PR #147 (the abandoned polish-engine PR).
- One new PR targeting `main`. Estimated size: ~150–250 LOC across `source-polish/` (3 files), `globals.css` (one small block), `wiki-link-source.ts` (minor extension), `source-polish.e2e.ts` (one test file).
- No migration, no feature flag, no settings surface. The five decorations are always on from the commit that lands them.
- Zero impact to persistence, CRDT, markdown pipeline, agent-write path, MCP, or any server-side code.

## 14. Risks

- **R1 — LOW** — Negative `text-indent` temptation. The wrap-preserve-indent CSS is easy to regress into the prior spec's formulation. Mitigation: §9.4 note + D6 lock + AC6.5.1 + Playwright assertion on first-char-x vs leading-whitespace-count.
- **R2 — LOW** — List hanging-indent breaks cursor navigation into the gutter on some font sizes. Mitigation: AC6.3.1 (marker at natural x) + Playwright cursor-walk test.
- **R3 — LOW** — Broken-ref StateField performance on very long docs. Mitigation: `!tr.docChanged` early return (already the pattern from the prior branch); doc-wide scan is still cheap because it's a single syntax-tree walk with set lookups.
- **R4 — LOW** — GFM Strikethrough lezer node shape differs from expectation. Mitigation: small unit test on the node range for a fixture `a~~b~~c` — the `.cm-del` range should cover only `b`.
