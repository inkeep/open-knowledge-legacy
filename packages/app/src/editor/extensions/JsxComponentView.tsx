import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Callout } from '../Callout';

/**
 * Parses a simple JSX-like string to extract the component name, type prop, and children text.
 * This is intentionally simple — it handles the <Callout type="...">children</Callout> pattern.
 */
function parseJsxContent(raw: string): { component: string; type: string; children: string } {
  const tagMatch = raw.match(/<(\w+)\s+type="([^"]*)">([\s\S]*?)<\/\1>/);
  if (tagMatch) {
    return {
      component: tagMatch[1],
      type: tagMatch[2],
      children: tagMatch[3].trim(),
    };
  }
  return { component: 'Unknown', type: 'info', children: raw.trim() };
}

export function JsxComponentView({ node }: NodeViewProps) {
  const content = (node.attrs.content as string) || '';
  const parsed = parseJsxContent(content);

  return (
    <NodeViewWrapper className="jsx-component-wrapper" contentEditable={false}>
      {parsed.component === 'Callout' ? (
        <Callout type={parsed.type}>{parsed.children}</Callout>
      ) : (
        <div className="bg-muted dark:bg-muted/40 p-3 px-4 rounded-md font-mono text-[13px]">
          <strong>&lt;{parsed.component}&gt;</strong>
          <pre className="mt-2 whitespace-pre-wrap">{content}</pre>
        </div>
      )}
    </NodeViewWrapper>
  );
}
