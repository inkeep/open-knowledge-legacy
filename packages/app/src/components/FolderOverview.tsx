import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import {
  buildFolderOverviewData,
  type FolderOverviewEntry,
} from '@/components/folder-overview-data';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged } from '@/lib/documents-events';

type SortKey = 'name' | 'modified';
type SortDir = 'asc' | 'desc';

function formatRelativeDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortEntries(
  entries: FolderOverviewEntry[],
  key: SortKey,
  dir: SortDir,
): FolderOverviewEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    let cmp = 0;
    switch (key) {
      case 'name':
        cmp = a.title.localeCompare(b.title) || a.name.localeCompare(b.name);
        break;
      case 'modified': {
        const aM = a.kind === 'file' ? a.modified : '';
        const bM = b.kind === 'file' ? b.modified : '';
        cmp = aM.localeCompare(bM);
        break;
      }
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 uppercase font-mono"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {isActive ? (
        activeDir === 'asc' ? (
          <ArrowUp className="ml-1 size-3" />
        ) : (
          <ArrowDown className="ml-1 size-3" />
        )
      ) : (
        <ArrowUpDown className="ml-1 size-3 text-muted-foreground/50" />
      )}
    </Button>
  );
}

export function FolderOverview({ folderPath }: { folderPath: string }) {
  const { addPage, folderPaths, loading, pages, pageTitles, pageMeta } = usePageList();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creatingIndex, setCreatingIndex] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-start overflow-y-auto subtle-scrollbar">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-7 w-48" />
            </div>
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
          <div className="rounded-lg border">
            <div className="flex items-center gap-4 border-b px-4 py-3">
              <Skeleton className="h-4 w-16" />
              <div className="ml-auto">
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            {['a', 'b', 'c', 'd'].map((id) => (
              <div key={id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 w-40" />
                <div className="ml-auto">
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const data = buildFolderOverviewData(folderPath, { pages, pageTitles, pageMeta, folderPaths });
  const sorted = sortEntries(data.children, sortKey, sortDir);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

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
      <div className="flex min-h-0 flex-1 items-start overflow-y-auto subtle-scrollbar">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="size-5 text-muted-foreground" />
                <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
              </div>
              <DropdownMenuRoot>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="size-4" />
                    New
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={creatingIndex}
                    onSelect={() => void handleCreateIndexNote()}
                  >
                    <div>
                      <div className="font-medium">Index note</div>
                      <div className="text-xs text-muted-foreground">
                        Landing page for this folder
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCreateDialogOpen(true)}>
                    <div>
                      <div className="font-medium">Note</div>
                      <div className="text-xs text-muted-foreground">
                        New note inside this folder
                      </div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuRoot>
            </div>
            <p className="text-sm text-muted-foreground">
              This folder has no landing note yet. Choose an explicit action to add one or open a
              note inside the folder.
            </p>
            {createError ? (
              <span role="alert" className="text-sm text-destructive">
                {createError}
              </span>
            ) : null}
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHeader
                      label="Name"
                      sortKey="name"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                  <TableHead className="w-32">
                    <SortableHeader
                      label="Modified"
                      sortKey="modified"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={handleSort}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length ? (
                  sorted.map((entry) => (
                    <TableRow
                      key={entry.path}
                      className="cursor-pointer"
                      onClick={() => {
                        window.location.hash = hashFromDocName(entry.path);
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {entry.kind === 'folder' ? (
                            <Folder className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <File className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{entry.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.kind === 'file' ? formatRelativeDate(entry.modified) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                      This folder is empty.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
