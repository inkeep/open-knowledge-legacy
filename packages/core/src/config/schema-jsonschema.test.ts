import { describe, expect, test } from 'bun:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import { fieldRegistry } from './field-registry.ts';
import { ConfigSchema } from './schema.ts';

// Single shared Ajv instance for the equivalence fixture run.
function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

const jsonSchema = z.toJSONSchema(ConfigSchema, {
  io: 'input',
  target: 'draft-7',
  metadata: fieldRegistry,
});

const ajv = buildAjv();
const validate = ajv.compile(jsonSchema);

interface Fixture {
  name: string;
  input: unknown;
  /** True if both validators should accept; false if both should reject. */
  shouldAccept: boolean;
}

// Representative coverage across leaves and section defaults. Both ajv (over
// the published JSON Schema) and ConfigSchema.safeParse must agree on every
// fixture — guards against `.transform()` / `.coerce()` slipping into the
// schema and silently breaking IDE/runtime equivalence.
const FIXTURES: Fixture[] = [
  { name: 'empty object — defaults fill in', input: {}, shouldAccept: true },
  {
    name: 'content section with dir set',
    input: { content: { dir: 'docs' } },
    shouldAccept: true,
  },
  {
    name: 'content with non-string dir rejected',
    input: { content: { dir: 12345 } },
    shouldAccept: false,
  },
  { name: 'invalid host (number)', input: { server: { host: 12345 } }, shouldAccept: false },
  { name: 'valid host string', input: { server: { host: '0.0.0.0' } }, shouldAccept: true },
  {
    name: 'preview.baseUrl valid URL',
    input: { preview: { baseUrl: 'https://wiki.acme.com' } },
    shouldAccept: true,
  },
  {
    name: 'preview.baseUrl invalid URL',
    input: { preview: { baseUrl: 'not a url' } },
    shouldAccept: false,
  },
  {
    name: 'appearance.theme=dark accepted',
    input: { appearance: { theme: 'dark' } },
    shouldAccept: true,
  },
  {
    name: 'appearance.theme=midnight rejected',
    input: { appearance: { theme: 'midnight' } },
    shouldAccept: false,
  },
  {
    name: 'autoSync.enabled accepted',
    input: { autoSync: { enabled: true } },
    shouldAccept: true,
  },
  {
    name: 'autoSync empty object accepted for stale/partial YAML',
    input: { autoSync: {} },
    shouldAccept: true,
  },
  {
    name: 'mcp.tools.search.maxResults=25 accepted',
    input: { mcp: { tools: { search: { maxResults: 25 } } } },
    shouldAccept: true,
  },
  {
    name: 'mcp.tools.search.maxResults=0 rejected (min 1)',
    input: { mcp: { tools: { search: { maxResults: 0 } } } },
    shouldAccept: false,
  },
  { name: 'folders array empty', input: { folders: [] }, shouldAccept: true },
  {
    name: 'folders rule with all frontmatter',
    input: { folders: [{ match: 'specs/**', frontmatter: { title: 'Specs' } }] },
    shouldAccept: true,
  },
  {
    name: 'folders rule empty match rejected',
    input: { folders: [{ match: '', frontmatter: { title: 'X' } }] },
    shouldAccept: false,
  },
  {
    name: 'unknown top-level key passes (looseObject)',
    input: { future_feature: { enabled: true } },
    shouldAccept: true,
  },
  {
    name: 'stale dropped fields pass via loose-mode',
    input: {
      sync: { pushIntervalSeconds: 30 },
      persistence: { debounceMs: 2000 },
      server: { port: 3000, host: 'localhost' },
    },
    shouldAccept: true,
  },
];

describe('JSON Schema ↔ runtime equivalence', () => {
  test.each(FIXTURES)('$name → both validators agree', ({ input, shouldAccept }) => {
    const ajvAccept = validate(input);
    const zodAccept = ConfigSchema.safeParse(input).success;
    if (ajvAccept !== shouldAccept || zodAccept !== shouldAccept) {
      throw new Error(
        `Fixture disagreed (expected ${shouldAccept ? 'accept' : 'reject'}): ajv=${ajvAccept}, zod=${zodAccept}, ajvErrors=${JSON.stringify(validate.errors)}`,
      );
    }
    expect(ajvAccept).toBe(shouldAccept);
    expect(zodAccept).toBe(shouldAccept);
  });
});

describe('loose-mode forgiveness', () => {
  test('config with stale dropped fields loads and resolves known values', () => {
    const result = ConfigSchema.safeParse({
      sync: { pushIntervalSeconds: 30, autoCommit: true },
      persistence: { debounceMs: 2000 },
      server: { port: 3000, host: 'example.dev' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.server.host).toBe('example.dev');
      // Defaults still resolve for known fields.
      expect(result.data.mcp.autoStart).toBe(true);
      // Unknown top-level passes through into the loose-typed payload.
      expect((result.data as Record<string, unknown>).sync).toEqual({
        pushIntervalSeconds: 30,
        autoCommit: true,
      });
    }
  });

  test('appearance.theme defaults to UNSET', () => {
    const config = ConfigSchema.parse({});
    expect(config.appearance.theme).toBeUndefined();
    expect(config.appearance.editorModeDefault).toBeUndefined();
  });
});
