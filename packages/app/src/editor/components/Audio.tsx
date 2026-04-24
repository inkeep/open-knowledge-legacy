/**
 * Audio — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-4 + FR-6).
 *
 * Pure HTML5 `<audio>` wrapper. Self-closing leaf descriptor symmetric with
 * Video. Renders the descriptor's 6-prop surface: `src`, `title`,
 * `autoPlay`, `loop`, `muted`, `preload`.
 *
 * ── Why `controls` is not a prop ─────────────────────────────────────────────
 *
 * Per FR-4 + NG7 "no confidently-broken chrome" — controls are ALWAYS on.
 * Authors who want a chrome-less audio (rare — `autoPlay` background loop)
 * write a raw `<audio>` element in MDX rather than using this descriptor.
 * The descriptor-dispatched Audio is always a user-visible player.
 *
 * ── Why self-closing (no `<source>` / `<track>` passthrough) ─────────────────
 *
 * HTML5 requires `<source>` and `<track>` as direct children of `<audio>`.
 * ProseMirror NodeViews mandate a wrapper DOM element to host the content
 * hole (`NodeViewContent`). The two contracts are structurally
 * incompatible — see Video.tsx's comment block for the full rationale.
 *
 * Audio is a leaf descriptor. Authors who need codec fallback sources
 * write raw `<audio>` + `<source>` HTML in MDX, which flows through the
 * wildcard / rawMdxFallback path (byte-preserving, editable as MDX
 * source). NG31 tracks the additive replacement: typed `sources:
 * Array<SourceDef>` prop, gated on an `array`-typed PropDef extension.
 *
 * Zero upstream-docs-lib React imports (D-MF2 / FR-6).
 *
 * ── Sanitization ─────────────────────────────────────────────────────────────
 *
 * `src` flows through `sanitizeComponentProps` at the JsxComponentView
 * boundary (it is in `URL_PROP_NAMES`) — the Audio component trusts its
 * incoming URL props at render time.
 */

interface AudioProps {
  src?: string;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

/**
 * DIY Audio. Descriptor-dispatched via `componentMap['Audio']`.
 */
export function Audio(props: AudioProps) {
  return (
    <audio
      className="ok-audio"
      src={props.src}
      title={props.title}
      controls
      autoPlay={props.autoPlay}
      loop={props.loop}
      muted={props.muted}
      preload={props.preload}
    />
  );
}
