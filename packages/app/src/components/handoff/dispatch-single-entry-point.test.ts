/**
 * AC9 regression test — "single outbound dispatch entry point".
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §5.2 + §5.3
 * (the ONE outbound-dispatch entry point arrow at `dispatch.ts`).
 *
 * Enforces: every mount surface (EditorHeader, CommandPalette, FileTree, any
 * future surface) goes through `useHandoffDispatch().dispatch()`. Direct imports
 * of `dispatchHandoff` / `dispatchCursor` / `openExternal` from
 * `@/lib/handoff/*` are ALLOWED inside `components/handoff/**` (the handoff
 * UI subpackage is allowed to use its own primitives — `OpenInAgentMenuItem`
 * legitimately uses `openExternal` for install + claude.ai fallback links)
 * and PROHIBITED elsewhere under `components/`.
 *
 * Why a text-search test rather than a lint rule: ESLint / Biome have no
 * ergonomic per-directory import allowlist. A Bun test with `readdirSync`
 * + literal `from '@/lib/handoff/...'` substring match gives us the same
 * enforcement in <5 lines per rule, runs in-band with the other fidelity
 * tests, and fails a PR at the exact file that introduced the direct import.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const COMPONENTS_DIR = new URL('..', import.meta.url).pathname; // = .../packages/app/src/components/
const HANDOFF_SUBDIR = 'handoff'; // allowlisted subdir (sibling of this file's parent)

/** Prohibited import substrings — straight string match in source text. */
const PROHIBITED_IMPORT_SUBSTRINGS = [
  "from '@/lib/handoff/dispatch'",
  'from "@/lib/handoff/dispatch"',
  "from '@/lib/handoff/cursor-two-step'",
  'from "@/lib/handoff/cursor-two-step"',
  "from '@/lib/handoff/open-external'",
  'from "@/lib/handoff/open-external"',
];

function listSourceFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === HANDOFF_SUBDIR) continue; // allowlisted
      out.push(...listSourceFilesRecursive(full));
    } else {
      if (!entry.name.endsWith('.tsx') && !entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      out.push(full);
    }
  }
  return out;
}

describe('AC9: single outbound dispatch entry point', () => {
  test('components/ (excluding components/handoff/) never imports dispatchHandoff / dispatchCursor / openExternal directly', () => {
    // Sanity: the components dir exists and contains real files.
    const stat = statSync(COMPONENTS_DIR);
    expect(stat.isDirectory()).toBe(true);
    const files = listSourceFilesRecursive(COMPONENTS_DIR);
    expect(files.length).toBeGreaterThan(10); // many components in the tree

    const violations: Array<{ file: string; substring: string }> = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf-8');
      for (const substring of PROHIBITED_IMPORT_SUBSTRINGS) {
        if (text.includes(substring)) {
          violations.push({ file, substring });
        }
      }
    }

    // Surface a helpful failure message that points at the exact file(s).
    if (violations.length > 0) {
      const lines = violations.map((v) => `  ${v.file} — imports ${v.substring}`);
      throw new Error(
        `AC9 violation — ${violations.length} direct import(s) of handoff dispatch primitives ` +
          `outside components/handoff/. Surfaces must route through useHandoffDispatch().dispatch().` +
          `\n${lines.join('\n')}`,
      );
    }
  });

  test('components/handoff/ (the handoff UI subpackage) is exempt — imports ARE allowed there', () => {
    // Positive assertion: prove the exemption is load-bearing. If someone
    // deletes the `HANDOFF_SUBDIR` exclusion in `listSourceFilesRecursive`,
    // this test surfaces the regression loudly.
    const handoffDir = join(COMPONENTS_DIR, HANDOFF_SUBDIR);
    expect(statSync(handoffDir).isDirectory()).toBe(true);
    const handoffFiles = readdirSync(handoffDir).filter(
      (n) => (n.endsWith('.ts') || n.endsWith('.tsx')) && !n.includes('.test.'),
    );
    const importFound = handoffFiles.some((name) => {
      const text = readFileSync(join(handoffDir, name), 'utf-8');
      return PROHIBITED_IMPORT_SUBSTRINGS.some((s) => text.includes(s));
    });
    // At least ONE file in components/handoff/ uses the primitives directly
    // (OpenInAgentMenuItem imports openExternal; useHandoffDispatch imports
    // dispatchHandoff). If this ever becomes false we've lost the handoff UI's
    // ability to actually dispatch — the exempted subdir is load-bearing.
    expect(importFound).toBe(true);
  });
});
