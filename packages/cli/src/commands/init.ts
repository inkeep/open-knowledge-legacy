/**
 * `open-knowledge init` — one-shot terminal setup command.
 *
 * Does two things:
 *   1. Scaffolds `.ok/` in the current directory via initContent()
 *      (same logic the MCP server's init flow used to call — now factored out).
 *   2. Writes Open Knowledge MCP server entries into every detected editor's
 *      config file. The CLI owns the `open-knowledge` / `open-knowledge-ui`
 *      entries and rewrites them to the current defaults on every run.
 *
 * Supports Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, and Codex.
 * Missing editor config roots are skipped so init does not create new user-home
 * directories for tools that are not installed.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type {
  InstallUserSkillOptions,
  InstallUserSkillResult,
} from '@inkeep/open-knowledge-server';
import {
  detectClaudeDesktopPresence,
  ensureProjectGit,
  installUserSkill,
  MCP_SERVER_NAME,
  ProjectGitInitError,
  resolveBundledSkillDir,
} from '@inkeep/open-knowledge-server';
import checkbox from '@inquirer/checkbox';
import { Command, Option } from 'commander';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { OK_DIR } from '../constants.ts';
import { initContent } from '../content/init.ts';
import { formatPreviewBlock, type PreviewResult } from '../content/preview.ts';
import { accent, error, info, success, warning } from '../ui/colors.ts';
import { isObject } from '../utils/is-object.ts';
import {
  ALL_EDITOR_IDS,
  EDITOR_TARGETS,
  type EditorId,
  type EditorMcpTarget,
  type McpInstallOptions,
  resolveDevCliDistPath,
  resolveEditorTargets,
} from './editors.ts';

function readJsonConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (isObject(parsed)) {
      return parsed;
    }
    throw new Error(`${path} root must be a JSON object`);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`${path} contains invalid JSON: ${err.message}`);
    }
    throw err;
  }
}

function readTomlConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = parseToml(trimmed);
    if (isObject(parsed)) {
      return parsed;
    }
    throw new Error(`${path} root must be a TOML table`);
  } catch (err) {
    throw new Error(
      `${path} contains invalid TOML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function writeJsonConfig(path: string, config: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path, serialized, 'utf-8');
}

function writeTomlConfig(path: string, config: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = stringifyToml(config);
  writeFileSync(path, serialized.endsWith('\n') ? serialized : `${serialized}\n`, 'utf-8');
}

type McpScope = 'user' | 'project' | 'both';

const writesUser = (s: McpScope) => s !== 'project';
const writesProject = (s: McpScope) => s !== 'user';

async function promptMcpScope(): Promise<McpScope | null> {
  const choices = await checkbox({
    message: 'Where should the MCP server be configured?\n',
    required: false,
    theme: {
      icon: {
        checked: '[x]',
        unchecked: '[ ]',
      },
    },
    choices: [
      {
        name: 'User-level  (~/.claude.json, ~/.cursor/mcp.json, …)',
        value: 'user' as const,
        checked: true,
      },
      {
        name: 'Project-level  (.mcp.json, .cursor/mcp.json, …)',
        value: 'project' as const,
        checked: true,
      },
    ],
  });

  if (choices.includes('user') && choices.includes('project')) return 'both';
  if (choices.includes('user')) return 'user';
  if (choices.includes('project')) return 'project';
  return null; // neither selected → skip MCP (equivalent to --no-mcp)
}

export async function resolveMcpScope(opts: {
  scope?: McpScope;
  mcp?: boolean;
  isTTY?: boolean;
  promptFn?: () => Promise<McpScope | null>;
}): Promise<McpScope | null> {
  if (opts.mcp === false) return null; // sentinel — --no-mcp short-circuits before this scope is read
  if (opts.scope) return opts.scope;
  const tty = opts.isTTY ?? process.stdout.isTTY;
  if (!tty) return 'both';
  const prompt = opts.promptFn ?? promptMcpScope;
  return prompt();
}

export interface EditorMcpResult {
  editorId: EditorId;
  label: string;
  action: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
  configPath: string;
  serverName: string;
  error?: string;
  configScope?: 'project';
}

interface ProjectConfigResult {
  editorId: EditorId;
  label: string;
  path: string;
}

interface ProjectSkillResult {
  editorId: EditorId;
  label: string;
  action: 'written' | 'overwritten' | 'skipped-unsupported' | 'failed';
  path: string;
  error?: string;
}

interface InitCommandOptions {
  cwd?: string;
  mcp?: boolean;
  devMcp?: boolean;
  editors?: EditorId[];
  home?: string;
  installUserSkill?: (opts?: InstallUserSkillOptions) => Promise<InstallUserSkillResult>;
  scope?: McpScope;
  isTTY?: boolean;
  promptFn?: () => Promise<McpScope | null>;
}

interface InitCommandResult {
  contentCreated: string[];
  contentUpdated: string[];
  contentSkipped: string[];
  editors: EditorMcpResult[];
  legacyProjectConfigs: ProjectConfigResult[];
  projectSkills: ProjectSkillResult[];
  skillInstall?: InstallUserSkillResult;
  preview?: PreviewResult;
  launchJson?: LaunchJsonResult;
  didGitInit: boolean;
  claudeDesktopDetected: boolean;
  mcpAction: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
  mcpPath: string;
  mcpError?: string;
  previewWarning?: string;
  projectScopeUnsupportedLabels?: string[];
}

const LAUNCH_JSON_VERSION = '0.0.1';
const LAUNCH_CONFIG_NAME = 'open-knowledge-ui';

type LaunchJsonAction = 'created' | 'merged' | 'failed';

interface LaunchJsonResult {
  action: LaunchJsonAction;
  configPath: string;
  error?: string;
}

function scaffoldLaunchJson(cwd: string, installOptions: McpInstallOptions = {}): LaunchJsonResult {
  const configPath = join(cwd, '.claude', 'launch.json');
  const entry: {
    name: string;
    runtimeExecutable: string;
    runtimeArgs: string[];
    port: number;
  } =
    installOptions.mode === 'dev'
      ? {
          name: LAUNCH_CONFIG_NAME,
          runtimeExecutable: 'node',
          runtimeArgs: [resolveDevCliDistPath(), 'ui'],
          port: 3000,
        }
      : {
          name: LAUNCH_CONFIG_NAME,
          runtimeExecutable: 'npx',
          runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
          port: 3000,
        };

  try {
    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true });
      const content = { version: LAUNCH_JSON_VERSION, configurations: [entry] };
      writeFileSync(configPath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
      return { action: 'created', configPath };
    }

    const raw = readFileSync(configPath, 'utf-8').trim();
    const parsed = raw ? JSON.parse(raw) : {};
    if (!isObject(parsed)) {
      return { action: 'failed', configPath, error: 'launch.json root is not an object' };
    }

    const configs: unknown[] = Array.isArray(parsed.configurations) ? parsed.configurations : [];
    const existingIdx = configs.findIndex(
      (c) => isObject(c) && (c as Record<string, unknown>).name === LAUNCH_CONFIG_NAME,
    );

    if (existingIdx >= 0) {
      configs[existingIdx] = entry;
    } else {
      configs.push(entry);
    }

    const updated = {
      ...parsed,
      version: parsed.version ?? LAUNCH_JSON_VERSION,
      configurations: configs,
    };
    writeFileSync(configPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8');
    return { action: existingIdx >= 0 ? 'merged' : 'created', configPath };
  } catch (err) {
    return {
      action: 'failed',
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isEditorTargetAvailable(target: EditorMcpTarget, cwd: string, home?: string): boolean {
  try {
    const probePath = target.detectPath?.(cwd, home) ?? dirname(target.configPath(cwd, home));
    return existsSync(probePath);
  } catch {
    return false;
  }
}

export function writeEditorMcpConfig(
  target: EditorMcpTarget,
  cwd: string,
  installOptions: McpInstallOptions,
  home?: string,
  configPathOverride?: string,
): EditorMcpResult {
  const serverName = target.serverName(cwd);
  let configPath: string;
  try {
    configPath = configPathOverride ?? target.configPath(cwd, home);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath: '',
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (
    !configPathOverride &&
    !installOptions.skipAvailabilityCheck &&
    !isEditorTargetAvailable(target, cwd, home)
  ) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'skipped-missing',
      configPath,
      serverName,
    };
  }

  let config: Record<string, unknown>;
  try {
    config = target.format === 'toml' ? readTomlConfig(configPath) : readJsonConfig(configPath);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const servers = (config[target.topLevelKey] as Record<string, unknown> | undefined) ?? {};
  const existing = servers[serverName];
  let targetEntry: Record<string, unknown>;

  try {
    targetEntry = target.buildEntry(cwd, installOptions);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const nextConfig: Record<string, unknown> = {
    ...config,
    [target.topLevelKey]: {
      ...servers,
      [serverName]: targetEntry,
    },
  };

  try {
    if (target.format === 'toml') {
      writeTomlConfig(configPath, nextConfig);
    } else {
      writeJsonConfig(configPath, nextConfig);
    }
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    editorId: target.id,
    label: target.label,
    action: existing !== undefined ? 'overwritten' : 'written',
    configPath,
    serverName,
    ...(configPathOverride !== undefined ? { configScope: 'project' as const } : {}),
  };
}

function writeProjectSkill(target: EditorMcpTarget, cwd: string): ProjectSkillResult {
  const skillPath = target.projectSkillPath?.(cwd);
  if (!skillPath) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'skipped-unsupported',
      path: '',
    };
  }

  try {
    const sourceDir = resolveBundledSkillDir();
    const targetDir = dirname(skillPath);
    const action = existsSync(skillPath) ? 'overwritten' : 'written';
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(dirname(targetDir), { recursive: true });
    cpSync(sourceDir, targetDir, { recursive: true });
    return {
      editorId: target.id,
      label: target.label,
      action,
      path: skillPath,
    };
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      path: skillPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function collectProjectConfig(
  target: EditorMcpTarget,
  cwd: string,
): ProjectConfigResult | undefined {
  const projectPath = target.projectConfigPath?.(cwd);
  if (!projectPath || !existsSync(projectPath)) return undefined;
  return {
    editorId: target.id,
    label: target.label,
    path: projectPath,
  };
}

export interface UserMcpConfigsOptions {
  editors: EditorId[];
  cliPath?: string;
  home?: string;
}

export async function writeUserMcpConfigs(opts: UserMcpConfigsOptions): Promise<EditorMcpResult[]> {
  const targets = resolveEditorTargets(opts.editors);
  const installOptions: McpInstallOptions = {
    mode: 'published',
    cliPath: opts.cliPath,
    skipAvailabilityCheck: true,
  };
  return targets.map((target) => writeEditorMcpConfig(target, '', installOptions, opts.home));
}

export function readExistingMcpEntry(
  target: EditorMcpTarget,
  cwd: string,
  home?: string,
): Record<string, unknown> | null {
  let configPath: string;
  try {
    configPath = target.configPath(cwd, home);
  } catch {
    return null;
  }
  let config: Record<string, unknown>;
  try {
    config = target.format === 'toml' ? readTomlConfig(configPath) : readJsonConfig(configPath);
  } catch {
    return null;
  }
  const servers = config[target.topLevelKey];
  if (!isObject(servers)) return null;
  const existing = servers[target.serverName(cwd)];
  if (!isObject(existing)) return null;
  return existing;
}

export async function runInit(options: InitCommandOptions = {}): Promise<InitCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const installOptions: McpInstallOptions = {
    mode: options.devMcp ? 'dev' : 'published',
  };

  const gitResult = await ensureProjectGit(cwd);

  let contentResult: ReturnType<typeof initContent>;
  try {
    contentResult = initContent(cwd);
  } catch (err) {
    const fallbackPath = EDITOR_TARGETS.claude.configPath(cwd, options.home);
    return {
      contentCreated: [],
      contentUpdated: [],
      contentSkipped: [],
      editors: [],
      projectSkills: [],
      legacyProjectConfigs: [],
      didGitInit: gitResult.didInit,
      claudeDesktopDetected: false,
      mcpAction: 'failed',
      mcpPath: fallbackPath,
      mcpError: `Content scaffolding failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const scope = await resolveMcpScope({
    scope: options.scope,
    mcp: options.mcp,
    isTTY: options.isTTY,
    promptFn: options.promptFn,
  });

  const userEditorIds = options.editors ?? detectInstalledEditors(cwd, options.home);
  const projectEditorIds =
    options.editors ??
    ALL_EDITOR_IDS.filter((id) => EDITOR_TARGETS[id].projectConfigPath !== undefined);
  const userTargets = resolveEditorTargets(userEditorIds as EditorId[]);
  const projectTargets = resolveEditorTargets(projectEditorIds as EditorId[]);
  const skipMcp = options.mcp === false || scope === null;
  const selectedTargets = Array.from(
    new Map(
      [...userTargets, ...(skipMcp ? [] : projectTargets)].map((target) => [target.id, target]),
    ).values(),
  );
  const availableTargets = userTargets.filter((target) =>
    isEditorTargetAvailable(target, cwd, options.home),
  );

  const editorResults: EditorMcpResult[] = [];
  const projectSkillResults: ProjectSkillResult[] = [];
  const writtenProjectPaths = new Set<string>();

  for (const target of selectedTargets) {
    if (skipMcp) {
      let configPath = '';
      try {
        configPath = target.configPath(cwd, options.home);
      } catch {}
      editorResults.push({
        editorId: target.id,
        label: target.label,
        action: 'skipped-flag',
        configPath,
        serverName: target.serverName(cwd),
      });
      continue;
    }

    if (writesUser(scope) && userTargets.includes(target)) {
      editorResults.push(writeEditorMcpConfig(target, cwd, installOptions, options.home));
    }
    if (writesProject(scope) && projectTargets.includes(target) && target.projectConfigPath) {
      const projPath = target.projectConfigPath(cwd);
      const projResult = writeEditorMcpConfig(target, cwd, installOptions, options.home, projPath);
      editorResults.push(projResult);
      if (projResult.action === 'written' || projResult.action === 'overwritten') {
        writtenProjectPaths.add(projPath);
        projectSkillResults.push(writeProjectSkill(target, cwd));
      }
    }
  }

  const projectScopeUnsupportedLabels =
    !skipMcp && scope !== null && writesProject(scope)
      ? projectTargets.filter((t) => !t.projectConfigPath).map((t) => t.label)
      : undefined;

  const legacyProjectConfigs = skipMcp
    ? []
    : availableTargets
        .map((target) => collectProjectConfig(target, cwd))
        .filter((result): result is ProjectConfigResult => result !== undefined)
        .filter((result) => !writtenProjectPaths.has(result.path));

  const hasClaude = availableTargets.some((target) => target.id === 'claude');
  const launchJson = hasClaude && !skipMcp ? scaffoldLaunchJson(cwd, installOptions) : undefined;

  const installSkill = options.installUserSkill ?? installUserSkill;
  const skillInstall = await installSkill({ home: options.home });

  const claudeDesktopDetected = detectClaudeDesktopPresence({ home: options.home });

  const defaultAction: EditorMcpResult['action'] = skipMcp ? 'skipped-flag' : 'skipped-missing';
  const primary = editorResults.find((r) => r.editorId === 'claude') ??
    editorResults[0] ?? {
      action: defaultAction,
      configPath: EDITOR_TARGETS.claude.configPath(cwd, options.home),
    };

  return {
    contentCreated: contentResult.created,
    contentUpdated: contentResult.updated,
    contentSkipped: contentResult.skipped,
    editors: editorResults,
    projectSkills: projectSkillResults,
    legacyProjectConfigs,
    launchJson,
    skillInstall,
    didGitInit: gitResult.didInit,
    claudeDesktopDetected,
    mcpAction: primary.action,
    mcpPath: primary.configPath,
    mcpError: 'error' in primary ? (primary as EditorMcpResult).error : undefined,
    projectScopeUnsupportedLabels,
  };
}

export function formatInitResult(result: InitCommandResult, cwd: string): string {
  const lines: string[] = [];
  const anyWritten = result.editors.some(
    (e) => e.action === 'written' || e.action === 'overwritten',
  );
  const anyFailed =
    result.editors.some((e) => e.action === 'failed') ||
    result.projectSkills.some((skill) => skill.action === 'failed');
  const allSkippedFlag =
    result.editors.length > 0 && result.editors.every((e) => e.action === 'skipped-flag');
  const allSkippedMissing =
    result.editors.length > 0 && result.editors.every((e) => e.action === 'skipped-missing');
  const formatLaunchJsonSummary = (launchJson: LaunchJsonResult): string => {
    const displayPath = launchJson.configPath.startsWith(cwd)
      ? relative(cwd, launchJson.configPath)
      : launchJson.configPath;
    switch (launchJson.action) {
      case 'created':
        return `    app preview server   ${displayPath}  configured for Claude Code Desktop embedded browser`;
      case 'merged':
        return `    app preview server   ${displayPath}  updated for Claude Code Desktop embedded browser`;
      case 'failed':
        return `    app preview server   ${displayPath}  FAILED: ${launchJson.error}`;
    }
  };

  if (result.didGitInit) {
    lines.push(`Initialized git repo at ${cwd}/.git/ (default branch: main)`);
  }

  const okDir = join(cwd, OK_DIR);
  if (result.contentCreated.length > 0 || result.contentUpdated.length > 0) {
    lines.push(accent(`Content scaffolded at ${okDir}/`));
    if (result.contentCreated.length > 0) {
      lines.push(`  Created: ${result.contentCreated.join(', ')}`);
    }
    if (result.contentUpdated.length > 0) {
      lines.push(`  Updated: ${result.contentUpdated.join(', ')}`);
    }
  } else {
    lines.push(accent(`Content already present at ${okDir}/`));
  }
  if (result.contentSkipped.length > 0) {
    lines.push(`  Skipped (already exist): ${result.contentSkipped.join(', ')}`);
  }

  lines.push('');

  if (result.mcpError && result.editors.length === 0) {
    lines.push(`Warning: ${result.mcpError}`);
  } else if (result.editors.length === 0) {
    lines.push(accent('MCP server configuration:'));
    if (result.mcpAction === 'skipped-flag') {
      lines.push('  MCP config not written — use without --no-mcp to configure editors');
    } else if (
      result.projectScopeUnsupportedLabels &&
      result.projectScopeUnsupportedLabels.length > 0
    ) {
      const names = result.projectScopeUnsupportedLabels.join(', ');
      const verb = result.projectScopeUnsupportedLabels.length === 1 ? 'does' : 'do';
      lines.push(`  ${names} ${verb} not support project-level config; skipped`);
    } else {
      lines.push('  No supported editor config directories detected; skipped MCP registration');
    }
  } else if (allSkippedFlag) {
    lines.push('MCP config not written — use without --no-mcp to configure editors');
  } else if (allSkippedMissing) {
    lines.push(accent('MCP server configuration:'));
    lines.push('  No supported editor config directories detected; skipped MCP registration');
  } else {
    lines.push(accent('MCP server configuration:'));
    for (const editor of result.editors) {
      const displayPath = editor.configPath.startsWith(cwd)
        ? relative(cwd, editor.configPath)
        : editor.configPath.replace(/^\/Users\/[^/]+/, '~');
      const serverNameNote = editor.serverName === MCP_SERVER_NAME ? '' : ` (${editor.serverName})`;
      const scopeTag = editor.configScope === 'project' ? ' (project)' : '';
      const labelWithScope = `${editor.label}${scopeTag}`;
      const pad = ' '.repeat(Math.max(1, 20 - labelWithScope.length));
      const restartHint =
        editor.editorId === 'claude-desktop' &&
        (editor.action === 'written' || editor.action === 'overwritten')
          ? ' — quit and relaunch Claude Desktop to activate'
          : '';
      switch (editor.action) {
        case 'written':
          lines.push(
            `  ${labelWithScope}${pad}${displayPath}  ${success('registered')}${serverNameNote}${restartHint}`,
          );
          break;
        case 'overwritten':
          lines.push(
            `  ${labelWithScope}${pad}${displayPath}  ${success('updated')}${serverNameNote}${restartHint}`,
          );
          break;
        case 'skipped-missing':
          lines.push(`  ${labelWithScope}${pad}${displayPath}  config root missing; skipped`);
          break;
        case 'failed':
          lines.push(
            `  ${labelWithScope}${pad}${displayPath}  ${error('FAILED')}: ${editor.error}`,
          );
          break;
        case 'skipped-flag':
          break;
      }
      if (editor.editorId === 'claude' && result.launchJson) {
        lines.push(formatLaunchJsonSummary(result.launchJson));
      }
    }
    if (result.projectScopeUnsupportedLabels && result.projectScopeUnsupportedLabels.length > 0) {
      const names = result.projectScopeUnsupportedLabels.join(', ');
      const verb = result.projectScopeUnsupportedLabels.length === 1 ? 'does' : 'do';
      lines.push(`  ${names} ${verb} not support project-level config; skipped`);
    }
  }

  if (result.projectSkills.length > 0) {
    lines.push('');
    lines.push(accent('Project-local skills:'));
    for (const skill of result.projectSkills) {
      const label = `${skill.label} (project)`;
      const pad = ' '.repeat(Math.max(1, 20 - label.length));
      const displayPath = skill.path ? relative(cwd, skill.path) : '';
      switch (skill.action) {
        case 'written':
          lines.push(`  ${label}${pad}${displayPath}  ${success('installed')}`);
          break;
        case 'overwritten':
          lines.push(`  ${label}${pad}${displayPath}  ${success('updated')}`);
          break;
        case 'skipped-unsupported':
          lines.push(`  ${label}${pad}no known project skill surface; skipped`);
          break;
        case 'failed':
          lines.push(`  ${label}${pad}${displayPath}  ${error('FAILED')}: ${skill.error}`);
          break;
      }
    }
  }

  if (anyFailed) {
    lines.push('');
    lines.push('For failed editors, add the MCP server entry or project skill manually. See:');
    lines.push('  https://github.com/inkeep/open-knowledge#mcp-setup');
  }

  if (result.legacyProjectConfigs.length > 0) {
    lines.push('');
    lines.push('Project MCP configs found:');
    for (const proj of result.legacyProjectConfigs) {
      lines.push(`  ${proj.label}  ${relative(cwd, proj.path)}`);
    }
    lines.push(
      '  These project-local files may override the global config. Remove them if you want fully user-scoped MCP setup in this project.',
    );
  }

  if (result.skillInstall) {
    lines.push('');
    lines.push(accent('User-global skill:'));
    switch (result.skillInstall) {
      case 'installed':
        lines.push(
          `  open-knowledge  ${success('installed to detected agent hosts')} via \`npx skills\``,
        );
        break;
      case 'skip-current':
        lines.push(`  open-knowledge  ${success('already installed at current version')}`);
        break;
      case 'failed':
        lines.push(
          `  ${warning('open-knowledge  install failed — MCP still configured; run manually:')}`,
        );
        lines.push(
          `  ${warning("  npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy")}`,
        );
        break;
    }
  }

  if (result.claudeDesktopDetected) {
    lines.push('');
    lines.push(
      `Claude Desktop App detected. To enable in Claude Chat & Cowork, run: ${accent('ok install-skill')}`,
    );
  }

  if (result.preview) {
    lines.push('');
    lines.push(formatPreviewBlock(result.preview, cwd));
  } else if (result.previewWarning) {
    lines.push('');
    lines.push(`Content preview unavailable: ${result.previewWarning}`);
  }

  if (anyWritten) {
    const seen = new Set<EditorId>();
    const configuredLabels = result.editors
      .filter((e) => e.action === 'written' || e.action === 'overwritten')
      .filter((e) => !seen.has(e.editorId) && seen.add(e.editorId))
      .map((e) => e.label);

    lines.push('');
    lines.push(`${success('✓')} ${accent('Next steps:')}`);
    lines.push(`  1. Open your editor (${info(configuredLabels.join(' / '))})`);
    lines.push('  2. Approve the MCP server when prompted');
    lines.push('  3. (Optional) scaffold the starter knowledge-base structure:');
    lines.push(`     - ${info('ok seed')}`);
    lines.push('  4. Use the three MCP workflow tools as you build the wiki:');
    lines.push(`     - ${info('mcp__open-knowledge__ingest')}      — capture an external source`);
    lines.push(
      `     - ${info('mcp__open-knowledge__research')}    — gather sources and write findings`,
    );
    lines.push(
      `     - ${info('mcp__open-knowledge__consolidate')} — promote research to canonical articles`,
    );
  }

  return lines.join('\n');
}

export function detectInstalledEditors(cwd: string, home?: string): EditorId[] {
  const detected: EditorId[] = [];
  for (const id of ALL_EDITOR_IDS) {
    if (isEditorTargetAvailable(EDITOR_TARGETS[id], cwd, home)) {
      detected.push(id);
    }
  }
  return detected;
}

export function initCommand(): Command {
  return new Command('init')
    .description(
      `Scaffold ${OK_DIR}/ in the current directory and register the MCP server for your editor(s)`,
    )
    .option('--mcp', 'Register the MCP server for selected editors (default: true)', true)
    .option('--no-mcp', `Scaffold the ${OK_DIR}/ directory but do not touch MCP config`)
    .option(
      '--dev-mcp',
      'Register a local dev MCP entry using node + packages/cli/dist/cli.mjs with debug logging',
    )
    .addOption(
      new Option(
        '--scope <scope>',
        'Write MCP config at user level, project level, or both',
      ).choices(['user', 'project', 'both']),
    )
    .action(async (opts: { mcp?: boolean; devMcp?: boolean; scope?: McpScope }) => {
      const cwd = process.cwd();

      let result: InitCommandResult;
      try {
        result = await runInit({
          cwd,
          mcp: opts.mcp,
          devMcp: opts.devMcp,
          scope: opts.scope,
        });
      } catch (err) {
        if (err instanceof ProjectGitInitError) {
          process.stderr.write(
            "open-knowledge requires git to initialize a parent repo. Install git or run 'git init' yourself, then re-run.\n",
          );
          if (err.stderr) process.stderr.write(`${err.stderr.trim()}\n`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      try {
        const { previewContent } = await import('../content/preview.ts');
        const { loadConfig } = await import('../config/loader.ts');
        const { resolveContentDir } = await import('@inkeep/open-knowledge-server');
        const { config } = loadConfig(cwd);
        const contentDir = resolveContentDir(config, cwd);
        result.preview = previewContent({
          projectDir: cwd,
          contentDir,
        });
      } catch (e) {
        result.previewWarning = e instanceof Error ? e.message : String(e);
      }

      process.stdout.write(`${formatInitResult(result, cwd)}\n`);

      if (result.editors.some((e) => e.action === 'failed') || result.mcpAction === 'failed') {
        process.exitCode = 1;
      }
    });
}
