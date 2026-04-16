/**
 * JsxComponentView — overlay-based descriptor-dispatch NodeView.
 *
 * **Design principle:** Zero permanent chrome in document flow. Components
 * render exactly like production. All editor affordances are hover-revealed
 * overlays: badge+gear at top-right, "add child" pill at bottom edge.
 *
 * Three render branches:
 *   Branch 1 (Wildcard): hover-revealed name badge + editable NodeViewContent.
 *   Branch 2 (Registered healthy): live React component + hover chrome
 *     (badge, gear→Popover PropPanel, add-child pill) + NodeViewContent.
 *   Branch 3 (Invalid-state): error badge + editable NodeViewContent (Precedent #14).
 *
 * Per Precedent #14: NodeViewContent is ALWAYS rendered, never display:none.
 */

import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { ChevronDown, ChevronUp, Settings2, Trash2 } from 'lucide-react';
import React, { type ErrorInfo, type ReactNode, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import { markUserTyping } from '../observers.ts';
import { getDescriptor } from '../registry/index.ts';
import { createChildNode } from '../slash-command/component-items.ts';
import { getYDoc } from '../utils/get-ydoc.ts';

// ── Error Boundary ──────────────────────────────────────────────────────

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
      return <div className="jsx-component-error-fallback">{this.props.children}</div>;
    }
    return this.props.children;
  }
}

// ── Prop extraction ─────────────────────────────────────────────────────

/**
 * Extract primitive (non-ReactNode) props from PM node attrs.
 * Passes through ALL keys from attrs.props — undeclared attrs reach the
 * component to prevent crashes on components requiring non-PropDef attrs.
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

// ── Main NodeView ───────────────────────────────────────────────────────

export function JsxComponentView({ node, editor, getPos, selected }: NodeViewProps) {
  const descriptor = getDescriptor(node.attrs.componentName as string);
  const [renderError, setRenderError] = useState<Error | null>(null);

  const pos = typeof getPos === 'function' ? getPos() : undefined;

  // Check if this block is a child of another jsxComponent (e.g., Card inside Cards).
  // Used to show up/down arrows only for children (top-level blocks use the SideMenu drag handle).
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

  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.props);
  const resetKey = `${descriptor.name}::${JSON.stringify(primitiveProps)}`;

  // Shared: compute child insertion position (inside container, after last child)
  const insertChildAt = () => {
    const p = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
    return p + 1 + node.content.size;
  };

  // ── BRANCH 1: Wildcard (unregistered name) ────────────────────────────
  if (descriptor.name === '*') {
    return (
      <NodeViewWrapper
        className="jsx-component-wrapper my-2"
        data-component-name={node.attrs.componentName}
      >
        {/* Hover-revealed name badge */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: contentEditable={false} + stopPropagation required inside PM NodeView */}
        <div
          className="jsx-component-chrome"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span>Unknown: {node.attrs.componentName as string}</span>
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // ── BRANCH 3: Invalid-state render failure (Precedent #14) ────────────
  if (renderError) {
    return (
      <NodeViewWrapper className="jsx-component-wrapper jsx-component-wrapper--error my-2">
        <div
          className="text-xs font-mono text-red-600 dark:text-red-400 px-2 py-1"
          contentEditable={false}
        >
          &lt;{descriptor.displayName ?? descriptor.name}&gt; — render error
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // ── BRANCH 2: Registered healthy render ───────────────────────────────
  const Comp = descriptor.Component;

  return (
    <NodeViewWrapper
      className={`jsx-component-wrapper my-2 ${selected ? 'is-selected' : ''}`}
      data-drag-handle=""
      draggable="true"
      data-component-name={descriptor.name}
      data-tab-value={((node.attrs.props as Record<string, unknown>)?.value as string) ?? ''}
    >
      {/* Hover-revealed action icons: [↑] [↓] [⚙️] [🗑] */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView */}
      <div
        className="jsx-component-chrome"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Move up/down — only for children inside containers (top-level uses SideMenu drag) */}
        {isChildOfComponent && (
          <button
            type="button"
            className="jsx-chrome-btn"
            aria-label="Move up"
            onClick={() => {
              if (typeof pos !== 'number') return;
              const $p = editor.state.doc.resolve(pos);
              const idx = $p.index($p.depth);
              if (idx === 0) return;
              const parent = $p.node($p.depth);
              const prev = parent.child(idx - 1);
              const from = pos - prev.nodeSize;
              const to = pos + node.nodeSize;
              const tr = editor.state.tr;
              const cur = editor.state.doc.slice(pos, pos + node.nodeSize);
              const pre = editor.state.doc.slice(from, pos);
              tr.replaceWith(from, to, cur.content.append(pre.content));
              editor.view.dispatch(tr.scrollIntoView());
            }}
          >
            <ChevronUp size={12} />
          </button>
        )}

        {isChildOfComponent && (
          <button
            type="button"
            className="jsx-chrome-btn"
            aria-label="Move down"
            onClick={() => {
              if (typeof pos !== 'number') return;
              const $p = editor.state.doc.resolve(pos);
              const idx = $p.index($p.depth);
              const parent = $p.node($p.depth);
              if (idx >= parent.childCount - 1) return;
              const next = parent.child(idx + 1);
              const from = pos;
              const to = pos + node.nodeSize + next.nodeSize;
              const tr = editor.state.tr;
              const cur = editor.state.doc.slice(pos, pos + node.nodeSize);
              const nxt = editor.state.doc.slice(pos + node.nodeSize, to);
              tr.replaceWith(from, to, nxt.content.append(cur.content));
              editor.view.dispatch(tr.scrollIntoView());
            }}
          >
            <ChevronDown size={12} />
          </button>
        )}

        {/* Settings → Popover PropPanel (only if editable props) */}
        {hasEditableProps && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="jsx-chrome-btn"
                aria-label={`${descriptor.displayName ?? descriptor.name} properties`}
              >
                <Settings2 size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" sideOffset={8} className="w-64 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {descriptor.displayName ?? descriptor.name} Properties
              </div>
              <PropPanel
                props={descriptor.props}
                values={primitiveProps}
                onChange={(propName, value) => {
                  if (typeof pos === 'number') {
                    editor.commands.updateAttributes('jsxComponent', {
                      props: {
                        ...(node.attrs.props as Record<string, unknown>),
                        [propName]: value,
                      },
                      sourceDirty: true,
                    });
                    const ydoc = getYDoc(editor);
                    if (ydoc) markUserTyping(ydoc);
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        )}

        {/* Delete */}
        <button
          type="button"
          className="jsx-chrome-btn jsx-chrome-btn--delete"
          aria-label={`Delete ${descriptor.displayName ?? descriptor.name}`}
          onClick={() => {
            if (typeof pos === 'number') {
              editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
            }
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Live React component — renders exactly like production */}
      <ComponentErrorBoundary key={resetKey} resetKey={resetKey} onError={setRenderError}>
        <Comp {...primitiveProps}>
          <NodeViewContent
            className={`component-children ${
              !descriptor.hasChildren && node.childCount === 0 ? 'min-h-0 m-0 p-0' : ''
            }`}
          />
        </Comp>
      </ComponentErrorBoundary>

      {/* "Add child" pill — absolute overlay at bottom edge (containers only) */}
      {descriptor.emptyChildName && (
        <button
          type="button"
          contentEditable={false}
          className={node.childCount === 0 ? 'jsx-empty-child-placeholder' : 'jsx-add-child-pill'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            const childJSON = createChildNode(descriptor.emptyChildName as string);
            editor.chain().focus().insertContentAt(insertChildAt(), childJSON).run();
          }}
        >
          <span>
            {node.childCount === 0
              ? `Click to add a ${(descriptor.emptyChildName as string).toLowerCase()}`
              : `+ Add ${descriptor.emptyChildName}`}
          </span>
        </button>
      )}
    </NodeViewWrapper>
  );
}
