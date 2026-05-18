import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

export const TagSummaryEntrySchema = z
  .object({
    name: z.string().min(1),
    count: z.number().int().nonnegative(),
    isLeaf: z.boolean(),
  })
  .loose() satisfies StandardSchemaV1;
export type TagSummaryEntry = z.infer<typeof TagSummaryEntrySchema>;

export const TagsListSuccessSchema = z
  .object({
    tags: z.array(TagSummaryEntrySchema),
  })
  .loose() satisfies StandardSchemaV1;
export type TagsListSuccess = z.infer<typeof TagsListSuccessSchema>;

export const TagsDocEntrySchema = z
  .object({
    docName: z.string().min(1),
    title: z.string(),
    matchingTags: z.array(z.string().min(1)),
    snippet: z.string().nullable(),
  })
  .loose() satisfies StandardSchemaV1;
export type TagsDocEntry = z.infer<typeof TagsDocEntrySchema>;

export const TagsForNameSuccessSchema = z
  .object({
    name: z.string().min(1),
    docs: z.array(TagsDocEntrySchema),
  })
  .loose() satisfies StandardSchemaV1;
export type TagsForNameSuccess = z.infer<typeof TagsForNameSuccessSchema>;

export const FolderConfigGetSuccessSchema = z
  .object({
    folder: z.unknown(),
    frontmatter_local: z.record(z.string(), z.unknown()).nullable(),
  })
  .loose() satisfies StandardSchemaV1;
export type FolderConfigGetSuccess = z.infer<typeof FolderConfigGetSuccessSchema>;

export const FolderConfigPutRequestSchema = z
  .object({
    path: z.string(),
    frontmatter: z.record(z.string(), z.unknown()).optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type FolderConfigPutRequest = z.infer<typeof FolderConfigPutRequestSchema>;

export const FolderConfigPutSuccessSchema = z
  .object({
    applied: z.unknown(),
  })
  .loose() satisfies StandardSchemaV1;
export type FolderConfigPutSuccess = z.infer<typeof FolderConfigPutSuccessSchema>;

export const TemplateFrontmatterSchema = z
  .record(z.string(), z.unknown())
  .meta({ description: 'Free-form frontmatter map embedded in template payloads.' });
export type TemplateFrontmatter = z.infer<typeof TemplateFrontmatterSchema>;

export const TemplatePayloadSchema = z
  .object({
    name: z.string().min(1),
    folder: z.string(),
    scope: z.enum(['local', 'inherited']),
    path: z.string().min(1),
    frontmatter: TemplateFrontmatterSchema,
    body: z.string(),
  })
  .strict() satisfies StandardSchemaV1;
export type TemplatePayload = z.infer<typeof TemplatePayloadSchema>;

export const TemplateGetSuccessSchema = z
  .object({
    template: TemplatePayloadSchema,
  })
  .strict() satisfies StandardSchemaV1;
export type TemplateGetSuccess = z.infer<typeof TemplateGetSuccessSchema>;

export const TemplatePutRequestSchema = z
  .object({
    folder: z.string(),
    name: z.string(),
    body: z.string().optional(),
    frontmatter: TemplateFrontmatterSchema.optional(),
  })
  .strict() satisfies StandardSchemaV1;
export type TemplatePutRequest = z.infer<typeof TemplatePutRequestSchema>;

export const TemplatePutSuccessSchema = z
  .object({
    path: z.string().min(1),
    created: z.boolean(),
    warnings: z.array(z.string()),
  })
  .strict() satisfies StandardSchemaV1;
export type TemplatePutSuccess = z.infer<typeof TemplatePutSuccessSchema>;

export const TemplateDeleteSuccessSchema = z
  .object({
    existed: z.boolean(),
    path: z.string().min(1),
  })
  .strict() satisfies StandardSchemaV1;
export type TemplateDeleteSuccess = z.infer<typeof TemplateDeleteSuccessSchema>;

export const SearchRequestSchema = z
  .object({
    query: z.string().optional(),
    intent: z.enum(['autocomplete', 'full_text', 'omnibar']).optional(),
    scopes: z.array(z.enum(['page', 'folder', 'content'])).optional(),
    scope: z.string().optional(),
    limit: z.number().int().nonnegative().optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultEntrySchema = z
  .object({
    kind: z.enum(['page', 'folder', 'content']),
    path: z.string().min(1),
    title: z.string(),
    score: z.number(),
    signals: z.record(z.string(), z.unknown()),
    snippet: z.string().optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type SearchResultEntry = z.infer<typeof SearchResultEntrySchema>;

export const SearchSuccessSchema = z
  .object({
    query: z.string(),
    intent: z.enum(['autocomplete', 'full_text', 'omnibar']),
    results: z.array(SearchResultEntrySchema),
    elapsedMs: z.number().nonnegative(),
  })
  .loose() satisfies StandardSchemaV1;
export type SearchSuccess = z.infer<typeof SearchSuccessSchema>;

export const SkillInstallTargetStateSchema = z
  .object({
    version: z.string().min(1),
    recordedAt: z.string().min(1),
  })
  .loose() satisfies StandardSchemaV1;
export type SkillInstallTargetState = z.infer<typeof SkillInstallTargetStateSchema>;

export const SkillInstallStateSuccessSchema = z
  .object({
    currentVersion: z.string().min(1),
    targets: z.record(z.string(), SkillInstallTargetStateSchema.nullable()),
  })
  .loose() satisfies StandardSchemaV1;
export type SkillInstallStateSuccess = z.infer<typeof SkillInstallStateSuccessSchema>;
