import { ProblemDetailsSchema } from '@inkeep/open-knowledge-core';
import { FileText, Folder, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type {
  OkScaffoldApplyResult,
  OkScaffoldPlan,
  OkSeedApplyResult,
  OkSeedError,
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

type RootChoice = 'project-root' | 'subfolder';

async function translateSeedError(res: Response): Promise<OkSeedError> {
  const body = (await res.json().catch(() => null)) as unknown;
  const parsed = ProblemDetailsSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: 'internal', message: `HTTP ${res.status}` };
  }
  const message = parsed.data.detail ?? parsed.data.title;
  const t = parsed.data.type;
  if (t === 'urn:ok:error:seed-prerequisite-missing') {
    return { kind: 'prerequisite-missing', message };
  }
  if (t === 'urn:ok:error:seed-invalid-root') {
    return { kind: 'invalid-root', message };
  }
  if (t === 'urn:ok:error:no-project-dir') {
    return { kind: 'no-project', message };
  }
  return { kind: 'internal', message };
}

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
      if (!res.ok) {
        return { ok: false, error: await translateSeedError(res) };
      }
      const body = (await res.json().catch(() => null)) as { plan?: OkScaffoldPlan } | null;
      if (!body?.plan) {
        return { ok: false, error: { kind: 'internal', message: 'Malformed plan response' } };
      }
      return { ok: true, plan: body.plan };
    },
    apply: async (plan: OkScaffoldPlan): Promise<OkSeedApplyResult> => {
      const res = await fetch('/api/seed/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        return { ok: false, error: await translateSeedError(res) };
      }
      const body = (await res.json().catch(() => null)) as {
        result?: OkScaffoldApplyResult;
      } | null;
      if (!body?.result) {
        return { ok: false, error: { kind: 'internal', message: 'Malformed apply response' } };
      }
      return { ok: true, result: body.result };
    },
  };
}

export function SeedDialog({ open, onOpenChange, onSeedApplied }: SeedDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>({ kind: 'loading' });
  const [rootChoice, setRootChoice] = useState<RootChoice>('project-root');
  const [subfolder, setSubfolder] = useState<string>('brain');
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (open) {
      setRootChoice('project-root');
      setSubfolder('brain');
      isFirstLoadRef.current = true;
    }
  }, [open]);

  const trimmedSubfolder = subfolder.trim();
  const subfolderInvalid = rootChoice === 'subfolder' && trimmedSubfolder === '';

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
          const hasWork = result.plan.created.length > 0;
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
            Three layers designed so AI agents can navigate naturally: raw sources, working drafts,
            and canonical articles.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <RootPicker
            choice={rootChoice}
            subfolder={subfolder}
            onChoiceChange={setRootChoice}
            onSubfolderChange={setSubfolder}
          />
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
            <Button onClick={handleApply} disabled={subfolderInvalid}>
              Initialize
            </Button>
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
    <div className="space-y-2 py-1">
      <p className="text-sm font-medium">Where should the brain live?</p>
      <RadioGroup
        className="sm:flex"
        value={choice}
        onValueChange={(next) => onChoiceChange(next as RootChoice)}
      >
        <FieldLabel htmlFor="seed-root-project-root">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Project root</FieldTitle>
              <FieldDescription>
                Scaffold the three folders directly under this project.
              </FieldDescription>
            </FieldContent>
            <RadioGroupItem value="project-root" id="seed-root-project-root" />
          </Field>
        </FieldLabel>
        <FieldLabel htmlFor="seed-root-subfolder">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>In a subfolder</FieldTitle>
              {/* Override FieldDescription's `nth-last-2:-mt-1` rule, which
                 tightens description-to-title spacing whenever a sibling
                 (the Input below) follows. We want the title-to-description
                 gap to match the project-root card visually. */}
              <FieldDescription className="nth-last-2:mt-0">
                Created if missing. Reuses the folder if it already exists.
              </FieldDescription>
              {/*
               * No `disabled` here: focusing the input promotes the radio via
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
                className="mt-1.5 font-mono text-xs bg-background"
              />
            </FieldContent>
            <RadioGroupItem value="subfolder" id="seed-root-subfolder" />
          </Field>
        </FieldLabel>
      </RadioGroup>
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

interface Layer {
  name: string;
  blurb: string;
}

/** Short description per starter folder (≤2 lines) — used by
    `CreatedItemsList` to annotate each folder row in the "what gets created"
    list. */
const LAYERS: readonly Layer[] = [
  {
    name: 'external-sources',
    blurb:
      'Raw sources saved verbatim — full text of URLs and PDFs, not just citations. Every claim traces back to preserved evidence.',
  },
  {
    name: 'research',
    blurb:
      'Provisional analysis synthesizing sources. Every claim cites a doc; promotes to articles/ once the team trusts the findings.',
  },
  {
    name: 'articles',
    blurb:
      'Canonical decisions. Each links back through research/ to its sources — no dead links, full evidence chain in repo.',
  },
] as const;

const FILE_DESCRIPTIONS: Record<string, string> = {
  'log.md': 'Append-only timeline',
};

/** Last path segment so descriptions still attach in subfolder mode — e.g.
    `brain/external-sources` resolves to the `external-sources` layer blurb. */
function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

interface CreatedItem {
  kind: 'folder' | 'file';
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
      description: folderBlurbs.get(basename(e.path)) ?? '',
    }));
  const files: CreatedItem[] = plan.created
    .filter((e) => e.kind === 'file')
    .map((e) => ({
      kind: 'file',
      name: e.path,
      description: FILE_DESCRIPTIONS[basename(e.path)] ?? '',
    }));
  return [...folders, ...files];
}

function CreatedItemsList({ plan }: { plan: OkScaffoldPlan }) {
  const items = describeCreatedItems(plan);

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase font-mono tracking-wider text-primary">
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
