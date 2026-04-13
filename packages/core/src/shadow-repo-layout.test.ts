import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { getShadowRepoPath, getWipRefPattern, parseWriterId } from './shadow-repo-layout.ts';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(resolve(tmpdir(), 'ok-shadow-layout-test-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
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
