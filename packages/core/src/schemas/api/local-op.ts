import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

export const LocalOpOpenRequestSchema = z
  .object({
    dir: z.string().min(1),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpOpenRequest = z.infer<typeof LocalOpOpenRequestSchema>;

export const LocalOpOpenSuccessSchema = z
  .object({
    port: z.number().int().positive(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpOpenSuccess = z.infer<typeof LocalOpOpenSuccessSchema>;

export const LocalOpAuthHostRequestSchema = z
  .object({
    host: z.string().min(1).optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthHostRequest = z.infer<typeof LocalOpAuthHostRequestSchema>;

export const LocalOpAuthPatRequestSchema = z
  .object({
    pat: z.string().min(1),
    host: z.string().min(1).optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthPatRequest = z.infer<typeof LocalOpAuthPatRequestSchema>;

export const LocalOpAuthSetIdentityRequestSchema = z
  .object({
    name: z.string().refine((s) => s.trim().length > 0, { message: 'name must be non-empty' }),
    email: z.string().refine((s) => s.trim().length > 0, { message: 'email must be non-empty' }),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthSetIdentityRequest = z.infer<typeof LocalOpAuthSetIdentityRequestSchema>;

export const LocalOpAuthIdentitySchema = z
  .object({
    name: z.string().min(1),
    email: z.string().min(1),
  })
  .loose()
  .nullable() satisfies StandardSchemaV1;
export type LocalOpAuthIdentity = z.infer<typeof LocalOpAuthIdentitySchema>;

export const LocalOpAuthIdentitySuccessSchema = z
  .object({
    identity: LocalOpAuthIdentitySchema,
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthIdentitySuccess = z.infer<typeof LocalOpAuthIdentitySuccessSchema>;

export const LocalOpAuthStatusSuccessSchema = z
  .object({
    authenticated: z.boolean(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthStatusSuccess = z.infer<typeof LocalOpAuthStatusSuccessSchema>;

export const LocalOpAuthPatSuccessSchema = z
  .object({
    type: z.literal('complete').optional(),
    login: z.string().min(1).optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type LocalOpAuthPatSuccess = z.infer<typeof LocalOpAuthPatSuccessSchema>;

export const LocalOpAuthEmptySuccessSchema = z.object({}).loose() satisfies StandardSchemaV1;
export type LocalOpAuthEmptySuccess = z.infer<typeof LocalOpAuthEmptySuccessSchema>;
