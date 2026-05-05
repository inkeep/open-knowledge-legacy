import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  legacySidecarPath,
  migrateLegacySidecar,
  readAllTargets,
  readServerPackageVersion,
  readSkillInstallStateSnapshot,
  readTargetRecordedAt,
  readTargetVersion,
  targetStatePath,
  writeTargetVersion,
} from './skill-state.ts';

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), 'ok-skill-state-'));
}

describe('readServerPackageVersion', () => {
  test('reads the version field from `@inkeep/open-knowledge-server`/package.json', async () => {
    const version = await readServerPackageVersion();
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
  });
});

describe('build-time invariant — package.json version matches SKILL.md metadata.version', () => {
  test('server package.json version === bundled SKILL.md frontmatter metadata.version', async () => {
    const skillMdUrl = new URL('../assets/skills/open-knowledge/SKILL.md', import.meta.url);
    const skillMd = await readFile(fileURLToPath(skillMdUrl), 'utf-8');

    const versionMatch = skillMd.match(/^\s*version:\s*"?([^"\n]+)"?\s*$/m);
    expect(versionMatch).not.toBeNull();
    const skillMdVersion = versionMatch?.[1]?.trim();

    const pkgVersion = await readServerPackageVersion();
    expect(skillMdVersion).toBe(pkgVersion);
  });
});

describe('readTargetVersion / writeTargetVersion round-trip', () => {
  test('write → read returns the same version', async () => {
    const home = freshHome();
    await writeTargetVersion(home, 'claude-cowork', '1.2.3');
    const read = await readTargetVersion(home, 'claude-cowork');
    expect(read).toBe('1.2.3');
  });

  test('absent file → null', async () => {
    const home = freshHome();
    expect(await readTargetVersion(home, 'claude-cowork')).toBeNull();
    expect(await readTargetVersion(home, 'cli-hosts')).toBeNull();
  });

  test('atomic write — final file has no `.tmp` sibling', async () => {
    const home = freshHome();
    await writeTargetVersion(home, 'cli-hosts', '0.1.0');
    expect(readFileSync(targetStatePath(home, 'cli-hosts'), 'utf-8')).toBe('0.1.0\n');
    let tmpExists = false;
    try {
      readFileSync(`${targetStatePath(home, 'cli-hosts')}.tmp`, 'utf-8');
      tmpExists = true;
    } catch {}
    expect(tmpExists).toBe(false);
  });

  test('refuses to write invalid version strings', async () => {
    const home = freshHome();
    await expect(writeTargetVersion(home, 'cli-hosts', 'not-a-version')).rejects.toThrow();
    await expect(writeTargetVersion(home, 'cli-hosts', '')).rejects.toThrow();
  });

  test('corrupt file content reads as null (treated as fresh install)', async () => {
    const home = freshHome();
    await mkdir(dirname(targetStatePath(home, 'cli-hosts')), { recursive: true });
    await writeFile(targetStatePath(home, 'cli-hosts'), 'corrupt-string\n', 'utf-8');
    expect(await readTargetVersion(home, 'cli-hosts')).toBeNull();
  });
});

describe('readTargetRecordedAt', () => {
  test('returns ISO 8601 mtime for an existing target file', async () => {
    const home = freshHome();
    await writeTargetVersion(home, 'claude-cowork', '0.1.0');
    const ts = await readTargetRecordedAt(home, 'claude-cowork');
    expect(ts).not.toBeNull();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('returns null when the file is absent', async () => {
    const home = freshHome();
    expect(await readTargetRecordedAt(home, 'claude-cowork')).toBeNull();
  });
});

describe('migrateLegacySidecar', () => {
  test('absent legacy file → no-op', async () => {
    const home = freshHome();
    await migrateLegacySidecar(home);
    expect(await readTargetVersion(home, 'cli-hosts')).toBeNull();
  });

  test('valid legacy file → renamed to new path', async () => {
    const home = freshHome();
    await mkdir(dirname(legacySidecarPath(home)), { recursive: true });
    await writeFile(legacySidecarPath(home), '0.5.0\n', 'utf-8');

    await migrateLegacySidecar(home);

    expect(await readTargetVersion(home, 'cli-hosts')).toBe('0.5.0');
    let legacyStillExists = false;
    try {
      readFileSync(legacySidecarPath(home), 'utf-8');
      legacyStillExists = true;
    } catch {}
    expect(legacyStillExists).toBe(false);
  });

  test('idempotent: second invocation is a no-op', async () => {
    const home = freshHome();
    await mkdir(dirname(legacySidecarPath(home)), { recursive: true });
    await writeFile(legacySidecarPath(home), '0.5.0\n', 'utf-8');

    await migrateLegacySidecar(home);
    await migrateLegacySidecar(home);

    expect(await readTargetVersion(home, 'cli-hosts')).toBe('0.5.0');
  });

  test('corrupt legacy file → deleted; new path stays absent', async () => {
    const home = freshHome();
    await mkdir(dirname(legacySidecarPath(home)), { recursive: true });
    await writeFile(legacySidecarPath(home), 'corrupt-content\n', 'utf-8');

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await migrateLegacySidecar(home);
    } finally {
      console.warn = originalWarn;
    }

    expect(await readTargetVersion(home, 'cli-hosts')).toBeNull();
    let legacyStillExists = false;
    try {
      readFileSync(legacySidecarPath(home), 'utf-8');
      legacyStillExists = true;
    } catch {}
    expect(legacyStillExists).toBe(false);
  });
});

describe('readAllTargets / readSkillInstallStateSnapshot', () => {
  test('all-targets resolves null per absent target', async () => {
    const home = freshHome();
    const snapshot = await readAllTargets(home);
    expect(snapshot).toEqual({ 'claude-cowork': null, 'cli-hosts': null });
  });

  test('all-targets resolves recorded entries when files exist', async () => {
    const home = freshHome();
    await writeTargetVersion(home, 'claude-cowork', '1.0.0');
    await writeTargetVersion(home, 'cli-hosts', '0.9.0');
    const snapshot = await readAllTargets(home);
    expect(snapshot['claude-cowork']?.version).toBe('1.0.0');
    expect(snapshot['cli-hosts']?.version).toBe('0.9.0');
    expect(snapshot['claude-cowork']?.recordedAt).toMatch(/^\d{4}-/);
  });

  test('snapshot includes currentVersion + per-target state', async () => {
    const home = freshHome();
    await writeTargetVersion(home, 'claude-cowork', '0.1.0');
    const snapshot = await readSkillInstallStateSnapshot(home);
    expect(snapshot.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(snapshot.targets['claude-cowork']?.version).toBe('0.1.0');
    expect(snapshot.targets['cli-hosts']).toBeNull();
  });
});
