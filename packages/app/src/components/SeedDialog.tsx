import { ProblemDetailsSchema } from '@inkeep/open-knowledge-core';
import { FileText, Folder, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  OkPackId,
  OkScaffoldApplyResult,
  OkScaffoldPersonalTemplateWriteResult,
  OkScaffoldPlan,
  OkSeedApplyResult,
  OkSeedError,
  OkSeedListPacksResult,
  OkSeedPackInfo,
  OkSeedPlanResult,
} from '@/lib/desktop-bridge-types';

const DEFAULT_PACK_ID: OkPackId = 'knowledge-base';

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
      plan: okDesktop.seed.plan,
      apply: okDesktop.seed.apply,
      listPacks: okDesktop.seed.listPacks,
    };
  }
  return {
    plan: async (options?: {
      rootDir?: string;
      packId?: OkPackId;
      includePersonalTemplates?: boolean;
    }): Promise<OkSeedPlanResult> => {
      const params = new URLSearchParams();
      if (options?.rootDir) params.set('rootDir', options.rootDir);
      if (options?.packId) params.set('packId', options.packId);
      if (options?.includePersonalTemplates) params.set('includePersonalTemplates', 'true');
      const qs = params.toString();
      const res = await fetch(`/api/seed/plan${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        return { ok: false, error: await translateSeedError(res) };
      }
      const body = (await res.json().catch(() => null)) as { plan?: OkScaffoldPlan } | null;
      if (!body?.plan) {
        return { ok: false, error: { kind: 'internal', message: 'Malformed plan response' } };
      }
      return { ok: true, plan: body.plan };
    },
    apply: async (
      plan: OkScaffoldPlan,
      options?: { packId?: OkPackId; includePersonalTemplates?: boolean },
    ): Promise<OkSeedApplyResult> => {
      const res = await fetch('/api/seed/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          packId: options?.packId,
          includePersonalTemplates: options?.includePersonalTemplates,
        }),
      });
      if (!res.ok) {
        return { ok: false, error: await translateSeedError(res) };
      }
      const body = (await res.json().catch(() => null)) as {
        result?: OkScaffoldApplyResult;
        personalTemplates?: OkScaffoldPersonalTemplateWriteResult;
      } | null;
      if (!body?.result) {
        return { ok: false, error: { kind: 'internal', message: 'Malformed apply response' } };
      }
      return { ok: true, result: body.result, personalTemplates: body.personalTemplates };
    },
    listPacks: async (): Promise<OkSeedListPacksResult> => {
      const res = await fetch('/api/seed/packs');
      if (!res.ok) {
        return { ok: false, error: { kind: 'internal', message: `HTTP ${res.status}` } };
      }
      const body = (await res.json().catch(() => null)) as { packs?: OkSeedPackInfo[] } | null;
      if (!body || !Array.isArray(body.packs)) {
        return {
          ok: false,
          error: { kind: 'internal', message: 'Malformed listPacks response' },
        };
      }
      return { ok: true, packs: body.packs };
    },
  };
}

export function SeedDialog({ open, onOpenChange, onSeedApplied }: SeedDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>({ kind: 'loading' });
  const [packs, setPacks] = useState<OkSeedPackInfo[] | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<OkPackId>(DEFAULT_PACK_ID);
  const [includePersonalTemplates, setIncludePersonalTemplates] = useState(true);
  const [rootChoice, setRootChoice] = useState<RootChoice>('project-root');
  const [subfolder, setSubfolder] = useState<string>('');
  const isFirstLoadRef = useRef(true);

  const selectedPack = packs?.find((p) => p.id === selectedPackId);

  useEffect(() => {
    if (!open || packs !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await seedClient().listPacks();
        if (cancelled) return;
        if (result.ok) {
          setPacks(result.packs);
        } else {
          setPacks([]); // empty list short-circuits the planning loading state
          setPhase({ kind: 'error', message: result.error.message });
        }
      } catch (err) {
        if (cancelled) return;
        setPacks([]);
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, packs]);

  useEffect(() => {
    if (open) {
      setSelectedPackId(DEFAULT_PACK_ID);
      setIncludePersonalTemplates(true);
      setRootChoice('project-root');
      setSubfolder('');
      isFirstLoadRef.current = true;
    }
  }, [open]);

  useEffect(() => {
    if (!selectedPack) return;
    setSubfolder(selectedPack.defaultSubfolder ?? '');
  }, [selectedPack]);

  const trimmedSubfolder = subfolder.trim();
  const subfolderInvalid = rootChoice === 'subfolder' && trimmedSubfolder === '';

  useEffect(() => {
    if (!open) return;
    if (packs === null) return; // wait for pack list before planning

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
        .plan({
          rootDir: effectiveRoot,
          packId: selectedPackId,
          includePersonalTemplates,
        })
        .then((result) => {
          if (cancelled) return;
          if (!result.ok) {
            setPhase({ kind: 'error', message: result.error.message });
            return;
          }
          const hasWork =
            result.plan.created.length > 0 ||
            (result.plan.personalTemplates?.willWrite.length ?? 0) > 0;
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
  }, [
    open,
    packs,
    selectedPackId,
    includePersonalTemplates,
    rootChoice,
    trimmedSubfolder,
    subfolderInvalid,
  ]);

  async function handleApply() {
    if (phase.kind !== 'plan') return;
    const planAtClick = phase.plan;
    setPhase({ kind: 'applying', plan: planAtClick });
    let result: Awaited<ReturnType<ReturnType<typeof seedClient>['apply']>>;
    try {
      result = await seedClient().apply(planAtClick, {
        packId: selectedPackId,
        includePersonalTemplates,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Initialize failed: ${message}`);
      setPhase({ kind: 'plan', plan: planAtClick });
      return;
    }
    if (result.ok) {
      const packName = selectedPack?.name ?? 'starter pack';
      const projectEntries = result.result.applied;
      const personalCount = result.personalTemplates?.written.length ?? 0;
      const message =
        projectEntries === 0 && personalCount > 0
          ? `${personalCount} personal template${personalCount === 1 ? '' : 's'} written to ~/.ok/templates/`
          : projectEntries === 0
            ? `${packName} was already set up — nothing to do.`
            : personalCount > 0
              ? `${packName} initialized (${projectEntries} ${projectEntries === 1 ? 'entry' : 'entries'}) + ${personalCount} personal template${personalCount === 1 ? '' : 's'}`
              : `${packName} initialized (${projectEntries} ${projectEntries === 1 ? 'entry' : 'entries'})`;
      toast.success(message);
      onSeedApplied?.();
      onOpenChange(false);
    } else {
      toast.error(`Initialize failed: ${result.error.message}`);
      setPhase({ kind: 'plan', plan: planAtClick });
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-foreground opacity-70" />
            Initialize a starter pack
          </DialogTitle>
          <DialogDescription>
            Pick a layout that matches what you're building. Each pack ships with folders,
            templates, and agent-readable descriptions. You can mix and match later.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <PackPicker packs={packs} selectedPackId={selectedPackId} onSelect={setSelectedPackId} />
          <PersonalTemplatesToggle
            checked={includePersonalTemplates}
            onCheckedChange={setIncludePersonalTemplates}
          />
          <RootPicker
            choice={rootChoice}
            subfolder={subfolder}
            placeholder={selectedPack?.defaultSubfolder ?? 'subfolder'}
            onChoiceChange={setRootChoice}
            onSubfolderChange={setSubfolder}
          />
          <SeedDialogBody phase={phase} selectedPack={selectedPack} />
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
              Setting up
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

function PackPicker({
  packs,
  selectedPackId,
  onSelect,
}: {
  packs: OkSeedPackInfo[] | null;
  selectedPackId: OkPackId;
  onSelect: (id: OkPackId) => void;
}) {
  return (
    <div className="space-y-2 py-1">
      <p className="text-sm font-medium">Pick a starter pack</p>
      {packs === null ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Loading packs
        </div>
      ) : (
        <RadioGroup
          className="grid gap-2 sm:grid-cols-3"
          value={selectedPackId}
          onValueChange={(next) => onSelect(next as OkPackId)}
        >
          {packs.map((pack) => (
            <FieldLabel key={pack.id} htmlFor={`pack-${pack.id}`}>
              <Field orientation="horizontal" className="h-full">
                <FieldContent>
                  <FieldTitle className="text-sm">{pack.name}</FieldTitle>
                  <FieldDescription className="text-xs">{pack.description}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={pack.id} id={`pack-${pack.id}`} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      )}
    </div>
  );
}

function PersonalTemplatesToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <FieldLabel htmlFor="seed-include-personal-templates" className="cursor-pointer">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>Include personal templates</FieldTitle>
          <FieldDescription>
            Adds daily journal, reading log, recipes, and more to <code>~/.ok/templates/</code>.
            Idempotent — never overwrites your edits.
          </FieldDescription>
        </FieldContent>
        <Checkbox
          id="seed-include-personal-templates"
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
      </Field>
    </FieldLabel>
  );
}

function RootPicker({
  choice,
  subfolder,
  placeholder,
  onChoiceChange,
  onSubfolderChange,
}: {
  choice: RootChoice;
  subfolder: string;
  placeholder: string;
  onChoiceChange: (next: RootChoice) => void;
  onSubfolderChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2 py-1">
      <p className="text-sm font-medium">Where should it live?</p>
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
                Scaffold the pack's folders directly under this project.
              </FieldDescription>
            </FieldContent>
            <RadioGroupItem value="project-root" id="seed-root-project-root" />
          </Field>
        </FieldLabel>
        <FieldLabel htmlFor="seed-root-subfolder">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>In a subfolder</FieldTitle>
              <FieldDescription className="nth-last-2:mt-0">
                Created if missing. Reuses the folder if it already exists.
              </FieldDescription>
              <Input
                value={subfolder}
                onChange={(e) => onSubfolderChange(e.target.value)}
                onFocus={() => onChoiceChange('subfolder')}
                placeholder={placeholder}
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

function SeedDialogBody({
  phase,
  selectedPack,
}: {
  phase: DialogPhase;
  selectedPack: OkSeedPackInfo | undefined;
}) {
  if (phase.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Computing scaffold plan
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
        <p className="font-medium">This pack is already set up here.</p>
        <p className="text-muted-foreground">
          The folders and templates are in place — there's nothing left to scaffold.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-1 text-sm">
      <CreatedItemsList plan={phase.plan} selectedPack={selectedPack} />
      {phase.plan.warnings.length > 0 ? (
        <div className="rounded-md bg-warning/10 p-3 text-xs text-warning-foreground">
          {phase.plan.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface CreatedItem {
  kind: 'folder' | 'file';
  name: string;
  description: string;
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function describeCreatedItems(
  plan: OkScaffoldPlan,
  selectedPack: OkSeedPackInfo | undefined,
): CreatedItem[] {
  const folderBlurbs = new Map<string, string>();
  for (const f of selectedPack?.folders ?? []) {
    folderBlurbs.set(f.path, f.summary);
  }
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
      description: basename(e.path) === 'log.md' ? 'Append-only timeline' : '',
    }));
  return [...folders, ...files];
}

function CreatedItemsList({
  plan,
  selectedPack,
}: {
  plan: OkScaffoldPlan;
  selectedPack: OkSeedPackInfo | undefined;
}) {
  const items = describeCreatedItems(plan, selectedPack);
  const personalTemplates = plan.personalTemplates;
  const personalCount = personalTemplates?.willWrite.length ?? 0;

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
        {personalCount > 0 ? (
          <li className="flex items-start gap-3 rounded-md border border-dashed border-border/60 bg-muted/10 p-3">
            <FileText
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <code className="font-mono text-1sm">
                ~/.ok/templates/ ({personalCount} {personalCount === 1 ? 'template' : 'templates'})
              </code>
              <p className="text-1sm text-muted-foreground">
                Personal templates: daily journal, reading log, weekly review, recipes, and more.
              </p>
            </div>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
