/**
 * Image — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-2 + FR-6 + FR-18 + D-MF2 + D-MF3).
 *
 * Renders the descriptor's 8-prop surface: `src`, `alt`, `width`, `height`,
 * `caption`, `title`, `loading`, and `zoom`. Uses `react-medium-image-zoom`'s
 * `Zoom` wrapper for click-to-zoom + native `<dialog>` modal (the library
 * handles `prefers-reduced-motion` internally via its styles.css — imported
 * once in `main.tsx`).
 *
 * Render branches:
 *
 *   1. `caption` set + `zoom !== false` (default):
 *        <figure>
 *          <Zoom wrapElement="span" zoomMargin={20} zoomImg={{sizes: undefined}}>
 *            <img ...>
 *          </Zoom>
 *          <figcaption>{caption}</figcaption>
 *        </figure>
 *
 *   2. `caption` unset + `zoom !== false`:
 *        <Zoom wrapElement="span" ...>
 *          <img ...>
 *        </Zoom>
 *
 *   3. `zoom === false` (bare <img>, optionally inside <figure> + <figcaption>):
 *        <figure><img ...><figcaption>{caption}</figcaption></figure>
 *        OR just <img ...>
 *
 * `wrapElement="span"` is load-bearing (FR-18): HTML spec forbids `<div>`
 * inside `<p>`, and MDX parsing often lands `<Image>` inside a paragraph
 * (tight image links, markdown `![alt](src)` post-US-024 consolidation).
 * Fumadocs-ui ships the same pattern.
 *
 * `zoomMargin={20}` matches the upstream-docs-lib default — the zoom-modal's
 * padding from the viewport edge when expanded. `zoomImg={{ sizes: undefined }}`
 * forces the zoom-view image to NOT inherit the authored `sizes` attribute
 * (which would constrain the zoomed rendering to the thumbnail's breakpoints).
 *
 * `loading` defaults to `'lazy'` when undefined — matches browser-default
 * behavior for images below the fold but avoids silently loading any image
 * eagerly on mount. Authors who need above-the-fold LCP-critical images set
 * `loading="eager"` explicitly.
 *
 * Zero upstream-docs-lib React imports (D-MF2 / FR-6) — only
 * `react-medium-image-zoom` (the library the upstream docs lib wraps
 * internally; now our direct dep per US-001 / FR-16).
 *
 * Precedent #30 (all user content visible): there is no children slot — the
 * descriptor is `isSelfClosing: true`. The caption round-trips as a typed
 * string prop, not a reactnode, so γ preserves it byte-identical through
 * PropPanel edits.
 */

import Zoom from 'react-medium-image-zoom';

interface ImageProps {
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  caption?: string;
  title?: string;
  loading?: 'eager' | 'lazy';
  zoom?: boolean;
}

/**
 * Resolve the `zoom` prop's effective boolean. Descriptor's default is `true`
 * (via defaultValue on the enum), but defensive: treat `undefined` as true so
 * callers that bypass the descriptor still get zoom by default.
 */
function resolveZoom(zoom: boolean | undefined): boolean {
  return zoom !== false;
}

/**
 * Resolve the `loading` attribute with a `'lazy'` default.
 */
function resolveLoading(loading: 'eager' | 'lazy' | undefined): 'eager' | 'lazy' {
  return loading ?? 'lazy';
}

/**
 * Bare `<img>` — used both by the zoom-wrapped path (as the <Zoom> child)
 * and by the `zoom={false}` path (as the leaf inside or outside <figure>).
 */
function BareImg(props: ImageProps) {
  return (
    <img
      src={props.src}
      alt={props.alt ?? ''}
      width={props.width}
      height={props.height}
      title={props.title}
      loading={resolveLoading(props.loading)}
    />
  );
}

/**
 * DIY Image. Descriptor-dispatched via `componentMap['Image']`.
 *
 * The `Zoom` wrapper accepts a React child element; when the child is an
 * `<img>` the library reads its `src` to build the zoom-view. No manual
 * `zoomImg.src` plumbing needed — the library reflects the child `<img>`
 * src by default; we only override `sizes` to `undefined` so the zoom-view
 * doesn't inherit a thumbnail-scoped sizes attribute (see FR-18 pattern).
 */
export function Image(props: ImageProps) {
  const zoomEnabled = resolveZoom(props.zoom);
  const hasCaption = typeof props.caption === 'string' && props.caption.length > 0;

  const img = <BareImg {...props} />;

  const content = zoomEnabled ? (
    <Zoom wrapElement="span" zoomMargin={20} zoomImg={{ sizes: undefined }}>
      {img}
    </Zoom>
  ) : (
    img
  );

  if (hasCaption) {
    return (
      <figure className="ok-image">
        {content}
        <figcaption className="ok-image-caption">{props.caption}</figcaption>
      </figure>
    );
  }

  return content;
}
