/**
 * React node view for jsxComponentVoid — unregistered component fallback.
 * Renders the raw JSX in a monospace box via UnregisteredFallback.
 */
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { UnregisteredFallback } from '../components/UnregisteredFallback';

export function JsxComponentVoidView({ node }: NodeViewProps) {
  const content = (node.attrs.content as string) || '';

  return (
    <NodeViewWrapper className="jsx-component-void-wrapper" contentEditable={false}>
      <UnregisteredFallback content={content} />
    </NodeViewWrapper>
  );
}
