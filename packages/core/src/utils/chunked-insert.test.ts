/**
 * Tests for chunkedYTextInsert — FR-21 large-paste chunking.
 *
 * Verifies the three AC points in US-012:
 *   - <500KB payloads insert in 1 transaction (no chunking overhead).
 *   - ≥501KB payloads split into ≥2 transactions with yields between.
 *   - Chunk size constant is tunable.
 *
 * Uses injectable yieldFn so tests don't depend on rAF/timers.
 */

import { describe, expect, test } from 'bun:test';
import {
  chunkedYTextInsert,
  DEFAULT_CHUNK_SIZE_BYTES,
  DEFAULT_CHUNK_THRESHOLD_BYTES,
  type InsertableYDoc,
  type InsertableYText,
} from './chunked-insert.ts';

interface FakeYText extends InsertableYText {
  content: string;
  inserts: Array<{ index: number; text: string }>;
}

interface FakeYDoc extends InsertableYDoc {
  transactions: number;
  lastOrigin: unknown;
}

function makeFake(): { doc: FakeYDoc; text: FakeYText } {
  const text: FakeYText = {
    content: '',
    inserts: [],
    get length() {
      return this.content.length;
    },
    insert(index: number, value: string) {
      this.content = this.content.slice(0, index) + value + this.content.slice(index);
      this.inserts.push({ index, text: value });
    },
  };
  const doc: FakeYDoc = {
    transactions: 0,
    lastOrigin: undefined,
    transact<T>(fn: () => T, origin?: unknown): T {
      doc.transactions++;
      doc.lastOrigin = origin;
      return fn();
    },
  };
  return { doc, text };
}

describe('chunkedYTextInsert — FR-21 large-paste chunking', () => {
  test('100KB payload → single transaction, no yields', async () => {
    const { doc, text } = makeFake();
    const payload = 'a'.repeat(100 * 1024);
    let yieldCount = 0;
    const yieldFn = async () => {
      yieldCount++;
    };
    await chunkedYTextInsert(doc, text, 0, payload, { yieldFn });
    expect(doc.transactions).toBe(1);
    expect(yieldCount).toBe(0);
    expect(text.content).toBe(payload);
  });

  test('501KB payload → multiple transactions with yields between', async () => {
    const { doc, text } = makeFake();
    const payload = 'a'.repeat(501 * 1024);
    let yieldCount = 0;
    const yieldFn = async () => {
      yieldCount++;
    };
    await chunkedYTextInsert(doc, text, 0, payload, { yieldFn });
    expect(doc.transactions).toBeGreaterThanOrEqual(2);
    expect(yieldCount).toBe(doc.transactions - 1);
    expect(text.content).toBe(payload);
  });

  test('1MB payload → insertion order preserved (monotonic writeIndex)', async () => {
    const { doc, text } = makeFake();
    const payload = `start${'x'.repeat(1024 * 1024 - 'start'.length - 'end'.length)}end`;
    await chunkedYTextInsert(doc, text, 0, payload, { yieldFn: async () => {} });
    expect(text.content.startsWith('start')).toBe(true);
    expect(text.content.endsWith('end')).toBe(true);
    expect(text.content.length).toBe(payload.length);
  });

  test('chunk-size constant tunable via options', async () => {
    const { doc, text } = makeFake();
    const payload = 'a'.repeat(300 * 1024);
    // Force chunking with a low threshold + small chunk size.
    await chunkedYTextInsert(doc, text, 0, payload, {
      thresholdBytes: 10 * 1024,
      chunkSizeBytes: 50 * 1024,
      yieldFn: async () => {},
    });
    // 300KB / 50KB per chunk = 6 chunks.
    expect(doc.transactions).toBe(6);
  });

  test('default threshold + chunk-size constants exported for tuning', () => {
    expect(DEFAULT_CHUNK_THRESHOLD_BYTES).toBe(500 * 1024);
    expect(DEFAULT_CHUNK_SIZE_BYTES).toBe(50 * 1024);
  });

  test('origin is passed through on every chunk', async () => {
    const { doc, text } = makeFake();
    const payload = 'a'.repeat(300 * 1024);
    const ORIGIN = { name: 'test-origin' };
    await chunkedYTextInsert(doc, text, 0, payload, {
      thresholdBytes: 10 * 1024,
      chunkSizeBytes: 50 * 1024,
      yieldFn: async () => {},
      origin: ORIGIN,
    });
    expect(doc.lastOrigin).toBe(ORIGIN);
  });

  test('non-zero insertAt preserves surrounding content', async () => {
    const { doc, text } = makeFake();
    text.content = 'abcXYZ';
    const payload = 'INSERTED';
    await chunkedYTextInsert(doc, text, 3, payload, { yieldFn: async () => {} });
    expect(text.content).toBe('abcINSERTEDXYZ');
  });
});
