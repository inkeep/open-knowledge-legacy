
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface AccordionProps {
  title?: string;
  defaultOpen?: boolean;
  icon?: string;
  description?: string;
  id?: string;
  name?: string;
  children?: React.ReactNode;
}

const ICON_OVERRIDES: Record<string, LucideIcon> = {
  ChevronRight,
};

function resolveIconOverride(icon: string | undefined): LucideIcon | null {
  if (!icon) return null;
  if (!icon.startsWith('lucide:')) return null;
  const name = icon.slice('lucide:'.length);
  return Object.hasOwn(ICON_OVERRIDES, name) ? ICON_OVERRIDES[name] : null;
}

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
        <ChevronRight size={14} className="accordion-chevron" aria-hidden="true" />
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
