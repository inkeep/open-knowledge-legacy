import { describe, expect, test } from 'bun:test';
import { prependFrontmatter, stripFrontmatter } from './frontmatter';
describe('stripFrontmatter', () => {
    test('extracts frontmatter from standard YAML block', () => {
        const input = '---\ntitle: Hello\ntags: [a, b]\n---\n# Body';
        const { frontmatter, body } = stripFrontmatter(input);
        expect(frontmatter).toBe('---\ntitle: Hello\ntags: [a, b]\n---\n');
        expect(body).toBe('# Body');
    });
    test('returns empty frontmatter when none present', () => {
        const input = '# Just a heading\nSome content';
        const { frontmatter, body } = stripFrontmatter(input);
        expect(frontmatter).toBe('');
        expect(body).toBe(input);
    });
    test('does not match --- in the middle of content', () => {
        const input = '# Heading\n---\nstuff\n---\n';
        const { frontmatter, body } = stripFrontmatter(input);
        expect(frontmatter).toBe('');
        expect(body).toBe(input);
    });
    test('handles empty body after frontmatter', () => {
        const input = '---\ntitle: Empty\n---\n';
        const { frontmatter, body } = stripFrontmatter(input);
        expect(frontmatter).toBe('---\ntitle: Empty\n---\n');
        expect(body).toBe('');
    });
    test('handles empty string', () => {
        const { frontmatter, body } = stripFrontmatter('');
        expect(frontmatter).toBe('');
        expect(body).toBe('');
    });
});
describe('prependFrontmatter', () => {
    test('prepends frontmatter to body', () => {
        const result = prependFrontmatter('---\ntitle: X\n---\n', '# Body');
        expect(result).toBe('---\ntitle: X\n---\n# Body');
    });
    test('returns body unchanged when frontmatter is empty', () => {
        expect(prependFrontmatter('', '# Body')).toBe('# Body');
    });
});
describe('round-trip', () => {
    test('strip then prepend is identity', () => {
        const original = '---\ntitle: Test\ndate: 2026-01-01\n---\n# Content\n\nParagraph here.\n';
        const { frontmatter, body } = stripFrontmatter(original);
        const reassembled = prependFrontmatter(frontmatter, body);
        expect(reassembled).toBe(original);
    });
});
//# sourceMappingURL=frontmatter.test.js.map