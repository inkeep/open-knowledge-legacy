---
title: CodeMirror 6 dark theme — options for SourceEditor
description: Survey of dark-theme packages compatible with the SourceEditor's basicSetup + markdown configuration.
sources:
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/package.json
type: factual
---

# CodeMirror 6 dark theme survey

## Current state

`packages/app/src/editor/SourceEditor.tsx:34-47` constructs an `EditorState` with:
```ts
extensions: [
  basicSetup,
  markdown(),
  yCollab(ytext, provider.awareness),
  createAgentFlashSourceExtension(provider.document),
  EditorView.theme({ '&': { height: '100%' } }),
]
```

`basicSetup` ships with the default light theme (white background, dark text). No syntax highlighting theme is applied — markdown tokenization renders with default colors.

## Options

| Package | Bundle | Notes |
|---|---|---|
| `@codemirror/theme-one-dark` | tiny | Official "One Dark" port. Single named export `oneDark`. Recommended starting point. |
| `@uiw/codemirror-themes` ecosystem | varies | Many themes (github-light/dark, dracula, etc.). More choice, third-party. |
| Hand-rolled `EditorView.theme({...}, { dark: true })` | minimal | Full control; can map directly to existing CSS tokens (`var(--color-gray-900)` etc.) for visual coherence. |

## Recommendation

Two-phase approach:

1. **MVP (this spec):** Add `@codemirror/theme-one-dark`. Conditionally include `oneDark` extension when resolved theme is `dark`. This is one new dep and ~3 lines of code in `SourceEditor.tsx`.
2. **Future Work (Identified):** Replace with a hand-rolled CodeMirror theme that uses our `--color-*` design tokens, so source-editor and TipTap visual languages stay coherent.

## Integration pattern

`SourceEditor` is a React component; theme must change reactively when the user toggles. CodeMirror 6 supports dynamic theme swapping via `Compartment` (from `@codemirror/state`):

```ts
const themeCompartment = new Compartment();
// in extensions:
themeCompartment.of(resolvedTheme === 'dark' ? oneDark : [])
// on change:
view.dispatch({ effects: themeCompartment.reconfigure(...) });
```

`@codemirror/state` is already a dependency. No additional plumbing needed beyond the theme dep + ~10 lines.

## y-codemirror.next compatibility

`y-codemirror.next` provides `yCollab` extension and `cm-ySelectionCaret` / `cm-ySelectionInfo` CSS classes. Its caret colors come from awareness state (per-user) — independent of editor theme. The `.cm-ySelection` opacity (0.3 at `globals.css:262`) works on both themes.

## Open question (deferred to iteration loop)

Does `oneDark`'s syntax color palette clash with our brand tokens or feel inconsistent with the TipTap editor side-by-side? Defer until visual review during implementation.
