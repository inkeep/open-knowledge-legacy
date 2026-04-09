import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Callout } from '../Callout';

function parseJsxContent(raw: string): { component: string; type: string; children: string } {
  const m = raw.match(/<(\w+)\s+type="([^"]*)">([\s\S]*?)<\/\1>/);
  if (m) return { component: m[1], type: m[2], children: m[3].trim() };
  return { component: 'Unknown', type: 'info', children: raw.trim() };
}

export function JsxComponentView({ node }: NodeViewProps) {
  const content = (node.attrs.content as string) ?? '';
  const { component, type, children } = parseJsxContent(content);

  return (
    <NodeViewWrapper className="jsx-component-wrapper" contentEditable={false}>
      {component === 'Callout' ? (
        <Callout type={type}>{children}</Callout>
      ) : (
        <div className="font-mono text-sm p-3 rounded bg-muted">
          <strong>&lt;{component}&gt;</strong>
          <pre className="mt-2 whitespace-pre-wrap">{content}</pre>
        </div>
      )}
    </NodeViewWrapper>
  );
}
