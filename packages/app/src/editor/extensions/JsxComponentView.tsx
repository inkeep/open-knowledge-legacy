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
 *   Branch 3 (Invalid-state): error badge + editable NodeViewContent (Precedent #26).
 *
 * Per Precedent #26: NodeViewContent is ALWAYS rendered, never display:none.
 */

import type { NodeViewProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { ArrowDown, ArrowUp, Settings2, Trash2 } from 'lucide-react';
import React, { type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover.tsx';
import { EditorContextProvider } from '../components/EditorContext.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import { markUserTyping } from '../observers.ts';
import { getDescriptor } from '../registry/index.ts';
import {
  consumeAutoOpen,
  createChildNode,
  focusInsertedComponent,
} from '../slash-command/component-items.ts';
import { reconstructSource } from '../utils/reconstruct-source.ts';
import { sanitizeComponentProps } from '../utils/sanitize-url.ts';

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
/**
 * Insertion-order-independent stringification. Sorts keys recursively so
 * `{a:1, b:2}` and `{b:2, a:1}` hash to the same string.
 *
 * Does NOT dedupe circular references — PM attr trees are acyclic by
 * construction, so a cycle here would be a bug worth surfacing.
 */
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
  // Render-layer XSS mitigation: strip javascript:/vbscript:/data: URLs from
  // URL-typed props (href, src, action, ...) before they reach live React.
  // Storage (Y.Text, XmlFragment, shadow repo) retains the raw bytes per the
  // NG4 fidelity contract — only the live render is sanitized.
  return sanitizeComponentProps(result);
}

// ── Main NodeView ───────────────────────────────────────────────────────

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
    // PM `doc.resolve(pos)` throws RangeError when the position is outside
    // the current doc — happens during teardown (getPos() returns a stale
    // position after the node was detached) and during the recycle race
    // where the ProseMirror view rebuilds mid-render. Both are expected;
    // re-throwing would blow up the ErrorBoundary and mask real bugs.
    // Anything other than RangeError is unexpected — surface it.
    if (!(err instanceof RangeError)) throw err;
  }
  const canMoveUp = isChildOfComponent && siblingIndex > 0;
  const canMoveDown = isChildOfComponent && siblingIndex < siblingCount - 1;

  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  // needsConfig = at least one STRING prop is an explicit empty `''`. Used as
  // a passive visual hint: the chrome bar surfaces the gear without hover
  // (via `data-needs-config` CSS rule in globals.css). Clears as soon as
  // every string prop has a non-empty value.
  //
  // Scoping rationale:
  //   - boolean / number / enum props have sensible defaults from
  //     `getDefaultProps` (false / 0 / first enum value) — defaulting is
  //     intentional, not "unconfigured."
  //   - `undefined` string values come from authored markdown that simply
  //     doesn't write that attr (e.g. `<Callout type="info">` omits title).
  //     Hinting there would nag on every well-formed, render-complete
  //     callout. So we only flag explicit `''`, which is what
  //     `getDefaultProps` stamps on fresh slash-inserts.
  const currentProps = (node.attrs.props as Record<string, unknown>) ?? {};
  const needsConfig =
    hasEditableProps &&
    descriptor.props.some((p) => {
      if (p.type !== 'string') return false;
      if ('hidden' in p && p.hidden) return false;
      return currentProps[p.name] === '';
    });

  // Auto-open popover when: (1) component becomes selected AND (2) the
  // pendingAutoOpen flag is set. Uses controlled state so it works across
  // React re-renders (defaultOpen only reads on first mount).
  useEffect(() => {
    if (selected && !wasSelected.current && hasEditableProps && consumeAutoOpen(pos)) {
      setPopoverOpen(true);
    }
    wasSelected.current = selected;
  }, [selected, hasEditableProps, pos]);

  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.props);
  // Stable reset key for the ErrorBoundary. `JSON.stringify` on an arbitrary
  // props object produced a string whose content was key-order-sensitive
  // across engines — combined with the post-edit re-serialization that
  // mutates `primitiveProps`'s property insertion order (spread + overwrite),
  // the key changed between renders even when the prop values didn't, and
  // the ErrorBoundary (and therefore PropPanel) remounted mid-typing,
  // stealing focus from the active input. Sort keys so two objects with the
  // same (key, value) pairs hash to the same string regardless of insertion
  // order.
  const resetKey = `${descriptor.name}::${stableHash(primitiveProps)}`;

  // Shared: compute child insertion position (inside container, after last child)
  const insertChildAt = () => {
    const p = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
    return p + 1 + node.content.size;
  };

  // ── Auto-convert to rawMdxFallback for wildcard + render errors ────────
  // Fires once on mount (guarded by convertedRef). The rawMdxFallback CM
  // handles source editing + re-parse on commit.
  const needsConversion = descriptor.name === '*' || renderError !== null;
  const convertedRef = useRef(false);
  useEffect(() => {
    if (!needsConversion || convertedRef.current) return;
    convertedRef.current = true;

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

    // Defer to next frame to avoid dispatching during render. Tracked + cancelled
    // on cleanup so an unmount between schedule and fire (e.g., parent tree
    // replaced by a remote peer edit) does not dispatch against a stale view.
    const frameId = requestAnimationFrame(() => {
      try {
        editor.view.dispatch(editor.state.tr.replaceWith(p, p + node.nodeSize, fallbackNode));
      } catch (err) {
        // Position may have changed if other transactions fired.
        // Log as a structured event so recurring failures are visible in
        // telemetry — the convertedRef guard prevents re-entry, but a
        // swallowed exception here would otherwise leave the user on the
        // "opening source editor..." placeholder with no signal.
        console.warn(
          JSON.stringify({
            event: 'jsx-component-auto-convert-failed',
            component: node.attrs.componentName,
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [needsConversion, node, editor, getPos, descriptor, renderError]);

  // Show placeholder while conversion is pending
  if (needsConversion) {
    const label =
      descriptor.name === '*'
        ? `Unknown: ${node.attrs.componentName as string}`
        : `${descriptor.displayName ?? descriptor.name} — render error`;
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div className="text-xs font-mono text-muted-foreground px-2 py-1" contentEditable={false}>
          {label} — opening source editor...
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // ── BRANCH 2: Registered healthy render ───────────────────────────────
  const Comp = descriptor.Component;

  // For components with no editable children (Card, File, ImageZoom, …), a
  // click on the rendered body would otherwise land the caret in the node's
  // empty content hole — the user then sees "stuck caret" chrome with no
  // visible cursor and no productive keystrokes. Instead: NodeSelect the
  // component so the chrome highlights and the user can act via arrows /
  // Delete / the gear popover. Uses `onClick` (runs after PM's mousedown
  // has committed) rather than `onMouseDown` (would clobber HTML5 drag).
  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (descriptor.hasChildren && !descriptor.isSelfClosing) return;
    const target = e.target as HTMLElement;
    // React events bubble through the React tree including portals, so
    // clicks on inputs inside Radix Popover/Dialog content reach this
    // handler even though those nodes live at document.body. Filter to
    // clicks that are actually inside this wrapper's DOM — otherwise the
    // `setNodeSelection().focus()` below steals focus from the popover's
    // inputs and the user can't type into the PropPanel.
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

  // WCAG 2.1.1 keyboard-equivalent to the click-to-select path. When the
  // block is NodeSelected (via arrow-key L2 nav in KeyboardNav), pressing
  // Enter/Space opens the PropPanel if the descriptor has editable props —
  // mirroring what clicking the gear does with a mouse. For container
  // components with editable children, the default NodeSelection → Enter
  // PM behavior (enter the content hole) is preserved by only handling
  // the key when editable props exist.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!selected) return;
    if (!hasEditableProps) return;
    // Allow keystrokes inside the chrome / child inputs to bubble normally.
    const target = e.target as HTMLElement;
    if (target.closest('.jsx-component-chrome')) return;
    if (target.closest('input, textarea, select, button')) return;
    e.preventDefault();
    setPopoverOpen(true);
  };

  return (
    <NodeViewWrapper
      className={`jsx-component-wrapper my-2 ${selected ? 'is-selected' : ''}`}
      data-needs-config={needsConfig ? 'true' : undefined}
      {...(!isChildOfComponent
        ? { 'data-drag-handle': '', draggable: 'true' }
        : { draggable: 'false', onDragStart: (e: React.DragEvent) => e.preventDefault() })}
      data-component-name={descriptor.name}
      data-tab-value={((node.attrs.props as Record<string, unknown>)?.value as string) ?? ''}
      onClick={handleBodyClick}
      onKeyDown={handleKeyDown}
    >
      {/* Hover-revealed action icons: [↑] [↓] [⚙️] [🗑] */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView */}
      <div
        className="jsx-component-chrome"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Move up/down — only for children inside containers; hidden at boundaries */}
        {canMoveUp && (
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
            <ArrowUp size={12} />
          </button>
        )}

        {canMoveDown && (
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
            <ArrowDown size={12} />
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
          <Trash2 size={12} />
        </button>

        {/* Settings → Popover PropPanel (shown whenever the descriptor has
            any non-hidden, non-reactnode prop — even if the user hasn't set
            a value yet; empty-prop state is a valid config entry point). */}
        {hasEditableProps && (
          <Popover
            open={popoverOpen}
            onOpenChange={(open) => {
              setPopoverOpen(open);
              // When the popover closes for a component with no editable
              // children (Card, File, ImageZoom, …), the caret may still be
              // on/inside the node. Defer to the next frame so PM's click
              // handler settles first, then — if the caret is still within
              // the node's range — advance it to the NEAREST VALID TEXT
              // POSITION forward.
              //
              // We used to `setTextSelection(pos + node.nodeSize)`. That
              // fails when the node sits inside a typed-children container
              // like `<Cards>`: `pos + nodeSize` is a block boundary inside
              // `Cards` (parent == Cards, not a textblock). Typing there
              // wraps the keystroke in a paragraph and inserts the paragraph
              // into `Cards` — bypassing `typedChildrenGuard`, which only
              // fires when `$pos.depth === depth + 1` (i.e. inside a child
              // textblock). Traced via agent-browser: pos 29 resolves with
              // parent=Cards and isTextblock=false; the next textblock is
              // one step forward at pos 30 (the "After card." paragraph).
              //
              // `TextSelection.near($pos, 1)` walks forward past block
              // boundaries to a real text position, so typing lands in the
              // next paragraph instead of inside the container.
              if (open) return;
              if (descriptor.hasChildren && !descriptor.isSelfClosing) return;
              requestAnimationFrame(() => {
                const p = typeof getPos === 'function' ? getPos() : undefined;
                if (typeof p !== 'number') return;
                const curNode = editor.state.doc.nodeAt(p);
                if (!curNode) return;
                const nodeEnd = p + curNode.nodeSize;
                const selFrom = editor.state.selection.from;
                if (selFrom < p || selFrom >= nodeEnd) return;
                const $end = editor.state.doc.resolve(
                  Math.min(nodeEnd, editor.state.doc.content.size),
                );
                const nextSel = TextSelection.near($end, 1);
                editor.view.dispatch(editor.state.tr.setSelection(nextSel).scrollIntoView());
                editor.view.focus();
              });
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="jsx-chrome-btn"
                aria-label={`${descriptor.displayName ?? descriptor.name} properties`}
              >
                <Settings2 size={12} />
              </button>
            </PopoverTrigger>
            {/* z-[60] overrides the shadcn popover base (z-50) so the
                PropPanel reliably sits above other z-50 surfaces (wiki-link
                Dialog overlays, sonner toasts, internal-link Dialogs). The
                chrome bar in globals.css also uses z-50; a PopoverContent
                at the same level is ordered by render-order, which isn't a
                stable guarantee — an explicit bump makes it deterministic. */}
            <PopoverContent side="right" align="start" sideOffset={8} className="w-64 p-3 z-[60]">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {descriptor.displayName ?? descriptor.name} Properties
              </div>
              <PropPanel
                props={descriptor.props}
                values={primitiveProps}
                onChange={(propName, value) => {
                  // Update the node at its live position — NOT via
                  // `editor.commands.updateAttributes`, which targets the
                  // *current selection*. When the PropPanel popover has an
                  // input focused, the PM selection has already moved off
                  // this Card (the editor loses focus to the portal input),
                  // so selection-based updateAttributes silently no-ops and
                  // every keystroke disappears. `setNodeMarkup(pos, ...)`
                  // targets the node at its position regardless of where
                  // the selection is now.
                  const p = typeof getPos === 'function' ? getPos() : undefined;
                  if (typeof p !== 'number') return;
                  const curNode = editor.state.doc.nodeAt(p);
                  if (!curNode) return;
                  const currentProps = (curNode.attrs.props as Record<string, unknown>) ?? {};
                  editor.view.dispatch(
                    editor.state.tr.setNodeMarkup(p, null, {
                      ...curNode.attrs,
                      props: { ...currentProps, [propName]: value },
                      sourceDirty: true,
                    }),
                  );
                  markUserTyping();
                }}
              />
            </PopoverContent>
          </Popover>
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
      <ComponentErrorBoundary key={resetKey} resetKey={resetKey} onError={setRenderError}>
        <EditorContextProvider value={editor}>
          <Comp {...primitiveProps}>
            <NodeViewContent
              className={`component-children ${
                !descriptor.hasChildren && node.childCount === 0 ? 'min-h-0 m-0 p-0' : ''
              }`}
              {...(!descriptor.hasChildren || descriptor.isSelfClosing
                ? { contentEditable: false }
                : {})}
            />
          </Comp>
        </EditorContextProvider>
      </ComponentErrorBoundary>

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
