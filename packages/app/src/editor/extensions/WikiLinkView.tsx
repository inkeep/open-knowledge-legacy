import { getWikiLinkText, renderWikiLink } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';
import { CreatePageDialog } from '../../components/CreatePageDialog';
import { usePageList } from '../../components/PageListContext';
import { cn } from '../../lib/utils';

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function WikiLinkView({ node }: NodeViewProps) {
  const target = String(node.attrs.target ?? '');
  const alias = normalizeNullableString(node.attrs.alias);
  const anchor = normalizeNullableString(node.attrs.anchor);
  const label = getWikiLinkText({ target, alias, anchor });
  const source = renderWikiLink({ target, alias, anchor });
  const { pages, refetch } = usePageList();
  const resolved = pages.size > 0 && pages.has(target);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleClick() {
    if (!resolved) setDialogOpen(true);
  }

  function handleCreated(docName: string) {
    refetch();
    window.location.hash = `#doc=${encodeURIComponent(docName)}`;
  }

  return (
    <>
      <NodeViewWrapper
        as="span"
        className={cn(
          'mx-0.5 inline-flex max-w-full select-none items-center rounded-md border px-2 py-0.5 align-baseline text-[0.85em] font-medium',
          resolved
            ? 'border-sky-200 bg-sky-50 text-sky-900'
            : 'cursor-pointer border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
        )}
        contentEditable={false}
        data-target={target}
        data-alias={alias ?? ''}
        data-anchor={anchor ?? ''}
        data-resolved={resolved ? 'true' : 'false'}
        title={resolved ? source : `${source} — click to create`}
        onClick={handleClick}
      >
        <span className="truncate">{label}</span>
      </NodeViewWrapper>
      {!resolved && (
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
