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
import { Label } from '@/components/ui/label';
import type {
  OkDesktopBridge,
  OkFindEnclosingGitRootResult,
  OkFindEnclosingProjectRootResult,
  OkFolderState,
  OkMcpWiringEditorId,
} from '@/lib/desktop-bridge-types';

const PROBE_DEBOUNCE_MS = 180;

const GIT_BANNER_POLL_INTERVAL_MS = 5_000;

type SettledCascade =
  | { kind: 'idle' }
  | { kind: 'block-nested'; rootPath: string }
  | { kind: 'confirm-git'; gitRoot: string }
  | { kind: 'block-nonempty' }
  | { kind: 'free' };

type ProbeLifecycle = 'idle' | 'in-flight';

type RemoveGitState =
  | { kind: 'idle' }
  | { kind: 'confirming'; gitRoot: string }
  | { kind: 'pending'; gitRoot: string }
  | { kind: 'error'; message: string };

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

export function dirnamePreview(path: string): string {
  if (path === '') return '';
  const trimmed = path.replace(/[/\\]+$/, '');
  if (trimmed === '') return '';
  const sepMatch = trimmed.match(/[/\\][^/\\]+$/);
  if (sepMatch === null) return '';
  const cutAt = trimmed.length - sepMatch[0].length;
  if (cutAt === 0) {
    return trimmed[0] ?? '';
  }
  return trimmed.slice(0, cutAt);
}

export function computeCascade(input: {
  parent: string;
  sanitizedName: string;
  enclosingProject: OkFindEnclosingProjectRootResult | null;
  enclosingGit: OkFindEnclosingGitRootResult | null;
  targetState: OkFolderState | null;
}): SettledCascade {
  const { parent, sanitizedName, enclosingProject, enclosingGit, targetState } = input;
  if (parent === '' || sanitizedName === '') return { kind: 'idle' };
  if (enclosingProject !== null) {
    return { kind: 'block-nested', rootPath: enclosingProject.rootPath };
  }
  if (enclosingGit !== null) {
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
      return 'A non-empty folder already exists at this path. Pick a different folder.';
    case 'invalid-args':
      return 'Invalid input — pick a different folder.';
    case 'mkdir-failed':
      return 'Could not create the project folder. Pick a different folder.';
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
  const [picked, setPicked] = useState('');
  const [defaultPath, setDefaultPath] = useState('');
  const [editorIds, setEditorIds] = useState<ReadonlySet<OkMcpWiringEditorId>>(
    () => new Set(ALL_EDITOR_IDS),
  );
  const [cascade, setCascade] = useState<SettledCascade>({ kind: 'idle' });
  const [probeLifecycle, setProbeLifecycle] = useState<ProbeLifecycle>('idle');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<CreateNewError | null>(null);
  const [removeGitState, setRemoveGitState] = useState<RemoveGitState>({ kind: 'idle' });
  const [probeNonce, setProbeNonce] = useState(0);

  const firedBanners = useRef<Set<CreateNewBannerKind>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browseButtonRef = useRef<HTMLButtonElement | null>(null);
  const removeGitCallIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    firedBanners.current.clear();
    setSubmitError(null);
    setCascade({ kind: 'idle' });
    setProbeLifecycle('idle');
    setBusy(false);
    setPicked('');
    setEditorIds(new Set(ALL_EDITOR_IDS));
    setRemoveGitState({ kind: 'idle' });
    removeGitCallIdRef.current += 1;

    let cancelled = false;
    setDefaultPath('');
    bridge.fs
      .defaultProjectsRoot()
      .then((root) => {
        if (!cancelled) setDefaultPath(root);
      })
      .catch((err) => {
        console.warn('[CreateProjectDialog] defaultProjectsRoot probe failed:', err);
      });

    const raf = requestAnimationFrame(() => {
      browseButtonRef.current?.focus();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [open, bridge]);

  useEffect(() => {
    void probeNonce;
    if (!open) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    if (abortRef.current !== null) abortRef.current.abort();

    if (picked === '') {
      setCascade({ kind: 'idle' });
      setProbeLifecycle('idle');
      return;
    }
    const parent = dirnamePreview(picked);
    const sanitized = sanitizeFolderName(basenamePreview(picked));
    if (parent === '' || sanitized === '') {
      setCascade({ kind: 'idle' });
      setProbeLifecycle('idle');
      return;
    }
    const target = joinPathPreview(parent, sanitized);

    setProbeLifecycle('in-flight');
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
          setProbeLifecycle('idle');
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
          setProbeLifecycle('idle');
          setCascade({ kind: 'free' });
        });
    }, PROBE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [open, picked, bridge, probeNonce]);

  useEffect(() => {
    if (!open) return;
    const onFocus = () => setProbeNonce((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open]);

  const probeLifecycleRef = useRef<ProbeLifecycle>('idle');
  useEffect(() => {
    probeLifecycleRef.current = probeLifecycle;
  }, [probeLifecycle]);

  useEffect(() => {
    if (!open) return;
    if (cascade.kind !== 'confirm-git') return;
    const id = setInterval(() => {
      if (probeLifecycleRef.current === 'in-flight') return;
      setProbeNonce((n) => n + 1);
    }, GIT_BANNER_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [open, cascade.kind]);

  useEffect(() => {
    if (cascade.kind !== 'confirm-git') {
      if (removeGitState.kind !== 'idle') {
        removeGitCallIdRef.current += 1;
        setRemoveGitState({ kind: 'idle' });
      }
      return;
    }
    if (removeGitState.kind === 'confirming' && removeGitState.gitRoot !== cascade.gitRoot) {
      setRemoveGitState({ kind: 'idle' });
    }
    if (removeGitState.kind === 'pending' && removeGitState.gitRoot !== cascade.gitRoot) {
      removeGitCallIdRef.current += 1;
      setRemoveGitState({ kind: 'idle' });
    }
  }, [cascade, removeGitState]);

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

  const rawBasename = picked === '' ? '' : basenamePreview(picked);
  const sanitized = picked === '' ? '' : sanitizeFolderName(rawBasename);
  const sanitizeDiverged = picked !== '' && sanitized !== rawBasename && sanitized !== '';
  const sanitizeErased = picked !== '' && rawBasename !== '' && sanitized === '';
  const previewPath = picked;
  const canSubmit =
    !busy &&
    picked !== '' &&
    sanitized !== '' &&
    probeLifecycle === 'idle' &&
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
      const pickedNew = await bridge.dialog.openFolder(
        defaultPath !== '' ? { defaultPath } : undefined,
      );
      if (pickedNew === null) return;
      setPicked(pickedNew);
      setProbeNonce((n) => n + 1);
      setSubmitError(null);
    } catch (err) {
      console.warn('[CreateProjectDialog] dialog.openFolder failed:', err);
    }
  }

  async function onSubmit(e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await bridge.project.createNew({
        parent: dirnamePreview(picked),
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

  async function onRequestRemoveGit(gitRoot: string) {
    setRemoveGitState({ kind: 'confirming', gitRoot });
  }

  async function onCancelRemoveGit() {
    setRemoveGitState({ kind: 'idle' });
  }

  async function onConfirmRemoveGit(gitRoot: string) {
    const callId = removeGitCallIdRef.current + 1;
    removeGitCallIdRef.current = callId;
    setRemoveGitState({ kind: 'pending', gitRoot });
    try {
      await bridge.fs.removeGitFolder(gitRoot);
      if (removeGitCallIdRef.current !== callId) return;
      setProbeNonce((n) => n + 1);
      setRemoveGitState({ kind: 'idle' });
    } catch (err) {
      if (removeGitCallIdRef.current !== callId) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[CreateProjectDialog] bridge.fs.removeGitFolder failed:', err);
      setRemoveGitState({ kind: 'error', message });
    }
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
            <div className="space-y-2">
              <Label htmlFor="create-location" className="block">
                Location
              </Label>
              <div className="flex items-stretch gap-2">
                <Button
                  id="create-location"
                  ref={browseButtonRef}
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onBrowse()}
                  aria-describedby="create-target-caption"
                  data-testid="create-browse"
                >
                  Browse
                </Button>
              </div>
              <p
                id="create-target-caption"
                className="text-xs text-muted-foreground"
                aria-live="polite"
                data-testid="create-target-caption"
              >
                {previewPath === ''
                  ? 'Click Browse to pick or create a project folder.'
                  : previewPath}
              </p>
            </div>

            {sanitizeDiverged ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                data-testid="create-banner-sanitize-diverged"
              >
                The folder name <code className="font-mono break-all">{rawBasename}</code> contains
                characters that aren't safe for the project's on-disk identifier. The project will
                be created as <code className="font-mono break-all">{sanitized}</code>. Click Browse
                again to pick a folder with a safer name.
              </div>
            ) : null}

            {sanitizeErased ? (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                data-testid="create-banner-sanitize-erased"
              >
                The folder name <code className="font-mono break-all">{rawBasename}</code> can't be
                used as a project identifier — it has no characters left after sanitization. Click
                Browse to pick a folder whose name contains at least one alphanumeric character.
              </div>
            ) : null}

            <CascadeBanner
              cascade={cascade}
              onOpenNested={onOpenNested}
              removeGitState={removeGitState}
              onRequestRemoveGit={onRequestRemoveGit}
              onCancelRemoveGit={onCancelRemoveGit}
              onConfirmRemoveGit={onConfirmRemoveGit}
            />

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
              {busy ? 'Creating' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CascadeBannerProps {
  cascade: SettledCascade;
  onOpenNested: (rootPath: string) => void;
  removeGitState: RemoveGitState;
  onRequestRemoveGit: (gitRoot: string) => void;
  onCancelRemoveGit: () => void;
  onConfirmRemoveGit: (gitRoot: string) => void;
}

function CascadeBanner({
  cascade,
  onOpenNested,
  removeGitState,
  onRequestRemoveGit,
  onCancelRemoveGit,
  onConfirmRemoveGit,
}: CascadeBannerProps) {
  if (cascade.kind === 'idle' || cascade.kind === 'free') {
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
    const { gitRoot } = cascade;
    const targetGitPath = `${gitRoot.replace(/\/+$/, '')}/.git`;
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200"
        data-testid="create-banner-git-confirm"
      >
        <p>
          Open Knowledge will be initialized at <code>{gitRoot}</code> — the parent of your new
          folder, because it contains a <code>.git</code> folder (one project per git repo).
        </p>
        {removeGitState.kind === 'idle' || removeGitState.kind === 'error' ? (
          <div className="mt-2 flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRequestRemoveGit(gitRoot)}
              data-testid="create-banner-git-remove"
            >
              Remove the parent <code>.git</code> folder
            </Button>
            {removeGitState.kind === 'error' ? (
              <p
                role="alert"
                className="text-xs text-destructive"
                data-testid="create-banner-git-remove-error"
              >
                Couldn't remove <code>{targetGitPath}</code>: {removeGitState.message}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className="mt-2 flex flex-col gap-2 rounded border border-blue-400/60 bg-white/40 p-2 dark:border-blue-600/60 dark:bg-black/20"
            data-testid="create-banner-git-remove-confirm"
          >
            <p className="text-xs">
              This will permanently delete{' '}
              <code className="font-mono break-all">{targetGitPath}</code>. All git history in that
              folder is lost; the working files stay in place. Only confirm if the parent git
              repository is unintended. If the parent is intentionally a git repository (you cloned
              it on purpose), cancel and pick a location outside it instead.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={removeGitState.kind === 'pending'}
                onClick={() => onConfirmRemoveGit(gitRoot)}
                data-testid="create-banner-git-remove-confirm-button"
              >
                {removeGitState.kind === 'pending' ? 'Removing…' : `Delete ${targetGitPath}`}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={removeGitState.kind === 'pending'}
                onClick={onCancelRemoveGit}
                data-testid="create-banner-git-remove-cancel"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      data-testid="create-banner-nonempty"
    >
      <p>A non-empty folder already exists at this path. Use "Open folder on disk" instead.</p>
    </div>
  );
}
