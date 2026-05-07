import { useId } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

export function TemplateBodyTextarea({
  value,
  onChange,
  disabled = false,
  placeholder,
  rows = 12,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <Field>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor={id}>Body</FieldLabel>
        <span className="text-[10px] text-muted-foreground/70">
          Allowed substitutions: {'{{date}}'}, {'{{user}}'}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className="font-mono text-xs leading-relaxed min-h-72"
      />
    </Field>
  );
}
