/**
 * Property widgets — controlled inputs for the five frontmatter types.
 *
 * Each widget reads `value` (from `Y.Map('metadata')` per-key state) and emits
 * `onCommit(newValue)` on Enter / blur (or click for boolean). The parent
 * (PropertyRow in PropertyPanel) routes commits via HTTP POST to
 * `/api/frontmatter-patch` (the same path EditorHeader's toolbar trigger uses).
 *
 * Type picker (TypeIconButton) opens a dropdown listing the five widget types;
 * selecting a different type triggers a value coercion + commit so the slot
 * value matches the new shape.
 *
 * Per D10: list slots are stored as primitive `string[]` in the metaMap by the
 * current write surfaces (form / frontmatter_patch / disk migration). Widgets
 * present arrays as chip inputs regardless of declared type — value shape
 * wins for rendering (US-008 AC).
 */

import type { FrontmatterType, FrontmatterValue } from '@inkeep/open-knowledge-core';
import { Calendar, Hash, List, ToggleLeft, Type, X } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface CommonWidgetProps<T extends FrontmatterValue> {
  keyName: string;
  value: T;
  onCommit: (next: T) => void;
}

export function TextWidget({ keyName, value, onCommit }: CommonWidgetProps<string>) {
  const [draft, setDraft] = useState(value);
  return (
    <Input
      data-testid="text-widget"
      data-key={keyName}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (draft !== value) onCommit(draft);
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(value);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 border-transparent bg-transparent px-2 text-sm shadow-none hover:bg-muted/50 focus-visible:bg-background"
    />
  );
}

export function NumberWidget({ keyName, value, onCommit }: CommonWidgetProps<number>) {
  const [draft, setDraft] = useState<string>(String(value));
  return (
    <Input
      data-testid="number-widget"
      data-key={keyName}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number.parseFloat(draft);
        const next = Number.isFinite(parsed) ? parsed : 0;
        if (next !== value) onCommit(next);
        else setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(String(value));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 border-transparent bg-transparent px-2 text-sm shadow-none hover:bg-muted/50 focus-visible:bg-background"
    />
  );
}

export function BooleanWidget({ keyName, value, onCommit }: CommonWidgetProps<boolean>) {
  return (
    <div className="flex h-7 items-center px-2">
      <Switch
        data-testid="boolean-widget"
        data-key={keyName}
        checked={value}
        onCheckedChange={(next) => onCommit(next)}
        aria-label={`${keyName} value`}
      />
    </div>
  );
}

export function DateWidget({ keyName, value, onCommit }: CommonWidgetProps<string>) {
  const [draft, setDraft] = useState(value);
  return (
    <Input
      data-testid="date-widget"
      data-key={keyName}
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(value);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 border-transparent bg-transparent px-2 text-sm shadow-none hover:bg-muted/50 focus-visible:bg-background"
    />
  );
}

export function ListWidget({ keyName, value, onCommit }: CommonWidgetProps<string[]>) {
  const [draft, setDraft] = useState('');
  function addChip(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    onCommit([...value, trimmed]);
    setDraft('');
  }
  function removeChip(index: number) {
    const next = value.slice();
    next.splice(index, 1);
    onCommit(next);
  }
  return (
    <div
      data-testid="list-widget"
      data-key={keyName}
      className="flex h-7 min-h-7 flex-wrap items-center gap-1 rounded-md px-2 hover:bg-muted/50 focus-within:bg-background"
    >
      {value.map((chip, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: chips are positional; user reorders via add/remove
          key={`${i}-${chip}`}
          data-testid="list-chip"
          data-index={i}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
        >
          <span>{chip}</span>
          <button
            type="button"
            aria-label={`Remove ${chip}`}
            onClick={() => removeChip(i)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        data-testid="list-chip-input"
        type="text"
        value={draft}
        placeholder={value.length === 0 ? 'add value' : ''}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addChip(draft);
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            e.preventDefault();
            removeChip(value.length - 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft('');
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          if (draft) addChip(draft);
        }}
        className="min-w-16 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

const TYPE_ICON: Record<FrontmatterType, typeof Type> = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  list: List,
};

const TYPE_LABEL: Record<FrontmatterType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  date: 'Date',
  list: 'List',
};

interface TypeIconButtonProps {
  keyName: string;
  type: FrontmatterType;
  onChangeType: (next: FrontmatterType) => void;
}

export function TypeIconButton({ keyName, type, onChangeType }: TypeIconButtonProps) {
  const Icon = TYPE_ICON[type];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="type-icon-button"
        data-key={keyName}
        data-type={type}
        aria-label={`${keyName} type: ${TYPE_LABEL[type]}. Click to change.`}
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="type-picker-menu">
        {(Object.keys(TYPE_ICON) as FrontmatterType[]).map((t) => {
          const ItemIcon = TYPE_ICON[t];
          return (
            <DropdownMenuItem
              key={t}
              data-testid="type-picker-item"
              data-type={t}
              onSelect={() => onChangeType(t)}
            >
              <ItemIcon className="size-3.5" />
              <span>{TYPE_LABEL[t]}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Best-effort coercion when the user changes the declared type. The value-shape
 * always wins for rendering (D10 / AC), so coercion mostly matters when a
 * primitive value transitions to a different primitive shape.
 */
export function coerceValue(value: FrontmatterValue, target: FrontmatterType): FrontmatterValue {
  switch (target) {
    case 'text': {
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
    }
    case 'number': {
      if (typeof value === 'number') return value;
      const candidate = Array.isArray(value) ? value[0] : String(value);
      const parsed = Number.parseFloat(candidate ?? '');
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      const s = Array.isArray(value) ? value[0] : String(value);
      return (s ?? '').toLowerCase() === 'true';
    }
    case 'date': {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const today = new Date().toISOString().slice(0, 10);
      return today;
    }
    case 'list': {
      if (Array.isArray(value)) return value;
      const s = String(value);
      return s ? [s] : [];
    }
  }
}

/**
 * Resolve which widget to render given the underlying value. Value shape wins
 * (a string[] always renders as ListWidget regardless of declared type). For
 * scalar values, fall back to the supplied declared type, which is either an
 * inferred shape or a user-picked override.
 */
export function resolveWidgetType(
  value: FrontmatterValue,
  declared: FrontmatterType,
): FrontmatterType {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return declared === 'list' ? 'text' : declared;
}
