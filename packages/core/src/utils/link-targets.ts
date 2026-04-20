import { type ResolvedInternalHref, resolveInternalHref } from './resolve-internal-href.ts';

export interface DocLinkTarget extends ResolvedInternalHref {
  kind: 'doc';
}

export interface ExternalLinkTarget {
  kind: 'external';
  url: string;
}

export interface AnchorLinkTarget {
  kind: 'anchor';
  anchor: string;
}

export type ClassifiedLinkTarget = DocLinkTarget | ExternalLinkTarget | AnchorLinkTarget;

const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

function splitDocNameSegments(docName: string): string[] {
  return docName.split('/').filter(Boolean);
}

export function isExternalHref(value: string): boolean {
  const trimmed = value.trim();
  return URI_SCHEME_RE.test(trimmed) || trimmed.startsWith('//');
}

export function classifyMarkdownHref(
  href: string,
  sourceDocName: string,
): ClassifiedLinkTarget | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    const anchor = trimmed.slice(1).trim();
    return anchor ? { kind: 'anchor', anchor } : null;
  }

  const internal = resolveInternalHref(trimmed, sourceDocName);
  if (internal) {
    return {
      kind: 'doc',
      docName: internal.docName,
      anchor: internal.anchor,
    };
  }

  if (trimmed.startsWith('/') || isExternalHref(trimmed)) {
    return { kind: 'external', url: trimmed };
  }

  return null;
}

export function classifyWikiLinkTarget(
  target: string,
  anchor: string | null,
): DocLinkTarget | ExternalLinkTarget | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  if (isExternalHref(trimmed)) {
    return {
      kind: 'external',
      url: anchor ? `${trimmed}#${anchor}` : trimmed,
    };
  }

  return {
    kind: 'doc',
    docName: trimmed,
    anchor: anchor?.trim() || null,
  };
}

export function buildRelativeMarkdownHref(
  sourceDocName: string,
  targetDocName: string,
  anchor: string | null = null,
): string {
  const sourceDirSegments = splitDocNameSegments(sourceDocName);
  sourceDirSegments.pop();

  const targetSegments = splitDocNameSegments(targetDocName);

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < sourceDirSegments.length &&
    commonPrefixLength < targetSegments.length &&
    sourceDirSegments[commonPrefixLength] === targetSegments[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  const upSegments = sourceDirSegments.slice(commonPrefixLength).map(() => '..');
  const downSegments = targetSegments.slice(commonPrefixLength);
  let relativePath = [...upSegments, ...downSegments].join('/');

  if (!relativePath) {
    relativePath = targetSegments.at(-1) ?? targetDocName;
  }

  if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
    relativePath = `./${relativePath}`;
  }

  return `${relativePath}.md${anchor ? `#${anchor}` : ''}`;
}
