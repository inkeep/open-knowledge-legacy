import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
} from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface FindReplaceBarProps {
  findInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  replacement: string;
  replaceOpen: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  current: number;
  total: number;
  onQueryChange: (query: string) => void;
  onReplacementChange: (replacement: string) => void;
  onReplaceOpenChange: (open: boolean) => void;
  onCaseSensitiveChange: (caseSensitive: boolean) => void;
  onWholeWordChange: (wholeWord: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export function FindReplaceBar({
  findInputRef,
  query,
  replacement,
  replaceOpen,
  caseSensitive,
  wholeWord,
  current,
  total,
  onQueryChange,
  onReplacementChange,
  onReplaceOpenChange,
  onCaseSensitiveChange,
  onWholeWordChange,
  onNext,
  onPrevious,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: FindReplaceBarProps) {
  const hasQuery = query.length > 0;
  const hasMatch = total > 0;
  const statusText = !hasQuery ? '' : !hasMatch ? 'No results' : `${current} / ${total}`;

  function handleFindKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function handleReplaceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onReplaceCurrent();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <search
      data-testid="find-replace-bar"
      aria-label="Find and replace"
      className="pointer-events-auto flex max-w-[min(calc(100vw-1rem),720px)] touch-manipulation items-center gap-1 rounded-[calc(var(--radius)+2px)] border border-input bg-popover/95 p-1 text-popover-foreground shadow-md shadow-black/10 backdrop-blur"
    >
      <label className="sr-only" htmlFor="ok-find-input">
        Find
      </label>
      <InputGroup className="h-7 w-56 rounded-[min(var(--radius-md),12px)]">
        <InputGroupInput
          ref={findInputRef}
          id="ok-find-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleFindKeyDown}
          placeholder="Find"
          autoComplete="off"
          spellCheck={false}
          className="h-7 px-2 text-sm"
        />
        <InputGroupAddon align="inline-end" className="gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                type="button"
                variant="segmented"
                size="sm"
                aria-label="Match case"
                pressed={caseSensitive}
                onPressedChange={onCaseSensitiveChange}
                className="size-6 min-w-6 px-0"
              >
                <CaseSensitive aria-hidden="true" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom">Match case</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                type="button"
                variant="segmented"
                size="sm"
                aria-label="Whole word"
                pressed={wholeWord}
                onPressedChange={onWholeWordChange}
                className="size-6 min-w-6 px-0"
              >
                <WholeWord aria-hidden="true" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom">Whole word</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>

      <span
        role="status"
        aria-live="polite"
        className="min-w-14 px-1 text-right text-muted-foreground text-xs tabular-nums shrink-0"
      >
        {statusText}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous match"
            disabled={!hasMatch}
            onClick={onPrevious}
          >
            <ChevronUp data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Previous match</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next match"
            disabled={!hasMatch}
            onClick={onNext}
          >
            <ChevronDown data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Next match</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={replaceOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label={replaceOpen ? 'Hide replace' : 'Show replace'}
            aria-expanded={replaceOpen}
            aria-controls={replaceOpen ? 'ok-replace-input' : undefined}
            onClick={() => onReplaceOpenChange(!replaceOpen)}
          >
            <Replace data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {replaceOpen ? 'Hide replace' : 'Show replace'}
        </TooltipContent>
      </Tooltip>

      {replaceOpen ? (
        <>
          <label className="sr-only" htmlFor="ok-replace-input">
            Replace
          </label>
          <Input
            id="ok-replace-input"
            value={replacement}
            onChange={(event) => onReplacementChange(event.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder="Replace"
            autoComplete="off"
            spellCheck={false}
            className="h-7 w-48 rounded-[min(var(--radius-md),12px)] px-2 text-sm shadow-none focus-visible:ring-2"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Replace current match"
                disabled={!hasMatch}
                onClick={onReplaceCurrent}
              >
                <Replace data-icon="inline-start" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Replace current match</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Replace all matches"
                disabled={!hasMatch}
                onClick={onReplaceAll}
              >
                <ReplaceAll data-icon="inline-start" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Replace all matches</TooltipContent>
          </Tooltip>
        </>
      ) : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close find"
            onClick={onClose}
          >
            <X data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close</TooltipContent>
      </Tooltip>
    </search>
  );
}
