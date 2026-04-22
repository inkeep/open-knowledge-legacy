/**
 * Host-aware `openExternal` wrapper for the Open-in-Agent dispatch path.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §8.1 (Electron)
 * and §8.2 (web). Single choke point that maps IPC success / anchor-click
 * success to `HandoffOutcome`. Callers: `dispatch.ts`, `cursor-two-step.ts`,
 * and the disabled-row secondary "Open in claude.ai →" affordance in
 * `OpenInAgentMenu.tsx` (US-010).
 *
 *   - Electron host (`window.okDesktop` present): forwards to
 *     `window.okDesktop.shell.openExternal(url)`. The main-process side runs
 *     the D47 allowlist check (`checkOutboundUrl`) before handing to the OS.
 *   - Web host: constructs an anchor element with `href=url`, appends to the
 *     DOM, calls `.click()`, and removes it. TQ7 LOCKED — most reliable
 *     non-http scheme dispatch in browsers; avoids the "Allow this site to
 *     open X?" interstitial that `window.location.href` triggers on some
 *     browsers.
 *
 * Success → `{ ok: true }`; any thrown rejection or missing DOM context →
 * `{ ok: false, reason: 'dispatch-error', detail }`. The caller decides
 * whether to surface a failure toast (see `useHandoffDispatch` in US-009).
 */

import type { HandoffOutcome } from '@inkeep/open-knowledge-core';

export interface OpenExternalDeps {
  /** Populated by the Electron preload. `undefined` on web / CLI. */
  readonly okDesktop?: { shell: { openExternal(url: string): Promise<void> } };
  /** DOM anchor-click primitive (web host). Defaults to `document`. */
  readonly doc?: Document;
}

/**
 * Dispatch an outbound URL via the host's preferred primitive. Pure of React.
 *
 * The web-host code path requires a DOM; in SSR / Node contexts without
 * `document`, the call resolves to `{ ok: false, reason: 'dispatch-error',
 * detail: 'no DOM available' }` rather than throwing — matches the
 * conservative-failure posture of the rest of the handoff pipeline.
 */
export async function openExternal(
  url: string,
  deps: OpenExternalDeps = {},
): Promise<HandoffOutcome> {
  const okDesktop =
    deps.okDesktop ?? (typeof window !== 'undefined' ? window.okDesktop : undefined);

  if (okDesktop?.shell?.openExternal) {
    try {
      await okDesktop.shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'dispatch-error', detail: errorDetail(err) };
    }
  }

  const doc = deps.doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!doc) {
    return { ok: false, reason: 'dispatch-error', detail: 'no DOM available' };
  }
  try {
    const a = doc.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    // http(s) URLs are the web-fallback path (https://claude.ai/new?q=…) —
    // without `target="_blank"` the anchor click navigates the editor tab
    // away, discarding UI state (active doc, scroll, open panels). Custom
    // schemes (claude://, codex://, cursor://) are intercepted by the OS
    // scheme handler and do NOT navigate the tab; `target` stays unset on
    // those so the TQ7 LOCKED behavior (no "Allow this site to open X?"
    // interstitial on Firefox/Chrome) is preserved.
    if (/^https?:/i.test(url)) {
      a.target = '_blank';
    }
    doc.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'dispatch-error', detail: errorDetail(err) };
  }
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
