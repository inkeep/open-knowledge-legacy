import { describe, expect, test } from 'bun:test';
import { compareSemver } from '../../src/main/auto-updater.ts';

describe('compareSemver — major.minor.patch', () => {
  test('returns -1 when patch is older', () => {
    expect(compareSemver('0.3.0', '0.3.1')).toBe(-1);
  });

  test('returns 1 when patch is newer', () => {
    expect(compareSemver('0.3.1', '0.3.0')).toBe(1);
  });

  test('returns 0 for equal versions', () => {
    expect(compareSemver('0.3.0', '0.3.0')).toBe(0);
  });

  test('minor takes precedence over patch', () => {
    expect(compareSemver('0.4.0', '0.3.99')).toBe(1);
  });

  test('major takes precedence over minor', () => {
    expect(compareSemver('1.0.0', '0.99.99')).toBe(1);
  });
});

describe('compareSemver — prerelease precedence (semver §11.4)', () => {
  test('prerelease version is less than the same X.Y.Z release', () => {
    expect(compareSemver('0.4.0-beta.0', '0.4.0')).toBe(-1);
    expect(compareSemver('0.4.0', '0.4.0-beta.0')).toBe(1);
  });

  test('numeric identifiers compared numerically — beta.10 > beta.2', () => {
    expect(compareSemver('0.4.0-beta.10', '0.4.0-beta.2')).toBe(1);
    expect(compareSemver('0.4.0-beta.2', '0.4.0-beta.10')).toBe(-1);
  });

  test('alphanumeric identifiers compared lexically — alpha < beta', () => {
    expect(compareSemver('0.4.0-alpha.0', '0.4.0-beta.0')).toBe(-1);
  });

  test('numeric identifier has lower precedence than alphanumeric of same position', () => {
    expect(compareSemver('0.4.0-1', '0.4.0-alpha')).toBe(-1);
  });

  test('longer prerelease set > shorter when shared prefix is equal', () => {
    expect(compareSemver('0.4.0-beta.0.1', '0.4.0-beta.0')).toBe(1);
  });

  test('two equal prerelease versions return 0', () => {
    expect(compareSemver('0.4.0-beta.3', '0.4.0-beta.3')).toBe(0);
  });

  test('the canonical downgrade case — current beta vs older stable', () => {
    expect(compareSemver('0.3.0', '0.4.0-beta.3')).toBe(-1);
  });

  test('beta promotion to stable — same X.Y.Z, drop -beta is newer', () => {
    expect(compareSemver('0.4.0', '0.4.0-beta.3')).toBe(1);
  });
});

describe('compareSemver — build metadata (semver §10) is ignored', () => {
  test('+build is stripped — versions equal otherwise', () => {
    expect(compareSemver('0.4.0+build.1', '0.4.0+build.2')).toBe(0);
  });

  test('+build alongside prerelease still sorts by prerelease rules', () => {
    expect(compareSemver('0.4.0-beta.3+sha.abc', '0.4.0-beta.4+sha.def')).toBe(-1);
  });
});

describe('compareSemver — malformed input', () => {
  test('returns null on empty string', () => {
    expect(compareSemver('', '0.3.0')).toBeNull();
    expect(compareSemver('0.3.0', '')).toBeNull();
  });

  test('returns null on a missing patch component', () => {
    expect(compareSemver('0.3', '0.3.0')).toBeNull();
  });

  test('returns null on non-numeric major', () => {
    expect(compareSemver('vlatest', '0.3.0')).toBeNull();
  });

  test('returns null on garbage input', () => {
    expect(compareSemver('not-a-version', '0.3.0')).toBeNull();
  });
});
