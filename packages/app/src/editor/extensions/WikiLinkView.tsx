import {
  getWikiLinkText,
  normalizeNullableString,
  renderWikiLink,
} from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useState } from 'react';
import { CreatePageDialog } from '../../components/CreatePageDialog';
import { usePageList } from '../../components/PageListContext';
import { cn } from '../../lib/utils';
import { isResolvedWikiLinkTarget } from './wiki-link-helpers';

export function WikiLinkView({ node, updateAttributes }: NodeViewProps) {
  const target = String(node.attrs.target ?? '');
  const alias = normalizeNullableString(node.attrs.alias);
  const anchor = normalizeNullableString(node.attrs.anchor);
  const label = getWikiLinkText({ target, alias, anchor });
  const source = renderWikiLink({ target, alias, anchor });
  const { pages, loading, refetch } = usePageList();
  const resolutionState =
    loading && pages.size === 0
      ? 'loading'
      : isResolvedWikiLinkTarget(target, pages)
        ? 'resolved'
        : 'unresolved';
  const resolved = resolutionState === 'resolved';
  const unresolved = resolutionState === 'unresolved';
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleClick() {
    if (unresolved) setDialogOpen(true);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLSpanElement>) {
    if (!unresolved) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setDialogOpen(true);
  }

  function handleCreated(docName: string) {
    if (docName !== target) {
      updateAttributes({
        target: docName,
        alias: alias ?? label,
      });
    }
    refetch();
    window.location.hash = '#/' + docName;
  }

  return (
    <>
      <NodeViewWrapper
        as="span"
        className={cn(
          'mx-0.5 inline-flex max-w-full select-none items-center rounded-md border px-2 py-0.5 align-baseline text-[0.85em] font-medium',
          resolved
            ? 'border-sky-200 bg-sky-50 text-sky-900'
            : unresolved
              ? 'cursor-pointer border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-1'
              : 'border-border bg-muted/60 text-muted-foreground',
        )}
        contentEditable={false}
        data-target={target}
        data-alias={alias ?? ''}
        data-anchor={anchor ?? ''}
        data-resolved={resolved ? 'true' : 'false'}
        data-resolution-state={resolutionState}
        title={
          resolved
            ? source
            : unresolved
              ? `${source} — click to create`
              : `${source} — checking page availability`
        }
        role={unresolved ? 'button' : undefined}
        tabIndex={unresolved ? 0 : undefined}
        aria-haspopup={unresolved ? 'dialog' : undefined}
        aria-busy={resolutionState === 'loading' ? true : undefined}
        onClick={unresolved ? handleClick : undefined}
        onKeyDown={unresolved ? handleKeyDown : undefined}
      >
        <span className="truncate">{label}</span>
      </NodeViewWrapper>
      {unresolved && (
        <CreatePageDialog
          open={dialogOpen}
          target={target}
          onOpenChange={setDialogOpen}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
