/**
 * App-specific RawMdxFallback extension — plain-DOM NodeView wired to the
 * shared InteractionLayer (US-006).
 *
 * Replaces the pre-US-006 ReactNodeViewRenderer(RawMdxFallbackView) pattern
 * with an imperative NodeView that:
 *   1. Emits data-raw-mdx-fallback + data-node-id attributes (the e2e test
 *      at `mid-type-recovery.e2e.ts` asserts `[data-raw-mdx-fallback]` so
 *      the attribute is load-bearing).
 *   2. Registers a propPanel renderer with InteractionLayer on construction
 *      and deregisters on destroy. The propPanel mounts an embedded CM6
 *      editor — see RawMdxFallbackPropPanel.tsx.
 *   3. Keeps `content: 'text*'` semantics via `contentDOM` so the Y.XmlElement
 *      identity guarantees covered by
 *      `packages/app/tests/integration/rawmdxfallback-multi-client.test.ts`
 *      remain in force.
 *
 * RAW_MDX_NAV_EVENT is re-exported here so pre-US-006 consumers
 * (EditorPane.tsx, SourceEditor.tsx) can keep their imports aimed at the
 * extension module. See `./raw-mdx-nav-event.ts` for the canonical source.
 */
import { RawMdxFallback as BaseRawMdxFallback } from '@inkeep/open-knowledge-core';
import { getInteractionLayer } from '../interaction-layer-host';
import { RawMdxFallbackPropPanel } from './RawMdxFallbackPropPanel';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from './raw-mdx-nav-event';

export { RAW_MDX_NAV_EVENT, type RawMdxNavDetail };

// Module-level monotonic counter — drives the stable `data-node-id` attribute
// used by InteractionLayer's event delegation. Mirrors the JsxComponentView
// pattern (US-007).
let __rawMdxNodeIdCounter = 0;

/**
 * Allocate a fresh stable node id for a rawMdxFallback NodeView instance.
 * Exported for monotonicity testing.
 */
export function nextRawMdxNodeId(): string {
  return `raw-mdx-${++__rawMdxNodeIdCounter}`;
}

/** Reset the counter. Test-only. */
export function __resetRawMdxNodeIdCounterForTests(): void {
  __rawMdxNodeIdCounter = 0;
}

interface BuildChipDomResult {
  dom: HTMLElement;
  contentDOM: HTMLElement;
}

/**
 * Build the plain-DOM chip structure for a rawMdxFallback NodeView.
 *
 * Exported so unit tests can exercise the DOM layout (attributes, class list,
 * contentDOM identity) without constructing a full TipTap Editor. The `doc`
 * parameter lets callers inject a mocked `document` implementation.
 */
export function buildRawMdxFallbackChipDom(params: {
  nodeId: string;
  reason: string | undefined;
  doc?: Pick<Document, 'createElement'>;
}): BuildChipDomResult {
  const docImpl: Pick<Document, 'createElement'> =
    params.doc ??
    (typeof document !== 'undefined' ? document : ({ createElement: null as never } as never));
  const dom = docImpl.createElement('div') as HTMLElement;
  dom.setAttribute('data-raw-mdx-fallback', '');
  dom.setAttribute('data-raw-badge', 'raw');
  dom.setAttribute('data-node-id', params.nodeId);
  dom.setAttribute('contenteditable', 'false');
  dom.setAttribute('role', 'button');
  dom.setAttribute('tabindex', '0');
  dom.setAttribute('aria-label', `${params.reason ?? 'Parse failed'} — click to edit`);
  dom.classList.add('raw-mdx-fallback-wrapper');
  if (params.reason) {
    dom.setAttribute('data-reason', params.reason);
  }

  const badge = docImpl.createElement('span') as HTMLElement;
  badge.classList.add('raw-mdx-fallback-badge');
  badge.textContent = 'raw';
  badge.setAttribute('aria-hidden', 'true');
  dom.appendChild(badge);

  const contentDOM = docImpl.createElement('pre') as HTMLElement;
  contentDOM.classList.add('raw-mdx-fallback-content');
  // Defensive depth: PM may still write children regardless of the outer
  // contenteditable attr; mirroring the pre-US-006 pattern keeps WYSIWYG
  // text input blocked even if the wrapper's attr is ever removed.
  contentDOM.setAttribute('contenteditable', 'false');
  dom.appendChild(contentDOM);

  return { dom, contentDOM };
}

export const RawMdxFallback = BaseRawMdxFallback.extend({
  addNodeView() {
    return ({ editor, node, getPos, HTMLAttributes }) => {
      const nodeId = nextRawMdxNodeId();
      const reason =
        (HTMLAttributes.reason as string | undefined) ?? (node.attrs.reason as string | undefined);
      const { dom, contentDOM } = buildRawMdxFallbackChipDom({ nodeId, reason });

      const safeGetPos = (): number | undefined => {
        const pos = getPos();
        return typeof pos === 'number' ? pos : undefined;
      };

      // Register with the per-editor InteractionLayer so clicks on the chip
      // surface the propPanel at editor root. Registration is idempotent per
      // the InteractionLayer contract (same nodeId overwrites).
      const layer = getInteractionLayer(editor);
      layer.register({
        type: 'rawMdxFallback',
        nodeId,
        getPos: safeGetPos,
        controls: {
          propPanel: (ctx) => (
            <RawMdxFallbackPropPanel
              editor={editor}
              getPos={safeGetPos}
              onDismiss={ctx.deactivate}
            />
          ),
        },
      });

      return {
        dom,
        contentDOM,
        ignoreMutation: () => true,
        destroy: () => {
          layer.deregister(nodeId);
        },
      };
    };
  },
});
