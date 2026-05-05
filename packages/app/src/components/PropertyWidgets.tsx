/**
 * Property widgets — controlled inputs for the five frontmatter types.
 *
 * Each widget reads `value` (parsed from the YAML region of `Y.Text('source')`
 * via `bindFrontmatterDoc.current()`) and emits `onCommit(newValue)` on Enter /
 * blur (or click for boolean). The parent (PropertyRow in PropertyPanel)
 * routes commits through `bindFrontmatterDoc.patch()`, which edits the YAML
 * region at the `Pair` level via yaml@2 and replaces the Y.Text byte range
 * under `FORM_WRITE_ORIGIN`. No HTTP round-trip — the change reaches the
 * server via the same WebSocket the editor already uses.
 *
 * Type picker (TypeIconButton) opens a dropdown listing the five widget types;
 * selecting a different type triggers a value coercion + commit so the slot
 * value matches the new shape.
 *
 * List values are flat `string[]`. Widgets present arrays as chip inputs
 * regardless of declared type — value shape wins for rendering (FR6 AC).
 */

import {
  FRONTMATTER_TAG_VALUE_RE,
  type FrontmatterType,
  type FrontmatterValue,
} from '@inkeep/open-knowledge-core';
import { format, parse, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, Hash, List, SquareCheck, Type, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dispatchTagClickEvent } from '@/editor/extensions/tag-click-plugin';
import { cn } from '@/lib/utils';

interface CommonWidgetProps<T extends FrontmatterValue> {
  keyName: string;
  value: T;
  onCommit: (next: T) => void;
}

export function TextWidget({ keyName, value, onCommit }: CommonWidgetProps<string>) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const revertingRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);
  return (
    <Input
      data-testid="text-widget"
      data-key={keyName}
      type="text"
      value={draft}
      placeholder="Empty"
      aria-label={`${keyName} value`}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (revertingRef.current) {
          revertingRef.current = false;
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (draft !== value) onCommit(draft);
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          revertingRef.current = true;
          setDraft(value);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 border-transparent dark:bg-transparent bg-transparent px-2 text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:border-transparent focus-visible:bg-muted focus-visible:ring-0 rounded-sm dark:focus-visible:bg-muted"
    />
  );
}

export function TextareaWidget({
  keyName,
  value,
  onCommit,
  rows = 3,
}: CommonWidgetProps<string> & { rows?: number }) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const revertingRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);
  return (
    <textarea
      data-testid="textarea-widget"
      data-key={keyName}
      value={draft}
      placeholder="Empty"
      aria-label={`${keyName} value`}
      rows={rows}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (revertingRef.current) {
          revertingRef.current = false;
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.shiftKey)) {
          e.preventDefault();
          if (draft !== value) onCommit(draft);
          (e.currentTarget as HTMLTextAreaElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          revertingRef.current = true;
          setDraft(value);
          (e.currentTarget as HTMLTextAreaElement).blur();
        }
      }}
      className="block w-full resize-y border-transparent bg-transparent px-2 py-1 text-sm leading-relaxed shadow-none rounded-sm placeholder:text-muted-foreground/60 focus-visible:border-transparent focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-0 dark:bg-transparent dark:focus-visible:bg-muted"
    />
  );
}

export function NumberWidget({ keyName, value, onCommit }: CommonWidgetProps<number>) {
  const [draft, setDraft] = useState<string>(String(value));
  const focusedRef = useRef(false);
  const revertingRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);
  return (
    <Input
      data-testid="number-widget"
      data-key={keyName}
      type="number"
      value={draft}
      aria-label={`${keyName} value`}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (revertingRef.current) {
          revertingRef.current = false;
          setDraft(String(value));
          return;
        }
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
          revertingRef.current = true;
          setDraft(String(value));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 border-transparent bg-transparent dark:bg-transparent px-2 text-sm shadow-none focus-visible:border-transparent focus-visible:bg-muted focus-visible:ring-0 rounded-sm dark:focus-visible:bg-muted"
    />
  );
}

export function BooleanWidget({ keyName, value, onCommit }: CommonWidgetProps<boolean>) {
  return (
    <div className="flex h-7 items-center px-2">
      <Checkbox
        data-testid="boolean-widget"
        data-key={keyName}
        checked={value}
        onCheckedChange={(next) => onCommit(next === true)}
        aria-label={`${keyName} value`}
        className="size-5 rounded-full"
      />
    </div>
  );
}

export function DateWidget({ keyName, value, onCommit }: CommonWidgetProps<string>) {
  const date = parseDate(value);
  const [inputValue, setInputValue] = useState(formatDateForInput(date));
  const [month, setMonth] = useState<Date | undefined>(date);
  const [open, setOpen] = useState(false);
  const focusedRef = useRef(false);
  const revertingRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      const next = parseDate(value);
      setInputValue(formatDateForInput(next));
      setMonth(next);
    }
  }, [value]);

  function commitInput() {
    const parsed = parseFromInput(inputValue);
    if (parsed) {
      const iso = format(parsed, 'yyyy-MM-dd');
      if (iso !== value) onCommit(iso);
      setInputValue(formatDateForInput(parsed));
      setMonth(parsed);
    } else {
      setInputValue(formatDateForInput(date));
      setMonth(date);
    }
  }

  function handleCalendarSelect(selected: Date | undefined) {
    if (!selected) return;
    const iso = format(selected, 'yyyy-MM-dd');
    if (iso !== value) onCommit(iso);
    setInputValue(formatDateForInput(selected));
    setMonth(selected);
    setOpen(false);
  }

  return (
    <div data-testid="date-widget" data-key={keyName} className="relative flex h-7 items-center">
      <Input
        type="text"
        value={inputValue}
        placeholder="Empty"
        aria-label={`${keyName} value`}
        onChange={(e) => {
          setInputValue(e.target.value);
          const parsed = parseFromInput(e.target.value);
          if (parsed) setMonth(parsed);
        }}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (revertingRef.current) {
            revertingRef.current = false;
            return;
          }
          commitInput();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitInput();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            revertingRef.current = true;
            setInputValue(formatDateForInput(date));
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="h-7 border-transparent bg-transparent dark:bg-transparent pr-7 pl-2 text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:border-transparent focus-visible:bg-muted focus-visible:ring-0 rounded-sm dark:focus-visible:bg-muted"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Open date picker for ${keyName}`}
            className="absolute right-0 size-6 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CalendarIcon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleCalendarSelect}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const INPUT_DATE_FORMAT = 'MMM d, yyyy';

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatDateForInput(date: Date | undefined): string {
  return date ? format(date, INPUT_DATE_FORMAT) : '';
}

const INPUT_PARSE_FORMATS = [
  'MMM d, yyyy', // matches INPUT_DATE_FORMAT — calendar picks round-trip
  'MMMM d, yyyy', // full month name
  'yyyy-MM-dd', // ISO 8601 date
  'M/d/yyyy', // US slashed (Apr 5 = "4/5/2026")
  'MM/dd/yyyy', // zero-padded US
] as const;

export function parseFromInput(input: string): Date | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const reference = new Date();
  for (const fmt of INPUT_PARSE_FORMATS) {
    const d = parse(trimmed, fmt, reference);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
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
  const isTagsField = keyName === 'tags';
  return (
    <div
      data-testid="list-widget"
      data-key={keyName}
      className="flex h-7 min-h-7 flex-wrap items-center gap-1 rounded-md px-2 focus-within:bg-background"
    >
      {value.map((chip, i) => {
        const renderAsTag = isTagsField && FRONTMATTER_TAG_VALUE_RE.test(chip);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: chips are positional; user reorders via add/remove
            key={`${i}-${chip}`}
            data-testid="list-chip"
            data-index={i}
            className={cn(
              'inline-flex items-center text-1sm gap-0.5 rounded-full py-0.5 pl-2 pr-1.5 transition-colors',
              renderAsTag
                ? 'bg-primary/10 font-medium text-primary has-[button[data-tag]:hover]:bg-primary/20 has-[button[data-tag]:active]:bg-primary/25'
                : 'bg-muted ',
            )}
          >
            {renderAsTag ? (
              <button
                type="button"
                data-tag={chip}
                aria-label={`Open documents tagged #${chip}`}
                onClick={() => dispatchTagClickEvent(chip)}
                className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                #{chip}
              </button>
            ) : (
              <span>{chip}</span>
            )}
            <button
              type="button"
              aria-label={`Remove ${chip}`}
              onClick={() => removeChip(i)}
              className={cn(
                'inline-flex items-center justify-center rounded-sm p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                renderAsTag
                  ? 'text-primary opacity-70 hover:text-primary hover:opacity-100'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <input
        data-testid="list-chip-input"
        type="text"
        value={draft}
        placeholder={value.length === 0 ? 'Empty' : ''}
        aria-label={`${keyName} value`}
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
        className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

const TYPE_ICON: Record<FrontmatterType, typeof Type> = {
  text: Type,
  number: Hash,
  boolean: SquareCheck,
  date: CalendarIcon,
  list: List,
};

const TYPE_LABEL: Record<FrontmatterType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Checkbox',
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
        <DropdownMenuRadioGroup
          value={type}
          onValueChange={(next) => onChangeType(next as FrontmatterType)}
        >
          {(Object.keys(TYPE_ICON) as FrontmatterType[]).map((t) => {
            const ItemIcon = TYPE_ICON[t];
            return (
              <DropdownMenuRadioItem key={t} value={t} data-testid="type-picker-item" data-type={t}>
                <ItemIcon className="size-3.5 text-muted-foreground" />
                <span>{TYPE_LABEL[t]}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

export function resolveWidgetType(
  value: FrontmatterValue,
  declared: FrontmatterType,
): FrontmatterType {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return declared === 'list' ? 'text' : declared;
}
