/**
 * Shared error-state helpers for UI surfaces that need to turn a rejected
 * async action into visible user feedback. Two callers today:
 *
 *   - `NavigatorApp` — dismissible banner via `setError(msg)` React state
 *   - `WorkspaceSwitcher` — transient toast via a `setError` adapter calling
 *     `toast.error(msg)`
 *
 * Both share the same decision logic (prefer `Error.message`, else fallback)
 * and the same rejection-catch shape, so the helpers live here rather than
 * in either component file. This pattern was introduced in Pass 1 of the
 * Electron M1 local-review loop and extended to WorkspaceSwitcher in Pass 3.
 */

/**
 * Resolve the user-visible error message for a thrown/rejected value.
 * Prefers `err.message` when present, otherwise the `fallback`. Pure.
 */
export function resolveErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Run `fn()` and surface any rejection via `setError`. Clears the error state
 * at the start so a prior failure doesn't linger into a new successful action.
 * Swallows rejections — callers continue regardless.
 *
 * `logPrefix` flows into the `console.error` breadcrumb (`[WorkspaceSwitcher]`,
 * `[NavigatorApp]`, …) so operational triage can correlate the thrown value
 * to the call site.
 */
export async function runWithErrorStatePure(
  fn: () => Promise<void>,
  fallback: string,
  setError: (msg: string | null) => void,
  logPrefix = 'action',
): Promise<void> {
  try {
    setError(null);
    await fn();
  } catch (err) {
    console.error(`[${logPrefix}] action failed:`, err);
    setError(resolveErrorMessage(err, fallback));
  }
}
