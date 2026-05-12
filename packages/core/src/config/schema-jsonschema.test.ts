import { describe, expect, test } from 'bun:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import { fieldRegistry } from './field-registry.ts';
import { ConfigSchema } from './schema.ts';

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
  shouldAccept: boolean;
}

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
      mcp: { autoStart: false },
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
      mcp: { autoStart: false },
      content: { dir: 'docs' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content.dir).toBe('docs');
      expect((result.data as Record<string, unknown>).sync).toEqual({
        pushIntervalSeconds: 30,
        autoCommit: true,
      });
    }
  });

  test('appearance.theme defaults to UNSET', () => {
    const config = ConfigSchema.parse({});
    expect(config.appearance.theme).toBeUndefined();
  });
});
