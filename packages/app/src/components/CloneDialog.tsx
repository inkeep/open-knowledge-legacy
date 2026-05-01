/**
 * CloneDialog — dialog for cloning a GitHub repo into a new Open Knowledge project.
 *
 * Supports:
 *   - Paste URL or owner/repo shorthand
 *   - Authenticated repo browse when signed in (via `AuthQueryTransport.repos()`)
 *   - Local path auto-filled to ~/Documents/<repo-name>
 *   - Clone via `CloneTransport` — HTTP wrapper around POST /api/local-op/clone
 *     (default, web + editor) or IPC for the Project Navigator (Electron)
 *   - Sign-in integration: onSignIn prop opens AuthModal (US-027)
 *   - On complete: redirect to the new server port (HTTP) or call
 *     `onCloneComplete({port?, dir})` (IPC — Electron main spawns a new editor)
 *
 * Pre-stream RFC 9457 problem+json errors are surfaced via the HTTP transport
 * (`packages/app/src/lib/transports/clone-transport.ts`) — the dialog reads
 * the unified `event.message` shape so HTTP and IPC consumers stay aligned.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  type AuthQueryTransport,
  httpAuthQueryTransport,
} from '@/lib/transports/auth-query-transport';
import { type CloneTransport, httpCloneTransport } from '@/lib/transports/clone-transport';
import { Button } from './ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Skeleton } from './ui/skeleton';

interface RepoEntry {
  full_name: string;
  clone_url: string;
  private: boolean;
}

type ClonePhase = 'receiving' | 'resolving' | 'checking' | 'init' | 'done' | string;

function phaseLabel(phase: ClonePhase): string {
  switch (phase) {
    case 'receiving':
      return 'Receiving objects';
    case 'resolving':
      return 'Resolving deltas';
    case 'checking':
      return 'Checking out files';
    case 'init':
      return 'Initializing project';
    case 'done':
      return 'Complete';
    default:
      return 'Cloning';
  }
}

/** Extract repo name from a URL or owner/repo shorthand. */
function extractRepoName(input: string): string {
  const trimmed = input.trim();
  // owner/repo shorthand
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return trimmed.split('/')[1];
  try {
    const url = new URL(trimmed.replace(/^git@([^:]+):/, 'https://$1/'));
    return (
      url.pathname
        .replace(/\.git$/, '')
        .split('/')
        .pop() ?? 'repo'
    );
  } catch {
    return (
      trimmed
        .split('/')
        .pop()
        ?.replace(/\.git$/, '') ?? 'repo'
    );
  }
}

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when "Sign in to GitHub" is clicked. */
  onSignIn?: () => void;
  /**
   * Called when the clone completes successfully. When provided, the dialog
   * does NOT redirect via `window.location.href` — the caller takes over
   * navigation. Used by the Electron Navigator to spawn a new editor window
   * at `dir` instead of navigating the launcher itself to the new dev port.
   *
   * Shape is the flattened union of the two transport `complete` variants:
   * HTTP relay emits `{port, dir}`; IPC main emits `{dir}` only. `dir` is
   * always present (server-side guarantee, type-pinned by the drift catcher
   * `local-op-types-drift.test.ts`); `port` is HTTP-only.
   */
  onCloneComplete?: (info: { port?: number; dir: string }) => void;
  /**
   * Transport for the clone subprocess. Defaults to the HTTP path (POST
   * /api/local-op/clone) so existing editor / web callers don't change.
   * The Project Navigator passes an IPC transport because its window has
   * no backing API server.
   */
  transport?: CloneTransport;
  /**
   * Transport for the one-shot auth-status / repos queries. Defaults to
   * the HTTP path (POST /api/local-op/auth/{status,repos}). Navigator
   * passes an IPC transport — without it the queries 404 on the renderer
   * dev server and the dialog persistently shows the Sign-in button even
   * when the user is signed in.
   */
  authQueryTransport?: AuthQueryTransport;
}

export function CloneDialog({
  open,
  onOpenChange,
  onSignIn,
  onCloneComplete,
  transport,
  authQueryTransport,
}: CloneDialogProps) {
  const resolvedTransport = transport ?? httpCloneTransport();
  const resolvedAuthQuery = authQueryTransport ?? httpAuthQueryTransport();
  const [urlInput, setUrlInput] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [cloning, setCloning] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  // Check auth status when the dialog opens. The transport defaults to the
  // HTTP path; Navigator passes an IPC transport because its window has no
  // backing API server (apiOrigin === '') — the HTTP fetch would 404 on the
  // renderer dev server and the dialog would persistently show "Sign in".
  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedAuthQuery is stable per render
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolvedAuthQuery
      .status()
      .then((data) => {
        if (!cancelled) setIsSignedIn(data.authenticated);
      })
      .catch(() => {
        if (!cancelled) setIsSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedAuthQuery is stable per render
  useEffect(() => {
    if (!isSignedIn || !open) return;
    let cancelled = false;
    setLoadingRepos(true);
    void resolvedAuthQuery
      .repos()
      .then((result) => {
        if (cancelled) return;
        setRepos(result.ok ? result.repos : []);
        setLoadingRepos(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRepos([]);
        setLoadingRepos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, open]);

  function handleUrlChange(value: string) {
    setUrlInput(value);
    const name = extractRepoName(value);
    if (name) setLocalPath(`~/Documents/${name}`);
  }

  function handleRepoSelect(repo: RepoEntry) {
    setUrlInput(repo.clone_url);
    const name = repo.full_name.split('/')[1];
    setLocalPath(`~/Documents/${name}`);
  }

  async function handleClone() {
    if (!urlInput.trim()) {
      toast.error('Enter a repository URL or owner/repo');
      return;
    }

    setCloning(true);

    const toastId = toast.loading('Starting clone…', { duration: Number.POSITIVE_INFINITY });
    toastIdRef.current = toastId;

    const handle = resolvedTransport.start({
      url: urlInput.trim(),
      dir: localPath || '',
    });
    cancelRef.current = handle.cancel;

    try {
      // Manual iterator drive — React Compiler (BuildHIR) does not yet
      // support `for await ... of` lowering.
      const iter = handle.events[Symbol.asyncIterator]();
      let sawTerminal = false;
      let result = await iter.next();
      while (!result.done) {
        const event = result.value;
        if (event.type === 'progress') {
          toast.loading(`${phaseLabel(event.phase)} — ${event.pct}%`, { id: toastId });
        } else if (event.type === 'complete') {
          sawTerminal = true;
          toast.success('Clone complete — opening project', { id: toastId });
          onOpenChange(false);
          setCloning(false);
          cancelRef.current = null;
          const port = 'port' in event ? event.port : undefined;
          if (onCloneComplete) {
            onCloneComplete({ port, dir: event.dir });
          } else if (port !== undefined) {
            window.location.href = `http://localhost:${port}`;
          }
          return;
        } else if (event.type === 'error') {
          sawTerminal = true;
          toast.error(`Clone failed: ${event.message}`, { id: toastId });
          setCloning(false);
          cancelRef.current = null;
          return;
        }
        result = await iter.next();
      }
      if (!sawTerminal) {
        // Stream ended without a terminal 'complete' or 'error' event.
        toast.error('Clone stream ended unexpectedly — check if the clone completed', {
          id: toastId,
        });
        setCloning(false);
        cancelRef.current = null;
      }
    } catch (err) {
      // Log so non-transport exceptions (e.g. an `onCloneComplete` callback
      // throwing) aren't lost behind the generic toast message.
      console.error('[CloneDialog] clone iteration failed:', err);
      toast.error('Clone failed — connection error', { id: toastId });
      setCloning(false);
      cancelRef.current = null;
    }
  }

  function handleCancel() {
    cancelRef.current?.();
    cancelRef.current = null;
    setCloning(false);
    toast.dismiss(toastIdRef.current ?? undefined);
  }

  function handleClose(nextOpen: boolean) {
    if (cloning) return; // prevent close while cloning
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setUrlInput('');
      setLocalPath('');
      setRepoFilter('');
    }
  }

  const filteredRepos = repos?.filter((r) =>
    r.full_name.toLowerCase().includes(repoFilter.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clone from GitHub</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            {/* URL input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="clone-url" className="text-sm font-medium">
                Repository URL or owner/repo
              </label>
              <Input
                id="clone-url"
                placeholder="https://github.com/owner/repo or owner/repo"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={cloning}
              />
            </div>

            {/* Repo browser */}
            {isSignedIn && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="repo-filter" className="text-sm font-medium">
                  Your repositories
                </label>
                <Input
                  id="repo-filter"
                  aria-label="Filter repositories"
                  placeholder="Filter repositories…"
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                  disabled={cloning || (loadingRepos && repos === null)}
                />
                <div
                  className="border rounded-md max-h-40 overflow-y-auto subtle-scrollbar"
                  aria-busy={loadingRepos && repos === null}
                >
                  {loadingRepos && repos === null ? (
                    <output
                      className="flex flex-col gap-1.5 px-3 py-2"
                      aria-label="Loading repositories"
                    >
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-4 w-3/5" />
                    </output>
                  ) : filteredRepos?.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {repos?.length === 0 ? 'No repositories found.' : 'No matches.'}
                    </p>
                  ) : (
                    filteredRepos?.map((repo) => (
                      <button
                        key={repo.full_name}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 truncate disabled:opacity-50"
                        onClick={() => handleRepoSelect(repo)}
                        disabled={cloning}
                      >
                        {repo.private && (
                          <span className="text-xs text-muted-foreground shrink-0">🔒</span>
                        )}
                        {repo.full_name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Sign-in prompt */}
            {!isSignedIn && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Browse your repos:</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => onSignIn?.()}
                  disabled={cloning}
                >
                  Sign in to GitHub
                </Button>
              </div>
            )}

            {/* Local path */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="clone-path" className="text-sm font-medium">
                Local path
              </label>
              <Input
                id="clone-path"
                placeholder="~/Documents/repo-name"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                disabled={cloning}
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          {cloning ? (
            <Button variant="outline" className="font-mono uppercase" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="font-mono uppercase"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleClone()} disabled={!urlInput.trim()}>
                Clone
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
