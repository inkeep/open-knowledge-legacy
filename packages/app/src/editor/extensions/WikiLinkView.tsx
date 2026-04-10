import { getWikiLinkText, renderWikiLink } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
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

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        'mx-0.5 inline-flex max-w-full select-none items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 align-baseline text-[0.85em] font-medium text-sky-900',
      )}
      contentEditable={false}
      data-target={target}
      data-alias={alias ?? ''}
      data-anchor={anchor ?? ''}
      title={source}
    >
      <span className="truncate">{label}</span>
    </NodeViewWrapper>
  );
}
