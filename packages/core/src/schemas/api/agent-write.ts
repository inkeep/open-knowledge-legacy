import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

import { FRONTMATTER_TYPES, FrontmatterValueSchema } from '../../frontmatter/schema.ts';
import { agentIdentityFields, safeDocNameField, summaryField } from './_shared.ts';

export const AgentWriteRequestSchema = z
  .object({
    docName: safeDocNameField,
    summary: summaryField,
    content: z.string().optional(),
    ...agentIdentityFields,
  })
  .loose() satisfies StandardSchemaV1;
export type AgentWriteRequest = z.infer<typeof AgentWriteRequestSchema>;

export const AgentWriteMdRequestSchema = z
  .object({
    docName: safeDocNameField,
    summary: summaryField,
    markdown: z.string().min(1),
    position: z.enum(['append', 'prepend', 'replace']).optional(),
    ...agentIdentityFields,
  })
  .loose() satisfies StandardSchemaV1;
export type AgentWriteMdRequest = z.infer<typeof AgentWriteMdRequestSchema>;

export const AgentPatchRequestSchema = z
  .object({
    docName: safeDocNameField,
    summary: summaryField,
    find: z.string().min(1),
    replace: z.string(),
    offset: z.number().int().nonnegative().optional(),
    ...agentIdentityFields,
  })
  .loose() satisfies StandardSchemaV1;
export type AgentPatchRequest = z.infer<typeof AgentPatchRequestSchema>;

export const AgentUndoRequestSchema = z
  .object({
    docName: safeDocNameField,
    connectionId: z.string().min(1),
    scope: z.enum(['last', 'session', 'file']).optional(),
    ...agentIdentityFields,
  })
  .loose() satisfies StandardSchemaV1;
export type AgentUndoRequest = z.infer<typeof AgentUndoRequestSchema>;

export const SummaryResponseFieldSchema = z
  .object({
    value: z.string(),
    truncatedFrom: z.number().int().nonnegative().optional(),
    hint: z.string().optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type SummaryResponseField = z.infer<typeof SummaryResponseFieldSchema>;

export const OrphanHintSchema = z
  .object({
    type: z.literal('orphan'),
    parentCandidates: z.array(z.string()),
    message: z.string(),
  })
  .loose() satisfies StandardSchemaV1;
export type OrphanHint = z.infer<typeof OrphanHintSchema>;

export const AgentWriteSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type AgentWriteSuccess = z.infer<typeof AgentWriteSuccessSchema>;

export const AgentWriteMdSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    subscriberCount: z.number().int().nonnegative(),
    systemSubscriberCount: z.number().int().nonnegative(),
    hints: z.array(OrphanHintSchema).optional(),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type AgentWriteMdSuccess = z.infer<typeof AgentWriteMdSuccessSchema>;

export const AgentPatchSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    subscriberCount: z.number().int().nonnegative(),
    systemSubscriberCount: z.number().int().nonnegative(),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type AgentPatchSuccess = z.infer<typeof AgentPatchSuccessSchema>;

export const AgentUndoSuccessSchema = z
  .object({
    docName: z.string().min(1),
    scope: z.enum(['last', 'session']),
    undone: z.boolean(),
  })
  .loose() satisfies StandardSchemaV1;
export type AgentUndoSuccess = z.infer<typeof AgentUndoSuccessSchema>;

export const FrontmatterPatchRequestSchema = z
  .object({
    docName: safeDocNameField,
    patch: z.record(z.string(), z.union([FrontmatterValueSchema, z.null()])),
    types: z.record(z.string(), z.enum(FRONTMATTER_TYPES)).optional(),
    summary: summaryField,
    ...agentIdentityFields,
  })
  .loose() satisfies StandardSchemaV1;
export type FrontmatterPatchRequest = z.infer<typeof FrontmatterPatchRequestSchema>;

export const FrontmatterPatchSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    subscriberCount: z.number().int().nonnegative(),
    systemSubscriberCount: z.number().int().nonnegative(),
    appliedKeys: z.array(z.string()),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type FrontmatterPatchSuccess = z.infer<typeof FrontmatterPatchSuccessSchema>;
