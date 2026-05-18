import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { dispatchOpenInTerminal } from './dispatch-open-in-terminal.ts';

type ToastCall = { kind: 'error' | 'success'; message: string; description?: string };

const toastCalls: ToastCall[] = [];
const toastErrorMock = mock((message: string, opts?: { description?: string }) => {
  toastCalls.push({ kind: 'error', message, description: opts?.description });
});

mock.module('sonner', () => ({
  toast: { error: toastErrorMock },
}));

beforeEach(() => {
  toastCalls.length = 0;
  toastErrorMock.mockClear();
});

afterEach(() => {
  toastErrorMock.mockClear();
});

type Bridge = Parameters<typeof dispatchOpenInTerminal>[0];

function fakeBridge(openInTerminal: Bridge['shell']['openInTerminal']): Bridge {
  return { shell: { openInTerminal } } as unknown as Bridge;
}

test('dispatchOpenInTerminal: ok outcome emits no toast', async () => {
  const bridge = fakeBridge(async () => ({ ok: true }) as never);
  await dispatchOpenInTerminal(bridge, '/abs/path/folder');
  expect(toastCalls).toHaveLength(0);
});

test('dispatchOpenInTerminal: typed {ok:false} outcome emits reason-mapped toast', async () => {
  const bridge = fakeBridge(async () => ({ ok: false, reason: 'not-found' }) as never);
  await dispatchOpenInTerminal(bridge, '/abs/path/folder');
  expect(toastCalls).toHaveLength(1);
  expect(toastCalls[0]).toEqual({
    kind: 'error',
    message: 'Could not open Terminal',
    description: 'Terminal.app not found',
  });
});

test('dispatchOpenInTerminal: IPC rejection surfaces the ipc-error toast instead of silently swallowing', async () => {
  const bridge = fakeBridge(async () => {
    throw new Error('IPC channel destroyed');
  });
  await dispatchOpenInTerminal(bridge, '/abs/path/folder');
  expect(toastCalls).toHaveLength(1);
  expect(toastCalls[0]).toEqual({
    kind: 'error',
    message: 'Could not open Terminal',
    description: 'Lost connection to the main process',
  });
});

test('dispatchOpenInTerminal: synchronous throw is also caught', async () => {
  const bridge = fakeBridge((() => {
    throw new Error('IPC unavailable');
  }) as never);
  await dispatchOpenInTerminal(bridge, '/abs/path/folder');
  expect(toastCalls).toHaveLength(1);
  expect(toastCalls[0]?.description).toBe('Lost connection to the main process');
});
