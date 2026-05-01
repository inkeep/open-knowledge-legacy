
import {
  AlertOctagon,
  AlertTriangle,
  ChevronRight,
  Info,
  Lightbulb,
  type LucideIcon,
  MessageSquareWarning,
} from 'lucide-react';

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
  icon?: string;
  color?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

const ICON_OVERRIDES: Record<string, LucideIcon> = {
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
          <ChevronRight size={14} className="callout-chevron" aria-hidden="true" />
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
