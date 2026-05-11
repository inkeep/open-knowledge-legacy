import {
  ALL_EDITOR_IDS,
  CREATE_NEW_PROJECT_FAILURE_REASONS,
  type CreateNewBannerKind,
  type CreateNewProjectFailureReason,
  EDITOR_LABELS,
  sanitizeFolderName,
} from '@inkeep/open-knowledge-core';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  OkDesktopBridge,
  OkFindEnclosingGitRootResult,
  OkFindEnclosingProjectRootResult,
  OkFolderState,
  OkMcpWiringEditorId,
} from '@/lib/desktop-bridge-types';

const PROBE_DEBOUNCE_MS = 180;

type CascadeState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'block-nested'; rootPath: string }
  | { kind: 'confirm-git'; gitRoot: string }
  | { kind: 'block-nonempty' }
  | { kind: 'free' };

type CreateNewError =
  | { reason: 'nested-project'; rootPath?: string }
  | { reason: 'target-not-empty' }
  | { reason: 'invalid-args'; message: string }
  | { reason: 'mkdir-failed'; message: string }
  | { reason: 'git-init-failed'; message: string }
  | { reason: 'init-failed'; message: string }
  | { reason: 'discovery-failed'; message: string }
  | { reason: 'unknown'; message: string };

type _CreateNewReasonDriftPin =
  | (CreateNewProjectFailureReason extends Exclude<CreateNewError['reason'], 'unknown'>
      ? true
      : false)
  | (Exclude<CreateNewError['reason'], 'unknown'> extends CreateNewProjectFailureReason
      ? true
      : false);
const _CREATE_NEW_REASON_DRIFT_PIN: _CreateNewReasonDriftPin = true;
void _CREATE_NEW_REASON_DRIFT_PIN;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bridge: OkDesktopBridge;
}

export function joinPathPreview(parent: string, basename: string): string {
  if (parent === '' || basename === '') return '';
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  const trimmed = parent.replace(/[/\\]+$/, '');
  return `${trimmed}${sep}${basename}`;
}

export function basenamePreview(path: string): string {
  if (path === '') return '';
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments.length > 0 ? (segments[segments.length - 1] ?? path) : path;
}

export function computeCascade(input: {
  parent: string;
  sanitizedName: string;
  enclosingProject: OkFindEnclosingProjectRootResult | null;
  enclosingGit: OkFindEnclosingGitRootResult | null;
  targetState: OkFolderState | null;
}): CascadeState {
  const { parent, sanitizedName, enclosingProject, enclosingGit, targetState } = input;
  if (parent === '' || sanitizedName === '') return { kind: 'idle' };
  if (enclosingProject !== null) {
    return { kind: 'block-nested', rootPath: enclosingProject.rootPath };
  }
  if (enclosingGit !== null && enclosingGit.gitRoot !== parent) {
    return { kind: 'confirm-git', gitRoot: enclosingGit.gitRoot };
  }
  if (targetState === 'exists-nonempty') return { kind: 'block-nonempty' };
  return { kind: 'free' };
}

export function parseCreateNewError(err: unknown): CreateNewError {
  const msg = err instanceof Error ? err.message : String(err);
  for (const reason of CREATE_NEW_PROJECT_FAILURE_REASONS) {
    if (msg.startsWith(`${reason}:`) || msg.includes(`${reason}: `)) {
      if (reason === 'nested-project' || reason === 'target-not-empty') {
        return { reason };
      }
      return { reason, message: msg };
    }
  }
  return { reason: 'unknown', message: msg };
}

function errorCopy(err: CreateNewError): string {
  switch (err.reason) {
    case 'nested-project':
      return 'A project already exists at this location. Pick a different parent folder.';
    case 'target-not-empty':
      return 'A non-empty folder with this name already exists. Use a different name.';
    case 'invalid-args':
      return 'Invalid input — please check the name and try again.';
    case 'mkdir-failed':
      return 'Could not create the project folder. Try a different name or location.';
    case 'git-init-failed':
      return 'Project folder created, but git init failed. Try again.';
    case 'init-failed':
      return 'Could not write project files. Try a different location.';
    case 'discovery-failed':
      return 'Could not finalize project setup. Try again.';
    case 'unknown':
      return 'Could not create project. Try again or pick a different location.';
  }
}

export function CreateProjectDialog({ open, onOpenChange, bridge }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [parentLoading, setParentLoading] = useState(false);
  const [editorIds, setEditorIds] = useState<ReadonlySet<OkMcpWiringEditorId>>(
    () => new Set(ALL_EDITOR_IDS),
  );
  const [cascade, setCascade] = useState<CascadeState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<CreateNewError | null>(null);

  const probeCache = useRef(
    new Map<
      string,
      {
        enclosingProject: OkFindEnclosingProjectRootResult | null;
        enclosingGit: OkFindEnclosingGitRootResult | null;
        targetState: OkFolderState;
      }
    >(),
  );
  const firedBanners = useRef<Set<CreateNewBannerKind>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    probeCache.current.clear();
    firedBanners.current.clear();
    setSubmitError(null);
    setCascade({ kind: 'idle' });
    setBusy(false);
    setName('');
    setEditorIds(new Set(ALL_EDITOR_IDS));

    let cancelled = false;
    setParentLoading(true);
    bridge.fs
      .defaultProjectsRoot()
      .then((root) => {
        if (!cancelled) setParent(root);
      })
      .catch((err) => {
        console.warn('[CreateProjectDialog] defaultProjectsRoot probe failed:', err);
      })
      .finally(() => {
        if (!cancelled) setParentLoading(false);
      });

    const raf = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [open, bridge]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    if (abortRef.current !== null) abortRef.current.abort();

    const sanitized = sanitizeFolderName(name);
    if (parent === '' || sanitized === '') {
      setCascade({ kind: 'idle' });
      return;
    }
    const target = joinPathPreview(parent, sanitized);

    const cached = probeCache.current.get(target);
    if (cached !== undefined) {
      setCascade(
        computeCascade({
          parent,
          sanitizedName: sanitized,
          enclosingProject: cached.enclosingProject,
          enclosingGit: cached.enclosingGit,
          targetState: cached.targetState,
        }),
      );
      return;
    }

    setCascade({ kind: 'pending' });
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    debounceRef.current = setTimeout(() => {
      Promise.all([
        bridge.fs.findEnclosingProjectRoot(parent),
        bridge.fs.findEnclosingGitRoot(parent),
        bridge.fs.folderState(target),
      ])
        .then(([enclosingProject, enclosingGit, targetState]) => {
          if (ctrl.signal.aborted) return;
          probeCache.current.set(target, { enclosingProject, enclosingGit, targetState });
          setCascade(
            computeCascade({
              parent,
              sanitizedName: sanitized,
              enclosingProject,
              enclosingGit,
              targetState,
            }),
          );
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          console.warn('[CreateProjectDialog] cascade probe failed:', err);
          setCascade({ kind: 'free' });
        });
    }, PROBE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [open, name, parent, bridge]);

  useEffect(() => {
    if (!open) return;
    let banner: CreateNewBannerKind | null = null;
    if (cascade.kind === 'block-nested') banner = 'nested';
    else if (cascade.kind === 'block-nonempty') banner = 'nonempty';
    else if (cascade.kind === 'confirm-git') banner = 'git-confirm';
    if (banner === null) return;
    if (firedBanners.current.has(banner)) return;
    firedBanners.current.add(banner);
    bridge.project.recordCreateNewBannerShown(banner).catch(() => {});
  }, [open, cascade, bridge]);

  const sanitized = sanitizeFolderName(name);
  const target = sanitized === '' || parent === '' ? '' : joinPathPreview(parent, sanitized);
  const canSubmit =
    !busy &&
    sanitized !== '' &&
    parent !== '' &&
    (cascade.kind === 'free' || cascade.kind === 'confirm-git');

  function toggleEditor(id: OkMcpWiringEditorId) {
    setEditorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onBrowse() {
    try {
      const picked = await bridge.dialog.openFolder();
      if (picked === null) return;
      setParent(picked);
    } catch (err) {
      console.warn('[CreateProjectDialog] dialog.openFolder failed:', err);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await bridge.project.createNew({
        parent,
        name: sanitized,
        editors: Array.from(editorIds),
      });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(parseCreateNewError(err));
      setBusy(false);
    }
  }

  function onOpenChangeInternal(next: boolean) {
    if (busy) return;
    onOpenChange(next);
  }

  async function onOpenNested(rootPath: string) {
    onOpenChange(false);
    try {
      await bridge.project.open({
        path: rootPath,
        target: 'new-window',
        entryPoint: 'create-new-nested-redirect',
      });
    } catch (err) {
      console.warn('[CreateProjectDialog] project.open failed:', err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeInternal}>
      <DialogContent
        className="sm:max-w-lg motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none"
        data-testid="create-project-dialog"
      >
        <DialogHeader>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>
            Make a new folder for a brand-new Open Knowledge project.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          data-testid="create-project-form"
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="create-name" className="mb-1 block">
                Name
              </Label>
              <Input
                id="create-name"
                ref={nameInputRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSubmitError(null);
                }}
                disabled={busy}
                placeholder="My Notes"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="create-target-caption"
                data-testid="create-name"
              />
            </div>

            <div>
              <Label htmlFor="create-location" className="mb-1 block">
                Location
              </Label>
              <div className="flex items-stretch gap-2">
                <Input
                  id="create-location"
                  value={parentLoading ? '' : parent}
                  readOnly
                  disabled={busy}
                  placeholder={parentLoading ? 'Loading…' : ''}
                  className="flex-1"
                  data-testid="create-location"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || parentLoading}
                  onClick={() => void onBrowse()}
                  data-testid="create-browse"
                >
                  Browse…
                </Button>
              </div>
              <p
                id="create-target-caption"
                className="mt-1 text-xs text-muted-foreground"
                aria-live="polite"
                data-testid="create-target-caption"
              >
                {target === '' ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">No target path yet</span>
                  </>
                ) : (
                  target
                )}
              </p>
            </div>

            <CascadeBanner cascade={cascade} onOpenNested={onOpenNested} />

            <fieldset className="space-y-2 pb-2">
              <legend className="text-sm font-medium">Connect AI editors</legend>
              <p className="text-xs text-muted-foreground">
                All editors are checked by default — uncheck the ones you don't use.
              </p>
              {ALL_EDITOR_IDS.map((id) => {
                const inputId = `create-editor-${id}`;
                return (
                  <Label key={id} htmlFor={inputId} className="text-sm font-normal">
                    <Checkbox
                      id={inputId}
                      checked={editorIds.has(id)}
                      onCheckedChange={() => toggleEditor(id)}
                      disabled={busy}
                      data-testid={`create-editor-${id}`}
                    />
                    <span>{EDITOR_LABELS[id]}</span>
                  </Label>
                );
              })}
            </fieldset>

            {submitError !== null ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="create-submit-error"
              >
                {errorCopy(submitError)}
              </div>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="font-mono uppercase"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              data-testid="create-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="create-submit">
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CascadeBannerProps {
  cascade: CascadeState;
  onOpenNested: (rootPath: string) => void;
}

function CascadeBanner({ cascade, onOpenNested }: CascadeBannerProps) {
  if (cascade.kind === 'idle' || cascade.kind === 'pending' || cascade.kind === 'free') {
    return null;
  }
  if (cascade.kind === 'block-nested') {
    const basename = basenamePreview(cascade.rootPath);
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        data-testid="create-banner-nested"
      >
        <p className="mb-2">
          Can't nest projects. An Open Knowledge project already exists at{' '}
          <code className="font-mono break-all">{cascade.rootPath}</code>. Choose a location outside
          it, or open that project instead.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenNested(cascade.rootPath)}
          data-testid="create-banner-nested-open"
        >
          Open {basename}
        </Button>
      </div>
    );
  }
  if (cascade.kind === 'confirm-git') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200"
        data-testid="create-banner-git-confirm"
      >
        <p>
          Open Knowledge initializes at the git root. Only the contents of your new folder will be
          tracked by Open Knowledge. The project file (<code>.ok/config.yml</code>) is placed at{' '}
          <code className="font-mono break-all">{cascade.gitRoot}</code> — one project per git repo.
        </p>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      data-testid="create-banner-nonempty"
    >
      <p>A non-empty folder with this name already exists. Use "Open folder on disk" instead.</p>
    </div>
  );
}
