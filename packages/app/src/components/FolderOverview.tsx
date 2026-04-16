import { FileText, FolderOpen, Plus, SquarePen } from 'lucide-react';
import { useState } from 'react';
import { buildFolderOverviewData } from '@/components/folder-overview-data';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';

export function FolderOverview({ folderPath }: { folderPath: string }) {
  const { addPage, folderPaths, pages, pageTitles } = usePageList();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingIndex, setCreatingIndex] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const data = buildFolderOverviewData(folderPath, { pages, pageTitles, folderPaths });

  async function handleCreateIndexNote() {
    setCreatingIndex(true);
    setCreateError(null);
    try {
      const path = `${folderPath}/index.md`;
      const res = await fetch('/api/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        docName?: string;
        error?: string;
      } | null;
      if (!res.ok || !payload?.ok) {
        setCreateError(payload?.error ?? `Server error (HTTP ${res.status})`);
        setCreatingIndex(false);
        return;
      }
      const docName = payload.docName ?? `${folderPath}/index`;
      addPage(docName);
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      window.location.hash = hashFromDocName(docName);
    } catch (error) {
      console.warn('[FolderOverview] create index note failed:', error);
      setCreateError('Network error — please try again');
    }
    setCreatingIndex(false);
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <FolderOpen className="size-5 text-muted-foreground" />
                  <Badge variant="outline">Folder</Badge>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
                  <p className="font-mono text-sm text-muted-foreground">{folderPath}/</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleCreateIndexNote()} disabled={creatingIndex}>
                  <Plus className="size-4" />
                  {creatingIndex ? 'Creating…' : 'Create index note'}
                </Button>
                <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                  <SquarePen className="size-4" />
                  New note in folder
                </Button>
              </div>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              This folder has no landing note yet. Choose an explicit action to add one or open a
              note inside the folder.
            </p>
            {createError ? (
              <span role="alert" className="text-sm text-destructive">
                {createError}
              </span>
            ) : null}
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FolderOpen className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Child folders</h2>
              </div>
              {data.childFolders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No child folders yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.childFolders.map((child) => (
                    <Button
                      key={child.path}
                      variant="outline"
                      className="h-auto items-start justify-start px-3 py-2 text-left"
                      onClick={() => {
                        window.location.hash = hashFromDocName(child.path);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{child.title}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {child.path}/
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Child notes</h2>
              </div>
              {data.childDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No notes directly inside this folder.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.childDocs.map((child) => (
                    <Button
                      key={child.docName}
                      variant="outline"
                      className="h-auto items-start justify-start px-3 py-2 text-left"
                      onClick={() => {
                        window.location.hash = hashFromDocName(child.docName);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{child.title}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {child.docName}.md
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <NewItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        kind="file"
        initialDir={folderPath}
      />
    </>
  );
}
