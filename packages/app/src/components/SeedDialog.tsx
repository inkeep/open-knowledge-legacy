import { BrainCircuit, ChevronRight, FileText, Folder, Loader2 } from 'lucide-react';
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
import type {
  OkScaffoldPlan,
  OkSeedApplyResult,
  OkSeedPlanResult,
} from '@/lib/desktop-bridge-types';

interface SeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogPhase =
  | { kind: 'loading' }
  | { kind: 'plan'; plan: OkScaffoldPlan }
  | { kind: 'already-seeded'; plan: OkScaffoldPlan }
  | { kind: 'error'; message: string }
  | { kind: 'applying'; plan: OkScaffoldPlan };

/**
 * Runtime adapter that returns the right transport for plan/apply — Electron
 * IPC when the desktop bridge is populated, otherwise HTTP fetch to the
 * Hocuspocus `/api/seed/*` endpoints. Either path hits the same underlying
 * `planSeed` / `applySeed` in `@inkeep/open-knowledge-server`.
 */
function seedClient() {
  const okDesktop = typeof window !== 'undefined' ? window.okDesktop : undefined;
  if (okDesktop?.seed) {
    return {
      plan: () => okDesktop.seed.plan(),
      apply: (plan: OkScaffoldPlan) => okDesktop.seed.apply(plan),
    };
  }
  return {
    plan: async (): Promise<OkSeedPlanResult> => {
      const res = await fetch('/api/seed/plan');
      return (await res.json()) as OkSeedPlanResult;
    },
    apply: async (plan: OkScaffoldPlan): Promise<OkSeedApplyResult> => {
      const res = await fetch('/api/seed/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      return (await res.json()) as OkSeedApplyResult;
    },
  };
}

/**
 * Dialog that renders the `ok seed` scaffold plan and lets the user apply it
 * with one click. Mirrors the CLI flow: fetch plan → show what will change →
 * confirm → apply. Optional per SPEC — users can ignore this and keep any
 * folder layout they already use.
 *
 * Runs in both desktop (via IPC) and web (via HTTP) distributions.
 */
export function SeedDialog({ open, onOpenChange }: SeedDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>({ kind: 'loading' });

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: 'loading' });

    let cancelled = false;
    seedClient()
      .plan()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setPhase({ kind: 'error', message: result.error.message });
          return;
        }
        const hasWork = result.plan.created.length > 0 || result.plan.configEdits.length > 0;
        setPhase(
          hasWork
            ? { kind: 'plan', plan: result.plan }
            : { kind: 'already-seeded', plan: result.plan },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleApply() {
    if (phase.kind !== 'plan') return;
    setPhase({ kind: 'applying', plan: phase.plan });
    const result = await seedClient().apply(phase.plan);
    if (result.ok) {
      toast.success(
        `LLM brain initialized (${result.result.applied} ${result.result.applied === 1 ? 'entry' : 'entries'})`,
      );
      onOpenChange(false);
    } else {
      toast.error(`Initialize failed: ${result.error.message}`);
      setPhase({ kind: 'error', message: result.error.message });
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit aria-hidden="true" className="h-4 w-4" />
            Initialize LLM brain
          </DialogTitle>
          <DialogDescription>
            Optional starter structure — creates the Karpathy three-layer folders (
            <code>external-sources</code>, <code>research</code>, <code>articles</code>), an
            append-only <code>log.md</code>, and matching <code>config.yml</code>{' '}
            <code>folders:</code> entries so agents see layer descriptions at every <code>ls</code>.
            You can skip this and keep any folder layout you already use.
          </DialogDescription>
        </DialogHeader>

        <SeedDialogBody phase={phase} />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {phase.kind === 'already-seeded' || phase.kind === 'error' ? 'Close' : 'Cancel'}
          </Button>
          {phase.kind === 'plan' ? (
            <Button onClick={handleApply}>Initialize</Button>
          ) : phase.kind === 'applying' ? (
            <Button disabled>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Initializing…
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function SeedDialogBody({ phase }: { phase: DialogPhase }) {
  if (phase.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Computing scaffold plan…
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {phase.message}
      </div>
    );
  }

  if (phase.kind === 'already-seeded') {
    return (
      <div className="py-2 text-sm">
        <p className="font-medium">This knowledge base is already initialized.</p>
        <p className="text-muted-foreground">
          Nothing to do — the scaffolder has already been applied. Re-running would produce zero
          changes.
        </p>
      </div>
    );
  }

  const plan = phase.plan;
  const folderEntries = plan.created.filter((e) => e.kind === 'folder');
  const fileEntries = plan.created.filter((e) => e.kind === 'file');

  return (
    <div className="space-y-3 py-2 text-sm">
      {folderEntries.length > 0 ? (
        <SeedDialogSection
          title="Folders"
          items={folderEntries.map((entry) => ({
            key: entry.path,
            leading: <Folder aria-hidden="true" className="h-4 w-4 text-muted-foreground" />,
            label: `${entry.path}/`,
          }))}
        />
      ) : null}

      {fileEntries.length > 0 ? (
        <SeedDialogSection
          title="Files"
          items={fileEntries.map((entry) => ({
            key: entry.path,
            leading: <FileText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />,
            label: entry.path,
          }))}
        />
      ) : null}

      {plan.configEdits.length > 0 ? (
        <SeedDialogSection
          title="config.yml folders: entries"
          items={plan.configEdits.map((edit) => ({
            key: edit.folderMatch,
            leading: <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />,
            label: edit.folderMatch,
            detail: edit.entry.frontmatter.description,
          }))}
        />
      ) : null}

      {plan.warnings.length > 0 ? (
        <div className="rounded-md bg-warning/10 p-3 text-sm text-warning-foreground">
          {plan.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface SeedDialogItem {
  key: string;
  leading: React.ReactNode;
  label: string;
  detail?: string;
}

function SeedDialogSection({ title, items }: { title: string; items: SeedDialogItem[] }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key} className="space-y-0.5">
            <div className="flex items-center gap-2">
              {item.leading}
              <code className="text-xs">{item.label}</code>
            </div>
            {item.detail ? (
              <p className="pl-6 text-xs text-muted-foreground">{item.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
