/**
 * Engine invariants — grep-based guards ensuring the polish engine
 * never uses forbidden decoration primitives.
 *
 * D4 LOCKED: Decoration.replace({ block: true }) and atomicRanges
 * are forbidden — source must remain cursor-reachable.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = join(import.meta.dir);

function getEngineFiles(): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
  }
  walk(ENGINE_DIR);
  return files;
}

describe('engine invariants', () => {
  const engineFiles = getEngineFiles();

  test('no Decoration.replace({ block: true }) in engine modules', () => {
    for (const file of engineFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('Decoration.replace');
    }
  });

  test('no atomicRanges in engine modules', () => {
    for (const file of engineFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('atomicRanges');
    }
  });

  test('engine has at least one source file', () => {
    expect(engineFiles.length).toBeGreaterThan(0);
  });
});
