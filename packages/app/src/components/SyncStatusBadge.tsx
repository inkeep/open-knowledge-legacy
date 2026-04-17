/**
 * SyncStatusBadge — displays the git sync engine state in the editor header.
 *
 * States: dormant (hidden) | idle/synced | fetching/pulling/pushing (syncing) |
 * conflict | offline | auth-error | disabled | available (sync off, remote present)
 *
 * Click opens a popover with last-sync details and action buttons.
 */
import { AlertTriangle, Cloud, CloudOff, LogIn, RefreshCw, UserCog } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { GitSyncStatus } from '@/hooks/use-git-sync-status';
import { useGitSyncStatusDetailed } from '@/hooks/use-git-sync-status';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

async function triggerSync(op: 'sync' | 'push' | 'pull'): Promise<void> {
  await fetch('/api/sync/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op }),
  });
}

async function setSyncEnabled(enabled: boolean): Promise<void> {
  const res = await fetch('/api/sync/set-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    // Surface as a thrown error so the caller can toast and avoid leaving
    // the UI in a state where the switch flipped but the server didn't.
    throw new Error(`set-enabled failed: HTTP ${res.status}`);
  }
}

// ── inner: icon + color per state ────────────────────────────────────────────

interface BadgeIconProps {
  status: GitSyncStatus;
}

function BadgeIcon({ status }: BadgeIconProps) {
  const cls = 'size-3.5';
  switch (status.state) {
    case 'dormant':
      // Available: remote exists but sync not yet enabled
      return <Cloud className={`${cls} text-muted-foreground`} />;
    case 'idle':
      if (status.ahead > 0 || status.behind > 0) {
        return <RefreshCw className={`${cls} text-muted-foreground`} />;
      }
      return <Cloud className={`${cls} text-emerald-500`} />;
    case 'fetching':
    case 'pulling':
    case 'pushing':
      return <RefreshCw className={`${cls} text-muted-foreground animate-spin`} />;
    case 'conflict':
      return <AlertTriangle className={`${cls} text-amber-500`} />;
    case 'offline':
      return <CloudOff className={`${cls} text-muted-foreground`} />;
    case 'auth-error':
      return <LogIn className={`${cls} text-destructive`} />;
    case 'disabled':
      return <CloudOff className={`${cls} text-muted-foreground`} />;
    default:
      return <Cloud className={`${cls} text-muted-foreground`} />;
  }
}

function badgeLabel(status: GitSyncStatus): string {
  switch (status.state) {
    case 'idle':
      if (status.ahead > 0) return `↑${status.ahead}`;
      if (status.behind > 0) return `↓${status.behind}`;
      return '';
    case 'fetching':
    case 'pulling':
    case 'pushing':
      return '';
    case 'conflict':
      return status.conflictCount > 0 ? `${status.conflictCount}` : '';
    case 'offline':
      return '';
    case 'auth-error':
      return '';
    case 'disabled':
      return '';
    default:
      return '';
  }
}

// ── popover content ───────────────────────────────────────────────────────────

function stateLabel(state: GitSyncStatus['state']): string {
  switch (state) {
    case 'dormant':
      return 'No git remote';
    case 'idle':
      return 'Synced';
    case 'fetching':
      return 'Fetching…';
    case 'pulling':
      return 'Pulling…';
    case 'pushing':
      return 'Pushing…';
    case 'conflict':
      return 'Conflict';
    case 'offline':
      return 'Offline';
    case 'auth-error':
      return 'Sign in required';
    case 'disabled':
      return 'Sync disabled';
    default:
      return state;
  }
}

function formatPausedReason(reason: string): string {
  switch (reason) {
    case 'external-changes-pending':
      return 'External changes pending';
    case 'dirty-tree':
      return 'Working tree has uncommitted changes';
    case 'detached-head':
      return 'Detached HEAD — checkout a branch to resume';
    case 'auth-error':
      return 'Sign in required';
    case 'protected-branch':
      return 'Protected branch — cannot push';
    default:
      return reason;
  }
}

function tooltipLabel(status: GitSyncStatus): string {
  if (!status.syncEnabled) return 'Sync off';
  if (status.state === 'idle') {
    if (status.ahead > 0 && status.behind > 0) {
      return `${status.ahead} ahead, ${status.behind} behind`;
    }
    if (status.ahead > 0) return `${status.ahead} ahead`;
    if (status.behind > 0) return `${status.behind} behind`;
    return 'Synced';
  }
  if (status.state === 'conflict' && status.conflictCount > 0) {
    return `${status.conflictCount} conflict${status.conflictCount === 1 ? '' : 's'}`;
  }
  return stateLabel(status.state);
}

interface PopoverBodyProps {
  status: GitSyncStatus;
  onSignIn?: () => void;
  onOpenConflictResolver?: () => void;
  onSetIdentity?: () => void;
}

function PopoverBody({
  status,
  onSignIn,
  onOpenConflictResolver,
  onSetIdentity,
}: PopoverBodyProps) {
  const [toggling, setToggling] = useState(false);
  const enabled = status.syncEnabled;

  async function handleToggle(next: boolean) {
    setToggling(true);
    try {
      await setSyncEnabled(next);
    } catch (e) {
      // The switch animated but the server rejected the request — tell the
      // user so they can retry instead of thinking sync silently flipped.
      console.error('[sync] toggle failed', e);
      toast.error(`Failed to ${next ? 'enable' : 'disable'} sync — try again`);
    }
    setToggling(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BadgeIcon status={status} />
          <span className="text-sm font-medium truncate">{stateLabel(status.state)}</span>
        </div>
        <Switch
          checked={enabled}
          disabled={toggling}
          onCheckedChange={(next) => void handleToggle(next)}
          aria-label={enabled ? 'Disable sync' : 'Enable sync'}
        />
      </div>

      {status.error && <p className="text-xs text-destructive">{status.error}</p>}
      {status.pausedReason && (
        <p className="text-xs text-muted-foreground">{formatPausedReason(status.pausedReason)}</p>
      )}

      {status.state === 'conflict' && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Sync paused — resolve conflicts to resume.
        </p>
      )}

      <div className="text-xs text-muted-foreground space-y-0.5">
        {enabled && status.state !== 'dormant' && (
          <div>Last synced: {formatRelative(status.lastSyncUtc)}</div>
        )}
        {status.ahead > 0 && (
          <div>
            {status.ahead} commit{status.ahead !== 1 ? 's' : ''} ahead
          </div>
        )}
        {status.behind > 0 && (
          <div>
            {status.behind} commit{status.behind !== 1 ? 's' : ''} behind
          </div>
        )}
        {status.conflictCount > 0 && (
          <div>
            {status.conflictCount} file{status.conflictCount !== 1 ? 's' : ''} conflicted
          </div>
        )}
        {!enabled && <div>Sync is off — your edits will not sync to the remote repository.</div>}
      </div>

      {status.identityUnresolved && onSetIdentity && (
        <div className="flex items-start gap-2 rounded-md border border-dashed p-2">
          <UserCog className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="text-xs text-muted-foreground leading-snug">
              Git identity isn't set — commits use a default author. Set yours so teammates see your
              name.
            </p>
            <Button variant="outline" size="xs" className="self-start" onClick={onSetIdentity}>
              Set identity
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1 pt-1">
        {enabled &&
          status.state !== 'dormant' &&
          status.state !== 'disabled' &&
          status.state !== 'auth-error' &&
          status.state !== 'conflict' && (
            <Button variant="outline" size="xs" onClick={() => void triggerSync('sync')}>
              Sync now
            </Button>
          )}
        {enabled && status.state === 'auth-error' && (
          <Button variant="outline" size="xs" onClick={onSignIn}>
            Sign in
          </Button>
        )}
        {enabled && status.state === 'offline' && (
          <Button variant="outline" size="xs" onClick={() => void triggerSync('sync')}>
            Retry
          </Button>
        )}
        {enabled && status.state === 'conflict' && onOpenConflictResolver && (
          <Button variant="outline" size="xs" onClick={onOpenConflictResolver}>
            Review conflicts
          </Button>
        )}
      </div>
    </div>
  );
}

// ── public component ──────────────────────────────────────────────────────────

export interface SyncStatusBadgeProps {
  /** Called when "Sign in" is clicked in the auth-error popover or enable-sync prompt. */
  onSignIn?: () => void;
  /** Called when "Review conflicts" is clicked in the conflict popover. */
  onOpenConflictResolver?: () => void;
  /** Called when "Set identity" is clicked in the identity-unresolved nudge. */
  onSetIdentity?: () => void;
}

export function SyncStatusBadge({
  onSignIn,
  onOpenConflictResolver,
  onSetIdentity,
}: SyncStatusBadgeProps = {}) {
  const { status, fetchError } = useGitSyncStatusDetailed();

  // Surface a lightweight connectivity warning when the server has been
  // reachable before (we have a prior status) but the last refresh failed.
  // Before first successful fetch we stay hidden so the badge doesn't flash
  // on every reload.
  if (!status) {
    if (fetchError) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Sync status unavailable"
              disabled
            >
              <CloudOff className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {fetchError === 'network'
              ? 'Sync status unavailable — server unreachable.'
              : 'Sync status unavailable — server error.'}
          </TooltipContent>
        </Tooltip>
      );
    }
    return null;
  }

  // Hide when dormant with no remote (truly no git remote)
  if (status.state === 'dormant' && !status.hasRemote) return null;

  const label = badgeLabel(status);
  const showIdentityDot = Boolean(status.identityUnresolved);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground relative"
              aria-label={`Sync status: ${stateLabel(status.state)}${showIdentityDot ? ' — git identity unset' : ''}`}
            >
              <BadgeIcon status={status} />
              {label && (
                <span className="absolute -top-0.5 -right-0.5 text-[9px] leading-none font-medium bg-background border rounded-full px-0.5">
                  {label}
                </span>
              )}
              {!label && showIdentityDot && (
                <span
                  className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-500 ring-2 ring-background"
                  aria-hidden
                />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel(status)}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 p-3">
        <PopoverBody
          status={status}
          onSignIn={onSignIn}
          onOpenConflictResolver={onOpenConflictResolver}
          onSetIdentity={onSetIdentity}
        />
      </PopoverContent>
    </Popover>
  );
}
