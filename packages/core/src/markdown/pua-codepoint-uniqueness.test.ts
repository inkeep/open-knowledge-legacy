import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PUA_LITERAL_RE = /\\u(E[01][0-9A-Fa-f]{2})/g;

function listMarkdownSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.test.ts'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile());
}

function extractPuaCodepoints(source: string): Set<string> {
  const found = new Set<string>();
  let match: RegExpExecArray | null = PUA_LITERAL_RE.exec(source);
  while (match !== null) {
    if (match[1]) found.add(match[1].toUpperCase());
    match = PUA_LITERAL_RE.exec(source);
  }
  PUA_LITERAL_RE.lastIndex = 0;
  return found;
}

describe('PUA codepoint uniqueness across markdown guard files', () => {
  test('no codepoint in U+E000–U+E1FF is declared by more than one source file', () => {
    const files = listMarkdownSourceFiles(__dirname);
    expect(files.length).toBeGreaterThan(0);

    const ownerByCodepoint = new Map<string, string[]>();
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      const codepoints = extractPuaCodepoints(source);
      const fileBasename = path.slice(__dirname.length + 1);
      for (const cp of codepoints) {
        const existing = ownerByCodepoint.get(cp) ?? [];
        existing.push(fileBasename);
        ownerByCodepoint.set(cp, existing);
      }
    }

    const collisions: Array<{ codepoint: string; files: string[] }> = [];
    for (const [cp, owners] of ownerByCodepoint) {
      if (owners.length > 1) {
        collisions.push({ codepoint: `U+${cp}`, files: owners });
      }
    }

    if (collisions.length > 0) {
      const detail = collisions
        .map((c) => `  ${c.codepoint} declared in: ${c.files.join(', ')}`)
        .join('\n');
      throw new Error(
        `PUA codepoint collision detected across guard files:\n${detail}\n\n` +
          `Each guard layer (R23 autolink, FR-2 entity-ref, FR-14 backslash-escape) reserves its own slab of the U+E000–U+E1FF range. A new guard must use a codepoint not declared by any other guard.\n` +
          "Resolution: pick a codepoint not currently owned, update the new guard's JSDoc, and update the cross-references in the existing guards' JSDoc.",
      );
    }

    expect(ownerByCodepoint.size).toBeGreaterThan(0);
  });
});
