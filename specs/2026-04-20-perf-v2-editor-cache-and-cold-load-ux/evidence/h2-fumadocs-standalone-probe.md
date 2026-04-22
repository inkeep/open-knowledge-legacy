# Fumadocs standalone-render feasibility — V2 perf Option E

**Date:** 2026-04-20
**Probe location:** `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/`
**Screenshots:** `/tmp/ok-perf-validation/fumadocs-static-fallback/screenshots/`
**Worktree:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/playwright-stability`

---

## Executive summary

**Verdict: FEASIBLE for all 7 components.** Rendering `Tabs`, `Accordion`, `Callout`, `Steps`, `Card`, `Files`, `Folder` in a standalone React tree — no ProseMirror, no TipTap, no `bridgeIdPlugin`, no `ContextBridgeProvider` — works out of the box and is visually identical to the in-editor rendering the `/specs/2026-04-14-component-blocks-v2/` spec targets. The Context Bridge Registry (spec §9.15) exists *only* to work around TipTap's React-portal isolation; outside the editor, React Contexts propagate naturally through the tree and the whole problem class disappears.

**Recommended shape for Option E: full-fidelity fumadocs fallback fed by a custom mdast→React walker.** The walker is ~200 LoC net-new code (template at `probe/src/MdToReact2.tsx`); the other pieces (unified, remark, `mdast-util-mdx`, fumadocs-ui, Radix primitives) are either already in the tree (core's markdown pipeline) or added once for the component-blocks-v2 editor work. Net bundle cost: **+21 KB gzip** for the 7 components on top of React baseline. CSS: the spec's existing §9.7a ~80 LoC bridge suffices; one 8-line cosmetic tweak to `.fd-step::before` positioning fixes a vertical-align regression vs the upstream preset.

**Open question that gates the decision, not the feasibility:** Option E assumes content is rendered from the *same markdown* the editor will mount. For a CRDT editor, the fallback content is a snapshot — the Hocuspocus sync event may deliver different bytes than the snapshot the fallback renders from. SPEC §G2 "content continuity" handles this at the Activity-pool level; the fallback is a second instance of the same invariant. Resolvable inside Option E; not a blocker on the static render.

---

## Per-component analysis

All 7 components were read at their published source (`node_modules/fumadocs-ui@16.1.0/dist/components/*.js`). The Context Bridge Registry spec's risk matrix (§9.15.5) is what drives this table's "editor portal dependency" column — outside the editor, every entry in that column becomes **0**.

| Component | File | Context deps (inside editor) | Editor-specific deps | Standalone feasibility | Notes |
|---|---|---|---|---|---|
| **Callout** | `callout.js` | None | None | **FEASIBLE** (trivial) | Pure CSS + inline styles + icon components. Uses `--callout-color` custom property set via inline `style`. Zero `useContext`, zero `createContext`. `resolveAlias('tip'→'info', 'warn'→'warning')` at runtime only. |
| **Tabs** (root) | `tabs.js` + `tabs.unstyled.js` | 3 contexts: `TabsContext` (styled) + `TabsContext` (unstyled `valueToIdMap`) + Radix `@radix-ui/react-tabs` `TabsProvider` | None | **FEASIBLE** | Contexts propagate naturally in a non-portal tree. `useLayoutEffect` reads `window.location.hash` for deep-link scroll — benign in a standalone page, runs once. `useEffectEvent` requires React 19 (already required). `localStorage`/`sessionStorage` persistence of selection via optional `groupId` — works in any browser page. |
| **Tab** (child) | `tabs.js` | Reads `useTabContext()` (throws without `<Tabs>`) | None | **FEASIBLE** | `useCollectionIndex` pushes to a mutable collection array **during render** (fumadocs line 56). React 19 + Compiler flag this as a render-purity violation, but it works at runtime. Upstream concern, not ours. Same behavior inside-editor and outside. |
| **Accordions** (root) | `accordion.js` | Radix `AccordionPrimitive.Root` — provides `AccordionValueContext` + `AccordionCollapsibleContext` + `AccordionImplContext` + `CollectionContext` (4 contexts per spec §9.15.5) | None | **FEASIBLE** | `useEffect` reads `window.location.hash` to auto-open anchored item. Benign. Radix Collection's keyboard-nav `querySelectorAll` + `compareDocumentPosition` works in a normal React tree because all `AccordionItem`s are DOM descendants of `AccordionRoot`. |
| **Accordion** (item) | `accordion.js` | Radix `AccordionPrimitive.Item` — consumes parent Root contexts + provides 2 per-item contexts | None | **FEASIBLE** | CopyButton uses `navigator.clipboard` + `useCopyButton` (2s timeout). Works in any browser. |
| **Steps / Step** | `steps.js` | None (7 lines of code) | None | **FEASIBLE** (trivial) | Two `<div>`s with `fd-steps` / `fd-step` classes. Counter + numbering is pure CSS (`counter-reset`, `::before { content: counter(step) }`). Requires the CSS bridge's Steps utility classes (spec §9.7a) to be present. |
| **Card / Cards** | `card.js` | None | None | **FEASIBLE** | `Cards` is `<div class="grid grid-cols-2 gap-3 @container">`. `Card` uses `Link` from `fumadocs-core/link` when `href` prop is set — `Link` falls back to a plain `<a target="_blank">` for external URLs and a next/link-compatible `<a>` otherwise. In a non-Next environment, fumadocs-core `Link` renders a plain `<a>` fine (verified in probe). |
| **Files / Folder / File** | `files.js` + `ui/collapsible.js` | Each `Folder` is **self-contained** — `useState` + Radix `@radix-ui/react-collapsible` instance per folder. No cross-folder context. Per spec §9.15.5: "0 — each Folder is self-contained" | None | **FEASIBLE** | Icons from `lucide-react` (bundled in fumadocs-ui `icons.js`). `File`/`Folder` click state is per-instance. |

**Overall confirmation:** the spec's §9.15.5 risk table says the Context Bridge is needed *only* because TipTap portals each NodeView as a React-tree sibling (not descendant), which decouples the parent `<Tabs>` from its child `<Tab>` NodeViews. Outside the editor, the parent-child tree IS the React tree — `useContext` walks up naturally, and the entire bridge becomes unnecessary. **Zero components require any editor-specific infrastructure to render.**

---

## Empirical probe

### Setup

- **Location:** `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/`
- **Stack:** Vite 6.4 + React 19.2 + fumadocs-ui 16.1.0 + Tailwind 4.2 (matches worktree's versions via `bun.lock`).
- **CSS:** minimal §9.7a bridge (~110 LoC in `probe/src/index.css`) for the primary variant; `fumadocs-ui/css/neutral.css` + `preset.css` for the comparison variant (`probe/src/index-full-css.css`).
- **Composition tested:** all 7 components rendered side-by-side, including a nested `Callout → Tabs → Steps` composition to catch cross-component context issues.
- **Probe files:**
  - `probe/src/App.tsx` — hand-authored JSX composition (72 LoC).
  - `probe/src/MdToReact2.tsx` — markdown→React walker (~200 LoC).
  - `probe/src/MdApp.tsx` — same composition, sourced from a markdown string.
  - `probe/screenshot.mjs` — Playwright interactivity + structural assertions.
  - `probe/screenshot-md.mjs` — same for markdown-sourced render.

### Results (probe)

**Zero page errors** across all four variants (minimal CSS, full CSS, hand-JSX, markdown-sourced). Console logs consist of exactly: (1) Vite HMR connect, (2) React DevTools banner. No warnings, no unhandled rejections.

**Interactivity (hand-JSX variant, `probe/screenshot.mjs` output):**

```json
{
  "tabs": {
    "initial_ts_tab_visible": true,
    "after_js_click": { "js_visible": true, "ts_visible": false },
    "after_py_click": { "py_visible": true }
  },
  "accordion": {
    "initial": "closed",
    "after_click": "open",
    "content_visible": true
  },
  "folders": {
    "initial_state": "closed",
    "after_click": "open",
    "nested_file_visible": true
  }
}
```

Tab-switching hides inactive panels (verified: `ts_visible: false` after clicking JS). Accordion collapse/expand animation works (`data-state="open"` → `animate-fd-accordion-down` applies). Folder toggle in the Files component reveals nested children.

**Structural counts (after interactions):** 7 callouts, 5 tab panels + 5 tab buttons, 10 accordion triggers, 2 Steps containers + 5 Steps, 2 Cards. All assertions pass.

### Screenshots

1. **`screenshots/01-initial.png`** — initial full-page render with the minimal §9.7a CSS bridge. All 7 components visually coherent: colored callout stripes + icons, proper tab border, accordion borders + dividers, Steps numbering, Cards grid, Files tree. One cosmetic issue: Steps counter circle vertically clips the first character of each step heading (see §"CSS integration findings").
2. **`screenshots/02-after-interactions.png`** — same page after clicking the Python tab, expanding the first accordion, and opening the `components/` folder. Interactive state preserved in DOM.
3. **`screenshots/03-full-css-initial.png`** — same composition with `fumadocs-ui/css/neutral.css` + `preset.css` imported instead of the bridge. Pixel-perfect match of fumadocs's own documentation site. No Steps clipping (the preset uses `@apply size-8 -start-4 rounded-full` with default vertical alignment rather than `top: 0`).
4. **`screenshots/04-md-render.png`** — composition rendered from a **markdown string**, not JSX, via the custom mdast→React walker. All 7 components render correctly. `MD_RENDER_OK` banner confirms pipeline succeeded. Headings are unstyled in this variant (the `.ProseMirror h1` etc. styles from `packages/app/src/globals.css` don't apply to a non-ProseMirror tree); for production OK this is a one-time decision about whether the fallback inherits `.ProseMirror` styles or gets its own prose stylesheet.

### Visual diff (in-editor render comparison)

**The target comparison in the prompt — "render the same composition inside the actual Open Knowledge dev server" — is not yet possible.** `packages/app/src/` does not import `fumadocs-ui` anywhere (verified via `grep -l fumadocs packages/app`) and `packages/app/src/editor/extensions/JsxComponentView.tsx` renders only a hand-written `Callout` component (`packages/app/src/editor/Callout.tsx`, 24 LoC with hardcoded Tailwind classes — no relation to fumadocs). Component-blocks-v2 is a planned spec, not shipped code.

What we CAN verify: the probe's full-CSS variant renders fumadocs components identically to how the docs site renders them (`docs/src/app/global.css` uses the same `fumadocs-ui/css/neutral.css` + `preset.css` imports as `probe/src/index-full-css.css`). The docs site IS a real consumer of fumadocs-ui with the same versions pinned in `docs/package.json`, so its output is the de-facto reference. Pixel-perfect parity with the docs site means the probe is valid ground truth for what the editor *will* render once component-blocks-v2 ships.

**Once component-blocks-v2 lands** (which this research is feeding into), the in-editor render will route each `<Tabs>` / `<Callout>` / etc. through `JsxComponentView` + `ContextBridgeProvider`. The provider re-supplies the same Context values that naturally flow in the probe. Therefore: probe render ≡ in-editor render, provided the bridge captures and republishes the contexts §9.15.5 enumerates. That's the bet the spec takes; this research confirms that the *standalone* path, which Option E needs, sidesteps the bridge entirely and achieves the same visual output via the much simpler "real React tree" route.

---

## CSS integration findings

### §9.7a minimal bridge is sufficient — with one 8-line cosmetic fix

The spec's existing bridge in `globals.css` (§9.7a, ~80 LoC) works for 6 of 7 components. **Steps has one regression:** positioning `.fd-step::before { top: 0 }` causes the counter circle to clip the first ~16 px of the step's first child when that child's text starts at `x=0`. The upstream fumadocs preset uses `@apply size-8 -start-4 rounded-full` without explicit `top`, which lets the counter align to the text baseline and prevents the clip.

**Proposed fix** to §9.7a.3 (part (3), Steps utility classes):

```diff
  .fd-step::before {
    background-color: var(--color-fd-secondary);
    color: var(--color-fd-secondary-foreground);
    content: counter(step);
    counter-increment: step;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 0.875rem;
    line-height: 1.25rem;
    width: 2rem;
    height: 2rem;
    position: absolute;
    left: -1rem;
-   top: 0;
    border-radius: 9999px;
  }
```

Removing the explicit `top: 0` lets the absolute-positioned counter default to the natural flow start, matching the upstream preset (verified in the `03-full-css-initial.png` screenshot).

### Why the minimal bridge, not the full `style.css`

Three conflicts documented in the spec (§9.7a "Explicitly NOT imported") hold for the Suspense fallback too, because the fallback lives inside the same document tree as the editor chrome:

1. `body { background-color: var(--color-fd-background) }` overwrites editor body styling on mount.
2. `@layer base { *, *::before, *::after { border-color: var(--color-fd-border) } }` resets borders on every element including editor chrome, PropPanel, and shadcn primitives.
3. `@variant dark (&:where(.dark, .dark *))` conflicts with the editor's existing `@custom-variant dark (&:is(.dark *))` — mixed variant strategies produce incorrect dark-mode scoping.

These conflicts apply whether the fumadocs CSS loads during the fallback or during hydration — stylesheets stay resident. So the fallback reuses the exact same bridge the editor uses, with the 1-line Steps fix above. Zero new CSS for Option E.

### Tailwind `@source` directive is load-bearing

Without `@source "../node_modules/fumadocs-ui/dist/**/*.js"` in the CSS, Tailwind v4 skips the dist tree and doesn't generate utilities like `bg-fd-card`, `text-fd-muted-foreground`, `divide-y`, `data-[state=inactive]:hidden`. The components then render structurally but unstyled: no backgrounds, no borders, no tab hiding. This is covered in the spec §9.7a part (6) but is worth noting explicitly since a wrong relative path silently produces the unstyled mode (an earlier pass of this probe had the wrong path and all tabs rendered simultaneously — see `screenshots/01-initial.png` git history if the probe is re-run).

---

## Markdown-to-React pipeline

### Existing infrastructure

Open Knowledge's markdown layer at `packages/core/src/markdown/` already has most of what's needed:

- **`packages/core/src/markdown/pipeline.ts`** — unified processor factory: `remark-parse` + `remark-frontmatter` + `remarkMdxAgnostic` + `remark-gfm` + `remarkWikiLink`. Cached at module level. Parses to mdast.
- **`packages/core/src/markdown/mdast-to-hast-handlers.ts`** — mdast→hast custom-node handlers for `mdxJsxFlowElement`, `mdxJsxTextElement`, `wikiLink`, `rawMdxFallback`. Shape: emits `hast` elements that `rehype-stringify` turns into HTML strings. Used by the clipboard pipeline.
- **`packages/core/src/markdown/mdast-to-html.ts`** — `markdownToHtml(md)` wrapper that runs parse → remark-rehype → custom handlers → `rehype-stringify`. Clipboard-only; produces escaped HTML text, not live React.

### What's reusable — and what's not

The existing clipboard path uses `mdast-util-to-hast` + `rehype-stringify`. It cannot be reused as-is for Option E because:

1. **Goal mismatch.** Clipboard needs an escaped HTML *string* with the raw MDX source text preserved as plain text (FR-20 security). Option E needs live React elements with `<Callout>` etc. resolving to actual fumadocs components.
2. **`hast-util-to-jsx-runtime` + `remark-mdx` incompatibility.** The obvious "replace stringify with JSX runtime" path errors with `Cannot handle MDX estrees without createEvaluater` as soon as a JSX attr uses an expression — e.g. `items={['TS', 'JS']}`. The library expects a JS evaluator (it's designed for full MDX where expressions get compiled and evaluated at build time). For a CRDT-stored document where attrs are static data, this is overkill machinery for a problem we don't have. Probe reproduction: `probe/src/MdToReact.tsx` emits this exact error at `screenshots/04-md-render.png` when pointed at the straight hast path.

### Recommended pipeline — custom mdast→React walker

The shortest self-contained path, verified working in `probe/src/MdToReact2.tsx`:

```
markdown
  → remark-parse + remark-frontmatter + remark-gfm + remarkMdxAgnostic
  → mdast
  → walker: each node type → React.createElement(tag|component, props, ...children)
  → React tree
```

~200 LoC total (see `probe/src/MdToReact2.tsx` for the full reference). Handles: root, paragraph, heading, text, strong, emphasis, inlineCode, code, list/listItem, blockquote, link, image, thematicBreak, break, delete, table/row/cell, html, yaml/toml (skip), mdxJsxFlowElement, mdxJsxTextElement. MDX attrs: string values pass through verbatim; expression values get evaluated via `new Function(\`return (${raw})\`)` — acceptable because authored markdown is the same trust level as MDX itself (MDX already runs arbitrary JS at compile time).

**Why this is the right shape for OK:**

1. **Bypasses the hast-JSX evaluator problem** — never calls `hast-util-to-jsx-runtime`, never needs `createEvaluater`.
2. **Co-domain parity with the editor.** The same mdast node types (`mdxJsxFlowElement`, `wikiLink`, `rawMdxFallback`) the editor already produces feed the walker. Shared source of truth: the mdast is authoritative.
3. **Future extensibility.** `wikiLink` and `rawMdxFallback` handlers slot in naturally (the existing handlers in `packages/core/src/markdown/mdast-to-hast-handlers.ts` show the shape; translate hast-emission to `React.createElement` calls).
4. **Testability.** The walker is a pure function of (mdast, componentMap). Snapshot tests, property tests, and pixel-diff tests against the in-editor render all compose on top of a pure function boundary.

### Effort estimate

- Walker: ~200 LoC (template `probe/src/MdToReact2.tsx`). Unit tests: ~150 LoC. Total ~350 LoC net-new.
- Dependencies added to `packages/app/` (if fumadocs-ui isn't already there from component-blocks-v2): only fumadocs-ui + its Radix/lucide deps. Markdown libs (`unified`, `remark-*`, `mdast-util-mdx`) are already in `packages/core`.
- Integration point: a new `packages/app/src/components/FallbackDocumentRender.tsx` (~40 LoC) that wires `ContentFromCRDT` → walker → `<div className="ProseMirror">` wrapper for style inheritance.

**Total: ~400 LoC + dependencies that either already exist or arrive with component-blocks-v2 anyway.**

### Alternative: ProseMirror-JSON→React walker

The prompt suggests: "Alternative: render ProseMirror JSON → React via a plain JSON-to-JSX walker (reuse the `componentMap` but skip NodeView chrome)." Feasibility: also feasible, same LoC, but **not recommended** because:

1. **Cache miss direction is wrong.** For a cold Suspense fallback, we're rendering from the *last-persisted markdown on disk* (the file-watcher's cache), not from a PM-JSON. Converting markdown → mdast → PM-JSON → React adds a round-trip with no benefit vs markdown → mdast → React directly.
2. **Two handler tables diverge over time.** OK already has `packages/core/src/markdown/handlers.ts` (mdast → PM JSON) and would add a second (PM JSON → React). Mdast is the canonical intermediate (SPEC §12 precedent #12 "XmlFragment authoritative; Y.Text mirrors"). Keeping walker rooted at mdast preserves that single source.
3. **MDX attr semantics live at mdast level.** `mdxJsxAttributeValueExpression` is an mdast type. Pushing through PM-JSON would require re-encoding expression attrs as strings, re-parsing them — strictly worse.

Use the mdast walker.

---

## Bundle-size implications

All measurements from `vite build` on the probe project, gzip column is Vite's reported gzip transfer size (not installed size, not uncompressed).

### Baseline measurements

| Variant | Raw JS | Gzipped JS | CSS (min bridge) |
|---|---|---|---|
| **React 19 only** (`dist-react-only/`) | 195 KB | 61 KB | 0 |
| **React 19 + 7 fumadocs components + Radix + cva** (`dist-fumadocs-only/`) | 260 KB | 82 KB | n/a (no Tailwind scan) |
| **Above + markdown pipeline** (unified + remark + mdast-util-mdx + custom walker) | ~310 KB | ~100 KB | 39 KB raw / 8 KB gz |

### Net cost of fumadocs in the fallback

**+21 KB gzipped JS** (82 KB − 61 KB baseline) for all 7 components + Radix primitives + class-variance-authority. That includes:

- `fumadocs-ui/dist/components/{callout,tabs,accordion,steps,card,files}.js` + `tabs.unstyled.js` + `ui/collapsible.js` + `icons.js` (~1.1 MB raw source before tree-shake; bundled contribution after tree-shake is dominated by the icon subset each component uses).
- `@radix-ui/react-tabs` (72 KB raw), `@radix-ui/react-accordion` (112 KB), `@radix-ui/react-collapsible` (64 KB) installed; bundle contribution after tree-shake is much smaller.
- `class-variance-authority` (tiny, ~2 KB raw).

### Cost of the markdown pipeline

**+~18 KB gzipped JS** (100 KB − 82 KB) for `unified` + `remark-*` + `mdast-util-mdx` + `micromark` + the custom walker. **Zero net cost if component-blocks-v2 ships first** — OK already has these dependencies in `packages/core/src/markdown/pipeline.ts` via the same packages. The only net-new is the walker itself (~200 LoC, minimal after tree-shake).

### Dynamic imports

fumadocs-ui's exports split each component into its own module (`exports` map in `node_modules/fumadocs-ui/package.json`). Each of the 7 imports is independently code-splittable. A conservative default for Option E: `import('fumadocs-ui/components/callout')` etc. lazy-loaded inside `FallbackDocumentRender`, so the fallback bundle itself is just React + the walker (+ markdown pipeline) — fumadocs components stream in once the document's mdast is parsed and their descriptor-map lookup resolves. This defers ~20 KB gzip to post-fallback-paint. **Recommend dynamic imports** since the fallback's purpose is to paint something fast; the per-component chunks land in the browser cache for subsequent revisits.

### Comparison against Option E's alternatives

- **Plain-markdown fallback (no fumadocs):** ~0 net-new bundle (just the walker + h1/p/etc. handlers). Visual cost: every `<Callout>` renders as the raw `<pre>` of its source text; layout shift when editor hydrates and components replace text blocks.
- **Hybrid ladder (plain-markdown → fumadocs after 200ms):** needs the fumadocs bundle anyway; adds timing logic; still has layout shift at the 200ms boundary. Worst of both.
- **Full-fidelity fumadocs (recommended):** +21 KB gzip; zero layout shift on hydration; the fallback IS what the editor will render, just without edit chrome (SideMenu, PropPanel, cursor).

21 KB gzipped, amortized across the page's total JS (OK's editor bundle is ~1.5 MB gzipped per §4 historical sizes in perf diagnostic spec evidence), is <1.5% growth. Not a trade-off — a one-way win assuming fumadocs is coming anyway.

---

## Recommended shape for Option E

**Full-fidelity fumadocs fallback. Concrete shape:**

```tsx
// packages/app/src/components/FallbackDocumentRender.tsx  (~40 LoC)

import { renderMarkdownToReact } from '@inkeep/open-knowledge-core/markdown/to-react';

// Dynamic imports keep the fallback chunk small; each component streams in
// once its mdast node is encountered.
const componentMap = {
  Callout:    () => import('fumadocs-ui/components/callout').then(m => m.Callout),
  Tabs:       () => import('fumadocs-ui/components/tabs').then(m => m.Tabs),
  Tab:        () => import('fumadocs-ui/components/tabs').then(m => m.Tab),
  Accordions: () => import('fumadocs-ui/components/accordion').then(m => m.Accordions),
  Accordion:  () => import('fumadocs-ui/components/accordion').then(m => m.Accordion),
  Steps:      () => import('fumadocs-ui/components/steps').then(m => m.Steps),
  Step:       () => import('fumadocs-ui/components/steps').then(m => m.Step),
  Cards:      () => import('fumadocs-ui/components/card').then(m => m.Cards),
  Card:       () => import('fumadocs-ui/components/card').then(m => m.Card),
  Files:      () => import('fumadocs-ui/components/files').then(m => m.Files),
  File:       () => import('fumadocs-ui/components/files').then(m => m.File),
  Folder:     () => import('fumadocs-ui/components/files').then(m => m.Folder),
};

export function FallbackDocumentRender({ markdown }: { markdown: string }) {
  const tree = renderMarkdownToReact(markdown, componentMap);
  return <div className="ProseMirror">{tree}</div>;
}
```

```ts
// packages/core/src/markdown/to-react.ts  (new — ~200 LoC)
// Template in probe/src/MdToReact2.tsx. Exposes:
export function renderMarkdownToReact(
  md: string,
  componentMap: Record<string, React.ComponentType<unknown>>,
): React.ReactElement
```

```tsx
// packages/app/src/components/EditorArea.tsx  (modify — ~5 LoC)
<Suspense fallback={
  <FallbackDocumentRender markdown={cachedMarkdownSnapshot} />
}>
  <DocumentBoundary docName={activeDocName} provider={provider}>
    <TiptapEditor ... />
    <SourceEditor ... />
  </DocumentBoundary>
</Suspense>
```

### Trade-offs surfaced by this shape

- **Pro — zero visible jank.** Fallback paints the real component tree with the same CSS as the hydrated editor. Hydration is a no-op to the user's eye: selection chrome appears, and that's the only visible delta.
- **Pro — content-continuity (SPEC §G2) composes.** Already-mounted Activity entries keep their DOM; the hybrid pool's LRU remounting under `ACTIVITY_MOUNT_LIMIT=3` (precedent #18(c)) is unaffected. The fallback fires on genuinely cold cache misses (new doc, first-ever visit).
- **Pro — cross-cutting reuse.**
  - Docs-site SSR already does this flavor of render (fumadocs-mdx + remark-rehype + MDX components); we'd line up with that path.
  - MCP "render preview" tool output gains a path for machine-consumable HTML.
  - Future read-only mode is a direct consumer.
  - Component-blocks-v2's future "side-panel preview" uses the same pipeline.
- **Con — coupling to fumadocs.** If we ever swap out fumadocs for a different component library, the fallback follows. But the component-blocks-v2 spec already commits to fumadocs; this decision inherits that commitment.
- **Con — bundle growth.** +21 KB gzip. Mitigation: dynamic imports per component (above). Realistically, the fumadocs cost is paid regardless by component-blocks-v2, so this column is a wash.
- **Con — MDX expression attrs evaluated at runtime.** The walker uses `new Function()` to eval `items={[...]}` and similar. Authored markdown is the same trust level as MDX source — not new attack surface. But it's a codegen boundary worth documenting in the SECURITY section of whatever spec formalizes this.
- **Watch — content drift on Hocuspocus sync.** If the CRDT sync delivers different bytes than the markdown snapshot the fallback rendered from, the hydration swaps in different content. Same class of continuity issue as precedent #18(b)-era work; handleable via the same "previous Activity keeps rendering until new one's ready" pattern (§G2).

---

## Open questions

1. **Where does the cached markdown come from at fallback-render time?** The file-watcher's in-memory snapshot (`packages/server/src/file-watcher.ts`) is one candidate. A separate "last-loaded content" HTTP endpoint is another. This is a V2 perf design detail, not a feasibility blocker.

2. **Headings & prose styles.** The probe's `04-md-render.png` shows `<h1>` rendering as unstyled text. In the editor, `.ProseMirror h1` has styling in `packages/app/src/globals.css`. For the fallback, two options: (a) wrap the fallback in `<div className="ProseMirror">` to inherit those styles (proposed in §"Recommended shape"), or (b) extract prose styles to a separate class both surfaces opt into. (a) is zero-cost and matches docs-site convention.

3. **Anchor behavior.** Fumadocs Tabs + Accordion both read `window.location.hash` on mount for deep-linking. If the URL has `#some-tab-id` and the fallback mounts first, then the editor hydrates, the anchor is read twice (once by fallback, once by hydrated editor). Unlikely to cause visible behavior since the second read idempotently selects the same tab — but confirm under the Accordion's collapsing animation path.

4. **Compound-component author UX.** SPEC §9.15 treats compound components (Tabs, Accordion) as special cases needing the Context Bridge. In the fallback, they're just regular React. This is a user-facing asymmetry only if authors rely on behaviors that differ (e.g., cross-NodeView cursor placement in editor vs. native collapse state in fallback). Probably nothing to do; worth a one-line note in the fallback spec.

5. **Will Option E actually hide the ~950 ms cold-load floor?** This research confirms the static-render path is feasible and architecturally clean. Whether it solves the perceived-perf problem (prompt claim: "hides a ~950 ms production cold-load floor") requires wiring the fallback up and measuring `ok/activity/...` + `ok/render/...` marks under the same cold-load scenario. That's V2 perf's measurement work, out of scope for this research.

6. **Does the minimal CSS bridge tolerate the Steps fix without breaking the in-editor render?** I believe yes — the fix is removing an explicit `top: 0` override so the element falls back to default positioning that matches upstream preset.css exactly. Worth a visual-regression snapshot on whichever editor scenarios exercise `fd-step` (the component-blocks-v2 spec test suite would catch it at VR07 — §13 Visual regression metric).

---

## Appendix — probe structure

```
/tmp/ok-perf-validation/fumadocs-static-fallback/
├── REPORT.md                               (this file)
├── screenshots/
│   ├── 01-initial.png                      (minimal bridge CSS, initial)
│   ├── 02-after-interactions.png           (minimal bridge CSS, post-click)
│   ├── 03-full-css-initial.png             (full fumadocs CSS, initial)
│   ├── 04-md-render.png                    (markdown-sourced render)
│   └── interaction-report.json
└── probe/
    ├── package.json
    ├── vite.config.ts                      (dev)
    ├── vite.config.bundle.ts               (bundle-only test)
    ├── vite.config.react.ts                (React-only baseline)
    ├── vite.config.multi.ts                (multi-entry build)
    ├── index.html                          (hand-JSX entry)
    ├── index-full-css.html                 (full CSS entry)
    ├── index-md.html                       (markdown-sourced entry)
    ├── index-bundle-test.html              (minimal fumadocs test)
    ├── index-react-only.html               (React baseline)
    ├── screenshot.mjs                      (Playwright interactivity)
    ├── screenshot-md.mjs                   (md render assertion)
    ├── screenshot-full-css.mjs             (full CSS assertion)
    ├── dist/                               (multi-entry build output)
    ├── dist-fumadocs-only/                 (fumadocs-only bundle output)
    ├── dist-react-only/                    (React-only bundle output)
    └── src/
        ├── main.tsx                        (hand-JSX entry)
        ├── main-full-css.tsx
        ├── main-md.tsx
        ├── main-bundle-test.tsx
        ├── main-react-only.tsx
        ├── App.tsx                         (hand-JSX composition)
        ├── MdApp.tsx                       (md-sourced composition)
        ├── MdToReact.tsx                   (hast-util-to-jsx-runtime attempt, fails on expressions)
        ├── MdToReact2.tsx                  (custom mdast walker — WORKING, ~200 LoC)
        ├── index.css                       (minimal §9.7a bridge)
        └── index-full-css.css              (full fumadocs CSS import)
```

**No files modified in `packages/`.** All probe artifacts live under `/tmp/`. The worktree has a `bun remove playwright 1.56.1 / bun add -d playwright@1.59.1` in `probe/package.json` to match the worktree's cached Playwright browsers, but that is inside `/tmp/`, not `packages/`.
