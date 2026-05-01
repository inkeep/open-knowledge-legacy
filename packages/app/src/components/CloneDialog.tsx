/**
 * CloneDialog — dialog for cloning a GitHub repo into a new Open Knowledge project.
 *
 * Supports:
 *   - Paste URL or owner/repo shorthand
 *   - Authenticated repo browse when signed in (GET /api/local-op/auth/repos)
 *   - Local path auto-filled to ~/Documents/<repo-name>
 *   - Clone via POST /api/local-op/clone (NDJSON streaming progress)
 *   - Sign-in integration: onSignIn prop opens AuthModal (US-027)
 *   - On complete: redirect to the new server port
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
   * `port` is present only on the HTTP transport (the IPC path skips the
   * relay's port chain).
   */
  onCloneComplete?: (info: { port?: number; dir: string }) => void;
  /**
   * Transport for the clone subprocess. Defaults to the HTTP path (POST
   * /api/local-op/clone) so existing editor / web callers don't change.
   * The Project Navigator passes an IPC transport because its window has
   * no backing API server.
   */
  transport?: CloneTransport;
}

export function CloneDialog({
  open,
  onOpenChange,
  onSignIn,
  onCloneComplete,
  transport,
}: CloneDialogProps) {
  const resolvedTransport = transport ?? httpCloneTransport();
  const [urlInput, setUrlInput] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [cloning, setCloning] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  // Check auth status when dialog opens. The server resolves host (defaults
  // to github.com today; will read from config/last-used when enterprise lands).
  useEffect(() => {
    if (!open) return;
    void fetch('/api/local-op/auth/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean }) => {
        setIsSignedIn(!!data.authenticated);
      })
      .catch(() => setIsSignedIn(false));
  }, [open]);

  async function fetchRepos(signal: AbortSignal) {
    setLoadingRepos(true);
    // No try/finally — React Compiler doesn't yet lower TryStatement finalizers.
    // All exit paths set repos + clear loading explicitly before returning.
    let list: RepoEntry[] = [];
    let aborted = false;
    try {
      const res = await fetch('/api/local-op/auth/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal,
      });
      const reader = res.ok ? res.body?.getReader() : null;
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (const line of buffer.split('\n')) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as { type?: string; repos?: RepoEntry[] };
              if (event.repos) list.push(...event.repos);
            } catch {
              /* ignore malformed NDJSON line */
            }
          }
          buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        aborted = true;
      } else {
        list = [];
      }
    }
    // Skip state writes on abort — the effect already tore down and React
    // would warn about a state update on an unmounted dialog.
    if (aborted || signal.aborted) return;
    setRepos(list);
    setLoadingRepos(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchRepos is stable
  useEffect(() => {
    if (!isSignedIn || !open) return;
    const ac = new AbortController();
    void fetchRepos(ac.signal);
    return () => ac.abort();
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
    } catch {
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
