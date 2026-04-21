---
title: "@fumadocs/local-md vs browser-only walker — Option E architecture decision"
description: "Source-level + empirical evaluation of @fumadocs/local-md@0.1.1 as a Node-path renderer for V2 perf Option E (Suspense fallback). Concludes the prior browser-only walker recommendation stands; local-md's docs claims do not survive contact with OK's agnostic-MDX pipeline."
createdAt: 2026-04-20
updatedAt: 2026-04-20
worktree: ".claude/worktrees/playwright-stability"
probe_dir: "/tmp/ok-perf-validation/mdx-remote-node-path/probe"
local_md_version: "0.1.1"
---

# @fumadocs/local-md vs browser-only walker — Option E architecture decision

**Confidence: HIGH.** Source-read + 8 empirical probes against `@fumadocs/local-md@0.1.1` and a head-to-head with `@fumadocs/mdx-remote@1.4.9` and `next-mdx-remote@6.0.0`.

---

## TL;DR — keep the browser-only walker

**The prior recommendation (custom mdast→React walker, ~200 LoC, +21 KB gzip, in `packages/app/`) stands. `@fumadocs/local-md` is not architecturally superior for OK's Option E.** The two load-bearing claims in the local-md docs do not survive OK's agnostic-MDX architecture:

1. **"No `eval()`"** — TRUE only for `.md` files whose JSX expression attrs carry pre-parsed estree (i.e. acorn-validated). Local-md's `.mdx` path is `new AsyncFunction(compiled)` (`dist/index.js:178-192`), byte-identical to `@fumadocs/mdx-remote` and `next-mdx-remote`. **Comment in source: `Note: unsafe by design`** (line 180).
2. **"More comprehensive & robust than mdx-remote"** — TRUE for plain markdown (additional `.md` path); FALSE for OK because OK's agnostic mdast (`remarkMdxAgnostic` → `mdxJsxAttributeValueExpression { value: '<raw string>' }` with **no `data.estree`**) cannot feed local-md's renderer. `hast-util-to-jsx-runtime` throws `Cannot handle MDX estrees without createEvaluater` regardless of which executor is configured. To make it work we'd have to re-add acorn parsing (proven in probe-08), which is the exact dependency OK removed for crash-class resistance (R1, R6, R8 in `packages/core/src/markdown/`).

A Node-path renderer would also force OK to ship two different pipelines (Node Hocuspocus + Vite browser SPA), undo the existing fully-browser architecture for Option E specifically, and create an HTTP round-trip on every cold load — adding network latency to a flow whose entire purpose is to cut perceived TTI under a 950 ms budget. **None of this trades for a duplication win**: the docs site (`docs/`) renders DIFFERENT CONTENT than the editor (no shared bytes), and the 85% of `packages/core/src/markdown/` (3,665 LoC) that's OK-specific has no analogue in local-md's pipeline.

The `@fumadocs/mdx-remote`-class rejection in `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md` (April 2026) holds for local-md: same Function-constructor primitive, same architectural mismatch, same conclusion.

---

## Part 1: @fumadocs/local-md — source-level read

### Package shape

```
@fumadocs/local-md@0.1.1                      292 KB on disk
├── dist/index.js                             336 LoC   ← localMd() factory + storage + renderer + compiler
├── dist/js/executor-virtual.js               517 LoC   ← custom estree-walker JS interpreter (.md only)
├── dist/js/executor-native.js                146 LoC   ← new Function() executor
├── dist/node-server-B6Y4uEX1.js              398 LoC   ← chokidar + WebSocket dev server
├── dist/dev/node-client.js                    78 LoC   ← WebSocket client
├── dist/dev/react-client.js                   36 LoC   ← Next.js refresh trigger
├── dist/bin.js                                59 LoC   ← `local-md` CLI
└── dist/shared-CW1eROp1.js                    37 LoC   ← env-var resolution
```

Dependencies: `@mdx-js/mdx ^3.1.1`, `chokidar ^5.0.0`, `commander ^14.0.3`, `estree-util-build-jsx`, `estree-util-to-js`, `hast-util-to-jsx-runtime ^2.3.6`, `remark`, `remark-rehype`, `tinyglobby`, `unified`, `vfile`, `ws ^8.20.0`. Peer deps: `fumadocs-core ^16.8.0`, `react ^19.2.0`, `react-dom ^19.2.0`. Transitively pulls `shiki` (3.8 MB on disk) for syntax highlighting.

**Status:** `0.1.1`. Pre-1.0, single contributor (`fuma-nama`). Not yet referenced by any community project or production codebase I could find.

### `localMd({ dir, frontmatterSchema, metaSchema, mdOptions, mdxOptions, rendererOptions, include })` — what it does

```ts
// dist/index.d.ts:79-104, dist/index.js:269-333
const docs = localMd({ dir: 'content/docs' });
// returns:
//   - devServer(url?)        connects to a separate `local-md dev` WS server
//   - staticSource()         one-shot: returns Source<{files: VirtualFile[]}>
//   - dynamicSource()        async-files + revalidate hooks for live mode
//   - invalidateFile(path)   manual cache invalidation
```

**File discovery:** `tinyglobby.glob` over `**/*.{md,mdx,json}` under `dir`. Per-file build is cached in a module-level `Map` keyed by absolute path. JSON files are validated against `metaSchema` and become `meta` virtual files; markdown files validate frontmatter against `frontmatterSchema` (Zod via `@standard-schema/spec`), default `pageSchema` from `fumadocs-core/source/schema`. Frontmatter parsed by `frontmatter()` from `fumadocs-core/content/md/frontmatter`.

**Markdown compilation** — split by extension at `dist/index.js:248-265`:

| Extension | Compiler | Output | Render time |
|---|---|---|---|
| `.md` | `remark()` + `remark-gfm` + `remark-heading` + `remark-npm` + `remark-code-tab` + user `remarkPlugins` + `remark-structure` → `remark-rehype { passThrough: ['mdxJsxFlowElement','mdxJsxTextElement'] }` + `rehype-code` (Shiki) + user `rehypePlugins` + `rehype-toc` | `{ type:'ast', tree: hast }` | `toJsxRuntime` with `createEvaluater` injecting the configured executor |
| `.mdx` | `Mdx.createProcessor({ outputFormat: 'function-body', development: false })` + same fumadocs preset | `{ type:'js', code: string }` | `new AsyncFunction(...keys, code)(...values)` — **HARDCODED, not swappable** |

The render path bifurcates at `dist/index.js:135-174`:

```js
async render(components, userContext) {
  if (compiled.type === "ast") {                    // .md path
    const executor = await getExecutor({...});      // virtual or user-provided
    const evaluater = toEvaluater(executor, ctx);
    function render(tree) {
      return toJsxRuntime(tree, {
        components, development: false,
        createEvaluater() { return evaluater; },
        ...JsxRuntime
      });
    }
    return { toc, body: render(compiled.tree), exports: executor.getExports() };
  }
  // .mdx path: ALWAYS new AsyncFunction(), executor is ignored
  const out = await executeMdx(compiled.code, pathToFileURL(...).href, userContext);
  return { toc: out.toc ?? [], body: JsxRuntime.jsx(out.default, { components }), exports: out };
}
```

The `Note: unsafe by design` comment is on `executeMdx` itself (`dist/index.js:180`).

### The "virtual JavaScript engine" — what it is, what it isn't

`dist/js/executor-virtual.js` is a **517-LoC custom estree visitor** (class `ExpressionSync`) that interprets a subset of JavaScript AST nodes WITHOUT calling `eval()` or `new Function()`. Capabilities:

- ✅ Literals (string/number/boolean/null/regex/bigint/template), Identifier, ThisExpression
- ✅ Arrays, objects, spread, all destructuring patterns (Array/Object/AssignmentPattern, RestElement)
- ✅ Member access (computed + optional chaining), Conditional, Logical (`??`)
- ✅ All unary/binary operators incl. `instanceof`, `in`, bitwise
- ✅ Function/Arrow expressions WITH `this` binding
- ✅ JSX (JSXElement, JSXFragment, JSXAttribute, JSXExpressionContainer, JSXSpreadChild, JSXMemberExpression)
- ✅ ImportDeclaration (no-op), ExportNamedDeclaration, ExportDefaultDeclaration (assigns to internal exports map)
- ✅ Hardened against prototype pollution (`UNSAFE_KEYS = Set('constructor','prototype','__proto__','__defineGetter__')`)
- ❌ **No async/await** (no AwaitExpression visitor)
- ❌ **No class declarations** (`ClassDeclaration` and `FunctionDeclaration` as default-export throw)
- ❌ Synchronous only — comment: `Execute JavaScript with a faked JS engine, limited features but works on workerd.`

This is purpose-built for evaluating MDX expression attributes (`<Callout title={`Hello ${user}`} items={[1,2,3]}>`) at runtime in environments where `new Function()` is forbidden (Cloudflare Workers).

**Critical for OK:** `ExpressionSync.visit(node, context, parent)` requires `node.type` — i.e. a real estree node. The VFile docs comment `not used for MDX files, MDX will always use native JS engine` (`dist/index.d.ts:71-76`) is decisive: the virtual engine cannot help with `.mdx` files. The only path through the virtual engine is `.md` content WHOSE expression attrs already carry estree.

### File watcher

`dist/dev/node-server.js` runs a `WebSocketServer` on a configurable port (default 8000) at path `/_fumadocs_local_md`. `chokidar.watch()` with `ignoreInitial:true`, `followSymlinks:false`, default ignore from `.gitignore` (read at `process.cwd()`). Watch events: `add | addDir | change | unlink | unlinkDir`. Multiple clients can subscribe via the WS protocol (`watchDir(absolutePath)`), and each client's lifecycle ref-counts its dirs.

**Architecture:** `local-md dev -- <user-cmd>` (CLI at `dist/bin.js`) starts the WS server, sets `FD_LOCAL_MD_DEV_SERVER_URL` in env, then spawns the user's command (`next dev`, `vite dev`, etc.) as a child process. The user's app calls `localMd(...).devServer()` which reads the env var and connects via the client.

**Overlap with OK's existing file-watcher** (`packages/server/src/file-watcher.ts`): both use chokidar, both apply `.gitignore` filtering, both broadcast events. OK's emits `DiskEvent` unions (`create | update | delete | rename | conflict`), is integrated with Hocuspocus persistence/reconciliation/shadow-repo, and is owned by the same process. Adopting local-md's dev-server means running TWO chokidar watchers and a WS process alongside Hocuspocus. The clean integration would skip local-md's dev-server and call `localMd(...).invalidateFile(file)` directly from OK's watcher — feasible, but the dev-server and chokidar code in local-md become dead weight.

---

## Part 2: Empirical probes (all in `/tmp/ok-perf-validation/mdx-remote-node-path/probe/`)

| # | What | Result |
|---|---|---|
| 01 | Render H2 composition from a `.md` file with default config | **Silent corruption.** Every `<Callout>`, `<Tabs>`, `<Accordions>`, `<Steps>`, `<Cards>`, `<Files>` block is dropped or escaped to literal `&lt;Tabs items=...` text. `[[Page Title]]` becomes literal `[[Page Title]]`. The `.md` parser is plain `remark` — no MDX, no wikiLink. |
| 02 | Same composition as `.mdx` | Works. Components render with props. `[[Page Title]]` still literal. **Render path: `new AsyncFunction()`** (verified). 20 ms compile + 0.2 ms render for 383 bytes. |
| 03 | Inject `remarkMdxAgnostic` into `.md` mdOptions | **Crashes:** `Cannot handle MDX estrees without `createEvaluater``. (`createEvaluater` IS configured by local-md — the error is misleading: it actually means "your mdxJsxAttributeValueExpression has no `data.estree`".) |
| 04 | Dump agnostic-mode mdast shape | Confirms agnostic MDX produces `{ type: 'mdxJsxAttributeValueExpression', value: '<raw string>' }` with **no `data.estree`**. Strict MDX (acorn) is what attaches estree. |
| 05 | `.mdx` with intentionally-broken `<Unclosed` | **Hard crash:** `VFileMessage: Unexpected character '.' (U+002E) ...`. No degraded rendering, no per-block recovery. |
| 06 | Render CLAUDE.md (153 KB) via `.md` path, 5 iterations | compile **avg 242 ms** (cold 596 ms, warm 139 ms; Shiki dominates), render 22 ms, SSR 7 ms — **total ~272 ms**. Note: JSX silently dropped per probe 01. |
| 07 | Same as 03 but with `executorNative` | **Same crash.** Executor is irrelevant — error is at the `hast-util-to-jsx-runtime` layer needing `data.estree`. |
| 08 | Inject acorn-parsing of expression strings (defeating agnostic mode) | **Works.** Components render. But: `<Tabs>` ends up wrapped in `<p>` (block-level JSX inside paragraph), `defaultOpen` triggers React DOM warning, `[[Page Title]]` still passes through as text (needs OK's wikiLink plugin). To match OK's current rendering we'd need to port the entire `packages/core/src/markdown/` invariant set. |

**The decisive empirical fact:** OK's deliberate agnostic-MDX choice (made for crash-resistance per `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md` R1/R6/R8) makes its mdast structurally incompatible with `hast-util-to-jsx-runtime`, which is local-md's render primitive for `.md` files. The only paths around this are (a) re-add acorn (giving up R1's crash class) or (b) use the `.mdx` path which is `new AsyncFunction()` (giving up the no-eval claim, identical to `@fumadocs/mdx-remote`).

### Perf summary (probe 06, 153 KB CLAUDE.md, .md path with rehype-code/Shiki enabled)

| Stage | Min | Avg | Max |
|---|---:|---:|---:|
| compile (parse + remark + remark-rehype + Shiki + toc) | 139 ms | 242 ms | 596 ms |
| render (toJsxRuntime) | 20.4 ms | 22.1 ms | 23.7 ms |
| `react-dom/server.renderToString` | 4.9 ms | 7.6 ms | 13.7 ms |
| **TOTAL** | — | **~272 ms** | — |

For Option E's 950 ms cold-load budget, a Node-path render adds ~270 ms server time + N ms network round-trip + N ms client React reconciliation. The browser walker eliminates the round-trip entirely — `markdownToReact(localMarkdownSnapshot)` runs on the client in single-digit ms once the parse processor is warm.

---

## Part 3: Other runtime-MDX options surveyed

| Package | Version | Render primitive | Verdict |
|---|---|---|---|
| `@fumadocs/mdx-remote` | 1.4.9 | `Reflect.construct(Function, ...)` (`dist/render-CkW9cc29.js:14`) | **Same as local-md `.mdx` path.** 60 KB lib (transitive bundle ~500 KB+ via @mdx-js/mdx + acorn). Already-rejected per `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md`. |
| `@fumadocs/local-md` | 0.1.1 | `new AsyncFunction()` for `.mdx`; virtual estree walker for `.md` (requires data.estree) | **This report's subject.** Same architectural class as `mdx-remote` for OK's content. |
| `next-mdx-remote` | 6.0.0 | `Reflect.construct(Function, keys.concat(compiledSource))` (`dist/rsc.js:25`) | Same Function-constructor pattern, dressed up with Reflect. Maintained by HashiCorp. |
| `@mdx-js/mdx` `evaluate()` | 3.1.1 | `new AsyncFunction()` over compiled MDX | The primitive that all three above wrap. Same code path. |
| `fumadocs-core/content/mdx/preset-runtime` | 16.8.1 | NOT a renderer — just `ProcessorOptions` for `@mdx-js/mdx` runtime mode | Configuration helper, not a new renderer. |
| `@fumadocs/content-collections` | 1.2.2 | Build-time content layer (uses `content-collections`); not a runtime renderer | Out of scope for runtime fallback. |

**Convergent finding:** Every runtime MDX renderer in the npm ecosystem uses `new Function()` / `new AsyncFunction()` / `Reflect.construct(Function, ...)` for the actual MDX execution. The pattern is universal because `@mdx-js/mdx` compiles MDX to a function-body string. There is no production-grade alternative renderer that avoids this primitive for `.mdx` content.

The "virtual JS engine" innovation in local-md is **for the `.md`-with-JSX-expressions case only**, and that case requires upstream estree attachment (i.e. acorn) — which is exactly what OK removed.

---

## Part 4: docs/ pipeline analysis

(Sub-agent audit `docs/`; full report inline above. Summary:)

- **Build-time only**: `docs/source.config.ts:3,8,18` uses `defineDocs` + `defineConfig` from `fumadocs-mdx/config`; `docs/next.config.ts:1,8` wires `createMDX()`. No reference to runtime MDX anywhere.
- **componentMap**: `docs/src/mdx-components.tsx:11` — `getMDXComponents()` spreads `defaultMdxComponents` from `fumadocs-ui/mdx` and adds `Accordion, Accordions, Card, Cards, Image (=ImageZoom), Mermaid, Step, Steps, Tab, Tabs, TypeTable`. Compatible shape with local-md's `render(mdxComponents)` API.
- **Custom MDX plugins**: 3 — `remarkAutoTypeTable` (build-time TypeScript reflection), `remarkMdxMermaid`, `mdxSnippet` (build-time snippet inlining from `_snippets/`). The first and third are **fundamentally build-time** — they read TS sources / FS paths at compile time. A migration to local-md would require runtime equivalents that don't exist.
- **Code path**: `docs/src/app/docs/[...slug]/page.tsx:1-37` — `source.getPage(slug)` → `<MDX components={getMDXComponents()} />` inside `<DocsBody>`. Uses generated `.source/server`.
- **Shared with packages/core**: **None.** Grep for `@inkeep/open-knowledge` across `docs/*.{ts,tsx,js,mjs,json}` finds zero source-level imports (only prose mentions in MDX content + landing-page strings).
- **Different content tree**: docs renders `docs/content/{overview,guides,internals}/*.mdx` — these are documentation MDX files NOT touched by the OK editor. Editor edits user knowledge bases under user-configured `content.dir`. **Two separate content sources, no overlap.**
- **Frontmatter schema**: extends fumadocs `frontmatterSchema` with two optional Zod fields (`sidebarTitle`, `keywords`). Compatible with local-md's `frontmatterSchema` option.
- **Pinned versions**: `fumadocs-core ~16.1.0`, `fumadocs-mdx ~14.0.3`, `fumadocs-ui ~16.1.0`. Slight lag from latest (16.8.1) but no functional drift.

**Migration delta if docs were to adopt local-md:** lose build-time TypeScript reflection (TypeTable), lose build-time snippet inlining, lose static export (`generateStaticParams`), lose Shiki theme switch via build pipeline (move to runtime). The docs site has zero motivation to migrate — it works today, ships static HTML, has no perf problem.

**Conclusion:** local-md does not unify the docs site with the editor's renderer because (a) they render different content, and (b) the docs site's build-time benefits (image opt, type tables, snippets) are real and would regress.

---

## Part 5: packages/core/src/markdown/ — what would (and wouldn't) be eliminated

Sub-agent inventory: 18 source files, 4,326 LoC.

| Bucket | LoC | % | Examples |
|---|---:|---:|---|
| **OK-SPECIFIC** (no off-the-shelf substitute) | 3,665 | 85% | `index.ts` (977), `to-markdown-handlers.ts` (470), `autolink-void-html-guard.ts` (425), `parse-with-fallback.ts` (376), `wiki-link-micromark.ts` (273), `position-slice.ts` (250), `unknown-mdast-guard.ts` (190), `mdast-augmentation.ts` (186), `mdast-to-hast-handlers.ts` (186), `merged-walker.ts` (143), `autolink-promotion.ts` (116), `doc-start-thematic-fix.ts` (80), `ref-def-hoist.ts` (29) |
| **HYBRID** (standard core + OK tweaks) | 622 | 14% | `pipeline.ts` (229), `mdast-to-html.ts` (172), `html-to-mdast.ts` (169), `remark-mdx-agnostic.ts` (52) |
| **REPLACEABLE** (purely generic) | 39 | 1% | `fence-regions.ts` (39) |

**No mdast→React consumer exists today** — the only mdast-out path is `mdast-to-html.ts` (mdast → hast → HTML string for clipboard). The browser walker would be the first.

The 85% specific bucket exists because OK enforces invariants that no general-purpose MDX renderer implements:
- **R23 PUA-sentinel guard** for crash-class autolinks/void HTML/comments (`autolink-void-html-guard.ts`)
- **R6/R8 block-level fallback** for malformed MDX (`parse-with-fallback.ts`)
- **D20 escapeMark** + **gamma `data.sourceRaw`** for round-trip fidelity (`to-markdown-handlers.ts`)
- **Wiki-link `[[Page#Anchor|Alias]]`** syntax (`wiki-link-micromark.ts`)
- **rawMdxFallback** as a first-class mdast type (`unknown-mdast-guard.ts`, `mdast-augmentation.ts`)
- **NG10 doc-start thematicBreak** workaround (`doc-start-thematic-fix.ts`)
- **R17 phase-ordered post-parse walker** (`merged-walker.ts`)

Replacing this with local-md doesn't eliminate any of it — it duplicates the parse layer (now there are two: OK's existing one for the editor + local-md's for the fallback) while gaining nothing about the OK-specific invariants.

---

## Part 6: Architectural shapes — final evaluation

| Shape | Description | Verdict | Confidence |
|---|---|---|---|
| **A** | local-md server-side; HTML response via `/api/render`; fallback `dangerouslySetInnerHTML` | **REJECT.** Forces HTTP round-trip on cold load (eats Option E budget). HTML-only sacrifices interactivity (Tabs/Accordion need client JS). To restore interactivity, second hydration pass required → re-parse on client → defeats the purpose. | HIGH |
| **B** | local-md server-side; React-element-tree response (RSC Flight or `JSON.stringify`+rehydrate) | **REJECT.** RSC requires Next.js runtime; OK editor is Vite SPA (greenfield decision per perf-diagnostic spec). `JSON.stringify` of React elements loses component refs (cannot transmit `Callout` function over wire). next-mdx-remote-style "string source + client compile" still uses Function-constructor on client — same security posture, larger bundle. | HIGH |
| **C** | Shared core markdown-to-React module used by BOTH docs site AND Hocuspocus server | **REJECT for the unified-renderer goal.** Docs site renders different content than editor (probe shows zero shared bytes). Docs site has its own build-time benefits (TypeTable, snippets, static export) that runtime renderers can't replicate. **MAYBE** for moving the walker into `packages/core/src/markdown/` so MCP render-preview / future read-only mode can reuse — that's a packaging decision, NOT an architecture decision, and orthogonal to local-md. | HIGH |
| **D** | **Browser-only walker** (~200 LoC in `packages/core/src/markdown/to-react.ts` + `packages/app/src/components/FallbackDocumentRender.tsx`) | **RECOMMENDED.** Reuses OK's existing parse processor (zero re-implementation), fits Vite SPA architecture, no HTTP round-trip, full fidelity to editor render via shared mdast, +21 KB gzip (one-time, code-split). Forward-compatible with MCP render-preview / read-only mode by hoisting walker into `packages/core/`. | HIGH |
| **E** | Full RSC migration (Next.js / TanStack Start) | **REJECT for Option E specifically.** This is a multi-quarter editor refoundation, not a perf-spec line item. Decoupled from local-md analysis. Worth tracking as a separate spec if Activity-pool + Suspense ergonomics demand it. | HIGH |
| **F** | `@fumadocs/mdx-remote` server-side | **REJECT (already rejected, holds).** Same Function-constructor as local-md `.mdx` path. 500 KB+ bundled-deps footprint. Architectural objections from `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md` re-confirmed by this report. |

**Recommendation: Shape D (browser walker), as previously recommended.** No basis to reverse.

### What would have changed the recommendation

I held a high prior that local-md might warrant reversal. It would have, IF any of:
- ✗ The virtual JS engine could evaluate OK's agnostic-mode mdast natively → it can't (probe 03/07).
- ✗ Local-md's `.mdx` path used something other than Function-constructor → it doesn't (`dist/index.js:178-192`).
- ✗ Local-md provided per-block crash recovery → it doesn't (probe 05).
- ✗ The docs site shared meaningful content with the editor → it doesn't (sub-agent audit).
- ✗ A Node-path renderer eliminated significant duplication → it doesn't (85% of `packages/core/src/markdown/` is OK-specific and unaffected).
- ✗ Migrating docs to local-md was a clear win → it isn't (loses build-time TypeTable/snippets/static-export).

None obtained. The browser walker remains the correct shape.

---

## Part 7: Impact on the V2 perf spec

- **Phase 4.1 / Option E**: Ship the walker per `/tmp/ok-perf-validation/fumadocs-static-fallback/REPORT.md` §"Recommended shape." No change to the recommendation.
- **Decision 1 Alt 5 scope**: No new dependency on `@fumadocs/local-md`. The walker uses `unified` + `remark-*` + `mdast-util-mdx` (already in `packages/core/`) + ~200 net-new LoC.
- **Decision 4 phase topology**: No new server-side render path. Hocuspocus stays focused on CRDT + persistence + file-watcher + MCP. No `/api/render` endpoint needed.
- **Forward-compat for MCP render preview / read-only mode**: Hoist the walker into `packages/core/src/markdown/to-react.ts` so it's importable from any future Node consumer (server-side MCP tool, CLI export-to-static command). The walker is environment-agnostic (no DOM access; pure mdast→React). Same module serves browser AND Node. Note: `react-dom/server.renderToString` adds ~7 ms to push to HTML in a Node consumer if needed.

---

## Part 8: Open questions the spec should track

1. **First-byte markdown source for the fallback.** The walker needs disk bytes BEFORE Y.Doc sync. Options: (a) `/api/document?docName=X` already exists — read live Y.Text. (b) New `/api/disk-bytes?path=X` reads file-watcher's in-memory cache. (c) Piggyback markdown bytes on the same fetch that initiates the Hocuspocus sync. Recommend (b) — guaranteed fastest, deterministic. Spec decision.
2. **Wiki-link rendering in the fallback.** Walker needs `wikiLink` handler (mdast → React `<a>` or `<span>` with optional alias). 5 LoC. Decide: do we resolve the link (page-tree lookup) at fallback render time, or always render as plain anchor? Render-perf budget would suggest plain anchor for the 950 ms window; first hydrated render does the lookup.
3. **`rawMdxFallback` rendering.** Render as `<pre className="raw-mdx">` showing the MDX source — same as the editor's NodeView fallback. Visual continuity. Walker handler ~10 LoC.
4. **MDX expression attrs in the fallback.** OK's agnostic mode preserves expression text but doesn't evaluate. The walker can use `new Function('return (' + raw + ')')()` (same trust model as MDX) OR render `data-attr-expr="<text>"` and skip the eval. Recommend the latter for the fallback specifically (one less eval surface; Suspense window is short enough that visual-only-during-fallback is acceptable). The hydrated editor evaluates normally via TipTap NodeViews.
5. **Mermaid carve-out.** Mermaid's renderer is 1.5 MB. Render placeholder `<div>` in fallback; defer mermaid to post-hydration. Same recommendation as the prior fumadocs-static-fallback report.
6. **Code-block highlighting.** Shiki at fallback time = +500 ms (probe 06). Recommend rendering code blocks with monospace `<pre><code>` only in fallback; Shiki runs post-hydration when the editor wires up.
7. **CSS bridge.** Same `§9.7a` bridge the editor uses (per `specs/2026-04-14-component-blocks-v2/`). Code-split into the fallback chunk.
8. **Probe `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx`** is the reference template for the walker. ~200 LoC. Translate to TypeScript and port into `packages/core/src/markdown/to-react.ts` with handlers matching `mdast-to-hast-handlers.ts`'s `customNodeHandlers` table.

---

## Appendix — probe inventory

```
/tmp/ok-perf-validation/mdx-remote-node-path/
├── REPORT.md                                    (this file)
└── probe/
    ├── package.json                             bun add @fumadocs/local-md@0.1.1 + deps
    ├── content/docs/
    │   ├── h2-composition.md                    H2 composition test (.md)
    │   ├── h2-composition.mdx                   H2 composition test (.mdx)
    │   └── broken.mdx                           Intentionally broken MDX
    ├── content/staging/
    │   └── claude.md                            CLAUDE.md (153 KB) for perf
    ├── probe-01-md-basic.mjs                    P01: silent JSX corruption
    ├── probe-02-mdx-strict.mjs                  P02: .mdx path works, uses AsyncFunction
    ├── probe-03-md-with-agnostic.mjs            P03: agnostic mdast crash
    ├── probe-04-mdast-shape.mjs                 P04: shape diff strict vs agnostic
    ├── probe-05-broken-mdx.mjs                  P05: hard crash, no recovery
    ├── probe-06-large-doc.mjs                   P06: 5-iter perf on 153 KB doc
    ├── probe-07-native-executor.mjs             P07: native executor doesn't fix it
    └── probe-08-acorn-augment.mjs               P08: acorn re-parse makes it work
                                                       (but defeats agnostic-mode purpose)
```

All 8 probes are runnable via `node probe-XX-*.mjs` from the `probe/` directory. No files modified in `packages/`.
