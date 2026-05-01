
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ChunkedInsertError, HtmlPayloadTooLargeError } from '@inkeep/open-knowledge-core';

import {
  classifyError,
  logUnmappedLucideIcon,
  resetUnmappedLucideSeenForTest,
} from './instrument.ts';

describe('logUnmappedLucideIcon — once-per-process per-class dedup', () => {
  let origWarn: typeof console.warn;
  let warnings: string[];

  beforeEach(() => {
    resetUnmappedLucideSeenForTest();
    warnings = [];
    origWarn = console.warn;
    console.warn = (msg: unknown) => {
      warnings.push(typeof msg === 'string' ? msg : String(msg));
    };
  });

  afterEach(() => {
    console.warn = origWarn;
    resetUnmappedLucideSeenForTest();
  });

  test('emits on first call for a given class', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    expect(warnings).toHaveLength(1);
    const event = JSON.parse(warnings[0]);
    expect(event.event).toBe('clipboard-walker-unmapped-lucide-detected');
    expect(event.view).toBe('wysiwyg');
    expect(event.lucideClass).toBe('lucide-foo');
  });

  test('suppresses repeat calls for the same class', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    expect(warnings).toHaveLength(1);
  });

  test('emits independently for distinct classes', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-bar', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-baz', view: 'wysiwyg' });
    expect(warnings).toHaveLength(3);
    const events = warnings.map((w) => JSON.parse(w));
    expect(events.map((e) => e.lucideClass)).toEqual(['lucide-foo', 'lucide-bar', 'lucide-baz']);
  });

  test('dedup persists across distinct view values for the same class', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'source' });
    expect(warnings).toHaveLength(1);
  });

  test('emitted JSON shape carries event + view + lucideClass and nothing else', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    const event = JSON.parse(warnings[0]);
    expect(Object.keys(event).sort()).toEqual(['event', 'lucideClass', 'view']);
  });
});

describe('classifyError — taxonomy classifier for `errorClass` telemetry field', () => {
  test('HtmlPayloadTooLargeError instance returns its name', () => {
    const err = new HtmlPayloadTooLargeError('payload too large');
    expect(classifyError(err)).toBe('HtmlPayloadTooLargeError');
  });

  test('ChunkedInsertError instance returns its name', () => {
    const err = new ChunkedInsertError('insert failed', {
      chunksCompleted: 1,
      totalChunks: 5,
      bytesWritten: 100,
      bytesRemaining: 400,
      cause: new Error('boom'),
    });
    expect(classifyError(err)).toBe('ChunkedInsertError');
  });

  test('Error subclass with non-default `name` returns the custom name', () => {
    class FooError extends Error {
      override name = 'FooError';
    }
    expect(classifyError(new FooError('foo'))).toBe('FooError');
  });

  test('plain `new Error()` (default name === "Error") returns undefined', () => {
    expect(classifyError(new Error('boom'))).toBeUndefined();
  });

  test('non-Error thrown values return undefined', () => {
    expect(classifyError('string')).toBeUndefined();
    expect(classifyError(42)).toBeUndefined();
    expect(classifyError(null)).toBeUndefined();
    expect(classifyError(undefined)).toBeUndefined();
    expect(classifyError({ message: 'plain object' })).toBeUndefined();
  });
});
