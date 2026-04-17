import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  formatCheckpointBodyLine,
  getShadowRepoPath,
  getWipRefPattern,
  parseCheckpoint,
  parseContributors,
  parseWriterId,
} from './shadow-repo-layout.ts';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(resolve(tmpdir(), 'ok-shadow-layout-test-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('parseContributors', () => {
  test('empty string → []', () => {
    expect(parseContributors('')).toEqual([]);
  });

  test('body with no contributor lines → []', () => {
    expect(parseContributors('WIP auto-save 2026-04-01T00:00:00.000Z')).toEqual([]);
  });

  test('parses a single valid contributor line', () => {
    const body = '\nok-contributors: {"id":"agent-abc","name":"Claude","docs":["articles/foo"]}';
    const result = parseContributors(body);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'agent-abc', name: 'Claude', docs: ['articles/foo'] });
  });

  test('parses multiple contributor lines', () => {
    const body = [
      '',
      'ok-contributors: {"id":"agent-a","name":"Alice","docs":["a"]}',
      'ok-contributors: {"id":"agent-b","name":"Bob","docs":["b","c"]}',
    ].join('\n');
    const result = parseContributors(body);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('agent-a');
    expect(result[1].id).toBe('agent-b');
    expect(result[1].docs).toEqual(['b', 'c']);
  });

  test('parses versioned format (v:1)', () => {
    const body = '\nok-contributors: {"v":1,"id":"agent-x","name":"X","docs":["d"]}';
    const result = parseContributors(body);
    expect(result).toHaveLength(1);
    expect(result[0].v).toBe(1);
  });

  test('parses colorSeed field when present', () => {
    const body =
      '\nok-contributors: {"id":"agent-a","name":"A","colorSeed":"my-seed","docs":["x"]}';
    const result = parseContributors(body);
    expect(result).toHaveLength(1);
    expect(result[0]?.colorSeed).toBe('my-seed');
  });

  test('silently skips malformed JSON', () => {
    const body = '\nok-contributors: {not valid json}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry missing id field', () => {
    const body = '\nok-contributors: {"name":"Claude","docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry missing name field', () => {
    const body = '\nok-contributors: {"id":"agent-a","docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry missing docs field', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A"}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where docs is not an array (type guard)', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A","docs":"not-an-array"}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where id is not a string (type guard)', () => {
    const body = '\nok-contributors: {"id":123,"name":"A","docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where name is not a string (type guard)', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":null,"docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where colorSeed is not a string', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A","colorSeed":123,"docs":["x"]}';
    expect(parseContributors(body)).toEqual([]);
  });

  test('skips entry where docs contains non-string elements', () => {
    const body = '\nok-contributors: {"id":"agent-a","name":"A","docs":["a",1,"b"]}';
    expect(parseContributors(body)).toEqual([]);
  });
});

describe('parseWriterId', () => {
  test('agent-<id> → agent classification', () => {
    const p = parseWriterId('agent-claude-code-7x');
    expect(p.classification).toBe('agent');
    expect(p.isAgent).toBe(true);
    expect(p.id).toBe('agent-claude-code-7x');
  });

  test('human-<id> → human classification', () => {
    const p = parseWriterId('human-tim');
    expect(p.classification).toBe('human');
    expect(p.isAgent).toBe(false);
  });

  test('"upstream" → upstream classification, isAgent null', () => {
    const p = parseWriterId('upstream');
    expect(p.classification).toBe('upstream');
    expect(p.isAgent).toBe(null);
  });

  test('"server" → server classification, isAgent null', () => {
    const p = parseWriterId('server');
    expect(p.classification).toBe('server');
    expect(p.isAgent).toBe(null);
  });

  test('unknown prefix → unknown classification, isAgent null', () => {
    const p = parseWriterId('bot-xyz');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('empty string → unknown', () => {
    const p = parseWriterId('');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('agent- prefix without a suffix → unknown (regex requires non-empty suffix)', () => {
    const p = parseWriterId('agent-');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });

  test('slash in id → unknown (would be a malformed ref)', () => {
    const p = parseWriterId('agent-abc/def');
    expect(p.classification).toBe('unknown');
    expect(p.isAgent).toBe(null);
  });
});

describe('getWipRefPattern', () => {
  test('main branch', () => {
    expect(getWipRefPattern('main')).toBe('refs/wip/main/');
  });
  test('branch with slash', () => {
    expect(getWipRefPattern('feat/exec-mcp')).toBe('refs/wip/feat/exec-mcp/');
  });
});

describe('getShadowRepoPath', () => {
  test('returns null when no shadow repo exists', () => {
    expect(getShadowRepoPath(tmp)).toBe(null);
  });

  test('prefers integrated mode when project has its own .git/', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.git/openknowledge'), { recursive: true });
    writeFileSync(resolve(project, '.git/openknowledge/HEAD'), 'ref: refs/heads/main\n');
    expect(getShadowRepoPath(project)).toBe(resolve(project, '.git/openknowledge'));
  });

  test('falls back to standalone mode when no project .git/ exists', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.openknowledge'), { recursive: true });
    writeFileSync(resolve(project, '.openknowledge/HEAD'), 'ref: refs/heads/main\n');
    expect(getShadowRepoPath(project)).toBe(resolve(project, '.openknowledge'));
  });

  test('prefers integrated over standalone when both exist', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.git/openknowledge'), { recursive: true });
    writeFileSync(resolve(project, '.git/openknowledge/HEAD'), 'ref: refs/heads/main\n');
    mkdirSync(resolve(project, '.openknowledge'), { recursive: true });
    writeFileSync(resolve(project, '.openknowledge/HEAD'), 'ref: refs/heads/main\n');
    expect(getShadowRepoPath(project)).toBe(resolve(project, '.git/openknowledge'));
  });

  test('returns null when .git/openknowledge exists but HEAD is missing', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(resolve(project, '.git/openknowledge'), { recursive: true });
    expect(getShadowRepoPath(project)).toBe(null);
  });

  test('returns null when the shadow dir is a file (not a directory)', () => {
    const project = resolve(tmp, 'project');
    mkdirSync(project, { recursive: true });
    writeFileSync(resolve(project, '.git'), 'not a dir');
    // Neither integrated nor standalone exists
    expect(getShadowRepoPath(project)).toBe(null);
  });
});

describe('parseCheckpoint / formatCheckpointBodyLine (bridge-correctness SPEC §6 R7d)', () => {
  test('round-trips bridge-merge-loss', () => {
    const line = formatCheckpointBodyLine({
      kind: 'bridge-merge-loss',
      metadata: { lostSubstrings: ['a', 'b', 'c'] },
    });
    const body = `checkpoint: X\n\n${line}`;
    const parsed = parseCheckpoint(body);
    expect(parsed?.kind).toBe('bridge-merge-loss');
    if (parsed?.kind === 'bridge-merge-loss') {
      expect(parsed.metadata.lostSubstrings).toEqual(['a', 'b', 'c']);
    }
  });

  test('round-trips external-change-rescue', () => {
    const line = formatCheckpointBodyLine({
      kind: 'external-change-rescue',
      metadata: { incomingDiskSha: 'deadbeef' },
    });
    const body = `checkpoint: Y\n\n${line}`;
    const parsed = parseCheckpoint(body);
    expect(parsed?.kind).toBe('external-change-rescue');
    if (parsed?.kind === 'external-change-rescue') {
      expect(parsed.metadata.incomingDiskSha).toBe('deadbeef');
    }
  });

  test('returns null for empty body', () => {
    expect(parseCheckpoint('')).toBe(null);
  });

  test('returns null for body without the ok-checkpoint-v1 prefix', () => {
    expect(parseCheckpoint('checkpoint: Save Version\n\nok-contributors: {...}')).toBe(null);
  });

  test('returns null for malformed JSON', () => {
    expect(parseCheckpoint('\nok-checkpoint-v1: {not json')).toBe(null);
  });

  test('returns null for unknown kind', () => {
    expect(parseCheckpoint('\nok-checkpoint-v1: {"kind":"something-else","metadata":{}}')).toBe(
      null,
    );
  });

  test('returns null when metadata shape does not match kind', () => {
    // bridge-merge-loss expects lostSubstrings; missing it → null
    expect(
      parseCheckpoint('\nok-checkpoint-v1: {"kind":"bridge-merge-loss","metadata":{"other":"x"}}'),
    ).toBe(null);
  });

  test('parseContributors tolerates sibling ok-checkpoint-v1 lines (Q7)', () => {
    const body = [
      'checkpoint: some label',
      '',
      'ok-contributors: {"id":"human-a","name":"Alice","docs":["a.md"]}',
      'ok-checkpoint-v1: {"kind":"bridge-merge-loss","metadata":{"lostSubstrings":["x"]}}',
      'ok-contributors: {"id":"human-b","name":"Bob","docs":["b.md"]}',
    ].join('\n');

    const contributors = parseContributors(body);
    expect(contributors.map((c) => c.id)).toEqual(['human-a', 'human-b']);

    const checkpoint = parseCheckpoint(body);
    expect(checkpoint?.kind).toBe('bridge-merge-loss');
  });
});
