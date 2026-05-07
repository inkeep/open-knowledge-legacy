import { FolderOpenIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { type ComponentType, useEffect, useState } from 'react';
import { useUpdateChannel } from '@/hooks/use-update-channel';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import {
  resolveErrorMessage,
  runWithErrorStatePure as runWithErrorStatePureBase,
} from '@/lib/error-state';
import { ipcAuthQueryTransport } from '@/lib/transports/auth-query-transport';
import { ipcAuthTransport } from '@/lib/transports/auth-transport';
import { ipcCloneTransport } from '@/lib/transports/clone-transport';
import { AuthModal } from './AuthModal';
import { BetaBadge } from './BetaBadge';
import { CloneDialog } from './CloneDialog';
import { GithubIcon } from './icons/github';
import { OkIcon } from './icons/ok';
import { McpConsentDialog } from './McpConsentDialog';
import { Badge } from './ui/badge';

export { resolveErrorMessage };
export const runWithErrorStatePure = (
  fn: () => Promise<void>,
  fallback: string,
  setError: (msg: string | null) => void,
) => runWithErrorStatePureBase(fn, fallback, setError, 'NavigatorApp');

type RecentProject = RecentProjectEntry;

export function NavigatorApp({ bridge }: { bridge: OkDesktopBridge }) {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [returnToCloneAfterAuth, setReturnToCloneAfterAuth] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const { channel } = useUpdateChannel();

  useEffect(() => {
    let cancelled = false;
    bridge.project
      .listRecent()
      .then((result) => {
        if (!cancelled) setRecents(result);
      })
      .catch((err) => {
        console.error('[NavigatorApp] listRecent failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load recent projects.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const runWithErrorState = (fn: () => Promise<void>, fallback: string) =>
    runWithErrorStatePure(fn, fallback, setError);

  const onClone = () => setCloneDialogOpen(true);

  const onOpenFolder = () =>
    runWithErrorState(async () => {
      const path = await bridge.dialog.openFolder();
      if (!path) return;
      await openProject(bridge, path);
    }, 'Failed to open folder.');

  const onStartFresh = () =>
    runWithErrorState(async () => {
      const path = await bridge.dialog.createFolder();
      if (!path) return;
      await openProject(bridge, path);
    }, 'Failed to create project folder.');

  const onOpenRecent = (path: string) =>
    runWithErrorState(async () => {
      await openProject(bridge, path);
    }, 'Failed to open project.');

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-primary-foreground dark:bg-background p-12 text-foreground max-w-5xl space-y-10 mx-auto ${
        !loading && recents.length === 0 ? 'justify-center' : ''
      }`}
    >
      <header className="shrink-0 flex-wrap flex items-center gap-2.5">
        <OkIcon className="size-12 shrink-0" />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="font-medium text-xl tracking-tight">Open Knowledge</h1>
            <BetaBadge />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-xs font-mono">v{bridge.appVersion}</p>
            {channel !== null && (
              <Badge variant="gray" className="text-2xs font-mono">
                {channel === 'beta' ? 'Beta' : 'Stable'}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <section className="grid shrink-0 sm:grid-cols-3 gap-3">
        <NavigatorCard
          title="Clone from GitHub"
          description="Bring a remote repository onto this machine."
          onClick={onClone}
          dataTestId="nav-clone"
          Icon={GithubIcon}
        />
        <NavigatorCard
          title="Open folder on disk"
          description="Open an existing folder as a project."
          onClick={onOpenFolder}
          dataTestId="nav-open"
          Icon={FolderOpenIcon}
        />
        <NavigatorCard
          title="Start fresh"
          description="Create a new folder for a brand-new project."
          onClick={onStartFresh}
          dataTestId="nav-fresh"
          Icon={PlusIcon}
        />
      </section>

      {error !== null ? (
        <div
          className="mb-3 flex shrink-0 items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2"
          data-testid="nav-error-banner"
          role="alert"
        >
          <span className="text-red-700 text-xs dark:text-red-300">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-700 text-xs underline hover:no-underline dark:text-red-300"
            data-testid="nav-error-dismiss"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-center h-full">
            <Loader2Icon className="size-4 animate-spin text-muted-foreground/60" />
          </div>
        </section>
      ) : recents.length > 0 ? (
        <section className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 shrink-0 font-medium text-muted-foreground font-mono text-xs uppercase tracking-wide">
            Recent
          </h2>
          <ul
            className="min-h-0 flex-1 subtle-scrollbar overflow-y-auto scroll-fade-mask space-y-0.5 -mx-4"
            data-testid="nav-recent-list"
          >
            {recents.map((r) => (
              <RecentRow key={r.path} project={r} onOpen={() => onOpenRecent(r.path)} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* M6b first-launch consent dialog — self-gates on the shared
          `mcpConsentStore` snapshot, renders nothing until main fires
          `ok:mcp-wiring:show`. Mounted identically in App.tsx (D-M6-R10). */}
      <McpConsentDialog />

      <AuthModal
        open={authModalOpen}
        onOpenChange={(next) => {
          setAuthModalOpen(next);
          if (!next) setReturnToCloneAfterAuth(false);
        }}
        transport={ipcAuthTransport(bridge)}
        identityPrompt={authInitialStep === 'identity'}
        onSuccess={() => {
          setAuthModalOpen(false);
          if (returnToCloneAfterAuth) {
            setReturnToCloneAfterAuth(false);
            setCloneDialogOpen(true);
          }
        }}
      />
      <CloneDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        transport={ipcCloneTransport(bridge)}
        authQueryTransport={ipcAuthQueryTransport(bridge)}
        pickParentFolder={() => bridge.dialog.openFolder()}
        onSignIn={() => {
          setCloneDialogOpen(false);
          setAuthInitialStep('auth');
          setReturnToCloneAfterAuth(true);
          setAuthModalOpen(true);
        }}
        onCloneComplete={({ dir }) => {
          void runWithErrorState(() => openProject(bridge, dir), 'Failed to open cloned project.');
        }}
      />
    </div>
  );
}

interface NavigatorCardProps {
  title: string;
  description: string;
  onClick: () => void;
  dataTestId?: string;
  Icon?: ComponentType<{ className?: string }>;
}

function NavigatorCard({ title, description, onClick, dataTestId, Icon }: NavigatorCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={dataTestId}
      className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card py-3.5 px-4 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="font-medium text-gray-700 dark:text-foreground text-sm">{title}</span>
      </div>
      <span className="text-muted-foreground text-xs leading-snug">{description}</span>
    </button>
  );
}

function RecentRow({ project, onOpen }: { project: RecentProject; onOpen: () => void }) {
  return (
    <li className={`flex items-center justify-between ${project.missing ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        disabled={project.missing}
        className="flex min-w-0 flex-1 items-center text-left disabled:cursor-not-allowed py-3.5 px-4 hover:bg-accent rounded-lg gap-2 justify-between"
      >
        <div className="flex flex-col gap-1 truncate">
          <span className="font-medium text-sm text-gray-700 dark:text-foreground">
            {project.name}
          </span>
          <span className="truncate w-full text-muted-foreground text-xs">{project.path}</span>
        </div>
        {project.missing ? (
          <Badge className="text-2xs rounded-sm" variant="warning">
            Missing
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

async function openProject(bridge: OkDesktopBridge, path: string): Promise<void> {
  await bridge.project.open({ path, target: 'new-window' });
}
