---
title: Current Parser Behavior
description: Confirms the current global remark-mdx parse path, current tolerant recovery seam, and the concrete regression cases that still fail today.
created: 2026-04-13
last-updated: 2026-04-13
---

## Findings

### Finding 1: All documents currently go through a global MDX-aware parse path

**Confidence:** CONFIRMED

The current parse pipeline in [`packages/core/src/markdown/pipeline.ts`](../../../packages/core/src/markdown/pipeline.ts) is:

```ts
remarkParse
remarkFrontmatter
remarkMdx
remarkDirective
remarkGfm
remarkWikiLink
...
```

This means MDX syntax claiming is active for every document that uses `MarkdownManager.parse()`, not just `.mdx` files.

### Finding 2: The parser already contains one narrow tolerant-recovery path for invalid JSX openers

**Confidence:** CONFIRMED

`parseMd()` retries parsing when `micromark-extension-mdx-jsx` throws `unexpected-character` and the character immediately before the reported offset is a literal `<`. The retry protects that single `<` and re-runs the parse.

This is the current fix for cases like `<50ms`.

### Finding 3: Equivalent recovery does not exist for MDX expression parsing or namespaced/JSX collisions

**Confidence:** CONFIRMED

Two focused regressions currently fail in [`packages/core/src/markdown/project-regressions.test.ts`](../../../packages/core/src/markdown/project-regressions.test.ts):

1. Prose containing:

```md
Hocuspocus embeds in Vite via configureServer() + standalone ws.WebSocketServer({ noServer: true }). WebSocket connects on /collab.
```

Current failure:

```txt
Could not parse expression with acorn
```

2. Table cell containing:

```md
| Item | Notes |
| --- | --- |
| A | 1:1s, incidents |
```

Current failure:

```txt
Invalid content for node paragraph: <"1", jsxComponent, ", incidents">
```

### Finding 4: Persistence still turns uncaught parse failures into blank document load

**Confidence:** CONFIRMED

[`packages/server/src/persistence.ts`](../../../packages/server/src/persistence.ts) catches parse failures from `mdManager.parse(body)`, logs:

```txt
[persistence] Failed to parse <documentName> — document will load empty
```

and returns without populating the `Y.XmlFragment`.

This is the concrete blank-document behavior the spec needs to eliminate.

## Implications

- The current issue is architectural, not isolated to one syntax token.
- The parser already acknowledges the need for tolerant recovery, but only for one MDX JSX failure mode.
- Any durable solution must cover at least:
  - invalid JSX opener claiming
  - MDX expression claiming
  - paragraph/table structural invalidation caused by MDX-ish tokenization
