
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';

export type SkillInstallResult =
  | { ok: true; path?: string; handoffWarning?: string }
  | { ok: false; reason: string; message?: string };

export interface SkillInstaller {
  install(): Promise<SkillInstallResult>;
}

export type ElectronSkillBridge = Pick<OkDesktopBridge['skill'], 'buildAndOpen'>;

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

interface ServerSkillInstallResponse {
  status: 'installed' | 'built' | 'failed';
  outputPath?: string;
  handoffError?: { reason: string; message: string };
  buildError?: string;
}

interface HttpSkillInstallerOptions {
  apiOrigin?: string;
  fetch?: typeof fetch;
}

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
        let message = `HTTP ${response.status}`;
        try {
          const errBody = (await response.json()) as {
            error?: string | { message?: string };
          };
          const detail = typeof errBody.error === 'string' ? errBody.error : errBody.error?.message;
          if (detail) message = detail;
        } catch {
        }
        return { ok: false, reason: 'http-error', message };
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
      return {
        ok: true,
        path: body.outputPath,
        handoffWarning: body.handoffError?.message,
      };
    },
  };
}

export function defaultSkillInstaller(): SkillInstaller | null {
  if (typeof window === 'undefined') return null;
  const electronBridge = window.okDesktop?.skill;
  if (electronBridge) return electronSkillInstaller(electronBridge);
  return httpSkillInstaller();
}
