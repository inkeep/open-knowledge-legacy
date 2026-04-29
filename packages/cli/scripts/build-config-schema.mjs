#!/usr/bin/env bun
/**
 * Emit per-scope JSON Schemas from `ConfigSchema` for IDE intellisense.
 *
 * Runs as part of `bun run build` (via `build:assets`). Three files emitted:
 *   - `dist/config-schema.json`           — every field (back-compat alias;
 *                                            kept for any pre-existing magic
 *                                            comments still pointing here)
 *   - `dist/config.workspace.schema.json` — fields valid in workspace YAML
 *                                            (scope: 'workspace' or 'either')
 *   - `dist/config.user.schema.json`      — fields valid in user YAML
 *                                            (scope: 'user' or 'either')
 *
 * `ok init`'s scaffolded workspace `config.yml` magic-comment points at the
 * workspace schema; `writeConfigPatch`'s lazy first-write of
 * `~/.open-knowledge/config.yml` points at the user schema. Each file's
 * autocomplete then surfaces only the fields that are valid AT that scope —
 * an `appearance.theme` typed in workspace YAML squiggles, a `content.dir`
 * typed in user YAML squiggles.
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

const fullSchema = z.toJSONSchema(ConfigSchema, {
  io: 'input',
  target: 'draft-7',
  metadata: fieldRegistry,
});

mkdirSync(distDir, { recursive: true });

/**
 * Recursively prune properties that don't apply at `targetScope`.
 *
 * - A leaf with no `scope` keyword → kept (nothing to filter).
 * - A leaf with `scope: 'either'` → kept everywhere.
 * - A leaf with `scope: 'user'` → kept only in the user schema.
 * - A leaf with `scope: 'workspace'` → kept only in the workspace schema.
 * - An object with `properties` is walked; if EVERY child property is
 *   pruned, the parent object itself is pruned (no dangling empty
 *   sections in the IDE autocomplete).
 *
 * Defaults are preserved as-is — JSON Schema's `default` keyword lets the
 * IDE show the runtime default when hovering, even though the field is
 * optional in the input view.
 */
function pruneByScope(node, targetScope) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => pruneByScope(item, targetScope));

  const leafScope = node.scope;
  if (leafScope !== undefined && leafScope !== 'either' && leafScope !== targetScope) {
    return undefined; // signals to caller to drop this property
  }

  const out = { ...node };
  if (out.properties && typeof out.properties === 'object') {
    const newProps = {};
    let kept = 0;
    for (const [key, value] of Object.entries(out.properties)) {
      const filtered = pruneByScope(value, targetScope);
      if (filtered !== undefined) {
        newProps[key] = filtered;
        kept += 1;
      }
    }
    if (kept === 0 && leafScope === undefined) {
      // No descendants survived; drop the object itself unless it has its
      // own `scope` registered (which we'd already have honored above).
      return undefined;
    }
    out.properties = newProps;
    if (Array.isArray(out.required)) {
      out.required = out.required.filter((k) => k in newProps);
      if (out.required.length === 0) delete out.required;
    }
  }
  return out;
}

const writeSchema = (filename, schema) => {
  const path = resolve(distDir, filename);
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`, 'utf-8');
  console.log(`[build:schema] wrote ${path} (${JSON.stringify(schema).length} bytes)`);
};

writeSchema('config-schema.json', fullSchema);
writeSchema('config.workspace.schema.json', pruneByScope(fullSchema, 'workspace'));
writeSchema('config.user.schema.json', pruneByScope(fullSchema, 'user'));
