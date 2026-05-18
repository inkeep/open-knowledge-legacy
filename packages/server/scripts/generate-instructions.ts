#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const SKILL_PATH = resolve(PKG_ROOT, 'assets/skills/open-knowledge/SKILL.md');
const INSTRUCTIONS_PATH = resolve(PKG_ROOT, 'src/mcp/instructions.ts');

const IDENTITY_PREFIX = 'Open Knowledge is a markdown-CRDT knowledge base exposed via MCP.';
const POINTER_SUFFIX =
  'Full guidance lives in the bundled `open-knowledge` skill at `~/.ok/skills/open-knowledge/SKILL.md`.';

const TARGET_HEADINGS = [
  '## STOP — native tools on in-scope `.md` / `.mdx`',
  '## Reads — examples',
  '## Preview — open the browser at session start',
  '## Scope recap',
] as const;

const CLAUDE_CODE_INSTRUCTIONS_CAP_BYTES = 2048;

export interface GenerateResult {
  body: string;
  byteLength: number;
  sectionByteLengths: Record<string, number>;
  warnings: string[];
}

function extractSection(lines: string[], heading: string): string | null {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === heading) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function listH2Headings(lines: string[]): string[] {
  return lines.filter((l) => l.startsWith('## '));
}

export function generateInstructions(skillMarkdown: string): GenerateResult {
  const lines = skillMarkdown.split('\n');
  const sections: string[] = [];
  const sectionByteLengths: Record<string, number> = {};
  const missing: string[] = [];

  for (const heading of TARGET_HEADINGS) {
    const content = extractSection(lines, heading);
    if (content === null) {
      missing.push(heading);
      continue;
    }
    sections.push(`${heading}\n${content}`);
    sectionByteLengths[heading] = Buffer.byteLength(content, 'utf8');
  }

  if (missing.length > 0) {
    const found = listH2Headings(lines);
    const lines_out = [
      'generate-instructions: missing required H2 section(s) in SKILL.md:',
      ...missing.map((m) => `  - ${m}`),
      '',
      'H2 headings actually found:',
      ...found.map((f) => `  - ${f}`),
    ];
    throw new Error(lines_out.join('\n'));
  }

  const body = [IDENTITY_PREFIX, '', ...sections, '', POINTER_SUFFIX, ''].join('\n');
  const byteLength = Buffer.byteLength(body, 'utf8');

  const warnings: string[] = [];
  if (byteLength > CLAUDE_CODE_INSTRUCTIONS_CAP_BYTES) {
    const heaviest = Object.entries(sectionByteLengths).sort(([, a], [, b]) => b - a)[0];
    warnings.push(
      `generate-instructions: body is ${byteLength} bytes, over Claude Code's ${CLAUDE_CODE_INSTRUCTIONS_CAP_BYTES}-byte instructions cap. Heaviest section: ${heaviest[0]} (${heaviest[1]} bytes). Tighten SKILL.md or split the section.`,
    );
  }

  return { body, byteLength, sectionByteLengths, warnings };
}

export function renderInstructionsFile(body: string): string {
  const escaped = body.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `/**
 * MCP \`instructions\` handshake string — emitted on \`initialize\`.
 *
 * GENERATED FILE — do not edit by hand. Canonical source is
 * \`packages/server/assets/skills/open-knowledge/SKILL.md\`. Regenerate via:
 *
 *     bun run packages/server/scripts/generate-instructions.ts
 *
 * CI gate (\`bun run check\`) runs the same script with \`--check\` and fails
 * on drift. See \`packages/server/scripts/generate-instructions.ts\` for the
 * extraction contract (4 H2 sections by exact-match heading text).
 *
 * Note: legacy comment said "compressed to ≤ ~1,500 bytes" for Claude's
 * 2 KB per-server instructions cap. The generated body currently exceeds
 * that cap (~7 KB); a warning fires when over 2 KB. Tightening SKILL.md
 * sections is the follow-up.
 */
import type { Config } from '../config/schema.ts';

export function buildInstructions(_content: Config['content']): string {
  return \`${escaped}\`;
}
`;
}

function runCli(): void {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  const skill = readFileSync(SKILL_PATH, 'utf8');
  let result: GenerateResult;
  try {
    result = generateInstructions(skill);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  for (const w of result.warnings) {
    console.warn(w);
  }

  const rendered = renderInstructionsFile(result.body);

  if (checkMode) {
    const existing = readFileSync(INSTRUCTIONS_PATH, 'utf8');
    if (existing !== rendered) {
      console.error(
        `generate-instructions --check: ${INSTRUCTIONS_PATH} is out of sync with SKILL.md.\n` +
          `Regenerate via: bun run packages/server/scripts/generate-instructions.ts`,
      );
      process.exit(1);
    }
    console.log(
      `generate-instructions --check: instructions.ts in sync (${result.byteLength} bytes).`,
    );
    return;
  }

  writeFileSync(INSTRUCTIONS_PATH, rendered);
  console.log(`generate-instructions: wrote ${INSTRUCTIONS_PATH} (${result.byteLength} bytes).`);
}

if (import.meta.main) {
  runCli();
}
