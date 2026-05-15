import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  classifyLaunchJsonEntry,
  type LaunchJsonRepairLogEvent,
  repairLaunchJson,
} from './repair-launch-json.ts';

const CANONICAL_ENTRY = {
  name: 'open-knowledge-ui',
  runtimeExecutable: 'npx',
  runtimeArgs: ['-y', '@inkeep/open-knowledge@latest', 'ui'],
  port: 50219,
  autoPort: true,
};

const LEGACY_BARE_ENTRY = {
  name: 'open-knowledge-ui',
  runtimeExecutable: 'npx',
  runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
  port: 50219,
  autoPort: true,
};

const LEGACY_BARE_WITH_Y_ENTRY = {
  name: 'open-knowledge-ui',
  runtimeExecutable: 'npx',
  runtimeArgs: ['-y', '@inkeep/open-knowledge', 'ui'],
  port: 50219,
  autoPort: true,
};

describe('classifyLaunchJsonEntry', () => {
  it('returns "canonical" for the published @latest shape', () => {
    expect(classifyLaunchJsonEntry(CANONICAL_ENTRY)).toBe('canonical');
  });

  it('returns "legacy-bare" for the unpinned 2-arg npx shape', () => {
    expect(classifyLaunchJsonEntry(LEGACY_BARE_ENTRY)).toBe('legacy-bare');
  });

  it('returns "legacy-bare" for the unpinned -y 3-arg npx shape', () => {
    expect(classifyLaunchJsonEntry(LEGACY_BARE_WITH_Y_ENTRY)).toBe('legacy-bare');
  });

  it('returns "preserved" when the package is pinned to @beta', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'npx',
        runtimeArgs: ['-y', '@inkeep/open-knowledge@beta', 'ui'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" when the package is pinned to a concrete version', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'npx',
        runtimeArgs: ['-y', '@inkeep/open-knowledge@0.5.0', 'ui'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" when the bare @latest spec omits the -y flag', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'npx',
        runtimeArgs: ['@inkeep/open-knowledge@latest', 'ui'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for dev-mode (runtimeExecutable=node, dist path)', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'node',
        runtimeArgs: ['/path/to/packages/cli/dist/cli.mjs', 'ui'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for an arbitrary custom command', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'my-wrapper',
        runtimeArgs: ['ui'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for legacy bare shape with extra trailing args', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'npx',
        runtimeArgs: ['@inkeep/open-knowledge', 'ui', '--port', '9999'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for entries with non-array runtimeArgs', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 'npx',
        runtimeArgs: 'ui',
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for entries with non-string runtimeExecutable', () => {
    expect(
      classifyLaunchJsonEntry({
        name: 'open-knowledge-ui',
        runtimeExecutable: 42,
        runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
      }),
    ).toBe('preserved');
  });

  it('returns "preserved" for empty entries', () => {
    expect(classifyLaunchJsonEntry({})).toBe('preserved');
  });
});

describe('repairLaunchJson', () => {
  let testDir: string;
  let projectDir: string;
  let logEvents: LaunchJsonRepairLogEvent[];
  const logger = (event: LaunchJsonRepairLogEvent) => {
    logEvents.push(event);
  };

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `repair-launch-json-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    logEvents = [];
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeLaunchJson(content: unknown): string {
    const dir = join(projectDir, '.claude');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'launch.json');
    writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
    return path;
  }

  it('rewrites a legacy bare entry forward to the canonical @latest shape', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [LEGACY_BARE_ENTRY],
    });

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('repaired');
    expect(result.outcome.configPath).toBe(configPath);
    expect(result.repairedCount).toBe(1);

    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.configurations).toHaveLength(1);
    expect(written.configurations[0].runtimeExecutable).toBe('npx');
    expect(written.configurations[0].runtimeArgs).toEqual([
      '-y',
      '@inkeep/open-knowledge@latest',
      'ui',
    ]);
    expect(written.configurations[0].name).toBe('open-knowledge-ui');

    expect(logEvents).toContainEqual({
      event: 'launch-json-repair-applied',
      configPath,
    });
  });

  it('rewrites the -y legacy variant forward', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [LEGACY_BARE_WITH_Y_ENTRY],
    });

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('repaired');
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.configurations[0].runtimeArgs).toEqual([
      '-y',
      '@inkeep/open-knowledge@latest',
      'ui',
    ]);
  });

  it('leaves an already-canonical entry untouched (outcome=canonical, no rewrite)', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [CANONICAL_ENTRY],
    });
    const before = readFileSync(configPath, 'utf-8');

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('canonical');
    expect(result.repairedCount).toBe(0);
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
    expect(logEvents.filter((e) => e.event === 'launch-json-repair-applied')).toHaveLength(0);
  });

  it('preserves a @beta-pinned entry (user intent)', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [
        {
          name: 'open-knowledge-ui',
          runtimeExecutable: 'npx',
          runtimeArgs: ['-y', '@inkeep/open-knowledge@beta', 'ui'],
          port: 50219,
          autoPort: true,
        },
      ],
    });
    const before = readFileSync(configPath, 'utf-8');

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('preserved');
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('preserves a dev-mode entry (runtimeExecutable=node)', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [
        {
          name: 'open-knowledge-ui',
          runtimeExecutable: 'node',
          runtimeArgs: ['/some/dist/cli.mjs', 'ui'],
          port: 50219,
          autoPort: true,
        },
      ],
    });
    const before = readFileSync(configPath, 'utf-8');

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('preserved');
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('preserves co-located non-OK configurations when rewriting', () => {
    const foreignConfig = {
      name: 'some-other-tool',
      runtimeExecutable: 'node',
      runtimeArgs: ['./server.js'],
      port: 9001,
    };
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [foreignConfig, LEGACY_BARE_ENTRY],
    });

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('repaired');
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.configurations).toHaveLength(2);
    expect(
      written.configurations.find((c: { name: string }) => c.name === 'some-other-tool'),
    ).toEqual(foreignConfig);
    const okEntry = written.configurations.find(
      (c: { name: string }) => c.name === 'open-knowledge-ui',
    );
    expect(okEntry.runtimeArgs).toEqual(['-y', '@inkeep/open-knowledge@latest', 'ui']);
  });

  it('reports no-file when .claude/launch.json does not exist', () => {
    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('no-file');
    expect(result.outcome.configPath).toBe(join(projectDir, '.claude', 'launch.json'));
    expect(result.repairedCount).toBe(0);
    expect(logEvents).toHaveLength(0);
  });

  it('does not create launch.json when it was absent', () => {
    repairLaunchJson({ projectDir, logger });
    expect(existsSync(join(projectDir, '.claude', 'launch.json'))).toBe(false);
  });

  it('reports no-entry when launch.json exists but has no open-knowledge-ui config', () => {
    writeLaunchJson({
      version: '0.0.1',
      configurations: [
        { name: 'some-other-tool', runtimeExecutable: 'node', runtimeArgs: ['./server.js'] },
      ],
    });

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('no-entry');
    expect(result.repairedCount).toBe(0);
  });

  it('reports no-entry when configurations is missing entirely', () => {
    writeLaunchJson({ version: '0.0.1' });

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('no-entry');
  });

  it('reports read-failed and emits the structured event on malformed JSON', () => {
    const dir = join(projectDir, '.claude');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'launch.json');
    writeFileSync(path, '{ not valid json');

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('read-failed');
    expect(typeof result.outcome.error).toBe('string');
    expect(result.outcome.error?.length ?? 0).toBeGreaterThan(0);

    const readFailed = logEvents.find((e) => e.event === 'launch-json-repair-read-failed');
    expect(readFailed).toBeDefined();
    expect(readFailed?.configPath).toBe(path);
    expect(typeof readFailed?.error).toBe('string');
  });

  it('reports read-failed and emits the structured event on non-object root', () => {
    const dir = join(projectDir, '.claude');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'launch.json');
    writeFileSync(path, JSON.stringify([{ name: 'open-knowledge-ui' }]));

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('read-failed');
    expect(result.outcome.error).toBe('launch.json root is not an object');

    const readFailed = logEvents.find((e) => e.event === 'launch-json-repair-read-failed');
    expect(readFailed).toBeDefined();
    expect(readFailed?.configPath).toBe(path);
    expect(readFailed?.error).toBe('launch.json root is not an object');
  });

  it('emits a single stderr JSON line per repair when no logger is injected', () => {
    writeLaunchJson({ version: '0.0.1', configurations: [LEGACY_BARE_ENTRY] });

    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      repairLaunchJson({ projectDir });
    } finally {
      process.stderr.write = origWrite;
    }

    const appliedLines = writes.filter((w) => w.includes('"launch-json-repair-applied"'));
    expect(appliedLines.length).toBe(1);
    const parsed = JSON.parse(appliedLines[0].trim());
    expect(parsed.event).toBe('launch-json-repair-applied');
    expect(parsed.configPath).toContain('launch.json');
  });

  it('reports write-failed and emits the structured event when the file is unwritable', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [LEGACY_BARE_ENTRY],
    });
    chmodSync(configPath, 0o444);
    try {
      const result = repairLaunchJson({ projectDir, logger });

      expect(result.outcome.outcome).toBe('write-failed');
      expect(typeof result.outcome.error).toBe('string');
      expect(result.outcome.error?.length ?? 0).toBeGreaterThan(0);
      expect(result.repairedCount).toBe(0);

      const writeFailed = logEvents.find((e) => e.event === 'launch-json-repair-write-failed');
      expect(writeFailed).toBeDefined();
      expect(writeFailed?.configPath).toBe(configPath);
      expect(typeof writeFailed?.error).toBe('string');
    } finally {
      chmodSync(configPath, 0o644);
    }
  });

  it('rewrites only the first matching entry when somehow duplicated', () => {
    const configPath = writeLaunchJson({
      version: '0.0.1',
      configurations: [LEGACY_BARE_ENTRY, { ...LEGACY_BARE_ENTRY, port: 99999 }],
    });

    const result = repairLaunchJson({ projectDir, logger });

    expect(result.outcome.outcome).toBe('repaired');
    const written = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(written.configurations).toHaveLength(2);
    expect(written.configurations[0].runtimeArgs).toEqual([
      '-y',
      '@inkeep/open-knowledge@latest',
      'ui',
    ]);
    expect(written.configurations[1].runtimeArgs).toEqual(['@inkeep/open-knowledge', 'ui']);
  });
});
