/**
 * Mark view for Link marks pointing to internal KB pages.
 *
 * External links render as plain <a> elements (unchanged behavior).
 * Internal links (relative hrefs that resolve within the content directory)
 * render with resolved/unresolved chip styling matching WikiLinkView, and
 * navigate within the app on Cmd/Ctrl+click.
 */
import type { MarkViewProps } from '@tiptap/core';
import { MarkViewContent } from '@tiptap/react';
import { ExternalLink } from 'lucide-react';
import { usePageList } from '../../components/PageListContext';
import { cn } from '../../lib/utils';

// ── Path resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a relative href to a KB docName, using the current document's
 * location (from window.location.hash) as the base.
 *
 * Returns null for external links or hrefs that escape the content root.
 */
function resolveInternalHref(href: string): { docName: string; anchor: string | null } | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  // External: URI scheme, protocol-relative, absolute path, or anchor-only
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('#')) return null;

  // Split off fragment
  const hashIdx = trimmed.indexOf('#');
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const anchor = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : null;

  // Strip query string, then .md extension
  const cleanPath = (pathPart.split('?')[0] ?? '').trim();
  if (!cleanPath) return null;
  const withoutExt = cleanPath.endsWith('.md') ? cleanPath.slice(0, -3) : cleanPath;

  // Derive current docName from the hash — handles nested paths like folder/page
  const hashMatch = window.location.hash.match(/^#\/([^?#]+)/);
  const currentDocName = hashMatch ? decodeURIComponent(hashMatch[1]) : '';

  // Build resolved path: start from dirname(currentDocName), apply segments
  const dirParts = currentDocName.includes('/')
    ? currentDocName.slice(0, currentDocName.lastIndexOf('/')).split('/')
    : [];
  for (const seg of withoutExt.split('/')) {
    if (seg === '..') {
      if (dirParts.length === 0) return null; // escapes content root
      dirParts.pop();
    } else if (seg !== '.' && seg !== '') {
      dirParts.push(seg);
    }
  }
  if (dirParts.length === 0) return null;

  return { docName: dirParts.join('/'), anchor: anchor || null };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalLinkView({ mark, HTMLAttributes }: MarkViewProps) {
  const href = (mark.attrs.href as string | null) ?? '';
  const internal = resolveInternalHref(href);
  const { pages, loading } = usePageList();

  if (!internal) {
    // External link — preserve original behavior
    return (
      <a
        {...HTMLAttributes}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-baseline gap-0.5"
      >
        <MarkViewContent />
        <ExternalLink className="inline size-3 shrink-0 translate-y-px opacity-60" />
      </a>
    );
  }

  const isResolved = !loading && pages.has(internal.docName);
  const isUnresolved = !loading && !pages.has(internal.docName);

  const hashHref = internal.anchor
    ? `#/${internal.docName}?anchor=${encodeURIComponent(internal.anchor)}`
    : `#/${internal.docName}`;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      window.location.hash = hashHref.slice(1); // drop leading #
    }
    // Plain click: ProseMirror handles cursor positioning via mousedown; no navigation.
  }

  return (
    <a
      href={hashHref}
      className={cn(
        'mx-0.5 inline-flex max-w-full cursor-pointer select-none items-center rounded-md border px-2 py-0.5 align-baseline text-[0.85em] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        isResolved &&
          'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 focus-visible:ring-sky-300 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
        isUnresolved &&
          'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-300 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60',
        loading &&
          'border-border bg-muted/60 text-muted-foreground hover:bg-muted focus-visible:ring-ring',
      )}
      title={`${href} — Cmd/Ctrl+click to navigate`}
      data-internal-link=""
      data-doc-name={internal.docName}
      data-anchor={internal.anchor ?? ''}
      data-resolved={isResolved ? 'true' : 'false'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
    >
      <MarkViewContent />
    </a>
  );
}
