import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OK_DIR } from '../constants.ts';
import { loadPublishConfig, publishConfigPath } from './publish.ts';

describe('loadPublishConfig', () => {
  let root: string;

  beforeEach(() => {
    root = resolve(
      tmpdir(),
      `ok-publish-config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(root, OK_DIR), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('returns defaults when publish.yml is absent', () => {
    const result = loadPublishConfig(root);

    expect(result.source).toBeNull();
    expect(result.config).toEqual({
      siteTitle: 'Open Knowledge',
      basePath: '',
      outputDir: '.open-knowledge/site',
      exclude: [],
    });
  });

  test('loads workspace publish.yml', () => {
    writeFileSync(
      publishConfigPath(root),
      'siteTitle: Team KB\nbasePath: /kb\noutputDir: public\nexclude:\n  - private/**\n',
    );

    const result = loadPublishConfig(root);

    expect(result.source).toBe(publishConfigPath(root));
    expect(result.config).toEqual({
      siteTitle: 'Team KB',
      basePath: '/kb',
      outputDir: 'public',
      exclude: ['private/**'],
    });
  });

  test('throws a descriptive schema error', () => {
    writeFileSync(publishConfigPath(root), 'exclude: nope\n');

    expect(() => loadPublishConfig(root)).toThrow('exclude');
  });
});
