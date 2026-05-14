import { Folder, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OkScaffoldPlan, OkSeedPackInfo } from '@/lib/desktop-bridge-types';

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

export function CreatedItemsList({
  plan,
  selectedPack,
}: {
  plan: OkScaffoldPlan;
  selectedPack: OkSeedPackInfo | undefined;
}) {
  const items = describeCreatedItems(plan, selectedPack);
  const personalCount = plan.personalTemplates?.willWrite.length ?? 0;

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

  const presentPaths = new Set(sorted.map((i) => i.name.replace(/\/$/, '')));

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase font-mono tracking-wider text-primary">
        <span aria-hidden="true" className="flex items-center justify-center">
          ◇
        </span>
        What gets created
      </h3>
      <div className="overflow-hidden rounded-md border border-border/60 bg-muted/20">
        <ul aria-label="Items to be created" className="py-1.5">
          {sorted.map((item) => {
            const pathKey = item.name.replace(/\/$/, '');
            const segments = pathKey.split('/');
            let depth = 0;
            let nearestPresentEnd = 0;
            for (let i = 1; i < segments.length; i++) {
              const ancestor = segments.slice(0, i).join('/');
              if (presentPaths.has(ancestor)) {
                depth++;
                nearestPresentEnd = i;
              }
            }
            const displayName =
              segments.slice(nearestPresentEnd).join('/') + (item.kind === 'folder' ? '/' : '');
            const isFolder = item.kind === 'folder';
            return (
              <li
                key={item.name}
                className="relative flex min-w-0 items-center gap-1.5 py-1 pr-3"
                style={{ paddingLeft: `${12 + depth * 16}px` }}
              >
                {/* Vertical guides at each present-ancestor depth (`+8`
                    centers the 1px line within the 16px icon column). */}
                {Array.from({ length: depth }, (_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: depth-slot index is the stable identity (ancestor paths may include skipped segments)
                    key={`guide:${i}`}
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 w-px bg-border/50"
                    style={{ left: `${12 + i * 16 + 8}px` }}
                  />
                ))}
                {isFolder ? (
                  <Folder
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                ) : (
                  <span aria-hidden="true" className="size-3.5 shrink-0" />
                )}
                <code className="font-mono text-1sm shrink-0 text-foreground/80">
                  {displayName}
                </code>
                {isFolder && item.description ? (
                  <Tooltip>
                    {/* Static aria-label so Radix's auto-wired
                        aria-describedby doesn't announce the description
                        twice. TooltipTrigger renders its own <button> by
                        default. */}
                    <TooltipTrigger
                      aria-label="Show description"
                      className="flex shrink-0 cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Info
                        aria-hidden="true"
                        className="size-3 text-muted-foreground/60"
                        strokeWidth={1.5}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{item.description}</TooltipContent>
                  </Tooltip>
                ) : null}
              </li>
            );
          })}
        </ul>
        {personalCount > 0 ? (
          <div className="flex min-w-0 items-center gap-2 border-t border-border/60 bg-muted/10 px-3 py-1.5">
            <code className="font-mono text-1sm shrink-0">~/.ok/templates/</code>
            <span className="truncate text-1sm text-muted-foreground">
              — {personalCount} personal {personalCount === 1 ? 'template' : 'templates'}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
