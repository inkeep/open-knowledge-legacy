import { toast } from 'sonner';

type Bridge = NonNullable<typeof window.okDesktop>;

type OpenInTerminalOutcome = Awaited<ReturnType<Bridge['shell']['openInTerminal']>>;

type OpenInTerminalFailureReason = Extract<OpenInTerminalOutcome, { ok: false }>['reason'];

const REASON_LABEL: Record<OpenInTerminalFailureReason | 'ipc-error', string> = {
  'not-found': 'Terminal.app not found',
  'spawn-error': 'Could not launch Terminal',
  timeout: 'Terminal took too long to respond',
  'path-escape': 'Path resolves outside the project',
  'ipc-error': 'Lost connection to the main process',
};

export async function dispatchOpenInTerminal(bridge: Bridge, dirAbsPath: string): Promise<void> {
  let result: OpenInTerminalOutcome;
  try {
    result = await bridge.shell.openInTerminal(dirAbsPath);
  } catch (err) {
    console.warn('[shell] openInTerminal IPC threw', { dirAbsPath, err });
    toast.error('Could not open Terminal', { description: REASON_LABEL['ipc-error'] });
    return;
  }
  if (!result.ok) {
    console.warn('[shell] openInTerminal failed', { reason: result.reason, dirAbsPath });
    toast.error('Could not open Terminal', { description: REASON_LABEL[result.reason] });
  }
}
