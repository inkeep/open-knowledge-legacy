/**
 * DocumentErrorBoundary — error surface for the hybrid Activity + Suspense
 * render tree. Wraps `react-error-boundary` and renders a recoverable fallback
 * when a `DocumentBoundary` (or anything beneath) throws during render — most
 * notably when a `syncPromise` rejects via `use()`.
 *
 * SCOPING: one instance per `<Activity>` inside `EditorActivityPool` — NOT
 * a single top-level boundary for the whole pool. A hidden Activity's cached
 * rejected syncPromise re-throws synchronously on every render; placing the
 * boundary outside Activity lets those throws bubble into the visible UI.
 * Scoping per-Activity confines the error render output to the Activity
 * subtree, where `<Activity mode="hidden">` applies `display:none` — hidden
 * errors stay invisible until their Activity becomes visible again.
 *
 * UX:
 *   - Document name + one-line error summary (per error kind).
 *   - Primary "Try again": recycles the pool entry (fresh provider) so the
 *     next render re-enters Suspense with a fresh `syncPromise`.
 *   - Secondary "Back to previous document": invalidates this doc's cached
 *     `syncPromise` and calls `onNavigateBack` with the previously-active
 *     docName. Only rendered when `previousDocName` is present.
 *
 * `resetKeys={[activeDocName]}`: `activeDocName` is the Activity's OWN doc
 * (stable for the lifetime of the Activity), not the globally-active doc —
 * so key changes don't fire spuriously on navigation. Errors clear only
 * through (a) imperative "Try again" (recycle), (b) "Back to previous"
 * (invalidate + nav), or (c) Activity eviction from the MRU mount list.
 *
 * Retry ordering (per acceptance criterion): recycle MUST run before the
 * boundary state clears, otherwise the re-render would pick up the old
 * cached rejected promise (or a broken provider with `synced=true`). We
 * hook that through `onReset` because react-error-boundary fires
 * `onReset(...)` synchronously before calling `setState`
 * (node_modules/react-error-boundary/dist/react-error-boundary.cjs).
 */

import { useEffect, useRef } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { OkBlob } from '@/components/OkBlob';
import { Button } from '@/components/ui/button';
import { MountAbortError } from '@/editor/mount-promise';
import {
  BridgeSetupError,
  DocumentNotFoundError,
  invalidateSyncPromise,
  PreSyncDisconnectError,
  ServerCapabilityMismatchError,
  SyncTimeoutError,
} from '@/editor/sync-promise';

interface ErrorCopy {
  title: string;
  summary: string;
}

const BACK_NAV_RESET_SENTINEL = '__back-nav__' as const;

export function errorDocName(error: unknown): string | null {
  if (
    error instanceof SyncTimeoutError ||
    error instanceof PreSyncDisconnectError ||
    error instanceof DocumentNotFoundError ||
    error instanceof BridgeSetupError ||
    error instanceof ServerCapabilityMismatchError ||
    error instanceof MountAbortError
  ) {
    return error.docName;
  }
  return null;
}

export function errorCopy(error: unknown): ErrorCopy {
  if (error instanceof SyncTimeoutError) {
    return {
      title: "Couldn't load document",
      summary: `"${error.docName}" took too long. Check your connection.`,
    };
  }
  if (error instanceof PreSyncDisconnectError) {
    return {
      title: 'Connection dropped',
      summary: `Lost connection to "${error.docName}".`,
    };
  }
  if (error instanceof DocumentNotFoundError) {
    return {
      title: 'Document not found',
      summary: `"${error.docName}" doesn't exist.`,
    };
  }
  if (error instanceof BridgeSetupError) {
    return {
      title: "Couldn't open document",
      summary: `Something went wrong opening "${error.docName}".`,
    };
  }
  if (error instanceof ServerCapabilityMismatchError) {
    return {
      title: "Server can't open documents",
      summary: `This project's running server doesn't support live editing. Restart Open Knowledge to fix.`,
    };
  }
  if (error instanceof MountAbortError) {
    return {
      title: 'Cancelled',
      summary: `You cancelled loading "${error.docName}".`,
    };
  }
  const message =
    error instanceof Error && error.message ? error.message : 'An unexpected error occurred.';
  return {
    title: 'Unknown error',
    summary: message,
  };
}

interface DocumentErrorFallbackProps extends FallbackProps {
  activeDocName: string;
  previousDocName?: string;
  onNavigateBack?: (previousDocName: string) => void;
}

function DocumentErrorFallback({
  error,
  resetErrorBoundary,
  activeDocName,
  previousDocName,
  onNavigateBack,
}: DocumentErrorFallbackProps) {
  const { title, summary } = errorCopy(error);
  const canGoBack = !!previousDocName && !!onNavigateBack;
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <div
      role="alert"
      aria-labelledby="document-error-title"
      data-slot="document-error-boundary"
      className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center"
    >
      <OkBlob size={80} variant="sleeping" />
      <div className="flex flex-col items-center gap-1">
        <h2 id="document-error-title" className="text-2xl font-light tracking-tighter text-balance">
          {title}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">{summary}</p>
      </div>
      <div className="mt-1 flex gap-2">
        <Button ref={retryRef} variant="default" onClick={resetErrorBoundary}>
          Try again
        </Button>
        {canGoBack ? (
          <Button
            variant="ghost"
            className="font-mono uppercase"
            onClick={() => {
              if (!previousDocName || !onNavigateBack) return;
              const erroredDoc = errorDocName(error) ?? activeDocName;
              invalidateSyncPromise(erroredDoc);
              onNavigateBack(previousDocName);
              resetErrorBoundary(BACK_NAV_RESET_SENTINEL);
            }}
          >
            Go back
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface DocumentErrorBoundaryProps {
  activeDocName: string;
  previousDocName?: string;
  onNavigateBack?: (previousDocName: string) => void;
  onRecycle: (docName: string) => void;
  children: React.ReactNode;
}

export function DocumentErrorBoundary({
  activeDocName,
  previousDocName,
  onNavigateBack,
  onRecycle,
  children,
}: DocumentErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallbackRender={(props) => (
        <DocumentErrorFallback
          {...props}
          activeDocName={activeDocName}
          previousDocName={previousDocName}
          onNavigateBack={onNavigateBack}
        />
      )}
      resetKeys={[activeDocName]}
      onReset={(details) => {
        if (details.reason === 'imperative-api') {
          const isBackNav =
            Array.isArray(details.args) && details.args[0] === BACK_NAV_RESET_SENTINEL;
          if (isBackNav) {
            console.warn(`[DocumentErrorBoundary] back-nav reset (no recycle)`);
            return;
          }
          onRecycle(activeDocName);
          console.warn(`[DocumentErrorBoundary] retry recycled ${activeDocName}`);
        } else {
          console.warn(
            `[DocumentErrorBoundary] reset by key change (${details.prev?.[0]} → ${details.next?.[0]})`,
          );
        }
      }}
      onError={(error) => {
        console.error(
          `[DocumentErrorBoundary] rendered fallback for ${activeDocName}: ${errorCopy(error).title}`,
          error,
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
