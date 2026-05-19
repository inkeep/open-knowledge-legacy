import { toast } from 'sonner';
import {
  AutoSyncEnableDialogIntro,
  AutoSyncEnableWarning,
} from '@/components/AutoSyncEnableWarning';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
} from '@/components/ui/dialog';
import { useSyncEnabledWriter } from '@/hooks/use-enable-sync-with-confirm';

interface AutoSyncOnboardingDialogProps {
  open: boolean;
  onResolved: () => void;
}

export function AutoSyncOnboardingDialog({ open, onResolved }: AutoSyncOnboardingDialogProps) {
  const writer = useSyncEnabledWriter();

  function persistChoice(enabled: boolean): void {
    if (writer === null) {
      toast.error('Sync settings not yet loaded — try again in a moment');
      return;
    }
    const result = writer(enabled);
    if (!result.ok) {
      toast.error(`Could not ${enabled ? 'enable sync' : 'save sync preference'}: ${result.error}`);
      return;
    }
    onResolved();
  }

  return (
    <DialogRoot open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <AutoSyncEnableDialogIntro />
        </DialogHeader>

        <DialogBody>
          <AutoSyncEnableWarning />
          <p className="mt-3 text-sm text-muted-foreground">
            You can turn this on later in <span className="font-medium">Settings → Sync</span>.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            className="uppercase font-mono"
            onClick={() => persistChoice(false)}
            disabled={writer === null}
          >
            Keep disabled
          </Button>
          <Button onClick={() => persistChoice(true)} disabled={writer === null}>
            Enable auto-sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
