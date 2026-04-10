# Evidence: Fumadocs meta.json Folder Metadata System

**Dimension:** D12 — Folder metadata (meta.json/meta.yaml) schema, parsing, PageTree integration, extensibility
**Date:** 2026-04-08
**Sources:** Fumadocs OSS source at ~/.claude/oss-repos/fumadocs/

---

## Key files referenced

- `packages/core/src/source/schema.ts` — Zod schema definition
- `packages/core/src/source/source.ts` — MetaData TypeScript interface
- `packages/core/src/source/page-tree/builder.ts` — PageTree folder() method
- `packages/core/src/source/page-tree/definitions.ts` — PageTree type definitions
- `packages/mdx/src/loaders/meta.ts` — JSON/YAML parser
- `packages/core/src/source/loader.ts` — transformPageTree plugin API
- `packages/mdx/src/config/build.ts` — collection config

---

## Findings

### Finding: meta.json supports 7 strictly-typed fields, no passthrough
**Confidence:** CONFIRMED

Zod schema (packages/core/src/source/schema.ts):
```typescript
export const metaSchema = z.object({
  title: z.string().optional(),
  pages: z.array(z.string()).optional(),
  description: z.string().optional(),
  root: z.boolean().optional(),
  defaultOpen: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  icon: z.string().optional(),
});
```

TypeScript interface (packages/core/src/source/source.ts):
```typescript
export interface MetaData {
  icon?: string | undefined;
  title?: string | undefined;
  root?: boolean | undefined;
  pages?: string[] | undefined;
  defaultOpen?: boolean | undefined;
  collapsible?: boolean | undefined;
  description?: string | undefined;
}
```

No `z.passthrough()` or rest fields. Custom fields cause validation errors.

### Finding: Supports both JSON and YAML formats
**Confidence:** CONFIRMED

packages/mdx/src/loaders/meta.ts: `.json` → `JSON.parse()`, `.yaml` → `load()` from js-yaml. Both produce same MetaData object.

### Finding: meta.json overrides index page frontmatter for folder properties
**Confidence:** CONFIRMED

From builder.ts folder() method:
```typescript
node.icon = metadata.icon ?? node.index?.icon;    // meta wins
node.name = metadata.title ?? node.index?.name;   // meta wins
```

Priority: meta.json > index page frontmatter > generated from folder name.

### Finding: pages array supports 7 syntax patterns for ordering
**Confidence:** CONFIRMED

1. Direct reference: `"page-name"` — specific page/folder
2. Wildcard rest: `"..."` — remaining files ascending
3. Reverse rest: `"z...a"` — remaining files descending
4. Folder extraction: `"...folderName"` — extract children to parent
5. Exclusion: `"!path"` — exclude from rest
6. Separators: `"---Section Title---"` or `"---[Icon]Section---"`
7. External links: `"external:[Icon][Label](url)"`

Default (no pages): alphabetical, index pages first, folders after pages.

### Finding: Missing meta.json → all defaults, folder name as title
**Confidence:** CONFIRMED

When no meta.json exists: all metadata fields undefined, folder title from directory name via `pathToName()`, children sorted alphabetically, index page provides fallback title/icon.

### Finding: Extensible via 3 mechanisms
**Confidence:** CONFIRMED

1. **SourceConfig generic**: `SourceConfig.metaData` can be extended when creating custom Source
2. **PageTree transformers**: `transformer.folder(node, folderPath, metaPath)` can modify folder nodes post-creation
3. **Schema override**: `meta.schema` in collection config accepts custom Zod schema

---

## Gaps / follow-ups

- How does the `root: true` flag interact with multi-root documentation sites?
- Performance of pages array resolution with deep nesting (not benchmarked)
