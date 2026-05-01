/**
 * AutoSyncOnboardingDialog — first-run prompt explaining git auto-sync.
 *
 * Replaces the dismissable dormant-state toast that previously fired in
 * `EditorPane`. Shown once per project when the sync engine reports a remote
 * exists AND the project config field `autoSync.enabled` has not been set.
 * Both buttons call `POST /api/sync/set-enabled`, which persists the choice to
 * config.yml.
 */
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
    <DialogRoot
      open={open}
      // Both buttons explicitly call onResolved; ignore Radix close-on-outside-
      // click / Esc so the user doesn't accidentally clear the prompt without
      // making a real choice.
      onOpenChange={() => {}}
    >
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
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Keep disabled'
            )}
          </Button>
          <Button onClick={handleEnable} disabled={busy !== null}>
            {busy === 'enable' ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
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
