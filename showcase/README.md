---
title: Component showcase
cluster: showcase
---
# Component showcase

Live test surface for every built-in descriptor in the CB-v2 5-pack foundation — plus the two fallback paths. Open any file in the OK editor and start poking: the PropPanel should reflect each descriptor's typed prop surface, the slash menu (`/`) should surface the 5 registered + wildcard, and γ should round-trip bytes on save.

## Files

- [[01-callout]] — GFM alerts (5 types) + Obsidian foldable + MDX JSX + alias folding + collapsible + color + icon
- [[02-image]] — CommonMark `![alt](src)` + MDX JSX + caption + explicit dimensions + loading + zoom
- [[03-video]] — HTML5 `<video>` wrapper + poster + autoPlay/muted/loop/controls/preload + `<source>`/`<track>` children
- [[04-audio]] — HTML5 `<audio>` wrapper + autoPlay/loop/muted/preload + `<source>` children
- [[05-accordion]] — HTML5 `<details>` substrate + MDX JSX + icon/description/id + exclusive grouping via `name`
- [[06-unknown-components]] — Wildcard fallback for cut descriptors (`<Tabs>`, `<Card>`, etc.) + `rawMdxFallback` for malformed MDX

## Things to try

- Open each file, click into a component → PropPanel opens with the descriptor's typed fields.
- Toggle between WYSIWYG and source mode (editor header toggle) → γ preservation: pristine blocks round-trip byte-for-byte; dirty blocks canonicalize to MDX JSX.
- Paste content with cut descriptor names (`<Steps>`, `<Card>`, `<Banner>`, `<Files>`) → should render as a wildcard `<UnregisteredBlock>` chrome with an editable nested CodeMirror source.
- Type intentionally-malformed MDX (`<Unclosed>` without a closer) → should degrade to `rawMdxFallback` with nested CodeMirror.
- Use `/` slash menu inside a block to insert a new descriptor → should show exactly 5 built-ins + the wildcard.
- Try keyboard shortcuts from the docs: `Cmd`/`Ctrl`+`Shift`+`↑/↓` moves a top-level block; `Enter` or `Space` on a selected block opens the PropPanel.

# Component showcase

Live test surface for every built-in descriptor in the CB-v2 5-pack foundation — plus the two fallback paths. Open any file in the OK editor and start poking: the PropPanel should reflect each descriptor's typed prop surface, the slash menu (`/`) should surface the 5 registered + wildcard, and γ should round-trip bytes on save.

## Files

- [[01-callout]] — GFM alerts (5 types) + Obsidian foldable + MDX JSX + alias folding + collapsible + color + icon
- [[02-image]] — CommonMark `![alt](src)` + MDX JSX + caption + explicit dimensions + loading + zoom
- [[03-video]] — HTML5 `<video>` wrapper + poster + autoPlay/muted/loop/controls/preload + `<source>`/`<track>` children
- [[04-audio]] — HTML5 `<audio>` wrapper + autoPlay/loop/muted/preload + `<source>` children
- [[05-accordion]] — HTML5 `<details>` substrate + MDX JSX + icon/description/id + exclusive grouping via `name`
- [[06-unknown-components]] — Wildcard fallback for cut descriptors (`<Tabs>`, `<Card>`, etc.) + `rawMdxFallback` for malformed MDX

## Things to try

- Open each file, click into a component → PropPanel opens with the descriptor's typed fields.
- Toggle between WYSIWYG and source mode (editor header toggle) → γ preservation: pristine blocks round-trip byte-for-byte; dirty blocks canonicalize to MDX JSX.
- Paste content with cut descriptor names (`<Steps>`, `<Card>`, `<Banner>`, `<Files>`) → should render as a wildcard `<UnregisteredBlock>` chrome with an editable nested CodeMirror source.
- Type intentionally-malformed MDX (`<Unclosed>` without a closer) → should degrade to `rawMdxFallback` with nested CodeMirror.
- Use `/` slash menu inside a block to insert a new descriptor → should show exactly 5 built-ins + the wildcard.
- Try keyboard shortcuts from the docs: `Cmd`/`Ctrl`+`Shift`+`↑/↓` moves a top-level block; `Enter` or `Space` on a selected block opens the PropPanel.

