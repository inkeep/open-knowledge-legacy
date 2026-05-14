import { homedir } from 'node:os';
import { ALL_EDITOR_IDS, EDITOR_TARGETS, type EditorId, type EditorMcpTarget } from './editors.ts';
import { readExistingMcpEntry, writeEditorMcpConfig } from './init.ts';

const CANONICAL_ARGS: readonly string[] = ['-y', '@inkeep/open-knowledge@latest', 'mcp'];

const LEGACY_BARE_ARG_FORMS: ReadonlyArray<readonly string[]> = [
  ['@inkeep/open-knowledge', 'mcp'],
  ['-y', '@inkeep/open-knowledge', 'mcp'],
];

export type McpEntryClassification = 'canonical' | 'legacy-bare' | 'preserved';

export function classifyMcpEntry(entry: Record<string, unknown>): McpEntryClassification {
  if (entry.command !== 'npx' || !Array.isArray(entry.args)) return 'preserved';
  if (argsExactlyMatch(entry.args, CANONICAL_ARGS)) return 'canonical';
  for (const form of LEGACY_BARE_ARG_FORMS) {
    if (argsExactlyMatch(entry.args, form)) return 'legacy-bare';
  }
  return 'preserved';
}

function argsExactlyMatch(actual: readonly unknown[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

export interface RepairOutcome {
  scope: 'user' | 'project';
  editorId: EditorId;
  configPath: string;
  outcome: 'no-entry' | 'canonical' | 'preserved' | 'repaired' | 'write-failed';
  error?: string;
}

export interface RepairResult {
  outcomes: RepairOutcome[];
  repairedCount: number;
}

export interface RepairLogEvent {
  event: string;
  scope: 'user' | 'project';
  editorId: EditorId;
  configPath: string;
  error?: string;
}

export interface RepairContext {
  projectDir: string;
  home?: string;
  logger?: (event: RepairLogEvent) => void;
}

export function repairMcpConfigs(ctx: RepairContext): RepairResult {
  const logger = ctx.logger ?? defaultLogger;
  const home = ctx.home ?? homedir();
  const outcomes: RepairOutcome[] = [];

  for (const editorId of ALL_EDITOR_IDS) {
    const target = EDITOR_TARGETS[editorId];

    const userConfigPath = safeResolvePath(() => target.configPath('', home));
    if (userConfigPath !== null) {
      outcomes.push(
        repairOne({
          scope: 'user',
          editorId,
          target,
          home,
          cwd: '',
          configPath: userConfigPath,
          configPathOverride: undefined,
          logger,
        }),
      );
    }

    if (target.projectConfigPath) {
      const projectPathFn = target.projectConfigPath;
      const projectConfigPath = safeResolvePath(() => projectPathFn(ctx.projectDir));
      if (projectConfigPath !== null) {
        outcomes.push(
          repairOne({
            scope: 'project',
            editorId,
            target,
            home: undefined,
            cwd: ctx.projectDir,
            configPath: projectConfigPath,
            configPathOverride: projectConfigPath,
            logger,
          }),
        );
      }
    }
  }

  const repairedCount = outcomes.filter((o) => o.outcome === 'repaired').length;
  return { outcomes, repairedCount };
}

function safeResolvePath(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

interface RepairOneOptions {
  scope: 'user' | 'project';
  editorId: EditorId;
  target: EditorMcpTarget;
  home: string | undefined;
  cwd: string;
  configPath: string;
  configPathOverride: string | undefined;
  logger: (event: RepairLogEvent) => void;
}

function repairOne(opts: RepairOneOptions): RepairOutcome {
  const base = {
    scope: opts.scope,
    editorId: opts.editorId,
    configPath: opts.configPath,
  } as const;

  const existing = readExistingMcpEntry(opts.target, opts.cwd, opts.home, opts.configPathOverride);

  if (existing === null) {
    return { ...base, outcome: 'no-entry' };
  }

  const classification = classifyMcpEntry(existing);
  if (classification === 'canonical') return { ...base, outcome: 'canonical' };
  if (classification === 'preserved') return { ...base, outcome: 'preserved' };

  const result = writeEditorMcpConfig(
    opts.target,
    opts.cwd,
    { mode: 'published', skipAvailabilityCheck: true },
    opts.home,
    opts.configPathOverride,
  );

  if (result.action === 'failed') {
    const error = result.error ?? 'unknown write failure';
    opts.logger({
      event: 'mcp-config-repair-write-failed',
      scope: opts.scope,
      editorId: opts.editorId,
      configPath: opts.configPath,
      error,
    });
    return { ...base, outcome: 'write-failed', error };
  }

  opts.logger({
    event: 'mcp-config-repair-applied',
    scope: opts.scope,
    editorId: opts.editorId,
    configPath: opts.configPath,
  });
  return { ...base, outcome: 'repaired' };
}

function defaultLogger(event: RepairLogEvent): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}
