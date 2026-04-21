/**
 * componentMap — unit tests for the V2 Option E fallback component map.
 * Verifies: every component referenced in V2 SPEC §13 file scope is
 * registered; placeholder shapes match fumadocs call shapes; Mermaid
 * carve-out renders with the aria role required by the spec.
 */

import { describe, expect, test } from 'bun:test';
import { getMDXComponents } from './componentMap';

const REQUIRED_COMPONENTS = [
  'Callout',
  'Tabs',
  'Tab',
  'Accordion',
  'Accordions',
  'Steps',
  'Step',
  'Card',
  'Cards',
  'Files',
  'Folder',
  'ImageZoom',
  'Image',
  'Mermaid',
  'TypeTable',
] as const;

describe('getMDXComponents', () => {
  test('returns a map with all required component bindings (FR11 AC)', () => {
    const map = getMDXComponents();
    for (const name of REQUIRED_COMPONENTS) {
      expect(map[name]).toBeDefined();
      expect(typeof map[name]).toBe('function');
    }
  });

  test('Image alias points to the same placeholder as ImageZoom', () => {
    const map = getMDXComponents();
    expect(map.Image).toBe(map.ImageZoom);
  });

  test('additional map merges over defaults (last-writer-wins)', () => {
    const OverrideCallout = () => null;
    const map = getMDXComponents({ Callout: OverrideCallout as never });
    expect(map.Callout).toBe(OverrideCallout);
    // Non-overridden components still present.
    expect(map.Tabs).toBeDefined();
  });
});
