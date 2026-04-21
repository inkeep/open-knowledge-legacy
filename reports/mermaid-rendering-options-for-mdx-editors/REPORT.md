---
title: "Mermaid Rendering Options for MDX Editors — Factual Landscape"
description: "Factual research on Mermaid rendering options for a live MDX editor context. Covers the official `mermaid` package at version 11.14.0 (API, theme, error surface, known issues, version drift), alternative renderers (beautiful-mermaid, Rust WASM forks, server-side via mermaid-cli/mermaid.ink/Kroki), how 10 sibling editors (Notion, Obsidian, Outline, BlockNote, MDXEditor, TipTap community, Lexical, AFFiNE, VS Code, mermaid-live-editor) implement Mermaid in a NodeView-like slot, re-render patterns in React, and bundle-size measurements. No recommendations — evidence-cited facts only."
createdAt: 2026-04-21
updatedAt: 2026-04-21
subjects:
  - Mermaid
  - fumadocs
  - TipTap
  - ProseMirror
  - Outline
  - Obsidian
  - Notion
  - BlockNote
  - MDXEditor
  - Lexical
  - AFFiNE
  - VS Code
  - beautiful-mermaid
  - mermaid-cli
  - mermaid.ink
  - Kroki
topics:
  - mermaid rendering
  - mdx editor
  - nodeview
  - bundle size
  - react rerender
  - promise cache
  - decoration widget
  - client-side diagrams
---

# Mermaid Rendering Options for MDX Editors — Factual Landscape

**Purpose:** Factual landscape on Mermaid rendering options for a live MDX editor context. Reader cares most about: API surface, bundle cost, theme and re-render behavior under live editing, comparative maturity. **No recommendations.** Implications stated as *when it matters*, never *what to do*.

---

## Editor-context framing (facts that shaped which facts to gather)

This report investigates external options without assessing any specific codebase. The constraints that made the facts below relevant — and that the reader may want to evaluate against these facts — are: a Vite + React 19.2 client (no SSR), a live MDX editor where the same chart text can re-render as the user types or toggles modes, and an editor host that mounts/unmounts NodeViews under a bounded pool. Where findings matter differently under these constraints, the report says so in the *Decision triggers* subsections. The reader remains the decision-maker.

---

## Executive Summary

At version **11.14.0** (2026-04-01), **mermaid** is an ESM-only, async-render, 21-runtime-dep package. Its bundle-loading model is aggressive code-splitting: the default ESM entry (`mermaid.core.mjs`) is **11 KB gzipped**, and every diagram type lazy-loads from `dist/chunks/mermaid.core/` as a separate chunk (24-45 KB gzipped each). Under a dynamic `import('mermaid')` pattern with a bundler that respects code-splitting (Vite/Rollup), the cost before first Mermaid insert is ~0 KB; the cost at first insert is **~153 KB gzipped per bundlephobia's entry-graph figure** (local spot-measurements: 11 KB entry + at least 57 KB across two of the five statically-imported eager chunks — full per-chunk table not assembled); each additional unique diagram type adds 15-40 KB. Math labels add ~106 KB if used.

`mermaid` is **not compilable to WASM** per the mermaid-js team. Maintainer in [Issue #3650](https://github.com/mermaid-js/mermaid/issues/3650): *"a browser environment is required to precompute widths/heights."* Maintainer in [Discussion #4789](https://github.com/orgs/mermaid-js/discussions/4789): *"Mermaid not only requires a DOM, but it also requires a layout engine, which currently, only browser engines support."* Mermaid has **no first-party SSR** (issue #3650, open since 2022).

**Alternative renderers exist but cover materially different scope:**
- **`beautiful-mermaid`** (lukilabs / Craft Docs, v1.1.2 Feb 26 2026 release tag; v1.1.3 on `main`; measurements below taken against the v1.1.3 npm tarball) is an **independent reimplementation — NOT a wrapper** around mermaid. Supports **6 diagram types** (flowchart, state, sequence, class, ER, xychart) vs. mermaid's ~20+. Sync API (`renderMermaidSVG(text)` returns SVG string). ~68 KB gzipped without elkjs, 482 KB with. GitHub dependents-graph shows 102 repos (attribution noisy — `react-pdf` entry predates the package); 748K monthly npm downloads (~3% of mermaid's 24.7M).
- **`mermaid-rs-renderer` (mmdr)** is a native Rust reimplementation — crates-only, no npm. Claims 23 types and "100-1400× faster" (self-reported, unverified, AI-assisted project).
- **`selkie`** is a Rust-with-WASM-build reimplementation (20 stars, experimental).
- **Server-side:** `@mermaid-js/mermaid-cli` (official, headless Chrome + Puppeteer), `mermaid.ink` (self-hostable Puppeteer service), `Kroki` (multi-diagram gateway; Mermaid is a separate companion container).

**Ten-plus editor surfaces surveyed** — six local OSS source reads (Outline, BlockNote, MDXEditor, Docmost, AFFiNE, `vscode/extensions/mermaid-chat-features`), two OSS negative searches (TipTap core, Lexical core), and several docs/remote surfaces (Notion, Obsidian, mermaid-live-editor, `bierner.markdown-mermaid`, `md2docx/tiptap-extension-mermaid`, `waka/lexical-mermaid`, `defensestation/blocknote-mermaid`). Among those with native Mermaid:
- **Outline** is the most architecturally detailed OSS implementation: ProseMirror plugin + `Decoration.widget`, `sessionStorage` LRU cache (20 entries) keyed by `theme-text`, per-transaction rendering (no debounce), off-DOM hidden container for `getBBox()`, FontAwesome icon packs + `@mermaid-js/layout-elk` registered, transaction-meta theme switching.
- **Notion** uses a tri-state Code/Preview/Split toggle inside its Code block.
- **Obsidian** has known theme-sync pain points (mermaid does not auto-mirror Obsidian theme; users work around with CSS snippets or community plugins).
- **AFFiNE** is the only editor observed using **Web Worker + WASM** (`@toeverything/mermaid-wasm`), not the JS mermaid package.
- **TipTap core** has **no official mermaid extension**; the community reference is `md2docx/tiptap-extension-mermaid` wrapping `md2docx/prosemirror-mermaid` (300ms fixed debounce, per-node cache).
- **Docmost** (TipTap-based) uses a React NodeView with `dangerouslySetInnerHTML`, DOMPurify-sanitized errors, no cache (new UUID per render).
- **MDXEditor** ships no native Mermaid; an example in its docs shows a `CodeBlockEditorDescriptor` split view with no debounce and no error handling.
- **Lexical core** has no Mermaid; the only community plugin (`waka/lexical-mermaid`) is inactive (0 stars, 3 commits).
- **BlockNote core** has only the Shiki syntax-highlighting language for `mermaid`; diagram rendering comes from a 3P community plugin (`defensestation/blocknote-mermaid`).
- **VS Code core markdown preview has no Mermaid.** `bierner.markdown-mermaid` (4.5M installs) is the dominant community extension, bundling `mermaid@11.12.0`. A separate extension `mermaid-chat-features` (bundled in the VS Code repo) renders Mermaid in **Chat output** — not markdown preview — using a MutationObserver on `document.body.class` for theme change.

**The official `@mermaid-js/mermaid-live-editor`** (SvelteKit, deployed to [mermaid.live](https://mermaid.live)) uses **render-cost-adaptive debouncing**: if the last render took < 150ms, render immediately; if ≥ 150ms, gate behind 1000ms trailing-edge debounce.

**Re-render patterns converge on a small set:**
- Module-level promise cache keyed by `(chart, theme)` (fumadocs reference pattern) — simple, React-19-native via `use(promise)`, but **unbounded growth** and **sticky rejection**.
- Per-node cache inside a ProseMirror plugin (Outline's sessionStorage LRU, `prosemirror-mermaid`'s in-memory cache) — bounded, teardown-friendly.
- Adaptive debounce (mermaid-live-editor) — no cache, relies on dirty-check short-circuit.
- None (MDXEditor example, Docmost) — re-renders per keystroke / content change.
- **No editor surveyed uses a shared in-memory cache across React mounts.** (See D3 cross-cutting observations + D4.2 negative search.)

**Key Findings:**

- **Mermaid 11.14.0 bundle is 11 KB gzipped at the entry, but 458 KB gzipped across 51 chunks** — the effective cost depends entirely on which diagram types get used at runtime. Dynamic-import pattern defers all of this until first render.
- **`beautiful-mermaid` is not a mermaid wrapper** — it reimplements rendering for 6 diagram types with sync API and CSS-variable theming. Consumers trading diagram coverage for simplicity are trading across incompatible packages, not layering on the same engine.
- **No surveyed editor auto-derives Mermaid theme from CSS custom properties.** All surveyed implementations pass `theme: 'default' | 'dark' | ...` to `mermaid.initialize()`; theme change detection varies (transaction meta, React hook, MutationObserver on `body.class`).
- **`mermaid.render()` always produces fresh SVG HTML** — no in-place update path. The `id` argument is load-bearing: `removeExistingElements(document, id, …)` runs globally on `document` at render start. Re-using an id scrubs whatever has that id in the live DOM.
- **A documented orphan-DOM risk exists at default config:** when `suppressErrorRendering: false` (default) and parsing fails, the re-throw runs before `removeTempElements()` cleanup. Matches open issue [#5307](https://github.com/mermaid-js/mermaid/issues/5307).
- **Open, unresolved issues of direct relevance to live-editor use:**
  - [#1945](https://github.com/mermaid-js/mermaid/issues/1945) — theme reinit doesn't apply (5 years open)
  - [#3650](https://github.com/mermaid-js/mermaid/issues/3650) — SSR not supported (open since 2022)
  - [#4346](https://github.com/mermaid-js/mermaid/issues/4346) — multi-diagram `bindFunctions` overwrite each other
  - [#6146](https://github.com/mermaid-js/mermaid/issues/6146) — `calculateDimensionsWithPadding` race under CSS animations (`getBBox()` pre-layout; issue title: *"CSS Animations edge case"*)
  - [#7094](https://github.com/mermaid-js/mermaid/issues/7094) — `@mermaid-js/parser`'s langium deep-imports fail in Webpack/Turbopack (Next.js-affecting; 11.14.0 status UNCERTAIN)

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|---|---|---|---|
| D1 | `mermaid` package facts (API, theme, errors, known issues) at 11.14.0 | P0 | Deep | Covered |
| D2 | Alternative renderers: `beautiful-mermaid`, WASM forks, server-side, non-JS | P0 | Deep | Covered |
| D3 | Sibling editor implementations (10 editors; D6 mermaid-live-editor folded in) | P0 | Deep | Covered |
| D4 | Re-render patterns — caches, debounce, SVG reuse, Suspense | P0 | Deep | Covered |
| D5 | Bundle-size comparison at current versions | P0 | Moderate | Covered |
| D7 | Theme + SSR + use-after-unmount | P1 | Moderate | Covered as part of D1 + D4 |

**Non-goals (respected):** No 1P recommendation; no implementation plan; no 1P codebase analysis; no self-run performance benchmarks; no Mermaid DSL grammar coverage survey; no accessibility dimension; no source-view syntax highlighting.

---

## Detailed Findings

### D1 — `mermaid@11.14.0` — Public API, theme, errors, known issues

**Evidence:** [evidence/d1-mermaid-package.md](evidence/d1-mermaid-package.md)

#### API surface (version-pinned)

| Method | Sync/Async | Throws? | Notes |
|---|---|---|---|
| `initialize(config)` | SYNC | No (silently ignores unknown keys) | Merges into `siteConfig`; resolves themeVariables |
| `render(id, text, container?)` | **ASYNC** | Yes on parse/draw error | Wrapped in serial `executionQueue`; returns `{svg, diagramType, bindFunctions}` |
| `parse(text, {suppressErrors?})` | **ASYNC** | Throws unless `suppressErrors: true` (then returns `false`) | Pure validation — no DOM mutation |
| `run(options?)` | ASYNC | Collects errors; re-throws first unless `suppressErrors` | Stamps `data-processed` attribute for idempotency |
| `registerExternalDiagrams(diagrams, {lazyLoad=true})` | ASYNC | — | Public extension point for diagram types |
| `registerIconPacks(iconLoaders)` | SYNC | — | Public |
| `registerLayoutLoaders(loaders)` | SYNC | — | Public |
| `init()` | ASYNC | — | **Deprecated** — runtime log.warn |
| `mermaidAPI.*` | Mix | — | **Deprecated** |

**Note:** `mermaid.registerDiagrams` (plural) does NOT exist on the public API. `registerExternalDiagrams` is the equivalent.

**All `render()` / `parse()` calls go through a singleton serial `executionQueue`** (`mermaid.core.mjs:1340-1358`). Docstring: *"Multiple calls to this function will be enqueued to run serially."* No cancellation API; rapid text changes enqueue rather than replace.

#### Theme API

- **11 named themes + `'null'` sentinel (12 enum values total) in 11.14.0** (`config.type.d.ts:61`): `'default' | 'base' | 'dark' | 'forest' | 'neutral' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color' | 'null'`. The `neo`/`redux` families are new in 11.14.0. **Public docs only list 5** ([theming.html](https://mermaid.js.org/config/theming.html)).
- `themeVariables` is typed `any` publicly; the runtime Theme class enumerates ~200+ keys.
- `themeCSS` string is prepended raw to generated SVG `<style>` tags. No sanitization.
- **Runtime theme switching** works for subsequent `render()` calls when `initialize()` is re-called first. Already-rendered SVGs do not re-theme (inlined `<style>`). Open issue [#1945](https://github.com/mermaid-js/mermaid/issues/1945) reports failures in live-swap-without-teardown scenarios; unresolved 5 years.

#### Error surface

- Two error classes: `UnknownDiagramError`, `DiagramNotFoundError` (both `extends Error`)
- Interface `DetailedError = { str, hash, error?, message? }` — parser errors surface here
- Runtime `isDetailedError(err)` detects via `"str" in error`
- **`render()` re-throws after attempting error-diagram render**, unless `suppressErrorRendering: true` (added v11.0.0). Oversized text (`maxTextSize` default 50000) is **silently replaced** with a fixed "Max exceeded" flowchart — no throw.

#### Known issues at 11.x (open, maintainer-acknowledged)

- [#5307](https://github.com/mermaid-js/mermaid/issues/5307) — React re-render parses SVG instead of new input (open 2024-02-22). Code-level match: when `suppressErrorRendering: false` and parse fails, re-throw at line 1146-1148 runs before cleanup at 1149, leaving temp DOM.
- [#4346](https://github.com/mermaid-js/mermaid/issues/4346) — multi-diagram `bindFunctions` overwrite each other (open 2023-04-25). 11.14.0 partially addresses duplicate-SVG-ID class but not `bindFunctions` class.
- [#6146](https://github.com/mermaid-js/mermaid/issues/6146) — race condition in dimension calculation (open 2024-12-21). Outline's mermaid view explicitly works around this with a hidden off-DOM container for `getBBox()`.
- [#7094](https://github.com/mermaid-js/mermaid/issues/7094) — `@mermaid-js/parser` langium deep-imports fail in Webpack/Turbopack (open 2025-10-20). 11.14.0 depends on `@mermaid-js/parser@^1.1.0`; whether upstream fix landed at that version UNCERTAIN.
- [#3650](https://github.com/mermaid-js/mermaid/issues/3650) — SSR not supported (open 2022-10-12). Maintainer: *"a browser environment is required to precompute widths/heights."*
- No tracked issue for systematic SPA memory leak.
- No tracked issue for React StrictMode double-invocation (serial queue absorbs it).

#### Version drift (v9 → v10 → v11)

- **v9 → v10 (Feb 2023):** ESM-only (CJS dropped); `render()` became async with new return shape; `init()` deprecated.
- **v10 → v11 (Aug 2024):** Rendering engine refactor + `look` config; ELK moved to separate `@mermaid-js/layout-elk`; `@mermaid-js/parser` + langium introduced (foundation for #7094); `useMaxWidth` default changes; `suppressErrorRendering` added; `mermaidAPI` deprecated; ESBuild IIFE replaces UMD.

**Implications:**
- Live-editor patterns from v9 tutorials (sync `render`, `mermaid.init(classConfig, nodes, callback)`) do not apply at 11.x
- The langium deep-import bundler issue is 11.x-era specific
- `suppressErrorRendering` config option is only available from v11.0.0 — 11.x projects can rely on it; v10 cannot

**Decision triggers (when this matters):**
- If the integration uses Webpack/Turbopack with `@mermaid-js/parser` deep imports → #7094 may block
- If the integration needs live theme swap without component teardown → open issue #1945 territory
- If the integration mounts many Mermaid diagrams on the same page → #4346 `bindFunctions` class applies
- If the integration runs on SSR → no first-party support; jsdom + SVGDOM is a community workaround

**Remaining uncertainty:**
- Whether `@mermaid-js/parser@1.1.0` (11.14.0's pin) resolves the langium deep-import chain documented in #7094 — not verified
- Whether #1945 reproduces at 11.14.0 (issue age spans 8.x era) — not re-tested

---

### D2 — Alternative renderers

**Evidence:** [evidence/d2-alternative-renderers.md](evidence/d2-alternative-renderers.md)

#### beautiful-mermaid (v1.1.2 / 1.1.3)

- **Identity:** Published by Craft Docs team (`lukilabs` org). MIT. 8.8k GitHub stars, 748K npm downloads/month (3% of mermaid's 24.7M)
- **Architecture:** **Independent reimplementation — NOT a mermaid wrapper.** README explicit: *"It's not a fork or wrapper of the official Mermaid package, but rather a reimplementation designed for aesthetic output and performance."* VENDOR-authored claim
- **Scope:** 6 diagram types (flowchart, state, sequence, class, ER, xychart). Missing vs. mermaid: Gantt, pie, mindmap, timeline, C4, sankey, git graph, journey, quadrant, block, packet, treemap, kanban, architecture, requirement, radar
- **API:** `renderMermaidSVG(text, options?)` (sync) + `renderMermaidSVGAsync` + `renderMermaidASCII` + `parseMermaid` + `fromShikiTheme`. Sync API uses "FakeWorker bypass" to run ELK.js synchronously (VENDOR claim; robustness not independently verified)
- **Theme:** CSS custom properties with 15 built-in themes + 2-color foundation deriving the rest via `color-mix()`. Shiki VS Code theme compatibility
- **Dependencies:** `elkjs@^0.11.0` + `entities@^7.0.1`. No mermaid dependency. No peer deps
- **Bundle:** 68 KB gzipped (dist/index.js) without elkjs, 482 KB gzipped with elkjs (bundlephobia aggregate)
- **Error handling:** NOT documented in README. NOT derived from source in this research pass
- **Implication:** Beautiful-mermaid and mermaid are NOT substitutable 1:1 — they are different packages with overlapping scope. Consumers using `beautiful-mermaid` get 6-type coverage; switching to `mermaid` later loses the sync API and theme-via-CSS-variables feature

#### WASM / Rust forks

- **No official WASM port of mermaid.** Per maintainer (Discussion #4789): *"Mermaid not only requires a DOM, but it also requires a layout engine, which currently, only browser engines support."*
- **`selkie`** (btucker/selkie, 20 stars): Rust reimpl with WASM build via `wasm-pack`. Experimental (*"built entirely with coding agents"*). Not on npm
- **`mermaid-rs-renderer`** aka `mmdr` (1jehuang, 1.2k stars): native Rust to SVG + PNG via `resvg`. Claims 23 types, *"100-1400× faster than mermaid-cli"* (self-reported, unverified). Crates / Homebrew / Scoop / AUR. No npm. No WASM build
- **`oovm/mermaid-wasm`** (3 stars): Yew wrapper that binds to mermaid.js from Rust — not a WASM port. Abandoned
- **`mermaid-wasmbind` (lib.rs):** Mislabeled KaTeX crate. Not usable for mermaid

#### Server-side rendering

- **`@mermaid-js/mermaid-cli`** (official, 4.4k stars, v11.12.0 Sep 2025): headless Chromium via Puppeteer. Puppeteer is peer dep (`^23`) — must be installed manually. Linux sandbox / Docker permission issues documented. Node-only. Outputs SVG/PNG/PDF
- **`mermaid.ink`** (235 stars, v15.0.0 Dec 2025): Node+Puppeteer service. Hosted at mermaid.ink. Self-hostable via `ghcr.io/jihchi/mermaid.ink`. API: `/img/<encoded>`, `/svg/<encoded>`, `/pdf/<encoded>`. **No documented rate limits or privacy policy.** Consumers sending proprietary diagrams to hosted service have no stated retention guarantee
- **Kroki** (yuzutech/kroki, 4.1k stars, v0.30.1 Mar 2026): multi-diagram gateway (25+ languages). **Mermaid NOT bundled** in core — requires `yuzutech/kroki-mermaid` companion container. Self-hostable via Docker Compose. Free hosted service; no documented rate limits. First-class GitLab integration

**Decision triggers:**
- If write-once / build-time rendering is acceptable → server-side paths are in play
- If sensitive diagram content → self-host mermaid.ink or Kroki
- If the integration is browser-only live-editing → server-side is orthogonal (doesn't solve the re-render problem)

**Remaining uncertainty:**
- Fidelity attestations for `selkie` and `mermaid-rs-renderer` diagram coverage (both self-reported)
- Mermaid version pinned inside `mermaid.ink` and `kroki-mermaid` containers

---

### D3 — Sibling editor implementations (10 editors + mermaid-live-editor folded in)

**Evidence:** [evidence/d3-sibling-editors.md](evidence/d3-sibling-editors.md)

#### Summary grid

| Editor | Native? | Pattern | Render trigger | Theme | Cache | Mermaid version |
|---|---|---|---|---|---|---|
| Notion | Yes (closed) | Code-block mode | User toggle (Code/Preview/Split) | Unknown | Unknown | Unknown |
| Obsidian | Yes (core) | Code-block render | Reading/Preview render | **Not auto-synced** (CSS workaround) | Unknown | Not public |
| Outline | Yes | PM Plugin + `Decoration.widget` | Per-transaction (**no timer**) | `initialize({theme, darkMode})`, transaction-meta driven | **`sessionStorage` LRU, 20 entries** | Dynamic import, latest peer |
| BlockNote | **No** (core: syntax-highlight only) | Community: custom BlockSpec | N/A | N/A | N/A | N/A |
| MDXEditor | **No** (example only) | `CodeBlockEditorDescriptor` split view | Immediate on keystroke | Global `startOnLoad: true` | None | Unpinned |
| TipTap community | **No** (official) | `code-block-lowlight` + `prosemirror-mermaid` widget | **300ms debounce** | via `mermaidConfig` | Per-node source cache | Unpinned |
| Docmost (TipTap-based) | Yes | React NodeView + `dangerouslySetInnerHTML` | `useEffect` on content/theme | Mantine `useComputedColorScheme` → `default`/`dark` | None (new UUID/render) | From package |
| Lexical | **No** (core) | Community (inactive): DecoratorNode-ish | Command/autodetect/programmatic | 4 presets | Unknown | Unpinned |
| AFFiNE (BlockSuite) | Yes | **Web Worker + WASM** (`render_mermaid_svg`) | `WorkerOpRenderer.call('render')` | `theme: 'modern'` default | Singleton worker | `@toeverything/mermaid-wasm` |
| VS Code core MD preview | **No** | — | — | — | — | — |
| VS Code `mermaid-chat-features` | Yes (chat only) | Webview + `chatOutputRenderer` | On webview create; **MutationObserver** for theme | `document.body.classList` → `dark`/`default` | Pan/zoom state only | `^11.12.3` |
| `bierner.markdown-mermaid` | Yes (MD preview) | Preview webview injection | On preview render | `lightModeTheme`/`darkModeTheme` settings | Not documented | `11.12.0` |
| mermaid-live-editor | Yes | Svelte, state subscription | **Adaptive debounce** (<150ms immediate, ≥150ms 1s gate) | `config` passed to mermaid | Short-circuit comparison | Latest mermaid |

#### Cross-cutting observations

**Decoration-widget vs NodeView split** (two architectural patterns):
1. **ProseMirror-level `Decoration.widget`** (Outline, `prosemirror-mermaid`, TipTap community) — source stays in code block's `text*` content; SVG injected as widget decoration adjacent to source
2. **Custom NodeView with `contentEditable={false}`** (Docmost) — code block owns rendered output via React NodeView that re-runs on `node.textContent` change

Both preserve source-as-text in the document model.

**Cache strategies observed:**
- Per-content LRU (Outline: sessionStorage, 20 entries, keyed by `${theme}-${text}`)
- Per-node in-memory cache (`prosemirror-mermaid`)
- None, relying on short-circuit (mermaid-live-editor, Docmost, MDXEditor example)
- No editor uses a shared in-memory cache across React mounts

**Theme change detection:** transaction metadata (Outline), React hook (Docmost), MutationObserver on `document.body.class` (VS Code chat), config key in compared state (mermaid-live-editor). **Zero editors auto-derive from CSS custom properties.**

**Error handling:** `suppressErrorRendering: true` passed by both Outline and Docmost. Inline error text with class (Outline). `DOMPurify.sanitize(err)` (Docmost). `opacity-50` dim (mermaid-live-editor).

**Source-vs-render UX:** tri-state toggle (Notion), cursor-based edit mode (Outline), split-view always-visible (MDXEditor, mermaid-live-editor), click-to-edit (Lexical community).

**Worker/WASM rendering:** minority pattern; only AFFiNE observed. Their WASM renderer is not the official mermaid package — it's a separately-maintained `@toeverything/mermaid-wasm`.

**Negative findings confirmed by source read:**
- BlockNote core: mermaid = syntax-highlight language only; no renderer
- Lexical core: zero extensions; community plugin inactive (0 stars, 0 forks)
- VS Code core markdown preview: zero hits
- TipTap core: zero native Mermaid extension

**Decision triggers:**
- If live typing with fast diagrams matters more than consistency under heavy diagrams → render-cost-adaptive debounce (mermaid-live-editor's pattern)
- If many NodeViews mount/unmount under a pool → per-node bounded cache beats module-level unbounded
- If theme is reactive to app-level state → a plugin-level state-channel (Outline's transaction-meta approach) or MutationObserver (VS Code) lets the plugin see every theme change; a React hook (Docmost) only sees what enters component state

---

### D4 — Re-render patterns

**Evidence:** [evidence/d4-rerender-patterns.md](evidence/d4-rerender-patterns.md)

#### Module-level promise cache (fumadocs reference)

55-line component ([`fumadocs/apps/docs/components/mdx/mermaid.tsx`](https://github.com/fuma-nama/fumadocs/blob/dev/apps/docs/components/mdx/mermaid.tsx)) captures the canonical pattern:

```tsx
const cache = new Map<string, Promise<unknown>>();
function cachePromise<T>(key, setPromise) { /* memoize by key */ }

// Usage
const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));
const { svg, bindFunctions } = use(
  cachePromise(`${chart}-${resolvedTheme}`, () =>
    mermaid.render(id, chart.replaceAll('\\n', '\n'))
  )
);
```

- Two cache keys: one for the mermaid module dynamic import (shared across all diagrams on the page), one per `(chart, theme)` pair for the rendered SVG promise
- React 19-native via `use(promise)` — suspends subtree until both resolve

**Known cons (from source-reading the cache behavior):**
- **Unbounded growth.** A live-editor surface where each keystroke produces a different chart string leaks resolved Promises (each holding SVG, typically 4-50 KB) until full page reload
- **Sticky rejection.** If `mermaid.render()` rejects, rejected Promise stays cached — `use(rejectedPromise)` throws on every subsequent render. No built-in invalidation
- **Theme variants accumulate.** Flipping theme mid-session keeps old-theme entry resident

#### Component-level `useMemo` / hash-based caching

- `react-mermaid2` (v0.1.4): uses the **legacy `mermaid.contentLoaded()` DOM-scan pattern**; no `useMemo`, no hash cache. `chart` changes do not trigger re-render
- `@lightenna/react-mermaid-diagram` (v1.0.22): `useEffect` on `[chart, props]` → `mermaid.render(...)` → state; no memoization. Every re-render on changed props invokes render

**Note:** `useMemo` cannot hold a pending promise across renders in a way React can suspend on. Must pair with `useState`/`useEffect` — which creates the flash fumadocs avoids. `beautiful-mermaid`'s README annotates this as a beautiful-mermaid-specific win because it renders synchronously; the same claim does not apply to mermaid itself.

#### Debouncing / throttling

- **mermaid-live-editor (`src/lib/util/autoSync.ts`) — render-cost-adaptive:**
  ```ts
  const renderDelay = 1000;
  const slowRenderThreshold = 150;
  // If last render took <150ms: no debounce (shouldSync = true)
  // If ≥150ms: gate further renders behind 1000ms trailing-edge debounce
  ```
  `View.svelte` calls `shouldRefreshView()` before every render and early-returns when gated. Additionally memoizes on `(code, config, rough, panZoom)` tuple before invoking render.
- **`md2docx/tiptap-extension-mermaid`:** 300ms fixed trailing-edge debounce (configurable)
- **Outline, Docmost, MDXEditor example:** no debounce; rely on short-circuits or keystroke-by-keystroke render

Build-time alternatives that avoid the debounce question entirely: `rehype-mermaid@3.0.0` / `remark-mermaidjs@7.0.0` both use `mermaid-isomorphic` + Playwright headless browser to embed SVG into HAST/MDAST at build time. Client ships zero mermaid JS.

#### SVG DOM reuse vs re-creation

- `mermaid.render()` always produces fresh SVG HTML. **No in-place update path.**
- Internal mechanism: appends `<div id="d${id}"><svg id="${id}">` to either caller's `svgContainingElement` or `document.body`, runs d3 layout on real DOM (needed for `getBBox()`), serializes `div.innerHTML`, then removes appended DOM.
- **Side effect:** `removeExistingElements(document, id, …)` at render start runs **globally on `document`**. Re-using an `id` scrubs whatever has that id in the live DOM.
- Injection patterns observed: `dangerouslySetInnerHTML` (fumadocs), `ref.innerHTML` (`@lightenna`). `<svg>` JSX from DOMParser: NOT observed.

#### React 19 Suspense / Activity integration

- fumadocs uses two `use(promise)` calls (one for dynamic import, one for render) — consumers must wrap in `<Suspense>` and an error boundary
- **No first-party reports on React 19 `<Activity>` + mermaid interaction**. General Activity behavior (hidden subtree DOM detached, Fiber tree + state preserved) intersects with: module-level promise cache survives Activity transitions; `bindFunctions` behavior on Activity-hidden DOM has no documented behavior.

**Decision triggers:**
- **Long sessions with many unique chart strings** — module-level unbounded cache is a specific liability. Bounded per-node cache (Outline's sessionStorage LRU) or no cache + adaptive debounce (mermaid-live-editor) are the alternatives
- **Rejected promises need recovery** — fumadocs pattern has no invalidation; consumers need to design one imperatively if this matters
- **Content-continuity across route changes** — module-level cache survives; per-component `useMemo` does not

---

### D5 — Bundle-size comparison

**Evidence:** [evidence/d5-bundle-sizes.md](evidence/d5-bundle-sizes.md)

#### `mermaid@11.14.0` — measured locally

| File | Raw | Gzipped |
|---|---|---|
| `mermaid.core.mjs` (entry) | 45,712 B | **11,074 B** |
| `mermaid.esm.mjs` | 57,507 B | 14,189 B |
| `mermaid.esm.min.mjs` | 27,199 B | 10,198 B |
| `mermaid.min.js` (UMD) | 3,164,970 B | 870,292 B |
| Install dir (`node_modules/mermaid/`) | — | 74 MB (with sourcemaps) |

Chunks pools (ESM code-split):

| Pool | Files | Raw | Gzipped |
|---|---|---|---|
| `chunks/mermaid.core/` | 51 | 2.28 MB | **458 KB** |
| `chunks/mermaid.esm/` | 81 | 6.21 MB | 1.21 MB |

**Bundlephobia** gives 153 KB gzipped for `mermaid@11.14.0` — this represents the entry graph reachable from `import mermaid from 'mermaid'` at a bundler root, before any `render()` call fires the async diagram-type loaders. The full 458 KB (core) lands only when the detector's `loader()` callbacks fire.

#### Transitive deps (21 runtime deps)

Direct deps consumed by specific diagram families:

| Dep | Diagram types | Installed size |
|---|---|---|
| `cytoscape@^3.33.1` + 2 plugins | architecture, mindmap | 5.9 MB |
| `d3@^7.9.0` + sankey plugin | all diagrams (core layout) | 868 KB |
| `dagre-d3-es@7.0.14` | flowchart, state, class | 648 KB |
| `@mermaid-js/parser@^1.1.0` (incl. langium) | newer diagram types | 7.3 MB |
| `katex@^0.16.25` | any diagram with `$$…$$` | 4.4 MB |
| `dayjs@^1.11.19` | gantt | 1.9 MB |
| `roughjs` `dompurify` `marked` `stylis` `khroma` `@iconify/utils` `@braintree/sanitize-url` | various | ≤ 4 MB combined |

#### Tree-shaking reality

`package.json#exports`:
```json
"exports": {
  ".": { "types": "./dist/mermaid.d.ts", "import": "./dist/mermaid.core.mjs" },
  "./*": "./*"
}
```

- Only declared entry: `.` → `mermaid.core.mjs`
- `./*` fallback enables deep-path imports, but chunks are **build-hash-suffixed** — unstable as public API
- **No `mermaid/flowchart` or lite-build subpath export.** The closest is loading `mermaid.core.mjs` (small entry) and relying on bundler code-splitting to defer diagram chunks until first render.

#### `beautiful-mermaid` — measured locally

| Measurement | Value | Method |
|---|---|---|
| `dist/index.js` | 335,537 B / **68,629 B gzipped** | local `gzip -c` |
| Tarball unpacked | 2,098,676 B | npm registry |
| bundlephobia (with elkjs) | 1,619,941 B min / **482,271 B gzipped** | API |

Dist doesn't bundle elkjs (lazy-imported); bundlephobia aggregates including elkjs (1.47 MB unpacked).

#### Dynamic-import gating — first-insert cost math

Under a fumadocs-style `use(cachePromise('mermaid', () => import('mermaid')))` + Vite default code-splitting:

| Phase | Cost |
|---|---|
| Page load, zero Mermaid blocks | ~0 KB (chunk on CDN, not fetched) |
| First Mermaid encounter | ~100-150 KB gzipped (entry + 5 eager chunks; matches bundlephobia 153 KB) |
| Each new diagram type | +15-40 KB gzipped |
| Math labels | +~106 KB gzipped (katex) |

Vite docs confirm: *"Matched files are by default lazy-loaded via dynamic import and will be split into separate chunks during build."*

#### Activity / usage signals (npm downloads/month)

- `mermaid`: 24,722,045
- `beautiful-mermaid`: 748,069 (~3% of mermaid)
- `react-mermaid2`: ~9,923
- `@lightenna/react-mermaid-diagram`: ~15,000

**Decision triggers:**
- **Cold-start latency matters** — dynamic-import pattern achieves ~0 KB before first Mermaid insert
- **First-insert latency matters** — mermaid's first-insert is 100-150 KB gzipped (the entry graph), plus per-diagram-type on-demand. `beautiful-mermaid` is 68-482 KB depending on whether elkjs is bundled inline or lazy
- **Total bundle volume matters less than per-diagram loading** — mermaid's cost scales with diagram-type diversity, not with how many instances

**Remaining uncertainty:**
- Packagephobia figure for mermaid@11.14.0 (blocked by bot-challenge)
- Exact gzipped sizes for all 51 `mermaid.core` chunks (representative figures captured; full per-chunk table not assembled)

---

## Limitations & Open Questions

### Items the brief asked about but not fully resolved

- **Weekly npm downloads for `@mermaid-js/mermaid-cli`, `mermaid.ink`, `Kroki`** — npm registry WebFetch returned HTTP 403 during research; only `mermaid` and `beautiful-mermaid` download figures captured
- **Fidelity attestation for `selkie` and `mermaid-rs-renderer`** — both self-report wide diagram-type coverage, no independent benchmarks located
- **Install footprint of `@mermaid-js/mermaid-cli` with Puppeteer v23** — historically ~170 MB with bundled Chromium; v23-specific figure not verified
- **Error-handling semantics of `beautiful-mermaid.renderMermaidSVG`** — not in README, not derived from source
- **Mermaid version pinned inside `mermaid.ink` / `kroki-mermaid`** — pinned by release-tag `package.json` / Dockerfile; not captured
- **Exact state of open issue #1945 at 11.14.0** — reproducer age spans 8.x era; not re-tested against 11.14.0
- **Whether `@mermaid-js/parser@1.1.0` (11.14.0's pin) resolves issue #7094's langium deep-import chain** — not verified
- **`bierner.markdown-mermaid` source** — only marketplace listing inspected; implementation specifics not source-read in this pass

### Out of scope (per rubric non-goals)

- 1P codebase analysis beyond the intro framing paragraph
- Self-run performance benchmarks
- Mermaid DSL grammar / diagram-type DSL features
- Accessibility of Mermaid SVG output (ARIA, alt-text)
- Raw-mermaid-source syntax highlighting in the editor's source view
- Any 1P recommendation between options

---

## References

### Evidence files

- [evidence/d1-mermaid-package.md](evidence/d1-mermaid-package.md) — `mermaid@11.14.0` public API, theme, error surface, known issues, version drift, SSR posture
- [evidence/d2-alternative-renderers.md](evidence/d2-alternative-renderers.md) — beautiful-mermaid, WASM forks, server-side renderers, non-JS community
- [evidence/d3-sibling-editors.md](evidence/d3-sibling-editors.md) — 10-editor survey (Notion, Obsidian, Outline, BlockNote, MDXEditor, TipTap, Lexical, AFFiNE, VS Code, mermaid-live-editor)
- [evidence/d4-rerender-patterns.md](evidence/d4-rerender-patterns.md) — module cache, useMemo, debounce, SVG reuse, Suspense
- [evidence/d5-bundle-sizes.md](evidence/d5-bundle-sizes.md) — measured bundle sizes, transitive deps, tree-shaking, dynamic-import gating math

### Related Research

- [`specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`](../../specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md) — Spec-side companion capturing the PR #165 shipped-state audit (MermaidPlaceholder / AudioPlaceholder stubs vs. SPEC D3-LOCKED's shadcn-wrapper plan) and the un-deferral decision framework that consumes this report.

### Primary sources — mermaid

- Local install: `node_modules/mermaid/` at v11.14.0 (package.json, dist/mermaid.d.ts, dist/mermaid.core.mjs, dist/chunks/mermaid.core/*, dist/mermaidAPI.d.ts, dist/types.d.ts, dist/config.type.d.ts)
- [mermaid.js.org — usage docs](https://mermaid.js.org/config/usage.html)
- [mermaid.js.org — theming docs](https://mermaid.js.org/config/theming.html)
- [mermaid-js/mermaid GitHub releases](https://github.com/mermaid-js/mermaid/releases) — v10.0.0, v11.0.0, 11.14.0 release notes

### Primary sources — alternative renderers

- [lukilabs/beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) — README, package.json, LICENSE
- [npm: beautiful-mermaid](https://www.npmjs.com/package/beautiful-mermaid)
- [mermaid-js Discussion #4789 — WASM not feasible](https://github.com/orgs/mermaid-js/discussions/4789)
- [btucker/selkie](https://github.com/btucker/selkie)
- [1jehuang/mermaid-rs-renderer](https://github.com/1jehuang/mermaid-rs-renderer)
- [crates.io: mermaid-rs-renderer](https://crates.io/crates/mermaid-rs-renderer)
- [mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli)
- [jihchi/mermaid.ink](https://github.com/jihchi/mermaid.ink)
- [mermaid.ink landing](https://mermaid.ink/)
- [yuzutech/kroki](https://github.com/yuzutech/kroki)
- [Kroki landing](https://kroki.io/)

### Primary sources — sibling editors

Local OSS clones (read directly):
- `~/.claude/oss-repos/outline/shared/editor/extensions/Mermaid.ts` + `nodes/CodeFence.ts`
- `~/.claude/oss-repos/blocknote/packages/code-block/src/index.ts`
- `~/.claude/oss-repos/mdx-editor/src/examples/mermaid.tsx`
- `~/.claude/oss-repos/docmost/apps/client/src/features/editor/components/code-block/mermaid-view.tsx`
- `~/.claude/oss-repos/affine/packages/frontend/core/src/modules/mermaid/renderer/`
- `~/.claude/oss-repos/vscode/extensions/mermaid-chat-features/`
- `~/.claude/oss-repos/vscode/extensions/markdown-language-features/` (negative hit)
- `~/.claude/oss-repos/tiptap/` (negative hit)
- `~/.claude/oss-repos/lexical/` (negative hit)

Remote:
- [mermaid-js/mermaid-live-editor](https://github.com/mermaid-js/mermaid-live-editor) — View.svelte, autoSync.ts
- [md2docx/tiptap-extension-mermaid](https://github.com/md2docx/tiptap-extension-mermaid)
- [md2docx/prosemirror-mermaid](https://github.com/md2docx/prosemirror-mermaid)
- [waka/lexical-mermaid](https://github.com/waka/lexical-mermaid)
- [facebook/lexical#2302](https://github.com/facebook/lexical/issues/2302)
- [bierner.markdown-mermaid Marketplace](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)
- [Notion Help: Code blocks](https://www.notion.com/help/code-blocks)
- [Obsidian Forum: Mermaid plugin](https://forum.obsidian.md/t/mermaid-plugin/97782)
- [Obsidian Forum: Mermaid theme sync](https://forum.obsidian.md/t/mermaid-theme-needs-to-mirror-obsidian-theme-redux/72819)

### Primary sources — patterns + bundles

- [fumadocs: apps/docs/components/mdx/mermaid.tsx](https://github.com/fuma-nama/fumadocs/blob/dev/apps/docs/components/mdx/mermaid.tsx)
- [fumadocs docs: Mermaid page](https://www.fumadocs.dev/docs/markdown/mermaid)
- [bundlephobia: mermaid@11.14.0](https://bundlephobia.com/package/mermaid@11.14.0)
- [bundlephobia: beautiful-mermaid](https://bundlephobia.com/package/beautiful-mermaid)
- [Vite: Dynamic Import](https://vite.dev/guide/features.html)

### Issues of direct relevance (all state as of 2026-04-21)

- [#1945](https://github.com/mermaid-js/mermaid/issues/1945) — theme reinit (open, 5 years)
- [#3650](https://github.com/mermaid-js/mermaid/issues/3650) — SSR support (open, 2022)
- [#4346](https://github.com/mermaid-js/mermaid/issues/4346) — multi-diagram `bindFunctions` overwrite (open)
- [#5307](https://github.com/mermaid-js/mermaid/issues/5307) — React re-render parses wrong thing (open, 2024)
- [#6146](https://github.com/mermaid-js/mermaid/issues/6146) — dimension-calc race (open, 2024)
- [#6370](https://github.com/mermaid-js/mermaid/issues/6370) — `parse()` returns false in Node (open, 2025)
- [#7094](https://github.com/mermaid-js/mermaid/issues/7094) — langium deep-import bundler (open, 2025)
