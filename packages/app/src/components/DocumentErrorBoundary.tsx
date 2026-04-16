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

import { useEffect, useRef } from 'react';
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
 *
 * Copy discipline: the user-facing vocabulary is "load"/"loading", not
 * "sync"/"syncing". "Sync" is internal jargon (Y.js/Hocuspocus); the product
 * is a document editor where the user mental model is always "opening a
 * document." NavigationPendingBar uses the same vocabulary ("Loading…" /
 * "Still loading…") so the progression from pending-bar to error-boundary
 * stays in one voice.
 */
export function errorCopy(error: unknown): ErrorCopy {
  if (error instanceof SyncTimeoutError) {
    return {
      title: "Couldn't load document",
      summary: `"${error.docName}" took too long to load. Check your connection and try again.`,
    };
  }
  if (error instanceof PreSyncDisconnectError) {
    return {
      title: 'Connection dropped',
      summary: `Lost connection while loading "${error.docName}".`,
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
  const retryRef = useRef<HTMLButtonElement>(null);

  // Move focus to the primary "Try again" action when the fallback mounts so
  // keyboard and screen-reader users land on the recovery affordance without
  // tabbing through the page. WCAG 2.4.3 focus-order guidance for full-surface
  // error states. Paired with role="alert" so AT announces the error context
  // before the focus lands on the button.
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

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
        <Button ref={retryRef} variant="default" onClick={resetErrorBoundary}>
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
   * the next sync attempt runs against a fresh provider. REQUIRED (not
   * optional) because a `BridgeSetupError`-failed entry would otherwise
   * remain in the pool and the retry would resolve immediately via the
   * warm-path (the broken provider has `synced=true` from the original sync)
   * without re-running `setupObservers`, leaving the user with a
   * non-functional editor and no further error UI. Per CLAUDE.md precedent
   * #7 ("remove broken capabilities rather than shipping them"), the
   * known-broken fallback path (invalidate-only) is removed entirely — every
   * caller must wire recycle or the retry button is not functional.
   */
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
  // Use `fallbackRender` (not `FallbackComponent`) so inline closures capturing
  // `activeDocName` / `previousDocName` / `onNavigateBack` don't create a new
  // component type on every render. react-error-boundary calls `fallbackRender`
  // as a function and renders the result directly (no createElement), so there
  // is no component-identity-churn remount of the fallback subtree. See
  // node_modules/react-error-boundary/dist/react-error-boundary.cjs:render
  // (FallbackComponent takes the createElement branch; fallbackRender does not).
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
          // freshProvider) → fresh sync attempt. `onRecycle` is required
          // (not optional) so this branch is always live — see prop doc.
          onRecycle(activeDocName);
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
