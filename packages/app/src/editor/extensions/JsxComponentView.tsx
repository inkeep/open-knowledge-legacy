/**
 * JsxComponentView — three-branch descriptor-dispatch NodeView (FR-9, §9.7).
 *
 * Branch 1 (Wildcard): UnregisteredBadge + editable <NodeViewContent>.
 * Branch 2 (Registered healthy): live React + optional ComponentToolbar +
 *   PropPanel (on selected + has editable props) + <NodeViewContent>.
 * Branch 3 (Invalid-state): ComponentErrorBoundary catches → nested CM editor
 *   showing block source for in-place editing (Precedent #14).
 *
 * Per Precedent #14: NodeViewContent is ALWAYS rendered, never display:none.
 * All user content always visible and editable.
 */

import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import React, { type ErrorInfo, type ReactNode, useState } from 'react';
import { PropPanel } from '../components/PropPanel.tsx';
import { markUserTyping } from '../observers.ts';
import { getDescriptor } from '../registry/index.ts';
import { createChildNode } from '../slash-command/component-items.ts';
import { getYDoc } from '../utils/get-ydoc.ts';

/**
 * Minimal class component error boundary for component render failures.
 * On catch, signals the parent via onError callback to switch render branch.
 * React Compiler compatible — class components are untouched by the compiler.
 */
interface ErrorBoundaryProps {
  onError: (error: Error) => void;
  children: ReactNode;
  resetKey: string;
}

interface ErrorBoundaryState {
  errored: boolean;
}

class ComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { errored: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { errored: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      JSON.stringify({
        event: 'jsx-render-failure',
        error: String(error),
        stack: info.componentStack,
      }),
    );
    this.props.onError(error);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.errored) {
      this.setState({ errored: false });
    }
  }

  render(): ReactNode {
    if (this.state.errored) {
      // Render children even in error state so NodeViewContent stays in the DOM
      // (Precedent #14: all user content always visible). The parent JsxComponentView
      // switches to Branch 3 via the onError callback, but if that pathway fails,
      // this ensures content is never permanently invisible.
      return <div className="jsx-component-error-fallback">{this.props.children}</div>;
    }
    return this.props.children;
  }
}

/**
 * Extract primitive (non-ReactNode) props from PM node attrs for passing
 * to the live React component.
 *
 * Passes through ALL keys from `attrs.props` (destructureAttrs stores every
 * attribute there, not just declared ones) and excludes only the PropDef
 * entries whose type is 'reactnode' (those are content holes — handled by
 * NodeViewContent, not passed as props). This makes the render path symmetric
 * with FR-21's reconstructAttrs merge: undeclared attrs on the source (e.g.
 * `<InlineTOC items={...}>` where `items` isn't in the registry PropDef)
 * still reach the component, preventing crashes like
 * "Cannot read properties of undefined (reading 'map')" when the component
 * requires the undeclared prop.
 */
export function extractPrimitiveProps(
  attrs: Record<string, unknown>,
  descriptorProps: import('@inkeep/open-knowledge-core').PropDef[],
): Record<string, unknown> {
  const propsObj = (attrs.props ?? {}) as Record<string, unknown>;
  const reactnodeNames = new Set(
    descriptorProps.filter((p) => p.type === 'reactnode').map((p) => p.name),
  );
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(propsObj)) {
    if (reactnodeNames.has(key)) continue;
    result[key] = value;
  }
  return result;
}

export function JsxComponentView({ node, editor, getPos, selected }: NodeViewProps) {
  const descriptor = getDescriptor(node.attrs.componentName as string);
  const [renderError, setRenderError] = useState<Error | null>(null);

  // Check if this component is a child of another jsxComponent (FR-17)
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  let isChildOfComponent = false;
  try {
    if (pos !== undefined) {
      const $pos = editor.state.doc.resolve(pos);
      if ($pos.depth > 0) {
        isChildOfComponent = $pos.parent.type.name === 'jsxComponent';
      }
    }
  } catch {
    // Position resolution can fail during teardown
  }

  // Suppress empty panel: if descriptor has no editable (non-reactnode) props, skip PropPanel
  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  // Compute primitive props for the React component
  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.props);
  const resetKey = `${descriptor.name}::${JSON.stringify(primitiveProps)}`;

  // BRANCH 1: Wildcard (unregistered name)
  if (descriptor.name === '*') {
    return (
      <NodeViewWrapper className="jsx-component-wrapper jsx-component-wrapper--unregistered my-2 rounded border border-dashed border-muted-foreground/30 p-3">
        <div className="text-xs font-mono text-muted-foreground mb-2" contentEditable={false}>
          &lt;{node.attrs.componentName}&gt;
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // BRANCH 3: Invalid-state render failure (Precedent #14 — nested CM editor)
  if (renderError) {
    return (
      <NodeViewWrapper className="jsx-component-wrapper jsx-component-wrapper--invalid-state my-2 rounded border border-dashed border-red-400/60 dark:border-red-500/40 bg-red-50/50 dark:bg-red-900/10 p-3">
        <div
          className="text-xs font-mono text-red-600 dark:text-red-400 mb-2"
          contentEditable={false}
        >
          &lt;{descriptor.displayName ?? descriptor.name}&gt; — render error
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // BRANCH 2: Registered healthy render
  const Comp = descriptor.Component;

  return (
    <NodeViewWrapper
      className={`jsx-component-wrapper my-2 ${selected ? 'is-selected' : ''}`}
      data-drag-handle=""
      draggable="true"
    >
      {/* ComponentToolbar: shows component name badge; suppressed on child-of-component (FR-17) */}
      {!isChildOfComponent && (
        <button
          type="button"
          contentEditable={false}
          className="jsx-component-toolbar flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-muted-foreground bg-muted/50 rounded-t border border-b-0 border-muted-foreground/20 cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => {
            if (typeof pos === 'number' && editor) {
              editor.commands.setNodeSelection(pos);
            }
          }}
        >
          &lt;{descriptor.displayName ?? descriptor.name}&gt;
        </button>
      )}

      <ComponentErrorBoundary key={resetKey} resetKey={resetKey} onError={setRenderError}>
        <Comp {...primitiveProps}>
          <NodeViewContent
            className={`component-children ${
              !descriptor.hasChildren && node.childCount === 0 ? 'min-h-0 m-0 p-0' : ''
            }`}
          />
        </Comp>
      </ComponentErrorBoundary>

      {/* "Add child" button for containers (FR-16a). Derived from descriptor.emptyChildName —
          no component-specific logic. Empty containers show a prominent placeholder;
          non-empty containers show a subtle "+" that appears on hover. */}
      {descriptor.emptyChildName && (
        <button
          type="button"
          contentEditable={false}
          className={node.childCount === 0 ? 'jsx-empty-child-placeholder' : 'jsx-add-child-button'}
          onClick={() => {
            const childJSON = createChildNode(descriptor.emptyChildName as string);
            const p = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
            const insertPos = p + 1 + node.content.size;
            editor.chain().focus().insertContentAt(insertPos, childJSON).run();
          }}
        >
          {node.childCount === 0
            ? `Click to add a ${(descriptor.emptyChildName as string).toLowerCase()}`
            : `+ Add ${descriptor.emptyChildName}`}
        </button>
      )}

      {/* PropPanel: auto-generated controls. Suppressed when no editable props (FR-11/ES01).
          FR-13a: onMouseDown stopPropagation prevents node deselect on input click. */}
      {selected && hasEditableProps && (
        // biome-ignore lint/a11y/noStaticElementInteractions: onMouseDown stopPropagation is required inside ProseMirror NodeView to prevent node deselection when interacting with PropPanel controls (FR-13a)
        <div
          className="jsx-prop-panel-wrapper mt-1"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <PropPanel
            props={descriptor.props}
            values={primitiveProps}
            onChange={(propName, value) => {
              const ydoc = getYDoc(editor);
              if (ydoc) markUserTyping(ydoc);
              // Update the props object in the attrs
              const currentProps = (node.attrs.props ?? {}) as Record<string, unknown>;
              editor.commands.updateAttributes('jsxComponent', {
                props: { ...currentProps, [propName]: value },
                sourceDirty: true,
              });
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}
