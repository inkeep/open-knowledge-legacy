/**
 * D19 enforcement — `no-loosely-typed-webcontents-ipc` lint rule.
 *
 * Forbids direct `webContents.send(...)`, `ipcMain.handle(...)`, and
 * `ipcRenderer.invoke/on/once(...)` calls in `packages/desktop/src/` outside
 * the allowlisted IPC wrapper files. Consumers must route through the typed
 * factories from `src/shared/ipc-invoke.ts` + `src/shared/ipc-handler.ts`.
 *
 * Implementation note: spec D19 originally targeted Biome v2 GritQL custom
 * rules for this enforcement. Biome 2.4's `plugins` config field is scoped
 * to assist actions / refactors, not pure lint rules — GritQL custom lint
 * rules are roadmapped but not shipping in this version. Per the spec's §16
 * STOP_IF escape hatch, we fall back to I3 (CI grep assertion) implemented
 * as a Bun test. Same enforcement guarantee, same `bun run check` gating.
 *
 * If Biome ships GritQL lint plugins in a future minor and the test ratchet
 * gets noisy, port the patterns into `biome.jsonc#plugins` and delete this
 * test file.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', 'src');

/** Files that ARE allowed to use raw electron IPC primitives — they ARE the wrappers. */
const ALLOWLIST: ReadonlySet<string> = new Set([
  'shared/ipc-invoke.ts',
  'shared/ipc-handler.ts',
  'shared/ipc-channels.ts',
  'shared/ipc-events.ts',
  'preload/index.ts',
  'main/index.ts',
]);

/** Patterns that, when found OUTSIDE the allowlist, fail this rule. */
const BANNED_PATTERNS: ReadonlyArray<{ pattern: RegExp; description: string }> = [
  {
    pattern: /\bwebContents\.send\s*\(/,
    description: 'webContents.send — use sendToRenderer typed wrapper instead',
  },
  {
    pattern: /\bipcMain\.handle\s*\(/,
    description: 'ipcMain.handle — use createHandler from src/shared/ipc-handler.ts',
  },
  {
    pattern: /\bipcMain\.on\s*\(/,
    description: 'ipcMain.on — use createHandler from src/shared/ipc-handler.ts',
  },
  {
    pattern: /\bipcRenderer\.invoke\s*\(/,
    description: 'ipcRenderer.invoke — use createInvoker from src/shared/ipc-invoke.ts',
  },
  {
    pattern: /\bipcRenderer\.on\s*\(/,
    description: 'ipcRenderer.on — use the bridge subscription methods (preload-side wrappers)',
  },
  {
    pattern: /\bipcRenderer\.once\s*\(/,
    description: 'ipcRenderer.once — use the bridge subscription methods (preload-side wrappers)',
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      yield full;
    }
  }
}

interface Violation {
  file: string;
  line: number;
  match: string;
  rule: string;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).split(sep).join('/');
    if (ALLOWLIST.has(rel)) continue;
    const lines = readFileSync(file, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      for (const { pattern, description } of BANNED_PATTERNS) {
        const m = line.match(pattern);
        if (m) {
          violations.push({
            file: rel,
            line: idx + 1,
            match: m[0],
            rule: description,
          });
        }
      }
    });
  }
  return violations;
}

describe('D19 — no-loosely-typed-webcontents-ipc', () => {
  test('packages/desktop/src/ contains no raw electron IPC calls outside the allowlist', () => {
    const violations = scan();
    if (violations.length > 0) {
      const lines = violations.map((v) => `  ${v.file}:${v.line} → ${v.match} (${v.rule})`);
      throw new Error(
        [
          'D19 violation — direct electron IPC primitive used outside the typed wrappers:',
          ...lines,
          '',
          'Fix: route through createInvoker / createHandler from packages/desktop/src/shared/.',
        ].join('\n'),
      );
    }
    expect(violations).toEqual([]);
  });

  test('the allowlist itself is non-empty and references real files', () => {
    expect(ALLOWLIST.size).toBeGreaterThan(0);
    for (const allowed of ALLOWLIST) {
      const full = join(SRC_ROOT, allowed.split('/').join(sep));
      expect(() => statSync(full)).not.toThrow();
    }
  });

  test('removing the allowlist would surface real raw-IPC use (positive regression)', () => {
    // Mutation test — re-run the scan with an EMPTY allowlist; this should
    // surface known-good usage in the wrapper files, proving the scan is
    // actually reading the right files. If this test passes with an empty
    // allowlist, the BANNED_PATTERNS regexes don't match anything.
    let mutationCount = 0;
    for (const file of walk(SRC_ROOT)) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      for (const line of lines) {
        for (const { pattern } of BANNED_PATTERNS) {
          if (pattern.test(line)) {
            mutationCount++;
            break;
          }
        }
      }
    }
    expect(mutationCount).toBeGreaterThan(0);
  });
});
