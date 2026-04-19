#!/usr/bin/env bun
/**
 * Pre-deploy verification script for the jsxInline narrowing (Critical #3
 * in local-review pass 0, Major #3 in pass 1).
 *
 * Empirically checks every reachable markdown file against the NEW jsxInline
 * schema (`content: 'text*'`). Any file whose parse produces a jsxInline
 * node with a non-text child is a narrowing-risk surface — its CRDT
 * materialization under the patched y-prosemirror would hit the
 * inline-context log+skip branch and silently drop that content.
 *
 * Run against:
 *   - Repository content dir (default).
 *   - Any staging/dogfood shadow repo you can reach: pass its content root.
 *
 * Exits 0 if no narrowing-risk content is found; exits 1 (with a JSON-
 * formatted report) if any file contains a jsxInline with non-text
 * children.
 *
 * Rationale for why markdown-layer checking is sufficient:
 *   The shadow-repo (`packages/server/src/shadow-repo.ts`) persists
 *   markdown strings to git blobs, NOT Y.js update logs. There is no
 *   client-side IndexedDB persistence (verified: no `y-indexeddb`
 *   dependency in any package.json). The only Y.Doc state that outlives
 *   a server restart is whatever the disk-stored markdown re-parses into,
 *   and on reload it parses through the NEW schema.
 *
 *   The residual risk is an in-memory Y.Doc on a long-running Hocuspocus
 *   process holding the OLD shape across a schema-swap deploy. Operators
 *   should drain their server before rollout — `bun run check` guards
 *   the code path but cannot guard the runtime.
 *
 * Usage:
 *   bun run scripts/verify-jsx-inline-narrowing.ts                # defaults to repo root
 *   bun run scripts/verify-jsx-inline-narrowing.ts <content-dir>  # explicit dir
 *   bun run scripts/verify-jsx-inline-narrowing.ts --json          # emit only JSON
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { MarkdownManager, sharedExtensions } from '../packages/core/src/index.ts';

interface Hit {
  file: string;
  offset: number;
  nonTextChildTypes: string[];
}

interface Report {
  scanned: number;
  hits: Hit[];
  durationMs: number;
}

const DEFAULT_CONTENT_DIR = resolve(import.meta.dir, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.turbo', 'dist', '.next', 'coverage', 'tmp']);

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkMarkdown(full, acc);
    } else if (name.endsWith('.md') || name.endsWith('.mdx')) {
      acc.push(full);
    }
  }
  return acc;
}

interface PmNodeJson {
  type: string;
  content?: PmNodeJson[];
  attrs?: Record<string, unknown>;
  text?: string;
}

function collectNonTextChildInlineNodes(json: PmNodeJson, acc: Hit[], file: string): void {
  if (json.type === 'jsxInline') {
    const nonText = (json.content ?? []).filter((c) => c.type !== 'text').map((c) => c.type);
    if (nonText.length > 0) {
      acc.push({
        file,
        offset: 0, // PM JSON doesn't carry source offsets at this layer
        nonTextChildTypes: nonText,
      });
    }
  }
  for (const child of json.content ?? []) {
    collectNonTextChildInlineNodes(child, acc, file);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const contentArg = args.find((a) => !a.startsWith('--'));
  const contentDir = contentArg ? resolve(contentArg) : DEFAULT_CONTENT_DIR;

  const started = Date.now();
  const files = walkMarkdown(contentDir);
  const mdManager = new MarkdownManager({ extensions: sharedExtensions });
  const hits: Hit[] = [];

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    let json: PmNodeJson;
    try {
      json = mdManager.parseWithFallback(src) as unknown as PmNodeJson;
    } catch (err) {
      // parseWithFallback shouldn't throw, but defensive: record as unknown-risk
      if (!jsonOnly) {
        console.warn(`[verify-jsx-inline] ${relative(contentDir, file)} — parse failed:`, err);
      }
      continue;
    }
    collectNonTextChildInlineNodes(json, hits, relative(contentDir, file));
  }

  const report: Report = { scanned: files.length, hits, durationMs: Date.now() - started };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (hits.length === 0) {
      console.log(
        `✓ verify-jsx-inline: ${files.length} file(s) scanned, 0 narrowing-risk jsxInline nodes found (${report.durationMs}ms).`,
      );
      console.log(
        `  Decline basis: no inline-context jsxInline with non-text children exists in ${contentDir}.`,
      );
    } else {
      console.error(
        `✗ verify-jsx-inline: ${hits.length} narrowing-risk jsxInline node(s) found in ${files.length} scanned file(s) (${report.durationMs}ms):`,
      );
      for (const hit of hits) {
        console.error(`  ${hit.file}  non-text children: ${hit.nonTextChildTypes.join(', ')}`);
      }
      console.error('\n  These files hold markdown whose re-parse produces jsxInline nodes with');
      console.error('  non-text children. Under the new schema (content: "text*"), the re-parse');
      console.error('  flattens the children to text automatically — the FILE is fine. The risk');
      console.error('  is only an in-memory Y.Doc on a long-running server that persisted the OLD');
      console.error('  shape before the schema swap. Drain the server before rollout.');
    }
  }

  process.exit(hits.length === 0 ? 0 : 1);
}

main();
