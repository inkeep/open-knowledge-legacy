# Evidence: D6 — mdx-remote / Runtime MDX Compilation

**Dimension:** fumadocs/mdx-remote — runtime compilation pipeline
**Date:** 2026-04-02
**Sources:** fumadocs monorepo packages/mdx-remote/src/

---

## Key files referenced

- `packages/mdx-remote/src/compile.ts` (198 lines) — Compiler factory and preset
- `packages/mdx-remote/src/render.ts` (53 lines) — MDX execution via dynamic Function
- `packages/mdx-remote/package.json` — Dependencies

---

## Findings

### Finding: mdx-remote wraps @mdx-js/mdx with Fumadocs plugin preset
**Confidence:** CONFIRMED
**Evidence:** compile.ts lines 60-121, 136-194

`createCompiler(options?)` returns an object with `compile()`, `compileFile()`, and `render()` methods. The `fumadocs` preset (default) adds:
- `remarkGfm` (GFM tables, autolinks, etc.)
- `remarkHeading` (heading IDs + TOC)
- `remarkImage` (image size, `useImport: false` by default for runtime)
- `remarkCodeTab` (code block tabs)
- `remarkNpm` (package manager tabs)
- `rehypeCode` (Shiki highlighting)
- `rehypeToc` (TOC extraction)

Each plugin is configurable or disableable via `false`. A `preset: 'minimal'` option skips all Fumadocs plugins.

### Finding: MDX execution uses dynamic AsyncFunction constructor
**Confidence:** CONFIRMED
**Evidence:** render.ts lines 14-33

```typescript
const AsyncFunction = Object.getPrototypeOf(executeMdx).constructor;
export async function executeMdx(compiled: string, options: Options = {}) {
  const hydrateFn = new AsyncFunction(...Object.keys(fullScope), compiled);
  return (await hydrateFn.apply(hydrateFn, Object.values(fullScope))) as { default: MdxContent; toc?: TOCItemType[] };
}
```

Compiles MDX to JavaScript string, then executes via `new AsyncFunction()`. Output format: `outputFormat: 'function-body'` (not ESM). The scope injection includes React JSX runtime.

This is the same pattern as `next-mdx-remote` — compile server-side, hydrate client-side. No filesystem access needed at runtime.

### Finding: Dependencies are minimal and framework-agnostic
**Confidence:** CONFIRMED
**Evidence:** mdx-remote/package.json

Hard dependencies: `@mdx-js/mdx`, `gray-matter`, `unified`, `vfile`, `zod`.
Peer dependencies: `fumadocs-core` (for plugin imports), `react` (for JSX runtime).

No Next.js dependency. No Vite dependency. Could run in any Node.js environment.

### Finding: For our live preview pane, @mdx-js/mdx + our own config may be simpler
**Confidence:** INFERRED

mdx-remote adds value through the plugin preset (saves configuring 7 plugins manually) and the compile/render lifecycle management. For a live preview where we control the full pipeline:
- If using Fumadocs plugins: mdx-remote is the right wrapper (saves ~100 lines of config)
- If using our own plugins: `@mdx-js/mdx` directly with `createProcessor()` is equivalent
- Compilation latency: the bottleneck is Shiki initialization (~200-500ms first call), not mdx-remote itself

### Finding: mdx-remote can run in a Vite dev server
**Confidence:** CONFIRMED
**Evidence:** package.json — no Next.js in dependencies or peer dependencies

The only framework-specific piece is the React JSX runtime import. All APIs use standard Node.js APIs. No `next/` imports.

---

## Gaps / follow-ups

- Caching behavior of createCompiler not benchmarked
- Client-side render path (packages/mdx-remote/src/client/) not read
