/**
 * ActivityModeContent — the DocPanel's `'agent'` mode content.
 *
 * Replaces the standalone `AgentActivityPanel` Sheet (SPEC 2026-04-23).
 * SPEC 2026-04-24-activity-panel-to-docpanel-mode-toggle embeds the panel
 * inside `DocPanel`, so this component no longer provides its own
 * container chrome — it's rendered directly as the body of the `'agent'`
 * mode branch. No Sheet, no width hook, no resize handle.
 *
 * Responsibilities:
 *   - Fetches per-agent activity via `useActivityPanel(connectionId)`.
 *   - Dispatches `POST /api/agent-undo` (`'last'` / `'file'` scope) with
 *     user-visible success / error toasts.
 *   - Filename-click navigates the main editor without flipping mode
 *     (preserved from SPEC-23 FR-P24 intent — doc-nav does not reset
 *     the scoped agent).
 *   - Renders every state branch: loading / error / no-agent-selected /
 *     empty / session-ended / populated.
 *
 * Test contract: the inner `ActivityModeBody` is factored out so it can
 * be unit-tested via `renderToString` without any portal / context /
 * fetch dependencies. The outer wrapper owns the hook + callbacks.
 */
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { useActivityPanel } from '@/lib/use-activity-panel';
import { ActivityPanelFileRow } from './ActivityPanelFileRow';
import { AgentIcon } from './icons/AgentIcon';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// ---------------------------------------------------------------
// HTTP: undo dispatch
// ---------------------------------------------------------------

async function postAgentUndo(body: {
  connectionId: string;
  docName: string;
  scope: 'last' | 'file';
  agentName?: string;
}): Promise<void> {
  const res = await fetch('/api/agent-undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      // The attribution-sweep contract requires every mutating POST to carry
      // an agentId — the server derives `writerId = "agent-${agentId}"`.
      agentId: body.connectionId,
    }),
  });
  if (!res.ok) {
    throw new Error(`agent-undo failed: HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------
// `window.location.hash` helper — mirrors PresenceBar's navigateToDoc.
// ---------------------------------------------------------------

function hashFromDocName(docName: string): string {
  return `#/${docName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function navigateToDoc(docName: string): void {
  if (typeof window === 'undefined') return;
  window.location.hash = hashFromDocName(docName);
}

// ---------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------

function LoadingState(): React.JSX.Element {
  return (
    <div
      className="flex h-full items-center justify-center p-6 text-muted-foreground"
      role="status"
      aria-busy="true"
    >
      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
      <span className="text-sm">Loading agent activity…</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div
      className="flex flex-col items-center gap-3 p-6 text-center"
      role="alert"
      data-testid="activity-panel-error"
    >
      <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Failed to load activity</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <div
      className="flex h-full items-center justify-center p-6 text-muted-foreground"
      data-testid="activity-panel-empty"
    >
      <p className="text-sm italic">No edits yet.</p>
    </div>
  );
}

/** SPEC-24 FR-T15: visible hint when mode is `'agent'` but no agent is scoped. */
function NoAgentSelectedState({ onExit }: { onExit: () => void }): React.JSX.Element {
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      data-testid="activity-panel-no-agent"
      aria-label="Agent activity"
    >
      <div className="flex shrink-0 flex-row items-center gap-2 border-b border-border px-3 py-2">
        <BackToDocumentButton onClick={onExit} />
        <h2 className="truncate text-sm font-medium">Agent activity</h2>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground">
        <p className="text-center text-sm italic">
          Click an agent's avatar in the presence bar to view their session.
        </p>
      </div>
    </section>
  );
}

function BackToDocumentButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClick}
          aria-label="Back to document view"
          data-testid="docpanel-exit-agent-mode"
        >
          <ArrowLeft />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Back to document view</TooltipContent>
    </Tooltip>
  );
}

function SessionEndedBanner({ lastTs }: { lastTs: number | null }): React.JSX.Element {
  // `Date.now()` is impure — calling it in render violates React Compiler's
  // purity contract. Hoist behind a lazy-init useState so it's captured
  // exactly once at mount. The displayed value only needs "when session
  // ended" minute precision, so we skip the setInterval tick used by
  // ActivityPanelFileRow (the session isn't going to un-end; a paint-once
  // "2m ago" that drifts slightly while the user lingers is acceptable).
  const [mountedAt] = useState<number>(() => Date.now());
  const ago = lastTs ? formatAgo(mountedAt - lastTs) : null;
  return (
    <div
      className="border-b border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground"
      data-testid="activity-panel-session-ended"
    >
      <span className="font-medium">Session ended</span>
      {ago ? <span> · {ago}</span> : null}
      <div className="mt-1 opacity-80">
        Undo buttons are disabled — per-session state has been garbage-collected.
      </div>
    </div>
  );
}

function formatAgo(diffMs: number): string {
  const ms = Math.max(0, diffMs);
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function AgentAvatar({
  agent,
  size = 28,
}: {
  agent: { displayName: string; color: string; icon?: string };
  size?: number;
}): React.JSX.Element {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-background"
      style={{ backgroundColor: agent.color, width: size, height: size }}
      aria-hidden="true"
    >
      <AgentIcon icon={agent.icon} width={size * 0.57} height={size * 0.57} />
    </span>
  );
}

// ---------------------------------------------------------------
// Body — pure presentational (testable via renderToString)
// ---------------------------------------------------------------

interface ActivityModeBodyProps {
  data: ReturnType<typeof useActivityPanel>['data'];
  status: ReturnType<typeof useActivityPanel>['status'];
  error: ReturnType<typeof useActivityPanel>['error'];
  reload: () => void;
  fetchBurstDiff: (docName: string, stackIndex: number) => Promise<string>;
  onExit: () => void;
  onNavigate: (docName: string) => void;
  onUndoLast: (docName: string) => Promise<void>;
  onUndoAll: (docName: string) => Promise<void>;
}

function ActivityModeBody({
  data,
  status,
  error,
  reload,
  fetchBurstDiff,
  onExit,
  onNavigate,
  onUndoLast,
  onUndoAll,
}: ActivityModeBodyProps): React.JSX.Element {
  const lastTs = data?.files?.[0]?.lastTs ?? null;
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      data-testid="activity-panel"
      aria-label="Agent activity"
    >
      <div className="flex flex-row items-center gap-2 border-b border-border px-3 py-2 shrink-0">
        <BackToDocumentButton onClick={onExit} />
        {data?.agent ? (
          <>
            <AgentAvatar agent={data.agent} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-medium">{data.agent.displayName}</h2>
              <p className="truncate text-xs text-muted-foreground">
                {data.sessionAlive ? 'Active' : 'Ended'}
                {data.files.length > 0
                  ? ` · ${data.files.length} file${data.files.length === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">Agent activity</h2>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto" data-testid="activity-panel-body">
        {status === 'loading' && data === null ? (
          <LoadingState />
        ) : status === 'error' && error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data === null ? (
          <EmptyState />
        ) : (
          <>
            {!data.sessionAlive ? <SessionEndedBanner lastTs={lastTs} /> : null}
            {data.files.length === 0 ? (
              <EmptyState />
            ) : (
              data.files.map((file) => (
                <ActivityPanelFileRow
                  key={file.docName}
                  file={file}
                  sessionAlive={data.sessionAlive}
                  isWriting={data.writingDocs.has(file.docName)}
                  onNavigate={onNavigate}
                  onUndoLast={onUndoLast}
                  onUndoAll={onUndoAll}
                  fetchBurstDiff={fetchBurstDiff}
                />
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Outer component — owns hook + callbacks
// ---------------------------------------------------------------

export function ActivityModeContent(): React.JSX.Element {
  const { docPanelAgentId, closeActivityPanel } = useDocumentContext();
  const { openDocumentTransition } = useDocumentTransition();
  const { data, status, error, reload, fetchBurstDiff } = useActivityPanel(docPanelAgentId);

  // FR-T15: when mode is `'agent'` but no agent is scoped (edge case: user
  // flipped mode without ever clicking an avatar), render a discoverable
  // hint rather than silently showing an empty panel. Back-arrow still
  // reachable so the user is never wedged in this state.
  if (docPanelAgentId === null) {
    return <NoAgentSelectedState onExit={closeActivityPanel} />;
  }

  const onNavigate = (docName: string): void => {
    openDocumentTransition(docName);
    navigateToDoc(docName);
  };

  const onUndoLast = async (docName: string): Promise<void> => {
    try {
      await postAgentUndo({
        connectionId: docPanelAgentId,
        docName,
        scope: 'last',
        agentName: data?.agent?.displayName,
      });
      reload();
    } catch (err) {
      // Surface the failure — `Undo all` has a confirmation dialog, but
      // `Undo last` is inline. Either silently failing is user-hostile.
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Undo failed: ${message}`);
      // Non-fatal — re-fetch to recover ground truth.
      reload();
    }
  };

  const onUndoAll = async (docName: string): Promise<void> => {
    try {
      await postAgentUndo({
        connectionId: docPanelAgentId,
        docName,
        scope: 'file',
        agentName: data?.agent?.displayName,
      });
      // `Undo all` has a confirmation dialog (SPEC-23 D-P16) — the
      // blast-radius asymmetry applies to feedback too.
      toast.success(`Undone all edits on ${docName}`);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Undo all failed: ${message}`);
      reload();
    }
  };

  return (
    <ActivityModeBody
      data={data}
      status={status}
      error={error}
      reload={reload}
      fetchBurstDiff={fetchBurstDiff}
      onExit={closeActivityPanel}
      onNavigate={onNavigate}
      onUndoLast={onUndoLast}
      onUndoAll={onUndoAll}
    />
  );
}
