import { z } from 'zod';
import { ConfigValidationErrorSchema } from '../config/errors.ts';
import { CC1_CONTRACT_VERSION } from '../constants/cc1.ts';

export const CC1_CHANNEL_SERVER_INFO = 'server-info' as const;

export const CC1_CHANNEL_BRANCH_SWITCHED = 'branch-switched' as const;

export const CC1_CHANNEL_DISK_ACK = 'disk-ack' as const;

export const CC1_CHANNEL_CONFIG_VALIDATION_REJECTED = 'config-validation-rejected' as const;

export const DerivedViewChannelSchema = z.enum([
  'files',
  'backlinks',
  'graph',
  'sync-status',
  'session-activity',
  'tags',
]);
export type DerivedViewChannel = z.infer<typeof DerivedViewChannelSchema>;

export const CC1ServerInfoPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_SERVER_INFO),
    seq: z.number(),
    serverInstanceId: z.string().min(1),
    currentBranch: z.string().min(1).optional(),
  })
  .loose();
export type CC1ServerInfoPayload = z.infer<typeof CC1ServerInfoPayloadSchema>;

export const CC1BranchSwitchedPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_BRANCH_SWITCHED),
    seq: z.number(),
    branch: z.string().min(1),
  })
  .loose();
export type CC1BranchSwitchedPayload = z.infer<typeof CC1BranchSwitchedPayloadSchema>;

export const CC1DerivedViewPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: DerivedViewChannelSchema,
    seq: z.number(),
  })
  .loose();
export type CC1DerivedViewPayload = z.infer<typeof CC1DerivedViewPayloadSchema>;

export const CC1DiskAckPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_DISK_ACK),
    seq: z.number(),
    docName: z.string().min(1),
    sv: z.string().min(1),
  })
  .loose();
export type CC1DiskAckPayload = z.infer<typeof CC1DiskAckPayloadSchema>;

export const CC1ConfigValidationRejectedPayloadSchema = z
  .object({
    v: z.literal(CC1_CONTRACT_VERSION),
    ch: z.literal(CC1_CHANNEL_CONFIG_VALIDATION_REJECTED),
    seq: z.number(),
    docName: z.string().min(1),
    error: ConfigValidationErrorSchema,
  })
  .loose();
export type CC1ConfigValidationRejectedPayload = z.infer<
  typeof CC1ConfigValidationRejectedPayloadSchema
>;
