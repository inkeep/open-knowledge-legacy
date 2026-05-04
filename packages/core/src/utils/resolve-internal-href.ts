export interface ResolvedInternalHref {
  docName: string;
  anchor: string | null;
}

export function resolveInternalHref(
  href: string,
  sourceDocName: string,
): ResolvedInternalHref | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('#')) return null;

  const hashIdx = trimmed.indexOf('#');
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const anchor = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : null;

  const cleanPath = (pathPart.split('?')[0] ?? '').trim();
  if (!cleanPath) return null;

  const lastSegment = cleanPath.split('/').pop() ?? '';
  const extMatch = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (extMatch) {
    const ext = (extMatch[1] ?? '').toLowerCase();
    if (ext !== 'md' && ext !== 'mdx') return null;
  }

  const lower = cleanPath.toLowerCase();
  const withoutExt = lower.endsWith('.mdx')
    ? cleanPath.slice(0, -4)
    : lower.endsWith('.md')
      ? cleanPath.slice(0, -3)
      : cleanPath;
  const dirParts = sourceDocName.includes('/') ? sourceDocName.split('/').slice(0, -1) : [];

  for (const seg of withoutExt.split('/')) {
    if (seg === '..') {
      if (dirParts.length === 0) return null;
      dirParts.pop();
    } else if (seg !== '.' && seg !== '') {
      dirParts.push(seg);
    }
  }

  if (dirParts.length === 0) return null;
  return { docName: dirParts.join('/'), anchor: anchor || null };
}
