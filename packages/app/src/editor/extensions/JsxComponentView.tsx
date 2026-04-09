/**
 * Registry-driven React node view for jsxComponentEditable.
 *
 * Looks up the component in componentMap, renders it with its real React implementation,
 * shows ComponentToolbar (name badge) and PropPanel (inline, auto-shown when selected).
 * Uses <NodeViewContent> as the children placeholder for Phase 3 inline editing.
 *
 * Only PropDef-declared props are forwarded to the React component — unknown attributes
 * (from collision policy §3.8) are stored on the node but not rendered.
 */
import { componentManifest } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { markUserTyping } from '@/editor/observers';
import { ComponentToolbar } from '../components/ComponentToolbar';
import { componentMap } from '../components/componentMap';
import { PropPanel } from '../components/PropPanel';
import { UnregisteredFallback } from '../components/UnregisteredFallback';

/** Error boundary that isolates third-party component render failures per-node. */
class ComponentErrorBoundary extends Component<
  { componentName: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[JsxComponentView] <${this.props.componentName}> crashed during render:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#991b1b',
          }}
        >
          <strong>&lt;{this.props.componentName}&gt;</strong> failed to render:{' '}
          {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function JsxComponentView({ node, updateAttributes, selected }: NodeViewProps) {
  const componentName = (node.attrs.componentName as string) || '';
  const meta = componentManifest[componentName];

  // React Compiler handles memoization automatically — do not add useMemo/useCallback.
  // Extract both views of the props in a single pass — primitiveProps filters
  // undefined/null for forwarding to the React component, currentProps includes
  // them so the panel can show empty/unset state.
  let primitiveProps: Record<string, unknown> = {};
  let currentProps: Record<string, unknown> = {};
  if (meta) {
    const primitive: Record<string, unknown> = {};
    const current: Record<string, unknown> = {};
    for (const propDef of meta.props) {
      if (propDef.type === 'reactnode') continue;
      const val = node.attrs[propDef.name];
      current[propDef.name] = val;
      if (val !== undefined && val !== null) {
        primitive[propDef.name] = val;
      }
    }
    primitiveProps = primitive;
    currentProps = current;
  }

  const handlePropChange = (propName: string, value: unknown) => {
    markUserTyping();
    updateAttributes({ [propName]: value });
  };

  // If not registered, fall back to raw display
  if (!meta) {
    const raw = (node.attrs._rawContent as string) || (node.attrs.content as string) || '';
    return (
      <NodeViewWrapper className="jsx-component-wrapper" contentEditable={false}>
        <UnregisteredFallback content={raw} />
      </NodeViewWrapper>
    );
  }

  const RenderedComponent = componentMap[componentName];

  return (
    <NodeViewWrapper className="jsx-component-wrapper">
      <div contentEditable={false} style={{ userSelect: 'none' }}>
        <ComponentToolbar componentName={componentName} />
      </div>
      <ComponentErrorBoundary componentName={componentName}>
        {RenderedComponent ? (
          <RenderedComponent {...primitiveProps}>
            <NodeViewContent className="component-children" />
          </RenderedComponent>
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
      </ComponentErrorBoundary>
      {selected && (
        <div contentEditable={false} style={{ userSelect: 'none', marginTop: '4px' }}>
          <PropPanel meta={meta} currentProps={currentProps} onChange={handlePropChange} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
