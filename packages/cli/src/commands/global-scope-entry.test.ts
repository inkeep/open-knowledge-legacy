import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getCwdFromArgs,
  globalScopeResolveServerKey,
  realpathOrSelf,
  slugify,
} from './global-scope-entry.ts';

describe('slugify', () => {
  it('lowercases and collapses whitespace to -', () => {
    expect(slugify('My Project')).toBe('my-project');
  });

  it('strips non-alphanumeric runs into a single -', () => {
    expect(slugify('foo__bar  baz!')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
    expect(slugify('__abc__')).toBe('abc');
  });

  it('returns "project" on empty / all-non-alnum input', () => {
    expect(slugify('')).toBe('project');
    expect(slugify('!!!')).toBe('project');
    expect(slugify('   ')).toBe('project');
  });

  it('normalizes unicode/diacritics runs into -', () => {
    // Composed diacritics are non-a-z0-9 so they collapse.
    expect(slugify('Café')).toBe('caf');
    expect(slugify('über-COOL')).toBe('ber-cool');
  });

  it('preserves digits', () => {
    expect(slugify('project-2026')).toBe('project-2026');
  });
});

describe('getCwdFromArgs', () => {
  it('returns the value after --cwd', () => {
    expect(getCwdFromArgs(['@inkeep/open-knowledge', 'mcp', '--cwd', '/Users/x/notes'])).toBe(
      '/Users/x/notes',
    );
  });

  it('returns undefined when --cwd is absent', () => {
    expect(getCwdFromArgs(['@inkeep/open-knowledge', 'mcp'])).toBeUndefined();
  });

  it('returns undefined when --cwd is the last element with no successor', () => {
    expect(getCwdFromArgs(['@inkeep/open-knowledge', 'mcp', '--cwd'])).toBeUndefined();
  });

  it('returns undefined when args is not an array', () => {
    expect(getCwdFromArgs(undefined)).toBeUndefined();
    expect(getCwdFromArgs(null)).toBeUndefined();
    expect(getCwdFromArgs('not-an-array')).toBeUndefined();
    expect(getCwdFromArgs({ '--cwd': '/x' })).toBeUndefined();
  });

  it('returns undefined when the successor is not a string', () => {
    expect(getCwdFromArgs(['--cwd', 123])).toBeUndefined();
  });
});

describe('realpathOrSelf', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `gse-realpath-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns the canonical path when it exists', () => {
    const real = join(testDir, 'real');
    mkdirSync(real);
    // On macOS, /tmp symlinks to /private/tmp — both realpath resolutions
    // must agree; we assert that by comparing two canonicalizations.
    expect(realpathOrSelf(real)).toBe(realpathOrSelf(real));
    // The result must be absolute and point at our real dir's canonical form.
    expect(realpathOrSelf(real).endsWith('real')).toBe(true);
  });

  it('returns the input path unchanged on ENOENT', () => {
    const missing = join(testDir, 'does-not-exist');
    expect(realpathOrSelf(missing)).toBe(missing);
  });

  it('resolves symlinks to their canonical target', () => {
    const real = join(testDir, 'canonical');
    mkdirSync(real);
    const link = join(testDir, 'alias');
    symlinkSync(real, link);
    // On macOS, tmpdir() often resolves through /private — compare normalized.
    expect(realpathOrSelf(link)).toBe(realpathOrSelf(real));
  });
});

describe('globalScopeResolveServerKey', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `gse-resolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('picks slugified basename default key on a fresh (empty) config', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const result = globalScopeResolveServerKey({}, projectDir);
    expect(result.key).toBe('open-knowledge-notes');
    expect(result.existingEntry).toBeUndefined();
    expect(result.disambiguatedFrom).toBeUndefined();
    expect(result.migratedFromKey).toBeUndefined();
  });

  it('is idempotent — matches existing entry by exact cwd', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const existing = {
      'open-knowledge-notes': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', projectDir],
      },
    };
    const result = globalScopeResolveServerKey(existing, projectDir);
    expect(result.key).toBe('open-knowledge-notes');
    expect(result.existingEntry).toBe(existing['open-knowledge-notes']);
    expect(result.disambiguatedFrom).toBeUndefined();
    expect(result.migratedFromKey).toBeUndefined();
  });

  it('realpath-normalizes both sides — symlinked cwd matches canonical entry', () => {
    const canonical = join(testDir, 'canonical-notes');
    mkdirSync(canonical);
    const link = join(testDir, 'link-notes');
    symlinkSync(canonical, link);

    const existing = {
      'open-knowledge-canonical-notes': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', canonical],
      },
    };
    const result = globalScopeResolveServerKey(existing, link);
    // Matched the canonical entry even though caller passed the symlink.
    expect(result.key).toBe('open-knowledge-canonical-notes');
    expect(result.existingEntry).toBe(existing['open-knowledge-canonical-notes']);
  });

  it('matches a hand-crafted custom-keyed entry by cwd (any open-knowledge* prefix)', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const existing = {
      'open-knowledge-my-custom-key': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', projectDir],
      },
    };
    const result = globalScopeResolveServerKey(existing, projectDir);
    expect(result.key).toBe('open-knowledge-my-custom-key');
    expect(result.existingEntry).toBe(existing['open-knowledge-my-custom-key']);
  });

  it('ignores non-open-knowledge-prefixed keys during match step', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const existing = {
      'some-other-server': {
        command: 'npx',
        args: ['something-else', 'mcp', '--cwd', projectDir],
      },
    };
    const result = globalScopeResolveServerKey(existing, projectDir);
    // No match — falls through to default key step.
    expect(result.key).toBe('open-knowledge-notes');
    expect(result.existingEntry).toBeUndefined();
  });

  it('slugifies whitespace/unicode basenames into kebab-ASCII', () => {
    const projectDir = join(testDir, 'My Project');
    mkdirSync(projectDir);
    const result = globalScopeResolveServerKey({}, projectDir);
    expect(result.key).toBe('open-knowledge-my-project');
  });

  it('auto-disambiguates with -2 on basename collision with different cwd', () => {
    const projectA = join(testDir, 'workA', 'notes');
    const projectB = join(testDir, 'workB', 'notes');
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    const existing = {
      'open-knowledge-notes': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', projectA],
      },
    };
    const result = globalScopeResolveServerKey(existing, projectB);
    expect(result.key).toBe('open-knowledge-notes-2');
    expect(result.existingEntry).toBeUndefined();
    expect(result.disambiguatedFrom).toBe('open-knowledge-notes');
  });

  it('auto-disambiguates with -3 when -2 is also taken', () => {
    const projectA = join(testDir, 'workA', 'notes');
    const projectB = join(testDir, 'workB', 'notes');
    const projectC = join(testDir, 'workC', 'notes');
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    mkdirSync(projectC, { recursive: true });
    const existing = {
      'open-knowledge-notes': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', projectA],
      },
      'open-knowledge-notes-2': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', projectB],
      },
    };
    const result = globalScopeResolveServerKey(existing, projectC);
    expect(result.key).toBe('open-knowledge-notes-3');
    expect(result.disambiguatedFrom).toBe('open-knowledge-notes');
  });

  it('legacy Windsurf detection fires only when opts.detectLegacy === true', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const legacyEntry = {
      command: 'npx',
      args: ['@inkeep/open-knowledge', 'mcp'],
    };
    const existing = { 'open-knowledge': legacyEntry };

    // With detectLegacy: true → migration result.
    const migrated = globalScopeResolveServerKey(existing, projectDir, { detectLegacy: true });
    expect(migrated.key).toBe('open-knowledge-notes');
    expect(migrated.existingEntry).toBe(legacyEntry);
    expect(migrated.migratedFromKey).toBe('open-knowledge');

    // Without detectLegacy → plain 'open-knowledge' key ignored (doesn't start
    // with 'open-knowledge-' AND has no --cwd so match step skips it; falls
    // through to default key step).
    const fresh = globalScopeResolveServerKey(existing, projectDir);
    expect(fresh.key).toBe('open-knowledge-notes');
    expect(fresh.existingEntry).toBeUndefined();
    expect(fresh.migratedFromKey).toBeUndefined();
  });

  it('legacy detection does NOT fire when the open-knowledge entry already has --cwd', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const existing = {
      'open-knowledge': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', projectDir],
      },
    };
    const result = globalScopeResolveServerKey(existing, projectDir, { detectLegacy: true });
    // Routes through match-by-cwd (the entry matches current cwd, prefix check
    // allows the bare 'open-knowledge' key since it starts with the prefix).
    expect(result.key).toBe('open-knowledge');
    expect(result.existingEntry).toBe(existing['open-knowledge']);
    expect(result.migratedFromKey).toBeUndefined();
  });

  it('ENOENT on entry --cwd falls back to string equality (stale entries do not crash)', () => {
    const projectDir = join(testDir, 'notes');
    mkdirSync(projectDir);
    const stale = join(testDir, 'deleted-long-ago');
    const existing = {
      'open-knowledge-gone': {
        command: 'npx',
        args: ['@inkeep/open-knowledge', 'mcp', '--cwd', stale],
      },
    };
    // stale path is ENOENT; realpathOrSelf returns it unchanged. Current cwd
    // realpath != stale, so no match. Default key step runs.
    const result = globalScopeResolveServerKey(existing, projectDir);
    expect(result.key).toBe('open-knowledge-notes');
    expect(result.existingEntry).toBeUndefined();
  });

  it('empty basename (root-like) falls back to "project" slug', () => {
    // Can't actually run at /, but slugify('') → 'project' is the mechanism.
    // Directly exercise via the helper with a basename that collapses to empty.
    const projectDir = join(testDir, '...');
    mkdirSync(projectDir);
    const result = globalScopeResolveServerKey({}, projectDir);
    expect(result.key).toBe('open-knowledge-project');
  });
});
