/**
 * GET /api/installed-agents — server-side install-detection for the web host.
 *
 * Web-host parity for the Electron `ok:shell:detect-protocol` IPC in
 * `packages/desktop/src/main/ipc-handlers.ts`. The browser can't enumerate the
 * OS's scheme handlers directly; this endpoint probes on its behalf so the
 * Open-in-Agent dropdown renders correctly in the `open-knowledge start` web
 * build.
 *
 * Per SPEC `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.4:
 *   - macOS:   `osascript -e 'id of app "<AppName>"'` — stdout has bundle id
 *              when installed; non-zero exit + error when not. We try multiple
 *              candidate display names per scheme because vendor apps rename
 *              (e.g. Codex shipped as "Codex" at /Applications/Codex.app but
 *              some builds use "OpenAI Codex"). Any non-empty id wins.
 *   - Windows: `reg query "HKCR\<scheme>" /ve` — exit 0 when the scheme has a
 *              registered handler anywhere in the merged HKCR view. HKCR is
 *              the merge of HKCU\Software\Classes and HKLM\Software\Classes,
 *              so this catches both user-scope and machine-scope (MSI / system-
 *              wide installer) registrations. Querying HKCU alone would miss
 *              HKLM entries.
 *   - Linux:   `xdg-mime query default x-scheme-handler/<scheme>` — non-empty
 *              stdout when a `.desktop` handler is registered.
 *
 * Cache policy: per-scheme 60 s TTL (SPEC §6.4) with in-flight dedup so a burst
 * of 3 requests triggers exactly one OS probe per scheme. Conservative
 * fallback on probe timeout / error: `installed: false`.
 *
 * Response body shape (flat per spec.json US-005 AC):
 *     { claude: boolean, codex: boolean, cursor: boolean }
 * Cowork + Code both map to the single `claude:` scheme; the endpoint flattens
 * to one boolean per scheme rather than per target.
 *
 * Per E4 DIRECTED (SPEC §2 Non-Goals): web-host Cursor is still probed here,
 * but the client UI in `packages/app/src/components/handoff/OpenInAgentMenu.tsx`
 * always renders the Cursor row disabled-with-tooltip on web hosts regardless
 * of the boolean returned. Leaving the probe in place keeps the response shape
 * stable and the server-side logic uniform.
 */

import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const INSTALLED_AGENTS_SCHEMES = ['claude', 'codex', 'cursor'] as const;
export type InstalledAgentScheme = (typeof INSTALLED_AGENTS_SCHEMES)[number];

/** SPEC §6.4: `results cached server-side for 60s`. */
export const INSTALLED_AGENTS_CACHE_TTL_MS = 60_000;

/** SPEC §6.4: `Per-OS shell invocation with 2s timeout`. */
const INSTALLED_AGENTS_PROBE_TIMEOUT_MS = 2000;

/**
 * macOS app-name candidates per scheme. The `osascript` probe asks for an app
 * by its Launch Services display name and rejects hard if the name doesn't
 * match a registered bundle — an exact-name mismatch masquerades as "not
 * installed." Some vendors rename between versions (Codex shipped as
 * "Codex" at `/Applications/Codex.app` in the current desktop release; older
 * internal builds used "OpenAI Codex"), so we try every candidate in order
 * and treat the first non-empty `id of app` result as installed.
 *
 * Keep the vendor's current marketing name first; add aliases conservatively
 * when a real install-detection miss is observed in the wild.
 */
const MACOS_APP_NAMES: Record<InstalledAgentScheme, ReadonlyArray<string>> = {
  claude: ['Claude'],
  codex: ['Codex', 'OpenAI Codex'],
  cursor: ['Cursor'],
};

/**
 * Minimal signature of `node:child_process`'s `execFile` — the subset this
 * module actually calls. Injectable so unit tests can replace with a
 * deterministic fake.
 */
export type ExecFileLike = (
  file: string,
  args: readonly string[],
  opts: { timeout?: number; encoding?: BufferEncoding },
  cb: (err: (Error & { code?: number | string }) | null, stdout: string, stderr: string) => void,
) => void;

interface InstalledAgentsProbeDeps {
  /** Probe one scheme against the OS; returns true iff install-registered. */
  probe: (scheme: InstalledAgentScheme) => Promise<boolean>;
  /** Clock override — defaults to `Date.now`. Tests inject a fake clock. */
  now?: () => number;
  /** TTL override — defaults to `INSTALLED_AGENTS_CACHE_TTL_MS`. */
  ttlMs?: number;
}

type CacheEntry =
  | { status: 'resolved'; installed: boolean; expiresAt: number }
  | { status: 'inflight'; promise: Promise<boolean> };

/**
 * Factory for a per-scheme cached probe. Returns `probeAll` (fetches every
 * scheme) and `probeWithCache` (single scheme; exposed for targeted tests).
 *
 * Cache invariants:
 *   - Fresh resolved entry (expiresAt > now()) → return cached value; no probe.
 *   - In-flight promise → return the same promise; coalesces concurrent calls.
 *   - Stale or absent → launch a new probe; stash the in-flight promise so a
 *     second caller before resolution still joins the same probe.
 *   - Probe rejection is swallowed: cache `{installed:false}` for the full TTL
 *     so a flaky probe doesn't re-fire on every request (SPEC §6.4 "on probe
 *     timeout or unexpected error, respond {installed:false}").
 */
export function createInstalledAgentsProbe(deps: InstalledAgentsProbeDeps): {
  probeAll: () => Promise<Record<InstalledAgentScheme, boolean>>;
  probeWithCache: (scheme: InstalledAgentScheme) => Promise<boolean>;
} {
  const cache = new Map<InstalledAgentScheme, CacheEntry>();
  const now = deps.now ?? Date.now;
  const ttl = deps.ttlMs ?? INSTALLED_AGENTS_CACHE_TTL_MS;

  async function probeWithCache(scheme: InstalledAgentScheme): Promise<boolean> {
    const cached = cache.get(scheme);
    if (cached?.status === 'resolved' && cached.expiresAt > now()) {
      return cached.installed;
    }
    if (cached?.status === 'inflight') {
      return cached.promise;
    }
    const promise = (async () => {
      try {
        const installed = await deps.probe(scheme);
        cache.set(scheme, { status: 'resolved', installed, expiresAt: now() + ttl });
        return installed;
      } catch {
        cache.set(scheme, { status: 'resolved', installed: false, expiresAt: now() + ttl });
        return false;
      }
    })();
    cache.set(scheme, { status: 'inflight', promise });
    return promise;
  }

  async function probeAll(): Promise<Record<InstalledAgentScheme, boolean>> {
    const entries = await Promise.all(
      INSTALLED_AGENTS_SCHEMES.map(
        async (s): Promise<readonly [InstalledAgentScheme, boolean]> => [
          s,
          await probeWithCache(s),
        ],
      ),
    );
    return Object.fromEntries(entries) as Record<InstalledAgentScheme, boolean>;
  }

  return { probeAll, probeWithCache };
}

/**
 * HTTP handler for GET /api/installed-agents.
 *
 * 405 on non-GET. 200 + flat `{claude, codex, cursor}` body on success.
 * 500 is unreachable under `createInstalledAgentsProbe` semantics (probe
 * rejections are swallowed into `false`), but defended against for robustness.
 *
 * Error envelopes use the bare `{error}` shape — NOT the `{ok:true,...}` /
 * `{ok:false,...}` envelope some peer endpoints emit. The success shape is
 * dictated by SPEC §6.4 ("Response body: JSON { claude, codex, cursor }") and
 * is consumed directly by `probeViaFetch` in `packages/app/src/lib/handoff/
 * install-detect.ts`, which keys off the three literal scheme names. Wrapping
 * success in `{ok:true, agents:...}` would break that consumer without
 * benefit; aligning errors to the bare shape keeps the envelope uniform
 * across both status branches of this endpoint (Review Minor #1).
 */
export async function handleInstalledAgents(
  req: IncomingMessage,
  res: ServerResponse,
  probeAll: () => Promise<Record<InstalledAgentScheme, boolean>>,
): Promise<void> {
  if (req.method !== 'GET') {
    writeJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  try {
    const result = await probeAll();
    writeJson(res, 200, result);
  } catch (e) {
    console.error('[installed-agents]', e);
    writeJson(res, 500, { error: 'Internal server error' });
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

/**
 * Build the default OS probe for the current platform. Tests inject a fake
 * `exec` to avoid actually calling `osascript` / `reg` / `xdg-mime`.
 *
 * Unknown platforms fall through to the Linux branch — the `xdg-mime` probe
 * simply returns false on systems where the tool isn't installed, matching
 * the conservative-default invariant.
 */
export function createOsProbe(
  platform: NodeJS.Platform,
  exec: ExecFileLike = execFile as ExecFileLike,
): (scheme: InstalledAgentScheme) => Promise<boolean> {
  return (scheme) => {
    if (platform === 'darwin') return probeMacOs(scheme, exec);
    if (platform === 'win32') return probeWindows(scheme, exec);
    return probeLinux(scheme, exec);
  };
}

function probeMacOs(scheme: InstalledAgentScheme, exec: ExecFileLike): Promise<boolean> {
  const candidates = MACOS_APP_NAMES[scheme];
  function tryCandidate(appName: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(
        'osascript',
        ['-e', `id of app "${appName}"`],
        { timeout: INSTALLED_AGENTS_PROBE_TIMEOUT_MS, encoding: 'utf-8' },
        (err, stdout) => {
          if (err) {
            resolve(false);
            return;
          }
          resolve(stdout.trim().length > 0);
        },
      );
    });
  }
  return (async () => {
    for (const candidate of candidates) {
      if (await tryCandidate(candidate)) return true;
    }
    return false;
  })();
}

function probeWindows(scheme: InstalledAgentScheme, exec: ExecFileLike): Promise<boolean> {
  return new Promise((resolve) => {
    // Query HKCR (the merged view of HKCU\Software\Classes and HKLM\Software\
    // Classes) so both user-scope installs AND system-wide installers (the
    // default for MSI / enterprise-packaged builds) register as installed.
    // Querying HKCU alone would miss machine-scope registrations and report
    // the row as permanently disabled for any user with a system-wide install.
    exec(
      'reg',
      ['query', `HKCR\\${scheme}`, '/ve'],
      { timeout: INSTALLED_AGENTS_PROBE_TIMEOUT_MS, encoding: 'utf-8' },
      (err) => {
        resolve(!err);
      },
    );
  });
}

function probeLinux(scheme: InstalledAgentScheme, exec: ExecFileLike): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      'xdg-mime',
      ['query', 'default', `x-scheme-handler/${scheme}`],
      { timeout: INSTALLED_AGENTS_PROBE_TIMEOUT_MS, encoding: 'utf-8' },
      (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(stdout.trim().length > 0);
      },
    );
  });
}
