import { describe, expect, test } from 'bun:test';
import {
  ConfigValidationErrorSchema,
  humanFormat,
  isKnownConfigError,
  KnownConfigValidationErrorSchema,
} from './errors.ts';

describe('ConfigValidationErrorSchema', () => {
  test('parses YAML_PARSE variant', () => {
    const parsed = ConfigValidationErrorSchema.parse({
      code: 'YAML_PARSE',
      detail: 'unexpected token at line 12',
    });
    expect(parsed.code).toBe('YAML_PARSE');
  });

  test('parses SCHEMA_INVALID with issues', () => {
    const parsed = ConfigValidationErrorSchema.parse({
      code: 'SCHEMA_INVALID',
      issues: [
        {
          path: ['mcp', 'tools', 'grep', 'maxResults'],
          message: 'Expected number, got string',
          issueCode: 'invalid_type',
        },
      ],
    });
    expect(parsed.code).toBe('SCHEMA_INVALID');
    if (parsed.code === 'SCHEMA_INVALID') {
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0].path).toEqual(['mcp', 'tools', 'grep', 'maxResults']);
    }
  });

  test('parses NOT_AGENT_SETTABLE with path', () => {
    const parsed = ConfigValidationErrorSchema.parse({
      code: 'NOT_AGENT_SETTABLE',
      path: ['github', 'oauthAppClientId'],
    });
    expect(parsed.code).toBe('NOT_AGENT_SETTABLE');
    if (parsed.code === 'NOT_AGENT_SETTABLE') {
      expect(parsed.path).toEqual(['github', 'oauthAppClientId']);
    }
  });

  test('parses MIXED_SCOPE with paths array', () => {
    const parsed = ConfigValidationErrorSchema.parse({
      code: 'MIXED_SCOPE',
      paths: [
        { path: ['content', 'dir'], scope: 'project' },
        { path: ['mcp', 'tools', 'grep', 'maxResults'], scope: 'user' },
      ],
    });
    expect(parsed.code).toBe('MIXED_SCOPE');
  });

  test('forward-compat tail accepts unknown codes without throwing', () => {
    const parsed = ConfigValidationErrorSchema.parse({
      code: 'FUTURE_CODE_NOT_YET_KNOWN',
      message: 'something the future emitted',
      extraField: { nested: true },
    });
    expect(parsed.code).toBe('FUTURE_CODE_NOT_YET_KNOWN');
    expect(isKnownConfigError(parsed)).toBe(false);
  });

  test('isKnownConfigError narrows on every known literal', () => {
    for (const code of [
      'YAML_PARSE',
      'SCHEMA_INVALID',
      'SCOPE_VIOLATION',
      'NOT_AGENT_SETTABLE',
      'MIXED_SCOPE',
      'WRITE_ERROR',
      'UNKNOWN',
    ] as const) {
      expect(isKnownConfigError({ code, detail: 'x' } as never)).toBe(true);
    }
  });

  test('KnownConfigValidationErrorSchema rejects unknown code', () => {
    const result = KnownConfigValidationErrorSchema.safeParse({
      code: 'NOT_A_KNOWN_CODE',
    });
    expect(result.success).toBe(false);
  });
});

describe('humanFormat', () => {
  test('YAML_PARSE renders detail', () => {
    expect(humanFormat({ code: 'YAML_PARSE', detail: 'bad indentation' })).toContain(
      'bad indentation',
    );
  });

  test('SCHEMA_INVALID renders one line per issue with path joined by .', () => {
    const out = humanFormat({
      code: 'SCHEMA_INVALID',
      issues: [
        {
          path: ['mcp', 'tools', 'grep', 'maxResults'],
          message: 'Expected number',
          issueCode: 'invalid_type',
        },
        {
          path: ['preview', 'baseUrl'],
          message: 'Invalid URL',
          issueCode: 'invalid_string',
        },
      ],
    });
    expect(out).toContain('mcp.tools.grep.maxResults: Expected number');
    expect(out).toContain('preview.baseUrl: Invalid URL');
  });

  test('SCHEMA_INVALID with empty issues falls back to generic message', () => {
    expect(humanFormat({ code: 'SCHEMA_INVALID', issues: [] })).toBe('Invalid configuration.');
  });

  test('SCHEMA_INVALID renders root path as <root>', () => {
    expect(
      humanFormat({
        code: 'SCHEMA_INVALID',
        issues: [{ path: [], message: 'must be object', issueCode: 'invalid_type' }],
      }),
    ).toContain('<root>: must be object');
  });

  test('NOT_AGENT_SETTABLE renders path', () => {
    expect(
      humanFormat({ code: 'NOT_AGENT_SETTABLE', path: ['github', 'oauthAppClientId'] }),
    ).toContain('github.oauthAppClientId');
  });

  test('SCOPE_VIOLATION renders both scopes', () => {
    const out = humanFormat({
      code: 'SCOPE_VIOLATION',
      path: ['appearance', 'theme'],
      expectedScope: 'user',
      actualScope: 'project',
    });
    expect(out).toContain('appearance.theme');
    expect(out).toContain('project');
    expect(out).toContain('user');
  });

  test('MIXED_SCOPE summarizes per-path scope assignments', () => {
    const out = humanFormat({
      code: 'MIXED_SCOPE',
      paths: [
        { path: ['content', 'dir'], scope: 'project' },
        { path: ['mcp', 'tools', 'grep', 'maxResults'], scope: 'user' },
      ],
    });
    expect(out).toContain('content.dir → project');
    expect(out).toContain('mcp.tools.grep.maxResults → user');
  });

  test('UNKNOWN with message renders message; without message renders generic', () => {
    expect(humanFormat({ code: 'UNKNOWN', message: 'boom' })).toBe('boom');
    expect(humanFormat({ code: 'UNKNOWN' })).toBe('Unknown error.');
  });

  test('forward-compat tail uses message or generic with code', () => {
    expect(humanFormat({ code: 'FUTURE', message: 'hi' })).toBe('hi');
    expect(humanFormat({ code: 'FUTURE' })).toContain('FUTURE');
  });
});
