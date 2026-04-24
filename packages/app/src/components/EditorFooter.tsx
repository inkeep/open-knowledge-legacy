import type { DocumentStats } from '@/lib/document-stats';

interface EditorFooterProps {
  stats: DocumentStats;
}

export function EditorFooter({ stats }: EditorFooterProps) {
  return (
    <section
      aria-label="Document statistics"
      className="flex h-6 shrink-0 items-center justify-end gap-3 px-3 text-2xs text-muted-foreground"
    >
      <span>
        <span className="tabular-nums">{stats.words.toLocaleString()}</span> words
      </span>
      <span>
        <span className="tabular-nums">{stats.chars.toLocaleString()}</span> chars
      </span>
      <span>
        {stats.tokens > 0 ? '~' : ''}
        <span className="tabular-nums">{stats.tokens.toLocaleString()}</span> tokens
      </span>
    </section>
  );
}
