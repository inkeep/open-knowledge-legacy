#!/usr/bin/env bun
/**
 * Emit `dist/config-schema.json` from `ConfigSchema` for IDE intellisense.
 *
 * Runs as part of `bun run build` (via `build:assets`). The published file
 * powers two delivery channels (FR-17 / FR-19):
 *   1. Magic-comment scaffold in `ok init`'s generated `config.yml` —
 *      `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@<MAJOR.MINOR>/dist/config-schema.json`
 *   2. SchemaStore catalog entry — autodiscovers via the `.open-knowledge/config.yml` filename match
 *
 * `io: 'input'` (not `'output'`) is load-bearing: the IDE must show the user
 * what they TYPE (every defaulted field optional), not what the runtime
 * resolves (every defaulted field required). The CI test in
 * `src/config/json-schema-equivalence.test.ts` guards this contract.
 *
 * `metadata: fieldRegistry` flows the per-field `scope` / `agentSettable` /
 * `defaultScope` annotations into the JSON Schema as custom keys. JSON
 * Schema draft-07 ignores unknown keywords; the keys ride along for any
 * future consumer that wants to introspect them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigSchema, fieldRegistry } from '@inkeep/open-knowledge-core';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const outPath = resolve(distDir, 'config-schema.json');

const jsonSchema = z.toJSONSchema(ConfigSchema, {
  io: 'input',
  target: 'draft-7',
  metadata: fieldRegistry,
});

mkdirSync(distDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`, 'utf-8');

console.log(`[build:schema] wrote ${outPath} (${JSON.stringify(jsonSchema).length} bytes)`);
