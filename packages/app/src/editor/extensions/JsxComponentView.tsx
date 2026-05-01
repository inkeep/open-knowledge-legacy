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
import { OPT_OUT_ATTR } from '../clipboard/clipboard-sanitize.ts';
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

// ── Error Boundary ──────────────────────────────────────────────────────
//
// Thin wrapper around `react-error-boundary`'s `<ErrorBoundary>` — same
// pattern as `packages/app/src/components/DocumentErrorBoundary.tsx`. The
// prior hand-rolled `class ComponentErrorBoundary` carried its own
// `getDerivedStateFromError` / `componentDidCatch` / `componentDidUpdate`
// trio that duplicated library semantics for no behavioral gain. This
// refactor collapses both error boundaries onto the same contract:
//
//   <ErrorBoundary fallbackRender resetKeys={[resetKey]} onError> …
//
// Fallback: renders the original children wrapped in
// `.jsx-component-error-fallback` (preserves the "surface the source so
// users can edit out of error state" UX from Precedent #30). When
// `resetKey` flips (prop change, node-name change, auto-convert reset —
// see the orchestrating effect at `resetKey` computation), the library
// auto-remounts the subtree.

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  /** Flips when we want to force a retry (prop change, node-name change,
   *  post-auto-convert reset). Threaded into `resetKeys`. */
  resetKey: string;
  /** Escalates errored state out to the NodeView so the chrome can react
   *  (show "failed to render" hint, offer copy-source / delete affordances
   *  via the stuck-state UI). */
  onError: (error: Error) => void;
  /** Registered descriptor name ('Callout', 'img', 'video', 'audio',
   *  'Accordion', or 'wildcard'). Low-cardinality label — safe for
   *  telemetry aggregation. */
  descriptorName: string;
  /** Raw user-authored component name; may be arbitrary MDX text. Kept in
   *  a separate field (not a label) so telemetry aggregation does not
   *  explode cardinality across tenants. Capped at 200 chars inside the
   *  onError handler before emission (MDX permits arbitrarily-long
   *  dotted-namespace tags that would otherwise produce multi-KB log
   *  entries per error). */
  rawComponentName: string;
}

function ComponentErrorFallback({ children }: FallbackProps & { children?: ReactNode }) {
  // react-error-boundary's FallbackProps (error, resetErrorBoundary) are
  // intentionally ignored here — Precedent #30 says errored blocks render
  // their children (source text) in place, not an error card. The CSS
  // class + the resetKeys-driven remount handle the visual recovery
  // story; the children passed through are the original subtree, which
  // renders as nested rawMdxFallback source under the wildcard path.
  return <div className="jsx-component-error-fallback">{children}</div>;
}

function ComponentErrorBoundary(props: ComponentErrorBoundaryProps) {
  const { children, resetKey, onError, descriptorName, rawComponentName } = props;
  return (
    <ErrorBoundary
      resetKeys={[resetKey]}
      onError={(error, info) => {
        // react-error-boundary types `error` as `unknown` because React can
        // capture arbitrary thrown values (strings, null, etc.). Normalize
        // to Error for both telemetry + the upstream onError contract.
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

/**
 * Extract primitive (non-reactnode) props from PM node attrs.
 * `reactNodeNames` is the descriptor's pre-computed set of reactnode-typed
 * prop names — stable per descriptor, cached at registry build time so we
 * don't re-allocate per render (see `registry/types.ts`).
 *
 * Every returned object flows through `sanitizeComponentProps`, which:
 *   - Strips javascript:/vbscript:/data: URLs from URL-typed props
 *     (case-insensitive match, covers React camelCase formAction/xlinkHref).
 *   - Drops dangerouslySetInnerHTML / on* event handlers / React internals.
 *   - Filters `url(javascript:…)` / `expression(…)` from style strings and
 *     drops non-string style values (MDX-expression-authored style objects
 *     bypass the string scanner).
 *   - Traverses nested URL-shaped keys in arrays / plain objects (bounded).
 *
 * Storage (Y.Text, XmlFragment, shadow repo) retains the raw bytes per the
 * storage-layer fidelity contract — only the live render is sanitized.
 */
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

// ── Main NodeView ───────────────────────────────────────────────────────

/**
 * How many times the auto-convert effect retries its `replaceWith` dispatch
 * before falling through to the stuck-state UX. Observed failure shapes are
 * all transient position races (remote peer edit shifts the target range,
 * Observer B re-parse lands mid-flight), so three attempts over ~350ms is
 * long enough to clear every realistic contention window without keeping
 * the user on a dead placeholder if something deeper is wrong.
 */
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

  // Selection layer (Precedent #31): read canonical block-selection state
  // from SelectionStatePlugin and derive this wrapper's role.
  //
  //  - isInnermostSelected: THIS wrapper is the selected block. Paints halo.
  //  - hasChildSelected:    THIS wrapper is an ancestor of the selected block.
  //                         Gets `data-has-child-selected` so the CSS layer
  //                         can hide its own halo in favor of the innermost
  //                         (Gutenberg-style innermost-wins, store-driven
  //                         rather than `:has()`-based — Precedent #32).
  //  - selectionOrigin:     How the user arrived at this selection
  //                         ('keyboard' | 'pointer' | 'programmatic').
  //                         Plumbed-through for future keyboard-only focus-
  //                         ring differentiation; no v1 visual treatment.
  //  - isDragging:          An HTML5 drag is active; suppress the halo.
  //
  // Plugin may not be registered during intermediate build states —
  // `useBlockSelection` then returns EMPTY (all flags off).
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

  // STRICTER than `needsConfig`: only fires when the descriptor's autoFocus
  // string prop is empty. `needsConfig` also flags `alt=''` on a fully
  // rendered image and drives the chrome-bar gear nudge — conflating the two
  // would regress images with valid src + empty alt into placeholder mode.
  const showPlaceholder = shouldRenderPlaceholder(descriptor, currentProps);
  const resolvedPlaceholder = showPlaceholder ? resolveDescriptorPlaceholder(descriptor) : null;

  // Single source of truth for the three sites (handleBodyClick / handleOpenChange /
  // onCloseAutoFocus) that gate behavior on "this descriptor renders as a leaf with
  // no editable content hole" (img / video / audio). Drift between sites silently
  // breaks focus + selection for one descriptor class.
  const isSelfClosingLeaf = !descriptor.hasChildren || !!descriptor.isSelfClosing;

  // Auto-open popover when: (1) component becomes selected AND (2) the
  // pendingAutoOpen flag is set. Uses controlled state so it works across
  // React re-renders (defaultOpen only reads on first mount). `wasSelected`
  // ref prevents double-fire under Strict Mode; explicit deps ensure the
  // effect only runs when one of the watched values actually changes.
  useEffect(() => {
    if (selected && !wasSelected.current && hasEditableProps && consumeAutoOpen(pos)) {
      setPopoverOpen(true);
    }
    wasSelected.current = selected;
  }, [selected, hasEditableProps, pos]);

  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.reactNodePropNames);
  // Compat descriptors render through their canonical's React component via
  // a render-time prop translation. `translateProps` is identity for v1's
  // three compat descriptors (their prop names already match canonical) but
  // the seam exists for future compats whose source spelling differs from
  // canonical (e.g., a hypothetical Mintlify Note → Callout mapping that
  // renames `title` to `heading` without changing storage).
  const renderProps =
    descriptor.surface === 'compat' ? descriptor.translateProps(primitiveProps) : primitiveProps;
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
  // Fires once after the dispatch actually lands. The rawMdxFallback CM
  // handles source editing + re-parse on commit.
  //
  // `convertedRef` is flipped INSIDE the rAF callback (after the successful
  // dispatch), not before scheduling it. Under React 19 StrictMode, every
  // effect runs → cleanup → remounts-and-reruns. If the ref were flipped
  // pre-dispatch, the StrictMode cleanup `cancelAnimationFrame` would cancel
  // the only dispatch attempt and the remount's effect would early-return
  // (convertedRef already true → skip) — leaving the user stuck on the
  // "opening source editor..." placeholder forever. Flipping the ref
  // post-dispatch means the first rAF that actually lands wins; cancelled
  // rAFs don't count toward "already converted."
  //
  // The `cancelled` closure flag makes this re-entry-safe: if a fast
  // re-render triggers the effect twice before the first rAF fires, only
  // the first dispatch succeeds; the second sees `cancelled === true` from
  // its own cleanup and skips. Local to the effect invocation, so a
  // cancelled first run doesn't block a subsequent run's dispatch.
  //
  // Bounded retry: on dispatch failure (position went stale under a remote
  // peer edit, Observer B re-parse, etc.) we schedule up to MAX_AUTO_CONVERT_RETRIES
  // backoff attempts before giving up. Without a retry schedule, nothing
  // guarantees a subsequent re-render fires — a quiescent doc with a latent
  // failing condition would leave the user on the non-editable placeholder
  // forever (no retry signal, no React re-render trigger). After retries
  // exhaust, the placeholder swaps to a stuck-state UX with Delete + Copy
  // source affordances so the user can recover without blaming the editor.
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
        // Position may have changed if other transactions fired.
        // Log as a structured event so recurring failures are visible in
        // telemetry — a swallowed exception here would otherwise leave the
        // user on the "opening source editor..." placeholder with no signal.
        const clampedComponent = descriptor.name === '*' ? 'wildcard' : descriptor.name;
        console.warn(
          JSON.stringify({
            event: 'jsx-component-auto-convert-failed',
            // Low-cardinality label for aggregation — always registered
            // descriptor name or literal 'wildcard'. Raw user text goes in
            // rawComponentName (see also ComponentErrorBoundary). Capped at
            // 200 chars to match the slicing pattern used elsewhere for
            // user-authored names in log payloads.
            component: clampedComponent,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
            retry: retryCountRef.current,
          }),
        );
        incrementJsxAutoConvertFailed(clampedComponent);

        retryCountRef.current += 1;
        if (retryCountRef.current < MAX_AUTO_CONVERT_RETRIES) {
          // Exponential-ish backoff: 50ms, 150ms, 350ms. Short enough to
          // feel instant in the typical case where a concurrent tx cleared
          // on the next tick; long enough to not hammer the event loop.
          const delay = 50 * (2 ** retryCountRef.current - 1);
          timeoutId = setTimeout(() => {
            if (cancelled) return;
            dispatchOnce();
          }, delay);
        } else {
          // Retries exhausted — surface the stuck-state UX so the user
          // can Delete / Copy source instead of sitting on a dead placeholder.
          if (!cancelled) setStuck(true);
        }
      }
    };

    // Defer to next frame to avoid dispatching during render. Tracked +
    // cancelled on cleanup so an unmount between schedule and fire (e.g.,
    // parent tree replaced by a remote peer edit, or StrictMode's
    // intentional unmount-remount) does not dispatch against a stale view.
    const frameId = requestAnimationFrame(dispatchOnce);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [needsConversion, node, editor, getPos, descriptor, renderError, stuck]);

  // Stuck-state UX: retries exhausted. The user sees a durable placeholder
  // with "Delete" and "Copy source" affordances so they can recover without
  // being trapped on a dead placeholder. Precedent #28 is preserved — the
  // source bytes are available via Copy source even when the auto-convert
  // can't land.
  if (stuck) {
    // Use action-oriented copy instead of internal jargon ("could not open
    // source editor"). The stuck state is the highest-friction UX moment
    // in the feature — the label should explain the recovery bridge (copy
    // → close → paste elsewhere), not name an internal subsystem the user
    // has never encountered.
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
        // Clipboard API may be unavailable (permissions, test env). The
        // Delete affordance still works, and the source bytes are safe in
        // the underlying node regardless of clipboard access — log at
        // debug for operator visibility so the stuck-state UX leaves a
        // support trail. The structured warn lets ops compute a
        // recovery-success rate against the existing jsxAutoConvertFailed
        // denominator.
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
        // Position races (concurrent remote peer edit, Observer B re-parse
        // shift) are the expected failure shape — classify + log so the
        // stuck-state last-line-of-defense leaves a correlatable trail.
        // Matches the Move Up/Down handler telemetry in the chrome bar so
        // ops can aggregate against a consistent denominator.
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

  // Show placeholder while the auto-convert rAF (above) dispatches. This
  // usually flashes for < 1 frame and is invisible; a slow hot-reload on
  // a large doc can surface it. Copy is action-oriented ("source editable
  // below") so even when it does surface, the user reads a meaningful
  // next step rather than implementation jargon.
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

  // ── BRANCH 2: Registered healthy render ───────────────────────────────
  const Comp = descriptor.Component;

  // For components with no editable children (self-closing like Image, …), a
  // click on the rendered body would otherwise land the caret in the node's
  // empty content hole — the user then sees "stuck caret" chrome with no
  // visible cursor and no productive keystrokes. Instead: NodeSelect the
  // component so the chrome highlights and the user can act via arrows /
  // Delete / the gear popover. Uses `onClick` (runs after PM's mousedown
  // has committed) rather than `onMouseDown` (would clobber HTML5 drag).
  // Placeholder-mode click is owned by `<DescriptorPlaceholder onClick>` —
  // skip the wrapper-level handler so setNodeSelection does not double-fire
  // alongside `openPanel`'s own selection + popover-open.
  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showPlaceholder) return;
    if (!isSelfClosingLeaf) return;
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

  // Click-on-placeholder: NodeSelect this block (so chrome / breadcrumb
  // reflect it) and open the controlled popover. No rAF-defer needed (unlike
  // the slash-insert auto-open path) — the click is user-event-time and the
  // NodeView is already mounted, so `setNodeSelection` + `setPopoverOpen` can
  // dispatch synchronously.
  const openPanel = () => {
    const p = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof p !== 'number') return;
    editor.chain().focus().setNodeSelection(p).run();
    setPopoverOpen(true);
  };

  // ARIA: role="group" for typed-children containers, with a descriptive
  // aria-label summarizing content. Screen readers announce on focus/select.
  // See precedent "A11y codified in the selection plugin, not retrofitted
  // per-block" and its consumers (Breadcrumb, SelectionAnnouncer).
  //
  // Descriptor display text is English (all descriptors ship with
  // English labels). Pluralization uses locale-neutral "with N items"
  // shapes that avoid inflecting the descriptor's child name — every
  // string change goes through the `editor-strings.ts` helpers so a
  // future i18n pass has a single place to swap.
  const componentLabel = descriptor.displayName ?? descriptor.name;
  const isGroupContainer = Boolean(descriptor.emptyChildName);
  const groupAriaLabel = isGroupContainer
    ? formatContainerAriaLabel(componentLabel, descriptor.emptyChildName, node.childCount)
    : undefined;

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

  // Self-closing component close-handler: advance the caret past the node via
  // `TextSelection.near` so typing doesn't land on the NodeSelection. `near` is
  // load-bearing — `setTextSelection(pos+nodeSize)` can land on a block boundary
  // (parent is a block container, not a textblock) so typing wraps in a new
  // paragraph. Defer to rAF so PM's click handler settles first.
  //
  // DOM focus is owned by `onCloseAutoFocus` on `<PopoverContent>` below.
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
        // Stable test-selector contract, decoupled from `className` (which can
        // change for visual reasons). Tests that target "every component
        // wrapper" use `[data-jsx-component]` — do not remove without
        // updating `packages/app/tests/a11y/component-blocks.e2e.ts` etc.
        data-jsx-component=""
        data-component-type={descriptor.name.toLowerCase()}
        data-selected={isInnermostSelected ? 'true' : undefined}
        data-has-child-selected={hasChildSelected ? 'true' : undefined}
        data-selection-origin={selectionOrigin}
        data-dragging={isDraggingSelf ? 'true' : undefined}
        data-needs-config={needsConfig ? 'true' : undefined}
        // `aria-selected` is intentionally omitted — per WAI-ARIA 1.2, it's
        // only valid on `role` values that support selection semantics
        // (option, tab, row, gridcell, treeitem, columnheader, rowheader).
        // Our wrappers carry `role="group"` (for emptyChildName containers)
        // or no role (for generic block components). Emitting `aria-selected`
        // on those roles is an ARIA conformance violation caught by axe-core.
        // Selection announcement to AT is handled via the `<SelectionAnnouncer>`
        // aria-live region (SPEC §3.6) which works regardless of wrapper role.
        role={isGroupContainer ? 'group' : undefined}
        aria-label={groupAriaLabel}
        // Roving tabindex (W3C ARIA Authoring Practices, "Composite Widgets"):
        // exactly one wrapper per editor is in the document tab order at a
        // time — the currently-selected one. Without this, every top-level
        // jsxComponent created an O(N) Tab cost before the user could reach
        // anything outside the editor (Breadcrumb buttons, presence bar). The
        // wrappers remain reachable via PM's NodeSelection arrow-nav; Tab
        // stays a "leave the editor" affordance, not "step through every
        // block." Matches Gutenberg / Lexical block-editor conventions.
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
          // No NodeViewContent here for the same reason the healthy branch's
          // Image / Video / Audio components silently drop children: the
          // descriptors that surface the placeholder are self-closing leaves
          // (`hasChildren: false`), so PM never has block children to map.
          // The slot's absence here matches Branch 2 for self-closing leaves;
          // Precedent #30's "always rendered" obligation lives downstream in
          // the renderer that does have children to host (Callout / Accordion).
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
        // Placeholder mode anchors the popover via PopoverAnchor on the full-
        // width pill, so the right-of-the-gear placement that suits a
        // configured component reads as off-center and disconnected. Drop the
        // popover under the pill, centered horizontally, with a small negative
        // sideOffset so the top of the popover overlaps the bottom of the
        // pill — Notion-style continuation between affordance and form.
        <PopoverContent
          side={showPlaceholder ? 'bottom' : 'right'}
          align={showPlaceholder ? 'center' : 'start'}
          sideOffset={showPlaceholder ? -4 : 8}
          className="w-64 p-3 z-[60]"
          // Self-closing leaves (img/video/audio) want the caret back in the
          // editor body so the user can keep typing — the Notion-style
          // "fill prop → Escape → continue" loop. Radix's default close-time
          // focus restore points at `previouslyFocusedElement` captured when
          // the popover mounted, which is typically the gear button or a
          // now-detached slash-menu element; keystrokes after Escape land
          // there and silently vanish until the user clicks back into the
          // editor. Container components (Callout/Accordion) keep Radix's
          // default — their content hole already pulls focus naturally.
          //
          // Runs inside Radix's setTimeout(0) close-tick, which beats the
          // rAF-deferred caret-advance in handleOpenChange and any other
          // racing focus calls. preventDefault on the unmount-auto-focus
          // event tells FocusScope to skip its own focus() restore.
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
              // Update the node at its live position — NOT via
              // `editor.commands.updateAttributes`, which targets the
              // *current selection*. When the PropPanel popover has an input
              // focused, the PM selection has already moved off this Card
              // (the editor loses focus to the portal input), so
              // selection-based updateAttributes silently no-ops and every
              // keystroke disappears. `setNodeMarkup(pos, ...)` targets the
              // node at its position regardless of where the selection is now.
              const p = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof p !== 'number') return;
              const curNode = editor.state.doc.nodeAt(p);
              if (!curNode) return;
              // Defense at the write boundary: PropPanel writes only target
              // `kind: 'element'` nodes. Today PropPanel never opens for
              // `kind: 'expression'` nodes (their componentName is empty,
              // which falls through to the wildcard descriptor with empty
              // `props`, so `hasEditableProps` is false). If a future
              // refactor changes that gate (e.g., custom PropPanel for
              // expression blocks), this spread would otherwise stamp
              // element-shaped attrs onto an expression node and the
              // serializer at `markdown/index.ts:jsxComponent` would silently
              // emit `sourceRaw` verbatim, dropping every PropPanel edit.
              if (curNode.attrs.kind !== 'element') return;
              const currentNodeProps = (curNode.attrs.props as Record<string, unknown>) ?? {};
              // `undefined` means "clear this prop" — we DELETE the key
              // rather than storing `{[propName]: undefined}`. If we kept
              // the undefined entry, `reconstructAttrs` would serialize it
              // as a boolean-shorthand attr (`<Image width />`) via
              // `propToMdxJsxAttribute`'s `value == null` branch. PropPanel
              // passes undefined when the user backspaces a numeric input to
              // empty for an optional prop. We ALSO filter the matching
              // entry out of the preserved `attributes` array so the
              // dirty-path reconstruction in `reconstructAttrs` doesn't
              // re-emit the original (stale) value.
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
