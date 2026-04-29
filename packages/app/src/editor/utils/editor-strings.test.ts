import { describe, expect, test } from 'bun:test';
import { DOCUMENT_ROOT_LABEL, formatContainerAriaLabel } from './editor-strings';

describe('formatContainerAriaLabel', () => {
  test('empty container emits "(empty)"', () => {
    expect(formatContainerAriaLabel('Cards', 'Card', 0)).toBe('Cards (empty)');
  });

  test('single child uses "item" (Intl.PluralRules "one")', () => {
    expect(formatContainerAriaLabel('Cards', 'Card', 1)).toBe('Cards with 1 item');
    expect(formatContainerAriaLabel('Steps', 'Step', 1)).toBe('Steps with 1 item');
  });

  test('multiple children uses "items"', () => {
    expect(formatContainerAriaLabel('Cards', 'Card', 3)).toBe('Cards with 3 items');
    expect(formatContainerAriaLabel('Cards', 'Card', 10)).toBe('Cards with 10 items');
  });

  test('negative child counts collapse to empty state', () => {
    expect(formatContainerAriaLabel('Cards', 'Card', -1)).toBe('Cards (empty)');
  });

  test('irregular noun is not inflected — "item/items" stays fixed', () => {
    // Previously this helper used `(childName + 's')` which produced
    // "Cards with 3 Foots" for an irregular childName. The new shape
    // ignores childName for the output prose so irregular plurals are
    // unreachable.
    expect(formatContainerAriaLabel('Feet', 'Foot', 3)).toBe('Feet with 3 items');
  });
});

describe('DOCUMENT_ROOT_LABEL', () => {
  test('is the expected English string (fine to change; codify here so a11y tests can import it)', () => {
    expect(DOCUMENT_ROOT_LABEL).toBe('Document');
  });
});
