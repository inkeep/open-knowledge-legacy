import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ALL_EDITOR_IDS, type EditorId } from '../commands/editors.ts';
import {
  type ProjectAiEditorOutcome,
  type ProjectAiIntegrationOutcome,
  type ProjectAiIntegrationsResult,
  writeProjectAiIntegrations,
} from './write-project-ai-integrations.ts';

let tmpRoot: string;
let projectDir: string;

beforeEach(() => {
  tmpRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'ok-write-project-ai-')));
  projectDir = resolve(tmpRoot, 'proj');
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

const outcomeFor = (
  result: ProjectAiIntegrationsResult,
  editorId: EditorId,
): ProjectAiEditorOutcome => {
  const found = result.editorOutcomes.find((o) => o.editorId === editorId);
  if (!found) throw new Error(`expected outcome for ${editorId}, got: ${JSON.stringify(result)}`);
  return found;
};

describe('writeProjectAiIntegrations — happy paths', () => {
  test('writes every editor with a projectConfigPath when ALL_EDITOR_IDS is selected', () => {
    const result = writeProjectAiIntegrations(projectDir, ALL_EDITOR_IDS);

    expect(result.editorOutcomes.map((o) => o.editorId)).toEqual(ALL_EDITOR_IDS);

    expect(outcomeFor(result, 'claude').outcome).toBe('written');
    expect(outcomeFor(result, 'cursor').outcome).toBe('written');
    expect(outcomeFor(result, 'codex').outcome).toBe('written');

    expect(outcomeFor(result, 'claude-desktop').outcome).toBe('skipped-no-project-surface');

    expect(existsSync(join(projectDir, '.mcp.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.codex', 'config.toml'))).toBe(true);
  });

  test('writes only the editors in a subset selection', () => {
    const result = writeProjectAiIntegrations(projectDir, ['cursor', 'codex']);

    expect(result.editorOutcomes).toHaveLength(2);
    expect(outcomeFor(result, 'cursor').outcome).toBe('written');
    expect(outcomeFor(result, 'codex').outcome).toBe('written');

    expect(existsSync(join(projectDir, '.mcp.json'))).toBe(false);
    expect(existsSync(join(projectDir, '.claude'))).toBe(false);
  });

  test('overwrites an existing config and reports outcome "overwritten"', () => {
    const cursorMcp = join(projectDir, '.cursor', 'mcp.json');
    mkdirSync(join(projectDir, '.cursor'), { recursive: true });
    writeFileSync(
      cursorMcp,
      JSON.stringify({ mcpServers: { 'open-knowledge': { command: 'old', args: ['mcp'] } } }),
    );

    const result = writeProjectAiIntegrations(projectDir, ['cursor']);

    expect(outcomeFor(result, 'cursor').outcome).toBe('overwritten');
    const written = JSON.parse(readFileSync(cursorMcp, 'utf-8'));
    expect(written.mcpServers['open-knowledge']).toEqual({
      command: 'npx',
      args: ['-y', '@inkeep/open-knowledge@latest', 'mcp'],
    });
  });

  test('returns an empty editorOutcomes array for an empty selection', () => {
    const result = writeProjectAiIntegrations(projectDir, []);

    expect(result.editorOutcomes).toEqual([]);
    expect(result.claudeLaunchJson).toBeUndefined();
  });

  test('records "skipped-no-project-surface" without an error message', () => {
    const result = writeProjectAiIntegrations(projectDir, ['claude-desktop']);

    const outcome = outcomeFor(result, 'claude-desktop');
    expect(outcome.outcome).toBe('skipped-no-project-surface');
    expect(outcome.error).toBeUndefined();
  });
});

describe('writeProjectAiIntegrations — failure isolation', () => {
  test('one editor failing does not abort the others; result reports per-editor outcomes', () => {
    writeFileSync(join(projectDir, '.cursor'), 'not a directory');

    const result = writeProjectAiIntegrations(projectDir, ['claude', 'cursor', 'codex']);

    expect(outcomeFor(result, 'cursor').outcome).toBe('failed');
    expect(outcomeFor(result, 'cursor').error).toBeDefined();
    expect(outcomeFor(result, 'claude').outcome).toBe('written');
    expect(outcomeFor(result, 'codex').outcome).toBe('written');

    expect(existsSync(join(projectDir, '.mcp.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.codex', 'config.toml'))).toBe(true);
  });

  test('never throws when any editor write hits an unexpected condition', () => {
    writeFileSync(join(projectDir, '.mcp.json'), 'not-json');
    writeFileSync(join(projectDir, '.cursor'), 'block');
    writeFileSync(join(projectDir, '.codex'), 'block');

    let result: ProjectAiIntegrationsResult | undefined;
    expect(() => {
      result = writeProjectAiIntegrations(projectDir, ['claude', 'cursor', 'codex']);
    }).not.toThrow();

    if (!result) throw new Error('result undefined');
    expect(outcomeFor(result, 'claude').outcome).toBe('failed');
    expect(outcomeFor(result, 'cursor').outcome).toBe('failed');
    expect(outcomeFor(result, 'codex').outcome).toBe('failed');
  });
});

describe('writeProjectAiIntegrations — Claude Code launch.json', () => {
  test('selecting "claude" scaffolds .claude/launch.json', () => {
    const result = writeProjectAiIntegrations(projectDir, ['claude']);

    expect(result.claudeLaunchJson).toBeDefined();
    expect(result.claudeLaunchJson?.action).toBe('created');
    expect(result.claudeLaunchJson?.configPath).toBe(join(projectDir, '.claude', 'launch.json'));
    expect(existsSync(join(projectDir, '.claude', 'launch.json'))).toBe(true);

    const launch = JSON.parse(readFileSync(join(projectDir, '.claude', 'launch.json'), 'utf-8'));
    expect(launch.configurations[0].name).toBe('open-knowledge-ui');
  });

  test('NOT selecting "claude" leaves .claude/launch.json absent and result.claudeLaunchJson undefined', () => {
    const result = writeProjectAiIntegrations(projectDir, ['cursor', 'codex']);

    expect(result.claudeLaunchJson).toBeUndefined();
    expect(existsSync(join(projectDir, '.claude'))).toBe(false);
  });

  test('selecting both "claude" and others scaffolds launch.json once and writes all editors', () => {
    const result = writeProjectAiIntegrations(projectDir, ['claude', 'cursor', 'codex']);

    expect(result.claudeLaunchJson?.action).toBe('created');
    expect(outcomeFor(result, 'claude').outcome).toBe('written');
    expect(outcomeFor(result, 'cursor').outcome).toBe('written');
    expect(outcomeFor(result, 'codex').outcome).toBe('written');
  });
});

describe('writeProjectAiIntegrations — does not write project-local skill scaffolds', () => {
  test('no <projectDir>/.claude/skills/ tree is written even when "claude" is selected', () => {
    writeProjectAiIntegrations(projectDir, ['claude']);

    expect(existsSync(join(projectDir, '.claude', 'launch.json'))).toBe(true); // sanity
    expect(existsSync(join(projectDir, '.claude', 'skills'))).toBe(false);
  });

  test('no <projectDir>/.cursor/skills/ tree is written even when "cursor" is selected', () => {
    writeProjectAiIntegrations(projectDir, ['cursor']);

    expect(existsSync(join(projectDir, '.cursor', 'mcp.json'))).toBe(true); // sanity
    expect(existsSync(join(projectDir, '.cursor', 'skills'))).toBe(false);
  });

  test('all-editors-selected: no skill tree under any editor directory', () => {
    writeProjectAiIntegrations(projectDir, ALL_EDITOR_IDS);

    expect(existsSync(join(projectDir, '.claude', 'skills'))).toBe(false);
    expect(existsSync(join(projectDir, '.cursor', 'skills'))).toBe(false);
  });
});

describe('writeProjectAiIntegrations — type contract surface', () => {
  test('outcome enum exhaustively covers the spec contract', () => {
    const all: ProjectAiIntegrationOutcome[] = [
      'written',
      'overwritten',
      'failed',
      'skipped-no-project-surface',
    ];
    expect(all).toHaveLength(4);
  });
});
