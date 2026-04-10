import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfig } from './loader';

let testDir: string;

beforeEach(() => {
  testDir = resolve(
    tmpdir(),
    `ok-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Helper: write a workspace config.yml inside testDir */
function writeWorkspaceConfig(yaml: string) {
  const configDir = resolve(testDir, '.open-knowledge');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(resolve(configDir, 'config.yml'), yaml, 'utf-8');
}

describe('loadConfig', () => {
  // ── Defaults ────────────────────────────────────────────────────────

  test('no config files → all defaults resolve', () => {
    const { config, sources } = loadConfig(testDir);

    // sources
    expect(sources).toHaveLength(0);

    // content
    expect(config.content.dir).toBe('./content');

    // server
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe('localhost');

    // persistence
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.persistence.maxDebounceMs).toBe(10000);

    // wiki roots
    expect(config.wiki.roots).toHaveLength(3);
    expect(config.wiki.roots[0]).toEqual({ path: './articles', label: 'Knowledge Articles' });
    expect(config.wiki.roots[1]).toEqual({ path: './external-sources', label: 'External Sources' });
    expect(config.wiki.roots[2]).toEqual({ path: './research', label: 'Research' });

    // wiki globs
    expect(config.wiki.include).toEqual(['**/*.md']);
    expect(config.wiki.exclude).toEqual([]);
  });

  test('empty YAML file → all defaults resolve', () => {
    writeWorkspaceConfig('');
    const { config } = loadConfig(testDir);

    expect(config.server.port).toBe(3000);
    expect(config.content.dir).toBe('./content');
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.wiki.roots).toHaveLength(3);
  });

  test('comments-only YAML (scaffolded config) → all defaults resolve', () => {
    writeWorkspaceConfig(`
# This is a fully commented config
# content:
#   dir: ./content
# server:
#   port: 3000
# persistence:
#   debounceMs: 2000
`);
    const { config, sources } = loadConfig(testDir);

    // Comments-only YAML parses to null, so no source is recorded
    expect(sources).toHaveLength(0);
    expect(config.server.port).toBe(3000);
    expect(config.content.dir).toBe('./content');
  });

  // ── Workspace overrides ─────────────────────────────────────────────

  test('workspace config overrides a single field, other defaults preserved', () => {
    writeWorkspaceConfig('server:\n  port: 5000\n');

    const { config, sources } = loadConfig(testDir);

    expect(sources).toHaveLength(1);
    expect(config.server.port).toBe(5000);
    // sibling default preserved
    expect(config.server.host).toBe('localhost');
    // other sections untouched
    expect(config.content.dir).toBe('./content');
    expect(config.persistence.debounceMs).toBe(2000);
    expect(config.wiki.roots).toHaveLength(3);
  });

  test('workspace config overrides multiple sections at once', () => {
    writeWorkspaceConfig(`
content:
  dir: ./docs
server:
  port: 8080
  host: 0.0.0.0
persistence:
  debounceMs: 5000
`);
    const { config } = loadConfig(testDir);

    expect(config.content.dir).toBe('./docs');
    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.persistence.debounceMs).toBe(5000);
    // sibling default preserved within section
    expect(config.persistence.maxDebounceMs).toBe(10000);
  });

  test('custom wiki roots replace defaults entirely', () => {
    writeWorkspaceConfig(`
wiki:
  roots:
    - path: ./eng-research
      label: Engineering Research
    - path: ./product-research
      label: Product Research
`);
    const { config } = loadConfig(testDir);

    expect(config.wiki.roots).toHaveLength(2);
    expect(config.wiki.roots[0]).toEqual({
      path: './eng-research',
      label: 'Engineering Research',
    });
    expect(config.wiki.roots[1]).toEqual({
      path: './product-research',
      label: 'Product Research',
    });
    // globs still default
    expect(config.wiki.include).toEqual(['**/*.md']);
    expect(config.wiki.exclude).toEqual([]);
  });

  test('custom include/exclude globs', () => {
    writeWorkspaceConfig(`
wiki:
  include:
    - "**/*.md"
    - "**/*.mdx"
  exclude:
    - "**/drafts/**"
`);
    const { config } = loadConfig(testDir);

    expect(config.wiki.include).toEqual(['**/*.md', '**/*.mdx']);
    expect(config.wiki.exclude).toEqual(['**/drafts/**']);
  });

  test('partial section override preserves sibling defaults within that section', () => {
    writeWorkspaceConfig('persistence:\n  maxDebounceMs: 30000\n');

    const { config } = loadConfig(testDir);

    expect(config.persistence.maxDebounceMs).toBe(30000);
    expect(config.persistence.debounceMs).toBe(2000); // sibling preserved
  });

  // ── Validation ──────────────────────────────────────────────────────

  test('invalid value type throws descriptive error', () => {
    writeWorkspaceConfig('server:\n  port: not-a-number\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('port out of range throws', () => {
    writeWorkspaceConfig('server:\n  port: 99999\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('negative persistence value throws', () => {
    writeWorkspaceConfig('persistence:\n  debounceMs: -1\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  test('empty roots array throws', () => {
    writeWorkspaceConfig('wiki:\n  roots: []\n');
    expect(() => loadConfig(testDir)).toThrow('Invalid configuration');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  test('unknown top-level keys are silently ignored (forward-compat)', () => {
    writeWorkspaceConfig('future_feature:\n  enabled: true\n');
    const { config } = loadConfig(testDir);

    // Still resolves defaults — no crash
    expect(config.server.port).toBe(3000);
  });

  test('unknown nested keys within known sections are silently ignored', () => {
    writeWorkspaceConfig('server:\n  port: 4000\n  unknownKey: hello\n');
    const { config } = loadConfig(testDir);

    expect(config.server.port).toBe(4000);
  });

  test('malformed YAML does not crash — returns defaults', () => {
    writeWorkspaceConfig('server:\n  port: [invalid yaml');
    // Malformed YAML is caught by the loader and warned, falls back to defaults
    const { config } = loadConfig(testDir);
    expect(config.server.port).toBe(3000);
  });
});
