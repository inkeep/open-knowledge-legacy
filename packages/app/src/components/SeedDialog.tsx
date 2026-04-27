import { BrainCircuit, ChevronRight, FileText, Folder, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
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

type RootChoice = 'project-root' | 'subfolder';

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
      plan: (rootDir?: string) => okDesktop.seed.plan(rootDir),
      apply: (plan: OkScaffoldPlan) => okDesktop.seed.apply(plan),
    };
  }
  return {
    plan: async (rootDir?: string): Promise<OkSeedPlanResult> => {
      const qs = rootDir ? `?rootDir=${encodeURIComponent(rootDir)}` : '';
      const res = await fetch(`/api/seed/plan${qs}`);
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
  // 'project-root' scaffolds at `.`; 'subfolder' uses the typed `subfolder` value.
  const [rootChoice, setRootChoice] = useState<RootChoice>('project-root');
  const [subfolder, setSubfolder] = useState<string>('brain');
  // Tracks whether the next re-plan is the first one this open cycle. The
  // first one fires immediately so the dialog renders without a 200ms delay;
  // subsequent runs (driven by typing) keep the debounce. Reset on open.
  const isFirstLoadRef = useRef(true);

  // Reset form whenever the dialog opens so users get a predictable starting
  // state (rather than stale values from a previous cancel).
  useEffect(() => {
    if (open) {
      setRootChoice('project-root');
      setSubfolder('brain');
      isFirstLoadRef.current = true;
    }
  }, [open]);

  // Whitespace-only subfolder while the "subfolder" radio is selected is a
  // form error — we surface it inline and gate Initialize. Computed once per
  // render so both the effect and the JSX read the same source of truth.
  const trimmedSubfolder = subfolder.trim();
  const subfolderInvalid = rootChoice === 'subfolder' && trimmedSubfolder === '';

  // Re-plan whenever the chosen root changes. The first run after open fires
  // immediately; subsequent runs (driven by typing in the subfolder field)
  // get a 200ms debounce. The loading flip happens INSIDE the timer so typing
  // doesn't strobe "Computing scaffold plan…" between keystrokes.
  useEffect(() => {
    if (!open) return;

    if (subfolderInvalid) {
      setPhase({ kind: 'error', message: 'Enter a folder name (e.g. brain).' });
      return;
    }

    const effectiveRoot = rootChoice === 'project-root' ? undefined : trimmedSubfolder;
    const delay = isFirstLoadRef.current ? 0 : 200;
    isFirstLoadRef.current = false;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      // Only flip to a loading visual if no plan is already on screen — keeps
      // the live preview smooth when the user is still typing.
      setPhase((prev) =>
        prev.kind === 'plan' || prev.kind === 'already-seeded' ? prev : { kind: 'loading' },
      );
      seedClient()
        .plan(effectiveRoot)
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
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, rootChoice, trimmedSubfolder, subfolderInvalid]);

  async function handleApply() {
    if (phase.kind !== 'plan' || subfolderInvalid) return;
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

        <RootPicker
          choice={rootChoice}
          subfolder={subfolder}
          onChoiceChange={setRootChoice}
          onSubfolderChange={setSubfolder}
        />

        <SeedDialogBody phase={phase} />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {phase.kind === 'already-seeded' || phase.kind === 'error' ? 'Close' : 'Cancel'}
          </Button>
          {phase.kind === 'plan' ? (
            <Button onClick={handleApply} disabled={subfolderInvalid}>
              Initialize
            </Button>
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

function RootPicker({
  choice,
  subfolder,
  onChoiceChange,
  onSubfolderChange,
}: {
  choice: RootChoice;
  subfolder: string;
  onChoiceChange: (next: RootChoice) => void;
  onSubfolderChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2 border-y py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Where should the brain live?
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="seed-root-choice"
          checked={choice === 'project-root'}
          onChange={() => onChoiceChange('project-root')}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Project root</span>
          <span className="block text-xs text-muted-foreground">
            Scaffold the three folders directly under this project.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="radio"
          name="seed-root-choice"
          checked={choice === 'subfolder'}
          onChange={() => onChoiceChange('subfolder')}
          className="mt-1"
        />
        <span className="flex-1">
          <span className="font-medium">In a subfolder</span>
          <span className="block text-xs text-muted-foreground">
            Created if missing. Reuses the folder if it already exists.
          </span>
          {/*
           * No `disabled` here: clicking the input promotes the radio via
           * onFocus, so the user can switch to subfolder mode and start
           * typing in one click. With `disabled` set, focus would never fire.
           */}
          <Input
            value={subfolder}
            onChange={(e) => onSubfolderChange(e.target.value)}
            onFocus={() => onChoiceChange('subfolder')}
            placeholder="brain"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-1.5 font-mono text-xs"
          />
        </span>
      </label>
    </div>
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
