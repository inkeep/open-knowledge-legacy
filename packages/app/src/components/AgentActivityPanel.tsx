/**
 * AgentActivityPanel — the right-side Sheet shell for the Activity Panel
 * (SPEC FR-P1 to FR-P5, FR-P22 to FR-P24).
 *
 * Reads `activityPanelAgentId` from `useDocumentContext()` and binds the
 * panel's open state to it. When null, Sheet is closed. When set, the hook
 * fetches `/api/agent-activity` for that agent and the body renders one
 * <ActivityPanelFileRow> per file.
 *
 * Non-modal by design (modal={false}) — the editor stays interactive behind
 * the panel. `onInteractOutside` is suppressed so clicks on the editor do
 * NOT close the panel (FR-P4). Close affordances: `×` button in header,
 * Esc key, swapping to a different avatar.
 *
 * Filename click in a row fires `openDocumentTransition(docName)` + sets
 * `window.location.hash`; matches the navigateToDoc helper in PresenceBar.
 *
 * Undo dispatch: POST /api/agent-undo with { connectionId, docName, scope }.
 * On success, `reload()` fires to refresh the file list.
 */
import { AlertCircle, Loader2, X } from 'lucide-react';
import { useDocumentContext, useDocumentTransition } from '@/editor/DocumentContext';
import { useActivityPanel } from '@/lib/use-activity-panel';
import { ActivityPanelFileRow } from './ActivityPanelFileRow';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';

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

function SessionEndedBanner({ lastTs }: { lastTs: number | null }): React.JSX.Element {
  const ago = lastTs ? formatAgo(Date.now() - lastTs) : null;
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
  const initials = agent.displayName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-background"
      style={{ backgroundColor: agent.color, width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------

/**
 * AgentActivityPanelBody — the panel's inner content, factored out so it can
 * be unit-tested independently of the Sheet/portal machinery. Radix Sheet
 * renders its content through a React Portal; that breaks renderToString-
 * based assertions (portals emit nothing in SSR). This body component has
 * no portal, so all state branches are inspectable via renderToString.
 */
export interface AgentActivityPanelBodyProps {
  data: ReturnType<typeof useActivityPanel>['data'];
  status: ReturnType<typeof useActivityPanel>['status'];
  error: ReturnType<typeof useActivityPanel>['error'];
  reload: () => void;
  fetchBurstDiff: (docName: string, stackIndex: number) => Promise<string>;
  closeActivityPanel: () => void;
  connectionId: string | null;
  onNavigate: (docName: string) => void;
  onUndoLast: (docName: string) => Promise<void>;
  onUndoAll: (docName: string) => Promise<void>;
}

export function AgentActivityPanelBody({
  data,
  status,
  error,
  reload,
  fetchBurstDiff,
  closeActivityPanel,
  onNavigate,
  onUndoLast,
  onUndoAll,
}: AgentActivityPanelBodyProps): React.JSX.Element {
  const lastTs = data?.files?.[0]?.lastTs ?? null;
  // NOTE: We use plain <h2> / <div> here rather than <SheetHeader>/<SheetTitle>.
  // The Radix Sheet primitives (internally Dialog.Title/.Description) throw
  // when rendered outside a <Sheet> ancestor — which is intentional for a11y
  // but prevents unit-testing the body in isolation via renderToString. Since
  // the heading is already wrapped in the semantically-equivalent <Sheet>
  // role="dialog" by the outer AgentActivityPanel, a plain heading here is
  // safe + testable. Radix's screen-reader announcement contract is satisfied
  // by the Sheet wrapper, not by the inner heading element.
  return (
    <>
      <div className="flex flex-row items-center gap-3 border-b border-border px-4 py-3 shrink-0">
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={closeActivityPanel}
          aria-label="Close activity panel"
          data-testid="activity-panel-close"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
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
    </>
  );
}

export function AgentActivityPanel(): React.JSX.Element | null {
  const { activityPanelAgentId, closeActivityPanel } = useDocumentContext();
  const { openDocumentTransition } = useDocumentTransition();
  const { data, status, error, reload, fetchBurstDiff } = useActivityPanel(activityPanelAgentId);

  // FR-P3: open state is the presence of `activityPanelAgentId`. The Sheet's
  // `onOpenChange(false)` fires on Esc + the header X; we reuse
  // closeActivityPanel for both.
  const open = activityPanelAgentId !== null;

  const onNavigate = (docName: string): void => {
    openDocumentTransition(docName);
    navigateToDoc(docName);
  };

  const onUndoLast = async (docName: string): Promise<void> => {
    if (!activityPanelAgentId) return;
    try {
      await postAgentUndo({
        connectionId: activityPanelAgentId,
        docName,
        scope: 'last',
        agentName: data?.agent?.displayName,
      });
      reload();
    } catch (err) {
      // Non-fatal — re-fetch anyway to recover ground truth.
      console.warn('[activity-panel] undo-last failed', err);
      reload();
    }
  };

  const onUndoAll = async (docName: string): Promise<void> => {
    if (!activityPanelAgentId) return;
    try {
      await postAgentUndo({
        connectionId: activityPanelAgentId,
        docName,
        scope: 'file',
        agentName: data?.agent?.displayName,
      });
      reload();
    } catch (err) {
      console.warn('[activity-panel] undo-all failed', err);
      reload();
    }
  };

  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeActivityPanel();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        // FR-P4: click-outside does NOT close. The Sheet primitive defers to
        // radix's onInteractOutside which fires on any off-panel pointerdown;
        // we preventDefault unconditionally so clicks on the editor stay
        // non-destructive. `onEscapeKeyDown` does NOT need suppression — Esc
        // is an explicit close affordance per FR-P4.
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="w-[480px] max-w-[480px] sm:max-w-[480px] p-0 flex flex-col"
        data-testid="activity-panel"
      >
        {/*
          Radix Dialog/Sheet requires a DialogTitle as direct descendant for
          a11y (screen-reader announcement). We render a visually-hidden one
          here so the user-visible heading can stay inside
          AgentActivityPanelBody as a plain <h2>, which in turn lets the body
          be unit-tested in isolation via renderToString.
        */}
        <SheetTitle className="sr-only">{data?.agent?.displayName ?? 'Agent activity'}</SheetTitle>
        <AgentActivityPanelBody
          data={data}
          status={status}
          error={error}
          reload={reload}
          fetchBurstDiff={fetchBurstDiff}
          closeActivityPanel={closeActivityPanel}
          connectionId={activityPanelAgentId}
          onNavigate={onNavigate}
          onUndoLast={onUndoLast}
          onUndoAll={onUndoAll}
        />
      </SheetContent>
    </Sheet>
  );
}
