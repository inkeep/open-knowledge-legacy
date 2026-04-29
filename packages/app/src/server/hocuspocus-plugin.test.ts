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
  test('no config.yml: defaults admit both .md and .mdx — regression guard for showcase/*.mdx visibility', () => {
    const projectRoot = mkTmp();
    const config = resolveContentConfig(projectRoot);
    expect(config.include).toContain('**/*.md');
    expect(config.include).toContain('**/*.mdx');
    expect(config.exclude).toEqual([]);
    expect(config.dir).toBe(projectRoot);
  });

  test('config.yml present but content.include absent: defaults still admit both', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.open-knowledge'), { recursive: true });
    writeFileSync(join(projectRoot, '.open-knowledge/config.yml'), 'content:\n  dir: .\n', 'utf-8');
    const config = resolveContentConfig(projectRoot);
    expect(config.include).toContain('**/*.md');
    expect(config.include).toContain('**/*.mdx');
  });

  test('config.yml with explicit content.include: replaces defaults verbatim', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.open-knowledge'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.open-knowledge/config.yml'),
      "content:\n  include:\n    - 'docs/**/*.md'\n",
      'utf-8',
    );
    const config = resolveContentConfig(projectRoot);
    expect(config.include).toEqual(['docs/**/*.md']);
  });

  test('config.yml with content.dir: resolves relative to projectRoot', () => {
    const projectRoot = mkTmp();
    mkdirSync(join(projectRoot, '.open-knowledge'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.open-knowledge/config.yml'),
      "content:\n  dir: 'content'\n",
      'utf-8',
    );
    const config = resolveContentConfig(projectRoot);
    expect(config.dir).toBe(join(projectRoot, 'content'));
  });
});
