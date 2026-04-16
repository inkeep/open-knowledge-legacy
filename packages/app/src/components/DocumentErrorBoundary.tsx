/**
 * DocumentErrorBoundary — error surface for the hybrid Activity + Suspense
 * render tree. Wraps `react-error-boundary` and renders a recoverable fallback
 * when a `DocumentBoundary` (or anything beneath) throws during render — most
 * notably when a `syncPromise` rejects via `use()`.
 *
 * UX (SPEC §5 Failure/debug + §9):
 *   - Document name + one-line error summary (per error kind).
 *   - Primary "Try again": invalidates the syncPromise cache entry and resets
 *     the error boundary so the next render re-enters Suspense with a fresh
 *     promise.
 *   - Secondary "Back to previous document": calls `onNavigateBack` with the
 *     previously-active docName (only rendered when present).
 *   - `resetKeys={[activeDocName]}` so navigating away auto-clears the error.
 *
 * Retry ordering (per acceptance criterion): invalidate MUST run before the
 * boundary state clears, otherwise the re-render would pick up the old cached
 * rejected promise. We hook that through `onReset` because react-error-boundary
 * fires `onReset(...)` synchronously before calling `setState`
 * (node_modules/react-error-boundary/dist/react-error-boundary.cjs).
 */

import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import {
  BridgeSetupError,
  DocumentNotFoundError,
  invalidateSyncPromise,
  PreSyncDisconnectError,
  SyncTimeoutError,
} from '@/editor/sync-promise';

export interface ErrorCopy {
  title: string;
  summary: string;
}

/**
 * Sentinel string passed to `resetErrorBoundary(...)` from the "Back to
 * previous document" button so `onReset` can differentiate a back-nav
 * reset (no recycle) from a "Try again" reset (needs recycle). The
 * `resetErrorBoundary` args surface as `details.args` in `onReset`.
 */
const BACK_NAV_RESET_SENTINEL = '__back-nav__' as const;

/**
 * Read the errored doc's name from the error object. All typed sync-promise
 * errors carry `docName`; anything else returns null.
 */
function errorDocName(error: unknown): string | null {
  if (
    error instanceof SyncTimeoutError ||
    error instanceof PreSyncDisconnectError ||
    error instanceof DocumentNotFoundError ||
    error instanceof BridgeSetupError
  ) {
    return error.docName;
  }
  return null;
}

/**
 * Map a thrown value to user-facing copy. Pure — unit-testable without a
 * DOM. Kept separate from the React surface so the taxonomy can evolve
 * without touching rendering code.
 */
export function errorCopy(error: unknown): ErrorCopy {
  if (error instanceof SyncTimeoutError) {
    return {
      title: 'Sync timed out',
      summary: `Could not sync "${error.docName}" within the timeout. Check your connection and try again.`,
    };
  }
  if (error instanceof PreSyncDisconnectError) {
    return {
      title: 'Connection dropped',
      summary: `Lost connection before "${error.docName}" finished syncing.`,
    };
  }
  if (error instanceof DocumentNotFoundError) {
    return {
      title: 'Document not found',
      summary: `"${error.docName}" could not be found.`,
    };
  }
  if (error instanceof BridgeSetupError) {
    return {
      title: "Couldn't open document",
      summary: `Failed to set up the editor for "${error.docName}". Try again or reopen.`,
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

  return (
    <div
      role="alert"
      aria-labelledby="document-error-title"
      data-slot="document-error-boundary"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-xs font-mono text-muted-foreground">{activeDocName}</p>
      <h2 id="document-error-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">{summary}</p>
      <div className="mt-2 flex gap-2">
        <Button variant="default" onClick={resetErrorBoundary}>
          Try again
        </Button>
        {canGoBack ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (!previousDocName || !onNavigateBack) return;
              // Invalidate the errored doc's cached sync promise BEFORE
              // triggering navigation. The cached rejected promise would
              // otherwise keep throwing for the errored doc's hidden
              // Activity subtree (which stays mounted pool-side), trapping
              // the error boundary after back-nav. A future re-visit to the
              // errored doc will create a fresh syncPromise — exactly what
              // we want for "Back now, retry later" UX. Read the docName
              // from the error itself (not activeDocName prop) because a
              // synchronously-thrown `use()` aborts the transition and
              // leaves activeDocName pointing at the pre-transition doc.
              const erroredDoc = errorDocName(error) ?? activeDocName;
              invalidateSyncPromise(erroredDoc);
              onNavigateBack(previousDocName);
              // Reset the boundary with a sentinel tag so onReset knows
              // this is a back-nav (no recycle). Without this reset, the
              // boundary's resetKeys would stay unchanged on an aborted
              // transition (sync throw aborts the transition before
              // activeDocName can transition commit) and leave the fallback
              // mounted even after the user leaves the errored doc.
              resetErrorBoundary(BACK_NAV_RESET_SENTINEL);
            }}
          >
            Back to previous document
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface DocumentErrorBoundaryProps {
  activeDocName: string;
  previousDocName?: string;
  onNavigateBack?: (previousDocName: string) => void;
  /**
   * Called on imperative "Try again" — destroy + recreate the pool entry so
   * the next sync attempt runs against a fresh provider. Without this, a
   * `BridgeSetupError`-failed entry would remain in the pool and the retry
   * would resolve immediately via the warm-path (the broken provider has
   * `synced=true` from the original sync) without re-running `setupObservers`,
   * leaving the user with a non-functional editor and no further error UI.
   */
  onRecycle?: (docName: string) => void;
  children: React.ReactNode;
}

export function DocumentErrorBoundary({
  activeDocName,
  previousDocName,
  onNavigateBack,
  onRecycle,
  children,
}: DocumentErrorBoundaryProps) {
  // Bind the contextual props into a FallbackComponent for react-error-boundary.
  // Defined inline so `activeDocName` / `previousDocName` / `onNavigateBack`
  // are current on every render — React Compiler handles stability.
  const FallbackComponent = (props: FallbackProps) => (
    <DocumentErrorFallback
      {...props}
      activeDocName={activeDocName}
      previousDocName={previousDocName}
      onNavigateBack={onNavigateBack}
    />
  );

  return (
    <ErrorBoundary
      FallbackComponent={FallbackComponent}
      resetKeys={[activeDocName]}
      // Fires before the boundary clears state, so the next render re-enters
      // Suspense against a fresh syncPromise.
      onReset={(details) => {
        if (details.reason === 'imperative-api') {
          // Back-nav reset carries the sentinel string — do NOT recycle the
          // active doc (we're navigating AWAY from the errored target, not
          // retrying it). Sentinel check reads `details.args` which holds
          // the arguments passed to `resetErrorBoundary(...)`.
          const isBackNav =
            Array.isArray(details.args) && details.args[0] === BACK_NAV_RESET_SENTINEL;
          if (isBackNav) {
            console.warn(`[DocumentErrorBoundary] back-nav reset (no recycle)`);
            return;
          }
          // "Try again" path. Order is load-bearing: recycle FIRST (which
          // destroys the pool entry, calling invalidateSyncPromise via
          // destroyEntry, and recreates the entry with a fresh provider),
          // so that when the boundary re-renders, `EditorArea` sees the new
          // provider and `DocumentBoundary` calls syncPromise(docName,
          // freshProvider) → fresh sync attempt. Without recycle, a
          // BridgeSetupError'd entry would resolve immediately via the
          // warm-path (broken provider has synced=true) without re-running
          // setupObservers.
          if (onRecycle) {
            onRecycle(activeDocName);
          } else {
            invalidateSyncPromise(activeDocName);
          }
          console.warn(`[DocumentErrorBoundary] retry recycled ${activeDocName}`);
        } else {
          // resetKeys change (navigated away). The broken doc's entry stays
          // pool-resident with its cached rejection — revisiting it will
          // re-render the same error UI, where the user can click "Try
          // again" to recycle. Invalidating without recycling would let the
          // warm-path resolve immediately on the broken provider (synced=true,
          // observers not wired), surfacing a non-functional editor with no
          // error UI. The user retains a clear retry path either way.
          console.warn(
            `[DocumentErrorBoundary] reset by key change (${details.prev?.[0]} → ${details.next?.[0]})`,
          );
        }
      }}
      onError={(error) => {
        console.warn(
          `[DocumentErrorBoundary] rendered fallback for ${activeDocName}: ${errorCopy(error).title}`,
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
