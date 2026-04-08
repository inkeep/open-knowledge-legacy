/**
 * V1b: Markdown round-trip fidelity WITH fixes applied.
 *
 * Fixes:
 * 1. Frontmatter: strip before parse, re-prepend on serialize
 * 2. Image: add @tiptap/extension-image
 * 3. Task list: add TaskList + TaskItem from @tiptap/extension-list
 * 4. JsxComponent: add custom void node extension
 * 5. Normalize-on-load: first round-trip normalizes formatting
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MarkdownManager } from '@tiptap/markdown';
import { prependFrontmatter, stripFrontmatter } from './editor/extensions/frontmatter';
import { sharedExtensions } from './editor/extensions/shared';
const dirname = import.meta.dirname ?? '.';
const fixturePath = resolve(dirname, '../content/test-fixture.md');
const input = readFileSync(fixturePath, 'utf-8');
console.log('=== V1b: Markdown Round-Trip WITH Fixes ===\n');
console.log(`Input file: ${fixturePath}`);
console.log(`Input length: ${input.length} bytes\n`);
// Create MarkdownManager with all extensions including fixes
const md = new MarkdownManager({ extensions: sharedExtensions });
// Helper: round-trip with frontmatter handling
function roundTrip(markdown) {
    const { frontmatter, body } = stripFrontmatter(markdown);
    const json = md.parse(body);
    const serialized = md.serialize(json);
    return prependFrontmatter(frontmatter, serialized);
}
// --- Cycle 1 (normalize-on-load) ---
console.log('--- Cycle 1: Parse → Serialize (with fixes) ---');
const output1 = roundTrip(input);
console.log(`Output length: ${output1.length} bytes`);
console.log(`Byte-identical to input: ${input === output1}\n`);
// Line-by-line diff
const inputLines = input.split('\n');
const outputLines = output1.split('\n');
const maxLines = Math.max(inputLines.length, outputLines.length);
const diffs = [];
for (let i = 0; i < maxLines; i++) {
    const il = inputLines[i] ?? '<missing>';
    const ol = outputLines[i] ?? '<missing>';
    if (il !== ol) {
        diffs.push({ line: i + 1, input: il, output: ol });
    }
}
if (diffs.length === 0) {
    console.log('Round-trip is BYTE-IDENTICAL. No differences found.\n');
}
else {
    console.log(`Found ${diffs.length} line differences:\n`);
    for (const d of diffs) {
        console.log(`  Line ${d.line}:`);
        console.log(`    IN:  ${JSON.stringify(d.input)}`);
        console.log(`    OUT: ${JSON.stringify(d.output)}`);
        console.log('');
    }
}
// --- Cycle 2 (convergence check) ---
console.log('--- Cycle 2: Convergence check ---');
const output2 = roundTrip(output1);
const converged = output1 === output2;
console.log(`Cycle 2 output length: ${output2.length} bytes`);
console.log(`Convergence (cycle2 === cycle1): ${converged}\n`);
if (!converged) {
    const o1Lines = output1.split('\n');
    const o2Lines = output2.split('\n');
    const max2 = Math.max(o1Lines.length, o2Lines.length);
    let convDiffCount = 0;
    for (let i = 0; i < max2; i++) {
        const a = o1Lines[i] ?? '<missing>';
        const b = o2Lines[i] ?? '<missing>';
        if (a !== b) {
            convDiffCount++;
            if (convDiffCount <= 10) {
                console.log(`  Line ${i + 1}:`);
                console.log(`    C1: ${JSON.stringify(a)}`);
                console.log(`    C2: ${JSON.stringify(b)}`);
            }
        }
    }
    if (convDiffCount > 10) {
        console.log(`  ... and ${convDiffCount - 10} more differences`);
    }
}
// --- Classification ---
console.log('\n--- Classification ---');
const checks = [
    { name: 'Frontmatter', found: (s) => /^---\ntitle:/.test(s) },
    { name: 'H1 heading', found: (s) => /^# /m.test(s) },
    { name: 'Bold text', found: (s) => /\*\*[^*]+\*\*/.test(s) },
    { name: 'Inline code', found: (s) => /`[^`]+`/.test(s) },
    { name: 'Link', found: (s) => /\[.+?\]\(.+?\)/.test(s) },
    { name: 'Fenced code (typescript)', found: (s) => /```typescript/.test(s) },
    { name: 'Fenced code (jsx-component)', found: (s) => /```jsx-component/.test(s) },
    { name: 'GFM table', found: (s) => /\|.*\|/.test(s) },
    { name: 'Blockquote', found: (s) => /^> /m.test(s) },
    { name: 'Horizontal rule', found: (s) => /^---$/m.test(s) },
    { name: 'Image', found: (s) => /!\[.*\]\(.*\)/.test(s) },
    { name: 'Task list checkbox', found: (s) => /- \[[ x]\]/.test(s) },
    { name: 'Ordered list', found: (s) => /^\d+\. /m.test(s) },
    { name: 'Nested unordered list', found: (s) => /^ {2}[-*] /m.test(s) },
];
for (const check of checks) {
    const inInput = check.found(input);
    const inOutput = check.found(output1);
    const status = inInput && inOutput ? 'PRESERVED' : inInput && !inOutput ? 'LOST' : 'N/A';
    console.log(`  ${check.name}: ${status}`);
}
// Summary
console.log('\n--- Summary ---');
console.log(`Total line differences: ${diffs.length}`);
console.log(`Convergence: ${converged ? 'YES' : 'NO'}`);
// Count LOC for fixes
console.log('\n--- Fix LOC count ---');
console.log('  frontmatter.ts: ~25 lines');
console.log('  Added extensions: Image, TaskList, TaskItem, JsxComponent');
console.log('  Normalize-on-load: pattern demonstrated in this test');
console.log('  Total estimated: ~80 lines (less than 150 estimate, extensions do most work)');
//# sourceMappingURL=v1b-roundtrip-test.js.map