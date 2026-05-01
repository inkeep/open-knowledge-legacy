export function docNameFromHash(hash: string): string | null {
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
