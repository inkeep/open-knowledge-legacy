import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';

/**
 * R7: Visual chrome for rawMdxFallback — dashed border + "raw" badge + tooltip.
 *
 * Renders the raw source with contenteditable:false. The badge signals
 * "this block couldn't be parsed — open source mode to fix."
 *
 * Click handler dispatches RAW_MDX_NAV_EVENT which EditorPane listens for
 * to switch to source mode. SourceEditor listens for the same event to
 * scroll CodeMirror to the originalSpan region.
 */

export const RAW_MDX_NAV_EVENT = 'raw-mdx-nav';

export interface RawMdxNavDetail {
  /** Character offset from start of source where the broken region begins */
  offset: number;
}

export function RawMdxFallbackView({ node }: NodeViewProps) {
  const reason = (node.attrs.reason as string) || 'Parse failed';
  const originalSpan = node.attrs.originalSpan as { start: number; end: number };

  function handleClick() {
    window.dispatchEvent(
      new CustomEvent<RawMdxNavDetail>(RAW_MDX_NAV_EVENT, {
        detail: { offset: originalSpan.start },
      }),
    );
  }

  return (
    <NodeViewWrapper
      className="raw-mdx-fallback-wrapper relative my-2 rounded border border-dashed border-amber-400/60 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10 p-3 cursor-pointer"
      contentEditable={false}
      onClick={handleClick}
    >
      <span
        className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
        title={`${reason} — click to edit in source mode`}
      >
        raw
      </span>
      <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground m-0">
        {node.textContent}
      </pre>
    </NodeViewWrapper>
  );
}
