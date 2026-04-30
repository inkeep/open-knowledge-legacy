/**
 * EnableSyncConfirmDialog — guards every off → on transition of the git
 * auto-sync toggle (the SyncStatusBadge popover Switch + the SettingsPane
 * Sync section).
 *
 * Off → on is the dangerous direction (push to remote, pull may overwrite
 * local). On → off is safe and skips this dialog.
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';

interface EnableSyncConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  onConfirm: () => Promise<void> | void;
}

export function EnableSyncConfirmDialog({
  open,
  onOpenChange,
  isSubmitting,
  onConfirm,
}: EnableSyncConfirmDialogProps) {
  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        // Block dismiss while the request is in flight; otherwise the user
        // can close mid-fetch and see the Switch flip without the toast.
        if (!next && isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>Enable git auto-sync?</DialogTitle>
        <DialogDescription>
          This will push your local commits to the configured git remote and pull remote changes on
          intervals.
        </DialogDescription>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Pull operations may overwrite uncommitted local file changes. Auto-sync is intended for
            developer workflows. Make sure your work is committed before enabling.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Enabling...
              </>
            ) : (
              'Enable auto-sync'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
