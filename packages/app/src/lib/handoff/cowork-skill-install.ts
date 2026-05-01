
import { defaultSkillInstaller, type SkillInstaller } from '@/lib/handoff/skill-installer';

export interface SkillInstallStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type EnsureCoworkSkillOutcome =
  | { kind: 'already-installed' }
  | { kind: 'installed-now'; path?: string; handoffWarning?: string }
  | { kind: 'host-unsupported' }
  | { kind: 'install-failed'; reason: string; message?: string };

export interface EnsureCoworkSkillDeps {
  readonly skillVersion: string;
  readonly installer?: SkillInstaller | null;
  readonly storage?: SkillInstallStorage | null;
}

const GUARD_KEY_PREFIX = 'ok:skill:cowork:installed';
const GUARD_VALUE = '1';

export function buildCoworkSkillGuardKey(skillVersion: string): string {
  return `${GUARD_KEY_PREFIX}:v${skillVersion}`;
}

export async function ensureCoworkSkillInstalled(
  deps: EnsureCoworkSkillDeps,
): Promise<EnsureCoworkSkillOutcome> {
  const storage = resolveStorage(deps.storage);
  const installer = deps.installer === undefined ? defaultSkillInstaller() : deps.installer;
  const key = buildCoworkSkillGuardKey(deps.skillVersion);

  if (storage?.getItem(key) === GUARD_VALUE) {
    return { kind: 'already-installed' };
  }
  if (!installer) {
    return { kind: 'host-unsupported' };
  }

  const result = await installer.install();
  if (result.ok) {
    try {
      storage?.setItem(key, GUARD_VALUE);
    } catch (err) {
      console.warn('[cowork-skill] storage.setItem failed (guard will not persist):', err);
    }
    return { kind: 'installed-now', path: result.path, handoffWarning: result.handoffWarning };
  }
  return { kind: 'install-failed', reason: result.reason, message: result.message };
}

function resolveStorage(
  injected: SkillInstallStorage | null | undefined,
): SkillInstallStorage | null {
  if (injected !== undefined) return injected;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultEnsureCoworkSkillDeps(): EnsureCoworkSkillDeps {
  const okDesktop = typeof window !== 'undefined' ? window.okDesktop : undefined;
  return {
    skillVersion: okDesktop?.appVersion ?? 'unknown',
  };
}

export function ensureCoworkSkillInstalledWithDefaults(): Promise<EnsureCoworkSkillOutcome> {
  return ensureCoworkSkillInstalled(defaultEnsureCoworkSkillDeps());
}
