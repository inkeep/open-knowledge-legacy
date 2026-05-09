/** Parse a docName from a `#/<path>?<query>` hash. Returns null if the hash
 * is empty, malformed, or not in the `#/` namespace.
 *
 * Browsers percent-encode spaces and non-ASCII characters in
 * `window.location.hash`. This helper decodes per-segment so the returned
 * docName matches the server's on-disk name (e.g. `My Notes/Ideas — 2026`). */
export function docNameFromHash(hash: string): string | null {
  if (hash.startsWith(ASSET_HASH_PREFIX)) return null;
  if (!hash.startsWith('#/')) return null;
  const rest = hash.slice(2);
  const qmark = rest.indexOf('?');
  const encoded = qmark >= 0 ? rest.slice(0, qmark) : rest;
  if (!encoded) return null;
  try {
    return encoded.split('/').map(decodeURIComponent).join('/');
  } catch {
    return encoded;
  }
}

export function hashFromDocName(docName: string, anchor?: string | null): string {
  const base = `#/${docName}`;
  return anchor ? `${base}?anchor=${encodeURIComponent(anchor)}` : base;
}

export function hashFromFolderPath(folderPath: string, anchor?: string | null): string {
  const normalized = folderPath.replace(/^\/+|\/+$/g, '');
  const base = normalized ? `#/${normalized}/` : '#/';
  return anchor ? `${base}?anchor=${encodeURIComponent(anchor)}` : base;
}

const ASSET_HASH_PREFIX = '#/__asset__/';

export function assetPathFromHash(hash: string): string | null {
  if (!hash.startsWith(ASSET_HASH_PREFIX)) return null;
  const encoded = hash.slice(ASSET_HASH_PREFIX.length);
  if (!encoded) return null;
  try {
    return encoded.split('/').map(decodeURIComponent).join('/');
  } catch {
    return encoded;
  }
}

export function hashFromAssetPath(assetPath: string): string {
  return `${ASSET_HASH_PREFIX}${assetPath.split('/').map(encodeURIComponent).join('/')}`;
}
