---
type: code-trace
sources:
  - packages/app/src/editor/extensions/slash-command.ts
  - packages/app/src/editor/extensions/wiki-link-suggestion.ts
created: 2026-04-13
---

# Floating UI Positioning Duplication

## Finding

Both `slash-command.ts` (lines 124-163) and `wiki-link-suggestion.ts` (lines 242-279) contain structurally identical positioning code:

- `virtualEl` pattern: `getBoundingClientRect` from `clientRect()`, `contextElement` from `editor.view.dom`
- `doPosition` function: `computePosition` with `placement: 'bottom-start'`, middleware `[offset(4), flip(), size({ apply({ availableHeight }) { ...set --suggestion-menu-max-height CSS var... } })]`
- `.then` applies `left/top` styles; `.catch` logs with menu-specific label
- `autoUpdate(virtualEl, popup, doPosition)` for scroll/resize tracking

## Divergence instance

PR #78 (wiki-link migration) removed a redundant `doPosition()` call after `autoUpdate` — verified that `autoUpdate` calls the callback synchronously on setup per [Floating UI docs](https://floating-ui.com/docs/autoupdate). This fix was NOT applied to `slash-command.ts:197`, where the redundant call remains. Concrete example of duplication causing inconsistency.

## Diff

Only differences are:
1. Indentation (slash-command is nested one level deeper inside Extension.create)
2. Log label string (`'SlashCommand: computePosition failed...'` vs `'[wiki-link-suggestion] computePosition failed'`)
3. Redundant `doPosition()` call in slash-command (bug — removed in wiki-link)
