# Evidence: D9 — Build-time vs Runtime Component Resolution

**Dimension:** Component rendering at build time vs runtime
**Date:** 2026-04-03
**Sources:** fumadocs repo source code

---

## Key files referenced

- `packages/mdx/src/loaders/mdx/build-mdx.ts` — build-time compilation
- `packages/mdx/src/runtime/dynamic.ts` — runtime compilation
- `packages/mdx-remote/src/render.ts` — executeMdx runtime
- `packages/mdx/src/runtime/browser.tsx` — client-side loading
- `packages/mdx/src/runtime/server.ts` — server-side entry collection

---

## Findings

### Finding: Components are resolved at RUNTIME, not build time
**Confidence:** CONFIRMED
**Evidence:** MDX compilation at build time produces JavaScript code that calls `_jsx(ComponentName, props)`. The component names are resolved when the compiled module is executed — which is at runtime (server render time in RSC, or client render time for client components).

The compiled MDX output (from `createProcessor` with `outputFormat: 'program'`) is an ES module that:
1. Imports from `react/jsx-runtime`
2. Exports a default function that accepts `{ components }` prop
3. Uses `components.ComponentName ?? ComponentName` to resolve — preferring the components prop, falling back to whatever's in scope

This means:
- Built-in HTML elements (h1, p, a, etc.) are resolved via the `components` prop mapping
- Custom components referenced in MDX content are resolved from the `components` prop
- ESM imports in MDX (`import X from 'y'`) are resolved at build time by the bundler

### Finding: If a component is referenced but not found, it throws a runtime error
**Confidence:** CONFIRMED
**Evidence:** Standard MDX behavior — `<MyWidget />` in MDX compiles to `_jsx(MyWidget, {})`. If `MyWidget` is not in the `components` prop and not imported, it throws `ReferenceError: MyWidget is not defined` at render time.

**Implications for visual editor:** An unregistered component referenced in MDX will crash the page. The editor must either:
- Prevent insertion of unregistered components
- Provide a fallback error boundary
- Auto-register components before rendering

### Finding: Dynamic/lazy loading is supported via the `async` and `dynamic` collection options
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/config/define.ts:48-53`

```typescript
export interface DocCollection {
  async?: boolean;   // Load files asynchronously
  dynamic?: boolean; // Compile files on-demand (runtime compilation)
}
```

When `dynamic: true`, MDX is compiled at request time using `@fumadocs/mdx-remote`:

`packages/mdx/src/runtime/dynamic.ts:56-58`:
```typescript
const compiled = await buildMDX(core, collection, {
  environment: 'runtime', // vs 'bundler' for build-time
});
return await executeMdx(String(compiled.value), { baseUrl: pathToFileURL(info.fullPath) });
```

Runtime compilation uses `outputFormat: 'function-body'` instead of `'program'`, and `executeMdx` uses `new AsyncFunction()` to evaluate the compiled code.

### Finding: Client-side lazy loading uses dynamic imports via `createClientLoader`
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/runtime/browser.tsx:85-139`

```typescript
export function createClientLoader(globEntries, options) {
  const loaders = new Map<string, () => Promise<Doc>>();
  // ...
  function getRenderer(path) {
    function Renderer(props) {
      let doc = store.preloaded.get(path);
      doc ??= use(promise ??= getLoader(path)()); // React 19 use()
      return useRenderer(doc, props);
    }
    return (renderers[path] = Renderer);
  }
}
```

This uses React 19's `use()` hook for Suspense-based lazy loading of compiled MDX on the client.

### Finding: The compiled output is a standard ES module — importable and lazy-loadable
**Confidence:** CONFIRMED
**Evidence:** Build-time compilation with `outputFormat: 'program'` produces standard ESM. This means:
- `React.lazy(() => import('./page.mdx'))` works
- Dynamic `import()` works
- The bundler handles code splitting automatically
- Server components can `await import()` for async loading

### Finding: Two compilation environments exist: 'bundler' and 'runtime'
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/config/preset.ts:127`

```typescript
outputFormat: environment === 'runtime' ? 'function-body' : mdxOptions.outputFormat,
```

- `bundler` (build time): `outputFormat: 'program'` — produces ESM, processed by webpack/vite/turbopack
- `runtime` (on demand): `outputFormat: 'function-body'` — produces evaluatable code string, executed via `new AsyncFunction()`

**Implications for visual editor previews:**

For the editor to render component previews, it has three paths:

1. **Build-time bundle + hot reload**: Use the standard bundler pipeline. Editor changes write MDX to disk, file watcher triggers recompilation, bundler HMR updates the preview. This is what Fumadocs' dev server already does.

2. **Runtime compilation**: Use `@fumadocs/mdx-remote` or the `dynamic` collection mode. Compile MDX strings on-the-fly in the browser or server. Components must be passed in scope.

3. **Skip MDX entirely for preview**: The editor renders components directly as React components (it knows the component + props), without going through MDX compilation. MDX is only used for serialization/storage.

---

## Gaps / follow-ups

- Performance of runtime compilation in the browser vs server
- Whether `executeMdx` can accept custom component scope for sandboxed rendering
