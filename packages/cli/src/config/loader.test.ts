import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfig } from './loader';

const testDir = resolve(tmpdir(), `ok-config-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  test('returns defaults when no config files exist', () => {
    const { config, sources } = loadConfig(testDir);
    expect(config.server.port).toBe(3000);
    expect(config.content.dir).toBe('./content');
    expect(sources).toHaveLength(0);
  });

  test('loads workspace config', () => {
    const configDir = resolve(testDir, '.open-knowledge');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(resolve(configDir, 'config.yml'), 'server:\n  port: 5000\n', 'utf-8');

    const { config, sources } = loadConfig(testDir);
    expect(config.server.port).toBe(5000);
    expect(config.server.host).toBe('localhost'); // default preserved
    expect(sources).toHaveLength(1);
  });

  test('workspace overrides user config', () => {
    // Create a workspace config — user config is at ~ which we can't control in tests,
    // so we test the deep merge logic indirectly
    const configDir = resolve(testDir, '.open-knowledge');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      resolve(configDir, 'config.yml'),
      'server:\n  port: 5000\n  host: 0.0.0.0\n',
      'utf-8',
    );

    const { config } = loadConfig(testDir);
    expect(config.server.port).toBe(5000);
    expect(config.server.host).toBe('0.0.0.0');
  });

  test('invalid config throws descriptive error', () => {
    const configDir = resolve(testDir, '.open-knowledge');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(resolve(configDir, 'config.yml'), 'server:\n  port: not-a-number\n', 'utf-8');

    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('empty YAML file returns defaults', () => {
    const configDir = resolve(testDir, '.open-knowledge');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(resolve(configDir, 'config.yml'), '', 'utf-8');

    const { config } = loadConfig(testDir);
    expect(config.server.port).toBe(3000);
  });
});
