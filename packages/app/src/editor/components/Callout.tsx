/**
 * Callout — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-1 + FR-6 + D-MF2 + D-MF11 + D-MF17).
 *
 * Renders the descriptor's 7-prop surface: `type` (GFM 5-value enum), `title`,
 * `icon` (namespaced lucide), `color` (hex accent override), `collapsible`,
 * `defaultOpen`, and `children` (the PM-managed NodeViewContent slot).
 *
 * Two render branches:
 *
 *   1. Static (collapsible !== true): flex container with a left-border accent,
 *      type-inferred icon, optional title row, and the body.
 *
 *   2. Collapsible (collapsible === true): native HTML5 <details>/<summary>.
 *      `defaultOpen` maps to the `open` attribute. The summary carries the
 *      icon + title (no editable chrome — PM does not mount inside <summary>).
 *      Body renders unconditionally; browsers display:none the content when
 *      collapsed but DOM is retained, so PM children stay live.
 *
 * The component accepts `children` (NodeViewContent injected by JsxComponentView)
 * as an opaque React element and places it inside the body region. The
 * surrounding chrome is non-editable; clicking the summary toggles the open
 * state via native browser behavior (no JS handler needed).
 *
 * Zero upstream-docs-lib React imports (D-MF2 / FR-6) — all styling flows
 * through Tailwind utility classes + the `[data-component-type="callout"]`
 * selector in globals.css (OK shadcn semantic tokens). An inline
 * `--callout-type-color` CSS variable drives the left-border accent +
 * selection-halo; when the user authors a `color` prop, the inline style
 * overrides the per-type default.
 *
 * Precedent #30 (all user content visible): children slot is ALWAYS rendered,
 * never `display: none` via React. Native `<details>` does its own
 * display-toggle inside the browser — that is orthogonal to the precedent.
 */

import {
  AlertOctagon,
  AlertTriangle,
  Info,
  Lightbulb,
  type LucideIcon,
  MessageSquareWarning,
} from 'lucide-react';

/** Default lucide icon per GFM type. `icon` prop overrides. */
const TYPE_ICON: Record<CalloutType, LucideIcon> = {
  note: Info,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: AlertTriangle,
  caution: AlertOctagon,
};

type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

interface CalloutProps {
  type?: CalloutType | string;
  title?: string;
  /** Namespaced lucide identifier (e.g. `lucide:Lightbulb`). */
  icon?: string;
  /** Hex accent override (e.g. `#F05032`). Sanitized at JsxComponentView boundary. */
  color?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

/**
 * Resolve a namespaced icon identifier (`lucide:IconName`) to a rendered
 * Lucide component. Falls back to `null` for unknown namespaces or names.
 * Kept minimal on purpose — the 5-type default icons cover the common case
 * and the override path is for authors who want a different look within the
 * same semantic type. Unknown overrides fall back to the type default.
 *
 * The import path (`lucide-react/dynamicIconImports`) would enable every
 * icon in the set at the cost of a code-split chunk per render. For now a
 * small curated allowlist covers the most-requested override icons. Authors
 * who want the full set can file an issue; extending the list is additive.
 */
const ICON_OVERRIDES: Record<string, LucideIcon> = {
  // Same icons authors commonly reach for when overriding.
  Info,
  Lightbulb,
  MessageSquareWarning,
  AlertTriangle,
  AlertOctagon,
};

function resolveIcon(icon: string | undefined, type: CalloutType): LucideIcon {
  if (!icon) return TYPE_ICON[type];
  if (!icon.startsWith('lucide:')) return TYPE_ICON[type];
  const name = icon.slice('lucide:'.length);
  // Use Object.hasOwn to avoid prototype pollution (`__proto__`, `constructor`,
  // `toString` all return truthy non-component values via the bracket access
  // and would crash the renderer — co-editor DoS vector).
  return Object.hasOwn(ICON_OVERRIDES, name) ? ICON_OVERRIDES[name] : TYPE_ICON[type];
}

function normalizeType(raw: CalloutType | string | undefined): CalloutType {
  if (
    raw === 'note' ||
    raw === 'tip' ||
    raw === 'important' ||
    raw === 'warning' ||
    raw === 'caution'
  ) {
    return raw;
  }
  return 'note';
}

/**
 * DIY Callout. Descriptor-dispatched via `componentMap['Callout']`.
 *
 * Note on `color` prop plumbing: we set it on `style['--callout-type-color']`
 * at the root element. The CSS rule for `[data-component-type="callout"]`
 * reads this var both for the left-border tint (this component's own CSS)
 * and the selection-halo (globals.css selection-halo rule inherited from
 * the wrapper). When `color` is unset, both fall back to the per-type
 * accent token declared in CSS.
 */
export function Callout(props: CalloutProps) {
  const type = normalizeType(props.type);
  const Icon = resolveIcon(props.icon, type);
  const rootStyle: React.CSSProperties = props.color
    ? ({ ['--callout-type-color' as string]: props.color } as React.CSSProperties)
    : {};

  const header =
    props.title || Icon ? (
      <span className="callout-header" contentEditable={false}>
        <Icon size={16} className="callout-icon" aria-hidden="true" />
        {props.title ? <span className="callout-title">{props.title}</span> : null}
      </span>
    ) : null;

  if (props.collapsible) {
    const defaultOpen = props.defaultOpen ?? true;
    return (
      <details
        className="callout callout-collapsible"
        data-callout-type={type}
        open={defaultOpen}
        style={rootStyle}
      >
        <summary className="callout-summary" contentEditable={false}>
          {header ?? <span className="callout-title">Details</span>}
        </summary>
        <div className="callout-body">{props.children}</div>
      </details>
    );
  }

  return (
    <div className="callout callout-static" data-callout-type={type} style={rootStyle}>
      {header}
      <div className="callout-body">{props.children}</div>
    </div>
  );
}
