/**
 * Audio — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-4 + FR-6).
 *
 * Pure HTML5 `<audio>` wrapper. Renders the descriptor's 7-prop surface:
 * `src`, `title`, `autoplay`, `loop`, `muted`, `preload` (+ `children` for
 * `<source>` / `<track>` passthrough).
 *
 * ── Why `controls` is not a prop ─────────────────────────────────────────────
 *
 * Per FR-4 + NG7 "no confidently-broken chrome" — controls are ALWAYS on.
 * Authors who want a chrome-less audio (rare — autoplay background loop)
 * write a raw `<audio>` element in MDX rather than using this descriptor.
 * The descriptor-dispatched Audio is always a user-visible player.
 *
 * ── `children` semantics ─────────────────────────────────────────────────────
 *
 * `hasChildren: true` on the descriptor. The JsxComponentView renders the
 * PM content slot (NodeViewContent) and passes it as children, so authored
 * `<source>` / `<track>` tags round-trip as PM children and stay editable.
 * At runtime, the browser sees whatever DOM shape PM renders inside
 * `<audio>` — typically a wrapper div with the track/source children nested
 * inside. Fallback-source rendering depends on browser tolerance of this
 * nesting; we prioritize editability + γ byte-identity over runtime
 * media-semantics here (QA-010 is best-effort). Matches the Video.tsx
 * contract (US-007) for the same fidelity reason.
 *
 * Zero upstream-docs-lib React imports (D-MF2 / FR-6).
 *
 * ── Sanitization ─────────────────────────────────────────────────────────────
 *
 * `src` flows through `sanitizeComponentProps` at the JsxComponentView
 * boundary (it is in `URL_PROP_NAMES`) — the Audio component trusts its
 * incoming URL props at render time.
 *
 * ── Pre-US-008 state ─────────────────────────────────────────────────────────
 *
 * The pre-US-008 inline Audio function in `componentMap.tsx` wrapped the
 * `<audio>` in a titled container div with a stray empty `<track
 * kind="captions" />` child. The container div was removable styling, and
 * the empty track element broke subtitle rendering on browsers that tried
 * to load it. This module drops both: the renderer is now a pure HTML5
 * wrapper, and any author-provided tracks flow via the `children` slot.
 */

interface AudioProps {
  src?: string;
  title?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  children?: React.ReactNode;
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
      autoPlay={props.autoplay}
      loop={props.loop}
      muted={props.muted}
      preload={props.preload}
    >
      {props.children}
    </audio>
  );
}
