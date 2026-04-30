/**
 * Module-scoped pub/sub for L3 (`onStoreDocument`) frontmatter-validation
 * rejections, dispatched by `SystemDocSubscriber` upon CC1
 * `'frontmatter-validation-rejected'` broadcasts and consumed by the
 * PropertyPanel.
 *
 * Sibling of `config-validation-events.ts` — same shape, scoped to
 * per-key `Y.Map('metadata')` writes.
 */

import type { CC1FrontmatterValidationRejectedPayload } from '@inkeep/open-knowledge-core';

type Listener = (event: CC1FrontmatterValidationRejectedPayload) => void;

const listeners = new Set<Listener>();

export function emitFrontmatterValidationRejected(
  event: CC1FrontmatterValidationRejectedPayload,
): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (e) {
      console.warn('[frontmatter-validation-events] listener threw:', e);
    }
  }
}

export function subscribeToFrontmatterValidationRejected(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
