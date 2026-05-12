import type { DocumentStats } from '@/lib/document-stats';

interface EditorFooterProps {
  stats: DocumentStats;
}

export function EditorFooter({ stats }: EditorFooterProps) {
  return (
    <section
      aria-label="Document statistics"
      className="relative flex h-6 shrink-0 items-center justify-end gap-3 bg-background px-3 text-2xs text-muted-foreground"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-full h-2 bg-linear-to-t from-background to-transparent"
      />
      <span>
        <span className="tabular-nums">{stats.words.toLocaleString()}</span>{' '}
        {stats.words === 1 ? 'word' : 'words'}
      </span>
      <span>
        <span className="tabular-nums">{stats.chars.toLocaleString()}</span>{' '}
        {stats.chars === 1 ? 'char' : 'chars'}
      </span>
      <span>
        {stats.tokens > 0 ? '~' : ''}
        <span className="tabular-nums">{stats.tokens.toLocaleString()}</span>{' '}
        {stats.tokens === 1 ? 'token' : 'tokens'}
      </span>
    </section>
  );
}
