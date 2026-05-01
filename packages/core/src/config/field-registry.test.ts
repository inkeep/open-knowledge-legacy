import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { fieldRegistry, getFieldMeta } from './field-registry.ts';
import { ConfigSchema } from './schema.ts';

describe('fieldRegistry singleton', () => {
  test('is reachable via the public globalThis Symbol key', () => {
    const SINGLETON_KEY = Symbol.for('@inkeep/open-knowledge/field-registry');
    const fromGlobal = (globalThis as Record<symbol, unknown>)[SINGLETON_KEY];
    expect(fromGlobal).toBe(fieldRegistry as unknown as typeof fromGlobal);
  });

  test('two callers see the same registry instance', async () => {
    // Re-import the same module spec; ESM caching means the second import
    // resolves to the already-loaded module, but the Symbol-keyed singleton
    // would also dedupe across genuinely separate copies of the module.
    const reimport = await import('./field-registry.ts');
    expect(reimport.fieldRegistry).toBe(fieldRegistry);
  });
});

describe('getFieldMeta walker (descends innerType)', () => {
  test('finds metadata when no wrappers are attached', () => {
    const reg = z.registry<{ scope: string }>();
    const inner = z.string();
    inner.register(reg, { scope: 'user' });
    expect(reg.get(inner)).toEqual({ scope: 'user' });
  });

  test('descends through .default()', () => {
    const inner = z.string();
    fieldRegistry.add(inner, { scope: 'user', agentSettable: false });
    const wrapped = inner.default('localhost');
    expect(getFieldMeta(wrapped)).toEqual({ scope: 'user', agentSettable: false });
  });

  test('descends through chained .optional().nullable().default()', () => {
    const inner = z.number();
    fieldRegistry.add(inner, { scope: 'project', agentSettable: true });
    const wrapped = inner.optional().nullable().default(42);
    expect(getFieldMeta(wrapped)).toEqual({ scope: 'project', agentSettable: true });
  });

  test('descends through z.array(...).min(...).default(...)', () => {
    const arr = z.array(z.string()).min(1);
    fieldRegistry.add(arr, { scope: 'either', agentSettable: true, defaultScope: 'project' });
    const wrapped = arr.default(['a']);
    expect(getFieldMeta(wrapped)).toEqual({
      scope: 'either',
      agentSettable: true,
      defaultScope: 'project',
    });
  });

  test('returns undefined for unregistered leaves', () => {
    const inner = z.string();
    expect(getFieldMeta(inner)).toBeUndefined();
    expect(getFieldMeta(inner.default('x'))).toBeUndefined();
  });

  test('returns undefined for non-schema inputs', () => {
    expect(getFieldMeta(undefined)).toBeUndefined();
    expect(getFieldMeta(null)).toBeUndefined();
    expect(getFieldMeta({})).toBeUndefined();
  });
});

describe('ConfigSchema coverage (NR3 — every leaf has fieldRegistry metadata)', () => {
  // Walks ConfigSchema's structural shape and asserts that every leaf field
  // (scalar, array-leaf, enum) has a `fieldRegistry` entry. Catches the
  // load-bearing declaration-order rule: `.register()` MUST come BEFORE
  // `.default()` / `.optional()` / `.nullable()`. Only ONE `fieldRegistry`
  // per process, so misregistration here is unrecoverable.
  function isObjectLike(schema: unknown): schema is { _zod: { def: { shape: unknown } } } {
    const def = (schema as { _zod?: { def?: { type?: string } } })._zod?.def;
    return def?.type === 'object' || def?.type === 'looseObject';
  }

  function unwrapToInner(schema: unknown): unknown {
    let cur = schema;
    while (cur) {
      const def = (cur as { _zod?: { def?: { type?: string; innerType?: unknown } } })._zod?.def;
      if (!def) return cur;
      // Stop at object/looseObject — they're walkable, not leaves.
      if (def.type === 'object' || def.type === 'looseObject') return cur;
      // Descend wrappers.
      if (def.innerType !== undefined) {
        cur = def.innerType;
        continue;
      }
      return cur;
    }
    return cur;
  }

  function walkLeaves(
    schema: unknown,
    path: string[],
    leaves: { path: string[]; schema: unknown }[],
  ) {
    const inner = unwrapToInner(schema);
    if (isObjectLike(inner)) {
      const shape = (inner as { _zod: { def: { shape: Record<string, unknown> } } })._zod.def.shape;
      for (const [key, child] of Object.entries(shape)) {
        walkLeaves(child, [...path, key], leaves);
      }
      return;
    }
    leaves.push({ path, schema });
  }

  test('every leaf in ConfigSchema has fieldRegistry metadata', () => {
    const leaves: { path: string[]; schema: unknown }[] = [];
    walkLeaves(ConfigSchema, [], leaves);
    expect(leaves.length).toBeGreaterThan(0);
    const missing = leaves.filter((l) => getFieldMeta(l.schema) === undefined);
    if (missing.length > 0) {
      const lines = missing.map((m) => `  - ${m.path.join('.')}`).join('\n');
      throw new Error(
        `ConfigSchema leaves missing fieldRegistry entry (declaration order bug? .register() must come BEFORE .default()/.optional()/.nullable()):\n${lines}`,
      );
    }
  });

  test('agentSettable allowlist is exactly the 3 expected paths', () => {
    const leaves: { path: string[]; schema: unknown }[] = [];
    walkLeaves(ConfigSchema, [], leaves);
    const allowlisted = leaves
      .filter((l) => getFieldMeta(l.schema)?.agentSettable === true)
      .map((l) => l.path.join('.'))
      .sort();
    expect(allowlisted).toEqual(
      ['folders', 'mcp.tools.read_document.historyDepth', 'mcp.tools.search.maxResults'].sort(),
    );
  });

  test('project-strict fields cover content.dir + preview.baseUrl', () => {
    // `content.dir` is project-only — it names the root of *this* project's
    // knowledge graph; a user-global override doesn't make sense. content.include
    // / content.exclude were removed (path rules now live in `.okignore`).
    // `preview.baseUrl` is project-only per spec §9.5.4 ❌ marker.
    const leaves: { path: string[]; schema: unknown }[] = [];
    walkLeaves(ConfigSchema, [], leaves);
    const projectStrict = leaves
      .filter((l) => getFieldMeta(l.schema)?.scope === 'project')
      .map((l) => l.path.join('.'))
      .sort();
    expect(projectStrict).toEqual(['content.dir', 'preview.baseUrl'].sort());
  });
});
