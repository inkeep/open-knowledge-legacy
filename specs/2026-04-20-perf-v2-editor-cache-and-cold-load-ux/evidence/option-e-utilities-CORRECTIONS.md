---
title: "Corrections Appendix — option-e-utilities.md"
description: "Flags the incorrect architectural recommendation in option-e-utilities.md (Opus subagent output). The `hast-util-to-jsx-runtime` + `passThrough` path fails on MDX expression attrs. H2 empirical probe converged on a custom mdast→React walker."
createdAt: 2026-04-20
updatedAt: 2026-04-20
status: correction
supersedes: null
applies_to: evidence/option-e-utilities.md
---

# Corrections Appendix — option-e-utilities.md

**Purpose.** The Opus subagent that produced `option-e-utilities.md` recommended an architectural path that empirical testing (H2 probe) proved partially wrong. This appendix flags the error, preserves the original REPORT for provenance, and points at the correct path verified by H2.

**Status:** `option-e-utilities.md` is retained verbatim for provenance. DO NOT treat it as authoritative on its own. Cross-reference this appendix + `h2-fumadocs-standalone-probe.md` before consuming any architectural recommendation from the original.

---

## The incorrect recommendation

From `option-e-utilities.md` §Recommended shape — Full-fidelity + §Implementation sketch:

> Full-fidelity costs ~1.5 extra days vs plain-markdown; buys "zero visible swap" — Option E's whole reason for existing.
>
> ```ts
> import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
> // ...
> const processor = unified()
>   .use(remarkParse)
>   // ...
>   .use(remarkRehype, {
>     passThrough: ['mdxJsxFlowElement', 'mdxJsxTextElement', 'wikiLink'],
>   });
> const hast = processor.runSync(processor.parse(protectFromMdx(md)));
> return toJsxRuntime(hast, { Fragment, jsx, jsxs, components: getMDXComponents() });
> ```

And in the npm ecosystem table:

> | `hast-util-to-jsx-runtime@2.3.3` | **Yes (transitive)** | Yes — pure walker, no eval | **Native mdxJsx support** via `findComponentFromName` resolving against `state.components[name]` (lib/index.js:670-712) | ~25 KB | **USE — the core utility.** |

## Why it's wrong

**Empirical failure** (H2 probe, `fumadocs-static-fallback/REPORT.md` §"Markdown-to-React pipeline" subsection):

> The existing clipboard path uses `mdast-util-to-hast` + `rehype-stringify`. It cannot be reused as-is for Option E because: [...] **`hast-util-to-jsx-runtime` + `remark-mdx` incompatibility.** The obvious "replace stringify with JSX runtime" path errors with `Cannot handle MDX estrees without createEvaluater` as soon as a JSX attr uses an expression — e.g. `items={['TS', 'JS']}`. The library expects a JS evaluator (it's designed for full MDX where expressions get compiled and evaluated at build time). For a CRDT-stored document where attrs are static data, this is overkill machinery for a problem we don't have. Probe reproduction: `probe/src/MdToReact.tsx` emits this exact error at `screenshots/04-md-render.png` when pointed at the straight hast path.

**Root cause.** The feature `hast-util-to-jsx-runtime` claims for mdxJsx support is real at the `findComponentFromName` layer (the subagent's file:line citations are accurate). But the library's architecture assumes MDX expression attrs have been pre-compiled via `@mdx-js/mdx`'s acorn-based compiler. Our pipeline emits agnostic-mode mdast via `remarkMdxAgnostic` (string-only attrs; expression attrs preserved as `mdxJsxAttributeValueExpression` objects). `hast-util-to-jsx-runtime` hits these and requires a `createEvaluater` function — which we would have to implement by re-wrapping `@mdx-js/mdx`. That's the path we're explicitly avoiding (500 KB + Function-constructor eval).

## The correct path (H2-verified)

Custom mdast→React walker (~200 LoC, reference at `h2-fumadocs-standalone-probe.md` pointing to `/tmp/ok-perf-validation/fumadocs-static-fallback/probe/src/MdToReact2.tsx`). Walker emits `React.createElement(...)` directly from mdast nodes, bypassing hast entirely. For MDX expression attrs, walker uses `new Function(\`return (${raw})\`)` with eval scoped to the walker module (same trust level as MDX authoring).

Pipeline:

```
markdown
  → remark-parse + remark-frontmatter + remark-gfm + remarkMdxAgnostic + remarkWikiLink
  → mdast (with mdxJsxFlowElement nodes)
  → walker: each node type → React.createElement(tag|component, props, ...children)
  → React tree
```

## Other claims in the original REPORT — verification status

| Claim | File:line citation | Verified? |
|---|---|---|
| `mdast-util-to-hast@13.2.1` has `passThrough` option at lib/state.js:145-147 | Yes | UNVERIFIED — did not re-read, but plausible |
| `hast-util-to-jsx-runtime@2.3.3` native mdxJsx support at lib/index.js:670-712 | Yes | **VERIFIED** (feature exists) — but **NOT USABLE** for our case per above |
| `docs/src/mdx-components.tsx:11-26` is the docs-site componentMap | Yes | UNVERIFIED — need to confirm line numbers, but file exists |
| `packages/core/src/markdown/mdast-to-html.ts` has `markdownToHtml()` and `mdastToHtml()` | Yes | UNVERIFIED — file referenced exists per grep |
| `fumadocs-core/link` import needs Vite alias → plain `<a>` | Implicit | UNVERIFIED — claimed but not tested |
| `@fumadocs/mdx-remote` uses Function-constructor at dynamic.js:21, 49-51 | Yes | UNVERIFIED — plausible from prior reports |
| Mermaid carve-out (~1.5 MB) needed | Yes | UNVERIFIED — plausible |

**Safe to consume.** The ecosystem package verdict table (REJECT `@mdx-js/mdx`, REJECT `react-markdown`, REJECT `marked`, REJECT `@fumadocs/mdx-remote`, REJECT `next-mdx-remote`) is independently supported by the prior-art reports cited (`fumadocs-ecosystem-component-blocks-reuse`, `mdx-text-editor-preview-approach`, `fumadocs-full-pipeline`).

**Requires re-verification before implementation.** File:line citations should be re-verified during Phase 4.1 implementation against the actual code at that time (the subagent ran against the worktree state at 2026-04-20; code may shift before implementation sprint).

## Additional drifts flagged by Auditor V5 (2026-04-20)

Post-Audit review of `option-e-utilities.md` surfaced TWO additional architectural claims that H2 empirical probe supersedes but this CORRECTIONS file had not originally flagged. Both are documented here to complete the drift inventory.

### Drift #2 — CSS strategy: REJECT fumadocs-ui/style.css import

**option-e-utilities.md §Recommended shape — Full-fidelity** recommends:
> *"apply CSS-variable bridge via `<div className="fd">` + global `fumadocs-ui/style.css` import (code-split into fallback chunk)"*

**H2 probe §"Why the minimal bridge, not the full style.css"** explicitly REJECTS this with 3 concrete conflicts:
1. `body { background-color: var(--color-fd-background) }` overrides editor-page body styling.
2. `@layer base { *, *::before, *::after { border-color: var(--color-fd-border) } }` globally resets border-color on ALL elements (editor chrome, PropPanel, shadcn primitives).
3. `@variant dark (&:where(.dark, .dark *))` conflicts with OK's `@custom-variant dark (&:is(.dark *))` in globals.css; mixed variant strategies produce incorrect dark-mode scoping.

**Authoritative approach:** use the §9.7a minimal bridge (~80 LoC CSS variable aliases + Steps utility classes + accordion/collapsible keyframes + `@source` directive for Tailwind) + the 1-line Steps fix H2 identified (remove `top: 0` from `.fd-step::before`). SPEC.md §9.3 adopts H2's recommendation — blast radius bounded — but a future reader consuming `option-e-utilities.md` alone would import the wrong CSS.

### Drift #3 — fumadocs-core/link: NO Vite alias needed

**option-e-utilities.md §Fumadocs utilities we can borrow table row for `defaultMdxComponents`** claims:
> *"Direct import. `fumadocs-core/link` import needs Vite alias → plain <a>."*

**H2 probe §"Per-component analysis" Card row** directly contradicts with empirical evidence:
> *"`Card` uses `Link` from `fumadocs-core/link` when `href` prop is set — `Link` falls back to a plain `<a target="_blank">` for external URLs and a next/link-compatible `<a>` otherwise. In a non-Next environment, fumadocs-core `Link` renders a plain `<a>` fine (verified in probe)."*

**Authoritative approach:** no Vite alias needed. `fumadocs-core/link` ships a runtime-check that degrades gracefully in non-Next environments. Importing directly works.

## Lesson for future research-subagent consumption

The Opus subagent produced `option-e-utilities.md` on the strength of source reading + synthesis without an empirical probe to validate the architectural recommendation end-to-end. H2's empirical probe caught the hast-util-to-jsx-runtime error + CSS strategy error + fumadocs-core/link error immediately when it tried to render realistic MDX compositions. **Pattern:** architectural recommendations from research subagents should be validated by a minimal empirical probe before being consumed as load-bearing evidence. This is an instance of the user's standing feedback: *"don't trust agents to synthesize for you, especially on any load bearing facts/information."*

This CORRECTIONS file now flags 3 drifts from the original `option-e-utilities.md`. Consumers: prefer H2 probe + SPEC §9.3 (which adopts H2) over any `option-e-utilities.md` claim that isn't explicitly validated here.
