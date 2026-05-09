import { describe, expect, test } from 'bun:test';
import { mdRoundTrip } from './helpers';

describe('G2 — GFM table column-padding non-preservation (deferred bug)', () => {
  test.skip('hand-aligned column padding survives round-trip (currently fails — bytes shift to canonical width)', () => {
    const input = '| h1   | h2  |\n| ---- | --- |\n| a    | b   |\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});

describe('G9 — Setext heading + adjacent paragraph blank-line insertion (deferred bug)', () => {
  test.skip('setext H1 immediately followed by paragraph survives without synthesized blank line (currently fails)', () => {
    const input = 'H\n=====\nP\n';
    expect(mdRoundTrip(input)).toBe(input);
  });

  test.skip('setext H2 immediately followed by paragraph survives without synthesized blank line (currently fails)', () => {
    const input = 'H\n-----\nP\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});

describe('QA-010 — WYSIWYG backslash over-escape on serialize (deferred bug)', () => {
  test.skip('paste of `\\*` (backslash + literal asterisk) survives round-trip without doubled backslash (currently fails)', () => {
    const input = 'a \\* b\n';
    expect(mdRoundTrip(input)).toBe(input);
  });
});
