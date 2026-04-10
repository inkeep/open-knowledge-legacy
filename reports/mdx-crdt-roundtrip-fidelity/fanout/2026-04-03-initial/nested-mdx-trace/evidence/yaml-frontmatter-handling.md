---
title: "Evidence: YAML Frontmatter Handling in Both Pipelines"
pipelines: [plate-slate-yjs, milkdown-prosemirror-yjs]
severity: critical
---

# YAML Frontmatter Handling

## Pipeline A (Plate)

### Parsing

Plate's `deserializeMd()` uses `remarkParse` plus configured plugins. The
`remark-mdx` plugin is added, and `remark-frontmatter` may or may not be
included depending on configuration.

If `remark-frontmatter` IS in the plugin list, the MDAST will contain:
```
yaml { value: "title: Deployment Guide\ntags: [devops]" }
```

### Conversion to Slate

The MDAST type mapping at `plate/packages/markdown/src/lib/types.ts` line 322:
```typescript
yaml: 'yaml',
```

This maps MDAST `yaml` to Plate type `'yaml'`.

However, `defaultRules.ts` at `plate/packages/markdown/src/lib/rules/defaultRules.ts`
contains NO rule for `yaml`. Searching the entire file for "yaml" returns zero
matches in the rules object.

This means `getDeserializerByKey('yaml', options)` returns `undefined`,
and `buildSlateNode()` returns `[]` (empty array).

**Result: YAML frontmatter is silently dropped during deserialization.**

### Serialization

Even if a custom rule were added for deserialization, the serialization path
would need a corresponding rule to emit a MDAST `yaml` node. Without it,
the roundtrip cannot preserve frontmatter.

### If remark-frontmatter is NOT configured

Without `remark-frontmatter`, remark-parse treats `---` as a thematic break
(horizontal rule). The YAML content between the delimiters is interpreted as
markdown content, producing mangled output similar to Pipeline B.

## Pipeline B (Milkdown)

### Parsing

Milkdown's preset-commonmark does NOT include `remark-frontmatter`. Standard
remark parsing interprets the `---` delimiters as `thematicBreak` nodes.

The YAML content `title: Deployment Guide` is parsed as a heading or paragraph:
```
thematicBreak
paragraph/heading  (content depends on exact formatting)
  text { value: "title: Deployment Guide" }
paragraph
  text { value: "tags: [devops]" }
thematicBreak
```

### ProseMirror Representation

The thematic breaks become `horizontal_rule` nodes. The YAML content becomes
text in paragraphs or headings.

### Serialization

On roundtrip, the output would be something like:
```markdown
---

title: Deployment Guide

tags: \[devops]

---
```

The YAML frontmatter is **destroyed beyond recovery**. The brackets in
`[devops]` may be escaped by remark-stringify as `\[devops]` since they
look like link syntax.

## Summary

| Aspect | Pipeline A | Pipeline B |
|--------|-----------|-----------|
| Parsing | Correct if remark-frontmatter configured | Broken: `---` = thematic break |
| MDAST node | `yaml { value: "..." }` | `thematicBreak` + text nodes |
| Editor model | DROPPED (no yaml rule) | Mangled as hr + text |
| Roundtrip | Frontmatter disappears | Frontmatter destroyed and mangled |

Both pipelines fail to preserve YAML frontmatter. Pipeline A fails more
gracefully (clean drop) while Pipeline B produces mangled output.
