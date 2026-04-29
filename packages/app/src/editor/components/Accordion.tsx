/**
 * Accordion — DIY renderer for the 5-pack foundation (SPEC 2026-04-23-cb-v2-md-foundation,
 * FR-5 + FR-6 + D-MF2 + D-MF14 + D-MF16).
 *
 * Standalone expand/collapse via native HTML5 `<details>`/`<summary>` — no
 * `<Accordions>` parent wrapper required. Renders the descriptor's 6-prop
 * surface: `title` (required), `defaultOpen`, `icon` (namespaced lucide),
 * `description`, `id`, `name` (for HTML5 exclusive-accordion grouping), plus
 * `children` (PM-managed NodeViewContent slot).
 *
 * ── D-MF14 / D-MF16 constraints (load-bearing) ───────────────────────────────
 *
 *   - NO `variant` prop → Notion color-map absorption deferred (NG30).
 *   - STANDALONE → no parent wrapper required. Exclusive grouping via HTML5
 *     `<details name="group">` (Chrome 120+, Safari 17.2+, Firefox 130+);
 *     siblings sharing a name auto-close each other on open.
 *   - HTML5 native collapse/expand → no JS state, no Radix-style animation
 *     machine, no toggle handler. Rotation on open/close via CSS transform
 *     keyed on the `[open]` attribute.
 *   - Matches Mintlify Accordion surface + HTML5 `name` attr; diverges from
 *     Fumadocs's Radix-requires-parent pattern.
 *
 * ── `children` semantics ─────────────────────────────────────────────────────
 *
 * `hasChildren: true` on the descriptor. The summary carries icon + title +
 * optional description as non-editable chrome (contentEditable=false). Body
 * renders inside `.accordion-body` unconditionally — browsers display:none
 * the content when `[open]` is unset, but PM's DOM is retained so children
 * stay live per Precedent #30 (all user content visible / editable).
 *
 * Zero upstream-docs-lib React imports (D-MF2 / FR-6) — all styling flows
 * through the `[data-component-type="accordion"]` selector in globals.css
 * with OK shadcn semantic tokens.
 */

import { ChevronRight, type LucideIcon } from 'lucide-react';

interface AccordionProps {
  title?: string;
  defaultOpen?: boolean;
  /** Namespaced lucide identifier (e.g. `lucide:Rocket`). */
  icon?: string;
  description?: string;
  id?: string;
  /** HTML5 <details name=> group identifier. Siblings sharing a name auto-close each other. */
  name?: string;
  children?: React.ReactNode;
}

/**
 * Resolve a namespaced icon identifier (`lucide:IconName`) to a rendered
 * Lucide component. Returns `null` when no override is set (the chevron
 * is the sole visual affordance) or the override is unresolvable. Kept
 * minimal on purpose — extending the allowlist is additive.
 */
const ICON_OVERRIDES: Record<string, LucideIcon> = {
  // Curated allowlist for authors overriding the default chevron affordance.
  // Named imports keep Vite tree-shaking tight. Authors requesting additional
  // icons can file an issue; extending is additive.
  ChevronRight,
};

function resolveIconOverride(icon: string | undefined): LucideIcon | null {
  if (!icon) return null;
  if (!icon.startsWith('lucide:')) return null;
  const name = icon.slice('lucide:'.length);
  // Object.hasOwn guards against prototype-pollution names (`__proto__`,
  // `constructor`, `toString`) which would otherwise return truthy
  // non-component values and crash the renderer — co-editor DoS vector.
  return Object.hasOwn(ICON_OVERRIDES, name) ? ICON_OVERRIDES[name] : null;
}

/**
 * DIY Accordion. Descriptor-dispatched via `componentMap['Accordion']`.
 *
 * The summary is marked `contentEditable={false}` so PM doesn't try to
 * manage it. Clicking the summary triggers the browser's native toggle
 * behavior; the CSS chevron rotation is keyed on the `[open]` attribute.
 */
export function Accordion(props: AccordionProps) {
  const IconOverride = resolveIconOverride(props.icon);

  return (
    <details
      className="accordion"
      data-accordion-icon={IconOverride ? 'custom' : undefined}
      open={props.defaultOpen}
      id={props.id}
      name={props.name}
    >
      <summary className="accordion-summary" contentEditable={false}>
        {IconOverride ? (
          <IconOverride size={16} className="accordion-icon" aria-hidden="true" />
        ) : null}
        <span className="accordion-title-group">
          <span className="accordion-title">{props.title ?? 'Accordion'}</span>
          {props.description ? (
            <span className="accordion-description">{props.description}</span>
          ) : null}
        </span>
      </summary>
      <div className="accordion-body">{props.children}</div>
    </details>
  );
}
