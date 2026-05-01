export {
  ALL_EDITOR_IDS,
  EDITOR_TARGETS,
  type EditorId,
  type EditorMcpTarget,
  type McpInstallOptions,
} from './commands/editors.ts';
export {
  detectInstalledEditors,
  type EditorMcpResult,
  readExistingMcpEntry,
  type UserMcpConfigsOptions,
  writeEditorMcpConfig,
  writeUserMcpConfigs,
} from './commands/init.ts';
export { type LoadConfigResult, loadConfig } from './config/loader.ts';
export { type Config, ConfigSchema } from './config/schema.ts';
export type { AgentIdentity } from './mcp/agent-identity.ts';
