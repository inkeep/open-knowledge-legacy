// M6b — Public surface consumed by `@inkeep/open-knowledge-desktop` from
// Electron main. Lifted from CLI internals so desktop can import via the
// package name (`@inkeep/open-knowledge`) instead of reaching into
// `../../../cli/src/commands/...`. The workspace-dep declaration on
// desktop's package.json makes turbo's `^build` topology key on these
// symbols — a CLI internal refactor now correctly invalidates desktop's
// cache (Pass 0 Major #2). See specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md.
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
  type WriteUserMcpConfigsOptions,
  writeEditorMcpConfig,
  writeUserMcpConfigs,
} from './commands/init.ts';
export { type LoadConfigResult, loadConfig } from './config/loader.ts';
export { type Config, ConfigSchema } from './config/schema.ts';
export type { AgentIdentity } from './mcp/agent-identity.ts';
