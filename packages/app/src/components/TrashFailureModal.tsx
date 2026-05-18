import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type TrashFailureReason = 'not-found' | 'permission-denied' | 'system-error' | 'path-escape';

const TRASH_FAILURE_REASONS: ReadonlyArray<TrashFailureReason> = [
  'not-found',
  'permission-denied',
  'system-error',
  'path-escape',
];

export function coerceTrashFailureReason(reason: unknown): TrashFailureReason {
  return typeof reason === 'string' &&
    (TRASH_FAILURE_REASONS as ReadonlyArray<string>).includes(reason)
    ? (reason as TrashFailureReason)
    : 'system-error';
}

export interface TrashFailedTarget {
  kind: 'folder' | 'file';
  path: string;
  name: string;
  reason: TrashFailureReason;
  detail?: string;
}

interface TrashFailureModalProps {
  failedTargets: ReadonlyArray<TrashFailedTarget>;
  isSubmitting: boolean;
  onDeletePermanently: () => Promise<void> | void;
  onRetry: () => Promise<void> | void;
  onCancel: () => void;
}

const TRASH_FAILURE_REASON_LABEL: Record<TrashFailureReason, string> = {
  'not-found': 'File not found',
  'permission-denied': 'Permission denied',
  'system-error': 'System error',
  'path-escape': 'Path resolves outside project',
};

export function formatTrashFailureDetail(target: TrashFailedTarget): string {
  const reason = TRASH_FAILURE_REASON_LABEL[target.reason];
  return target.detail ? `Reason: ${reason} (${target.detail})` : `Reason: ${reason}`;
}

function displayTargetName(target: TrashFailedTarget): string {
  return target.kind === 'folder' ? `${target.name}/` : target.name;
}

export function TrashFailureModal({
  failedTargets,
  isSubmitting,
  onDeletePermanently,
  onRetry,
  onCancel,
}: TrashFailureModalProps) {
  const isMulti = failedTargets.length > 1;
  const only = failedTargets[0];
  const headerDescription = isMulti
    ? `${failedTargets.length} items could not be moved to the Trash. Do you want to permanently delete instead?`
    : only
      ? `Could not move "${displayTargetName(only)}" to the Trash. Do you want to permanently delete instead?\n${formatTrashFailureDetail(only)}`
      : 'Do you want to permanently delete instead?';
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Couldn't move to Trash</DialogTitle>
        <DialogDescription className="whitespace-pre-wrap">{headerDescription}</DialogDescription>
      </DialogHeader>
      {isMulti ? (
        <DialogBody>
          <ul className="flex flex-col gap-2 text-xs">
            {failedTargets.map((target) => (
              <li key={target.path} data-testid="trash-failure-modal-target">
                <div className="font-mono text-foreground">{displayTargetName(target)}</div>
                <div className="text-muted-foreground">{formatTrashFailureDetail(target)}</div>
              </li>
            ))}
          </ul>
        </DialogBody>
      ) : null}
      <DialogFooter>
        <Button
          variant="outline"
          className="font-mono uppercase"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="trash-failure-modal-cancel"
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          className="font-mono uppercase"
          onClick={onRetry}
          disabled={isSubmitting}
          data-testid="trash-failure-modal-retry"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Retrying
            </>
          ) : (
            'Retry'
          )}
        </Button>
        <Button
          variant="destructive"
          onClick={onDeletePermanently}
          disabled={isSubmitting}
          data-testid="trash-failure-modal-delete-permanently"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Deleting
            </>
          ) : (
            'Delete Permanently'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
