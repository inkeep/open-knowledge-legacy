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
  onConfirm: () => void;
}

export function EnableSyncConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: EnableSyncConfirmDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <AutoSyncEnableDialogIntro />
        </DialogHeader>
        <DialogBody>
          <AutoSyncEnableWarning />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={onConfirm}>Enable auto-sync</Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
