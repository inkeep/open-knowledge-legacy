# Evidence: D7 — Pattern D (hidden-iframe render-and-walk)

**Dimension:** Render React subtree into hidden iframe + walk iframe DOM with `getComputedStyle`
**Date:** 2026-05-01
**Sources:** html2canvas (`document-cloner.ts`), react-frame-component, html-to-image, react-email, Storybook docs, MDN, Mozilla bug tracker, Chromium blink-dev PSA, web.dev, Bugzilla 548397/1579345, Steve Souders, Jake Archibald

---

## Pattern overview

The pattern: at action time (e.g., copy), render the React subtree (e.g., `<Callout {...props}>`) into a hidden same-origin `<iframe>`. The iframe carries its own `Window`, `Document`, CSSOM, and rendering context. After mount, run `iframe.contentWindow.getComputedStyle(el)` (or, equivalently for same-origin, the parent window's `getComputedStyle` since same-origin spec semantics make computed styles accessible across windows) on elements inside the iframe's DOM. Walk the result. Emit cleaned HTML. Tear down (or recycle).

Concrete step sequence as practiced in production OSS (composite of html2canvas + react-frame-component, with adaptations for a React-managed render rather than a DOM clone):

1. `iframe = document.createElement('iframe')`
2. Style for offscreen invisibility: `position: fixed; left: -10000px; top: 0; visibility: hidden; border: 0; width/height: <bounds>; scrolling: no` (html2canvas pattern). `display: none` is **avoided** (see paint-timing concerns below).
3. `document.body.appendChild(iframe)`
4. Wait for iframe ready: either via `srcDoc` + `load` event (react-frame-component default, with a 500ms `setInterval` fallback for cold-cache cases), or via `documentClone.open()` / `documentClone.write('<!DOCTYPE html><html></html>')` / `documentClone.close()` then `iframeLoader` polling (html2canvas pattern).
5. Inject stylesheets into iframe `<head>`. Three approaches, all observed in OSS:
   - Mirror parent `<link rel="stylesheet">` elements (clone attributes, append to iframe head).
   - Inline parent `<style>` content via `node.sheet.cssRules` iteration → concatenated `cssText` → injected style element (html2canvas `createStyleClone`).
   - Direct `<link>` injection via React props (react-frame-component `head` prop) or via post-mount portal (`ReactDOM.createPortal(headContent, iframeDoc.head)`).
6. Render React subtree into iframe document body via `ReactDOM.createPortal(<MyDescriptor {...props}/>, iframeDoc.body)` (or via a separate `createRoot(iframeDoc.body).render(...)` for a fully detached tree).
7. Wait for paint: `await documentClone.fonts.ready` (html2canvas does this), optionally a `requestAnimationFrame`, optionally `Promise.resolve()` microtask flush.
8. Walk iframe DOM with `iframe.contentWindow.getComputedStyle(el)` — though for same-origin iframes, the parent window's `getComputedStyle` also works (cross-window access is permitted by same-origin policy).
9. Emit cleaned HTML.
10. Unmount React root (if persistent), or remove iframe (if on-demand).

---

## Prior art in the wild

### html2canvas (`niklasvh/html2canvas`)

Source: `src/dom/document-cloner.ts` (master branch). This is the **canonical OSS reference for hidden-iframe-with-getComputedStyle**. The library clones the entire document into an iframe expressly so that `getComputedStyle()` works correctly with the cloned DOM.

Container creation (`createIFrameContainer`):

```ts
const cloneIframeContainer = ownerDocument.createElement('iframe');
cloneIframeContainer.className = 'html2canvas-container';
cloneIframeContainer.style.visibility = 'hidden';
cloneIframeContainer.style.position = 'fixed';
cloneIframeContainer.style.left = '-10000px';
cloneIframeContainer.style.top = '0px';
cloneIframeContainer.style.border = '0';
cloneIframeContainer.width = bounds.width.toString();
cloneIframeContainer.height = bounds.height.toString();
cloneIframeContainer.scrolling = 'no'; // ios won't scroll without it
cloneIframeContainer.setAttribute(IGNORE_ATTRIBUTE, 'true');
ownerDocument.body.appendChild(cloneIframeContainer);
```

Note: `visibility: hidden` + `position: fixed; left: -10000px`. Not `display: none`. This is load-bearing — see CSS-computation gating below.

Document write pattern (`toIFrame`):

```ts
documentClone.open();
documentClone.write(`${serializeDoctype(document.doctype)}<html></html>`);
restoreOwnerScroll(this.referenceElement.ownerDocument, scrollX, scrollY);
documentClone.replaceChild(documentClone.adoptNode(this.documentElement), documentClone.documentElement);
documentClone.close();
```

Comment in source documents the rationale:
> "Chrome doesn't detect relative background-images assigned in inline `<style>` sheets when fetched through getComputedStyle if window url is about:blank, we can assign the url to current by writing onto the document"

— i.e., the `documentClone.write()` call is necessary because Chrome's `getComputedStyle` mis-resolves URLs in pure `about:blank` iframes. Writing to the document gives it a "real" URL context.

Style cloning (`createStyleClone`): iterates `node.sheet.cssRules`, concatenates `rule.cssText`, places concatenated CSS into a cloned `<style>` element's `textContent`. Catches `SecurityError` (cross-origin stylesheet inaccessible).

Pseudo-element handling: `createPseudoElementClone` reads `getComputedStyle(node, ':before' | ':after')` from the **original** document, then injects into clone.

Load synchronization (`iframeLoader`):

```ts
cloneWindow.onload = iframe.onload = () => {
    cloneWindow.onload = iframe.onload = null;
    const interval = setInterval(() => {
        if (documentClone.body.childNodes.length > 0 && documentClone.readyState === 'complete') {
            clearInterval(interval);
            resolve(iframe);
        }
    }, 50);
};
```

Note the 50ms polling interval — the iframe `load` event fires before the document body is necessarily populated, so polling is required.

Font readiness:
```ts
if (documentClone.fonts && documentClone.fonts.ready) {
    await documentClone.fonts.ready;
}
```

WebKit-specific extra wait: `await imagesReady(documentClone)`.

### html-to-image (`bubkoo/html-to-image`)

Source: `src/clone-node.ts`, `src/embed-webfonts.ts`, `src/apply-style.ts`.

**Does NOT use iframes for the main pipeline.** html-to-image takes a fundamentally different approach: it does an inline DOM clone in the same document, calls `window.getComputedStyle(originalNode)` on the **original** (live) node, and copies computed styles directly to the clone via `setProperty()` for each enumerated style property. Web fonts are embedded as data URIs.

The only iframe-related code is in `cloneIFrameElement`, which handles iframes that exist in the source DOM being cloned (it descends into `iframe.contentDocument.body`). This is the inverse of the D7 pattern — it consumes iframes rather than creating them.

Implication: html-to-image proves that for static capture (DOM → image/SVG), iframe-isolation is **not strictly necessary**. The library validates the inline computed-style copy as a viable production pattern (millions of weekly npm downloads).

### react-email (`resend/react-email`)

Source: package-level inspection. The `@react-email/render` package converts React components to HTML strings via standard ReactDOMServer-style rendering. The dev preview app uses a separate iframe to display the rendered email HTML for visual fidelity (mimicking email client sandboxing).

The preview iframe's purpose is **display isolation**, not computed-style extraction. The HTML it shows is already serialized; no `getComputedStyle` walk happens at preview-render time. Tailwind class resolution is done **server-side** at render time via a custom postcss plugin that resolves CSS variables (because email clients don't support custom properties reliably).

This is structurally distinct from D7: react-email decides the output HTML *before* the iframe exists.

### react-frame-component (`ryanseddon/react-frame-component`)

Source: `src/Frame.jsx` (master). The seminal "render React inside iframe" library, using `ReactDOM.createPortal` to bridge.

Key architecture:
- Default `initialContent`: `<!DOCTYPE html><html><head></head><body><div class="frame-root"></div></body></html>`
- Default uses `srcDoc` attribute; `dangerouslyUseDocWrite` flag opts into `document.open()/write()/close()` for libraries that depend on the iframe's location/origin (e.g., reCAPTCHA, Google Maps).
- Mount path: in `componentDidMount`, attaches `DOMContentLoaded` listener on `nodeRef.current.contentWindow`. On load, sets `iframeLoaded: true`.
- 500ms `setInterval` fallback (`loadCheck`) for cold-cache cases where `DOMContentLoaded` reportedly never fires.
- Render path: when `iframeLoaded`, returns:
  ```jsx
  return [
      ReactDOM.createPortal(this.props.head, this.getDoc().head),
      ReactDOM.createPortal(contents, mountTarget)
  ];
  ```
- Provides `FrameContextProvider` exposing `{ document, window }` to descendants for libraries that need to target the iframe's stylesheet root (e.g., styled-components `StyleSheetManager target={frameContext.document.head}`).

This is the canonical "React rendered in iframe" pattern. It does **not** itself solve the computed-style-extraction problem; it just makes iframe-rendered React tractable.

### Storybook iframe isolation

Storybook renders each story inside `iframe.html` (the preview iframe), separate from the manager UI iframe. Style injection methods:

1. **`.storybook/preview.ts`** — direct CSS imports here; HMR-supported. The Storybook builder (Vite or Webpack) bundles these into the preview iframe entry.
2. **`.storybook/preview-head.html`** — static HTML appended to iframe `<head>`. No HMR. Used for Google Fonts, CDN stylesheets.
3. **Programmatic** — addons can modify iframe head via `main.js` presets.

The crucial property: **Storybook does not auto-mirror parent stylesheets into the preview iframe**. Each iframe is a fully separate bundle entry; the preview iframe must explicitly import everything it needs. This gives style isolation by construction, but means parent CSS variables and Tailwind tokens don't transfer unless re-imported.

Source: Storybook's `preview-api/runtime.ts` shows the preview iframe runs a `setup()` that wires globals, telemetry, `inert` sync between manager and preview, and error handlers — all module-level imports. Stylesheets arrive via the bundler's normal import resolution at build time, not via cross-frame DOM mirroring.

The blog post "Storybook iframe tango" (damato.design) characterizes the isolation as "great for encapsulation, but awful for presentation" — the author argues Shadow DOM would be preferable to iframes for the same isolation goals.

### Other

- **`react-frame-portal` (iphong/react-portal-frame)** — alternative to react-frame-component; uses React portals to render into iframes, advertised as "fully aware of styled-components".
- **`react-styled-frame` (hydrateio/react-styled-frame)** — react-frame-component fork with built-in styled-components integration.
- **`component-css-extractor`** (Swizec) — extracts CSS for rendered React components by collecting class names + reading `document.head` `<style>` tags + parsing/filtering. Does **not** use iframes; works only on already-mounted components in the live document.

---

## Side effects + cost data

### iframe creation cost

- **General DOM cost (Steve Souders, 2009):** "iframes are 1-2 orders of magnitude more expensive to create than any other type of DOM element, including scripts and styles." This was measured against contemporary browsers; the relative cost remains material in modern engines because iframe creation entails a new browsing context, document, history, and event loop.
- **Empirical html2canvas measurement (`niklasvh/html2canvas#492`):** "iFrame generation takes 60ms on its own" reported by a contributor on a single machine, of a baseline ~100ms total render. The author proposed making iframe-use optional via `option.useIFrame = false`, suggesting the iframe-mode was originally needed primarily for Chrome's `about:blank` `getComputedStyle` quirk with relative background images.
- **`onload` blocking** — page `window.onload` does not fire until all iframes (and their resources) finish loading. Setting iframe `src` dynamically via JavaScript bypasses this in Chrome/Safari.

### React mount cost in iframe

- `createRoot(iframeDoc.body).render(...)` is **not synchronous**: "Although rendering is synchronous once it starts, root.render(...) is not. Code after root.render() may run before any effects (useLayoutEffect, useEffect) of that specific render are fired." `flushSync` can force synchronous behavior in rare timing-critical cases.
- react-frame-component pre-React-18 used `ReactDOM.render` (synchronous in legacy mode); React 18+ paths use `createPortal` (async-friendly with concurrent mode).
- **Cold-mount fallback timing**: react-frame-component's `setInterval(this.handleLoad, 500)` indicates that on cold caches, `DOMContentLoaded` may take >500ms to fire reliably.

### Stylesheet load latency

- Mirroring `<link rel="stylesheet">` elements into the iframe head triggers fresh resource fetches **unless** the browser cache already has the resource. Cross-tab cache hit reduces this to near-zero for warm cases, but the first iframe creation in a page's lifecycle pays full network cost.
- Inlining `<style>` content via `cssRules` iteration avoids the network round-trip but requires same-origin stylesheets (cross-origin throws `SecurityError`).
- Constructable stylesheets (`adoptedStyleSheets`) **cannot** be shared across iframe boundaries: "Each constructed CSSStyleSheet is tied to the Document it is constructed on… If you try to adopt a CSSStyleSheet that's constructed in a different Document, a NotAllowedError DOMException will be thrown" (web.dev, MDN). This forecloses the cleanest cross-frame stylesheet-sharing path.

### Paint timing for `getComputedStyle` reliability

- **Mozilla bug 1579345**: "When a stylesheet is injected into an iframe during page load, `getComputedStyle()` fails to reflect the new styles if the iframe is hidden (display: none)." Firefox does not compute styles for `display: none` iframes. Chromium computes them with a 0x0 viewport, but the asymmetry persists. Recommended workaround: append an empty style element and check `styleElement.sheet` is non-null.
- **Mozilla bug 548397**: `getComputedStyle()` originally returned **null** for elements inside `display:none` iframes in Firefox. Later partially fixed (returns empty `CSSStyleDeclaration` instead of null), but the underlying cross-browser asymmetry remains: Firefox returns empty values for hidden-iframe elements while other browsers return computed values per W3C CSSWG resolutions.
- Workarounds for hidden iframes:
  1. Use `visibility: hidden` + `position: absolute/fixed` (offscreen) instead of `display: none` — html2canvas does exactly this.
  2. Check `if (getComputedStyle(el))` before accessing.
  3. Use `setTimeout`/`requestAnimationFrame` to delay reads.
- `requestAnimationFrame` runs **before paint** in the rendering pipeline (callbacks → style calc → layout → paint). For same-origin iframes, the rAF timestamp is shared with the parent.
- **rAF is throttled/paused in hidden iframes.** Per Chromium's M112 PSA: "same-process, cross-origin iframes with display:none or that are not visible experience the same render throttling behavior as cross-process iframes. Throttled iframes lose access to requestAnimationFrame and ResizeObserver." For same-origin same-process iframes, the rules are looser, but `display:none` still risks throttling. Combined with the bug-1579345 evidence, this further argues against `display:none`.

### Memory and lifecycle

- iframes are not automatically garbage-collected just because they're removed from DOM if outstanding handles remain (event listeners, timers, observer registrations on `contentWindow`).
- React fibers attached to an iframe's documentBody require explicit `root.unmount()` to release; otherwise the React reconciler retains references. For a per-copy-event iframe, omitting unmount before iframe removal leaks fiber graphs.
- styled-components / emotion attached to iframe head via `StyleSheetManager` create document-scoped sheet caches that persist while the cache provider is mounted.

---

## CSS variable / Tailwind v4 scoping problem

**Core finding:** CSS custom properties (variables) **do not cross iframe document boundaries**.

- "Iframes only inherit background color from the parent's context. CSS custom properties defined in the parent document's `:root` or other selectors will not automatically be available inside an iframe's document. Each iframe has its own document scope, and styles defined in the parent document don't cascade into the iframe."
- Tailwind v4 `@theme` directives compile to `:root { --color-primary: …; … }` declarations. Without re-importing the same Tailwind layer (or the resolved CSS) into the iframe head, `--color-primary` resolves to its initial / inherited value — which for a custom property is the empty token, causing `var(--color-primary, fallback)` to use the fallback or `var(--color-primary)` to compute as the property's initial value.
- `getComputedStyle(el).getPropertyValue('--color-primary')` returns the **resolved** value at that element. If the iframe head has the same token-defining `:root` rule (because the same Tailwind-built CSS was injected), values match the parent. If not, they don't.
- Constructable adopted stylesheets are document-scoped (cannot be shared across iframes; throws `NotAllowedError`).
- The practical mirror options:
  1. Mirror parent `<link>` elements into iframe head (refetch cost; same-origin only).
  2. Inline parent `<style>` and `cssRules` content into iframe head (no refetch; same-origin only; throws for cross-origin sheets).
  3. Pre-bundle the iframe with its own Tailwind/CSS imports (Storybook's approach; requires build-time setup, not viable for ad-hoc copy iframe).
- `:root`-scoped variables defined on the *parent* `<html>` element are not visible to the iframe document because the iframe's document tree is rooted at its own `<html>` element. The cascade does not cross frames.

This is the load-bearing scoping problem for any iframe-based clipboard render of a Tailwind-token-using component.

---

## Variants D1 / D2 / D3

### D1: Singleton hidden iframe

- Created once at app init; reused for every copy event. Stylesheets pre-loaded into iframe head. React root persistent.
- **Pros:** amortizes iframe-creation cost (60ms+) across all subsequent copies. Stylesheets cached after first. React reconciler can diff across renders, avoiding full re-mount.
- **Cons:** iframe stays in DOM for the page lifetime; `<link>` resources stay loaded. Multiple concurrent copy events conflict on a single root. State purification requires explicit `root.unmount()` then `root.render()`, or rendering to a fresh container element each time.
- **Stylesheet update protocol:** if app stylesheets change (HMR, dynamic theming), iframe head must be re-synced. react-frame-component's `head` prop supports this — pass updated `<link>`/`<style>` JSX and React reconciles into iframe head via portal.

### D2: On-demand iframe

- Created per copy event; torn down after.
- **Pros:** clean state every time. No cross-copy contamination. No long-lived DOM nodes. Cache-line for stylesheets is browser-managed, not app-managed.
- **Cons:** pays full creation + stylesheet-load + React-mount cost per copy. With html2canvas's measured 60ms iframe generation, plus stylesheet network/cache lookup, plus React mount, plus `await documentClone.fonts.ready`, plus paint-frame wait, the cold path is multi-frame (>16ms per frame at 60Hz). Subsequent copies in the same session benefit from HTTP cache but still pay creation + mount.
- **Clipboard event timing constraint:** the synchronous `oncopy` handler must call `event.clipboardData.setData()` before returning. The async Clipboard API (`navigator.clipboard.write()`) has no synchronous deadline but requires a permission/secure-context-gated active user gesture. If iframe creation + mount + walk exceeds the user's gesture window, the async path may become subject to UA-specific gesture-staleness checks.

### D3: Iframe-substitute via Shadow DOM

- Replace the iframe with a `<div>` + `attachShadow({ mode: 'open' })`. Render React subtree into the shadow root. Walk shadow contents.
- **Pros:** no separate `Window` creation; no `about:blank` gymnastics; no cross-frame paint-throttling; constructable stylesheets *can* be adopted into shadow roots from the same document (they share the document context).
- **Cons:** **`getComputedStyle` behaves differently in Shadow DOM.** The shadow root is in the same document as its host; computed styles for shadow-tree elements are computed relative to the same document as the host. Inherited properties from the host (including custom properties from `:root`) **do** flow into open shadow trees by default — this is the *opposite* of the iframe behavior. So D3 inherits parent CSS variables for free, where D1/D2 do not. But D3 also inherits parent unwanted styles, partly defeating the isolation goal.
- Storybook iframe-tango blog post cited Shadow DOM as the preferable alternative for the same isolation problem ("all of this could be avoided if the stories were rendered within a Shadow DOM").
- Depending on user-agent stylesheet defaults, Shadow DOM may not need a separate `<head>` to host stylesheets — `<style>` elements anywhere in the shadow tree are scoped to that tree.

---

## What it enables vs the live walker

The current walker reads `view.nodeDOM(pos)` from the live ProseMirror editor and runs `getComputedStyle` on those nodes (in the parent document's CSSOM context). The hidden-iframe pattern enables:

| Capability | Live walker | D1 (singleton iframe) | D2 (on-demand iframe) | D3 (shadow DOM) |
|---|---|---|---|---|
| Resolve component without React mount in main editor tree | No (must be currently mounted) | Yes (renders descriptor from props) | Yes | Yes |
| Render Activity-hidden subtrees | No (React 19.2 unmounts hidden Activity) | Yes (re-renders fresh from captured props) | Yes | Yes |
| State-purified output (no hover/focus/selection) | No (live state leaks into computed values) | Yes (fresh render) | Yes | Yes |
| Tailwind class resolution without main-page leakage | No (parent CSS leaks) | Yes IF iframe head re-injected | Yes IF iframe head re-injected | Partial — host parent vars leak in |
| Inherits CSS custom properties from parent `:root` | Yes | No (must mirror) | No (must mirror) | Yes (shadow open by default) |
| Synchronous within `oncopy` handler | Yes | Possibly (if pre-warmed) | No (multi-frame cold path) | Yes (synchronous mount) |
| Cost per copy | ~ms (DOM walk only) | ~ms warm; ~tens-of-ms cold | ~tens-of-ms or more | ~ms |
| Memory cost | None | Persistent iframe + react root | Transient | Transient |
| Cross-window `getComputedStyle` semantics | N/A (same window) | Same-origin allows it | Same-origin allows it | Same-document, no cross-window concerns |

The **load-bearing capability** the hidden-iframe pattern uniquely enables, that the live walker cannot: **rendering a component from captured props without mounting it in the editor tree**. This is the only path that survives Activity-hidden unmounting (precedent #18(b) in CLAUDE.md notes that React 19.2 `<Activity mode="hidden">` unmounts the hidden subtree's DOM, and the project memory note `project_tiptap_activity_hidden_destroys_editor.md` records that `useEditor.scheduleDestroy(1ms)` destroys TipTap on Activity hidden). Live walker + Activity-hidden is broken by construction; D1/D2/D3 are not.

---

## Findings

### Finding 1: html2canvas validates the hidden-iframe + `getComputedStyle` pattern at production scale.

**Confidence:** High.
**Evidence:** `src/dom/document-cloner.ts` master branch. The library has 30k+ GitHub stars, ships in many production codebases, uses the exact pattern (`createIFrameContainer` + `documentClone.write` + `iframeLoader` + `getComputedStyle` walk) the dimension proposes. Specific style choices (`visibility: hidden` + offscreen positioning, NOT `display: none`; `documentClone.write()` to give the iframe a real URL context) are documented in source comments as Chrome compatibility workarounds for `getComputedStyle`.

### Finding 2: `display: none` iframes have unreliable `getComputedStyle`; offscreen `visibility: hidden` is the production-safe pattern.

**Confidence:** High.
**Evidence:** Bugzilla 548397 (Firefox returned null for hidden-iframe elements; partially fixed to return empty `CSSStyleDeclaration`; cross-browser asymmetry remains). Bugzilla 1579345 (`getComputedStyle` doesn't reflect injected stylesheets in `display:none` iframes during page load — Emilio Cobos Álvarez: "the iframe is hidden during page load, so we don't compute styles in there"). Chromium blink-dev PSA (`display:none` cross-origin iframes lose `requestAnimationFrame` and `ResizeObserver` access via render throttling). html2canvas avoids `display:none` precisely for this reason.

### Finding 3: CSS custom properties do NOT cross iframe boundaries; Tailwind v4 `@theme` tokens require explicit re-injection.

**Confidence:** High.
**Evidence:** MDN custom-properties documentation; web.dev; multiple cited sources confirm: "Each iframe has its own document scope, and styles defined in the parent document don't cascade into the iframe." Constructable adopted stylesheets are document-scoped and throw `NotAllowedError` when adopted across documents (web.dev, MDN, WICG construct-stylesheets explainer). Tailwind v4 `@theme` directives compile to `:root` custom-property declarations; without re-injecting the compiled CSS into iframe `<head>`, `--color-*` variables resolve to the initial empty token in the iframe document.

### Finding 4: iframe creation has measurable, non-trivial latency (~60ms reported; "1-2 orders of magnitude more than other DOM elements").

**Confidence:** Medium-High.
**Evidence:** `niklasvh/html2canvas#492` reports 60ms iframe generation in author's measurement (single machine, single browser; not a controlled benchmark across hardware). Steve Souders' "Using Iframes Sparingly" (2009) characterizes iframes as 1-2 orders of magnitude costlier than scripts/styles to create — original measurement is ~17 years old but the architectural reason (new browsing context, document, history, event-loop wiring) persists in modern engines. Jake Archibald's iframe-streaming write-up (2016) corroborates the relative-cost claim. The cold-path cost is the sum of: createElement (cheap), append (cheap), browsing-context init (the bulk), document write/srcdoc parse, stylesheet fetch (network or cache), font ready, React mount.

### Finding 5: react-frame-component validates the React-via-portal-into-iframe pattern; provides reusable lifecycle plumbing.

**Confidence:** High.
**Evidence:** `src/Frame.jsx` source. Uses `srcDoc` by default, falls back to `document.write()` via `dangerouslyUseDocWrite` flag, attaches `DOMContentLoaded` listener with 500ms `setInterval` fallback for cold-cache cases. Mounts via `ReactDOM.createPortal(contents, mountTarget)` and `ReactDOM.createPortal(head, doc.head)`. Requires same-origin (uses parent React reconciler against iframe document; this fails for cross-origin frames). 200+ npm packages in 2026 depend on or fork this pattern.

### Finding 6: Stylesheet sharing strategies have asymmetric tradeoffs.

**Confidence:** High.
**Evidence:** Three primary strategies documented across OSS:

1. Mirror parent `<link rel="stylesheet">` elements into iframe head → triggers fresh fetches, pays HTTP cost (cached or not). Same-origin works always.
2. Inline parent `<style>` content via `node.sheet.cssRules` → no network cost; throws `SecurityError` on cross-origin stylesheets (html2canvas catches this).
3. Pre-bundle iframe with own imports (Storybook approach) → not viable for ad-hoc/runtime iframe creation.

Constructable `adoptedStyleSheets` is **not** a viable cross-frame share path (throws `NotAllowedError`).

### Finding 7: iframe `srcDoc` vs `document.write()` is a compatibility tradeoff, not a performance one.

**Confidence:** Medium.
**Evidence:** react-frame-component documents `dangerouslyUseDocWrite: true` as a workaround for libraries that depend on the iframe's location/origin (reCAPTCHA, Google Maps). html2canvas uses `document.open()/write()/close()` because Chrome `getComputedStyle` mis-resolves relative URLs in `about:blank` (which `srcDoc` initially is). No quantitative perf comparison surfaced; the choice is driven by URL-resolution semantics for `getComputedStyle` and third-party-library compatibility.

### Finding 8: Same-origin iframe contentWindow and contentDocument are fully accessible from parent; cross-origin throws.

**Confidence:** High.
**Evidence:** MDN `HTMLIFrameElement.contentWindow`. Same-origin iframes allow full DOM access including `getComputedStyle` from either window's perspective on either document's elements. Cross-origin frames throw `SecurityError` on access to `contentDocument`. For the D7 use case the iframe is created locally (no `src` attribute, or `srcDoc` only) which keeps it same-origin.

### Finding 9: Shadow DOM (D3) is a partial alternative with different scoping properties.

**Confidence:** Medium-High.
**Evidence:** Storybook iframe-tango author argues Shadow DOM would be preferable for component isolation. CSS custom properties **do** cross open shadow boundaries (via host inheritance), unlike iframes — this is sometimes a feature (Tailwind tokens transfer free) and sometimes a bug (parent unwanted styles also transfer). Constructable stylesheets work with shadow roots since they share the host document. No separate `Window`, so `getComputedStyle` operates with parent document's CSSOM. No `about:blank` URL-resolution quirks. No iframe-creation 60ms cost. No `display:none`-style throttling concern.

### Finding 10: Hidden-iframe + `requestAnimationFrame` is fragile for synchronous-feeling clipboard timing.

**Confidence:** Medium-High.
**Evidence:** Chromium throttles rAF in `display:none` and offscreen iframes; same-process same-origin frames remain looser but are not exempt. iOS Safari throttles cross-origin iframe rAF to 30fps pre-interaction. `documentClone.fonts.ready` is the most reliable readiness signal in html2canvas (vs. `requestAnimationFrame` alone). For clipboard event sync timing: the `oncopy` handler must complete `setData()` synchronously, but the async `navigator.clipboard.write()` API has more flexibility. A multi-frame cold-path iframe pipeline cannot fit in the synchronous `oncopy` window.

---

## Gaps / follow-ups

- No empirical benchmark of the full D1 cold-path latency (iframe creation + stylesheet inject + React mount + paint + walk) against a modern engine on representative hardware. The 60ms html2canvas measurement is from an unspecified machine/browser and is over a decade old.
- No concrete production OSS that does the *exact* "hidden iframe at copy time" pattern surfaced — html2canvas does it for screenshot capture (different timing budget), Storybook does it for live preview (no copy budget at all). The closest analogue is rich-text editor iframe-mode (TinyMCE classic, CKEditor 4 classic) but those are persistent edit surfaces, not copy-time renders. The D7 pattern as proposed for clipboard is a novel synthesis.
- Tailwind v4 specifically uses `@theme` and `@layer base` with cascading layer declarations — whether `cssRules` iteration captures `@layer` correctly in 2026 browsers is not surfaced; cross-origin sheets might split tokens across layers in ways the inline-clone path misses.
- React 19's `<Activity>` semantics in concurrent mode interact with portals to iframe documents — whether a hidden Activity ancestor unmounts a portal child rendered into an iframe is not surfaced and is worth empirical verification.
- For the D1 singleton variant, the protocol for handling Tailwind HMR updates (new tokens, removed classes) in the iframe head is unspecified in OSS; Storybook only re-bundles the entire preview iframe on HMR.
- Whether the `oncopy` event's synchronous emit window is feasible in any iframe variant is not surfaced empirically — the async Clipboard API path is the more likely fit, but its user-gesture-staleness semantics across multi-frame waits are not documented in surveyed sources.

Sources:
- [html2canvas src/dom/document-cloner.ts (master)](https://github.com/niklasvh/html2canvas/blob/master/src/dom/document-cloner.ts)
- [html-to-image src/clone-node.ts](https://github.com/bubkoo/html-to-image/blob/master/src/clone-node.ts)
- [react-frame-component src/Frame.jsx](https://github.com/ryanseddon/react-frame-component/blob/master/src/Frame.jsx)
- [react-frame-component README](https://github.com/ryanseddon/react-frame-component)
- [react-email](https://github.com/resend/react-email)
- [Storybook styling-and-css docs](https://storybook.js.org/docs/configure/styling-and-css)
- [Storybook iframe tango (damato.design)](https://blog.damato.design/posts/storybook-iframe-tango/)
- [Bugzilla 548397: getComputedStyle null in display:none iframe](https://bugzilla.mozilla.org/show_bug.cgi?id=548397)
- [Bugzilla 1579345: getComputedStyle injected stylesheet in iframe](https://bugzilla.mozilla.org/show_bug.cgi?id=1579345)
- [html2canvas issue 492: iFrame-less option](https://github.com/niklasvh/html2canvas/issues/492)
- [Steve Souders: Using Iframes Sparingly (2009)](https://www.stevesouders.com/blog/2009/06/03/using-iframes-sparingly/)
- [Jake Archibald: Fun hacks for faster content](https://jakearchibald.com/2016/fun-hacks-faster-content/)
- [MDN: HTMLIFrameElement.contentWindow](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/contentWindow)
- [MDN: Window.getComputedStyle](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle)
- [web.dev: Constructable Stylesheets](https://web.dev/articles/constructable-stylesheets)
- [Chromium blink-dev: iframe render throttling PSA](https://groups.google.com/a/chromium.org/g/blink-dev/c/op-z7fMMmWY)
- [Stoyan Stefanov: Parent's styles in an iframe](https://www.phpied.com/parents-styles-in-an-iframe/)
- [LogRocket: Best practices for React iframes](https://blog.logrocket.com/best-practices-react-iframes/)
- [Stephen Haney: React Styled Components in iFrames](https://stephenhaney.com/2018/react-styled-components-in-iframes/)
- [Swizec: Getting CSS out of rendered React components](https://swizec.com/blog/getting-the-css-out-of-rendered-react-components/)
