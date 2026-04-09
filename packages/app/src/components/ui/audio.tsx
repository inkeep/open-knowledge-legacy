import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface AudioProps extends React.ComponentProps<'audio'> {
  /** URL of the audio file */
  src: string;
  /** Optional title displayed above the player */
  title?: string;
}

/**
 * Audio player component with a title and native browser controls.
 */
function Audio({ src, title, className, ...props }: AudioProps) {
  return (
    <div data-slot="audio" className={cn('rounded-md border p-4', className)}>
      {title && <p className="mb-2 text-sm font-medium">{title}</p>}
      <audio controls src={src} className="w-full" {...props}>
        <track kind="captions" />
      </audio>
    </div>
  );
}

export { Audio };
