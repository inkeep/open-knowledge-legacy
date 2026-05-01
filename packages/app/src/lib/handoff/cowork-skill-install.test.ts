
import { describe, expect, mock, test } from 'bun:test';
import {
  buildCoworkSkillGuardKey,
  type EnsureCoworkSkillDeps,
  ensureCoworkSkillInstalled,
  type SkillInstallStorage,
} from './cowork-skill-install';
import type { SkillInstaller, SkillInstallResult } from './skill-installer';

function memoryStorage(initial: Record<string, string> = {}): SkillInstallStorage & {
  readonly snapshot: () => Record<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    snapshot() {
      return Object.fromEntries(data);
    },
  };
}

function fakeInstaller(result: SkillInstallResult): SkillInstaller {
  return { install: mock(async () => result) };
}

function deps(overrides: Partial<EnsureCoworkSkillDeps> = {}): EnsureCoworkSkillDeps {
  return {
    skillVersion: '1.2.3',
    installer: fakeInstaller({ ok: true, path: '/tmp/openknowledge.skill' }),
    storage: memoryStorage(),
    ...overrides,
  };
}

describe('buildCoworkSkillGuardKey', () => {
  test('namespaces and versions the localStorage key', () => {
    expect(buildCoworkSkillGuardKey('1.2.3')).toBe('ok:skill:cowork:installed:v1.2.3');
    expect(buildCoworkSkillGuardKey('0.0.0-dev')).toBe('ok:skill:cowork:installed:v0.0.0-dev');
  });
});

describe('ensureCoworkSkillInstalled — first run', () => {
  test('installer present + ok: invokes it, sets guard, returns installed-now', async () => {
    const storage = memoryStorage();
    const installer = fakeInstaller({ ok: true, path: '/tmp/openknowledge.skill' });

    const result = await ensureCoworkSkillInstalled(deps({ storage, installer }));

    expect(result).toEqual({
      kind: 'installed-now',
      path: '/tmp/openknowledge.skill',
      handoffWarning: undefined,
    });
    expect(installer.install).toHaveBeenCalledTimes(1);
    expect(storage.snapshot()).toEqual({ 'ok:skill:cowork:installed:v1.2.3': '1' });
  });

  test('installer ok with handoffWarning: surfaces warning, still sets guard', async () => {
    const storage = memoryStorage();
    const installer = fakeInstaller({
      ok: true,
      path: '/tmp/openknowledge.skill',
      handoffWarning: "Couldn't open in Claude Desktop",
    });

    const result = await ensureCoworkSkillInstalled(deps({ storage, installer }));

    expect(result).toEqual({
      kind: 'installed-now',
      path: '/tmp/openknowledge.skill',
      handoffWarning: "Couldn't open in Claude Desktop",
    });
    expect(storage.snapshot()).toEqual({ 'ok:skill:cowork:installed:v1.2.3': '1' });
  });

  test('installer === null: returns host-unsupported, never touches storage', async () => {
    const storage = memoryStorage();
    const result = await ensureCoworkSkillInstalled(deps({ storage, installer: null }));

    expect(result).toEqual({ kind: 'host-unsupported' });
    expect(storage.snapshot()).toEqual({});
  });

  test('installer fails: returns install-failed with reason + message, no guard set', async () => {
    const storage = memoryStorage();
    const installer = fakeInstaller({
      ok: false,
      reason: 'open-failed',
      message: 'Claude Desktop not found',
    });
    const result = await ensureCoworkSkillInstalled(deps({ storage, installer }));

    expect(result).toEqual({
      kind: 'install-failed',
      reason: 'open-failed',
      message: 'Claude Desktop not found',
    });
    expect(storage.snapshot()).toEqual({});
  });
});

describe('ensureCoworkSkillInstalled — guard semantics', () => {
  test('guard set for current skillVersion: short-circuits to already-installed', async () => {
    const storage = memoryStorage({ 'ok:skill:cowork:installed:v1.2.3': '1' });
    const installer = fakeInstaller({ ok: true, path: '/tmp/skill' });

    const result = await ensureCoworkSkillInstalled(deps({ storage, installer }));

    expect(result).toEqual({ kind: 'already-installed' });
    expect(installer.install).not.toHaveBeenCalled();
  });

  test('guard set for a *different* skillVersion: installer re-runs (auto-invalidation)', async () => {
    const storage = memoryStorage({ 'ok:skill:cowork:installed:v1.0.0': '1' });
    const installer = fakeInstaller({ ok: true, path: '/tmp/skill' });

    const result = await ensureCoworkSkillInstalled(
      deps({ skillVersion: '1.2.3', storage, installer }),
    );

    expect(result.kind).toBe('installed-now');
    expect(installer.install).toHaveBeenCalledTimes(1);
    expect(storage.snapshot()).toEqual({
      'ok:skill:cowork:installed:v1.0.0': '1',
      'ok:skill:cowork:installed:v1.2.3': '1',
    });
  });

  test('storage explicitly null: installer runs every time, guard never sets', async () => {
    const installer = fakeInstaller({ ok: true, path: '/tmp/skill' });
    await ensureCoworkSkillInstalled(deps({ storage: null, installer }));
    await ensureCoworkSkillInstalled(deps({ storage: null, installer }));
    expect(installer.install).toHaveBeenCalledTimes(2);
  });

  test('storage.setItem throws (QuotaExceededError): install still reports installed-now', async () => {
    const installer = fakeInstaller({ ok: true, path: '/tmp/skill' });
    const throwingStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };

    const result = await ensureCoworkSkillInstalled(deps({ storage: throwingStorage, installer }));

    expect(result.kind).toBe('installed-now');
    expect(installer.install).toHaveBeenCalledTimes(1);
  });
});
