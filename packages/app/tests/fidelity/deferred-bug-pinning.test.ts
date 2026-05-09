import { describe, expect, test } from 'bun:test';
import { mdRoundTrip } from './helpers';

describe('G2 — GFM table column-padding preservation', () => {
  test('hand-aligned column padding survives round-trip', () => {
    const input = '| h1   | h2  |\n| ---- | --- |\n| a    | b   |\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});

describe('G9 — Setext heading + adjacent paragraph blank-line insertion', () => {
  test('setext H1 immediately followed by paragraph survives without synthesized blank line', () => {
    const input = 'H\n=====\nP\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('setext H2 immediately followed by paragraph survives without synthesized blank line', () => {
    const input = 'H\n-----\nP\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});

describe('QA-010 — backslash before structurally-ambiguous chars survives round-trip', () => {
  test('escaped asterisk `\\*` survives byte-identical round-trip', () => {
    const input = 'a \\* b\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('escaped backslash `\\\\` survives byte-identical round-trip', () => {
    const input = 'a \\\\ b\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test('multiple `\\*` patterns in one paragraph survive byte-identical round-trip', () => {
    const input = 'a \\* b \\* c\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});
