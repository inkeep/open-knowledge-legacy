import { describe, expect, test } from 'bun:test';
import type { KeepaliveScheduler, MinimalWebSocket } from './keepalive.ts';
import { startKeepalive } from './keepalive.ts';

// ── Deterministic scheduler ─────────────────────────────────────────────
// Holds timers in a sorted queue keyed by dueAt. `advance(ms)` fires every
// timer whose deadline has been reached. No wall-clock dependency.

interface ManualScheduler extends KeepaliveScheduler {
  advance: (ms: number) => void;
  pending: () => number;
}

function createScheduler(): ManualScheduler {
  type Entry = { id: number; cb: () => void; dueAt: number };
  let now = 0;
  let nextId = 1;
  const queue: Entry[] = [];
  return {
    setTimeout: (cb, ms) => {
      const id = nextId++;
      queue.push({ id, cb, dueAt: now + ms });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (handle) => {
      const id = handle as unknown as number;
      const idx = queue.findIndex((e) => e.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    advance(ms) {
      now += ms;
      // Fire every due timer; a timer's callback can schedule new ones with
      // future deadlines — they're only fired if they become due within the
      // same advance() call.
      for (let pass = 0; pass < 100; pass++) {
        const due = queue.filter((e) => e.dueAt <= now);
        if (due.length === 0) return;
        for (const e of due) {
          const idx = queue.indexOf(e);
          if (idx >= 0) queue.splice(idx, 1);
          e.cb();
        }
      }
    },
    pending: () => queue.length,
  };
}

// ── Fake WebSocket ─────────────────────────────────────────────────────
// Tracks listeners, exposes `fire('open'|'close'|'error')` so tests drive
// the connection lifecycle deterministically.

class FakeWebSocket implements MinimalWebSocket {
  readyState = 0; // CONNECTING
  url: string;
  closed = false;
  private listeners: Record<string, Array<() => void>> = {
    open: [],
    close: [],
    error: [],
  };
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void {
    this.listeners[type].push(listener);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.fire('close');
  }
  fire(type: 'open' | 'close' | 'error'): void {
    if (type === 'open') this.readyState = 1; // OPEN
    if (type === 'close') this.readyState = 3;
    for (const l of this.listeners[type]) l();
  }
}

function runMicrotasks(): Promise<void> {
  return new Promise((done) => {
    setImmediate(done);
  });
}

describe('startKeepalive', () => {
  test('connects immediately when resolveWsUrl returns a URL', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });

    await runMicrotasks();
    expect(opened.length).toBe(1);
    expect(opened[0].url).toContain('ws://localhost:12345/collab/keepalive');
    expect(opened[0].url).toContain(`pid=${process.pid}`);

    // Simulate server accepting the upgrade
    opened[0].fire('open');
    expect(handle.isConnected()).toBe(true);
    handle.close();
  });

  test('schedules a reconnect when resolveWsUrl returns undefined', async () => {
    const scheduler = createScheduler();
    let calls = 0;
    const handle = startKeepalive({
      resolveWsUrl: async () => {
        calls++;
        return undefined;
      },
      scheduler,
      initialBackoffMs: 100,
      createWebSocket: () => new FakeWebSocket('unused'),
    });

    await runMicrotasks();
    expect(calls).toBe(1);
    expect(scheduler.pending()).toBe(1); // reconnect timer armed

    scheduler.advance(100);
    await runMicrotasks();
    expect(calls).toBe(2); // retried

    handle.close();
  });

  test('reconnects with exponential backoff after server-side close', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });

    await runMicrotasks();
    expect(opened.length).toBe(1);

    // First disconnect — reconnects after 100ms
    opened[0].fire('close');
    expect(scheduler.pending()).toBe(1);
    scheduler.advance(100);
    await runMicrotasks();
    expect(opened.length).toBe(2);

    // Second disconnect without ever opening — backoff doubles to 200ms
    opened[1].fire('close');
    scheduler.advance(100);
    await runMicrotasks();
    expect(opened.length).toBe(2); // not yet fired
    scheduler.advance(100); // total 200ms elapsed since close
    await runMicrotasks();
    expect(opened.length).toBe(3);

    handle.close();
  });

  test('resets backoff after a successful open', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      initialBackoffMs: 100,
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });

    await runMicrotasks();
    // Connect: fires open, then closes. Backoff should STAY at initial (100ms).
    opened[0].fire('open');
    opened[0].fire('close');
    scheduler.advance(100);
    await runMicrotasks();
    expect(opened.length).toBe(2);

    // Second connection never opens — backoff doubles to 200ms
    opened[1].fire('close');
    scheduler.advance(100);
    await runMicrotasks();
    expect(opened.length).toBe(2);
    scheduler.advance(100);
    await runMicrotasks();
    expect(opened.length).toBe(3);

    handle.close();
  });

  test('emits a debug breadcrumb on websocket error events', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const debugEvents: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
    const logger = {
      sessionId: 'keepalive-test',
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: (msg: string, ctx: Record<string, unknown> = {}) => {
        debugEvents.push({ msg, ctx });
      },
      child: () => logger,
      asCallback: () => () => {},
    };
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      logger,
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });

    await runMicrotasks();
    opened[0].fire('error');

    expect(debugEvents).toContainEqual({
      msg: 'websocket error observed',
      ctx: {
        url: 'ws://localhost:12345',
        readyState: 0,
        reason: 'error-event',
      },
    });

    handle.close();
  });

  test('close() stops further reconnects and closes the WS', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      initialBackoffMs: 100,
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });

    await runMicrotasks();
    expect(opened.length).toBe(1);

    handle.close();
    expect(opened[0].closed).toBe(true);
    expect(scheduler.pending()).toBe(0);

    // Advance past any backoff — no more WS should open.
    scheduler.advance(60_000);
    await runMicrotasks();
    expect(opened.length).toBe(1);
  });

  test('close() is idempotent', () => {
    const handle = startKeepalive({
      resolveWsUrl: async () => undefined,
      initialBackoffMs: 100,
      createWebSocket: () => new FakeWebSocket('unused'),
    });
    handle.close();
    expect(() => handle.close()).not.toThrow();
  });

  test('URL omits connectionId query param when option is not set', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });
    await runMicrotasks();
    expect(opened.length).toBe(1);
    expect(opened[0].url).not.toContain('connectionId=');
    handle.close();
  });

  test('URL contains connectionId= when option is set (deterministic cleanup)', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      connectionId: 'abcdef12-3456-7890-abcd-ef1234567890',
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });
    await runMicrotasks();
    expect(opened.length).toBe(1);
    expect(opened[0].url).toContain('connectionId=abcdef12-3456-7890-abcd-ef1234567890');
    expect(opened[0].url).toContain(`pid=${process.pid}`);
    handle.close();
  });

  test('URL percent-encodes connectionId values containing reserved characters', async () => {
    const scheduler = createScheduler();
    const opened: FakeWebSocket[] = [];
    const handle = startKeepalive({
      resolveWsUrl: async () => 'ws://localhost:12345',
      scheduler,
      connectionId: 'user/agent=1&2',
      createWebSocket: (url) => {
        const fake = new FakeWebSocket(url);
        opened.push(fake);
        return fake;
      },
    });
    await runMicrotasks();
    expect(opened.length).toBe(1);
    // encodeURIComponent: /→%2F, =→%3D, &→%26
    expect(opened[0].url).toContain('connectionId=user%2Fagent%3D1%262');
    handle.close();
  });
});
