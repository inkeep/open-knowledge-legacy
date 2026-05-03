import { Loader2 } from 'lucide-react';
import {
  AutoSyncEnableDialogIntro,
  AutoSyncEnableWarning,
} from '@/components/AutoSyncEnableWarning';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
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
        if (!next && isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <AutoSyncEnableDialogIntro />
        </DialogHeader>
        <DialogBody>
          <AutoSyncEnableWarning />
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
                <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Enabling…
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
