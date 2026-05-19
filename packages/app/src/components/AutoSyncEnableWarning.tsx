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
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="mb-2 font-medium">Before you enable it</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Pulls may overwrite uncommitted local file changes.</li>
        <li>
          Open Knowledge will create commits and push them to your remote automatically. If you do
          not want automatic commits in your git history, you should not enable auto-sync.
        </li>
        <li>
          If this repo is shared, your in-progress edits become visible to collaborators as soon as
          they sync.
        </li>
      </ul>
    </div>
  );
}
