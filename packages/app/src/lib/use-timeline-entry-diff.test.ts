import { describe, expect, test } from 'bun:test';
import { HISTORICAL_CONTENT_CACHE_LIMIT, HistoricalContentCache } from './use-timeline-entry-diff';

describe('HistoricalContentCache', () => {
  test('get on miss returns undefined', () => {
    const cache = new HistoricalContentCache();
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('set/get round-trip', () => {
    const cache = new HistoricalContentCache();
    cache.set('sha1', 'content1');
    expect(cache.get('sha1')).toBe('content1');
  });

  test('get re-inserts to MRU position', () => {
    const cache = new HistoricalContentCache();
    // Fill to limit
    for (let i = 0; i < HISTORICAL_CONTENT_CACHE_LIMIT; i++) {
      cache.set(`sha${i}`, `content${i}`);
    }
    // Access sha0 to move it to MRU
    cache.get('sha0');
    // Add one more — sha1 (now LRU) should be evicted, sha0 survives
    cache.set('shaNew', 'contentNew');
    expect(cache.get('sha0')).toBe('content0');
    expect(cache.get('sha1')).toBeUndefined();
  });

  test('eviction at LIMIT+1 drops the LRU entry', () => {
    const cache = new HistoricalContentCache();
    for (let i = 0; i < HISTORICAL_CONTENT_CACHE_LIMIT; i++) {
      cache.set(`sha${i}`, `content${i}`);
    }
    expect(cache.size).toBe(HISTORICAL_CONTENT_CACHE_LIMIT);
    // Adding one more should evict sha0 (insertion-order LRU)
    cache.set('shaExtra', 'contentExtra');
    expect(cache.size).toBe(HISTORICAL_CONTENT_CACHE_LIMIT);
    expect(cache.get('sha0')).toBeUndefined();
    expect(cache.get('shaExtra')).toBe('contentExtra');
  });

  test('clear empties the map', () => {
    const cache = new HistoricalContentCache();
    cache.set('sha1', 'content1');
    cache.set('sha2', 'content2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('sha1')).toBeUndefined();
  });
});
