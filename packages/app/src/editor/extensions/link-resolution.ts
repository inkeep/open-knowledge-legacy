
import { classifyMarkdownHref } from '@inkeep/open-knowledge-core';
import { resolveLinkTargetIntent } from '../../components/link-target-intent';
import type { PageListCacheSnapshot } from '../page-list-cache';
import type { MarkInfo } from './mark-identity';

type LinkResolutionState =
  | 'loading'
  | 'external'
  | 'anchor'
  | 'resolved'
  | 'folder'
  | 'unresolved'
  | 'asset';

export function computeLinkResolutionState(
  href: string,
  sourceDocName: string,
  cache: PageListCacheSnapshot | null,
): LinkResolutionState {
  const target = classifyMarkdownHref(href, sourceDocName);
  if (!target) return 'unresolved';
  if (target.kind === 'external') return 'external';
  if (target.kind === 'anchor') return 'anchor';
  if (target.kind === 'asset') return 'asset';

  if (cache === null) return 'loading';

  const intent = resolveLinkTargetIntent(target.docName, {
    pages: cache.pages,
    folderPaths: cache.folderPaths,
  });
  if (intent.kind === 'create') return 'unresolved';
  return intent.displayState;
}

export function computeLinkResolutionAttrs(
  markInfo: MarkInfo,
  cache: PageListCacheSnapshot | null,
  sourceDocName: string,
): Record<string, string> | null {
  const href = markInfo.attrs?.href;
  if (typeof href !== 'string' || href.length === 0) return null;
  if (markInfo.attrs?.sourceForm === 'wikiembed') return null;
  const state = computeLinkResolutionState(href, sourceDocName, cache);
  return { 'data-resolution-state': state };
}

export function makeLinkResolutionAttrsComputer(
  sourceDocName: string,
): (markInfo: MarkInfo, cache: PageListCacheSnapshot | null) => Record<string, string> | null {
  return (markInfo, cache) => computeLinkResolutionAttrs(markInfo, cache, sourceDocName);
}
