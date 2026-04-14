import { type ResolvedInternalHref, resolveInternalHref } from '@inkeep/open-knowledge-core';

function getCurrentDocNameFromHash(locationHash = window.location.hash): string {
  const hashMatch = locationHash.match(/^#\/([^?#]+)/);
  return hashMatch ? decodeURIComponent(hashMatch[1]) : '';
}

export function resolveCurrentInternalHref(
  href: string,
  locationHash = window.location.hash,
): ResolvedInternalHref | null {
  return resolveInternalHref(href, getCurrentDocNameFromHash(locationHash));
}

export function toInternalHashHref({ docName, anchor }: ResolvedInternalHref): string {
  return anchor ? `#/${docName}?anchor=${encodeURIComponent(anchor)}` : `#/${docName}`;
}

export function navigateToInternalHashHref(resolved: ResolvedInternalHref): void {
  window.location.assign(toInternalHashHref(resolved));
}
