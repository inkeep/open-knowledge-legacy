import { CheckCircle2, Copy, Download, ExternalLink, Loader2, MousePointer2 } from 'lucide-react';
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
 * Implements SPEC 2026-04-24 FR9-FR14 with the Ship 1j local-build
 * simplification: no GitHub Releases dependency. The `.skill` is built from
 * the app's own bundled SKILL.md (Electron) or the user runs the CLI
 * command themselves (web).
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
          {phase.kind === 'idle' && isElectron && (
            <ol className="ml-4 list-decimal space-y-1 text-sm">
              <li>
                Click <strong>Install</strong> below.
              </li>
              <li>
                We'll build <code>openknowledge.skill</code> and hand it off to the{' '}
                <strong>Claude Desktop App</strong> automatically.
              </li>
              <li>Confirm the install in Claude's native install dialog.</li>
              <li>
                Skill appears in <strong>Customize → Skills</strong> — available in Chat & Cowork
                sessions.
              </li>
            </ol>
          )}

          {phase.kind === 'idle' && !isElectron && (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Run this in your terminal to build + install the skill. The command opens the{' '}
                <strong>Claude Desktop App</strong> automatically when done:
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
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
              <p className="text-xs text-muted-foreground">
                No separate install needed — <code>npx</code> fetches and runs the CLI directly.
                Requires Node.js or Bun.
              </p>
            </div>
          )}

          {phase.kind === 'downloading' && (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Building <code>openknowledge.skill</code> and handing off to the Claude Desktop App…
            </div>
          )}

          {phase.kind === 'handed-off' && (
            <div className="flex items-start gap-2 text-sm">
              <MousePointer2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
              <span>
                Handed off to the Claude Desktop App. Follow the prompts in Claude's install dialog
                to complete setup — the skill becomes available in Chat & Cowork.
                {phase.path && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Saved to <code>{phase.path}</code>.
                  </span>
                )}
              </span>
            </div>
          )}

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
