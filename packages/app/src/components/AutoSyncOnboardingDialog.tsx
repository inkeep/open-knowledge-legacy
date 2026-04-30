/**
 * AutoSyncOnboardingDialog — first-run prompt explaining git auto-sync.
 *
 * Replaces the dismissable dormant-state toast that previously fired in
 * `EditorPane`. Shown once per project when the sync engine reports
 * `state === 'dormant' && hasRemote === true` AND the project config field
 * `autoSync.onboardingResolvedAt` is null. Both buttons stamp the field with
 * an ISO timestamp so the modal never reopens for that project; only the
 * primary additionally calls `POST /api/sync/set-enabled`.
 */
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfigContext } from '@/lib/config-provider';

interface AutoSyncOnboardingDialogProps {
  open: boolean;
  onResolved: () => void;
}

async function setSyncEnabled(enabled: boolean): Promise<void> {
  const res = await fetch('/api/sync/set-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    throw new Error(`set-enabled failed: HTTP ${res.status}`);
  }
}

export function AutoSyncOnboardingDialog({ open, onResolved }: AutoSyncOnboardingDialogProps) {
  const { projectBinding } = useConfigContext();
  const [busy, setBusy] = useState<'enable' | 'dismiss' | null>(null);

  function stampResolved(): boolean {
    if (!projectBinding) {
      toast.error('Settings not ready — please try again in a moment.');
      return false;
    }
    const result = projectBinding.patch({
      autoSync: { onboardingResolvedAt: new Date().toISOString() },
    });
    if (!result.ok) {
      toast.error(`Could not save your choice: ${result.error.code}`);
      return false;
    }
    return true;
  }

  async function handleEnable() {
    setBusy('enable');
    try {
      await setSyncEnabled(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Could not enable sync: ${message}`);
      setBusy(null);
      return;
    }
    if (!stampResolved()) {
      setBusy(null);
      return;
    }
    setBusy(null);
    onResolved();
  }

  function handleDismiss() {
    setBusy('dismiss');
    if (!stampResolved()) {
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
          <DialogTitle>Enable git auto-sync?</DialogTitle>
          <DialogDescription>
            This project has a git remote configured. Auto-sync periodically fetches, pulls, and
            pushes commits to that remote so your edits stay in sync across machines.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <p className="mb-2 text-sm font-medium">Before you enable it:</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Pulls may overwrite uncommitted local file changes.</li>
            <li>Requires GitHub authentication.</li>
            <li>
              Intended for developer workflows — content-only users may prefer leaving this off.
            </li>
          </ul>
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
