import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';

/**
 * R7: Visual chrome for rawMdxFallback — dashed border + "raw" badge + tooltip.
 *
 * Renders the raw source with contenteditable:false. The badge signals
 * "this block couldn't be parsed — open source mode to fix."
 */
export function RawMdxFallbackView({ node }: NodeViewProps) {
  const reason = (node.attrs.reason as string) || 'Parse failed';

  return (
    <NodeViewWrapper
      className="raw-mdx-fallback-wrapper relative my-2 rounded border border-dashed border-amber-400/60 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-900/10 p-3"
      contentEditable={false}
    >
      <span
        className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
        title={`${reason} — click to open source mode`}
      >
        raw
      </span>
      <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground m-0">
        {node.textContent}
      </pre>
    </NodeViewWrapper>
  );
}
