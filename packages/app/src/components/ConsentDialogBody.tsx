import type React from 'react';
import { useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { type ConsentStore, consentStore as defaultConsentStore } from '@/lib/consent-store';
import type {
  OkMcpWiringEditorId,
  OkOnboardingProbeContentResult,
  OkOnboardingShowPayload,
  OkOnboardingWarningKind,
} from '@/lib/desktop-bridge-types';
import { isContentDirSafe, relativeToProject } from '@/lib/project-paths';

const PROBE_THROTTLE_MS = 750;

const WARNING_COPY: Record<OkOnboardingWarningKind, string> = {
  root: "You picked the filesystem root (/). Scaffolding here will scan every file on this machine — make sure that's what you want.",
  home: 'You picked your home directory. OK will index everything in your home tree — large and may surface personal files.',
  'home-documents':
    'You picked ~/Documents. OK will index every markdown file under it. If you only want to manage a sub-folder, choose a smaller scope.',
  'home-desktop': 'You picked ~/Desktop. OK will index everything on your desktop.',
  'home-downloads':
    'You picked ~/Downloads. Files there are usually transient — consider a stable folder instead.',
  'volumes-mount':
    'This path is on an external volume (/Volumes/...). OK will lose track of files when the drive ejects.',
  'drive-root':
    'This looks like a drive root (e.g., C:\\). Scaffolding here will scan an entire drive.',
};

interface ConsentDialogBodyProps {
  store?: ConsentStore;
  toast?: ToastImpl;
  payload?: OkOnboardingShowPayload;
}

export interface ToastImpl {
  error(message: string): void;
}

const defaultToast: ToastImpl = {
  error: (msg) => sonnerToast.error(msg),
};

function ConsentDialogBody({
  store = defaultConsentStore,
  toast = defaultToast,
  payload,
}: ConsentDialogBodyProps = {}) {
  const snapshot = payload ?? store.getSnapshot();
  if (!snapshot) return null;
  return <ConsentDialogForm payload={snapshot} store={store} toast={toast} />;
}

interface ConsentDialogFormProps {
  payload: OkOnboardingShowPayload;
  store: ConsentStore;
  toast: ToastImpl;
}

function ConsentDialogForm({ payload, store, toast }: ConsentDialogFormProps) {
  const initGit = true;
  const [contentDir, setContentDir] = useState(payload.defaultContentDir);
  const [additionalIgnores, setAdditionalIgnores] = useState('');
  const [editorIds, setEditorIds] = useState<ReadonlySet<OkMcpWiringEditorId>>(
    () => new Set(payload.editorOptions.map((e) => e.id)),
  );
  const [probe, setProbe] = useState<OkOnboardingProbeContentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  useEffect(() => {
    if (!isContentDirSafe(contentDir)) {
      setProbe(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      const bridge = window.okDesktop;
      if (!bridge) return;
      bridge.onboarding
        .probeContent({ contentDir })
        .then((result) => {
          if (!cancelled) setProbe(result);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : 'probe failed';
            setProbe({ ok: false, error: message });
          }
        });
    }, PROBE_THROTTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [contentDir]);

  const contentDirSafe = isContentDirSafe(contentDir);
  const startDisabled = busy || !contentDirSafe;

  function toggleEditor(id: OkMcpWiringEditorId) {
    setEditorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onBrowseContentDir() {
    const bridge = window.okDesktop;
    if (!bridge) return;
    let picked: string | null;
    try {
      picked = await bridge.dialog.openFolder({ defaultPath: payload.projectDir });
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Could not open folder picker');
      return;
    }
    if (picked === null) return;
    const relative = relativeToProject(payload.projectDir, picked);
    if (relative === null) {
      setBrowseError('Selection must be inside the project');
      return;
    }
    setBrowseError(null);
    setContentDir(relative);
  }

  async function onConfirm() {
    setBusy(true);
    const result = await store.confirm({
      initGit,
      contentDir,
      additionalIgnores,
      editorIds: Array.from(editorIds),
    });
    if (!result.ok) {
      toast.error(result.error);
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (startDisabled) return;
    void onConfirm();
  }

  async function onCancel() {
    setBusy(true);
    const result = await store.cancel();
    if (!result.ok) {
      toast.error(result.error);
      setBusy(false);
    }
  }

  function onOpenChange(open: boolean) {
    if (!open && !busy) void onCancel();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none">
        <DialogHeader>
          <DialogTitle>Open this folder with Open Knowledge</DialogTitle>
          <DialogDescription>
            Open Knowledge will create a <code>.ok/</code> folder to track this project's metadata.
            Click Start to proceed with the defaults below — adjust any field first, or Cancel to
            leave the folder untouched.
          </DialogDescription>
        </DialogHeader>

        {/* Transparent flex column — DialogBody's flex-1/min-h-0/overflow-y-auto
            and DialogFooter's shrink-0 require a flex parent (see dialog.tsx
            layout contract). Without these classes the footer is pushed
            off-screen on tall content. */}
        <form
          onSubmit={onSubmit}
          data-testid="consent-form"
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-4">
            {payload.gitRootPromoted ? (
              <p className="text-sm text-muted-foreground">
                OK will be initialized at <code>{payload.projectDir}</code> — the parent of{' '}
                <code>
                  {relativeToProject(payload.projectDir, payload.pickedPath) ?? payload.pickedPath}
                </code>{' '}
                because it contains a <code>.git</code> folder (one .ok/ per git repo).{' '}
                <code>Content directory</code> defaults to <code>.</code> (the whole repo); type a
                sub-folder below to narrow it.
              </p>
            ) : null}

            {payload.warnings.length > 0 ? (
              <div
                role="alert"
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                {payload.warnings.map((w) => (
                  <p key={w.kind} className="mb-1 last:mb-0">
                    {WARNING_COPY[w.kind]}
                  </p>
                ))}
              </div>
            ) : null}

            <div>
              <label htmlFor="consent-content-dir" className="mb-1 block text-sm font-medium">
                Content directory
              </label>
              <div className="flex items-stretch gap-2">
                <Input
                  id="consent-content-dir"
                  value={contentDir}
                  onChange={(e) => {
                    setContentDir(e.target.value);
                    setBrowseError(null);
                  }}
                  disabled={busy}
                  aria-invalid={!contentDirSafe}
                  data-testid="consent-content-dir"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onBrowseContentDir()}
                  data-testid="consent-content-dir-browse"
                >
                  Browse
                </Button>
              </div>
              {browseError !== null ? (
                <p
                  className="mt-1 text-xs text-destructive"
                  data-testid="consent-content-dir-browse-error"
                >
                  {browseError}
                </p>
              ) : !contentDirSafe ? (
                <p
                  className="mt-1 text-xs text-destructive"
                  data-testid="consent-content-dir-error"
                >
                  Content directory must be inside the project
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="consent-preview">
                  {renderProbeLine(probe)}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="consent-additional-ignores"
                className="mb-1 block text-sm font-medium"
              >
                Ignore patterns
              </label>
              <Textarea
                id="consent-additional-ignores"
                value={additionalIgnores}
                onChange={(e) => setAdditionalIgnores(e.target.value)}
                disabled={busy}
                placeholder={'tmp/\n*.draft.md'}
                rows={3}
                data-testid="consent-additional-ignores"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One pattern per line — appended to <code>.okignore</code>.
              </p>
            </div>

            <fieldset className="space-y-2 pb-2">
              <legend className="text-sm font-medium">Connect to AI tools</legend>
              <p className="text-xs text-muted-foreground">
                All editors are checked by default — uncheck the ones you don't use. Each checked
                editor's project-MCP config is written; the Claude Code entry also scaffolds{' '}
                <code>.claude/launch.json</code>.
              </p>
              {payload.editorOptions.map((editor) => (
                <label key={editor.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editorIds.has(editor.id)}
                    onChange={() => toggleEditor(editor.id)}
                    disabled={busy}
                    className="size-4 shrink-0 rounded accent-primary"
                    data-testid={`consent-editor-${editor.id}`}
                  />
                  <span>{editor.label}</span>
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid={`consent-editor-${editor.id}-scope`}
                  >
                    {editor.hasProjectConfig ? '(project + user)' : '(user-level only)'}
                  </span>
                </label>
              ))}
            </fieldset>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="font-mono uppercase"
              onClick={() => void onCancel()}
              disabled={busy}
              data-testid="consent-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={startDisabled} data-testid="consent-start">
              Start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function renderProbeLine(probe: OkOnboardingProbeContentResult | null): string {
  if (probe === null) return 'Counting markdown files';
  if (!probe.ok) return `Preview unavailable: ${probe.error}`;
  const countDisplay = probe.truncated ? '≥ 50,000' : String(probe.count);
  if (probe.sample.length === 0) {
    return `Found ${countDisplay} markdown files`;
  }
  return `Found ${countDisplay} markdown files; sample: ${probe.sample.join(', ')}`;
}

export default ConsentDialogBody;
