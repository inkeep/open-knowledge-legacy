/**
 * PreviewEditor — full-file diff view with inline additions/deletions.
 *
 * Every line of the file is shown, colored by change type:
 * - green background for added lines
 * - red background for removed lines
 * - no highlight for unchanged lines
 */

interface DiffLine {
  type: string; // 'added' | 'removed' | 'unchanged'
  text: string;
}

export interface PreviewEditorProps {
  lines: DiffLine[];
}

function lineStyle(type: string): string {
  if (type === 'added') return 'bg-green-900/60 text-green-200';
  if (type === 'removed') return 'bg-red-900/60 text-red-200 line-through decoration-red-400/50';
  return 'text-foreground';
}

function linePrefix(type: string): string {
  if (type === 'added') return '+';
  if (type === 'removed') return '-';
  return ' ';
}

export function PreviewEditor({ lines }: PreviewEditorProps) {
  return (
    <div className="h-full overflow-y-auto subtle-scrollbar p-4">
      {lines.map((line, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable positional diff lines
          key={i}
          className={`whitespace-pre font-mono text-xs leading-5 ${lineStyle(line.type)}`}
        >
          <span className="inline-block w-4 select-none text-right opacity-30 mr-2">
            {linePrefix(line.type)}
          </span>
          {line.text}
        </div>
      ))}
    </div>
  );
}
