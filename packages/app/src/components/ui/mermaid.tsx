import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface MermaidProps extends React.ComponentProps<'div'> {
  /** Mermaid diagram source code */
  chart: string;
}

/**
 * Renders a Mermaid diagram from a chart definition string.
 *
 * In the editor, this renders a placeholder with the chart source.
 * Full Mermaid rendering requires a runtime initialization step.
 */
function Mermaid({ chart, className, ...props }: MermaidProps) {
  return (
    <div
      data-slot="mermaid"
      className={cn(
        'rounded-md border bg-muted/50 p-4 font-mono text-sm whitespace-pre-wrap',
        className,
      )}
      {...props}
    >
      <pre>{chart}</pre>
    </div>
  );
}

export { Mermaid };
