# Evidence: D6 — Frontmatter Handling

**Dimension:** D6 — YAML frontmatter implementation pattern
**Date:** 2026-04-07
**Sources:** @tiptap/markdown v3 test results, marked tokenizer API, remark-frontmatter source

---

## Key files referenced

- @tiptap/markdown test output showing frontmatter destruction
- `marked` v17 tokenizer extension API — `marked.use({ extensions: [...] })`
- `@tiptap/markdown/src/MarkdownManager.ts` lines 178-231 — custom tokenizer registration
- https://github.com/remarkjs/remark-frontmatter — reference implementation
- https://www.npmjs.com/package/marked-hook-frontmatter

---

## Findings

### Finding: All three markdown ecosystems destroy frontmatter without explicit handling
**Confidence:** CONFIRMED
**Evidence:** @tiptap/markdown v3 test result

Input:
```markdown
---
title: Test
date: 2024-01-01
tags:
  - one
  - two
---

# Hello
```

Output from @tiptap/markdown v3:
```markdown
---

title: Test
date: 2024-01-01
tags:

- one
- two

---

# Hello
```

The `---` lines are parsed as `<hr>` (horizontal rules). The YAML content between them is parsed as regular markdown: `title: Test` becomes a paragraph, `tags:` becomes a paragraph, `- one` becomes a list item.

### Finding: The "strip before parse, re-prepend on serialize" pattern is the universal approach
**Confidence:** CONFIRMED

Every system that handles frontmatter uses this pattern:
- **remark-frontmatter:** Adds a `yaml` node type to the MDAST that captures the raw YAML string, then re-emits it on stringify
- **marked-hook-frontmatter:** A marked extension hook that intercepts the input before tokenization
- **gray-matter:** A standalone library that strips frontmatter and returns `{ data, content }`

For @tiptap/markdown v3, the implementation pattern is:

```typescript
import matter from 'gray-matter';

// Before parse:
const { data: frontmatter, content: body } = matter(markdownString);
const json = manager.parse(body);

// On serialize:
const serializedBody = manager.serialize(json);
const output = matter.stringify(serializedBody, frontmatter);
```

Alternative: Use a custom `marked` tokenizer to capture frontmatter as a custom token, then a custom TipTap node to store it:

```typescript
// Custom tokenizer registered via markdownTokenizer
const frontmatterTokenizer = {
  name: 'frontmatter',
  level: 'block',
  start: (src) => src.indexOf('---') === 0 ? 0 : -1,
  tokenize: (src) => {
    const match = src.match(/^---\n([\s\S]*?)\n---\n/);
    if (match) {
      return { type: 'frontmatter', raw: match[0], text: match[1] };
    }
  }
};
```

### Finding: Stripped-and-re-prepended frontmatter survives byte-identical
**Confidence:** INFERRED

Since the frontmatter string is never modified (it's captured as a raw string and re-prepended verbatim), the only potential issue is:
1. Trailing newline handling at the boundary between frontmatter and content
2. `gray-matter` normalizing the YAML (e.g., quote style, key ordering)

Using `gray-matter` with `stringify()` may reformat YAML. Using raw string capture (`match[0]`) preserves the original frontmatter byte-identical.

**Recommendation:** Use the raw regex strip approach, not `gray-matter`'s stringify, to guarantee byte-identical frontmatter round-trip.

---

## Gaps / follow-ups

- Need to verify that the custom marked tokenizer approach works when frontmatter contains `---` on a line (e.g., in a YAML string value)
- gray-matter vs raw regex: edge case testing needed
