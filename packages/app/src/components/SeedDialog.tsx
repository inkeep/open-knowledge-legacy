import {
  BookMarked,
  FileCog,
  FileText,
  FlaskConical,
  Folder,
  Library,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
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
  /** Fired after a successful apply — used by the empty state to trigger the
      OkBlob celebration burst. The dialog still owns the toast + dismissal. */
  onSeedApplied?: () => void;
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
 * Dialog that explains the three-layer starter structure and lets the user
 * apply it with one click. Default body is a visual three-card preview of
 * what the layers mean; the full file/folder/config diff lives behind a
 * collapsible disclosure for power users. Mirrors the CLI flow: fetch plan →
 * show what will change → confirm → apply. Optional per SPEC.
 *
 * Runs in both desktop (via IPC) and web (via HTTP) distributions.
 */
export function SeedDialog({ open, onOpenChange, onSeedApplied }: SeedDialogProps) {
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
      onSeedApplied?.();
      onOpenChange(false);
    } else {
      toast.error(`Initialize failed: ${result.error.message}`);
      setPhase({ kind: 'error', message: result.error.message });
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-foreground opacity-70" />
            Initialize LLM brain
          </DialogTitle>
          <DialogDescription>
            Three layers designed for working with AI agents: raw evidence, in-progress thinking,
            and decisions you trust.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <SeedDialogBody phase={phase} />
        </DialogBody>

        <DialogFooter>
          <Button
            className="uppercase font-mono"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {phase.kind === 'already-seeded' || phase.kind === 'error' ? 'Close' : 'Cancel'}
          </Button>
          {phase.kind === 'plan' ? (
            <Button onClick={handleApply}>Initialize</Button>
          ) : phase.kind === 'applying' ? (
            <Button disabled>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Setting up…
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
        <p className="font-medium">This LLM brain is already set up.</p>
        <p className="text-muted-foreground">
          The three-layer structure is in place — there's nothing left to scaffold.
        </p>
      </div>
    );
  }

  const plan = phase.plan;

  return (
    <div className="space-y-6 py-1 text-sm">
      <LayerPreview />

      <CreatedItemsList plan={plan} />

      {plan.warnings.length > 0 ? (
        <div className="rounded-md bg-warning/10 p-3 text-xs text-warning-foreground">
          {plan.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface LayerCard {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>;
  name: string;
  blurb: string;
}

const LAYERS: readonly LayerCard[] = [
  {
    icon: Library,
    name: 'external-sources',
    blurb: 'Raw sources saved verbatim',
  },
  {
    icon: FlaskConical,
    name: 'research',
    blurb: 'Provisional analysis with citations',
  },
  {
    icon: BookMarked,
    name: 'articles',
    blurb: 'Canonical decisions you trust',
  },
] as const;

/**
 * Horizontal three-card preview of the layer mental model. Order conveys flow
 * (sources → drafts → canon).
 */
function LayerPreview() {
  return (
    <div className="flex items-stretch gap-3">
      {LAYERS.map((layer) => (
        <div key={layer.name} className="flex flex-1 items-center gap-1.5">
          <div className="flex flex-1 flex-col gap-1.5 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-1.5">
              <layer.icon aria-hidden="true" className="h-4 w-4 text-muted-foreground opacity-70" />
              <code className="font-mono leading-tight">{layer.name}</code>
            </div>
            <p className="leading-snug text-muted-foreground">{layer.blurb}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hand-written 1-line descriptions for files outside the layer set. Folders
    inherit their description from `LAYERS` so cards + rows stay in sync. */
const FILE_DESCRIPTIONS: Record<string, string> = {
  'log.md': 'Append-only timeline',
};

interface CreatedItem {
  kind: 'folder' | 'file' | 'config';
  name: string;
  description: string;
}

function describeCreatedItems(plan: OkScaffoldPlan): CreatedItem[] {
  const folderBlurbs = new Map(LAYERS.map((l) => [l.name, l.blurb]));
  const folders: CreatedItem[] = plan.created
    .filter((e) => e.kind === 'folder')
    .map((e) => ({
      kind: 'folder',
      name: `${e.path}/`,
      description: folderBlurbs.get(e.path) ?? '',
    }));
  const files: CreatedItem[] = plan.created
    .filter((e) => e.kind === 'file')
    .map((e) => ({
      kind: 'file',
      name: e.path,
      description: FILE_DESCRIPTIONS[e.path] ?? '',
    }));
  // One synthetic row representing the config.yml side of the apply — either
  // created from scratch (if absent) or appended to (if present). One row,
  // not three, so the list doesn't double its size for an effectively-single
  // file change. The folder rows above already convey the layer descriptions
  // that get written into it.
  const configRow: CreatedItem[] =
    plan.configEdits.length > 0
      ? [
          {
            kind: 'config',
            name: '.open-knowledge/config.yml',
            description: 'Folder descriptions for AI agents',
          },
        ]
      : [];
  return [...folders, ...files, ...configRow];
}

/**
 * Always-expanded list of the artifacts the apply will create. Each row is a
 * soft-bordered card with a checkbox-style icon, mono-font name, and 1-line
 * description. Config.yml entries are intentionally omitted — they're
 * implementation detail of the folder layers, surfaced via the layer
 * descriptions above.
 */
function CreatedItemsList({ plan }: { plan: OkScaffoldPlan }) {
  const items = describeCreatedItems(plan);

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase font-mono tracking-wider text-primary">
        {/* <Diamond aria-hidden="true" className="h-3 w-3" /> */}
        <span aria-hidden="true" className="flex items-center justify-center">
          ◇
        </span>
        What gets created
      </h3>
      <ul className="space-y-3 overflow-y-auto subtle-scrollbar max-h-full">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 p-3"
          >
            {item.kind === 'folder' ? (
              <Folder
                aria-hidden="true"
                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
            ) : item.kind === 'config' ? (
              <FileCog
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
            ) : (
              <FileText
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <code className="font-mono text-1sm">{item.name}</code>
              {item.description ? (
                <p className="text-1sm text-muted-foreground">{item.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
