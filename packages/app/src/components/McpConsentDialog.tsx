/**
 * M6b first-launch MCP consent dialog — thin lazy-loading gate.
 *
 * This wrapper renders in both `NavigatorApp` and `App.tsx` (D-M6-R10 host-
 * agnostic mount). It subscribes to `mcpConsentStore` and renders nothing
 * until the main-process `ok:mcp-wiring:show` IPC fires and the store
 * becomes non-null. **The dialog body is behind `React.lazy()`** — the
 * ~5-6 kB of checkbox UI, pure helpers, and shadcn Dialog wiring only
 * loads at most once per user, ever (AC2.5 marker idempotence).
 *
 * Size-limit motivation (PR #289 CI `size` check): shipping the dialog in
 * the main bundle costs ~1.5 kB gzipped for every page load, desktop AND
 * web (`packages/app/` is the shared Vite bundle consumed by both
 * `ok ui` and the desktop renderer). A one-time dialog that runs <0.1%
 * of sessions has no business being in the initial critical path.
 *
 * Helpers (`computeInitialSelection`, `toggleSelectedId`,
 * `selectedIdsOrdered`) are re-exported from this module to preserve the
 * test-import surface. They still physically live in `McpConsentDialogBody.tsx`.
 */

import { lazy, Suspense, useSyncExternalStore } from 'react';
import { mcpConsentStore } from '@/lib/mcp-consent-store';

// Lazy-load the dialog body. Default-export in McpConsentDialogBody.tsx keeps
// this one-liner — no `.then(m => ({ default: m.McpConsentDialogBody }))`
// trampoline. The resulting chunk is code-split from the main bundle by
// Vite / Rolldown automatically.
const LazyMcpConsentDialogBody = lazy(() => import('./McpConsentDialogBody'));

/**
 * Thin gate: subscribes to the store's has-payload state and only mounts
 * the heavy dialog body when a consent request is present. Suspense's null
 * fallback means nothing renders during the lazy-chunk fetch (acceptable —
 * the dialog is modal-on-first-interaction, not a render-blocking surface).
 */
export function McpConsentDialog() {
  const hasPayload = useSyncExternalStore(
    mcpConsentStore.subscribe,
    () => mcpConsentStore.getSnapshot() !== null,
    () => false,
  );
  if (!hasPayload) return null;
  return (
    <Suspense fallback={null}>
      <LazyMcpConsentDialogBody />
    </Suspense>
  );
}

// Re-exports for the test surface. The helpers (pure) stay importable from
// this module path so `McpConsentDialog.test.ts` doesn't need to know about
// the lazy-body split. Same pattern as `EditorActivityPool.tsx` → lazy-test
// file re-exports.
export {
  computeInitialSelection,
  selectedIdsOrdered,
  type ToastImpl,
  toggleSelectedId,
} from './McpConsentDialogBody';
