import { AlertTriangle } from 'lucide-react';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { Button } from './ui/button';

interface ConflictBannerProps {
  onOpenResolver: () => void;
}

export function ConflictBanner({ onOpenResolver }: ConflictBannerProps) {
  const status = useGitSyncStatus();

  if (!status || status.state !== 'conflict') return null;

  const count = status.conflictCount;
  const label = count > 0 ? `${count} page${count !== 1 ? 's' : ''}` : 'Some pages';

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm border-b bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 shrink-0">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">
        {label} {count !== 1 ? 'have' : 'has'} conflicting changes.
      </span>
      <Button
        variant="outline"
        size="xs"
        className="shrink-0 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
        onClick={onOpenResolver}
      >
        Review and resolve
      </Button>
    </div>
  );
}
