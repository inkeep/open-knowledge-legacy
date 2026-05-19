// biome-ignore-all lint/plugin/no-raw-html-interactive-element: pre-rule backlog — file uses raw <button> elements awaiting shadcn migration; tracked at https://github.com/inkeep/open-knowledge-legacy/blob/main/biome-plugins/README.md#no-raw-html-interactive-elementgrit

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import type {
  OkDesktopBridge,
  OkLocalOpAuthStatusResponse,
  OkShareReceivedPayload,
} from '@/lib/desktop-bridge-types';
import {
  buildCloneUrl,
  canonicalGitHubRemoteUrl,
  findQ1Match,
  formatReceiveLog,
  mapValidationToToast,
  presentReceiveError,
  resolveSharePayload,
} from '@/lib/share/receive-flow';
import { type ShareReceiveStore, shareReceiveStore } from '@/lib/share/receive-store';

export type ShareReceiveCloneResult =
  | { readonly kind: 'ok'; readonly dir: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error' };

export interface ShareReceiveCloneController {
  getAuthStatus(): Promise<OkLocalOpAuthStatusResponse>;
  startSignIn(): Promise<OkLocalOpAuthStatusResponse | null>;
  runClone(args: { url: string }): Promise<ShareReceiveCloneResult>;
}

export interface ShareReceiveDialogProps {
  bridge: OkDesktopBridge;
  cloneController?: ShareReceiveCloneController;
  store?: ShareReceiveStore;
}

export function ShareReceiveDialog({
  bridge,
  cloneController,
  store = shareReceiveStore,
}: ShareReceiveDialogProps) {
  const payload = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
  const [q1Done, setQ1Done] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<OkLocalOpAuthStatusResponse | null>(null);
  const [authChecking, setAuthChecking] = useState(false);
  const [cloneRunning, setCloneRunning] = useState(false);
  const authProbeStartedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: payload is a reset trigger, not a value source — the effect body only invokes setters but MUST re-run when the payload identity changes.
  useEffect(() => {
    setQ1Done(false);
    setPickerOpen(false);
    setAuthStatus(null);
    setAuthChecking(false);
    setCloneRunning(false);
    authProbeStartedRef.current = false;
  }, [payload]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cloneController identity churns every render in the parent; semantically only Q1-result + auth-state transitions should retrigger the check.
  useEffect(() => {
    if (!cloneController) return;
    if (!payload || payload.kind !== 'ok') return;
    if (!q1Done) return;
    if (authStatus !== null) return;
    if (authProbeStartedRef.current) return;
    authProbeStartedRef.current = true;
    setAuthChecking(true);
    void cloneController
      .getAuthStatus()
      .then((result) => {
        setAuthStatus(result);
      })
      .catch(() => {
        setAuthStatus({ authenticated: false, host: 'github.com' });
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, [payload, q1Done, authStatus]);

  useEffect(() => {
    if (!payload) return;
    const error = presentReceiveError(payload);
    if (error) {
      toast.error(error.message);
      store.dismiss();
    }
  }, [payload, store]);

  useEffect(() => {
    if (!payload || payload.kind !== 'ok' || q1Done) return;
    let cancelled = false;
    void runQ1Lookup(payload, bridge).then((result) => {
      if (cancelled) return;
      if (result.kind === 'hit') {
        console.log(formatReceiveLog({ q1_hit: true }));
        store.dismiss();
        return;
      }
      console.log(formatReceiveLog({ q1_hit: false }));
      setQ1Done(true);
    });
    return () => {
      cancelled = true;
    };
  }, [payload, q1Done, bridge, store]);

  const resolved = payload ? resolveSharePayload(payload) : null;
  if (!resolved) return null;
  const expected = { owner: resolved.owner, repo: resolved.repo };

  if (!q1Done) return null;

  async function handleCloneCtaClick(): Promise<void> {
    if (!resolved) return;
    console.log(formatReceiveLog({ q2_path: 'clone' }));
    if (!cloneController) {
      toast.info('Clone happens in the Project Navigator. Reclick the share link there.', {
        action: {
          label: 'Open Navigator',
          onClick: () => {
            void bridge.navigator.open();
          },
        },
        duration: 8000,
      });
      return;
    }
    if (!authStatus?.authenticated || cloneRunning) return;
    setCloneRunning(true);
    const cloneUrl = buildCloneUrl(expected);
    let result: ShareReceiveCloneResult;
    try {
      result = await cloneController.runClone({ url: cloneUrl });
    } catch {
      toast.error('Clone failed. Please try again.');
      setCloneRunning(false);
      return;
    }
    setCloneRunning(false);
    if (result.kind === 'ok') {
      try {
        await bridge.project.open({
          path: result.dir,
          target: 'new-window',
          entryPoint: 'share-receive',
          pendingDeepLinkDoc: resolved.path,
        });
      } catch {
        toast.error('Cloned successfully, but could not open the project.');
      }
      store.dismiss();
      return;
    }
  }

  async function handleSignInClick(): Promise<void> {
    if (!cloneController || authChecking) return;
    setAuthChecking(true);
    try {
      const next = await cloneController.startSignIn();
      setAuthChecking(false);
      if (next !== null) setAuthStatus(next);
    } catch {
      setAuthChecking(false);
    }
  }

  async function handleLocalCtaClick(): Promise<void> {
    if (!resolved || pickerOpen) return;
    setPickerOpen(true);
    console.log(formatReceiveLog({ q2_path: 'local' }));
    try {
      while (true) {
        const folderPath = await bridge.dialog.openFolder();
        if (!folderPath) break;
        const result = await bridge.share.validateLocalFolder({
          folderPath,
          owner: expected.owner,
          repo: expected.repo,
        });
        console.log(formatReceiveLog({ folder_validate: result.kind }));
        if (result.kind === 'ok') {
          await bridge.project.open({
            path: folderPath,
            target: 'new-window',
            entryPoint: 'share-receive',
            pendingDeepLinkDoc: resolved.path,
          });
          store.dismiss();
          break;
        }
        const message = mapValidationToToast(result, expected);
        if (message) toast.error(message);
      }
    } catch {
      toast.error('Could not validate folder. Please try again.');
    }
    setPickerOpen(false);
  }

  const cloneEnabled =
    cloneController !== undefined && authStatus?.authenticated === true && !cloneRunning;
  const cloneLabel = cloneRunning
    ? 'Cloning...'
    : cloneController && authStatus?.authenticated === false
      ? 'Sign in to clone'
      : 'Clone to a new folder';

  return (
    <DialogRoot
      open={true}
      onOpenChange={(open) => {
        if (!open) store.dismiss();
      }}
    >
      <DialogContent className="sm:max-w-xl" data-testid="share-receive-dialog">
        <DialogHeader>
          <DialogTitle>Open shared document</DialogTitle>
          <DialogDescription>
            {resolved.owner}/{resolved.repo}
            {resolved.path ? ` · ${resolved.path}` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              data-testid="share-receive-clone"
              className="flex flex-col items-start gap-2 rounded-lg border-2 border-primary/40 bg-card p-4 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-primary/40 disabled:hover:bg-card"
              onClick={() => {
                void handleCloneCtaClick();
              }}
              disabled={cloneController !== undefined && !cloneEnabled}
              aria-disabled={cloneController !== undefined && !cloneEnabled}
            >
              <span className="text-sm font-semibold">{cloneLabel}</span>
              <span className="text-xs text-muted-foreground">
                Downloads {resolved.owner}/{resolved.repo} from GitHub.
              </span>
            </button>
            <button
              type="button"
              data-testid="share-receive-local"
              className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition hover:border-foreground/50 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                void handleLocalCtaClick();
              }}
              disabled={pickerOpen || cloneRunning}
            >
              <span className="text-sm font-semibold">I already have it locally →</span>
              <span className="text-xs text-muted-foreground">
                Pick the folder where you've cloned it.
              </span>
            </button>
          </div>
          {cloneController ? (
            <div
              className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
              data-testid="share-receive-auth-banner"
            >
              {authStatus === null ? (
                <span className="text-muted-foreground">Checking GitHub sign-in...</span>
              ) : authStatus.authenticated ? (
                <span className="text-muted-foreground">
                  Signed in as{' '}
                  <span className="font-medium text-foreground/90">@{authStatus.login}</span>
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground">Not signed in to GitHub.</span>
                  <button
                    type="button"
                    data-testid="share-receive-signin"
                    className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    onClick={() => {
                      void handleSignInClick();
                    }}
                    disabled={authChecking}
                  >
                    {authChecking ? 'Opening...' : 'Sign in to GitHub'}
                  </button>
                </>
              )}
            </div>
          ) : null}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Looking for{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground/80">
              {canonicalGitHubRemoteUrl(expected)}
            </code>
            .
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => store.dismiss()}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

interface Q1Result {
  kind: 'hit' | 'miss';
}

async function runQ1Lookup(
  payload: Extract<OkShareReceivedPayload, { kind: 'ok' }>,
  bridge: OkDesktopBridge,
): Promise<Q1Result> {
  let match: { path: string } | null;
  try {
    const recents = await bridge.project.listRecent();
    match = findQ1Match(recents, { owner: payload.owner, repo: payload.repo });
  } catch {
    return { kind: 'miss' };
  }
  if (!match) return { kind: 'miss' };
  try {
    const valid = await bridge.share.validateLocalFolder({
      folderPath: match.path,
      owner: payload.owner,
      repo: payload.repo,
    });
    if (valid.kind !== 'ok') return { kind: 'miss' };
  } catch {
    return { kind: 'miss' };
  }
  try {
    await bridge.project.open({
      path: match.path,
      target: 'new-window',
      entryPoint: 'share-receive',
      pendingDeepLinkDoc: payload.path,
    });
    return { kind: 'hit' };
  } catch {
    return { kind: 'miss' };
  }
}
