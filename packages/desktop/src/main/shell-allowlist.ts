/**
 * Outbound URL scheme allowlist for `shell.openExternal`.
 *
 * Defense-in-depth against the "1-click RCE via OS-native URL schemes" class
 * (Shabarkin 2022 — `ms-msdt:`, `search-ms:`, `ms-officecmd:`, etc.). The
 * exact-set allowlist excludes that class by construction. Outbound payloads
 * are only constructed by per-target URL-builders in
 * `packages/core/src/handoff/` — never by user-supplied raw URL.
 *
 * Pure module — no Electron import — so unit tests exercise it without an
 * Electron BrowserWindow.
 */

export const ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  'https:',
  'http:',
  'mailto:',
  'openknowledge:',

  /**
   * Claude Desktop unified app (Chat + Cowork + Code).
   * OK emits exactly:
   *   claude://cowork/new?q=<enc>&folder=<enc>&file=<enc>
   *   claude://code/new?q=<enc>&folder=<enc>&file=<enc>
   * No other paths. Single-encoded per `packages/core/src/handoff/claude-url.ts`.
   */
  'claude:',

  /**
   * OpenAI Codex Desktop.
   * OK emits exactly:
   *   codex://new?prompt=<enc>&path=<enc>
   * No other paths. Single-encoded per `packages/core/src/handoff/codex-url.ts`.
   */
  'codex:',

  /**
   * Cursor IDE.
   * OK emits exactly:
   *   cursor://anysphere.cursor-deeplink/prompt?text=<double-enc>&workspace=<enc>&mode=agent
   * No other paths. `text=` is double-encoded per the two-pass-decode behavior
   * documented in `reports/deep-linking-ai-desktop-apps-2026/evidence/cursor-encoding-empirics.md`.
   */
  'cursor:',
]);

interface AllowlistResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a URL string against the outbound-scheme allowlist.
 * Returns `{ ok: true }` if allowed, `{ ok: false, reason }` otherwise.
 */
export function checkOutboundUrl(url: string): AllowlistResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, reason: `scheme-not-allowed: ${parsed.protocol}` };
  }
  return { ok: true };
}

/**
 * Pure shell.openExternal bridge-handler factory. Returns an async handler
 * that throws on disallowed schemes and calls `openExternal` on allowed ones.
 * Separated from `index.ts`'s IPC wiring so the check-and-delegate contract
 * can be unit-tested without an Electron runtime.
 */
export function handleShellOpenExternal(deps: {
  openExternal: (url: string) => Promise<void>;
}): (url: string) => Promise<void> {
  return async (url: string) => {
    const check = checkOutboundUrl(url);
    if (!check.ok) {
      throw new Error(`shell.openExternal blocked: ${check.reason}`);
    }
    await deps.openExternal(url);
  };
}
