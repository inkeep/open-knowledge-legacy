# Evidence: Current jsxComponent Architecture

**Dimension:** End-to-end MDX flow through the pipeline
**Date:** 2026-04-13
**Sources:** Codebase exploration

---

## Key files referenced

- `packages/core/src/extensions/jsx-component.ts:11-53` — TipTap extension (atom: true, content: string)
- `packages/core/src/markdown/index.ts:420-468` — mdast→PM handlers for MDX nodes
- `packages/core/src/markdown/index.ts:592-598` — PM→mdast handler (jsxComponent → html node)
- `packages/core/src/markdown/position-slice.ts:187-198` — sourceRaw capture for MDX nodes
- `packages/core/src/markdown/index.ts:122-139` — parseSafe() implementation
- `packages/app/src/editor/observers.ts:436-465` — Observer B error handling
- `packages/server/src/persistence.ts:316-388` — onLoadDocument using parseSafe
- `packages/server/src/agent-sessions.ts:38-74` — syncTextToFragment using parseSafe

## Findings

### Finding: jsxComponent is intentionally opaque — stores raw source, no parsing
**Confidence:** CONFIRMED
**Evidence:** `jsx-component.ts:14` — `atom: true`. Single attr: `content: string` (line 19-22). No component name, no structured props, no children.

### Finding: All MDX node types map to the same jsxComponent block atom
**Confidence:** CONFIRMED
**Evidence:** `index.ts:422-468` — `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression`, `mdxTextExpression`, `mdxjsEsm`, plus all directive types, all create `jsxComponent.createAndFill({ content: sourceRaw })`.

### Finding: jsxInline was specced but never built
**Confidence:** CONFIRMED
**Evidence:** Spec §17.2 line 420 defines `jsxInline (atom; mdxJsxTextElement)`. Current code maps `mdxJsxTextElement → jsxComponent` (block). Test comment at `handlers.mdx.test.ts:57` documents the gap.

### Finding: Serialize path uses html node (verbatim output)
**Confidence:** CONFIRMED
**Evidence:** `index.ts:593-598` — `nodeHandlers.jsxComponent = (pmNode) => ({ type: 'html', value: pmNode.attrs.content })`. remark-stringify emits html values verbatim — no reconstruction.

### Finding: parseSafe provides three-tier fallback
**Confidence:** CONFIRMED
**Evidence:** `index.ts:122-139` — (1) normal parse, (2) retry with { protected, (3) raw text paragraph. Server paths (persistence, agent-sessions) use parseSafe exclusively.
