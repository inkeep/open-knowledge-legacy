import { z } from 'zod';

export const ConfigIssueSourceSchema = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  snippet: z.string().optional(),
});

export type ConfigIssueSource = z.infer<typeof ConfigIssueSourceSchema>;

export const ConfigIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
  issueCode: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  source: ConfigIssueSourceSchema.optional(),
});

export type ConfigIssue = z.infer<typeof ConfigIssueSchema>;

export const FieldScopeSchema = z.enum(['user', 'project', 'project-local', 'either']);
export type FieldScope = z.infer<typeof FieldScopeSchema>;

export const WriteScopeSchema = z.enum(['user', 'project', 'project-local']);
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
    code: z.literal('REMOVED_KEY'),
    path: z.array(z.string()),
    redirect: z.string(),
    source: ConfigIssueSourceSchema.optional(),
  }),
  z.object({
    code: z.literal('WRITE_ERROR'),
    detail: z.string(),
  }),
  z.object({
    code: z.literal('OKIGNORE_INVALID'),
    detail: z.string(),
    lineNumber: z.number().int().min(1).optional(),
  }),
  z.object({
    code: z.literal('UNKNOWN'),
    message: z.string().optional(),
  }),
]);

export type KnownConfigValidationError = z.infer<typeof KnownConfigValidationErrorSchema>;

const KNOWN_CONFIG_ERROR_CODES: ReadonlySet<string> = new Set(
  KnownConfigValidationErrorSchema.options.map((opt) => opt.shape.code.value),
);

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

export function isKnownConfigError(
  error: ConfigValidationError,
): error is KnownConfigValidationError {
  return KNOWN_CONFIG_ERROR_CODES.has(error.code);
}

export function humanFormat(error: ConfigValidationError): string {
  if (!isKnownConfigError(error)) {
    return error.message ?? `Unknown error (${error.code}).`;
  }
  switch (error.code) {
    case 'YAML_PARSE':
      return `Failed to parse YAML: ${error.detail}`;
    case 'SCHEMA_INVALID': {
      if (error.issues.length === 0) return 'Invalid configuration.';
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
        'Edit via the Settings pane or by hand-editing config.yml.',
      ].join(' ');
    case 'MIXED_SCOPE': {
      const summary = error.paths
        .map(({ path, scope }) => `  ${path.join('.')} → ${scope}`)
        .join('\n');
      return ['Patch contains fields targeting multiple scopes:', summary].join('\n');
    }
    case 'REMOVED_KEY': {
      const path = error.path.join('.');
      const header = error.source
        ? `Removed key at ${error.source.file}:${error.source.line}:${error.source.column}`
        : 'Removed key in configuration';
      const lines = [`${header}: ${path}`, error.redirect];
      if (error.source?.snippet && error.source.snippet.length > 0) {
        for (const snippetLine of error.source.snippet.split('\n')) {
          lines.push(`  ${snippetLine}`);
        }
      }
      return lines.join('\n');
    }
    case 'WRITE_ERROR':
      return `Failed to write config file: ${error.detail}`;
    case 'OKIGNORE_INVALID':
      return error.lineNumber !== undefined
        ? `.okignore line ${error.lineNumber}: ${error.detail}`
        : `.okignore: ${error.detail}`;
    case 'UNKNOWN':
      return error.message ?? 'Unknown error.';
  }
}
