/**
 * V1a: Measure raw markdown round-trip fidelity WITHOUT any fixes.
 *
 * Uses @tiptap/markdown's MarkdownManager standalone (no browser needed).
 * Parses test-fixture.md → JSON → serializes back to markdown.
 * Diffs input vs output and checks convergence (cycle 2 === cycle 1).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
const dirname = import.meta.dirname ?? '.';
const fixturePath = resolve(dirname, '../content/test-fixture.md');
const input = readFileSync(fixturePath, 'utf-8');
console.log('=== V1a: Raw Markdown Round-Trip Fidelity Test ===\n');
console.log(`Input file: ${fixturePath}`);
console.log(`Input length: ${input.length} bytes\n`);
// Create MarkdownManager with same extensions as the editor
const md = new MarkdownManager({
    extensions: [StarterKit.configure({ undoRedo: false }), Link, Table],
});
// --- Cycle 1 ---
console.log('--- Cycle 1: Parse → Serialize ---');
const json1 = md.parse(input);
const output1 = md.serialize(json1);
console.log(`Output length: ${output1.length} bytes`);
console.log(`Byte-identical: ${input === output1}\n`);
// Line-by-line diff
const inputLines = input.split('\n');
const outputLines = output1.split('\n');
const maxLines = Math.max(inputLines.length, outputLines.length);
const diffs = [];
for (let i = 0; i < maxLines; i++) {
    const il = inputLines[i] ?? '<missing>';
    const ol = outputLines[i] ?? '<missing>';
    if (il !== ol) {
        diffs.push({ line: i + 1, type: 'changed', input: il, output: ol });
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
console.log('--- Cycle 2: Parse(output1) → Serialize ---');
const json2 = md.parse(output1);
const output2 = md.serialize(json2);
const converged = output1 === output2;
console.log(`Cycle 2 output length: ${output2.length} bytes`);
console.log(`Convergence (cycle2 === cycle1): ${converged}\n`);
if (!converged) {
    const o1Lines = output1.split('\n');
    const o2Lines = output2.split('\n');
    const max2 = Math.max(o1Lines.length, o2Lines.length);
    console.log('Convergence diff:');
    for (let i = 0; i < max2; i++) {
        const a = o1Lines[i] ?? '<missing>';
        const b = o2Lines[i] ?? '<missing>';
        if (a !== b) {
            console.log(`  Line ${i + 1}:`);
            console.log(`    C1: ${JSON.stringify(a)}`);
            console.log(`    C2: ${JSON.stringify(b)}`);
        }
    }
}
// --- Classification ---
console.log('\n--- Classification ---');
// Check specific patterns
const checks = [
    { name: 'Frontmatter', found: (s) => /^---\n/.test(s) },
    { name: 'H1 heading', found: (s) => /^# /m.test(s) },
    { name: 'Bold text', found: (s) => /\*\*[^*]+\*\*/.test(s) },
    { name: 'Inline code', found: (s) => /`[^`]+`/.test(s) },
    { name: 'Link', found: (s) => /\[.+?\]\(.+?\)/.test(s) },
    {
        name: 'Fenced code (typescript)',
        found: (s) => /```typescript/.test(s),
    },
    {
        name: 'Fenced code (jsx-component)',
        found: (s) => /```jsx-component/.test(s),
    },
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
console.log(`\nRaw output (cycle 1):\n`);
console.log(output1);
//# sourceMappingURL=v1a-roundtrip-test.js.map