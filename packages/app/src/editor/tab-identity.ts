/**
 * Per-tab identity constants (D50, US-024).
 *
 * `tabSessionId` is generated once at module load — frozen for the lifetime
 * of the browser tab. Two tabs opening the same document will have distinct
 * `tabSessionId` values but share the same `principalId` (fetched from the
 * server's principal record). This gives presence distinctness (each tab is
 * a separate cursor/awareness entry) while grouping shadow-repo writes under
 * a single `refs/wip/<branch>/<principalId>` ref.
 *
 * `TAB_SESSION_ORIGIN` is a frozen `LocalTransactionOrigin` carrying the
 * tab's session ID. Future work: inject this into TipTap/CodeMirror transact
 * calls so Y.Doc transactions carry per-tab origin for undo attribution.
 */

export const tabSessionId: string = crypto.randomUUID();

export const TAB_SESSION_ORIGIN = Object.freeze({
  source: 'local' as const,
  context: { origin: 'tab-session', tabSessionId },
});
