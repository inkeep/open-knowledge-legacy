import { z } from 'zod';

export const FRONTMATTER_TYPES = ['text', 'number', 'boolean', 'date', 'list'] as const;
export type FrontmatterType = (typeof FRONTMATTER_TYPES)[number];

export const FrontmatterTypeSchema = z.enum(FRONTMATTER_TYPES);

export const FrontmatterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
export type FrontmatterValue = z.infer<typeof FrontmatterValueSchema>;

const ISO_8601_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_DATE_RE.test(value);
}

export function inferType(value: FrontmatterValue): FrontmatterType {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (isIsoDateString(value)) return 'date';
  return 'text';
}

export const FrontmatterMapSchema = z.record(z.string(), FrontmatterValueSchema);
export type FrontmatterMap = z.infer<typeof FrontmatterMapSchema>;

export const FrontmatterPatchSchema = z.record(
  z.string(),
  z.union([FrontmatterValueSchema, z.null()]),
);
export type FrontmatterPatch = z.infer<typeof FrontmatterPatchSchema>;
