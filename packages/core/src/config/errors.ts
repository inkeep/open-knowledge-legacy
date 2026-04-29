import { z } from 'zod';

/**
 * Path segments are coerced to (string | number) at the wire boundary —
 * Zod's native `issue.path` is `PropertyKey[]` (`string | number | symbol`),
 * and symbols don't survive JSON serialization. Every consumer of
 * `ConfigValidationError` (Settings pane walker, CLI source-located renderer,
 * MCP tool envelopes) gets a pre-coerced path.
 */
export const ConfigIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  issueCode: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type ConfigIssue = z.infer<typeof ConfigIssueSchema>;

/**
 * Scope tag used by `SCOPE_VIOLATION` and `MIXED_SCOPE` payloads. Mirrors
 * `fieldRegistry` metadata (D43/D47): `'either'` means "valid at user OR
 * workspace"; `'user'` and `'workspace'` are scope-restricted.
 */
export const FieldScopeSchema = z.enum(['user', 'workspace', 'either']);
export type FieldScope = z.infer<typeof FieldScopeSchema>;

export const WriteScopeSchema = z.enum(['user', 'workspace']);
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

const KNOWN_CONFIG_ERROR_CODES = new Set<string>([
  'YAML_PARSE',
  'SCHEMA_INVALID',
  'SCOPE_VIOLATION',
  'NOT_AGENT_SETTABLE',
  'MIXED_SCOPE',
  'WRITE_ERROR',
  'UNKNOWN',
]);

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
      const lines = error.issues.map((iss) => {
        const path = iss.path.length === 0 ? '<root>' : iss.path.join('.');
        return `  ${path}: ${iss.message}`;
      });
      return ['Invalid configuration:', ...lines].join('\n');
    }
    case 'SCOPE_VIOLATION':
      return `Field ${error.path.join('.')} cannot be set at ${error.actualScope} scope (expected: ${error.expectedScope}).`;
    case 'NOT_AGENT_SETTABLE':
      return `Field ${error.path.join('.')} is not agent-settable.`;
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
