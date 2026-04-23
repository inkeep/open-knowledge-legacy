/**
 * Video — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-3 + FR-6 + D-MF12).
 *
 * Pure HTML5 `<video>` wrapper. Renders the descriptor's 9-prop surface:
 * `src`, `title`, `controls`, `autoPlay`, `muted`, `loop`, `playsInline`,
 * `poster`, `preload` (+ `children` for `<track>` / `<source>` passthrough).
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
 * ── `children` semantics ─────────────────────────────────────────────────────
 *
 * `hasChildren: true` on the descriptor. The JsxComponentView renders the
 * PM content slot (NodeViewContent) and passes it as children, so authored
 * `<track>` / `<source>` tags round-trip as PM children and stay editable.
 * At runtime, the browser sees whatever DOM shape PM renders inside
 * `<video>` — typically a wrapper div with the track children nested
 * inside. Subtitle rendering depends on browser tolerance of this nesting;
 * we prioritize editability + γ byte-identity over runtime media-semantics
 * here (QA-009 is best-effort).
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
  children?: React.ReactNode;
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
    >
      {props.children}
    </video>
  );
}
