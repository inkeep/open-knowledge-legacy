import { z } from 'zod';

/**
 * Source location of an issue in a YAML file, if the issue was traced back
 * to a parsed `Document` AST. 1-indexed line and column to match the
 * conventions IDEs/CLIs use (Biome, tsc, ESLint).
 *
 * `snippet` is a multi-line preview of the source around the issue —
 * typically 1-3 lines with a caret marker under the offending token.
 */
export const ConfigIssueSourceSchema = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  snippet: z.string().optional(),
});

export type ConfigIssueSource = z.infer<typeof ConfigIssueSourceSchema>;

/**
 * Path segments are coerced to (string | number) at the wire boundary —
 * Zod's native `issue.path` is `PropertyKey[]` (`string | number | symbol`),
 * and symbols don't survive JSON serialization. Every consumer of
 * `ConfigValidationError` (Settings pane walker, CLI source-located renderer,
 * MCP tool envelopes) gets a pre-coerced path.
 *
 * `source` is set when the issue was traced back to a yaml@2 `Document` AST
 * (loader path, `ok config validate`). Headless writers without an associated
 * file (e.g., MCP `set_config` writing to a fresh document) leave it unset.
 */
export const ConfigIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  issueCode: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  source: ConfigIssueSourceSchema.optional(),
});

export type ConfigIssue = z.infer<typeof ConfigIssueSchema>;

/**
 * Scope tag used by `SCOPE_VIOLATION` and `MIXED_SCOPE` payloads. Mirrors
 * `fieldRegistry` metadata: `'either'` means "valid at user OR
 * project"; `'user'` and `'project'` are scope-restricted.
 */
export const FieldScopeSchema = z.enum(['user', 'project', 'either']);
export type FieldScope = z.infer<typeof FieldScopeSchema>;

export const WriteScopeSchema = z.enum(['user', 'project']);
export type WriteScope = z.infer<typeof WriteScopeSchema>;

export const KnownConfigValidationErrorSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('YAML_PARSE'),
    detail: z.string(),
  }),
  z.object({
    code: z.literal('SCHEMA_INVALID'),
    issues: z.array(ConfigIssueSchema),
  }),
  z.object({
    code: z.literal('SCOPE_VIOLATION'),
    path: z.array(z.string()),
    expectedScope: FieldScopeSchema,
    actualScope: WriteScopeSchema,
  }),
  z.object({
    code: z.literal('NOT_AGENT_SETTABLE'),
    path: z.array(z.string()),
  }),
  z.object({
    code: z.literal('MIXED_SCOPE'),
    paths: z.array(
      z.object({
        path: z.array(z.string()),
        scope: WriteScopeSchema,
      }),
    ),
  }),
  z.object({
    code: z.literal('WRITE_ERROR'),
    detail: z.string(),
  }),
  z.object({
    code: z.literal('UNKNOWN'),
    message: z.string().optional(),
  }),
]);

export type KnownConfigValidationError = z.infer<typeof KnownConfigValidationErrorSchema>;

// Derived from the discriminated-union options so a new variant in
// `KnownConfigValidationErrorSchema` flows through to `isKnownConfigError`
// + `humanFormat` automatically — no risk of code/set drift.
const KNOWN_CONFIG_ERROR_CODES: ReadonlySet<string> = new Set(
  KnownConfigValidationErrorSchema.options.map((opt) => opt.shape.code.value),
);

/**
 * Forward-compat tail variant: a future package version may emit codes the
 * current consumer doesn't know about. The catch-all keeps old clients
 * rendering generically rather than crashing.
 */
export const ForwardCompatConfigErrorSchema = z.looseObject({
  code: z.string(),
  message: z.string().optional(),
});

export type ForwardCompatConfigError = z.infer<typeof ForwardCompatConfigErrorSchema>;

export const ConfigValidationErrorSchema = z.union([
  KnownConfigValidationErrorSchema,
  ForwardCompatConfigErrorSchema,
]);

export type ConfigValidationError = KnownConfigValidationError | ForwardCompatConfigError;

/**
 * Type predicate: narrows to the discriminated `KnownConfigValidationError`
 * union when `error.code` is one of the known literals. Switch statements
 * inside the predicate's true branch get exhaustive narrowing on `code`.
 */
export function isKnownConfigError(
  error: ConfigValidationError,
): error is KnownConfigValidationError {
  return KNOWN_CONFIG_ERROR_CODES.has(error.code);
}

/**
 * Render a `ConfigValidationError` as a human-readable string. Used by:
 * - CLI `ok config validate` (source-located output to stderr)
 * - MCP tool `content[].text` (with retry-framing suffix appended at the
 *   call site)
 * - Settings pane toast for L3 rejections
 *
 * Output is plain text, multi-line for `SCHEMA_INVALID` / `MIXED_SCOPE`,
 * single-line otherwise.
 */
export function humanFormat(error: ConfigValidationError): string {
  if (!isKnownConfigError(error)) {
    return error.message ?? `Unknown error (${error.code}).`;
  }
  switch (error.code) {
    case 'YAML_PARSE':
      return `Failed to parse YAML: ${error.detail}`;
    case 'SCHEMA_INVALID': {
      if (error.issues.length === 0) return 'Invalid configuration.';
      // Group issues by file so a single header line precedes each file's
      // issues. Issues without source go under a synthetic "<no source>" key.
      const grouped = new Map<string, ConfigIssue[]>();
      for (const iss of error.issues) {
        const key = iss.source?.file ?? '<no source>';
        const list = grouped.get(key) ?? [];
        list.push(iss);
        grouped.set(key, list);
      }
      const lines: string[] = [];
      for (const [file, issues] of grouped) {
        if (file === '<no source>') {
          lines.push('Invalid configuration:');
        } else {
          lines.push(`Invalid configuration at ${file}:`);
        }
        for (const iss of issues) {
          const path = iss.path.length === 0 ? '<root>' : iss.path.join('.');
          if (iss.source) {
            lines.push(`  ${file}:${iss.source.line}:${iss.source.column}`);
            lines.push(`  ${path}: ${iss.message}`);
            if (iss.source.snippet && iss.source.snippet.length > 0) {
              for (const snippetLine of iss.source.snippet.split('\n')) {
                lines.push(`    ${snippetLine}`);
              }
            }
          } else {
            lines.push(`  ${path}: ${iss.message}`);
          }
        }
      }
      return lines.join('\n');
    }
    case 'SCOPE_VIOLATION':
      return `Field ${error.path.join('.')} cannot be set at ${error.actualScope} scope (expected: ${error.expectedScope}).`;
    case 'NOT_AGENT_SETTABLE':
      return [
        `Field ${error.path.join('.')} is not agent-settable.`,
        'Agent-settable paths: content.include, content.exclude, folders[],',
        'mcp.tools.search.maxResults, mcp.tools.read_document.historyDepth.',
        'Other fields can be edited via the Settings pane or by hand-editing config.yml.',
      ].join(' ');
    case 'MIXED_SCOPE': {
      const summary = error.paths
        .map(({ path, scope }) => `  ${path.join('.')} → ${scope}`)
        .join('\n');
      return ['Patch contains fields targeting multiple scopes:', summary].join('\n');
    }
    case 'WRITE_ERROR':
      return `Failed to write config file: ${error.detail}`;
    case 'UNKNOWN':
      return error.message ?? 'Unknown error.';
  }
}
