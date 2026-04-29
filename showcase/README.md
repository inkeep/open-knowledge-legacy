---
title: Component showcase
cluster: showcase
---
# Component showcase

Live test surface for every built-in descriptor in the 6-pack foundation (CB-v2 5-pack + Math) — plus the two fallback paths and the inline-math atom. Open any file in the OK editor and start poking: the PropPanel should reflect each descriptor's typed prop surface, the slash menu (`/`) should surface the registered canonicals + wildcard, and γ should round-trip bytes on save.

## Files

- [[01-callout]] — GFM alerts (5 types) + Obsidian foldable + MDX JSX + alias folding + collapsible + color + icon
- [[02-image]] — CommonMark `![alt](src)` + MDX JSX + caption + explicit dimensions + loading + zoom
- [[03-video]] — HTML5 `<video>` wrapper + poster + autoPlay/muted/loop/controls/preload + `<source>`/`<track>` children
- [[04-audio]] — HTML5 `<audio>` wrapper + autoPlay/loop/muted/preload + `<source>` children
- [[05-accordion]] — HTML5 `<details>` substrate + MDX JSX + icon/description/id + exclusive grouping via `name`
- [[06-unknown-components]] — Wildcard fallback for cut descriptors (`<Tabs>`, `<Card>`, etc.) + `rawMdxFallback` for malformed MDX
- [[07-math]] — Block math (`$$\n…\n$$`, ` ```math `, `<Math>`) + inline math (single-line `$$x$$`, `<InlineMath>`) — KaTeX render, slash-menu insertable, source-mode LaTeX highlight

## Things to try

- Open each file, click into a component → PropPanel opens with the descriptor's typed fields.
- Toggle between WYSIWYG and source mode (editor header toggle) → γ preservation: pristine blocks round-trip byte-for-byte; dirty blocks canonicalize to MDX JSX.
- Paste content with cut descriptor names (`<Steps>`, `<Card>`, `<Banner>`, `<Files>`) → should render as a wildcard `<UnregisteredBlock>` chrome with an editable nested CodeMirror source.
- Type intentionally-malformed MDX (`<Unclosed>` without a closer) → should degrade to `rawMdxFallback` with nested CodeMirror.
- Use `/` slash menu inside a block to insert a new descriptor → should show the 6 canonicals (Callout, Image, Video, Audio, Accordion, Math) + Inline Math + wildcard.
- Try keyboard shortcuts from the docs: `Cmd`/`Ctrl`+`Shift`+`↑/↓` moves a top-level block; `Enter` or `Space` on a selected block opens the PropPanel.

# Component showcase

Live test surface for every built-in descriptor in the 6-pack foundation (CB-v2 5-pack + Math) — plus the two fallback paths and the inline-math atom. Open any file in the OK editor and start poking: the PropPanel should reflect each descriptor's typed prop surface, the slash menu (`/`) should surface the registered canonicals + wildcard, and γ should round-trip bytes on save.

## Files

- [[01-callout]] — GFM alerts (5 types) + Obsidian foldable + MDX JSX + alias folding + collapsible + color + icon
- [[02-image]] — CommonMark `![alt](src)` + MDX JSX + caption + explicit dimensions + loading + zoom
- [[03-video]] — HTML5 `<video>` wrapper + poster + autoPlay/muted/loop/controls/preload + `<source>`/`<track>` children
- [[04-audio]] — HTML5 `<audio>` wrapper + autoPlay/loop/muted/preload + `<source>` children
- [[05-accordion]] — HTML5 `<details>` substrate + MDX JSX + icon/description/id + exclusive grouping via `name`
- [[06-unknown-components]] — Wildcard fallback for cut descriptors (`<Tabs>`, `<Card>`, etc.) + `rawMdxFallback` for malformed MDX
- [[07-math]] — Block math (`$$\n…\n$$`, ` ```math `, `<Math>`) + inline math (single-line `$$x$$`, `<InlineMath>`) — KaTeX render, slash-menu insertable, source-mode LaTeX highlight

## Things to try

- Open each file, click into a component → PropPanel opens with the descriptor's typed fields.
- Toggle between WYSIWYG and source mode (editor header toggle) → γ preservation: pristine blocks round-trip byte-for-byte; dirty blocks canonicalize to MDX JSX.
- Paste content with cut descriptor names (`<Steps>`, `<Card>`, `<Banner>`, `<Files>`) → should render as a wildcard `<UnregisteredBlock>` chrome with an editable nested CodeMirror source.
- Type intentionally-malformed MDX (`<Unclosed>` without a closer) → should degrade to `rawMdxFallback` with nested CodeMirror.
- Use `/` slash menu inside a block to insert a new descriptor → should show the 6 canonicals (Callout, Image, Video, Audio, Accordion, Math) + Inline Math + wildcard.
- Try keyboard shortcuts from the docs: `Cmd`/`Ctrl`+`Shift`+`↑/↓` moves a top-level block; `Enter` or `Space` on a selected block opens the PropPanel.

