import { DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function AutoSyncEnableDialogIntro() {
  return (
    <>
      <DialogTitle>Enable git auto-sync?</DialogTitle>
      <DialogDescription>
        Auto-sync periodically fetches, pulls, and pushes commits to your remote git repository so
        your edits stay in sync across machines.
      </DialogDescription>
    </>
  );
}

export function AutoSyncEnableWarning() {
  return (
    <>
      <p className="mb-2 text-sm font-medium">Before you enable it:</p>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Pulls may overwrite uncommitted local file changes.</li>
        <li>
          If you do not want automatic commits in your git history, you should not enable auto-sync.
        </li>
      </ul>
    </>
  );
}
