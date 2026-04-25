/**
 * Client-side parsers for CC1 (push-over-awareness) stateless payloads
 * received from the `__system__` Hocuspocus document.
 *
 * Schemas live in `packages/core/src/schemas/cc1.ts` — browser-safe,
 * shared with server's `cc1-broadcast.ts` which validates on every
 * emit via `.parse()`. Single source of truth across the process
 * boundary; drift between emit and parse is structurally impossible.
 *
 * Each schema pins `ch` to a specific literal (or derived-view enum),
 * so the three parsers are mutually exclusive; `SystemDocSubscriber`
 * tries them in order and short-circuits on the first match.
 *
 * `null` on parse failure, never throws — the stateless listener sees
 * a steady stream of payloads and must skip ones it doesn't recognize
 * without surfacing exceptions to React.
 */

import {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CONTRACT_VERSION,
  type CC1BranchSwitchedPayload,
  CC1BranchSwitchedPayloadSchema,
  type CC1DerivedViewPayload,
  CC1DerivedViewPayloadSchema,
  type CC1ServerInfoPayload,
  CC1ServerInfoPayloadSchema,
  type DerivedViewChannel,
  SYSTEM_DOC_NAME,
} from '@inkeep/open-knowledge-core';
import type { z } from 'zod';

export {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CONTRACT_VERSION,
  type DerivedViewChannel,
  SYSTEM_DOC_NAME,
};

export function parseCC1DerivedView(payload: string): CC1DerivedViewPayload | null {
  return safeParseJson(payload, CC1DerivedViewPayloadSchema);
}

export function parseCC1ServerInfo(payload: string): CC1ServerInfoPayload | null {
  return safeParseJson(payload, CC1ServerInfoPayloadSchema);
}

export function parseCC1BranchSwitched(payload: string): CC1BranchSwitchedPayload | null {
  return safeParseJson(payload, CC1BranchSwitchedPayloadSchema);
}

/**
 * Shared safe-parse for stateless CC1 payloads. JSON parse error or Zod
 * schema mismatch yields `null` so the stateless listener can skip the
 * frame without surfacing an exception. Uses `safeParse` (never throws)
 * instead of `parse` per `/eng:type-safety` validation-narrowing
 * guidance.
 */
function safeParseJson<T extends z.ZodType>(payload: string, schema: T): z.infer<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function defaultCollabWsUrl(): string {
  if (typeof location === 'undefined') {
    return 'ws://localhost/collab';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/collab`;
}
