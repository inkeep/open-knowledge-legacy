import { EDITOR_TARGETS, type EditorId, type McpInstallOptions } from '../commands/editors.ts';
import {
  type EditorMcpResult,
  type LaunchJsonResult,
  scaffoldLaunchJson,
  writeEditorMcpConfig,
} from '../commands/init.ts';

export type ProjectAiIntegrationOutcome =
  | 'written'
  | 'overwritten'
  | 'failed'
  | 'skipped-no-project-surface';

export interface ProjectAiEditorOutcome {
  readonly editorId: EditorId;
  readonly outcome: ProjectAiIntegrationOutcome;
  readonly error?: string;
}

export interface ProjectAiIntegrationsResult {
  readonly editorOutcomes: ProjectAiEditorOutcome[];
  /** Result of `<projectDir>/.claude/launch.json` scaffolding; present iff
   * `'claude'` was in `selectedEditorIds`. */
  readonly claudeLaunchJson?: LaunchJsonResult;
}

export function writeProjectAiIntegrations(
  projectDir: string,
  selectedEditorIds: readonly EditorId[],
  installOptions: McpInstallOptions = {},
): ProjectAiIntegrationsResult {
  const editorOutcomes: ProjectAiEditorOutcome[] = [];

  for (const editorId of selectedEditorIds) {
    const target = EDITOR_TARGETS[editorId];
    const projectPath = target.projectConfigPath?.(projectDir);

    if (!projectPath) {
      editorOutcomes.push({ editorId, outcome: 'skipped-no-project-surface' });
      continue;
    }

    let result: EditorMcpResult;
    try {
      result = writeEditorMcpConfig(target, projectDir, installOptions, undefined, projectPath);
    } catch (err) {
      editorOutcomes.push({
        editorId,
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (result.action === 'written' || result.action === 'overwritten') {
      editorOutcomes.push({ editorId, outcome: result.action });
      continue;
    }
    if (result.action === 'failed') {
      editorOutcomes.push({ editorId, outcome: 'failed', error: result.error });
      continue;
    }
    editorOutcomes.push({
      editorId,
      outcome: 'failed',
      error: `unexpected project-scope action: ${result.action}`,
    });
  }

  const claudeLaunchJson = selectedEditorIds.includes('claude')
    ? scaffoldLaunchJson(projectDir, installOptions)
    : undefined;

  return { editorOutcomes, claudeLaunchJson };
}
