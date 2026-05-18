import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type GenerateResult,
  generateInstructions,
  renderInstructionsFile,
} from './generate-instructions.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const SKILL_PATH = resolve(PKG_ROOT, 'assets/skills/open-knowledge/SKILL.md');
const INSTRUCTIONS_PATH = resolve(PKG_ROOT, 'src/mcp/instructions.ts');

describe('generateInstructions — extraction + round-trip', () => {
  test('round-trips: generated body matches the committed instructions.ts (idempotency gate)', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result = generateInstructions(skill);
    const rendered = renderInstructionsFile(result.body);
    const committed = readFileSync(INSTRUCTIONS_PATH, 'utf8');
    expect(rendered).toBe(committed);
  });

  test('extracts all 4 target H2 sections from real SKILL.md', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result = generateInstructions(skill);
    expect(result.body).toContain('## STOP — native tools on in-scope `.md` / `.mdx`');
    expect(result.body).toContain('## Reads — examples');
    expect(result.body).toContain('## Preview — open the browser at session start');
    expect(result.body).toContain('## Scope recap');
  });

  test('emits identity prefix at the head', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result = generateInstructions(skill);
    expect(
      result.body.startsWith('Open Knowledge is a markdown-CRDT knowledge base exposed via MCP.'),
    ).toBe(true);
  });

  test('emits pointer suffix at the tail', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result = generateInstructions(skill);
    expect(result.body).toContain(
      'Full guidance lives in the bundled `open-knowledge` skill at `~/.ok/skills/open-knowledge/SKILL.md`.',
    );
  });
});

describe('generateInstructions — missing-section detection', () => {
  test('throws with a clear error naming the renamed heading + listing actual H2 headings', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const tampered = skill.replace(
      '## STOP — native tools on in-scope `.md` / `.mdx`',
      '## STOP — native tools (renamed)',
    );
    let thrown: Error | undefined;
    try {
      generateInstructions(tampered);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeDefined();
    const msg = thrown?.message ?? '';
    expect(msg).toContain('missing required H2 section');
    expect(msg).toContain('## STOP — native tools on in-scope `.md` / `.mdx`');
    expect(msg).toContain('H2 headings actually found:');
    expect(msg).toContain('## STOP — native tools (renamed)');
  });

  test('lists all missing sections when multiple are renamed', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const tampered = skill
      .replace('## Reads — examples', '## Reads (renamed)')
      .replace('## Scope recap', '## Scope (renamed)');
    let thrown: Error | undefined;
    try {
      generateInstructions(tampered);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeDefined();
    const msg = thrown?.message ?? '';
    expect(msg).toContain('## Reads — examples');
    expect(msg).toContain('## Scope recap');
  });
});

describe('generateInstructions — byte budget', () => {
  test('emits an over-budget warning naming the heaviest section when body > 2 KB', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result = generateInstructions(skill);
    if (result.byteLength > 2048) {
      expect(result.warnings.length).toBeGreaterThan(0);
      const w = result.warnings.join('\n');
      expect(w).toContain('over Claude Code');
      expect(w).toContain('Heaviest section');
    } else {
      expect(result.warnings).toEqual([]);
    }
  });

  test('stays within the 8 KB structural ceiling (truncation / cache-cost guard)', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result = generateInstructions(skill);
    expect(result.byteLength).toBeLessThan(8192);
  });

  test('reports per-section byte lengths so maintainers can spot the heaviest', () => {
    const skill = readFileSync(SKILL_PATH, 'utf8');
    const result: GenerateResult = generateInstructions(skill);
    expect(Object.keys(result.sectionByteLengths)).toHaveLength(4);
    for (const bytes of Object.values(result.sectionByteLengths)) {
      expect(bytes).toBeGreaterThan(0);
    }
  });
});
