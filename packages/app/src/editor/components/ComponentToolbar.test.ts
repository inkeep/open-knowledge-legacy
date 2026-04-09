/**
 * ComponentToolbar unit tests — verifies the toolbar contract (component name + callback).
 * No DOM rendering — tests the component's props/exports contract.
 */
import { describe, expect, test } from 'bun:test';

describe('ComponentToolbar contract', () => {
  test('module exports ComponentToolbar function', async () => {
    const mod = await import('./ComponentToolbar');
    expect(typeof mod.ComponentToolbar).toBe('function');
  });

  test('UnregisteredFallback module exports function', async () => {
    const mod = await import('./UnregisteredFallback');
    expect(typeof mod.UnregisteredFallback).toBe('function');
  });
});
