# Evidence: Fumadocs Frontmatter Schema

**Dimension:** D1 — Fumadocs frontmatter schema
**Date:** 2026-04-05
**Sources:** OSS source at ~/.claude/oss-repos/fumadocs/ (fumadocs-core, fumadocs-mdx, fumadocs-content, fumadocs-obsidian)

---

## Key files referenced

- `packages/core/src/source/schema.ts` — Zod schema definitions for pageSchema and metaSchema
- `packages/core/src/source/source.ts` — TypeScript interfaces for PageData and MetaData
- `packages/core/src/source/loader/llms.ts` — llms.txt generation, consumes title + description
- `packages/content/src/index.ts` — docsCollection and docsMdxCollection, defaults to pageSchema
- `packages/obsidian/src/utils/schema.ts` — Obsidian-specific frontmatter schema (aliases)
- `packages/mdx/src/config/index.ts` — Re-exports pageSchema as frontmatterSchema
- `packages/mdx/src/loaders/mdx/remark-postprocess.ts` — Auto-populates title from first h1
- `examples/next/source.config.ts` — Example usage of pageSchema and metaSchema

---

## Findings

### Finding: Fumadocs defines a minimal 4-field pageSchema for doc pages
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/schema.ts:19-27`

```typescript
export const pageSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  full: z.boolean().optional(),
  // Fumadocs OpenAPI generated
  _openapi: z.looseObject({}).optional(),
});
```

Only `title` is required. `description`, `icon`, and `full` (full-width layout) are optional. `_openapi` is an internal field for OpenAPI-generated pages.

### Finding: metaSchema defines folder-level metadata (meta.json)
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/schema.ts:6-14`

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

This is for `meta.json` files (folder configuration), not page frontmatter.

### Finding: PageData interface matches the minimal schema
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/source.ts:21-25`

```typescript
export interface PageData {
  icon?: string | undefined;
  title?: string;
  description?: string | undefined;
}
```

### Finding: Fumadocs llms.txt generation uses only title and description
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/source/loader/llms.ts:17-35`

The `llms()` function renders page tree items using `renderName` (from title) and `renderDescription` (from description). No other frontmatter fields feed into llms.txt output.

### Finding: The schema is extensible via Zod — users add fields by extending pageSchema
**Confidence:** CONFIRMED
**Evidence:** `packages/content/src/index.ts:17-19`

```typescript
export function docsMdxCollection<
  FrontmatterSchema extends StandardSchemaV1 | typeof pageSchema = typeof pageSchema,
>(config: DocsMDXCollectionConfig<FrontmatterSchema>) {
  const { options = {}, frontmatter = pageSchema, ...rest } = config;
```

Users pass a custom schema to override the default pageSchema.

### Finding: Obsidian integration adds aliases field
**Confidence:** CONFIRMED
**Evidence:** `packages/obsidian/src/utils/schema.ts:1-8`

```typescript
export const frontmatterSchema = z
  .object({
    aliases: z.array(z.string()).optional(),
  })
  .loose()
  .optional();
```

The `.loose()` call allows arbitrary additional fields to pass through.

### Finding: Title is auto-populated from first h1 heading if not in frontmatter
**Confidence:** CONFIRMED
**Evidence:** `packages/mdx/src/loaders/mdx/remark-postprocess.ts:56-60`

```typescript
const frontmatter = (file.data.frontmatter ??= {});
if (!frontmatter.title) {
  // extracts from first h1 heading
  frontmatter.title = flattenNode(node);
```

---

## Summary table

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| title | string | Yes (or auto from h1) | Page title |
| description | string | No | Page description, feeds llms.txt |
| icon | string | No | Icon identifier for sidebar |
| full | boolean | No | Full-width layout mode |
| _openapi | object | No | Internal: OpenAPI generated data |

---

## Gaps / follow-ups

- Fumadocs does not define tags, slug, draft, date, keywords, or any AI-specific fields in its core schema
- All additional fields must be user-defined via schema extension
- The obsidian package adds `aliases` but nothing else
