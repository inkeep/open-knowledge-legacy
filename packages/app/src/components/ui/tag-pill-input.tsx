'use client';

import { XIcon } from 'lucide-react';
import { type Ref, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagPillInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
}

function TagPillInput({
  value,
  onChange,
  onBlur,
  placeholder = 'Add tag',
  id,
  disabled,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ref,
}: TagPillInputProps) {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const removeAt = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div
      data-slot="tag-pill-input"
      aria-invalid={ariaInvalid}
      className={cn(
        'flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1 text-sm transition-colors',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        'dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {value.map((tag, i) => (
        <Badge key={tag} variant="secondary" className="gap-1 pl-2 pr-1">
          <span className="font-mono">{tag}</span>
          <button
            type="button"
            onClick={() => removeAt(i)}
            aria-label={`Remove ${tag}`}
            className="rounded-sm p-0.5 hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            disabled={disabled}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        ref={ref}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (draft.trim()) {
              e.preventDefault();
              addTag(draft);
            }
          } else if (e.key === ',') {
            e.preventDefault();
            if (draft.trim()) {
              addTag(draft);
            }
          } else if (e.key === 'Tab') {
            if (draft.trim()) {
              e.preventDefault();
              addTag(draft);
            }
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            e.preventDefault();
            removeAt(value.length - 1);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addTag(draft);
          onBlur?.();
        }}
        placeholder={value.length === 0 ? placeholder : ''}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
    </div>
  );
}

export { TagPillInput };
