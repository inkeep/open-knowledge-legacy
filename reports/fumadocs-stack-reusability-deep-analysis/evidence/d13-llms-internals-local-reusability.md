# Evidence: D13 — llms.txt Internals Reusability for Local Filesystem Catalog Generation

**Dimension:** Can the Fumadocs llms.txt internals (remarkLLMs, stringifier, llms() index generator, content negotiation) be reused for local filesystem catalog generation?
**Date:** 2026-04-05
**Sources:** fumadocs monorepo (packages/core/src/source/loader/llms.ts, packages/core/src/mdx-plugins/remark-llms.ts, packages/core/src/mdx-plugins/stringifier.ts, packages/core/src/mdx-plugins/remark-llms.runtime.ts, packages/core/src/negotiation/index.ts, packages/mdx/src/runtime/server.ts, packages/mdx/src/loaders/mdx/remark-postprocess.ts, examples/tanstack-start/src/lib/source.ts, examples/tanstack-start/src/routes/llms*.ts, examples/next/app/llms.mdx/docs/[[...slug]]/route.ts, apps/docs/proxy.ts)

---

## Key files referenced

- `packages/core/src/mdx-plugins/remark-llms.ts` (130 lines) -- The remark plugin that converts MDX AST to clean Markdown
- `packages/core/src/mdx-plugins/stringifier.ts` (201 lines) -- Core AST-to-Markdown engine, zero coupling
- `packages/core/src/mdx-plugins/remark-llms.runtime.ts` (44 lines) -- Placeholder renderer (async, supports nested)
- `packages/core/src/source/loader/llms.ts` (100 lines) -- llms.txt index generator, coupled to LoaderOutput + PageTree
- `packages/core/src/negotiation/index.ts` (46 lines) -- Content negotiation utilities (isMarkdownPreferred, rewritePath, getNegotiator)
- `packages/mdx/src/runtime/server.ts` (lines 265-295) -- getText('processed') implementation
- `packages/mdx/src/loaders/mdx/remark-postprocess.ts` (lines 88-94) -- Where remarkLLMs is invoked during MDX compilation
- `examples/tanstack-start/src/lib/source.ts` (lines 21-27) -- getLLMText pattern
- `examples/tanstack-start/src/routes/llms[.]txt.ts` (14 lines) -- Index endpoint
- `examples/tanstack-start/src/routes/llms[.]mdx.docs.$.ts` (21 lines) -- Per-page endpoint
- `examples/tanstack-start/src/routes/llms-full[.]txt.ts` (14 lines) -- Full concatenation endpoint
- `apps/docs/proxy.ts` (22 lines) -- Production Accept-header negotiation middleware

---

## Findings

### Finding: The Fumadocs llms.txt system decomposes into 5 separable functions at 3 abstraction levels
**Confidence:** CONFIRMED
**Evidence:** All source files listed above, traced end-to-end

The system has 3 distinct abstraction levels:

**Level 1 -- Content conversion (per-page):** Takes a single page's MDX AST and produces clean Markdown.
- `defaultStringifier()` (stringifier.ts:91-200) -- Pure function: `(AST, context) => string`. No IO, no side effects.
- `remarkLLMs()` (remark-llms.ts:60-107) -- Remark transformer that configures the stringifier and returns the result. Can be called standalone via `remarkLLMs.call(processor, options)`.
- `renderPlaceholder()` (remark-llms.runtime.ts:12-43) -- Pure async function: `(string, renderers) => Promise<string>`. No IO.

**Level 2 -- Index generation (cross-page):** Takes a collection of pages and produces a site index.
- `llms()` (llms.ts:14-93) -- Takes `LoaderOutput`, walks `PageTree`, produces markdown index. Coupled to LoaderOutput.

**Level 3 -- HTTP delivery (endpoint layer):** Standard Request/Response handlers.
- Route handlers (examples/tanstack-start) -- Thin wrappers calling Level 1 and Level 2 functions, returning `new Response(...)`.
- `isMarkdownPreferred()` / `rewritePath()` (negotiation/index.ts) -- Request inspection utilities.

Each level is independently callable. Level 1 functions have ZERO IO dependency -- they operate on in-memory AST and strings. Level 2 depends on a LoaderOutput (which is framework-coupled). Level 3 depends on HTTP Request/Response objects.

**Implications:** Levels 1 and 3 have clean boundaries. Level 1 is the shared kernel that works for both web serving and local file writing. Level 2 needs replacement for our use case.


### Finding: The per-page content pipeline (remarkLLMs + stringifier) is output-target agnostic
**Confidence:** CONFIRMED
**Evidence:** remark-llms.ts:102-106, stringifier.ts:189-199

The remarkLLMs plugin produces a string:

```typescript
return (node, file) => {
  const value = stringifier.call(this, node, undefined);
  node.children.unshift(toMdxExport(as, value));  // ESM export injection
  if (_data) file.data.markdown = value;           // Direct data access
};
```

Two output paths exist:
1. **ESM export** (default): Injects `export let _markdown = "..."` into the MDX AST. Only useful inside an MDX compiler.
2. **Direct data** (`_data: true`): Stores the string on `file.data.markdown`. Usable in any context.

The actual string generation (`stringifier.call(this, node, undefined)`) is completely independent of how the result is delivered. The same string can be:
- Written to a file on disk (our local catalog use case)
- Returned in an HTTP Response (Fumadocs web serving use case)
- Stored in a database, sent over WebSocket, etc.

The `defaultStringifier()` function itself (stringifier.ts:189-199) returns a pure function `(root: Nodes, ctx: Context) => string` that calls `toMarkdown()` from `mdast-util-to-markdown`. No side effects, no IO, no HTTP, no filesystem.

**Implications:** This is the definitive answer to the core question. The per-page content conversion is a pure `AST -> string` function. It does not know or care whether the string goes to disk or to an HTTP response. Reusable as-is for local catalog generation.


### Finding: The llms() index generator is NOT reusable -- but only ~35 lines to replace
**Confidence:** CONFIRMED
**Evidence:** llms.ts:1-3 (imports), llms.ts:14 (function signature), llms.ts:43-44 (PageTree access)

```typescript
import type { LoaderConfig, LoaderOutput } from '../loader';
import type * as PageTree from '@/page-tree';

export function llms<C extends LoaderConfig>(loader: LoaderOutput<C>, config: LLMsConfig = {}) {
  // ...
  const pageTree = loader.getPageTree(lang);
  // ...
  const page = loader.getNodePage(node, ctx.lang);
```

Three hard couplings to LoaderOutput:
1. `loader.getPageTree(lang)` -- requires the full PageTree builder pipeline
2. `loader.getNodePage(node, lang)` -- requires the page resolution system
3. `loader._i18n` -- requires the i18n configuration

PageTree types (definitions.ts) use `ReactNode` for `name` and `description`, requiring React as a peer dependency for type resolution.

However, the actual output logic is minimal:

```typescript
function onNode(node, indent) {
  switch (node.type) {
    case 'page':     // "- [Title](url): description"
    case 'folder':   // "- FolderName: description\n" + recurse children
    case 'separator': // "- **SectionName**\n"
  }
}
```

For a flat page list `{ title, url, description }[]`, the equivalent is:

```typescript
function generateIndex(pages: { title: string; url: string; description?: string }[]): string {
  return pages.map(p => {
    const desc = p.description?.trim();
    return desc ? `- [${p.title}](${p.url}): ${desc}` : `- [${p.title}](${p.url})`;
  }).join('\n');
}
```

~10 lines for flat, ~35 lines with folder hierarchy support.

**Implications:** Do NOT attempt to reuse llms(). Build from scratch. The coupling to LoaderOutput + PageTree + React types is structural and unnecessary for our flat page inventory.


### Finding: The getLLMText pattern is the reusable template -- and it is trivially adaptable to disk writing
**Confidence:** CONFIRMED
**Evidence:** examples/tanstack-start/src/lib/source.ts:21-27

```typescript
export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
```

This is the per-page content generation function used by ALL endpoints:
- `/llms.txt` -- `llms(source).index()` (does not use getLLMText)
- `/llms-full.txt` -- `source.getPages().map(getLLMText).join('\n\n')`
- `/llms.mdx/docs/:slug` -- `getLLMText(page)` -> Response body

The function signature is `(page) => Promise<string>`. The output is a string. Whether that string becomes `new Response(string)` or `fs.writeFile(path, string)` is a caller concern, not a function concern.

For local catalog generation, the equivalent:

```typescript
async function generatePageCatalogEntry(page: { title: string; url: string; content: string }): Promise<string> {
  const markdown = processContent(page.content); // remarkLLMs stringification
  return `# ${page.title} (${page.url})\n\n${markdown}`;
}

// Web serving:
return new Response(await generatePageCatalogEntry(page));

// Local disk writing:
await fs.writeFile(catalogPath, await generatePageCatalogEntry(page));
```

**Implications:** The shared function exists at the "generate string" level. Both web serving and disk writing call the same function; they differ only in what they do with the returned string.


### Finding: Build-time vs on-change timing does NOT affect reusability of the core functions
**Confidence:** CONFIRMED
**Evidence:** remark-postprocess.ts:88-94 (build-time invocation), remark-llms.ts:60-107 (function definition)

Fumadocs calls remarkLLMs at MDX build time:
```typescript
// In remark-postprocess.ts (runs during MDX compilation)
if (includeProcessedMarkdown) {
  const llms = remarkLLMs.call(this, options);
  llms(tree, file, () => undefined);
}
```

Our product calls it on every content change (Hocuspocus `onStoreDocument`).

The remarkLLMs function is stateless:
- No caching (evidence: negative search in D11 evidence)
- No build-system dependencies (no webpack/vite/rspack references)
- No filesystem access (pure AST transformation)
- No global state mutations
- Synchronous execution (the stringifier is sync; only renderPlaceholder is async)

The function signature is `(tree: Root, file: VFile, done: () => void) => void`. It takes an AST, writes to file.data, and returns. Whether this is called at build time by an MDX compiler or at runtime by a Hocuspocus hook is irrelevant to the function's behavior.

Timing differences and their non-impact:

| Concern | Build-time (Fumadocs) | On-change (our product) | Affects reusability? |
|---------|----------------------|------------------------|---------------------|
| When called | MDX compilation | Hocuspocus onStoreDocument | No -- function is stateless |
| Input format | MDX AST from MDX compiler | MDX AST from remark parse | No -- same AST type (Root) |
| Output target | ESM export in compiled module | file.data.markdown or direct return | No -- use `_data: true` |
| Frequency | Once per build | On every save | No -- no caching, no state |
| Performance budget | Seconds acceptable | Sub-second preferred | Possible concern for large docs, but the stringifier is synchronous and fast |

The only consideration is that we need to construct the AST ourselves. Fumadocs gets it from the MDX compiler pipeline. We would get it from `remark().use(remarkMdx).parse(mdxContent)`. This is standard remark usage -- not a reusability concern.

**Implications:** The timing difference is a non-factor. The same functions work at build time and at runtime. The only operational difference is that we parse MDX ourselves instead of receiving the AST from the MDX compiler.


### Finding: A shared "generate markdown catalog from pages" function is achievable with the existing primitives
**Confidence:** CONFIRMED
**Evidence:** Synthesis of all traced code paths

The shared function that serves both web and local use cases already exists as a composition of existing pieces:

```
Input: { title, url, mdxContent, frontmatter }[]
  |
  v
[Per-page] remark().use(remarkMdx).parse(mdxContent) -> AST
  |
  v
[Per-page] remarkLLMs (via _data: true) -> clean Markdown string
  |
  v
[Per-page] Template: `# ${title} (${url})\n\n${markdown}` -> page entry string
  |
  v
[Cross-page] Assemble: index + entries
  |
  v
Output: string (target-agnostic)
```

This pipeline is already how Fumadocs works internally. The pieces are:
1. `defaultStringifier()` from `fumadocs-core/mdx-plugins` -- IMPORT as-is
2. `remarkLLMs()` from `fumadocs-core/mdx-plugins/remark-llms` -- IMPORT as-is, use `_data: true`
3. `renderPlaceholder()` from `fumadocs-core/mdx-plugins/remark-llms` -- IMPORT as-is
4. Index generator -- BUILD from scratch (~35 lines), because llms() is coupled to LoaderOutput
5. Endpoint handlers / file writers -- BUILD from scratch (thin wrappers, ~20 lines each)

The pieces that differ between web serving and local disk writing:

| Step | Web serving (Fumadocs) | Local disk writing (our product) |
|------|----------------------|--------------------------------|
| Input source | Filesystem MDX files via collections | Y.Doc CRDT -> MDX string via Hocuspocus |
| AST construction | MDX compiler (build-time) | `remark().use(remarkMdx).parse()` (runtime) |
| Stringification | `remarkLLMs` (identical) | `remarkLLMs` (identical) |
| Template | `getLLMText` pattern (identical) | Same pattern (identical) |
| Index generation | `llms(source).index()` (LoaderOutput-coupled) | Custom from flat page list |
| Output delivery | `new Response(string)` | `fs.writeFile(path, string)` |

Rows 3-4 are the same code. Rows 1-2 and 5-6 are inherently different (different input sources, different output targets). Row 5 is a trivial replacement.

**Implications:** There is no need for a new unified "catalog generator" abstraction. The existing remarkLLMs + stringifier + placeholder system IS the shared kernel. Both use cases compose these primitives with their own input/output adapters. The shared kernel is ~375 lines; the per-target adapters are ~35-50 lines each.

---

## Negative searches

* Searched for any filesystem write capabilities in the llms.txt pipeline -> NOT FOUND. The pipeline is purely string-producing; all IO is caller-side.
* Searched for any HTTP/Request coupling in remarkLLMs or stringifier -> NOT FOUND. HTTP coupling exists only in negotiation/index.ts and route handler files.
* Searched for streaming or chunked output support -> NOT FOUND. The stringifier processes the full AST synchronously and returns a single string.
* Searched for any build-system coupling (webpack, vite, turbopack) in remarkLLMs or stringifier -> NOT FOUND. The only build-system integration is in remark-postprocess.ts (the call site, not the function itself).

---

## Gaps / follow-ups

* Performance of `remark().use(remarkMdx).parse()` at runtime (on every Hocuspocus save) vs the MDX compiler path -- not benchmarked. The remark parser is designed to be fast, but we'd be running it more frequently.
* Whether `remark-mdx` alone produces a sufficiently complete AST for remarkLLMs (without the full MDX compiler's additional transforms) -- needs testing. In theory, remark-mdx handles JSX syntax parsing, which is all remarkLLMs needs.
* Memory characteristics when running remarkLLMs on hundreds of documents in rapid succession (Hocuspocus burst saves) -- not measured.
