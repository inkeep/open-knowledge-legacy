import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { Callout } from '../Callout';
import { getInteractionLayer } from '../interaction-layer-host';
import { JsxComponentPropPanel } from './JsxComponentPropPanel';

// Module-level counter — drives the stable `data-node-id` attribute used by
// InteractionLayer's event delegation. Monotonic across an app session so
// two JsxComponent instances on the same page never collide.
let __jsxNodeIdCounter = 0;

/**
 * Allocate a fresh stable node id for a JsxComponent NodeView instance.
 * Exported so `useState(nextJsxNodeId)` can lazy-init and pure unit tests
 * can assert monotonicity.
 */
export function nextJsxNodeId(): string {
  return `jsx-${++__jsxNodeIdCounter}`;
}

/** Reset the counter. Test-only — used to get deterministic IDs in unit tests. */
export function __resetJsxNodeIdCounterForTests(): void {
  __jsxNodeIdCounter = 0;
}

/**
 * Parses a simple JSX-like string to extract the component name, type prop, and children text.
 * Exported so tests can assert parse behavior without mounting React.
 * Intentionally simple — handles the `<Callout type="...">children</Callout>` pattern.
 */
export function parseJsxContent(raw: string): {
  component: string;
  type: string;
  children: string;
} {
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

/**
 * Per-instance NodeView for jsxComponent (atom: true) — keeps the live
 * fumadocs Callout render inline (FR8: per-instance live render remains)
 * and wires the singleton PropPanel at editor root via InteractionLayer
 * (FR4/FR8 forward-compat for CB-v2 §9.15).
 */
export function JsxComponentView({ node, editor, getPos }: NodeViewProps) {
  const content = (node.attrs.content as string) || '';
  const parsed = parseJsxContent(content);

  // Stable synthetic id per NodeView instance. Precedent #9 add-only
  // preserved — id lives only in component state, NOT in the schema.
  const [nodeId] = useState(nextJsxNodeId);

  useEffect(() => {
    const layer = getInteractionLayer(editor);
    const safeGetPos = (): number | undefined => {
      const pos = getPos();
      return typeof pos === 'number' ? pos : undefined;
    };
    layer.register({
      type: 'jsxComponent',
      nodeId,
      getPos: safeGetPos,
      controls: {
        propPanel: (ctx) => (
          <JsxComponentPropPanel editor={editor} getPos={safeGetPos} onDismiss={ctx.deactivate} />
        ),
      },
    });
    return () => {
      layer.deregister(nodeId);
    };
  }, [editor, nodeId, getPos]);

  return (
    <NodeViewWrapper
      className="jsx-component-wrapper"
      contentEditable={false}
      data-node-id={nodeId}
    >
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
