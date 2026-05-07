import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_PATH = join(__dirname, 'config-provider.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

describe('ConfigProvider module surface', () => {
  test('exports ConfigProvider component and useConfigContext hook', async () => {
    const mod = await import('./config-provider');
    expect(typeof mod.ConfigProvider).toBe('function');
    expect(typeof mod.useConfigContext).toBe('function');
  });

  test('useConfigContext throws when ctx is null (defensive guard for outside-provider use)', () => {
    expect(src).toMatch(/if\s*\(ctx\s*===\s*null\)\s*\{[\s\S]*?throw new Error\(/);
  });
});

describe('ConfigProvider — project-local binding wiring', () => {
  test('imports the project-local doc name constant', () => {
    expect(src).toContain('CONFIG_DOC_NAME_PROJECT_LOCAL');
    expect(src).toMatch(/from\s*'@inkeep\/open-knowledge-core'/);
  });

  test('opens a third binding for the project-local scope', () => {
    expect(src).toMatch(
      /makeBinding\(\s*collabUrl,\s*CONFIG_DOC_NAME_PROJECT_LOCAL,\s*'project-local'/,
    );
  });

  test('makeBinding signature accepts the WriteScope type (covers all three scopes)', () => {
    expect(src).toMatch(/scope:\s*WriteScope/);
  });

  test('subscribes to subscribeSynced on the project-local binding', () => {
    expect(src).toContain('subscribeSynced');
    expect(src).toMatch(/projectLocalScoped\.binding\.subscribeSynced/);
  });

  test('seeds initial synced state from hasSynced() at mount time', () => {
    expect(src).toMatch(/projectLocalScoped\.binding\.hasSynced\(\)/);
  });

  test('cleans up the project-local binding + provider on unmount', () => {
    expect(src).toContain('projectLocalScoped.cleanup()');
    expect(src).toContain('unsubProjectLocalSynced');
  });
});

describe('ConfigProvider — context value shape', () => {
  test('exposes projectLocalBinding alongside the existing two bindings', () => {
    expect(src).toMatch(/projectLocalBinding:\s*projectLocalState\?\.binding\s*\?\?\s*null/);
  });

  test('exposes projectLocalConfig alongside the existing two configs', () => {
    expect(src).toMatch(/projectLocalConfig:\s*projectLocalState\?\.config\s*\?\?\s*null/);
  });

  test('exposes projectLocalSynced with a false default until first sync', () => {
    expect(src).toMatch(/projectLocalSynced:\s*projectLocalState\?\.synced\s*\?\?\s*false/);
  });
});

describe('ConfigProvider — mergeLayered call', () => {
  test('passes three layers to mergeLayered (user, project, projectLocal)', () => {
    expect(src).toMatch(
      /mergeLayered\(\s*userState\.config,\s*projectState\.config,\s*projectLocalState\?\.config\s*\)/,
    );
  });
});
