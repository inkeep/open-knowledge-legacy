# Evidence: D3 — Sibling editor Mermaid implementations (+ D6 mermaid-live-editor folded in)

**Dimension:** D3 (how sibling editors handle Mermaid in a NodeView-ish slot) — with D6 (mermaid-live-editor patterns) folded in per scoping decision
**Date:** 2026-04-21
**Sources:** Local OSS clones + GitHub + closed-source product docs

---

## Key files / URLs referenced

Local clones at `~/.claude/oss-repos/`:
- `outline/shared/editor/extensions/Mermaid.ts:1-603`
- `outline/shared/editor/nodes/CodeFence.ts:36-39, 156-188, 254-294`
- `blocknote/packages/code-block/src/index.ts:171-174`
- `mdx-editor/src/examples/mermaid.tsx:1-65`
- `docmost/apps/client/src/features/editor/components/code-block/mermaid-view.tsx:1-59`
- `affine/packages/frontend/core/src/modules/mermaid/renderer/mermaid.worker.ts:1-63`
- `affine/packages/frontend/core/src/modules/mermaid/renderer/index.ts:1-40`
- `lexical/` — 5 incidental hits, no mermaid extensions
- `tiptap/` — 2 incidental hits, no native mermaid
- `vscode/extensions/mermaid-chat-features/` (package.json, src/chatOutputRenderer.ts, chat-webview-src/mermaidWebview.ts)
- `vscode/extensions/markdown-language-features/` — zero mermaid hits

Remote sources:
- [md2docx/tiptap-extension-mermaid](https://github.com/md2docx/tiptap-extension-mermaid)
- [md2docx/prosemirror-mermaid](https://github.com/md2docx/prosemirror-mermaid)
- [facebook/lexical#2302](https://github.com/facebook/lexical/issues/2302)
- [waka/lexical-mermaid](https://github.com/waka/lexical-mermaid)
- [defensestation/blocknote-mermaid](https://github.com/defensestation/blocknote-mermaid)
- [mermaid-js/mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor)
- [mermaid-live-editor View.svelte](https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/components/View.svelte)
- [mermaid-live-editor src/lib/util/autoSync.ts](https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/util/autoSync.ts)
- [bierner.markdown-mermaid Marketplace](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)
- [Notion help: Code blocks](https://www.notion.com/help/code-blocks)
- [Luke Merrett: Mermaid in Notion](https://lukemerrett.com/using-mermaid-flowchart-syntax-in-notion/) (3p)
- [Obsidian Forum: Mermaid plugin](https://forum.obsidian.md/t/mermaid-plugin/97782)
- [Obsidian Forum: Mermaid theme sync (redux)](https://forum.obsidian.md/t/mermaid-theme-needs-to-mirror-obsidian-theme-redux/72819)

---

## Findings

### 1. Notion (closed source, web-based)

**Confidence:** MEDIUM
**Evidence:** Third-party reporting; product UX

- **Has Mermaid:** Yes, added to Notion Code blocks circa 2024
- **Architecture:** Mermaid is a *language option* of the generic Code block (alongside 60+ syntax-highlighted languages) — not a dedicated block type
- **Render trigger:** **User-controlled mode toggle.** Second dropdown inside the block toggles Code / Preview / Split. Preview = live render; Split = side-by-side; Code = hides render. On-exit from editing, block defaults to Preview.
- **Theme/cache/deps:** not publicly documented
- **Vendor-bias flag:** N/A — closed-source, details from third-party write-ups (flagged)

### 2. Obsidian (closed-core, open plugin ecosystem)

**Confidence:** MEDIUM-HIGH (surface); LOW (internals — closed source)
**Evidence:** [Obsidian forum](https://forum.obsidian.md/t/mermaid-plugin/97782), [redux thread](https://forum.obsidian.md/t/mermaid-theme-needs-to-mirror-obsidian-theme-redux/72819)

- **Has Mermaid:** Yes, built into core since ~v0.12. Plugins cannot replace the core renderer
- **Architecture:** Fenced code block with `mermaid` language tag, rendered as SVG in Reading View and Live Preview
- **Render trigger:** On render of Reading View / Live Preview (not manual button)
- **Theme handling:** **Known pain point.** Mermaid picks up its own theme and does not auto-mirror Obsidian's. Users work around via CSS snippets (`Settings > Appearance > CSS Snippets`) and community plugin [Mermaid Themes](https://www.obsidianstats.com/plugins/mermaid-themes). Feature requests exist to support ELK layout and theme sync in core
- **Error handling:** Not comprehensively documented; errors reportedly render in-place where SVG would appear
- **Source-vs-rendered:** Source visible in Source mode; render in Reading View. Live Preview shows render; clicking inside the fence reveals text
- **Dependencies:** Bundled `mermaid` at core-controlled version; exact pin not publicly documented

### 3. Outline (open source — local clone read fully)

**Confidence:** VERY HIGH (source-read)
**Evidence:** `~/.claude/oss-repos/outline/shared/editor/extensions/Mermaid.ts:1-603`, `shared/editor/nodes/CodeFence.ts:36-39, 156-188, 254-294`

- **Has Mermaid:** Yes, shipping
- **Architecture:** **ProseMirror plugin + `Decoration.widget` + `Decoration.node`** — NOT a dedicated NodeView. The existing `code_fence` node (`name: "code_fence"`, `code: true`, `content: "text*"`) stores source as-is; the Mermaid plugin observes blocks where `isMermaid(node)` is true and attaches widget decoration at `block.pos + block.node.nodeSize` rendering SVG beneath source. A `diagramId` (UUID) is tracked per-decoration via `spec.diagramId` for render re-use across transactions; `findBestOverlapDecoration` re-matches decorations to blocks across edits
- **Render trigger:** On any of: paste, theme-toggle transaction meta, code-block content change, remote (multiplayer) transaction, plugin-key meta. `appendTransaction` hook auto-enters edit mode when a newly-created empty Mermaid block is inserted. **No wall-clock debounce — per-transaction**
- **Theme handling:** Plugin state carries `isDark: boolean`. `mermaid.initialize({ theme: isDark ? "dark" : "default", darkMode: isDark })` called at render time. Theme changes arrive as a transaction meta `"theme"` and cause a full decoration-set rebuild
- **Error handling:** Try/catch around `mermaid.render`. Empty diagram → class `"empty"`, `innerText = "Empty diagram"`. Parse failure → class `"parse-error"`, `innerText = error`. `suppressErrorRendering: true` passed
- **Source-vs-rendered UX:** When selection is inside the code fence, enters "editing" mode (tracked by `editingId` in plugin state, toggled by `Cmd-Enter` keybinding or `edit_mermaid` command). Clicking rendered SVG selects the block; clicking again opens a Lightbox. `Escape` exits editing
- **Cache:** `sessionStorage`-backed LRU keyed by `${isDark ? "dark" : "light"}-${text}` with `MAX_STORAGE_ENTRIES = 20`. Cache miss → `mermaid.render(tempId, text)` → cache set. `Cache.get` / `Cache.set` / LRU touch list at `mermaid:lru`
- **Dependencies:** Dynamic `import("mermaid")` (lazy); `@mermaid-js/layout-elk` registered via `registerLayoutLoaders`; FontAwesome icon packs (`@fortawesome/free-solid-svg-icons`, `-free-brands-svg-icons`) converted to Iconify JSON shape via `fontAwesomeToIconify` and passed to `mermaid.registerIconPacks`
- **Notable detail:** Rendering happens in a temporary off-DOM `<div style="position: fixed; visibility: hidden">` appended to `document.body` for correct `getBBox()` (code comment references `mermaid-js/mermaid#6146`). `bindFunctions?.(element)` called after SVG injection. SVG anchor (`SVGAElement`) clicks routed through `editor.props.onClickLink(sanitizeUrl(href))` with `dictionary.openLinkError` toast fallback

### 4. BlockNote (open source — local clone read)

**Confidence:** HIGH (core negative finding); LOW (community plugin details — README minimal)
**Evidence:** `~/.claude/oss-repos/blocknote/packages/code-block/src/index.ts:171-174`; [defensestation/blocknote-mermaid](https://github.com/defensestation/blocknote-mermaid)

- **Has Mermaid:** **Core: NO** (syntax highlighting only via shiki bundle `packages/code-block/src/shiki.bundle.ts`). Community plugin: yes
- **Core evidence:** Single `mermaid` reference at `packages/code-block/src/index.ts:171-174` — a language entry in `supportedLanguages` with label `"Mermaid"`, aliases `["mermaid", "mmd"]`. Shiki grammar only
- **Community plugin (`defensestation/blocknote-mermaid`):** Registered via `BlockNoteSchema.create({ blockSpecs: { mermaidBlock, ... } })` with `insertMermaid()` slash-menu suggestion item via `SuggestionMenuController`. Because BlockNote is on TipTap/ProseMirror, underlying pattern is a custom block with `createReactBlockSpec` and NodeView-analog
- **Render trigger / theme / error / cache:** Not documented in plugin README (roadmap mentions "chart viewer in read-only mode" and "custom styles" as future work)
- **Vendor-bias:** Community plugin author is 3P, not BlockNote core

### 5. MDXEditor (open source — local clone read)

**Confidence:** VERY HIGH (example-source read)
**Evidence:** `~/.claude/oss-repos/mdx-editor/src/examples/mermaid.tsx:1-65`

- **Has Mermaid:** NOT native. **Example-only** (in docs/examples folder, not a shipped feature)
- **Architecture:** `CodeBlockEditorDescriptor` — MDXEditor's extension point for replacing code-block editor per language. Descriptor's `match(language, meta)` returns true for `'mermaid'` or `'mmd'`; `Editor` React component renders two-column layout: left `<textarea>`, right `<MermaidPreview code={code} />`. Registered via `codeBlockPlugin({ codeBlockEditorDescriptors: [MermaidCodeEditorDescriptor] })`
- **Render trigger:** **Immediate on every keystroke** (`useEffect(..., [code])` → `mermaid.render('graphDiv', code)`). No debounce in example
- **Theme handling:** Single global `mermaid.initialize({ startOnLoad: true })` at module top level; no theme parameter
- **Error handling:** Example contains NO error handling — `.then` without `.catch`
- **Source-vs-rendered:** Split view (textarea + preview side-by-side, always visible)
- **Cache:** None. Every keystroke re-renders with fixed ID `'graphDiv'`
- **Dependencies:** `mermaid` (version unpinned in example)
- **Note:** Reference code only — not production-hardened

### 6. TipTap community (no canonical extension; `md2docx` is the reference)

**Confidence:** HIGH (TipTap-native negative); MEDIUM (community extension — README-concise)
**Evidence:** `~/.claude/oss-repos/tiptap/` grep (zero native hits; 2 incidental in emoji/demo); [md2docx/tiptap-extension-mermaid](https://github.com/md2docx/tiptap-extension-mermaid); [md2docx/prosemirror-mermaid](https://github.com/md2docx/prosemirror-mermaid)

- **Has Mermaid:** TipTap core: **NO.** Canonical community extension: `md2docx/tiptap-extension-mermaid`
- **Architecture (community):** Extends `@tiptap/extension-code-block-lowlight`, adding per-node `id` attributes for stable rendering, and delegates rendering to `prosemirror-mermaid`, which uses `Decoration.widget` to inject SVGs **after** code blocks and maintains per-node render cache (same family as Outline)
- **Render trigger:** **Debounced — 300ms default** after typing stops, configurable via `debounce` option
- **Theme handling:** Passed through `mermaidConfig`, forwarded to `mermaid.initialize()`. README examples: `{ theme: 'neutral' }`
- **Error handling:** "Errors during rendering are displayed inline (non-blocking)" per README; UI not specified
- **Source-vs-rendered:** No explicit toggle documented; rendering automatic for any code block with `mermaid` language identifier (integrated with `lowlight` + `lowlight-mermaid`)
- **Cache:** Per-node (re-renders only when source changes), managed by `prosemirror-mermaid`
- **Dependencies:** `mermaid`, `@tiptap/extension-code-block-lowlight`, `lowlight`, `lowlight-mermaid`, `prosemirror-mermaid`, `@svg-fns/layout`
- **License:** MPL-2.0

#### 6b. Docmost (TipTap-based, open source — local clone read)

**Confidence:** VERY HIGH (source-read)
**Evidence:** `~/.claude/oss-repos/docmost/apps/client/src/features/editor/components/code-block/mermaid-view.tsx:1-59`

- **Has Mermaid:** Yes, integrated into TipTap-based editor
- **Architecture:** React NodeView (`NodeViewProps` → React component) inside code-block feature
- **Render trigger:** `useEffect` on `[node.textContent, computedColorScheme]` — re-renders immediately on content or theme change
- **Theme handling:** Mantine's `useComputedColorScheme` → `mermaid.initialize({ theme: 'default' | 'dark' })`
- **Error handling:** `suppressErrorRendering: true`. Errors rendered via `DOMPurify.sanitize(err)` inline (only in editable mode); read-only shows generic "Invalid Mermaid diagram" message
- **Source-vs-rendered:** Presumed editable-mode shows source; render-mode wraps rendered SVG in `contentEditable={false}`
- **SVG injection:** `dangerouslySetInnerHTML` + `contentEditable={false}`
- **Cache:** **None** — new UUID per render (`mermaid-${uuidv4()}`)

### 7. Lexical (Meta / Facebook — local clone read)

**Confidence:** HIGH (core negative); LOW (community plugin — README-only)
**Evidence:** `~/.claude/oss-repos/lexical/` grep (5 hits, none mermaid-extension); [facebook/lexical#2302](https://github.com/facebook/lexical/issues/2302); [waka/lexical-mermaid](https://github.com/waka/lexical-mermaid)

- **Has Mermaid:** Lexical core: **NO.** 5 incidental grep hits (docusaurus config, emoji list, key-management doc reference, pnpm-lock)
- **Issue #2302** (opened May 2022, closed without resolution): feature request for Mermaid support
- **Community plugin `waka/lexical-mermaid`:** **INACTIVE** — 0 stars, 0 forks, 3 commits, 0 releases
- **Architecture (community, inferred):** Provides `$createMermaidNode(code)`, `MermaidComponent`, `MermaidEditor`. Extends `DecoratorNode` (Lexical's React-backed node type) or similar — not specified in README
- **Render trigger:** Three insertion paths: `INSERT_MERMAID_COMMAND` from toolbar, Markdown auto-detection via `MermaidMarkdownPlugin`, or programmatic `$createMermaidNode`
- **Theme handling:** `'default'`, `'dark'`, `'forest'`, `'neutral'` via `initMermaid()`
- **Error handling:** Customizable via `MermaidErrorRenderer` type; `MermaidLoadingRenderer` also configurable
- **Source-vs-rendered:** Click-to-edit on the rendered diagram

### 8. ProseMirror plugin patterns in the wild

**Confidence:** VERY HIGH (four implementations source-read)
**Evidence:** Outline (above), `prosemirror-mermaid`, Docmost (above), AFFiNE

Two architectural patterns observed across ProseMirror-based editors:

1. **`Decoration.widget` attached to a code-block node** (Outline; `prosemirror-mermaid`). Source stays in code block's `text*` content; SVG injected as widget decoration (or NodeView sibling) adjacent to source. Theme handling: `mermaid.initialize({theme})` at render time, re-render on theme change
2. **Custom NodeView with `contentEditable={false}` wrapper + `dangerouslySetInnerHTML`** (Docmost variant). Code block owns its rendered output via a React NodeView that re-runs on `node.textContent` change

**AFFiNE (BlockSuite-based) — WORKER + WASM pattern:**
- `~/.claude/oss-repos/affine/packages/frontend/core/src/modules/mermaid/renderer/mermaid.worker.ts:1-63`
- `~/.claude/oss-repos/affine/packages/frontend/core/src/modules/mermaid/renderer/index.ts:1-40`
- Uses `@toeverything/mermaid-wasm` (`initMmdr`, `render_mermaid_svg`) — NOT the official JS `mermaid` package
- Default options: `{ fastText: true, svgOnly: true, theme: 'modern', fontFamily: 'IBM Plex Mono' }`
- Main thread communicates via `WorkerOpRenderer` with shared singleton renderer
- **Only worker-thread WASM-from-SVG pattern observed in the full survey**

### 9. VS Code markdown preview

**Confidence:** VERY HIGH (core negative + chat features source-read); MEDIUM (community extension)
**Evidence:** `~/.claude/oss-repos/vscode/extensions/markdown-language-features/` — zero hits; `~/.claude/oss-repos/vscode/extensions/mermaid-chat-features/` (source-read)

#### 9a. VS Code core built-in
- **Has Mermaid:** **NO** — zero hits in markdown-language-features

#### 9b. `extensions/mermaid-chat-features` (bundled in VS Code repo)
- **Has Mermaid:** Yes, but scoped to **Chat output rendering**, not markdown preview
- **Architecture:** `vscode.chat.registerChatOutputRenderer` + Webview hosting `pre.mermaid` + client-side `mermaid.run`. MIME `text/vnd.mermaid` identifies Mermaid data in chat output; extension also registers a Language Model Tool (`renderMermaidDiagram`)
- **Render trigger:** On webview creation. `mermaid.initialize({ startOnLoad: false, theme })` then `mermaid.run({ nodes: [diagram] })`
- **Theme handling:** `getMermaidTheme()` reads `document.body.classList` for `vscode-dark` or `vscode-high-contrast`; maps to `'dark'`/`'default'`. **`MutationObserver` on `document.body` `class` attribute** triggers `rerenderMermaidDiagram` on theme change (clears `data-processed`, re-initializes, re-runs)
- **Error handling:** Webview doesn't show custom errors; Mermaid's own error output applies. `diagram.classList.add('rendered')` gates visibility (`visibility: hidden → visible`)
- **Source-vs-rendered:** Render-only in chat webview. "Open in Editor" button (via `_mermaid-chat.openInEditor`) takes user to dedicated preview/editor panel. `_mermaid-chat.copySource` copies source
- **Cache:** `vscode.getState()` persists `mermaidSource` and pan/zoom transform per webview; no SVG cache
- **Dependencies:** `mermaid: ^11.12.3`, `dompurify: ^3.3.2`
- **Extras:** Custom `PanZoomHandler` (Alt+click zoom, pinch/ctrl+wheel, `requestAnimationFrame`-centered SVG)

#### 9c. `bierner.markdown-mermaid` (dominant community extension)
- **Installs:** 4.5M+ (marketplace); stars 911
- **Architecture:** Hooks into VS Code markdown preview extensibility and injects Mermaid rendering into preview webview
- **Theme:** Settings `markdown-mermaid.lightModeTheme` / `darkModeTheme`; supports `base | forest | dark | default | neutral`. Note: theming options **not supported in notebooks**
- **Mermaid version bundled:** 11.12.0 (at time of fetch)

### 10. @mermaid-js/mermaid-live-editor (D6 folded in)

**Confidence:** HIGH (from source + DeepWiki summary)
**Evidence:** [mermaid-js/mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor), `src/lib/components/View.svelte`, `src/lib/util/autoSync.ts`

- **Stack:** SvelteKit static site, deployed to [mermaid.live](https://mermaid.live)
- **Architecture:** Svelte component with reactive state subscriptions. `pendingStateChange = pendingStateChange.then(() => handleStateChange(state))` serializes state-change handling to avoid render races
- **Render trigger:** **State-driven, not timer-based.** Conditional `if (!shouldRefreshView()) { return; }` prevents rendering on every state change. Before re-rendering, `if (code === state.code && config === state.mermaid && rough === state.rough)` short-circuits when inputs unchanged

#### Adaptive debounce (authoritative implementation)

From `src/lib/util/autoSync.ts`:

```ts
import debounce from 'lodash-es/debounce';

let shouldSync = true;
const renderDelay = 1000;          // 1 second
const slowRenderThreshold = 150;   // 150ms

const debouncedRender = debounce(() => {
  shouldSync = true;
  updater();
}, renderDelay);

export const recordRenderTime = (renderTimeMs: number, updaterFunction: () => void): void => {
  resolveRenderPromise?.();
  updater = updaterFunction;
  const isSlow = renderTimeMs > slowRenderThreshold;
  if (!shouldSync) {
    debouncedRender();
  }
  shouldSync = !isSlow;
};

export const shouldRefreshView = (): boolean => {
  ...
  if (!shouldSync) {
    debouncedRender();
  }
  return shouldSync;
};
```

**Behavior — render-cost-adaptive:**
- If last render took **< 150ms**: NO debounce — render immediately (`shouldSync = true`)
- If last render took **≥ 150ms**: set `shouldSync = false` and gate further renders behind 1000ms trailing-edge debounce
- `View.svelte` calls `shouldRefreshView()` before every render attempt; early-returns when gated

This is **render-cost-adaptive debouncing**, not a fixed delay. Fast diagrams render every keystroke; heavy diagrams gate to 1 Hz.

- **Theme handling:** `config` (equivalent to `mermaid.initialize` options) is one of the compared keys for re-render decisions
- **Error handling:** On exception, `error = true` set; DOM applies class `'opacity-50'` to dim stale render. `console.error('view fail', error_)` logs
- **Source-vs-rendered:** Split-view editor (left code pane, right render pane)
- **Cache:** No explicit SVG cache; short-circuit comparison serves as "skip re-render"

---

## Summary grid

| Editor | Native? | Pattern | Trigger | Theme | Cache | Mermaid version |
|---|---|---|---|---|---|---|
| Notion | Yes (closed) | Code block mode | User toggle | Unknown | Unknown | Unknown |
| Obsidian | Yes (core) | Code block render | Reading/Preview render | Not auto-synced; CSS workaround | Unknown | Not public |
| Outline | Yes | PM Plugin + `Decoration.widget` | Per-transaction, no timer | `mermaid.initialize({theme, darkMode})`, transaction-meta driven | `sessionStorage` LRU, 20 entries | Dynamic import, latest peer |
| BlockNote | No (core: syntax-highlight only) | Community: custom BlockSpec | N/A | N/A | N/A | N/A |
| MDXEditor | No (example only) | `CodeBlockEditorDescriptor` split view | Immediate on keystroke | Global `startOnLoad: true` | None | Unpinned |
| TipTap community | No (official) | `code-block-lowlight` + `prosemirror-mermaid` widget | **300ms debounce** (configurable) | `mermaid.initialize` via `mermaidConfig` | Per-node source cache | Unpinned |
| Docmost (TipTap-based) | Yes | React NodeView + `dangerouslySetInnerHTML` | `useEffect` on content/theme | Mantine `useComputedColorScheme` → `default`/`dark` | None (new UUID/render) | From package |
| Lexical | No (core) | Community (inactive): DecoratorNode-ish | Command/markdown-autodetect/programmatic | 4 theme presets | Unknown | Unpinned |
| AFFiNE (BlockSuite) | Yes | **Web Worker + WASM (`render_mermaid_svg`)** | `WorkerOpRenderer.call('render')` | `theme: 'modern'` default | Singleton worker | `@toeverything/mermaid-wasm` |
| VS Code core MD preview | **No** | — | — | — | — | — |
| VS Code `mermaid-chat-features` | Yes (chat only) | Webview + `chatOutputRenderer` | On webview create; MutationObserver for theme | `document.body.classList` → `dark`/`default` | Pan/zoom state only | `^11.12.3` |
| `bierner.markdown-mermaid` (community) | Yes (MD preview) | Preview webview injection | On preview render | `lightModeTheme`/`darkModeTheme` settings | Not documented | `11.12.0` |
| mermaid-live-editor | Yes | Svelte component, state subscription | **State-change + adaptive debounce (<150ms=immediate, ≥150ms=1s gate)** | `config` passed to `mermaid` | Short-circuit comparison | Latest mermaid |

---

## Cross-cutting observations (from source)

### Theme plumbing
Near-universal `mermaid.initialize({ theme })` at render time, with theme change detection via:
- Transaction metadata (Outline)
- React hook (Docmost)
- `MutationObserver` on `document.body.class` (VS Code chat webview)
- Config key in compared state (mermaid-live-editor)

**No editor surveyed auto-derives Mermaid theme from CSS custom properties.**

### `Decoration.widget` vs `NodeView` split
Editors integrating at ProseMirror level (Outline, `prosemirror-mermaid`) prefer `Decoration.widget` on existing code block — source stays in `text*` content. Editors integrating at higher abstraction (Docmost React NodeView, BlockNote community plugin's BlockSpec) wrap rendered SVG in `contentEditable={false}` container. **Both patterns preserve source-as-text in document model.**

### Cache strategies
- Per-content (Outline: sessionStorage LRU keyed by `theme-text`)
- Per-node (`prosemirror-mermaid`: in-memory cache)
- None (MDXEditor example, Docmost, mermaid-live-editor — relies on dirty-check short-circuit)
- **No editor surveyed uses a shared in-memory cache across mounts.**

### Error UX patterns
- Inline error text with dedicated class (Outline `parse-error`)
- `DOMPurify.sanitize(err)` (Docmost, read-only shows generic message)
- `opacity-50` on stale render (mermaid-live-editor)
- `suppressErrorRendering: true` passed by both Outline and Docmost

### Source-vs-render UX
- **Tri-state toggle** (Notion Code/Preview/Split)
- **Cursor-based editing mode** (Outline `editingId`)
- **Split-view always-visible** (MDXEditor example, mermaid-live-editor)
- **Click-to-edit** (Lexical community plugin)
- **Reading vs. Source mode** (Obsidian)

### Worker/WASM rendering — minority pattern
Only AFFiNE observed. The official `mermaid` package is NOT WASM-compatible (see D2.2.a); AFFiNE uses a different renderer (`@toeverything/mermaid-wasm`) per their worker pattern.

### Negative findings confirmed by source-read
- BlockNote core (mermaid = syntax-highlight language only)
- Lexical core (zero extensions)
- VS Code core markdown preview (zero hits)
- TipTap core (zero native Mermaid extension)

---

## Negative searches

- **TipTap core** — `grep -i mermaid ~/.claude/oss-repos/tiptap/` → 2 hits, both in unrelated emoji/demo files
- **Lexical core** — 5 incidental hits; none are mermaid extensions
- **VS Code core markdown preview** — zero hits in `extensions/markdown-language-features/`
- **BlockNote core** — single hit in shiki language list; no renderer

---

## Gaps / follow-ups

- **Obsidian mermaid version pin** — not publicly documented; would require decompilation or Obsidian Insider disclosure
- **Notion internal architecture** — closed source; all details third-party
- **AFFiNE `@toeverything/mermaid-wasm` lineage** — what does that WASM module bundle? Relationship to upstream mermaid not investigated
- **mermaid-live-editor View.svelte full render cycle** — only key excerpts read; complete state-machine not mapped
- **`prosemirror-mermaid` SVG cropping** — uses `@svg-fns/layout`; exact algorithm not inspected
