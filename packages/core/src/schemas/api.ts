
import { z } from 'zod';

export const ServerInfoResponseSchema = z
  .object({
    ok: z.literal(true),
    serverInstanceId: z.string().min(1),
    currentBranch: z.string().min(1).optional(),
    currentDiskAckSVs: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .loose();
export type ServerInfoResponse = z.infer<typeof ServerInfoResponseSchema>;

export const PrincipalResponseSchema = z
  .object({
    id: z.string().min(1),
    display_name: z.string().min(1),
    display_email: z.string(),
    source: z.enum(['git-config', 'synthesized']),
    created_at: z.string().min(1),
  })
  .loose();
export type PrincipalResponse = z.infer<typeof PrincipalResponseSchema>;
