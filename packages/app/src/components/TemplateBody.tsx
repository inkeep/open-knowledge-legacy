import { Fragment, type ReactNode } from 'react';

const SUBSTITUTION_TOKEN_RE = /(\{\{(?:date|user)\}\})/g;

const TOKEN_TITLES: Record<string, string> = {
  '{{date}}': 'Replaced with today (ISO-8601) at instantiation',
  '{{user}}': 'Replaced with calling principal display name at instantiation',
};

const BODY_TEXTAREA_CLASSNAME =
  'flex min-h-[18rem] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 leading-relaxed';

export function TemplateBodyView({ body }: { body: string }) {
  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
          Body (raw markdown)
        </h3>
        <span className="text-[10px] text-muted-foreground/70">
          {'{{date}}'} and {'{{user}}'} substitute at instantiation
        </span>
      </header>
      <pre className="overflow-x-auto p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
        {highlightSubstitutionTokens(body || '(empty body)')}
      </pre>
    </section>
  );
}

export function TemplateBodyTextarea({
  id,
  value,
  onChange,
  disabled = false,
  placeholder,
  rows = 12,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-xs font-mono uppercase tracking-wider text-muted-foreground"
        >
          Body
        </label>
        <span className="text-[10px] text-muted-foreground/70">
          Allowed substitutions: {'{{date}}'}, {'{{user}}'}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className={BODY_TEXTAREA_CLASSNAME}
      />
    </div>
  );
}

function highlightSubstitutionTokens(body: string): ReactNode[] {
  const parts = body.split(SUBSTITUTION_TOKEN_RE);
  return parts.map((part, idx) => {
    const key = `${idx}:${part.slice(0, 32)}`;
    if (idx % 2 === 1) {
      return (
        <span
          key={key}
          className="rounded px-1 py-0.5 bg-primary/10 text-primary font-semibold"
          title={TOKEN_TITLES[part]}
        >
          {part}
        </span>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function formatFrontmatterValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
