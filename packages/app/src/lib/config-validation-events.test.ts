import { describe, expect, mock, test } from 'bun:test';
import {
  emitConfigValidationRejected,
  subscribeToConfigValidationRejected,
} from './config-validation-events';

const SAMPLE_PAYLOAD = {
  v: 1 as const,
  ch: 'config-validation-rejected' as const,
  seq: 1,
  docName: '__config__/workspace' as const,
  error: { code: 'YAML_PARSE' as const, detail: 'unexpected token' },
};

describe('config-validation-events pubsub', () => {
  test('subscribed listener fires on emit', () => {
    const listener = mock(() => {});
    const unsub = subscribeToConfigValidationRejected(listener);
    emitConfigValidationRejected(SAMPLE_PAYLOAD);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(SAMPLE_PAYLOAD);
    unsub();
  });

  test('unsubscribe stops the listener', () => {
    const listener = mock(() => {});
    const unsub = subscribeToConfigValidationRejected(listener);
    unsub();
    emitConfigValidationRejected(SAMPLE_PAYLOAD);
    expect(listener).not.toHaveBeenCalled();
  });

  test('multiple subscribers all fire', () => {
    const a = mock(() => {});
    const b = mock(() => {});
    const ua = subscribeToConfigValidationRejected(a);
    const ub = subscribeToConfigValidationRejected(b);
    emitConfigValidationRejected(SAMPLE_PAYLOAD);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });

  test('listener exception is caught; other listeners still fire', () => {
    const thrower = mock(() => {
      throw new Error('boom');
    });
    const ok = mock(() => {});
    const u1 = subscribeToConfigValidationRejected(thrower);
    const u2 = subscribeToConfigValidationRejected(ok);
    expect(() => emitConfigValidationRejected(SAMPLE_PAYLOAD)).not.toThrow();
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });
});
