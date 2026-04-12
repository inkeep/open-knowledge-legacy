import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  error: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

const roles: Record<string, string> = {
  warning: 'alert',
  error: 'alert',
  info: 'note',
};

export function Callout({ type, children }: { type: string; children: React.ReactNode }) {
  return (
    <div
      role={roles[type] || 'note'}
      className={cn('p-3 px-4 rounded-md', styles[type] || 'bg-muted text-foreground')}
    >
      <strong>{type.toUpperCase()}</strong>: {children}
    </div>
  );
}
