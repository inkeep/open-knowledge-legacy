import { Loader2 } from 'lucide-react';
import { useState } from 'react';
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
import { postSyncEnabled } from '@/lib/sync-api';

interface AutoSyncOnboardingDialogProps {
  open: boolean;
  onResolved: () => void;
}

export function AutoSyncOnboardingDialog({ open, onResolved }: AutoSyncOnboardingDialogProps) {
  const [busy, setBusy] = useState<'enable' | 'dismiss' | null>(null);

  async function handleEnable() {
    setBusy('enable');
    try {
      await postSyncEnabled(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Could not enable sync: ${message}`);
      setBusy(null);
      return;
    }
    setBusy(null);
    onResolved();
  }

  async function handleDismiss() {
    setBusy('dismiss');
    try {
      await postSyncEnabled(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Could not save sync preference: ${message}`);
      setBusy(null);
      return;
    }
    setBusy(null);
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
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            className="uppercase font-mono"
            onClick={handleDismiss}
            disabled={busy !== null}
          >
            {busy === 'dismiss' ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Keep disabled'
            )}
          </Button>
          <Button onClick={handleEnable} disabled={busy !== null}>
            {busy === 'enable' ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Enabling…
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
