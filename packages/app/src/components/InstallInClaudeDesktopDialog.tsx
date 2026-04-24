import { CheckCircle2, Copy, Download, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * `InstallInClaudeDesktopDialog` — concierge for installing the Open
 * Knowledge skill for **Claude Chat & Cowork** inside the **Claude Desktop
 * App**. Distinct from Claude Code (CLI / Code tab) which is already covered
 * by `ok init`'s `npx skills add` flow.
 *
 * Runtime branches on `'okDesktop' in window`:
 *   - Electron: calls `window.okDesktop.skill.buildAndOpen()` — main process
 *     builds + saves to ~/Downloads + invokes `shell.openPath`. Claude
 *     Desktop's native install dialog takes over.
 *   - Web: shows the `npx @inkeep/open-knowledge install-skill` command
 *     with a copy button. User runs it in their terminal.
 */

const INSTALL_COMMAND = 'npx @inkeep/open-knowledge install-skill';
const DOCS_URL = 'https://inkeep.github.io/open-knowledge/guides/install-claude-cowork';

interface InstallInClaudeDesktopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'downloading' }
  | { kind: 'handed-off'; path?: string }
  | { kind: 'error'; message: string };

function isElectronHost(): boolean {
  return typeof window !== 'undefined' && typeof window.okDesktop?.skill === 'object';
}

/**
 * The Claude Desktop App upload path — shared across Electron and web
 * modes. This is the MANUAL click-sequence inside the Claude Desktop App
 * that the user has to do after we've put `openknowledge.skill` in their
 * Downloads folder. Double-clicking the `.skill` file opens the Claude
 * Desktop App but does NOT auto-install; users upload via the Customize
 * → Skills UI.
 */
function UploadSteps() {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <p className="mb-2 font-medium text-foreground">
        Then in the Claude Desktop App, upload the file:
      </p>
      <ol className="ml-4 list-decimal space-y-1 text-foreground">
        <li>
          Open <strong>Customize</strong> (sidebar) → <strong>Skills</strong>.
        </li>
        <li>
          Click the <strong>+</strong> button.
        </li>
        <li>
          Click <strong>Create skill</strong>.
        </li>
        <li>
          Click <strong>Upload skill</strong>.
        </li>
        <li>
          Pick <code>openknowledge.skill</code> from your <strong>Downloads</strong> folder.
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        The skill toggles on by default. Use it in any{' '}
        <strong className="text-foreground">Claude Chat</strong> or{' '}
        <strong className="text-foreground">Claude Cowork</strong> session — ask Claude to "use the
        open-knowledge skill".
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        If <strong>Customize → Skills</strong> isn't visible, enable{' '}
        <strong className="text-foreground">
          Settings → Capabilities → Code execution and file creation
        </strong>{' '}
        first.
      </p>
    </div>
  );
}

export function InstallInClaudeDesktopDialog({
  open,
  onOpenChange,
}: InstallInClaudeDesktopDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [commandCopied, setCommandCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase({ kind: 'idle' });
      setCommandCopied(false);
    }
  }, [open]);

  async function handleInstallElectron() {
    setPhase({ kind: 'downloading' });
    const bridge = window.okDesktop?.skill;
    if (!bridge) {
      setPhase({
        kind: 'error',
        message: 'Electron bridge unavailable. Refresh and try again.',
      });
      return;
    }
    const result = await bridge.buildAndOpen();
    if (result.ok) {
      setPhase({ kind: 'handed-off', path: result.path });
    } else {
      const msg = result.message ?? result.reason;
      toast.error(`Install handoff failed: ${msg}`);
      setPhase({
        kind: 'error',
        message:
          result.reason === 'open-failed'
            ? `The Claude Desktop App didn't open the file. Is it installed? (${msg})`
            : `${result.reason}: ${msg}`,
      });
    }
  }

  async function handleCopyCommand() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCommandCopied(true);
      setTimeout(() => setCommandCopied(false), 2000);
    } catch (err) {
      toast.error(`Couldn't copy: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const isElectron = isElectronHost();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download aria-hidden="true" className="h-4 w-4" />
            Install for Claude Chat & Cowork
          </DialogTitle>
          <DialogDescription>
            Adds the Open Knowledge skill to the <strong>Claude Desktop App</strong> so it's
            available in Claude Chat and Claude Cowork modes. (Claude Code users: no action needed —{' '}
            <code>ok init</code> already installed it via <code>npx skills add</code>.){' '}
            <a href={DOCS_URL} className="underline" target="_blank" rel="noopener noreferrer">
              Full guide <ExternalLink aria-hidden="true" className="inline h-3 w-3" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* --------- ELECTRON IDLE: pre-install walkthrough --------- */}
          {phase.kind === 'idle' && isElectron && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="font-medium">Here's what will happen when you click Install:</p>
              <ol className="ml-4 list-decimal space-y-1.5">
                <li>
                  We build <code>openknowledge.skill</code> from the bundled skill content.
                </li>
                <li>
                  The file saves to <code>~/Downloads/openknowledge.skill</code>.
                </li>
                <li>
                  We open the <strong>Claude Desktop App</strong> for you.
                </li>
              </ol>
              <UploadSteps />
            </div>
          )}

          {/* --------- WEB IDLE: terminal command walkthrough --------- */}
          {phase.kind === 'idle' && !isElectron && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="font-medium">Here's what to do:</p>
              <ol className="ml-4 list-decimal space-y-2">
                <li>
                  <span>Copy this command:</span>
                  <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                    <code className="flex-1 font-mono text-xs">{INSTALL_COMMAND}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyCommand}
                      aria-label="Copy command"
                      className="h-7 gap-1"
                    >
                      {commandCopied ? (
                        <>
                          <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy aria-hidden="true" className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </li>
                <li>
                  Paste + run it in your terminal. You'll see{' '}
                  <code>Built ~/Downloads/openknowledge.skill</code> — that means the file is ready.
                  The <strong>Claude Desktop App</strong> opens automatically.
                </li>
              </ol>
              <UploadSteps />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Requires:</strong> Node.js or Bun on your PATH.{' '}
                <code>npx</code> fetches and runs the CLI — no separate install.
              </p>
            </div>
          )}

          {/* --------- DOWNLOADING (Electron only) --------- */}
          {phase.kind === 'downloading' && (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Building <code>openknowledge.skill</code> and opening the Claude Desktop App…
            </div>
          )}

          {/* --------- HANDED-OFF (Electron) --------- */}
          {phase.kind === 'handed-off' && isElectron && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">
                    File saved & Claude Desktop App opened
                  </span>
                  {phase.path ? (
                    <code className="text-xs text-muted-foreground">{phase.path}</code>
                  ) : (
                    <code className="text-xs text-muted-foreground">
                      ~/Downloads/openknowledge.skill
                    </code>
                  )}
                </div>
              </div>
              <UploadSteps />
            </div>
          )}

          {/* --------- HANDED-OFF (web — user ran CLI themselves) --------- */}
          {phase.kind === 'handed-off' && !isElectron && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">Download started</span>
                  <span className="text-xs text-muted-foreground">
                    File saves to <code>~/Downloads/openknowledge.skill</code>.
                  </span>
                </div>
              </div>
              <UploadSteps />
            </div>
          )}

          {/* --------- ERROR --------- */}
          {phase.kind === 'error' && (
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-destructive">{phase.message}</span>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                See the full install guide
              </a>
            </div>
          )}
        </div>

        <DialogFooter>
          {phase.kind === 'idle' && isElectron && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleInstallElectron}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Install
              </Button>
            </>
          )}
          {phase.kind === 'idle' && !isElectron && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          {phase.kind === 'error' && isElectron && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleInstallElectron}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </>
          )}
          {phase.kind === 'downloading' && (
            <Button disabled>
              <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              Installing…
            </Button>
          )}
          {phase.kind === 'handed-off' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
