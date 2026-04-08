import {
  type ActivityEntry,
  type AwarenessState,
  type AwarenessUser,
  generateRandomColor,
  generateRandomName,
  getIdentity,
  HUMAN_COLORS,
  type Identity,
} from '@inkeep/open-knowledge-core';
import { useState } from 'react';

// Re-export types and functions from core for backwards compatibility
export type { ActivityEntry, AwarenessState, AwarenessUser, Identity };
export { generateRandomColor, generateRandomName, getIdentity, HUMAN_COLORS };

// --- React hook ---

export function useIdentity(): Identity {
  // Lazy initializer — identity is derived once per component mount (stable per tab).
  // useState(() => ...) runs the initializer once and caches it for the component lifetime.
  const [identity] = useState(getIdentity);
  return identity;
}
