# Evidence: D4 — Re-render patterns in React / editor contexts

**Dimension:** D4 (module-level cache, useMemo hashing, debounce/throttle, SVG DOM reuse, Suspense integration)
**Date:** 2026-04-21
**Sources:** fumadocs reference component, community React-mermaid packages (tarballs), mermaid-live-editor, Vite docs

---

## Key files / URLs referenced

- `~/.claude/oss-repos/fumadocs/apps/docs/components/mdx/mermaid.tsx:1-55` — fumadocs reference pattern
- `node_modules/mermaid/dist/mermaid.core.mjs:1048-1155, 1060-1094, 1146-1149` — render internals (relevant to reuse/teardown)
- `/tmp/react-mermaid-research/package/src/Mermaid.js` — `react-mermaid2` source (unpacked from npm tarball)
- `/tmp/lightenna-mermaid/package/dist/esm/index.js` — `@lightenna/react-mermaid-diagram` source
- [mermaid-live-editor autoSync.ts](https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/util/autoSync.ts)
- [mermaid-live-editor View.svelte](https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/components/View.svelte)
- [Vite features: Dynamic Import](https://vite.dev/guide/features.html)
- [mermaid-js Discussion #3843](https://github.com/orgs/mermaid-js/discussions/3843)
- [Renda Zhang: Why Mermaid Charts Disappear in React](https://rendazhang.medium.com/why-mermaid-charts-disappear-in-react-and-how-to-fix-it-351545ef1ebc) — T4 corroboration

---

## Findings

### D4.1 — Module-level promise cache (fumadocs pattern)

**Confidence:** CONFIRMED (source-read)
**Evidence:** `~/.claude/oss-repos/fumadocs/apps/docs/components/mdx/mermaid.tsx:17-26`

Verbatim cache implementation (fumadocs):

```tsx
const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}
```

**What gets cached — two distinct keys:**

1. Key `'mermaid'` — one-shot key for the dynamic `import('mermaid')` promise itself (module-level; shared across all diagrams on the page)
2. Key `` `${chart}-${resolvedTheme}` `` — keys the rendered SVG promise by full chart text + theme. `mermaid.render(id, chart)` resolves to `{svg, bindFunctions}`; the entire promise object is memoized

**Theme in cache key:** `resolvedTheme` from `next-themes` is part of the cache key. On theme flip, a new entry is added; prior theme's entry remains resident. **No eviction logic.**

**DOM mount:** `bindFunctions?.(container)` invoked in a callback ref; SVG injected via `dangerouslySetInnerHTML={{ __html: svg }}`. No ref to retain container across re-renders; React re-mounts on chart/theme change naturally.

**Pros (per source structure):**
- Zero work on repeat renders of same `(chart, theme)` — `use(promise)` synchronously unwraps the already-resolved promise
- Deduplicates `import('mermaid')` across all Mermaid blocks on the page
- Mounted gate (`mounted` state + `useEffect`) delays rendering until after hydration

**Cons (per source structure):**
- **Unbounded cache growth.** Every unique `(chart, theme)` pair retained for process lifetime. A live-editing surface where each keystroke produces a different `chart` string leaks resolved Promises (each holding SVG string, typically 4-50 KB) until full page reload
- **No eviction on cache rejection.** If `mermaid.render()` rejects, rejected Promise stays cached — `use(rejectedPromise)` throws on every subsequent render. Caller must invalidate imperatively (fumadocs does not)
- **Theme variants double footprint.** Flipping theme mid-session keeps old-theme entry resident

### D4.2 — Component-level `useMemo` / hash-based caching

**Confidence:** CONFIRMED (source-read from tarballs)

#### `react-mermaid2` (npm v0.1.4, ~9,923 downloads/month per D5.5)

From `/tmp/react-mermaid-research/package/src/Mermaid.js`:

```js
const Mermaid = ({ name, chart, config }) => {
  mermaid.initialize({...DEFAULT_CONFIG, ...config})
  useEffect(() => {
    mermaid.contentLoaded()
  }, [config])
  if (!chart) return null
  return <div className="mermaid" name={name}>{chart}</div>
}
```

Uses the **legacy `mermaid.contentLoaded()` DOM-scan pattern** — writes chart text to `<div class="mermaid">`, then tells mermaid to scan the page. **No `useMemo`, no hash cache. `chart` changes don't trigger `contentLoaded()`; only `config` does.**

#### `@lightenna/react-mermaid-diagram` (v1.0.22, ~15K downloads/month)

From `/tmp/lightenna-mermaid/package/dist/esm/index.js` (minified; behavior observed):

- Uses `useState` for `[container, setContainer]` and `[result, setResult]`
- `useEffect` on `[chart, props]` calls `await mermaid.render(\`${id}-svg\`, chart)` then stores `{svg, bindFunctions}` in state
- Second `useEffect` on `[container, result]` does `container.innerHTML = result.svg` and `result.bindFunctions(container)`
- **No `useMemo`, no hash cache.** Every re-render where `chart` or full `props` object changes re-invokes `mermaid.render`

#### When component-level memo beats module-level cache

**Confidence:** INFERRED (by construction)

`useMemo` keyed on `chart` is scoped to a single component instance — on unmount, memoized SVG is GC'd with the component. The fumadocs module-level pattern retains SVGs for process lifetime.

#### What memoization cannot do for `mermaid.render`

**Confidence:** CONFIRMED (from `mermaid.render` async signature)

`mermaid.render()` is async (returns `Promise<RenderResult>`). `useMemo` cannot hold a pending promise across renders in a way that React can suspend on — which is why `use(promise)` + promise-cache is the React-19-native pattern. `useMemo` variants must pair with `useState`/`useEffect` to transport async results into render, which creates the "flash" fumadocs avoids.

**Note:** `beautiful-mermaid`'s README at line 89 annotates: *"Because rendering is synchronous, you can use useMemo() for zero-flash diagram rendering"* — a beautiful-mermaid-specific win (it parses + lays out synchronously); does NOT apply to mermaid itself.

### D4.3 — Debouncing / throttling

**Confidence:** CONFIRMED (code-read)
**Evidence:** [mermaid-live-editor autoSync.ts](https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/util/autoSync.ts)

Authoritative debounce implementation (see full code excerpt in `d3-sibling-editors.md` §10):

**Render-cost-adaptive, not fixed-delay:**
- Last render < 150ms → NO debounce, render immediately (`shouldSync = true`)
- Last render ≥ 150ms → `shouldSync = false`, gate behind 1000ms trailing-edge debounce
- `View.svelte` calls `shouldRefreshView()` before every render attempt; early-returns when gated

Fast diagrams (simple flowcharts, sequences) render every keystroke. Heavy diagrams (large ER, C4) gate to 1 Hz.

**View.svelte additionally** memoizes on `(code, config, rough, panZoom)` tuple before invoking `mermaid.render` — four-field dirty-check.

**Other debouncing patterns in the wild:**
- **`md2docx/tiptap-extension-mermaid`**: 300ms fixed trailing-edge debounce (configurable via `debounce` option) — see `d3-sibling-editors.md` §6
- **Outline**: NO debounce — re-renders on every transaction (but has sessionStorage LRU to short-circuit identical `(theme, text)`)
- **Docmost**: NO debounce — `useEffect` dependency triggers on every content/theme change
- **MDXEditor example**: NO debounce — keystroke-by-keystroke (example code, not production)

**Build-time alternatives that avoid the debounce question entirely:**
- `rehype-mermaid@3.0.0` / `remark-mermaidjs@7.0.0` (npm) — both depend on `mermaid-isomorphic` which peer-depends on `playwright@1`. Mermaid rendered in Playwright headless browser, SVG embedded in HAST/MDAST at build time, client ships zero mermaid JS

### D4.4 — SVG DOM reuse vs re-creation

**Confidence:** CONFIRMED (source-read of `mermaid.render`)
**Evidence:** `node_modules/mermaid/dist/mermaid.core.mjs:1048-1155`

```js
var render = async function(id32, text, svgContainingElement) {
  addDiagrams();
  const processed = processAndSetConfigs(text);
  ...
  const removeTempElements = () => {
    const tmpElementSelector = isSandboxed ? iFrameID_selector : enclosingDivID_selector;
    const node = select(tmpElementSelector).node();
    if (node && "remove" in node) {
      node.remove();
    }
  };
  let root = select("body");
  ...
  if (svgContainingElement !== void 0) {
    svgContainingElement.innerHTML = "";
    ...
    appendDivSvgG(root, id32, enclosingDivID, ...);
  } else {
    removeExistingElements(document, id32, enclosingDivID, iFrameID);
    ...
    root = select("body");
    appendDivSvgG(root, id32, enclosingDivID);
  }
  ...
  await diag.renderer.draw(text, id32, "11.14.0", diag);
  ...
  let svgCode = root.select(enclosingDivID_selector).node().innerHTML;
  ...
  removeTempElements();
  return { diagramType, svg: svgCode, bindFunctions: diag.db.bindFunctions };
};
```

**Mechanism:** render appends `<div id="d${id}"><svg id="${id}"><g></g></svg></div>` to either the caller's `svgContainingElement` OR to `document.body` (when no container passed), runs d3 layout on real DOM (required for `getBBox()` etc.), serializes `div.innerHTML` back out, then `removeTempElements()` to delete the appended DOM. **Returned `svg` string is freshly constructed every call. No in-place update option.**

**Side effect:** with no container passed, `removeExistingElements(document, id, divId, iFrameId)` runs `document.getElementById(...)?.remove()` for matching ids — *globally on `document`*. Re-using an `id` across renders scrubs whatever element currently has that id. Community advice and official docs caution against using an id already in the live DOM.

#### Injection patterns observed

| Pattern | Example |
|---|---|
| `dangerouslySetInnerHTML` | fumadocs (§D4.1), Renda Zhang tutorial Strategy 2 |
| `ref.innerHTML` | `@lightenna` (`result.svg` via `container.innerHTML = svg` in `useEffect`) |
| `<svg>` JSX from DOMParser | NOT observed in community packages surveyed |

`beautiful-mermaid` returns a plain SVG string — leaves injection to the consumer.

#### Memory leak / orphan SVG reports

**Confidence:** MEDIUM (issue pattern + code path)
**Evidence:** mermaid-js/mermaid issue #786 (closed/older), #5307 (open); code path at `mermaid.core.mjs:1117-1125, 1146-1149`

Most-cited mechanism: auto-id collision + temp-div leak on render errors. Issue #786: *"render method produces `<div>`s on body when syntax errors occur."* The `removeTempElements()` runs on success path and `suppressErrorRendering` branch — but the `errorRenderer_default.draw(...); throw e;` branch at line 1123-1125 runs error-renderer draw *before* throwing, appending DOM. Whether cleanup always fires is version-specific. See also `d1-mermaid-package.md` Finding D1.3.d.

### D4.5 — React error boundary / Suspense integration

**Confidence:** CONFIRMED (fumadocs source); LOW (React 19 Activity interaction — no evidence)
**Evidence:** `~/.claude/oss-repos/fumadocs/apps/docs/components/mdx/mermaid.tsx:31, 41`

```tsx
const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));
const { svg, bindFunctions } = use(
  cachePromise(`${chart}-${resolvedTheme}`, () => {
    return mermaid.render(id, chart.replaceAll('\\n', '\n'));
  }),
);
```

Two `use(promise)` calls — one for mermaid module dynamic import, one for SVG render. React suspends subtree until both resolve. Consumers must wrap in `<Suspense>` and an error boundary. **No fallback provided in this component.**

**React 19 `<Activity>` + mermaid:** No first-party reports found. General React 19.2 Activity API behavior (per LogRocket / LearnWebCraft write-ups): Activity-hidden DOM is effectively detached but Fiber tree + state preserved. For mermaid specifically:
1. fumadocs `cachePromise(chart, ...)` cache is module-level — survives Activity transitions entirely
2. `bindFunctions` stored on resolved `RenderResult`; calling it on Activity-hidden DOM node has no documented behavior

**`use(cachePromise(...))` trade-offs (verified from source):**
- **If cached promise rejects:** every re-render re-throws. Cache has no built-in mechanism to drop a rejected entry. Consumer needs imperative invalidation (fumadocs doesn't provide it)
- **Cache key includes theme string:** theme flips never evict prior-theme entry. Long editor sessions accumulate SVGs across all (chart, theme) cartesian product visits
- **Dynamic import cache (`'mermaid'` key):** one-shot. If dynamic import rejects (network failure during code-split chunk fetch), rejected promise sticks — recovery requires reload or manual invalidation

---

## Negative searches

- **First-party React + mermaid pattern from mermaid-js team** — none. Discussion #3843 ("API Render without DOM Manipulation") documents why `mermaid.render` manipulates DOM by design (needs d3 layout on real elements); no maintainer-recommended React wrapper exists
- **React 19 Activity + mermaid interaction reports** — zero found in GitHub issues, blog posts, or mermaid-js discussions
- **Shared in-memory SVG cache across React tree mounts (beyond the process-level module cache)** — not observed in any surveyed package

---

## Gaps / follow-ups

- **Effective memory footprint of unbounded module cache** — what's an SVG string size in practice for a real editor session? Not measured
- **Behavior of `use(cachePromise(...))` with rejected cached promise** — documented at code level but not stress-tested
- **Activity-hidden bindFunctions** — no evidence how mermaid's interactive callbacks behave with detached-but-preserved Fiber nodes
