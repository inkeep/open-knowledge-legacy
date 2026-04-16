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
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface RepoEntry {
  full_name: string;
  clone_url: string;
  private: boolean;
}

type ClonePhase = 'receiving' | 'resolving' | 'checking' | 'init' | 'done' | string;

interface CloneProgressEvent {
  type: 'progress';
  phase: ClonePhase;
  pct: number;
}

interface CloneCompleteEvent {
  type: 'complete';
  port: number;
}

interface CloneErrorEvent {
  type: 'error';
  message: string;
}

type CloneEvent = CloneProgressEvent | CloneCompleteEvent | CloneErrorEvent;

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
}

export function CloneDialog({ open, onOpenChange, onSignIn }: CloneDialogProps) {
  const [urlInput, setUrlInput] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [repos, setRepos] = useState<RepoEntry[] | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  async function fetchRepos() {
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/local-op/auth/repos', { method: 'POST' });
      if (!res.ok) {
        setLoadingRepos(false);
        return;
      }
      const list: RepoEntry[] = [];
      const reader = res.body?.getReader();
      if (!reader) {
        setLoadingRepos(false);
        return;
      }
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
            /* ignore */
          }
        }
        buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
      }
      setRepos(list);
      setLoadingRepos(false);
    } catch {
      setLoadingRepos(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void fetch('/api/local-op/auth/status', { method: 'POST' })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean }) => {
        setIsSignedIn(!!data.authenticated);
      })
      .catch(() => setIsSignedIn(false));
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchRepos is stable (plain function, React Compiler bans useCallback)
  useEffect(() => {
    if (!isSignedIn || !open) return;
    void fetchRepos();
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

    const ac = new AbortController();
    setAbortController(ac);
    setCloning(true);

    const toastId = toast.loading('Starting clone…', { duration: Number.POSITIVE_INFINITY });
    toastIdRef.current = toastId;

    try {
      const res = await fetch('/api/local-op/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim(), dir: localPath || undefined }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        toast.error('Clone failed — check the URL and try again', { id: toastId });
        setCloning(false);
        setAbortController(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as CloneEvent;
            if (event.type === 'progress') {
              toast.loading(`${phaseLabel(event.phase)} — ${event.pct}%`, { id: toastId });
            } else if (event.type === 'complete') {
              toast.success('Clone complete — opening in a new tab', { id: toastId });
              onOpenChange(false);
              setCloning(false);
              setAbortController(null);
              // Open the new server in a new tab so the current editor stays put.
              window.open(`http://localhost:${event.port}`, '_blank', 'noopener,noreferrer');
              return;
            } else if (event.type === 'error') {
              toast.error(`Clone failed: ${event.message}`, { id: toastId });
              setCloning(false);
              setAbortController(null);
              return;
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }

      // Stream ended without a complete event
      toast.dismiss(toastId);
      setCloning(false);
      setAbortController(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.dismiss(toastIdRef.current ?? undefined);
      } else {
        toast.error('Clone failed — connection error', { id: toastId });
      }
      setCloning(false);
      setAbortController(null);
    }
  }

  function handleCancel() {
    abortController?.abort();
    setCloning(false);
    setAbortController(null);
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
          {isSignedIn && (loadingRepos || repos !== null) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Your repositories</span>
              {!loadingRepos && (
                <Input
                  placeholder="Filter repositories…"
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                  disabled={cloning}
                />
              )}
              <div className="border rounded-md max-h-40 overflow-y-auto subtle-scrollbar">
                {loadingRepos ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading repositories…
                  </div>
                ) : filteredRepos?.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No repos found.</p>
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

        <DialogFooter>
          {cloning ? (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleClose(false)}>
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
