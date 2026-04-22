---
title: "Option E Implementation Leverage — Research Findings"
description: "What utilities Open Knowledge can borrow (fumadocs, own infra, npm) to build V2 perf's Option E (static Suspense fallback) without hand-rolling a markdown→React pipeline. Concludes: full-fidelity path is ~2.5 days using mdast-util-to-hast + hast-util-to-jsx-runtime; rejects @mdx-js/mdx evaluate() and @fumadocs/mdx-remote."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - Open Knowledge editor Option E (Suspense fallback)
  - Fumadocs ecosystem reusability
  - unified / mdast / hast ecosystem
  - Markdown → React pipeline architecture
topics:
  - Option E shape selection (full-fidelity / hybrid / plain-markdown)
  - componentMap design
  - Existing-infra reuse (packages/core/src/markdown/)
  - Bundle impact for Option E fallback chunk
---

# Option E Implementation Leverage — Research Findings

**Date:** 2026-04-20
**Worktree:** `.claude/worktrees/playwright-stability`
**Research agent:** general-purpose Opus subagent with `/explore` skill

---

## Executive summary

**Ship full-fidelity Option E via the unified/mdast/hast pipeline, NOT `@mdx-js/mdx`'s `evaluate()`.** Open Knowledge already owns every piece needed — `packages/core/src/markdown/pipeline.ts` produces `mdxJsxFlowElement`/`mdxJsxTextElement` mdast nodes through `remarkMdxAgnostic`, `mdast-util-to-hast@13.2.1` has a `passThrough` option that preserves those nodes into hast, and `hast-util-to-jsx-runtime@2.3.3` (already installed transitively) renders them via a `components` map with native `mdxJsxFlowElement` handling (`node_modules/hast-util-to-jsx-runtime/lib/index.js:142-144, 670-712`). The componentMap is verbatim-portable from `docs/src/mdx-components.tsx:11-26`. **Net effort: ~2.5 focused dev-days**; no new parser, no eval, no Function-constructor.

---

## Existing prior-art reports (most informative)

- `reports/fumadocs-full-pipeline/REPORT.md` — establishes `defaultMdxComponents` as a plain object (line 15-36 of `node_modules/fumadocs-ui/dist/mdx.js`); confirms `@fumadocs/mdx-remote/client` uses `executeMdx` via Function-constructor (dynamic.js:21, 49-51); MDX compilation has `bundler` (build-time) and `runtime` (function-body eval) modes.
- `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md` — rejects `@fumadocs/mdx-remote` as architecturally wrong (500 KB + Function-constructor eval); names three concrete issues for embedding fumadocs components: CSS variable bridge, `fumadocs-core/link` shim, Tabs `groupId` cross-instance sync. Provides the spec amendments we'd need (§5.1-5.3).
- `reports/mdx-text-editor-preview-approach/REPORT.md` — documents `@mdx-js/mdx`'s `evaluate()` React-reconciliation pitfall (must call `MDXContent(props)` as function, not JSX element, to avoid full component remount per compile).
- `reports/fumadocs-stack-reusability-deep-analysis/REPORT.md` — pattern-copy over import-as-dep for fumadocs-ui components.

**Takeaway:** Runtime markdown-to-React splits into two camps: (a) `@mdx-js/mdx` `evaluate()` for full MDX with `import`/`export`/JS-expression support, or (b) a walker pipeline (mdast-util-to-hast → hast-util-to-jsx-runtime) when inputs are already-parsed mdast. OK's pipeline produces mdast; option (b) is the natural fit with zero eval overhead.

---

## Fumadocs utilities we can borrow

| Utility | File | What it gives us | Compat |
|---|---|---|---|
| `defaultMdxComponents` | `node_modules/fumadocs-ui/dist/mdx.js:15-36` | Plain object: `{pre, Card, Cards, a, img, h1-h6, table, Callout, CalloutContainer, CalloutTitle, CalloutDescription, CodeBlockTab*}` | Direct import. `fumadocs-core/link` import needs Vite alias → plain `<a>`. |
| Individual components | `fumadocs-ui/components/{accordion,tabs,steps,card,files,type-table,image-zoom}` | Real components for the 18-component target set | H2 probe confirms standalone rendering. |
| `docs/src/mdx-components.tsx:11-26` `getMDXComponents()` | `docs/src/mdx-components.tsx` | The exact componentMap docs-site uses | **Portable as-is.** Copy to `packages/app/src/editor/componentMap.ts`. |
| `@fumadocs/mdx-remote` executeMdx | `fumadocs-mdx/dist/runtime/dynamic.js` | Runtime MDX compile | **REJECT.** Node-only (`fs`, `pathToFileURL`); 500 KB. Not needed — we have parsed mdast. |
| `fumadocs-core/source` | — | SSG routing | **REJECT.** Build-time, irrelevant. |

---

## Open Knowledge existing infra we can reuse

| Code path | File | What it gives | Adaptation |
|---|---|---|---|
| `markdownToHtml(md)` | `packages/core/src/markdown/mdast-to-html.ts:155-172` | Markdown string → HTML using editor's exact parse chain + URL sanitization | **Swap one line:** replace `rehype-stringify` with `hast-util-to-jsx-runtime` at the tail. |
| `mdastToHtml(tree)` | Same file, `:126-141` | Same for already-parsed mdast | Same swap. |
| `createParseProcessor` / `parseMd` | `packages/core/src/markdown/pipeline.ts:127, 200` | Full `remark-parse + remark-frontmatter + remarkMdxAgnostic + remark-gfm + remarkWikiLink + protectFromMdx/restoreFromMdx + merged-walker` chain, processor-cached | **Use as-is.** Parse to mdast, branch off before PM conversion. |
| `customNodeHandlers` | `packages/core/src/markdown/mdast-to-hast-handlers.ts:175-187` | Current `mdxJsx → <pre>`, `wikiLink → <a>`, `rawMdxFallback → <pre>` | **Replace ONLY the mdxJsx handlers with passThrough.** Keep `wikiLink`/`rawMdxFallback` for graceful fallback of unknown components. |
| `remarkMdxAgnostic` | `packages/core/src/markdown/remark-mdx-agnostic.ts` | Agnostic MDX → `mdxJsxFlowElement` mdast | **Use as-is** — same parse surface as editor. |
| `remarkWikiLink` | `packages/core/src/markdown/wiki-link-micromark.ts` | Wiki-link tokenizer | **Use as-is.** |
| R23 `protectFromMdx` | `packages/core/src/markdown/autolink-void-html-guard.ts` | Crash-class byte guard | **Use as-is.** |
| Registry descriptors (CB-v2 planned) | `specs/2026-04-14-component-blocks-v2/SPEC.md` FR-8 | 18 descriptors (16 fumadocs-ui + Mermaid + Audio) | **Not yet built (Draft status).** If Option E ships before CB-v2, use docs-site componentMap. If after, consume `packages/core/src/registry/built-ins.ts`. |

**Key architectural observation:** OK's pipeline already emits `mdxJsxFlowElement` mdast nodes. The editor branches these into PM atoms; Option E branches the same tree into React via hast + componentMap. **Two consumers of one parse — byte-identical fidelity guaranteed.**

---

## npm ecosystem candidates

| Package | Installed? | Runtime-browser | componentMap | Size | Verdict |
|---|---|---|---|---|---|
| `hast-util-to-jsx-runtime@2.3.3` | **Yes (transitive)** | Yes — pure walker, no eval | **Native mdxJsx support** via `findComponentFromName` resolving against `state.components[name]` (lib/index.js:670-712) | ~25 KB | **USE — the core utility.** |
| `mdast-util-to-hast@13.2.1` | Yes | Yes | `passThrough: ['mdxJsxFlowElement','mdxJsxTextElement']` (lib/state.js:145-147) | ~35 KB | **USE.** |
| `remark-rehype@11.1.2` | Yes (core dep) | Yes | Wraps mdast-util-to-hast; identical Options shape | ~5 KB | **USE.** OK already uses it. |
| `@mdx-js/mdx@3.1.1` | Yes (transitive) | Via `evaluate()`/`run()` | Via compiled `components` prop | ~500 KB (acorn+estree) | **REJECT.** Overkill for already-parsed mdast; Function-constructor eval; React-reconciliation pitfalls. |
| `@mdx-js/react` | No | — | MDXProvider | — | **Skip.** Not useful without pre-compiled MDX modules. |
| `react-markdown` | No | Yes | **HTML intrinsics only** — no custom JSX name support | ~45 KB | **REJECT.** Can't render `<Callout>`/`<Tabs>` by name. |
| `marked@16.4.2` | Yes | Yes | Different parser; no mdxJsx | ~45 KB | **REJECT.** Diverges from editor parse. |
| `@fumadocs/mdx-remote` | No | Partial | Via `components` | 500 KB+ | **REJECT** per prior-art verdict. |
| `next-mdx-remote(-client)` | No | Yes via `@mdx-js/mdx` | Via `components` | 500 KB+ | **REJECT.** Same category; original unmaintained. |

---

## Effort estimate for each of the 3 Option E shapes

### Plain-markdown (~1 day)
New: `packages/app/src/editor/mdast-to-react.ts` wiring `createParseProcessor`-clone → `remark-rehype` → `toJsxRuntime` with minimal HTML-only components + JSX-as-placeholder handlers. Extend `EditorSkeleton` to accept `markdown` prop.

**Risk:** Layout shift on hydration.

### Hybrid (~1.5 days)
Plain-markdown + per-component sized skeletons in `packages/app/src/components/fallback/*.tsx`. Match Callout/Tabs/Steps heights via measured CSS.

**Risk:** Skeleton maintenance under theme changes.

### Full-fidelity (~2.5 days) — RECOMMENDED
Hybrid shape + **one-line change**: add `passThrough: ['mdxJsxFlowElement','mdxJsxTextElement','wikiLink']` to `remarkRehype`, and pass the real `getMDXComponents()` to `toJsxRuntime`. `hast-util-to-jsx-runtime` resolves `<Callout>` against the map natively. Add `fumadocs-ui`/`fumadocs-core` to `packages/app/package.json`, shim `fumadocs-core/link` → `<a>` via Vite alias, apply CSS-variable bridge via `<div className="fd">` + global `fumadocs-ui/style.css` import (code-split into fallback chunk).

**Risks:** CSS-var scoping; +200 KB bundle (code-split, amortized); Mermaid carve-out (render placeholder, defer mermaid to post-hydration).

---

## Recommended shape — Full-fidelity

**Rationale:**
1. `hast-util-to-jsx-runtime` is already installed; its MDX JSX handling is production-grade (used by MDX's own React runtime). No new deps in the critical path.
2. Full-fidelity costs ~1.5 extra days vs plain-markdown; buys "zero visible swap" — Option E's whole reason for existing.
3. **Byte-identical parse surface** — using OK's own pipeline modules guarantees the fallback parses markdown the same way the editor will post-hydration. Stronger fidelity guarantee than any npm library can provide.
4. Forward-compatible with CB-v2: swap the componentMap module when `built-ins.ts` lands; single-file change.
5. No eval, no Function-constructor, no `new AsyncFunction()`. Production-safe tree walker.

**Implementation sketch:**
```ts
// packages/app/src/editor/mdast-to-react.ts (~80 lines)
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import { remarkMdxAgnostic } from '@inkeep/open-knowledge-core/markdown/remark-mdx-agnostic';
import { remarkWikiLink } from '@inkeep/open-knowledge-core/markdown/wiki-link-micromark';
import { protectFromMdx, restoreFromMdx } from '@inkeep/open-knowledge-core/markdown/autolink-void-html-guard';
import { getMDXComponents } from './componentMap'; // portable copy of docs/src/mdx-components.tsx

export function markdownToReact(md: string): React.ReactElement {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdxAgnostic)
    .use(remarkGfm)
    .use(remarkWikiLink)
    .use(restoreFromMdx)
    .use(remarkRehype, {
      passThrough: ['mdxJsxFlowElement', 'mdxJsxTextElement', 'wikiLink'],
    });
  const hast = processor.runSync(processor.parse(protectFromMdx(md)));
  return toJsxRuntime(hast, { Fragment, jsx, jsxs, components: getMDXComponents() });
}
```

---

## Open questions

1. **MDX expression attrs** (`<Callout title={expr}>`) — agnostic mode preserves as string; fallback renders literal. Acceptable for ~950 ms Suspense window vs blank skeleton.
2. **CSS variable bridge** — simplest path is global `fumadocs-ui/style.css` + `<div className="fd">` wrapper. Probe needed to confirm no Tailwind-scope leakage.
3. **First-byte markdown source** — Option E needs bytes BEFORE Y.Doc sync. `/api/document?docName=X` already exists. Piggyback on fetch OR kick parallel fetch in `sync-promise.ts`.
4. **Bundle-split boundary** — `React.lazy(() => import('./EditorSkeleton'))` + Vite chunking. Measure that the fallback chunk doesn't land on critical path.
5. **Mermaid carve-out** — render placeholder in fallback (1.5 MB mermaid dep loaded post-hydration only).
6. **CB-v2 alignment** — registry's `Map<string, JsxComponentDescriptor>` uses the same component names as the docs componentMap; zero conflict, just a single-file swap when CB-v2 ships.
7. **Perf instrumentation** — add `ok/render/fallback` mark per precedent #24 since TTI attribution shifts.

---

## Files referenced (absolute paths)

**OK codebase:**
- `packages/core/src/markdown/pipeline.ts` (L127-216)
- `packages/core/src/markdown/mdast-to-html.ts` (L126-172)
- `packages/core/src/markdown/mdast-to-hast-handlers.ts` (L175-187)
- `packages/core/src/markdown/remark-mdx-agnostic.ts` (L22-50)
- `packages/core/src/markdown/autolink-void-html-guard.ts`
- `packages/core/src/markdown/wiki-link-micromark.ts`
- `packages/app/src/editor/Callout.tsx`
- `packages/app/src/components/EditorSkeleton.tsx`
- `docs/src/mdx-components.tsx` (L11-26)
- `docs/src/app/docs/[...slug]/page.tsx`

**node_modules (cited implementations):**
- `node_modules/fumadocs-ui/dist/mdx.js` (L15-36)
- `node_modules/fumadocs-mdx/dist/runtime/dynamic.js` (L21, 49-51)
- `node_modules/@mdx-js/mdx/lib/evaluate.js`
- `node_modules/@mdx-js/mdx/lib/run.js`
- `node_modules/hast-util-to-jsx-runtime/lib/index.js` (L142-144, 260-286, 670-712)
- `node_modules/mdast-util-to-hast/lib/state.js` (L145-147)

**Specs:**
- `specs/2026-04-19-perf-diagnostic-toolkit/evidence/s1-diagnosis.md`
- `specs/2026-04-14-component-blocks-v2/SPEC.md`
- `specs/2026-04-07-docs-component-parity/SPEC.md`

**Prior-art reports:**
- `reports/fumadocs-full-pipeline/REPORT.md`
- `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md`
- `reports/mdx-text-editor-preview-approach/REPORT.md`
- `reports/fumadocs-stack-reusability-deep-analysis/REPORT.md`
