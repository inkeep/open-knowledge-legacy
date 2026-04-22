# Evidence: D4 — First-paint / FOUC handling patterns

**Dimension:** D4 — How editors apply the persisted preference before the first paint so users don't see a flash of the wrong mode
**Date:** 2026-04-21
**Sources:** next-themes source; React docs; Electron renderer lifecycle references; CM6/ProseMirror boot order considerations

---

## Key files / pages referenced

- [next-themes GitHub (pacocoursey)](https://github.com/pacocoursey/next-themes) — canonical FOUC-prevention pattern in React
- [next-themes source — index.tsx](https://github.com/pacocoursey/next-themes/blob/main/next-themes/src/index.tsx)

---

## Findings

### Finding: next-themes prevents FOUC via synchronous inline script that runs BEFORE React hydrates

**Confidence:** CONFIRMED
**Evidence:** [next-themes/src/index.tsx](https://github.com/pacocoursey/next-themes/blob/main/next-themes/src/index.tsx)

The `ThemeScript` component injects a script tag with `dangerouslySetInnerHTML`:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(${script.toString()})(${scriptArgs})`
  }}
/>
```

The `scriptArgs` payload includes storage key, default, attribute (`class` or `data-theme`), enable-system flag, and theme list:
```tsx
const scriptArgs = JSON.stringify([
  attribute, storageKey, defaultTheme, forcedTheme, themes, value,
  enableSystem, enableColorScheme
]).slice(1, -1)
```

Inside the IIFE at runtime:
1. Read `localStorage.getItem(storageKey)` synchronously.
2. Fall back to `defaultTheme` if key is missing.
3. Fall back to `system` / `prefers-color-scheme` if enableSystem.
4. Apply via `document.documentElement.classList.add(resolvedTheme)` or `setAttribute('data-theme', resolvedTheme)`.

The script runs as a **blocking inline script** in the DOM, executing before React hydration and before any component renders. Because localStorage is synchronously accessible, it completes in < 1 ms.

**Implications:** This pattern is directly portable to editor-mode persistence:
```html
<script>
(function() {
  try {
    var mode = localStorage.getItem('ok-editor-mode-v1') || 'wysiwyg';
    document.documentElement.setAttribute('data-editor-mode', mode);
  } catch (e) { /* localStorage blocked: fall back to default */ }
})();
</script>
```
CSS or first-render logic then reads the `data-editor-mode` attribute. Zero FOUC on refresh. Zero JS framework dependency.

---

### Finding: Open Knowledge's `index.html` (today) does NOT have an inline FOUC script for editor mode

**Confidence:** CONFIRMED (scope: Open Knowledge-specific; flagged here as a cross-reference, not drawn into the 3P report synthesis)
**Evidence:** `packages/app/index.html` (read during spec intake; noted for the spec, not the report itself)

CLAUDE.md previously documented an inline FOUC script for theme — but the actual file is minimal; `next-themes` handles theme FOUC internally via its `ThemeScript` component. For editor mode, no equivalent exists today.

**Implications:** Same pattern is available. Either (a) write a dedicated inline script in index.html, or (b) emit one from the React tree via `dangerouslySetInnerHTML` like next-themes does. The former is simpler for one key.

---

### Finding: Electron renderer FOUC is identical to web-browser FOUC for same-origin `file://` or dev-server assets

**Confidence:** INFERRED (general Electron Chromium knowledge; direct evidence not found in one source but matches documented behavior)

Electron BrowserWindow loads HTML via Chromium. Inline scripts execute in HTML-parse order, before React mounts. localStorage reads complete synchronously within the renderer. Same as web browser.

**Implications:** The next-themes pattern works identically in Electron. No special Electron-specific FOUC mitigation is needed IF the storage is localStorage.

---

### Finding: If preference is stored in electron-store (main process), renderer must IPC-fetch it → async → unavoidable FOUC without additional mitigation

**Confidence:** INFERRED (from the inherent round-trip nature of IPC vs localStorage synchronous access)
**Evidence:** [electron-store README](https://github.com/sindresorhus/electron-store) notes that renderer access requires `Store.initRenderer()` + IPC.

Pattern:
```ts
// renderer
const mode = await window.electronAPI.getPreference('editor-mode'); // async IPC
```
React first-render happens before this resolves → FOUC unless the HTML preloads a synchronously-available value.

Mitigation: read the preference in main process at app start, pass via `webPreferences.additionalArguments` or inject into HTML as a global variable before the renderer loads.

**Implications:** Using electron-store for mode means accepting one of:
- FOUC on first paint (bad UX — this is the exact problem the spec is trying to fix).
- Main-process preload that writes a global `window.__OK_EDITOR_MODE__` before renderer loads — extra complexity.
- Mirror to localStorage on every write → redundant storage, two sources of truth.

---

### Finding: Obsidian / Zettlr / Joplin do not document FOUC handling publicly

**Confidence:** UNCERTAIN
**Evidence:** General absence from their docs; not searched code-deep.

These apps run fully Electron-packaged. They likely either:
- Read config synchronously via `require('fs').readFileSync` on main and inject into renderer via `contextBridge` — effectively a preload script setting the mode before render.
- Accept a 1-frame delay and rely on CSS to hide content until the mode class is applied.

**Implications:** Not enough visibility to cite as prior art. For Open Knowledge's web + Electron distribution, the next-themes pattern (inline script reading localStorage) is the cleanest universal approach.

---

## Pattern synthesis

| Pattern | Works for | FOUC-free? | Cost |
|---|---|---|---|
| Inline script reading localStorage | Web + Electron renderer | Yes | Trivial — 10 lines in index.html |
| React `ThemeScript`-style injection | React apps | Yes | Small — already-proven in next-themes |
| Main-process preload + `contextBridge` | Electron only | Yes | Moderate — needs IPC plumbing |
| Async IPC fetch in renderer | Electron only | No (FOUC) | N/A — don't do this for mode |
| CSS-hide-until-resolved + async load | Any | Yes, but content-blank-on-first-paint | Poor UX — hides content instead of showing right one |

---

## Negative searches

- Searched "CodeMirror 6 FOUC" — not found as a documented concern; CM6 renders after mount, so FOUC is driven by whether the `source` vs `wysiwyg` choice is known before React mount, not by CM6 itself.
- Searched "TipTap FOUC" — same result. FOUC is at the container/mode layer, not the editor library layer.

---

## Gaps / follow-ups

- Source-level read of Obsidian / Zettlr boot order to confirm mitigation strategy — low priority, not blocking for spec.
- Whether React's `<StrictMode>` affects the inline-script timing — likely not (script is pre-hydration), but worth a quick check if Open Knowledge adds one.
