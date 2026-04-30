import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectConfigPaths } from './inspect-config-paths.ts';

function makeTempProject(): { cwd: string; home: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'ok-inspect-cwd-'));
  const home = mkdtempSync(join(tmpdir(), 'ok-inspect-home-'));
  mkdirSync(join(cwd, '.open-knowledge'), { recursive: true });
  mkdirSync(join(home, '.open-knowledge'), { recursive: true });
  return { cwd, home };
}

describe('inspectConfigPaths', () => {
  test('returns false/false when neither file exists', () => {
    const { cwd, home } = makeTempProject();
    const result = inspectConfigPaths([['mcp', 'tools', 'search', 'maxResults']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('mcp.tools.search.maxResults')).toEqual({
      user: false,
      workspace: false,
    });
  });

  test('reports `workspace: true` when the path is set in workspace YAML', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(
      join(cwd, '.open-knowledge', 'config.yml'),
      'mcp:\n  tools:\n    search:\n      maxResults: 100\n',
    );
    const result = inspectConfigPaths([['mcp', 'tools', 'search', 'maxResults']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('mcp.tools.search.maxResults')).toEqual({
      user: false,
      workspace: true,
    });
  });

  test('reports `user: true` when the path is set in user YAML', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(join(home, '.open-knowledge', 'config.yml'), 'appearance:\n  theme: dark\n');
    const result = inspectConfigPaths([['appearance', 'theme']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('appearance.theme')).toEqual({
      user: true,
      workspace: false,
    });
  });

  test('reports both true when set in both files', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(
      join(cwd, '.open-knowledge', 'config.yml'),
      'mcp:\n  tools:\n    search:\n      maxResults: 100\n',
    );
    writeFileSync(
      join(home, '.open-knowledge', 'config.yml'),
      'mcp:\n  tools:\n    search:\n      maxResults: 50\n',
    );
    const result = inspectConfigPaths([['mcp', 'tools', 'search', 'maxResults']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('mcp.tools.search.maxResults')).toEqual({
      user: true,
      workspace: true,
    });
  });

  test('handles multiple paths in one call', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(
      join(cwd, '.open-knowledge', 'config.yml'),
      'mcp:\n  tools:\n    search:\n      maxResults: 100\n',
    );
    writeFileSync(join(home, '.open-knowledge', 'config.yml'), 'appearance:\n  theme: dark\n');
    const result = inspectConfigPaths(
      [
        ['mcp', 'tools', 'search', 'maxResults'],
        ['appearance', 'theme'],
        ['nonexistent', 'path'],
      ],
      { cwd, homedirOverride: home },
    );
    expect(result.get('mcp.tools.search.maxResults')).toEqual({
      user: false,
      workspace: true,
    });
    expect(result.get('appearance.theme')).toEqual({
      user: true,
      workspace: false,
    });
    expect(result.get('nonexistent.path')).toEqual({
      user: false,
      workspace: false,
    });
  });

  test('reports false when YAML parses but path traverses through a scalar', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(join(cwd, '.open-knowledge', 'config.yml'), 'mcp:\n  tools: hello\n');
    const result = inspectConfigPaths([['mcp', 'tools', 'search', 'maxResults']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('mcp.tools.search.maxResults')).toEqual({
      user: false,
      workspace: false,
    });
  });

  test('reports false when YAML is malformed (parse error → null tree)', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(join(cwd, '.open-knowledge', 'config.yml'), 'mcp: {[[ broken');
    const result = inspectConfigPaths([['mcp', 'tools', 'search', 'maxResults']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('mcp.tools.search.maxResults')).toEqual({
      user: false,
      workspace: false,
    });
  });

  test('reports true even when leaf value is null (RFC 7396 clear convention)', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(join(cwd, '.open-knowledge', 'config.yml'), 'appearance:\n  theme: null\n');
    const result = inspectConfigPaths([['appearance', 'theme']], {
      cwd,
      homedirOverride: home,
    });
    expect(result.get('appearance.theme')?.workspace).toBe(true);
  });

  test('handles array-leaf folders[]', () => {
    const { cwd, home } = makeTempProject();
    writeFileSync(
      join(cwd, '.open-knowledge', 'config.yml'),
      'folders:\n  - match: specs/**\n    frontmatter:\n      description: Specs\n',
    );
    const result = inspectConfigPaths([['folders']], { cwd, homedirOverride: home });
    expect(result.get('folders')?.workspace).toBe(true);
  });
});
