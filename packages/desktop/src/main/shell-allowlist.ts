/**
 * Outbound URL scheme allowlist for `shell.openExternal` (D47).
 *
 * Defense-in-depth against the "1-click RCE via OS-native URL schemes" class
 * (Shabarkin 2022 — `ms-msdt:`, `search-ms:`, `ms-officecmd:`, etc.). Allowed:
 * `https://`, `http://`, `mailto:`, `openknowledge://` (our own deep-link
 * scheme — registered in M4).
 *
 * Pure module — no Electron import — so unit tests can exercise it without
 * standing up an Electron BrowserWindow.
 */

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  'https:',
  'http:',
  'mailto:',
  'openknowledge:',
]);

export interface AllowlistResult {
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
