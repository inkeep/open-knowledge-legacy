/**
 * Outbound URL scheme allowlist for `shell.openExternal` (D47).
 *
 * Defense-in-depth against the "1-click RCE via OS-native URL schemes" class
 * (Shabarkin 2022 — `ms-msdt:`, `search-ms:`, `ms-officecmd:`, etc.). Allowed:
 * `https://`, `http://`, `mailto:`, `openknowledge://` (our own deep-link
 * scheme — registered in M4), plus `claude://`, `codex://`, `cursor://` added
 * by specs/2026-04-21-open-in-agent-desktop/ for the "Open in Agent Desktop"
 * handoff dropdown. Each new scheme's outbound payload is constructed by a
 * per-target URL-builder in `packages/core/src/handoff/` — never by
 * user-supplied raw URL. The exact-set allowlist continues to exclude the
 * Shabarkin class by construction.
 *
 * Pure module — no Electron import — so unit tests can exercise it without
 * standing up an Electron BrowserWindow.
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
