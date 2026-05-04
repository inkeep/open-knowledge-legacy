import {
  type AwarenessUser,
  colorFromSeed,
  formatPresenceLabel,
  HUMAN_COLORS,
  type Identity,
  type Principal,
} from '@inkeep/open-knowledge-core';

/**
 * The shape `setLocalStateField('user', ...)` expects on the per-doc
 * awareness map. Keeping the `'human'` discriminator literal-narrowed lets
 * `usePresence`'s `user.type !== 'human'` filter at the consumer side stay
 * exhaustive — drop the literal and peers silently skip the entry.
 */
type AwarenessUserPayload = AwarenessUser & { type: 'human' };

interface BuildAwarenessUserInput {
  principal: Principal | null;
  identity: Identity;
}

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
