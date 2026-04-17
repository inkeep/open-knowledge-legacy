import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DocumentStats } from '@/lib/document-stats';

interface EditorFooterProps {
  stats: DocumentStats;
}

export function EditorFooter({ stats }: EditorFooterProps) {
  const tokenLabel = stats.tokens === null ? '—' : stats.tokens.toLocaleString();
  const tokenAriaLabel =
    stats.tokens === null
      ? 'Approximate tokens (GPT-5 / Claude-class models): not available'
      : `Approximate tokens (GPT-5 / Claude-class models): ${stats.tokens}`;
  return (
    <section
      aria-label="Document statistics"
      className="flex h-6 shrink-0 items-center justify-end gap-3 px-3 text-xs text-muted-foreground"
    >
      <span>
        <span className="tabular-nums">{stats.words.toLocaleString()}</span> words
      </span>
      <span>
        <span className="tabular-nums">{stats.chars.toLocaleString()}</span> chars
      </span>
      <Tooltip>
        <TooltipTrigger
          aria-label={tokenAriaLabel}
          className="cursor-default rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="tabular-nums">{tokenLabel}</span> tokens
        </TooltipTrigger>
        <TooltipContent>Approximate token count (GPT-5 / Claude-class models)</TooltipContent>
      </Tooltip>
    </section>
  );
}
