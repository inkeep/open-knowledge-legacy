/**
 * Per-tab identity constants (D50, US-024).
 *
 * `tabSessionId` is generated once at module load — frozen for the lifetime
 * of the browser tab. Two tabs opening the same document will have distinct
 * `tabSessionId` values but share the same `principalId` (fetched from the
 * server's principal record). This gives presence distinctness (each tab is
 * a separate cursor/awareness entry) while grouping shadow-repo writes under
 * a single `refs/wip/<branch>/<principalId>` ref.
 */

export const tabSessionId: string = crypto.randomUUID();
