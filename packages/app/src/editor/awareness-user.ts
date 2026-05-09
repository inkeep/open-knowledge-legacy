import {
  type AwarenessUser,
  colorFromSeed,
  formatPresenceLabel,
  HUMAN_COLORS,
  type Identity,
  type Principal,
} from '@inkeep/open-knowledge-core';

type AwarenessUserPayload = AwarenessUser & { type: 'human' };

interface BuildAwarenessUserInput {
  principal: Principal | null;
  identity: Identity;
}

/**
 * Resolve the awareness `user` payload across the three publication states
 * defined in the principal-identity-in-presence design:
 *
 *   (a) `principal === null` (boot race)
 *       — name and color from the random fallback `identity`; no `principalId`.
 *   (b) `principal.source === 'git-config'`
 *       — `name = formatPresenceLabel(display_name)`, deterministic color
 *         from `colorFromSeed(id, HUMAN_COLORS)`, `principalId = principal.id`.
 *   (c) `principal.source === 'synthesized'`
 *       — name from the random fallback; deterministic color from
 *         `colorFromSeed(id, HUMAN_COLORS)`; **no `principalId`** so two
 *         browser profiles whose synthesized server records share an `id`
 *         don't false-dedupe in the multi-tab presence aggregation.
 *
 * The payload is rebuilt — never spread from `identity` — so a future field
 * added to `Identity` is an explicit decision here, not an accidental
 * over-publish to peers. `type: 'human' as const` is mandatory across every
 * branch; `coeditor` is preserved across every branch.
 *
 * `formatPresenceLabel` polishes Unix-style git-config names like
 * `miles-kt-inkeep` → `Miles Kt Inkeep` so the cursor label, tooltip, and
 * any future name-rendering surface stay consistent with the avatar's
 * `computeInitials` polish — single transform at the publish boundary
 * instead of per-consumer divergence.
 *
 * Pure function. No React, no awareness side-effects — that lets unit tests
 * exercise the three states directly without the integration harness.
 */
export function buildAwarenessUser({
  principal,
  identity,
}: BuildAwarenessUserInput): AwarenessUserPayload {
  if (principal && principal.source === 'git-config') {
    return {
      type: 'human' as const,
      name: formatPresenceLabel(principal.display_name),
      color: colorFromSeed(principal.id, HUMAN_COLORS),
      coeditor: identity.coeditor,
      tabId: identity.tabId,
      principalId: principal.id,
    };
  }
  if (principal && principal.source === 'synthesized') {
    return {
      type: 'human' as const,
      name: identity.name,
      color: colorFromSeed(principal.id, HUMAN_COLORS),
      coeditor: identity.coeditor,
      tabId: identity.tabId,
    };
  }
  return {
    type: 'human' as const,
    name: identity.name,
    color: identity.color,
    coeditor: identity.coeditor,
    tabId: identity.tabId,
  };
}
