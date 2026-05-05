/**
 * JsxComponentView — overlay-based descriptor-dispatch NodeView.
 *
 * **Design principle:** Zero permanent chrome in document flow. Components
 * render exactly like production. All editor affordances are hover-revealed
 * overlays at top-right (move up/down, delete, settings gear) plus an
 * "add child" pill at the bottom edge of container descriptors.
 *
 * A persistent component-name chip was proposed (SPEC §7a.BS01) but dropped
 * in commit `252bce2b` — the "zero permanent chrome" principle won. The
 * descriptor identity is surfaced through: (a) the rendered fumadocs
 * component's own visual style (every built-in has a distinct shape), (b)
 * the breadcrumb in `EditorHeader` when the block is selected, (c) the
 * `aria-label` group summary announced to AT on focus.
 *
 * Three render branches:
 *   Branch 1 (Wildcard `'*'`): does NOT render a persistent chip — the
 *     NodeView immediately schedules a rAF-auto-convert into an editable
 *     `rawMdxFallback` (nested CodeMirror source editor, Precedent #28
 *     direct PM dispatch + #30 all user content visible). A transient
 *     "Unknown component: X — source editable below"
 *     placeholder flashes for at most one frame while the conversion
 *     dispatch lands.
 *   Branch 2 (Registered healthy): live React component + hover chrome
 *     (move/delete/gear→Popover PropPanel, add-child pill) + NodeViewContent.
 *   Branch 3 (Invalid-state / render error): same rAF-auto-convert into
 *     `rawMdxFallback` — the error boundary catches, logs a structured
 *     `jsx-render-failure` event, and the NodeView replaces itself with
 *     the source editor. Identical UX shape to Branch 1 by design
 *     (Precedent #28: parse failures AND render failures surface the same
 *     embedded source editor).
 *
 * Per Precedent #30: NodeViewContent is ALWAYS rendered, never display:none.
 */

import {
  incrementJsxAutoConvertFailed,
  incrementJsxAutoConvertSucceeded,
  incrementJsxMoveFailed,
  incrementJsxRenderFailure,
  incrementJsxStuckCopyFailed,
  incrementJsxStuckDeleteFailed,
} from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { ArrowDown, ArrowUp, Settings2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover.tsx';
import { OPT_OUT_ATTR } from '../clipboard/index.ts';
import { DescriptorPlaceholder } from '../components/DescriptorPlaceholder.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import { getWrapperBridgeId } from '../extensions/selection-state-plugin.ts';
import { useBlockSelection } from '../hooks/use-block-selection.ts';
import { markUserTyping } from '../observers.ts';
import { getDescriptor } from '../registry/index.ts';
import {
  resolveDescriptorPlaceholder,
  shouldRenderPlaceholder,
} from '../registry/resolve-descriptor-placeholder.ts';
import {
  consumeAutoOpen,
  createChildNode,
  focusInsertedComponent,
} from '../slash-command/component-items.tsx';
import { formatContainerAriaLabel } from '../utils/editor-strings.ts';
import { reconstructSource } from '../utils/reconstruct-source.ts';
import { sanitizeComponentProps } from '../utils/sanitize-url.ts';

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onError: (error: Error) => void;
  descriptorName: string;
  rawComponentName: string;
}

function ComponentErrorFallback({ children }: FallbackProps & { children?: ReactNode }) {
  return <div className="jsx-component-error-fallback">{children}</div>;
}

function ComponentErrorBoundary(props: ComponentErrorBoundaryProps) {
  const { children, resetKey, onError, descriptorName, rawComponentName } = props;
  return (
    <ErrorBoundary
      resetKeys={[resetKey]}
      onError={(error, info) => {
        const err = error instanceof Error ? error : new Error(String(error));
        console.warn(
          JSON.stringify({
            event: 'jsx-render-failure',
            component: descriptorName,
            rawComponentName: String(rawComponentName ?? '').slice(0, 200),
            error: String(err),
            stack: info.componentStack,
          }),
        );
        incrementJsxRenderFailure(descriptorName);
        onError(err);
      }}
      fallbackRender={(fbProps) => (
        <ComponentErrorFallback {...fbProps}>{children}</ComponentErrorFallback>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export function stableHash(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableHash).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableHash(v)}`).join(',')}}`;
}

export function extractPrimitiveProps(
  attrs: Record<string, unknown>,
  reactNodeNames: ReadonlySet<string>,
): Record<string, unknown> {
  const propsObj = (attrs.props ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(propsObj)) {
    if (reactNodeNames.has(key)) continue;
    result[key] = value;
  }
  return sanitizeComponentProps(result);
}

const MAX_AUTO_CONVERT_RETRIES = 3;

export function JsxComponentView({ node, editor, getPos, selected }: NodeViewProps) {
  const descriptor = getDescriptor(node.attrs.componentName as string);
  const [renderError, setRenderError] = useState<Error | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wasSelected = useRef(false);

  const pos = typeof getPos === 'function' ? getPos() : undefined;

  let isChildOfComponent = false;
  let siblingIndex = 0;
  let siblingCount = 1;
  try {
    if (pos !== undefined) {
      const $pos = editor.state.doc.resolve(pos);
      if ($pos.depth > 0 && $pos.parent.type.name === 'jsxComponent') {
        isChildOfComponent = true;
        siblingIndex = $pos.index($pos.depth);
        siblingCount = $pos.parent.childCount;
      }
    }
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
  }
  const canMoveUp = isChildOfComponent && siblingIndex > 0;
  const canMoveDown = isChildOfComponent && siblingIndex < siblingCount - 1;

  const blockSelection = useBlockSelection(editor);
  const wrapperBridgeId = typeof pos === 'number' ? getWrapperBridgeId(editor.state, pos) : null;
  const isInnermostSelected =
    wrapperBridgeId !== null && blockSelection?.selectedBlockId === wrapperBridgeId;
  const hasChildSelected =
    wrapperBridgeId !== null &&
    !isInnermostSelected &&
    (blockSelection?.ancestorChain.some((entry) => entry.bridgeId === wrapperBridgeId) ?? false);
  const selectionOrigin =
    isInnermostSelected && blockSelection ? blockSelection.selectionOrigin : undefined;
  const isDraggingSelf = isInnermostSelected && (blockSelection?.isDragging ?? false);

  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  const currentProps = (node.attrs.props as Record<string, unknown>) ?? {};
  const needsConfig =
    hasEditableProps &&
    descriptor.props.some((p) => {
      if (p.type !== 'string') return false;
      if (!p.required) return false;
      if ('hidden' in p && p.hidden) return false;
      return currentProps[p.name] === '';
    });

  const showPlaceholder = shouldRenderPlaceholder(descriptor, currentProps);
  const resolvedPlaceholder = showPlaceholder ? resolveDescriptorPlaceholder(descriptor) : null;

  const isSelfClosingLeaf = !descriptor.hasChildren || !!descriptor.isSelfClosing;

  useEffect(() => {
    if (selected && !wasSelected.current && hasEditableProps && consumeAutoOpen(pos)) {
      setPopoverOpen(true);
    }
    wasSelected.current = selected;
  }, [selected, hasEditableProps, pos]);

  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.reactNodePropNames);
  const renderProps =
    descriptor.surface === 'compat' ? descriptor.translateProps(primitiveProps) : primitiveProps;
  const resetKey = `${descriptor.name}::${stableHash(primitiveProps)}`;

  const insertChildAt = () => {
    const p = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
    return p + 1 + node.content.size;
  };

  const needsConversion = descriptor.name === '*' || renderError !== null;
  const convertedRef = useRef(false);
  const retryCountRef = useRef(0);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!needsConversion || convertedRef.current || stuck) return;

    const p = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof p !== 'number') return;

    const source = reconstructSource(node);
    const reason =
      descriptor.name === '*'
        ? `Unregistered component: ${node.attrs.componentName as string}`
        : `Render error in <${descriptor.displayName ?? descriptor.name}>: ${renderError?.message ?? 'unknown'}`;

    const fallbackNode = node.type.schema.nodes.rawMdxFallback.create(
      { reason },
      node.type.schema.text(source),
    );

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const dispatchOnce = () => {
      if (cancelled) return;
      try {
        editor.view.dispatch(editor.state.tr.replaceWith(p, p + node.nodeSize, fallbackNode));
        convertedRef.current = true;
        const clampedComponent = descriptor.name === '*' ? 'wildcard' : descriptor.name;
        incrementJsxAutoConvertSucceeded(clampedComponent);
      } catch (err) {
        const clampedComponent = descriptor.name === '*' ? 'wildcard' : descriptor.name;
        console.warn(
          JSON.stringify({
            event: 'jsx-component-auto-convert-failed',
            component: clampedComponent,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
            retry: retryCountRef.current,
          }),
        );
        incrementJsxAutoConvertFailed(clampedComponent);

        retryCountRef.current += 1;
        if (retryCountRef.current < MAX_AUTO_CONVERT_RETRIES) {
          const delay = 50 * (2 ** retryCountRef.current - 1);
          timeoutId = setTimeout(() => {
            if (cancelled) return;
            dispatchOnce();
          }, delay);
        } else {
          if (!cancelled) setStuck(true);
        }
      }
    };

    const frameId = requestAnimationFrame(dispatchOnce);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [needsConversion, node, editor, getPos, descriptor, renderError, stuck]);

  if (stuck) {
    const label =
      descriptor.name === '*'
        ? `<${node.attrs.componentName as string}> isn't a known component. Copy the source to use it elsewhere, or delete the block.`
        : `<${descriptor.displayName ?? descriptor.name}> failed to render (likely a bad prop). Copy the source to see what went wrong, or delete the block.`;
    const copySource = () => {
      try {
        const src = reconstructSource(node);
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(src);
        }
      } catch (err) {
        incrementJsxStuckCopyFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-stuck-copy-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          }),
        );
      }
    };
    const deleteNode = () => {
      const p = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof p !== 'number') return;
      try {
        editor.chain().focus().setNodeSelection(p).deleteSelection().run();
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        incrementJsxStuckDeleteFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-stuck-delete-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: err.message.slice(0, 500),
          }),
        );
      }
    };
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div
          className="text-xs font-mono text-muted-foreground px-2 py-2 border border-destructive/40 rounded bg-destructive/5 flex items-center gap-2"
          contentEditable={false}
          {...{ [OPT_OUT_ATTR]: 'true' }}
        >
          <span className="flex-1">{label}</span>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={copySource}
          >
            Copy source
          </button>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={deleteNode}
          >
            Delete
          </button>
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  if (needsConversion) {
    const label =
      descriptor.name === '*'
        ? `Unknown component: ${node.attrs.componentName as string} — source editable below`
        : `${descriptor.displayName ?? descriptor.name} — render error, source editable below`;
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div className="text-xs font-mono text-muted-foreground px-2 py-1" contentEditable={false}>
          {label}
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  const Comp = descriptor.Component;

  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showPlaceholder) return;
    if (!isSelfClosingLeaf) return;
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('.jsx-component-chrome')) return;
    if (target.closest('.jsx-add-child-pill, .jsx-empty-child-placeholder')) return;
    if (typeof pos !== 'number') return;
    const curNode = editor.state.doc.nodeAt(pos);
    if (!curNode) return;
    const nodeEnd = pos + curNode.nodeSize;
    const selFrom = editor.state.selection.from;
    if (selFrom < pos || selFrom >= nodeEnd) return;
    editor.chain().focus().setNodeSelection(pos).run();
  };

  const openPanel = () => {
    const p = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof p !== 'number') return;
    editor.chain().focus().setNodeSelection(p).run();
    setPopoverOpen(true);
  };

  const componentLabel = descriptor.displayName ?? descriptor.name;
  const isGroupContainer = Boolean(descriptor.emptyChildName);
  const groupAriaLabel = isGroupContainer
    ? formatContainerAriaLabel(componentLabel, descriptor.emptyChildName, node.childCount)
    : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!selected) return;
    if (!hasEditableProps) return;
    const target = e.target as HTMLElement;
    if (target.closest('.jsx-component-chrome')) return;
    if (target.closest('input, textarea, select, button')) return;
    e.preventDefault();
    setPopoverOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setPopoverOpen(open);
    if (open) return;
    if (!isSelfClosingLeaf) return;
    requestAnimationFrame(() => {
      const p = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof p !== 'number') return;
      const curNode = editor.state.doc.nodeAt(p);
      if (!curNode) return;
      const nodeEnd = p + curNode.nodeSize;
      const selFrom = editor.state.selection.from;
      if (selFrom < p || selFrom >= nodeEnd) return;
      const $end = editor.state.doc.resolve(Math.min(nodeEnd, editor.state.doc.content.size));
      const nextSel = TextSelection.near($end, 1);
      editor.view.dispatch(editor.state.tr.setSelection(nextSel).scrollIntoView());
    });
  };

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
      <NodeViewWrapper
        className="jsx-component-wrapper my-2"
        data-jsx-component=""
        data-component-type={descriptor.name.toLowerCase()}
        data-selected={isInnermostSelected ? 'true' : undefined}
        data-has-child-selected={hasChildSelected ? 'true' : undefined}
        data-selection-origin={selectionOrigin}
        data-dragging={isDraggingSelf ? 'true' : undefined}
        data-needs-config={needsConfig ? 'true' : undefined}
        role={isGroupContainer ? 'group' : undefined}
        aria-label={groupAriaLabel}
        tabIndex={isInnermostSelected ? 0 : -1}
        {...(!isChildOfComponent
          ? { 'data-drag-handle': '', draggable: 'true' }
          : { draggable: 'false', onDragStart: (e: React.DragEvent) => e.preventDefault() })}
        data-component-name={descriptor.name}
        onClick={handleBodyClick}
        onKeyDown={handleKeyDown}
      >
        {/* Hover-revealed action icons: [↑] [↓] [⚙️] [🗑] — rendered for every
          configured component AND placeholder mode. Placeholder mode keeps the
          chrome (gear, move arrows, delete) visible because the same data-needs-config
          gear-hint UX should apply to fresh slash-inserted blocks the same way it
          does to any other unconfigured-prop block. The placeholder pill provides
          an additional click-to-open affordance via PopoverAnchor; the gear remains
          the canonical PopoverTrigger. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView */}
        <div
          className="jsx-component-chrome"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
          {...{ [OPT_OUT_ATTR]: 'true' }}
        >
          {/* Move up/down — only for children inside containers; hidden at boundaries.
            `doc.resolve(pos)` / `doc.slice(...)` can throw `RangeError` when the
            node's position is out-of-bounds because a concurrent remote peer edit
            (or an in-flight Observer B re-parse) shifted it between render and
            click. We classify that as a user-observable move failure (logged +
            counter-bumped) rather than letting it re-throw into the
            `ComponentErrorBoundary`, which would mis-attribute the click-time
            race as a `jsx-render-failure` and auto-convert this component to
            rawMdxFallback. Pattern mirrors the `isChildOfComponent` probe at L213. */}
          {canMoveUp && (
            <button
              type="button"
              className="jsx-chrome-btn"
              aria-label="Move up"
              onClick={() => {
                try {
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
                } catch (err) {
                  if (!(err instanceof RangeError)) throw err;
                  incrementJsxMoveFailed('up');
                  console.warn(
                    JSON.stringify({
                      event: 'jsx-component-move-failed',
                      direction: 'up',
                      component: descriptor.name,
                      rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                      reason: err.message.slice(0, 500),
                    }),
                  );
                }
              }}
            >
              <ArrowUp size={12} aria-hidden="true" />
            </button>
          )}

          {canMoveDown && (
            <button
              type="button"
              className="jsx-chrome-btn"
              aria-label="Move down"
              onClick={() => {
                try {
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
                } catch (err) {
                  if (!(err instanceof RangeError)) throw err;
                  incrementJsxMoveFailed('down');
                  console.warn(
                    JSON.stringify({
                      event: 'jsx-component-move-failed',
                      direction: 'down',
                      component: descriptor.name,
                      rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                      reason: err.message.slice(0, 500),
                    }),
                  );
                }
              }}
            >
              <ArrowDown size={12} aria-hidden="true" />
            </button>
          )}

          {/* Delete — positioned between move arrows and settings so the
            settings gear stays anchored at the right edge of the chrome bar
            (consistent "destructive action mid, config action far-right"
            pattern regardless of whether the component has editable props). */}
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
            <Trash2 size={12} aria-hidden="true" />
          </button>

          {/* Settings — opens the controlled PropPanel popover hoisted above
            NodeViewWrapper. `<PopoverTrigger asChild>` is the canonical click-to-
            open path. In placeholder mode the popover is positioned via the
            `<PopoverAnchor>` wrapping the placeholder pill (Anchor takes precedence
            over Trigger for placement); both paths flip the same popoverOpen state. */}
          {hasEditableProps && (
            <PopoverTrigger asChild>
              <button
                type="button"
                className="jsx-chrome-btn"
                aria-label={`${descriptor.displayName ?? descriptor.name} properties`}
              >
                <Settings2 size={12} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          )}
        </div>

        {/* Live React component — renders exactly like production.
          Self-closing / no-children components get contentEditable={false} so
          native behaviors work (links navigate, etc.). ALL other components
          stay contentEditable (PM manages the content hole).
          NOTE: typed-children containers do NOT use contentEditable={false} —
          PM's hasFocus() walks the ancestor chain and returns false if ANY
          ancestor has contentEditable='false', which breaks selection tracking,
          BubbleMenu, and all PM features for descendants. Instead, a
          filterTransaction plugin (TypedChildrenGuard) rejects unwanted
          insertions at the PM transaction level. */}
        {/*
        Reset mechanism: rely on `componentDidUpdate`'s resetKey-comparison
        branch (L107) to clear `errored` state when primitive props change.
        Previously we also set `key={resetKey}`, which forced a full remount
        of the live fumadocs subtree on every prop edit — losing component-
        local state (ImageZoom's zoom level, in-flight Radix animations)
        and making `componentDidUpdate` unreachable (key-remount always
        produces a fresh instance where prevProps === props). Keeping only
        the prop-comparison reset preserves component state on healthy
        renders and still clears the error path when the user fixes a
        prop that was causing the render to throw.
      */}
        {showPlaceholder && resolvedPlaceholder ? (
          <PopoverAnchor asChild>
            <DescriptorPlaceholder
              label={resolvedPlaceholder.label}
              Icon={resolvedPlaceholder.Icon}
              onClick={openPanel}
              selected={isInnermostSelected}
            />
          </PopoverAnchor>
        ) : (
          <ComponentErrorBoundary
            resetKey={resetKey}
            onError={setRenderError}
            descriptorName={descriptor.name === '*' ? 'wildcard' : descriptor.name}
            rawComponentName={(node.attrs.componentName as string) ?? ''}
          >
            <Comp {...renderProps}>
              <NodeViewContent
                className={`component-children ${
                  !descriptor.hasChildren && node.childCount === 0 ? 'min-h-0 m-0 p-0' : ''
                }`}
                {...(!descriptor.hasChildren || descriptor.isSelfClosing
                  ? { contentEditable: false }
                  : {})}
              />
            </Comp>
          </ComponentErrorBoundary>
        )}

        {/* "Add child" pill — absolute overlay at bottom edge (containers only) */}
        {descriptor.emptyChildName && (
          <button
            type="button"
            contentEditable={false}
            className={node.childCount === 0 ? 'jsx-empty-child-placeholder' : 'jsx-add-child-pill'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              const childName = descriptor.emptyChildName as string;
              const childJSON = createChildNode(childName);
              const insertPos = insertChildAt();
              editor.chain().focus().insertContentAt(insertPos, childJSON).run();
              focusInsertedComponent(editor, insertPos, getDescriptor(childName));
            }}
            {...{ [OPT_OUT_ATTR]: 'true' }}
          >
            <span>+ Add {descriptor.emptyChildName}</span>
          </button>
        )}
      </NodeViewWrapper>
      {/* z-[60] overrides the shadcn popover base (z-50) so the PropPanel
          reliably sits above other z-50 surfaces (wiki-link Dialog overlays,
          sonner toasts, internal-link Dialogs). The chrome bar in globals.css
          also uses z-50; a PopoverContent at the same level is ordered by
          render-order, which isn't a stable guarantee — explicit bump makes
          it deterministic. */}
      {hasEditableProps && (
        <PopoverContent
          side={showPlaceholder ? 'bottom' : 'right'}
          align={showPlaceholder ? 'center' : 'start'}
          sideOffset={showPlaceholder ? -4 : 8}
          className="w-64 p-3 z-[60]"
          onCloseAutoFocus={
            isSelfClosingLeaf
              ? (e) => {
                  e.preventDefault();
                  editor.view.focus();
                }
              : undefined
          }
        >
          <div className="text-xs font-medium text-muted-foreground mb-2">
            {descriptor.displayName ?? descriptor.name} Properties
          </div>
          <PropPanel
            descriptor={descriptor}
            values={primitiveProps}
            onChange={(propName, value) => {
              const p = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof p !== 'number') return;
              const curNode = editor.state.doc.nodeAt(p);
              if (!curNode) return;
              if (curNode.attrs.kind !== 'element') return;
              const currentNodeProps = (curNode.attrs.props as Record<string, unknown>) ?? {};
              const nextProps: Record<string, unknown> = { ...currentNodeProps };
              const currentAttributes = Array.isArray(curNode.attrs.attributes)
                ? (curNode.attrs.attributes as unknown[])
                : [];
              let nextAttributes = currentAttributes;
              if (value === undefined) {
                delete nextProps[propName];
                nextAttributes = currentAttributes.filter(
                  (a) =>
                    !(
                      a != null &&
                      typeof a === 'object' &&
                      (a as Record<string, unknown>).type === 'mdxJsxAttribute' &&
                      (a as Record<string, unknown>).name === propName
                    ),
                );
              } else {
                nextProps[propName] = value;
              }
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(p, null, {
                  ...curNode.attrs,
                  attributes: nextAttributes,
                  props: nextProps,
                  sourceDirty: true,
                }),
              );
              markUserTyping();
            }}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
