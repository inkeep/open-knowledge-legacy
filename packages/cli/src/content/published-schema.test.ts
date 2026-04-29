/**
 * Smoke test for the published JSON Schema artifact (US-013 / FR-18 / FR-19).
 *
 * Verifies that:
 *   1. The `dist/config-schema.json` artifact exists (so npm publish ships it
 *      via `package.json` `files: ['dist']`).
 *   2. The artifact compiles cleanly under ajv (so the URL the magic comment
 *      points at — `https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json`
 *      — resolves to a working JSON Schema draft-07 doc that any LSP-aware
 *      editor can consume).
 *   3. A fixture matching the runtime `ConfigSchema` is accepted by the
 *      published artifact (same direction the IDE drives validation).
 *
 * The deeper schema-correctness contract (ajv ↔ ConfigSchema accept/reject
 * the same inputs across a fixture matrix) lives in
 * `packages/core/src/config/schema-jsonschema.test.ts`. THIS test only proves
 * the published artifact is current + ajv-compilable. If it goes stale,
 * `bun run --filter=@inkeep/open-knowledge build:schema` regenerates it.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '..', '..', 'dist');
const PUBLISHED_SCHEMA_PATH = resolve(DIST, 'config-schema.json');
const WORKSPACE_SCHEMA_PATH = resolve(DIST, 'config.workspace.schema.json');
const USER_SCHEMA_PATH = resolve(DIST, 'config.user.schema.json');

describe('published dist/config-schema.json', () => {
  test('artifact exists at the path npm ships via files:["dist"]', () => {
    expect(existsSync(PUBLISHED_SCHEMA_PATH)).toBe(true);
  });

  test('per-scope artifacts exist (used by ok init + writeConfigPatch lazy first-write)', () => {
    expect(existsSync(WORKSPACE_SCHEMA_PATH)).toBe(true);
    expect(existsSync(USER_SCHEMA_PATH)).toBe(true);
  });

  test('per-scope artifacts disjointly cover scope-specific fields', () => {
    const workspace = JSON.parse(readFileSync(WORKSPACE_SCHEMA_PATH, 'utf-8')) as {
      properties?: Record<string, unknown>;
    };
    const user = JSON.parse(readFileSync(USER_SCHEMA_PATH, 'utf-8')) as {
      properties?: Record<string, unknown>;
    };
    // workspace-only top-level sections
    expect(workspace.properties).toHaveProperty('content');
    expect(user.properties).not.toHaveProperty('content');
    // user-only top-level sections
    expect(user.properties).toHaveProperty('appearance');
    expect(workspace.properties).not.toHaveProperty('appearance');
  });

  test('artifact is JSON-parsable + declares draft-07', () => {
    const raw = readFileSync(PUBLISHED_SCHEMA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { $schema?: string; type?: string };
    expect(parsed.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(parsed.type).toBe('object');
  });

  test('ajv compiles the published artifact without errors', () => {
    const raw = readFileSync(PUBLISHED_SCHEMA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as object;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    expect(() => ajv.compile(parsed)).not.toThrow();
  });

  test('ajv accepts a fixture matching the runtime ConfigSchema shape', () => {
    const raw = readFileSync(PUBLISHED_SCHEMA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as object;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(parsed);
    // Representative fixture exercising several sections at once. Every leaf
    // is valid against ConfigSchema; ajv must agree.
    const fixture = {
      content: { dir: '.', include: ['**/*.md'], exclude: [] },
      mcp: { autoStart: true, tools: { search: { maxResults: 50 } } },
      appearance: { theme: 'dark', editorModeDefault: 'wysiwyg' },
      folders: [{ match: 'specs/**', frontmatter: { description: 'Specs' } }],
    };
    const ok = validate(fixture);
    if (!ok) {
      throw new Error(`ajv rejected fixture: ${JSON.stringify(validate.errors, null, 2)}`);
    }
    expect(ok).toBe(true);
  });

  test('ajv rejects a fixture violating a leaf type', () => {
    const raw = readFileSync(PUBLISHED_SCHEMA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as object;
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(parsed);
    // mcp.tools.search.maxResults is integer ≥ 1; pass a string instead.
    const fixture = { mcp: { tools: { search: { maxResults: 'fast' } } } };
    expect(validate(fixture)).toBe(false);
    expect(validate.errors?.length).toBeGreaterThan(0);
  });
});
