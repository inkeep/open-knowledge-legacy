import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveContentConfig } from './hocuspocus-plugin.ts';

const createdDirs: string[] = [];

function mkTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-hocuspocus-plugin-'));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveContentConfig', () => {
  test('no config.yml: defaults to projectRoot', () => {
    const projectRoot = mkTmp();
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(projectRoot);
  });

  test('config.yml without content.dir: defaults to projectRoot', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.ok'), { recursive: true });
    writeFileSync(join(projectRoot, '.ok/config.yml'), 'server:\n  host: 0.0.0.0\n', 'utf-8');
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(projectRoot);
  });

  test('config.yml with content.dir: resolves relative to projectRoot', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.ok'), { recursive: true });
    writeFileSync(join(projectRoot, '.ok/config.yml'), "content:\n  dir: 'content'\n", 'utf-8');
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(join(projectRoot, 'content'));
  });
});
