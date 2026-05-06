import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { NewTemplateDialog } from '@/components/NewTemplateDialog';
import { TemplatePreviewDialog } from '@/components/TemplatePreviewDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AsyncState,
  FolderConfigSnapshot,
  TemplateMenuEntry,
} from '@/hooks/use-folder-config';

interface Props {
  folderPath: string;
  state: AsyncState<FolderConfigSnapshot>;
  onChange: () => void;
}

export function TemplatesCard({ folderPath, state, onChange }: Props) {
  const [openTemplate, setOpenTemplate] = useState<TemplateMenuEntry | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <section className="rounded-lg border bg-card px-3 py-2.5 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
            Templates available
          </h2>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        Failed to load templates: {state.message}
      </section>
    );
  }

  const templates = state.data.folder.templates_available ?? [];

  return (
    <>
      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase font-mono tracking-wider text-muted-foreground">
              Templates available
            </h2>
            <Badge className="text-xs" variant="secondary">
              {templates.length}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            New template
          </Button>
        </div>
        <div className="px-3 py-2.5">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates resolve here. Add one to seed new docs in this folder.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <li key={tpl.path}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start px-3 py-3 hover:bg-muted/50"
                    onClick={() => setOpenTemplate(tpl)}
                  >
                    <div className="flex w-full items-start gap-3 text-left">
                      <FileText
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{tpl.title ?? tpl.name}</span>
                          <code className="font-mono text-xs text-muted-foreground">
                            {tpl.name}
                          </code>
                          <Badge
                            variant={tpl.scope === 'local' ? 'secondary' : 'outline'}
                            className="ml-auto"
                          >
                            {tpl.scope}
                          </Badge>
                        </div>
                        {tpl.description ? (
                          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2 whitespace-normal">
                            {tpl.description}
                          </p>
                        ) : null}
                        <code className="block font-mono text-[10px] text-muted-foreground/70">
                          {tpl.path}
                        </code>
                      </div>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <TemplatePreviewDialog
        folderPath={folderPath}
        template={openTemplate}
        onOpenChange={(open) => {
          if (!open) setOpenTemplate(null);
        }}
        onChange={onChange}
      />
      <NewTemplateDialog
        folderPath={folderPath}
        existingNames={new Set(templates.map((t) => t.name))}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={onChange}
      />
    </>
  );
}
