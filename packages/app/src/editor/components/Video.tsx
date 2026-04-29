/**
 * Video — DIY renderer for the lowercase `video` canonical (CB-v2-MF
 * lowercase media pivot).
 *
 * Pure HTML5 `<video>` wrapper. Self-closing leaf descriptor symmetric with
 * Image. Renders the descriptor's 11-prop surface — 6 common (src + controls
 * + autoplay + poster + width + height) + 5 advanced (title + muted + loop +
 * playsinline + preload).
 *
 * ── Constraints (load-bearing, unchanged from the prior canonical) ──────────
 *
 *   - NO URL sniffing for YouTube / Vimeo. Users embedding service-hosted
 *     video author raw `<iframe>` directly in MDX. Matches Mintlify's
 *     explicit-iframe pattern (Fumadocs has no Video component at all).
 *   - NO `start` seek prop (Mintlify + Fumadocs both omit). Seeking is
 *     runtime behavior, not a persisted authoring concern.
 *   - NO custom player chrome. HTML5 native controls are the UX. The
 *     wrapping `.ok-video` class only handles layout.
 *
 * ── Why self-closing (no `<track>` / `<source>` passthrough) ─────────────────
 *
 * HTML5 requires `<track>` and `<source>` as direct children of `<video>`.
 * ProseMirror NodeViews mandate a wrapper DOM element to host the content
 * hole (`NodeViewContent`). The two contracts are structurally
 * incompatible — any PM-children passthrough would wrap the native
 * elements in an intermediate div, which the HTML5 spec does not allow.
 *
 * Authors who need captions or codec fallback sources write raw `<video>` +
 * `<track>` HTML in MDX, which flows through the wildcard / rawMdxFallback
 * path (byte-preserving, editable as MDX source).
 *
 * ── HTML-attr lowercase ↔ React camelCase translation ────────────────────────
 *
 * Descriptor stores HTML-spec spellings (`autoplay`, `playsinline`); React's
 * `<video>` JSX type expects camelCase (`autoPlay`, `playsInline`). The
 * translation lives at the single JSX boundary below.
 *
 * ── Sanitization ─────────────────────────────────────────────────────────────
 *
 * `src` and `poster` flow through `sanitizeComponentProps` at the
 * JsxComponentView boundary (both are in `URL_PROP_NAMES`).
 */

interface VideoProps {
  src?: string;
  controls?: boolean;
  autoplay?: boolean;
  poster?: string;
  width?: number | string;
  height?: number | string;
  // advanced
  title?: string;
  muted?: boolean;
  loop?: boolean;
  playsinline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

/**
 * Resolve the `controls` prop's effective boolean. Descriptor's default is
 * `true`; defensive at runtime — explicit `false` disables controls, anything
 * else (undefined, true) enables them.
 */
function resolveControls(controls: boolean | undefined): boolean {
  return controls !== false;
}

/**
 * DIY Video. Descriptor-dispatched via `componentMap['video']`.
 */
export function Video(props: VideoProps) {
  return (
    <video
      className="ok-video"
      src={props.src}
      title={props.title}
      controls={resolveControls(props.controls)}
      autoPlay={props.autoplay}
      muted={props.muted}
      loop={props.loop}
      playsInline={props.playsinline}
      poster={props.poster}
      preload={props.preload}
      width={props.width}
      height={props.height}
    />
  );
}
