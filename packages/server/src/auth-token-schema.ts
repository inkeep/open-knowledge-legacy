import { z } from 'zod';

export const HocuspocusAuthTokenSchema = z
  .object({
    principalId: z.string().optional(),
    tabSessionId: z.string().optional(),
    expectedServerInstanceId: z.string().optional(),
    expectedBranch: z.string().optional(),
  })
  .loose();

export type HocuspocusAuthToken = z.infer<typeof HocuspocusAuthTokenSchema>;

export const HOCUSPOCUS_AUTH_REJECTION_REASONS = [
  'server-instance-mismatch',
  'branch-mismatch',
] as const;
export type HocuspocusAuthRejectionReason = (typeof HOCUSPOCUS_AUTH_REJECTION_REASONS)[number];

export function isHocuspocusAuthRejectionReason(
  reason: string,
): reason is HocuspocusAuthRejectionReason {
  return (HOCUSPOCUS_AUTH_REJECTION_REASONS as readonly string[]).includes(reason);
}

export class HocuspocusAuthRejection extends Error {
  readonly reason: HocuspocusAuthRejectionReason;

  constructor(reason: HocuspocusAuthRejectionReason, message: string) {
    super(message);
    this.name = 'HocuspocusAuthRejection';
    this.reason = reason;
  }
}

export function parseHocuspocusAuthToken(
  tokenStr: string | undefined | null,
): HocuspocusAuthToken | undefined {
  if (typeof tokenStr !== 'string' || tokenStr.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(tokenStr);
  } catch {
    return undefined;
  }
  const result = HocuspocusAuthTokenSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
