/**
 * Registry-driven React node view for jsxComponentEditable.
 *
 * Looks up the component in componentMap, renders it with its real React implementation,
 * shows ComponentToolbar (name badge + gear icon) and PropPanel (popover with auto-generated
 * controls). Uses <NodeViewContent> as the children placeholder for Phase 3 inline editing.
 *
 * Only PropDef-declared props are forwarded to the React component — unknown attributes
 * (from collision policy §3.8) are stored on the node but not rendered.
 */
import { componentManifest } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useCallback, useMemo, useState } from 'react';
import { markUserTyping } from '@/editor/observers';
import { ComponentToolbar } from '../components/ComponentToolbar';
import { componentMap } from '../components/componentMap';
import { PropPanel } from '../components/PropPanel';
import { UnregisteredFallback } from '../components/UnregisteredFallback';

export function JsxComponentView({ node, updateAttributes }: NodeViewProps) {
  const componentName = (node.attrs.componentName as string) || '';
  const meta = componentManifest[componentName];
  const [propPanelOpen, setPropPanelOpen] = useState(false);

  // Extract only PropDef-declared (non-reactnode) props for forwarding to the component
  const primitiveProps = useMemo(() => {
    if (!meta) return {};
    const result: Record<string, unknown> = {};
    for (const propDef of meta.props) {
      if (propDef.type === 'reactnode') continue;
      const val = node.attrs[propDef.name];
      if (val !== undefined && val !== null) {
        result[propDef.name] = val;
      }
    }
    return result;
  }, [meta, node.attrs]);

  // Current prop values for the panel (includes all non-reactnode props)
  const currentProps = useMemo(() => {
    if (!meta) return {};
    const result: Record<string, unknown> = {};
    for (const propDef of meta.props) {
      if (propDef.type === 'reactnode') continue;
      result[propDef.name] = node.attrs[propDef.name];
    }
    return result;
  }, [meta, node.attrs]);

  const handlePropChange = useCallback(
    (propName: string, value: unknown) => {
      markUserTyping();
      updateAttributes({ [propName]: value });
    },
    [updateAttributes],
  );

  // If not registered, fall back to raw display
  if (!meta) {
    const raw = (node.attrs._rawContent as string) || (node.attrs.content as string) || '';
    return (
      <NodeViewWrapper className="jsx-component-wrapper" contentEditable={false}>
        <UnregisteredFallback content={raw} />
      </NodeViewWrapper>
    );
  }

  const Component = componentMap[componentName];

  return (
    <NodeViewWrapper className="jsx-component-wrapper">
      <div contentEditable={false} style={{ userSelect: 'none' }}>
        <PropPanel
          meta={meta}
          currentProps={currentProps}
          onChange={handlePropChange}
          open={propPanelOpen}
          onOpenChange={setPropPanelOpen}
        >
          <div>
            <ComponentToolbar
              componentName={componentName}
              onOpenProps={() => setPropPanelOpen((o) => !o)}
            />
          </div>
        </PropPanel>
      </div>
      {Component ? (
        <Component {...primitiveProps}>
          <NodeViewContent className="component-children" />
        </Component>
      ) : (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: '#f0f0f0',
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
        >
          <strong>&lt;{componentName}&gt;</strong> (no React component found)
          <NodeViewContent className="component-children" />
        </div>
      )}
    </NodeViewWrapper>
  );
}
