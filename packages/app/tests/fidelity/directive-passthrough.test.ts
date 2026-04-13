/**
 * Directive passthrough — R16(d).
 *
 * Verifies that remark-directive container/leaf/text directives
 * round-trip through the pipeline. remark-directive is registered
 * from day one per D12.
 *
 * Note: directives produce mdast nodes that get stored as jsxComponent
 * atoms via the raw-source capture pattern.
 */
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip, normalize } from './helpers';

describe('directive passthrough (R16d, D12)', () => {
  test('container directive round-trips byte-identically', () => {
    const input = ':::note\nThis is a note.\n:::\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('leaf directive round-trips byte-identically', () => {
    const input = '::video[Title]{src="video.mp4"}\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('text directive parses without error', () => {
    // Text (inline) directives are mapped to jsxComponent (block atom) —
    // they get extracted from inline context. This is a known limitation
    // until jsxInline PM node type is added.
    const input = 'A :abbr[HTML]{title="HyperText"} example.\n';
    expect(() => mdRoundTrip(input)).not.toThrow();
  });

  test('container directive does not crash parser', () => {
    expect(() => mdRoundTrip(':::warning\nBe careful!\n:::\n')).not.toThrow();
  });

  test('container directive convergence: f(f(x)) === f(x)', () => {
    const input = ':::note\nContent here.\n:::\n';
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });

  test('leaf directive convergence: f(f(x)) === f(x)', () => {
    const input = '::video[Title]{src="video.mp4"}\n';
    const first = mdRoundTrip(input);
    const second = mdRoundTrip(first);
    expect(normalize(second)).toBe(normalize(first));
  });
});
