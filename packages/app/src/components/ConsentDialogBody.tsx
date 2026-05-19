// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button>/<input>/<textarea> awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { ChevronRight } from 'lucide-react';
import type React from 'react';
import { useEffect, useId, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  const formId = useId();
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

  function onSubmit(e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open this folder with Open Knowledge</DialogTitle>
          <DialogDescription>
            Open Knowledge will create a <code>.ok/</code> folder here to track this project's
            metadata.
          </DialogDescription>
        </DialogHeader>

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

          <form id={formId} onSubmit={onSubmit} data-testid="consent-form" className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="consent-content-dir" className="text-sm font-medium">
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
                  className="text-1sm text-destructive"
                  data-testid="consent-content-dir-browse-error"
                >
                  {browseError}
                </p>
              ) : !contentDirSafe ? (
                <p className="text-1sm text-destructive" data-testid="consent-content-dir-error">
                  Content directory must be inside the project
                </p>
              ) : (
                <ProbePreview probe={probe} />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="consent-additional-ignores" className="text-sm font-medium">
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
              <p className="text-1sm text-muted-foreground">
                One pattern per line — appended to <code>.okignore</code>.
              </p>
            </div>

            <fieldset className="flex flex-col space-y-2 pb-2">
              <legend className="text-sm font-medium">Connect to AI tools</legend>
              <p className="text-1sm text-muted-foreground">
                Writes a project-MCP config for each selected tool; Claude also gets{' '}
                <code>.claude/launch.json</code>.
              </p>
              {payload.editorOptions.map((editor) => {
                const checkboxId = `consent-editor-${editor.id}-cb`;
                return (
                  <label
                    key={editor.id}
                    htmlFor={checkboxId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={editorIds.has(editor.id)}
                      onCheckedChange={() => toggleEditor(editor.id)}
                      disabled={busy}
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
                );
              })}
            </fieldset>
          </form>
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
          <Button type="submit" form={formId} disabled={startDisabled} data-testid="consent-start">
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProbePreview({ probe }: { probe: OkOnboardingProbeContentResult | null }) {
  if (probe === null) {
    return (
      <p className="text-1sm text-muted-foreground" data-testid="consent-preview">
        Counting markdown files
      </p>
    );
  }
  if (!probe.ok) {
    return (
      <p className="text-1sm text-muted-foreground" data-testid="consent-preview">
        Preview unavailable: {probe.error}
      </p>
    );
  }
  const countDisplay = probe.truncated ? '≥ 50,000' : String(probe.count);
  const countLine = `Found ${countDisplay} markdown files`;
  if (probe.sample.length === 0) {
    return (
      <p className="text-1sm text-muted-foreground" data-testid="consent-preview">
        {countLine}
      </p>
    );
  }
  const remaining = probe.truncated ? null : probe.count - probe.sample.length;
  return (
    <Collapsible data-testid="consent-preview">
      <CollapsibleTrigger className="flex items-center gap-1 text-1sm text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-90">
        <ChevronRight
          className="size-3 transition-transform motion-reduce:transition-none"
          aria-hidden
        />
        <span>{countLine}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1 pl-4 text-1sm text-muted-foreground">
        <ul className="space-y-1.5 font-mono">
          {probe.sample.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
        {probe.truncated || (remaining !== null && remaining > 0) ? (
          <p className="mt-1 italic">and {probe.truncated ? 'more' : `${remaining} more`}</p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default ConsentDialogBody;
