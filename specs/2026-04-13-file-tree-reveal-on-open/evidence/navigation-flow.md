---
name: navigation-flow
description: Code trace of all navigation entry points that change activeDocName, showing they converge on the hashchange listener in App.tsx
sources:
  - packages/app/src/App.tsx
  - packages/app/src/editor/DocumentContext.tsx
  - packages/app/src/components/FileSidebar.tsx
  - packages/app/src/components/GraphView.tsx
  - packages/app/src/components/BacklinksPanel.tsx
  - packages/app/src/editor/extensions/WikiLinkView.tsx
baseline-commit: 496a06d
---

# Navigation flow — convergence on activeDocName

All navigation entry points in the app write to `window.location.hash`, and `App.tsx` is the single listener that translates hash changes into `openDocument()` calls on the `ProviderPool`. This means a reveal effect keyed on `activeDocName` is entry-point-agnostic — it fires for every navigation surface without per-surface wiring.

## The hash-write surface

```
packages/app/src/components/FileSidebar.tsx:320    post-rename redirect:       window.location.hash = `#/${nextActiveDocName}`
packages/app/src/components/FileSidebar.tsx:362    post-delete clear:          window.location.hash = ''
packages/app/src/components/FileSidebar.tsx:418    sidebar file click:         window.location.hash = `#/${docName}`
packages/app/src/components/GraphView.tsx:243      graph node click:           if (node.id) window.location.hash = `#/${node.id}`
packages/app/src/components/BacklinksPanel.tsx:93  backlinks list click:       window.location.hash = `#/${backlink.source}`
packages/app/src/editor/extensions/WikiLinkView.tsx:251/255/258/266  wiki-link click variants
```

## The hash-read listener (single source of truth)

```ts
// App.tsx:29-39 (inside NavigationHandler component)
useEffect(() => {
  // Open initial doc on mount (direct URL load → activeDocName set synchronously here)
  onHashChange();

  function onHashChange() {
    const docName = docNameFromHash();
    if (docName) openDocument(docName);
  }
  window.addEventListener('hashchange', onHashChange);
  return () => window.removeEventListener('hashchange', onHashChange);
}, [openDocument]);
```

Note: `hashchange` does not fire on initial page load (browser behavior). The direct mount-time call on line 31 (`onHashChange()`) is what handles direct URL access. The `addEventListener` registration handles subsequent navigation.

`docNameFromHash()` (line 7) parses `#/<docName>?anchor=<anchor>` with a simple slash-prefix check + `?`-split.

`openDocument` is defined in `DocumentContext.tsx:76-80`:

```ts
openDocument: (docName: string) => {
  const p = getPool();
  p.open(docName);
  p.setActive(docName);
},
```

`ProviderPool.setActive` triggers `onChange`, which updates the snapshot → `activeDocName` flows through context → components re-render.

## Implication

Any reveal logic keyed on `activeDocName` via `useEffect(..., [activeDocName, ...])` fires for:
- Sidebar clicks
- Post-rename redirects
- Graph clicks
- Backlinks clicks
- Wiki-link click variants (with or without anchor)
- Direct URL loads (the initial hashchange fires on mount)
- Browser back/forward navigation
- **Any future entry point that writes to `window.location.hash`** — no change required

This convergence is the design property that lets the fix be a single primitive rather than per-surface patches.
