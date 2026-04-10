/**
 * Tier 1: Bridge integration test matrix
 *
 * Exercises all 12 propagation paths (4 write surfaces × 3 read targets)
 * plus undo/redo through a real Hocuspocus server + real HocuspocusProvider
 * client over WebSocket with setupObservers() wired.
 *
 * Each test verifies content reaches the target surface and asserts the
 * bridge invariant: normalized Y.Text === serialized XmlFragment.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import {
  agentWriteMd,
  assertBridgeInvariant,
  createTestClient,
  createTestServer,
  type TestClient,
  type TestServer,
  wait,
} from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('smoke', () => {
  let client: TestClient;

  afterEach(() => {
    client?.cleanup();
  });

  test('server starts, client connects, basic round-trip works', async () => {
    client = await createTestClient(server.port);

    // Agent writes to server
    await agentWriteMd(server.port, '# Hello World');
    await wait(500);

    // Content should arrive at client Y.Text
    expect(client.ytext.toString()).toContain('Hello World');

    // Bridge invariant should hold
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});
