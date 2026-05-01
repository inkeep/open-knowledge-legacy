/**
 * One-time auto-install of the Open Knowledge Agent Skill into Claude Desktop,
 * triggered by the user's first click on the "Claude Cowork" row in the
 * Open-in-Agent dropdown.
 *
 * Why: Claude Cowork can't see Open Knowledge's MCP tools until the OK skill
 * is uploaded into Claude Desktop. Surfacing this as a separate "Install for
 * Cowork" menu item was a tax — most users never found it. Lazy-installing
 * on first Cowork click moves the install step to the moment of intent.
 *
 * Composition: this module owns the *guard policy* (versioned localStorage,
 * one-shot, fail-soft on missing storage). It delegates the *install action*
 * to a pluggable `SkillInstaller` (Electron bridge, HTTP endpoint, or any
 * future host shape). That split keeps each concern reusable: a different
 * skill flow can swap in a different installer, and a different one-shot
 * UX can swap in a different guard.
 *
 * Guard: localStorage `ok:skill:cowork:installed:v<skillVersion>` is set
 * after a successful install. `skillVersion` is held in lockstep with the
 * SKILL.md frontmatter `metadata.version` by the build pipeline; bumping
 * it invalidates the guard automatically. Worst case if storage is cleared:
 * one extra Claude Desktop pop-up.
 */

import { defaultSkillInstaller, type SkillInstaller } from '@/lib/handoff/skill-installer';

/**
 * Minimal storage contract — `Pick`-equivalent of `Storage` so callers can
 * inject in-memory doubles without implementing the full DOM Storage shape.
 */
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
  /**
   * Version string used to compose the localStorage guard key. Bumping it
   * invalidates the guard so a new skill version re-prompts the user.
   */
  readonly skillVersion: string;
  /**
   * Installer to invoke when the guard is unset. Pass `null` when no
   * installer can be constructed for the current host (the helper then
   * returns `host-unsupported`); `undefined` resolves to
   * `defaultSkillInstaller()` at call time.
   */
  readonly installer?: SkillInstaller | null;
  /**
   * Storage seam. Defaults to `window.localStorage` when undefined; pass
   * `null` to disable persistence (the guard then never sets and every
   * call invokes the installer — useful for a "reinstall" debug surface).
   */
  readonly storage?: SkillInstallStorage | null;
}

const GUARD_KEY_PREFIX = 'ok:skill:cowork:installed';
const GUARD_VALUE = '1';

/** Composes the versioned localStorage key. Exported for assertion in tests. */
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
    storage?.setItem(key, GUARD_VALUE);
    return { kind: 'installed-now', path: result.path, handoffWarning: result.handoffWarning };
  }
  return { kind: 'install-failed', reason: result.reason, message: result.message };
}

/**
 * `undefined` → resolve to `window.localStorage` when available, else `null`.
 * `null` → caller explicitly opted out of persistence.
 * `SkillInstallStorage` → caller injected a double.
 */
function resolveStorage(
  injected: SkillInstallStorage | null | undefined,
): SkillInstallStorage | null {
  if (injected !== undefined) return injected;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Some sandboxed iframes throw on `localStorage` access. Fail soft —
    // the install will run every click but no real harm.
    return null;
  }
}

/** Production-default deps — pulls skillVersion from `window.okDesktop`. */
function defaultEnsureCoworkSkillDeps(): EnsureCoworkSkillDeps {
  const okDesktop = typeof window !== 'undefined' ? window.okDesktop : undefined;
  return {
    skillVersion: okDesktop?.appVersion ?? 'unknown',
  };
}

/** Convenience: invoke the helper with production deps. */
export function ensureCoworkSkillInstalledWithDefaults(): Promise<EnsureCoworkSkillOutcome> {
  return ensureCoworkSkillInstalled(defaultEnsureCoworkSkillDeps());
}
