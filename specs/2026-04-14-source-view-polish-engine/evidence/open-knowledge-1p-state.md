# Open Knowledge 1P state (read-only snapshot)

**Date:** 2026-04-14
**Baseline commit:** `f17ad00`
**Scope:** Source-view polish engine spec — verify CodeMirror surface assumptions before implementation.

---

## 1. CodeMirror package versions

Sourced from `packages/app/package.json` declared deps + resolved versions in root `bun.lock`. Latest-on-npm column is best-effort knowledge cutoff comparison; see notes for any concerns.

| Package | Declared | Resolved (lockfile) | Notes |
|---|---|---|---|
| `@codemirror/view` | `^6.41.0` | `6.41.0` (root override pin) | Current 6.x line. Workspace `overrides` in root `package.json` force a single instance. |
| `@codemirror/state` | `^6.6.0` | `6.6.0` (root override pin) | Same — pinned via root `overrides`. |
| `@codemirror/language` | (transitive) | `6.12.3` | Comes via `@codemirror/lang-markdown`. Listed in Vite `dedupe`. |
| `@codemirror/lang-markdown` | `^6.5.0` | `6.5.0` | Current 6.x. Re-exports `markdownLanguage` (used by `wiki-link-source.ts` for `markdownLanguage.data.of({ autocomplete })`). |
| `@codemirror/lang-html` | NOT directly declared | `6.4.11` (transitive via `lang-markdown`) | **Available but transitive** — adding direct dep is safe; lockfile already has it. |
| `@codemirror/lang-yaml` | NOT present | NOT in lockfile | **Needs adding** if frontmatter YAML highlighting is desired. |
| `@codemirror/language-data` | NOT present | NOT in lockfile | **Needs adding** if dynamic codeLanguages loader desired (for fenced code blocks). |
| `@codemirror/autocomplete` | `^6.20.1` | `6.20.1` | Current. Used by `basicSetup` + wiki-link/md-link sources. |
| `@codemirror/commands` | (transitive) | `6.10.3` | |
| `@codemirror/search` | (transitive via codemirror) | `6.6.0` | |
| `@codemirror/lint` | (transitive) | `6.9.5` | |
| `@codemirror/merge` | `^6.12.1` | `6.12.1` | Currently in deps but no usage in `packages/app/src` grepped — likely vestigial. |
| `@lezer/markdown` | (transitive) | `1.6.3` | Current. **Required for tag-aware highlighting / GFM extensions on the CM6 side.** Not directly declared. |
| `@lezer/highlight` | (transitive) | `1.2.3` | Current. Need direct dep if defining a `HighlightStyle`. |
| `@lezer/common` | (transitive) | `1.5.2` | |
| `@lezer/html` | (transitive) | `1.3.13` | |
| `codemirror` (meta) | `^6.0.2` | `6.0.2` | Used only for `basicSetup` import. |
| `y-codemirror.next` | `^0.3.5` | `0.3.5` | Current. Provides `yCollab`. |
| `@uiw/codemirror-theme-basic` | `^4.25.9` | `4.25.9` | Provides `basicDarkInit` / `basicLightInit` — current themes. |

**Versions look healthy.** Two direct dependency adds likely needed for the spec (depending on scope):
- `@codemirror/lang-html` (promote transitive → direct so we can configure markdown-in-HTML or vice versa).
- `@codemirror/language-data` if we want a `codeLanguages` loader for fenced blocks.
- `@lezer/highlight` (promote transitive → direct) to author a `HighlightStyle` based on `tags.*`.
- `@codemirror/lang-yaml` only if we want YAML frontmatter syntax highlighting (it's transparently passed as text today).

---

## 2. SourceEditor.tsx current state

File: `/Users/edwingomezcuellar/projects/open-knowledge/packages/app/src/editor/SourceEditor.tsx`

### `markdown()` call

Bare call, no options:

```ts
markdown(),
```

No `base`, no `codeLanguages`, no `extensions`, no `addKeymap`, no `defaultCodeLanguage`. This means:
- GFM is **NOT** loaded on the CM6 / Lezer side (no `GFM` extension passed).
- Wiki-links are **NOT** integrated with `@lezer/markdown` (the regex-based mark in `wiki-link-source.ts` is the only source of truth on the CM side).
- No nested HTML language (Lezer markdown defaults to mixed-language only when `html: true` or with `extensions: [...]`).
- Fenced code blocks parse as `FencedCode` Lezer nodes but body content is not highlighted as the inner language.

### Extensions array (verbatim, with annotations)

```ts
extensions: [
  basicSetup,                                              // codemirror meta package — line numbers, gutters, history, search, autocomplete, default keymap, etc.
  markdown(),                                              // bare — see above
  yCollab(ytext, provider.awareness),                      // CRDT binding + remote cursors
  createAgentFlashSourceExtension(provider.document),      // Y.Map('activity') → Decoration.line('agent-flash')
  createWikiLinkSourceExtension(),                         // [[…]] regex marks + cmd+click + completion source
  createMdLinkSourceExtension(),                           // [text](./internal.md) marks + cmd+click
  themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
  EditorView.lineWrapping,                                 // soft wrap
  EditorView.theme({                                       // tiny inline theme override
    '&': { height: '100%' },
  }),
],
```

### `Compartment` usage

One `Compartment` declared at module scope:

```ts
const themeCompartment = new Compartment();
```

Reconfigured in a separate `useEffect` keyed on `resolvedTheme` — exactly as documented in CLAUDE.md (theme hot-swap without remount). No other Compartments anywhere in the editor.

### `ViewPlugin` / `StateField` / `Decoration` usage in editor surface

Found in plugins (see §5):
- `ViewPlugin.fromClass(...)` — used in `wiki-link-source.ts` and `md-link-source.ts` for regex-based decoration scanning over `view.visibleRanges`.
- `ViewPlugin.define(...)` — used in `agent-flash-source.ts` for the activity observer wiring.
- `StateField.define<DecorationSet>` — used in `agent-flash-source.ts`. Pairs with `StateEffect.define<{from, to}>` (`addFlash`) and `StateEffect.define<null>` (`removeFlash`).
- `Decoration.mark({ class })` — wiki-link, md-link.
- `Decoration.line({ class })` — agent-flash (only place using `Decoration.line`).

No `syntaxTree(...)` calls or `HighlightStyle` definitions anywhere in `packages/app/src` (verified via grep).

### Theme setup

`basicDarkInit` and `basicLightInit` from `@uiw/codemirror-theme-basic`, both with `settings.background` and `settings.gutterBackground` overridden to `var(--background)` so the CM surface inherits the app's CSS variable. Live-swapped via `themeCompartment.reconfigure(...)` on `resolvedTheme` change. No Lezer `HighlightStyle` is declared.

### Event listeners and cleanup

`keydown`/`paste`/`drop`/`cut` on `view.contentDOM` — calls `markUserTyping(provider.document)` to feed Observer B's typing-defer window (R7 fix). All four listeners removed in `useEffect` cleanup; `view.destroy()` follows.

### Two additional `useEffect`s

1. `OUTLINE_NAV_EVENT` (window) — line-number scanner for outline-panel jump-to-heading; selects `cursor(line.from)` + scrolls. Pure regex `/^#{1,6}\s/` over doc lines, skips frontmatter via `---` sentinel. **No syntaxTree usage.**
2. `RAW_MDX_NAV_EVENT` (window) — scrolls to a broken MDX region offset on `requestAnimationFrame`.

### Plugin factory functions composed today

| Factory | Returns | Composition |
|---|---|---|
| `createAgentFlashSourceExtension(doc)` | `Extension` (= `[StateField, ViewPlugin]` array) | Pure `Extension` array via tuple |
| `createWikiLinkSourceExtension()` | `Extension` (= `[ViewPlugin, domEventHandlers, EditorView.theme, markdownLanguage.data.of(...)]`) | Pure array |
| `createMdLinkSourceExtension()` | `Extension` (= `[ViewPlugin, domEventHandlers, EditorView.theme]`) | Pure array |

All three return `Extension` (CodeMirror's recursive `Extension[]` type) — drop straight into `EditorState.create({ extensions: [...] })`. Pattern is consistent.

---

## 3. Shared extensions + pipeline

### CM6 side (Lezer)

`SourceEditor.tsx` calls `markdown()` with no options. Therefore:
- **No GFM tokens on CM6.** `@codemirror/lang-markdown` exports a `GFM` extension constant (and `Strikethrough`, `Table`, `TaskList`, `Autolink`) but none are passed in the current call.
- **No wiki-link Lezer tokens.** The `@lezer/markdown` extension array (`extensions: BlockExtension[] | InlineExtension[]`) is empty. Wiki-links are highlighted purely via the visible-range regex pass in `wiki-link-source.ts` (`/\[\[[^\]]*?\]\]/g`).
- **No nested HTML / code-block language injection.** Fenced blocks render as plain monospace text; no language-data loader.
- `@lezer/markdown@1.6.3` is installed transitively and ready for direct use.

### Remark side (parse pipeline)

`packages/core/src/markdown/pipeline.ts` — parse processor uses, in order:

```
remarkParse
remarkFrontmatter (['yaml'])
remarkMdxAgnostic
remarkGfm
remarkWikiLink
restoreFromMdx               // R23 PUA restoration
autolinkPromotionPlugin
docStartThematicFixPlugin    // NG10
positionSlicePlugin
unknownMdastGuardPlugin      // R8 catch-all
ensureNonEmptyDoc
remarkProseMirror
```

Serialize pipeline uses `remarkFrontmatter`, `remarkGfm`, `remarkMdxAgnostic`, `remarkStringify`. **Drift to flag:** GFM is loaded for parse + serialize (mdast side) but **not** loaded on the CM6 Lezer tokenizer. Strikethrough `~~` and tables in source mode are tokenized as plain text by Lezer today, even though they round-trip correctly through the persistence layer.

### Wiki-link integration with CM6

There is **no** Lezer-level wiki-link tokenizer wired into the source editor. `wiki-link-micromark.ts` (in `packages/core`) is the micromark/mdast tokenizer used by `remark-parse` and TipTap — it does not feed `@lezer/markdown`. The CM6 surface uses two independent surfaces for wiki links:

1. `wiki-link-source.ts` regex `/\[\[[^\]]*?\]\]/g` — applies `cm-wiki-link` mark over `view.visibleRanges`.
2. `wiki-link-source.ts` regex `/\[\[([^[\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g` — Cmd+click navigation handler.
3. `markdownLanguage.data.of({ autocomplete: wikiLinkCompletionSource })` — registers `[[` autocomplete with markdown language data.

Note: `markdownLanguage` is exported from `@codemirror/lang-markdown` and exposes `.data` (a `Facet<{...}>`) for language-scoped contributions. This is the proper extension hook — wiki-link suggestions only fire when cursor is inside a markdown context, not e.g. inside a fenced code block. Confirmed pattern in current code.

---

## 4. Browser support

**Not declared anywhere.**

Verified absences:
- No `browserslist` field in any `package.json` (root, `packages/app`, `packages/core`, `packages/server`, `packages/cli`, `docs`).
- No `.browserslistrc` file (glob check).
- `vite.config.ts` has no `build.target` or `optimizeDeps.esbuildOptions.target` setting.
- CLAUDE.md does not declare browser targets.
- Tailwind v4 is in use (`@import "tailwindcss"` + `@tailwindcss/postcss`) — no per-app browser target overrides.

**Effective target = Vite 8 default.** Vite 8 defaults to `baseline-widely-available` (`chrome107, edge107, firefox104, safari16` per Vite 8 docs at the time the repo migrated; see `reports/vite-6-to-8-migration/REPORT.md` if confirmation is needed). Spec authors should treat this as "evergreen Chromium, Firefox 104+, Safari 16+, no IE, no legacy Edge, no transpilation to ES5."

---

## 5. Existing plugin patterns

### `wiki-link-source.ts`

- **Pattern:** `ViewPlugin.fromClass({ constructor, update })` returning `decorations` via `decorations: (v) => v.decorations`.
- **Decoration build:** `RangeSetBuilder<Decoration>()`, scanned over `view.visibleRanges` via regex (no `syntaxTree`).
- **Theme integration:** Inline `EditorView.theme({ '.cm-wiki-link': { color, fontWeight }, '.cm-wiki-link:hover': {...} })` — colors hardcoded as oklch literals (not CSS vars).
- **Composition:** Returns `Extension` (an array literal `[plugin, domEventHandlers, theme, languageData]`).
- **Cmd+click:** `EditorView.domEventHandlers({ mousedown })` with `posAtCoords` + `lineAt` + regex scan. Routes via `window.location.hash`.
- **Completions:** `markdownLanguage.data.of({ autocomplete: ... })` — additive, no second autocompletion state field.

### `md-link-source.ts`

- Same pattern as `wiki-link-source.ts`: `ViewPlugin.fromClass`, `RangeSetBuilder`, regex over `view.visibleRanges`.
- Theme also inline with hardcoded oklch (`oklch(52.7% 0.154 228.4)`, sky-700, identical to wiki-link for visual consistency).
- Filters out image syntax via `isImageMatch` (looks at preceding `!`).
- Composition: returns `Extension` array `[plugin, handlers, theme]`.

### `agent-flash-source.ts`

- **Pattern:** `StateField` + `StateEffect` + `ViewPlugin`. Distinct from the other two.
- **Decoration:** `Decoration.line({ class: 'agent-flash' })` — only place in the codebase using `Decoration.line`.
- **Effects:** `addFlash: StateEffect.define<{from, to}>` and `removeFlash: StateEffect.define<null>`.
- **StateField update:** maps existing decorations through `tr.changes`, then iterates `tr.effects`. `addFlash` handler walks lines via `doc.lineAt(pos)` and calls `flashDecoration.range(line.from)` for each line in the range, then `decorations.update({ add: builder, sort: true })`.
- **ViewPlugin role:** owns Y.Map(`'activity'`) observer, debounce timers, `visibilitychange` listener; dispatches the effects via `view.dispatch({ effects: ... })`.
- **Theme:** No inline EditorView.theme — relies on global CSS class `.agent-flash` (defined in `globals.css` via `@keyframes agent-flash` / `agent-flash-dark`).
- **Composition:** Returns `Extension` = `[flashField, flashViewPlugin]`.
- **Lifecycle:** Plugin tracks `destroyed` flag and clears all timers + unobserves Y.Map in `destroy()`.

**Cross-cutting observation:** `wiki-link-source` and `md-link-source` use **inline EditorView.theme with hardcoded oklch**, while `agent-flash-source` uses **global CSS classes via `globals.css`**. The codebase has two distinct conventions — neither references CSS variables (`var(--ok-…)` / `var(--…)`) for plugin colors. Spec authors should pick one convention and document it.

---

## 6. CSS conventions

Source: `packages/app/src/globals.css` (full read).

### Theme variable naming

- **Two layers:** Tailwind v4 `@theme { --color-* }` tokens (e.g., `--color-azure-blue`, `--color-agent`) + shadcn-style `--background` / `--foreground` / `--border` / `--ring` / `--primary` etc. set at `:root` and `.dark`.
- **No `--ok-*` prefix anywhere.** Custom Open-Knowledge tokens use the same flat `--color-*` namespace (e.g., `--color-agent`, `--color-azure-blue`). Plain shadcn tokens are unprefixed (`--background`, `--foreground`).
- Custom easing: `--ease-out-strong`, `--ease-in-out-strong`.
- Custom animations: `--animate-agent-flash`, `--animate-agent-breathing`, `--animate-undo-ready`.

### Existing `.cm-*` class patterns

Editor-specific classes already styled:
- `.cm-editor` (min-height, font-size, font-family)
- `.cm-editor .cm-content` (padding reset)
- `.cm-editor.cm-focused` (outline reset)
- `.cm-scroller` (font + scrollbar via `@apply`)
- `.cm-gutters` / `.cm-gutters.cm-gutters-before` (border + color via `@apply`)
- `.cm-lineNumbers .cm-gutterElement` (padding via `@apply`)
- `.cm-line` (padding-left via `@apply !important`)
- `.cm-ySelectionCaret`, `.cm-ySelectionInfo`, `.cm-ySelection` (yCollab cursor styling — explicit pixel values, not theme tokens)

Plugin-emitted classes (defined inline in plugin theme objects, NOT in globals.css): `.cm-wiki-link`, `.cm-md-internal-link`, `.agent-flash` (the agent-flash class IS defined globally via `@keyframes agent-flash` rules at lines 67-87 + 850-871 dark variant, and the `.dark` selector cascades through `agent-flash-dark` keyframes).

### Dark theme

Class-based via next-themes (`.dark` on `<html>`). Plain `.dark .ProseMirror …` overrides for editor surfaces. Per-keyframe dark variants exist for `agent-flash-dark`, `agent-breathing-dark`, `undo-ready-dark` — applied via `.dark [data-…] { animation-name: …-dark }` selectors. **Tailwind v4 `@custom-variant dark (&:is(.dark *))` is set at line 8.**

### Tailwind v4 in use

Yes — Tailwind v4 with `@theme { … }` blocks (not the v3 `tailwind.config.ts`-only model). PostCSS plugin `@tailwindcss/postcss`. Plugins: `tw-animate-css`, `tailwind-scrollbar`. shadcn registered via `@import "shadcn/tailwind.css"`. Custom CSS sits below the theme block as plain CSS rules — no special integration ceremony needed. New plugin styles can either:
- Add `@theme` tokens (recommended for color/easing primitives consumed across plugins).
- Add plain CSS rules below for surface-specific selectors (the established pattern for `.ProseMirror` and `.cm-*` blocks).

---

## 7. Pre-existing similar plugins

### `Decoration.line` usage

Only one consumer in `packages/app/src`:
- `packages/app/src/editor/plugins/agent-flash-source.ts` line 32: `Decoration.line({ class: 'agent-flash' })`.

No existing plugin applies per-line decoration based on `syntaxTree`. The agent-flash plugin computes line decorations from raw doc offsets supplied by Y.Map observation, not from Lezer parse data.

### `syntaxTree` usage

Zero matches in `packages/app/src` (verified via grep for `syntaxTree`, `HighlightStyle`, and `tags.`). The CM6 surface today does not consume the Lezer parse tree directly. Wiki-link and md-link decorations are pure regex over visible ranges.

### `Compartment` usage besides `themeCompartment`

Only `themeCompartment` in `SourceEditor.tsx`. No other Compartment in any editor file (verified via grep across `packages/app/src`).

### Confirmed absences

- No existing extension consumes `markdownLanguage.parser` / `syntaxTree(state)` for syntax-aware decoration.
- No `HighlightStyle.define([{tag: tags.heading, ...}])` anywhere.
- No `markdown({ extensions: [...], codeLanguages: ... })` configuration.
- No shared "decoration via syntaxTree iteration" helper module — each plugin invents its own scan loop.

A construct-polish-style plugin would be net-new architectural territory: it would be the first consumer of syntax-aware iteration, the first additional Compartment if the construct set needs to be hot-swappable, and the first place to introduce a `HighlightStyle` (or to argue against doing so).
