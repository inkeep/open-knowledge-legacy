/**
 * Pluggable skill-installer abstraction. Two implementations land here today:
 *
 *   1. `electronSkillInstaller` — calls `okDesktop.skill.buildAndOpen()` via
 *      the preload bridge.
 *   2. `httpSkillInstaller`   — POSTs to `/api/install-skill` against the
 *      local Hocuspocus server (for browser-hosted UIs).
 *
 * Both adapt to the same `SkillInstaller` interface so callers (today:
 * `cowork-skill-install.ts`; tomorrow: any other "lazy install on intent"
 * surface) don't branch on host. New host shapes (e.g. a future native
 * mobile bridge) plug in by implementing this interface and adding a
 * branch to `defaultSkillInstaller()`.
 *
 * Result shape is normalized so consumers don't have to translate between
 * the bridge's `{ok, path | reason+message}` and the server's richer
 * `{status, outputPath?, handoffError?, buildError?}`. Both collapse to:
 *
 *   - `ok: true`  → the skill file is on disk; Claude Desktop may or may
 *                   not have opened (a soft handoff failure still counts —
 *                   the user can launch the file manually).
 *   - `ok: false` → the build itself failed. Nothing useful happened.
 */

import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

/**
 * Normalized result. `ok: true` means the skill file is on disk (consumer
 * may set its install guard). `path` is the on-disk location of the built
 * `.skill` file when known; absent on `ok: false` and on bridges that
 * don't surface it.
 */
export type SkillInstallResult =
  | { ok: true; path?: string; handoffWarning?: string }
  | { ok: false; reason: string; message?: string };

/** Single-method installer contract — invoke to build + open the skill file. */
export interface SkillInstaller {
  install(): Promise<SkillInstallResult>;
}

/**
 * Bridge subset this module consumes. Derived from the canonical desktop-bridge
 * type so the contract has a single source of truth.
 */
export type ElectronSkillBridge = Pick<OkDesktopBridge['skill'], 'buildAndOpen'>;

/** Adapt the Electron preload bridge to the `SkillInstaller` contract. */
export function electronSkillInstaller(bridge: ElectronSkillBridge): SkillInstaller {
  return {
    async install() {
      let result: Awaited<ReturnType<ElectronSkillBridge['buildAndOpen']>>;
      try {
        result = await bridge.buildAndOpen();
      } catch (err) {
        return {
          ok: false,
          reason: 'bridge-error',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      if (result.ok) return { ok: true, path: result.path };
      return { ok: false, reason: result.reason, message: result.message };
    },
  };
}

/**
 * Server-side `BuildAndOpenSkillResult` (as returned by `POST /api/install-skill`).
 * Mirrored locally — typed only for parsing. Source of truth lives in
 * `@inkeep/open-knowledge-server`'s `skill-install.ts`. Keep `status` +
 * the relevant optional fields aligned with that file.
 */
interface ServerSkillInstallResponse {
  status: 'installed' | 'built' | 'failed';
  outputPath?: string;
  handoffError?: { reason: string; message: string };
  buildError?: string;
}

/** Configuration for the HTTP-backed installer. */
interface HttpSkillInstallerOptions {
  /**
   * Origin to POST against. Empty / omitted ⇒ same-origin relative URL —
   * the right default for a browser tab served by the Hocuspocus dev
   * server. Pass an explicit origin from Electron renderer if it ever
   * needs to drive the HTTP path.
   */
  apiOrigin?: string;
  /** Fetch impl — injectable for unit tests. Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

/** Adapt the local-server `POST /api/install-skill` endpoint to `SkillInstaller`. */
export function httpSkillInstaller(opts: HttpSkillInstallerOptions = {}): SkillInstaller {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const url = `${opts.apiOrigin ?? ''}/api/install-skill`;
  return {
    async install() {
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch (err) {
        return {
          ok: false,
          reason: 'network-error',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          reason: 'http-error',
          message: `HTTP ${response.status}`,
        };
      }
      let body: ServerSkillInstallResponse;
      try {
        body = (await response.json()) as ServerSkillInstallResponse;
      } catch (err) {
        return {
          ok: false,
          reason: 'parse-error',
          message: err instanceof Error ? err.message : 'Invalid server response',
        };
      }
      if (!body || typeof body.status !== 'string') {
        return { ok: false, reason: 'parse-error', message: 'Invalid server response shape' };
      }
      if (body.status === 'failed') {
        return {
          ok: false,
          reason: 'build-failed',
          message: body.buildError ?? 'unknown build failure',
        };
      }
      // 'installed' or 'built'. 'built' means the file is on disk but the
      // OS handoff didn't run (unsupported platform / spawn error). Treat
      // as ok:true with a soft warning — the consumer may still want to
      // surface the warning.
      return {
        ok: true,
        path: body.outputPath,
        handoffWarning: body.handoffError?.message,
      };
    },
  };
}

/**
 * Pick the right installer for the current host. Returns `null` only when
 * no installer can be constructed (server-side rendering / non-browser
 * environment). Browser tabs always get `httpSkillInstaller` — the local
 * Hocuspocus server is reachable via same-origin fetch.
 */
export function defaultSkillInstaller(): SkillInstaller | null {
  if (typeof window === 'undefined') return null;
  const electronBridge = window.okDesktop?.skill;
  if (electronBridge) return electronSkillInstaller(electronBridge);
  return httpSkillInstaller();
}
