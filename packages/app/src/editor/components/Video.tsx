/**
 * Video — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-3 + FR-6 + D-MF12).
 *
 * Pure HTML5 `<video>` wrapper. Self-closing leaf descriptor symmetric with
 * Image. Renders the descriptor's 8-prop surface: `src`, `title`,
 * `controls`, `autoPlay`, `muted`, `loop`, `playsInline`, `poster`,
 * `preload`.
 *
 * ── D-MF12 constraints (load-bearing) ────────────────────────────────────────
 *
 *   - NO URL sniffing for YouTube / Vimeo (NG27 defers). Users embedding
 *     service-hosted video author raw `<iframe>` directly in MDX. Matches
 *     Mintlify's explicit-iframe pattern (Fumadocs has no Video component
 *     at all — no opinion to match).
 *   - NO `start` seek prop (Mintlify + Fumadocs both omit). Seeking is
 *     runtime behavior, not a persisted authoring concern.
 *   - NO custom player chrome. HTML5 native controls are the UX (NG7 "no
 *     confidently-broken chrome"). The wrapping `.ok-video` class only
 *     handles layout (max-width, rounded corners, display:block).
 *
 * ── Why self-closing (no `<track>` / `<source>` passthrough) ─────────────────
 *
 * HTML5 requires `<track>` and `<source>` as direct children of `<video>`.
 * ProseMirror NodeViews mandate a wrapper DOM element to host the content
 * hole (`NodeViewContent`). The two contracts are structurally
 * incompatible — any PM-children passthrough would wrap the native
 * elements in an intermediate div, which the HTML5 spec does not allow.
 *
 * The fix is to stop promising the passthrough: Video is a leaf
 * descriptor. Authors who need captions or codec fallback sources write
 * raw `<video>` + `<track>` HTML in MDX, which flows through the
 * wildcard / rawMdxFallback path (byte-preserving, editable as MDX
 * source). NG31 tracks the additive replacement: typed `tracks:
 * Array<TrackDef>` / `sources: Array<SourceDef>` props, gated on an
 * `array`-typed PropDef extension.
 *
 * Zero upstream-docs-lib React imports (D-MF2 / FR-6).
 *
 * ── Sanitization ─────────────────────────────────────────────────────────────
 *
 * `src` and `poster` flow through `sanitizeComponentProps` at the
 * JsxComponentView boundary (both are in `URL_PROP_NAMES`) — the Video
 * component trusts its incoming URL props at render time.
 */

interface VideoProps {
  src?: string;
  title?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  playsInline?: boolean;
  poster?: string;
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
 * DIY Video. Descriptor-dispatched via `componentMap['Video']`.
 */
export function Video(props: VideoProps) {
  return (
    <video
      className="ok-video"
      src={props.src}
      title={props.title}
      controls={resolveControls(props.controls)}
      autoPlay={props.autoPlay}
      muted={props.muted}
      loop={props.loop}
      playsInline={props.playsInline}
      poster={props.poster}
      preload={props.preload}
    />
  );
}
