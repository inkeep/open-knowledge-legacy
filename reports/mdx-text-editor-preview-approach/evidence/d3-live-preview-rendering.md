# Evidence: D3 — Live Preview Rendering of MDX

**Dimension:** How to render MDX in real-time in a browser preview panel
**Date:** 2026-04-03
**Sources:** @mdx-js/mdx docs, MDX GitHub discussions, MDX playground, mdxblog tutorial

---

## Key files / pages referenced

- https://mdxjs.com/packages/mdx/ — @mdx-js/mdx API reference
- https://github.com/orgs/mdx-js/discussions/1862 — Runtime compilation discussion
- https://github.com/mdx-js/mdx/issues/1655 — Performance issue with unstable element types
- https://github.com/orgs/mdx-js/discussions/2220 — Client-side compilation discussion
- https://github.com/mdx-js/mdx/issues/2606 — Refactor or remove MDX on demand
- https://www.sandromaglione.com/articles/how-to-compile-and-run-mdx-in-react — MDX compile+run guide
- https://fumadocs.dev/docs/mdx/performance — Fumadocs MDX performance docs

---

## Findings

### Finding: @mdx-js/mdx evaluate() enables browser-side MDX compilation and rendering
**Confidence:** CONFIRMED
**Evidence:** https://mdxjs.com/packages/mdx/

The `evaluate()` and `evaluateSync()` functions from @mdx-js/mdx compile MDX source to JavaScript AND execute it, returning a React component. The API:

```javascript
const { default: MDXComponent } = await evaluate(source, {
  ...runtime,   // from @mdx-js/react or similar
  Fragment,
  remarkPlugins: [remarkGfm],
});
```

`evaluate()` wraps code in AsyncFunction (supports top-level await). `evaluateSync()` uses normal Function. Both return `{ default: MDXComponent }` where MDXComponent is a renderable React component.

This works entirely in the browser — no server compilation needed. The @mdx-js/mdx package brings the full unified/remark/rehype pipeline to the client.

### Finding: evaluate() creates unstable component references — a known React reconciliation problem
**Confidence:** CONFIRMED
**Evidence:** https://github.com/mdx-js/mdx/issues/1655, https://mdxjs.com/packages/mdx/

Each call to `evaluate()` creates a new function definition for MDXContent. React's reconciliation algorithm treats components of different types as different trees, causing full unmount + remount rather than efficient diffing. On every keystroke with naive implementation, the entire rendered preview would be destroyed and recreated.

**Workaround from official docs:** Instead of using MDXContent as a React element (`<MDXContent />`), call it as a function (`MDXContent(props)`). This returns React elements directly, which CAN be diffed since they are plain element types (div, p, etc.) rather than a new component function each time.

This is a critical performance optimization for live preview. Without it, every compilation causes full DOM teardown.

### Finding: Debouncing is essential — direct per-keystroke compilation is impractical
**Confidence:** CONFIRMED
**Evidence:** https://www.mdxblog.io/blog/building-a-live-mdx-playground-with-codemirror-and-nextjs, multiple MDX discussions

The mdxblog tutorial and the MDX.js playground both debounce compilation. Specific timing values are not disclosed, but the pattern is: wait N milliseconds after the last keystroke before recompiling. Typical values for code editors: 200-500ms debounce.

The compilation itself involves: unified parse (micromark) → remark AST → rehype AST → JavaScript code generation → function evaluation. For a typical MDX document, this is not instantaneous but completes within hundreds of milliseconds on modern hardware.

### Finding: MDX does NOT support incremental/partial compilation
**Confidence:** CONFIRMED
**Evidence:** https://mdxjs.com/packages/mdx/, https://fumadocs.dev/docs/mdx/performance

MDX compilation is all-or-nothing. The entire document must be recompiled on every change. There is no mechanism to recompile only the changed paragraph or component. The unified pipeline (parse → transform → stringify) processes the full document each time.

Fumadocs addresses build-time performance via on-demand compilation (only compile requested pages), but this doesn't help with live preview where the same document is recompiled repeatedly.

For live preview, the implication is: debounce + full recompile on every edit. Performance depends on document size, number of remark/rehype plugins, and browser JavaScript engine speed.

### Finding: Custom component rendering in preview requires a component registry
**Confidence:** CONFIRMED
**Evidence:** https://www.mdxblog.io/blog/building-a-live-mdx-playground-with-codemirror-and-nextjs, https://mdxjs.com/packages/mdx/

The preview panel needs to know about custom components used in the MDX. Two approaches:

1. **Component props:** Pass components via the `components` prop on the evaluated MDXContent:
   ```jsx
   <MDXContent components={{ Card, Alert, Tabs }} />
   ```

2. **MDXProvider:** Use MDXProvider to make components available in context.

In a documentation system, components are known at build time (they are the documentation framework's component library). The preview panel bundles these components and makes them available. Components imported via `import` statements in MDX CANNOT be resolved in browser-only compilation (no module resolution), but components passed via the registry CAN be used.

### Finding: Error handling requires try/catch around evaluate() + React error boundaries
**Confidence:** CONFIRMED
**Evidence:** https://mdxeditor.dev/editor/docs/error-handling, MDX troubleshooting docs

MDX syntax errors during typing are inevitable — the document is in an incomplete/invalid state while the user is mid-edit. Error handling strategy:

1. **Compilation errors (try/catch):** Wrap evaluate() in try/catch. When MDX has syntax errors, the compiler throws. Show the last successfully rendered preview, display the error in a status bar or overlay. The MDX compiler provides error messages with line/column positions.

2. **Runtime errors (error boundaries):** Even syntactically valid MDX can cause runtime errors (e.g., undefined component). React error boundaries catch these during rendering.

3. **Graceful degradation:** While the user is typing, show stale preview (last successful compile). Update only when compilation succeeds. This avoids flashing error states on every keystroke.

The MDX.js playground itself has a known CodeMirror crash bug (issue #1791) where the editor crashes sporadically, suggesting that error handling in the official implementation could be improved.

### Finding: Browser compilation has limitations compared to build-time compilation
**Confidence:** CONFIRMED
**Evidence:** https://github.com/orgs/mdx-js/discussions/2220, https://mdxjs.com/packages/mdx/

Limitations of browser-side evaluate():
- **No import resolution:** `import { Card } from './components'` cannot be resolved in the browser. Components must be pre-registered.
- **No bundler plugins:** Webpack/esbuild/Rollup plugins (image optimization, CSS modules, etc.) don't run in the browser.
- **Performance:** Full compilation is slower in the browser than at build time, though still sub-second for typical documents.
- **Bundle size:** @mdx-js/mdx brings unified, remark, rehype, and acorn to the client — significant bundle overhead.

For a documentation preview, these limitations are acceptable: documentation components are known and pre-registered, no complex bundler transforms are needed, and sub-second compilation is fast enough with debouncing.

---

## Summary: Live Preview Architecture

```
User types in CodeMirror
         |
         v
   Debounce (200-500ms)
         |
         v
  evaluate(source, { runtime, components })
         |
    ┌────┴────┐
    |         |
  Success   Error
    |         |
    v         v
 MDXContent()  Show error in status bar
    |          Keep last successful render
    v
 React renders preview panel
 (using pre-registered components)
```

---

## Gaps / follow-ups

* Specific compilation timing benchmarks (ms per KB of MDX) would be valuable but were not found in public sources
* The function-call workaround for React reconciliation (MDXContent(props) instead of <MDXContent />) needs empirical validation for complex documents
* Impact of remark/rehype plugins on compilation time is undocumented
