import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

export const ShareConstructUrlRequestSchema = z
  .object({
    docPath: z.string().min(1),
  })
  .loose() satisfies StandardSchemaV1;
export type ShareConstructUrlRequest = z.infer<typeof ShareConstructUrlRequestSchema>;

export const ShareConstructUrlErrorCodeSchema = z.enum([
  'no-remote',
  'detached-head',
  'branch-not-on-origin',
  'non-github-remote',
  'invalid-path',
]) satisfies StandardSchemaV1;
export type ShareConstructUrlErrorCode = z.infer<typeof ShareConstructUrlErrorCodeSchema>;

export const ShareConstructUrlResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      shareUrl: z.string().min(1),
      blobUrl: z.string().min(1),
      branch: z.string().min(1),
    })
    .loose(),
  z
    .object({
      ok: z.literal(false),
      error: ShareConstructUrlErrorCodeSchema,
      branch: z.string().min(1).optional(),
    })
    .loose(),
]) satisfies StandardSchemaV1;
export type ShareConstructUrlResponse = z.infer<typeof ShareConstructUrlResponseSchema>;

export const SharePublishOwnerKindSchema = z.enum(['user', 'org']) satisfies StandardSchemaV1;
export type SharePublishOwnerKind = z.infer<typeof SharePublishOwnerKindSchema>;

export const SharePublishOwnerSchema = z
  .object({
    login: z.string().min(1),
    kind: SharePublishOwnerKindSchema,
    avatarUrl: z.string().optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type SharePublishOwner = z.infer<typeof SharePublishOwnerSchema>;

export const SharePublishOwnersErrorCodeSchema = z.enum([
  'auth-required',
  'network',
]) satisfies StandardSchemaV1;
export type SharePublishOwnersErrorCode = z.infer<typeof SharePublishOwnersErrorCodeSchema>;

export const SharePublishOwnersResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      owners: z.array(SharePublishOwnerSchema),
    })
    .loose(),
  z
    .object({
      ok: z.literal(false),
      error: SharePublishOwnersErrorCodeSchema,
    })
    .loose(),
]) satisfies StandardSchemaV1;
export type SharePublishOwnersResponse = z.infer<typeof SharePublishOwnersResponseSchema>;

export const SharePublishNameCheckResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      available: z.boolean(),
    })
    .loose(),
  z
    .object({
      ok: z.literal(false),
      error: SharePublishOwnersErrorCodeSchema,
    })
    .loose(),
]) satisfies StandardSchemaV1;
export type SharePublishNameCheckResponse = z.infer<typeof SharePublishNameCheckResponseSchema>;

export const SharePublishVisibilitySchema = z.enum([
  'public',
  'private',
]) satisfies StandardSchemaV1;
export type SharePublishVisibility = z.infer<typeof SharePublishVisibilitySchema>;

export const SharePublishRequestSchema = z
  .object({
    owner: z.string().min(1),
    name: z.string().min(1),
    visibility: SharePublishVisibilitySchema,
    description: z.string().optional(),
  })
  .loose() satisfies StandardSchemaV1;
export type SharePublishRequest = z.infer<typeof SharePublishRequestSchema>;

export const SharePublishErrorCodeSchema = z.enum([
  'name-conflict',
  'saml-sso',
  'auth-required',
  'push-failed',
  'init-failed',
  'network',
  'no-project',
]) satisfies StandardSchemaV1;
export type SharePublishErrorCode = z.infer<typeof SharePublishErrorCodeSchema>;

export const SharePublishResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      ownerLogin: z.string().min(1),
      repoName: z.string().min(1),
      cloneUrl: z.string().min(1),
      defaultBranch: z.string().min(1),
    })
    .loose(),
  z
    .object({
      ok: z.literal(false),
      error: SharePublishErrorCodeSchema,
    })
    .loose(),
]) satisfies StandardSchemaV1;
export type SharePublishResponse = z.infer<typeof SharePublishResponseSchema>;
