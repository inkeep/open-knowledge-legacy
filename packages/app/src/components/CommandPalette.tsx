import {
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  Hash,
  LayoutGrid,
  Network,
  Settings,
  Sparkles,
} from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  filterOmnibarRecents,
  loadOmnibarRecents,
  makeOmnibarRecentKey,
  type OmnibarRecentEntry,
  rememberOmnibarRecent,
  saveOmnibarRecents,
} from '@/components/command-palette-recents';
import {
  buildWorkspaceEntries,
  fetchWorkspaceSearchEntries,
  matchesCommandQuery,
  searchWorkspaceEntries,
  splitTextByQueryMatches,
  type WorkspaceEntry,
  type WorkspaceSearchEntry,
} from '@/components/command-palette-search';
import {
  fetchDocsForTag,
  fetchTagsList,
  filterTagList,
  parseTagPaletteQuery,
  TAG_QUERY_PREFIX,
  type TagDocEntry,
} from '@/components/command-palette-tag-search';
import { requestDocPanelTab } from '@/components/doc-panel-events';
import { defaultInitialDir } from '@/components/file-tree-utils';
import { NewItemDialog } from '@/components/NewItemDialog';
import { usePageList } from '@/components/PageListContext';
import { SeedDialog } from '@/components/SeedDialog';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { useDocumentContext } from '@/editor/DocumentContext';
import type { TagSummaryEntry } from '@/editor/extensions/tag-suggestion';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { hashFromDocName } from '@/lib/doc-hash';
import { runWithToast as runWithToastBase } from '@/lib/error-state';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';
import { useWorkspace } from '@/lib/use-workspace';
import { cn, isMacOs } from '@/lib/utils.ts';
import { buildHandoffInput, useHandoffDispatch } from './handoff/useHandoffDispatch';
import { useInstalledAgents } from './handoff/useInstalledAgents';

const COMMAND_PALETTE_SEARCH_TIMEOUT_MS = 3000;

export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'CommandPalette');

interface CommandPaletteProps {
  bridge?: OkDesktopBridge | null;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}

function navigateToDocHash(docName: string): void {
  window.location.assign(hashFromDocName(docName));
}

function resolveCreateInitialDir(
  activeTarget: ReturnType<typeof useDocumentContext>['activeTarget'],
  activeDocName: string | null,
): string {
  if (activeTarget?.kind === 'folder' || activeTarget?.kind === 'folder-index') {
    return activeTarget.folderPath;
  }
  return defaultInitialDir(activeDocName);
}

function NavigationItem({
  entry,
  query = '',
  onSelect,
}: {
  entry: WorkspaceEntry | WorkspaceSearchEntry | OmnibarRecentEntry;
  query?: string;
  onSelect: () => void;
}) {
  const Icon = entry.kind === 'folder' ? FolderOpen : FileText;
  const title =
    'title' in entry && entry.title ? entry.title : (entry.path.split('/').pop() ?? entry.path);
  const snippet = 'snippet' in entry ? entry.snippet : undefined;

  return (
    <CommandItem
      value={`${entry.kind} ${entry.path}`}
      onSelect={onSelect}
      data-testid={`command-palette-nav-${entry.kind}-${entry.path}`}
      className="items-start"
    >
      <Icon className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">
          <HighlightedText query={query} text={title} />
        </span>
        <span className="truncate text-muted-foreground text-xs">
          <HighlightedText query={query} text={entry.path} />
        </span>
        {snippet ? (
          <span className="max-h-10 overflow-hidden text-muted-foreground text-xs leading-relaxed">
            <HighlightedText query={query} text={snippet} />
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = splitTextByQueryMatches(text, query);
  return (
    <>
      {segments.map((segment) => {
        const key = `${segment.start}:${segment.match ? 'match' : 'plain'}`;
        return segment.match ? (
          <mark key={key} className="rounded-sm bg-primary/10 px-0.5 font-semibold text-primary">
            {segment.text}
          </mark>
        ) : (
          <span key={key}>{segment.text}</span>
        );
      })}
    </>
  );
}

export function computeVisibleSearchResults({
  searchResults,
  fallbackSearchResults,
  searchStatus,
}: {
  searchResults: readonly WorkspaceSearchEntry[];
  fallbackSearchResults: readonly WorkspaceEntry[];
  searchStatus: 'idle' | 'loading' | 'success' | 'error';
}): readonly (WorkspaceEntry | WorkspaceSearchEntry)[] {
  if (searchResults.length > 0) return searchResults;
  if (searchStatus === 'success') return [];
  return fallbackSearchResults;
}

export function CommandPalette({ bridge = null, open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const trimmedDeferredQuery = deferredQuery.trim();
  const [searchResults, setSearchResults] = useState<WorkspaceSearchEntry[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [projectRecents, setProjectRecents] = useState<RecentProjectEntry[]>([]);
  const [recentNavigation, setRecentNavigation] = useState<OmnibarRecentEntry[]>([]);
  const [createDialogKind, setCreateDialogKind] = useState<'file' | 'folder' | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [tagsList, setTagsList] = useState<TagSummaryEntry[]>([]);
  const [tagsListStatus, setTagsListStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [tagDocs, setTagDocs] = useState<TagDocEntry[]>([]);
  const [tagDocsStatus, setTagDocsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const tagsListFetchedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeDocName, activeTarget } = useDocumentContext();
  const { pages, pageTitles, pageMeta, folderPaths } = usePageList();
  const workspace = useWorkspace();
  const { states: installStates, refresh: refreshInstallStates } = useInstalledAgents();
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });

  const workspaceEntries = buildWorkspaceEntries(pages, folderPaths, pageTitles, pageMeta);
  const validRecentKeys = new Set(
    workspaceEntries.map((entry) => makeOmnibarRecentKey(entry.kind, entry.path)),
  );
  const visibleRecents = filterOmnibarRecents(recentNavigation, validRecentKeys);
  const currentPath = bridge?.config.projectPath ?? null;
  const switchableProjects = bridge ? projectRecents.filter((row) => row.path !== currentPath) : [];
  const initialCreateDir = resolveCreateInitialDir(activeTarget, activeDocName);
  const fallbackSearchResults =
    trimmedDeferredQuery === ''
      ? []
      : searchWorkspaceEntries(workspaceEntries, trimmedDeferredQuery, 8);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isTrigger = e.key === 'k' && (isMacOs() ? e.metaKey : e.ctrlKey);
      if (!isTrigger) return;
      e.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (open) {
      setRecentNavigation(loadOmnibarRecents());
      void refreshInstallStates();
      if (bridge) {
        let cancelled = false;
        void runWithToast(async () => {
          const result = await bridge.project.listRecent();
          if (!cancelled) setProjectRecents(result);
        }, 'Failed to load recent projects.');
        return () => {
          cancelled = true;
        };
      }
      return;
    }
    setQuery('');
    setTagsList([]);
    setTagsListStatus('idle');
    tagsListFetchedRef.current = false;
    setTagDocs([]);
    setTagDocsStatus('idle');
  }, [open, bridge, refreshInstallStates]);

  useEffect(() => {
    void query;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const knownTagNames = new Set(tagsList.map((t) => t.name));
  const paletteMode = parseTagPaletteQuery(deferredQuery, knownTagNames);
  const isTagMode = paletteMode.kind !== 'normal';

  useEffect(() => {
    if (!open || !isTagMode) return;
    if (tagsListFetchedRef.current) return;
    tagsListFetchedRef.current = true;
    setTagsListStatus('loading');
    let cancelled = false;
    void fetchTagsList()
      .then((tags) => {
        if (cancelled) return;
        setTagsList(tags);
        setTagsListStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[command-palette-tag] fetch tags failed', err);
        setTagsList([]);
        setTagsListStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, isTagMode]);

  const tagDocsTarget = paletteMode.kind === 'tag-docs' ? paletteMode.tagName : null;
  useEffect(() => {
    if (!open || tagDocsTarget === null) {
      setTagDocs([]);
      setTagDocsStatus('idle');
      return;
    }
    setTagDocsStatus('loading');
    setTagDocs([]);
    let cancelled = false;
    void fetchDocsForTag(tagDocsTarget)
      .then((docs) => {
        if (cancelled) return;
        setTagDocs(docs);
        setTagDocsStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[command-palette-tag] fetch tag docs failed', err);
        setTagDocs([]);
        setTagDocsStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, tagDocsTarget]);

  useEffect(() => {
    if (!open || !trimmedDeferredQuery || isTagMode) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }

    const controller = new AbortController();
    setSearchStatus('loading');
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setSearchResults([]);
      setSearchStatus('error');
    }, COMMAND_PALETTE_SEARCH_TIMEOUT_MS);

    void fetchWorkspaceSearchEntries(trimmedDeferredQuery, { signal: controller.signal })
      .then((results) => {
        window.clearTimeout(timeout);
        setSearchResults(results);
        setSearchStatus('success');
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout);
        if (error instanceof Error && error.name === 'AbortError' && !timedOut) return;
        setSearchResults([]);
        setSearchStatus('error');
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, trimmedDeferredQuery, isTagMode]);

  const runAction = (fn: () => Promise<void> | void, fallback = 'Command failed.') => {
    onOpenChange(false);
    void runWithToast(async () => {
      await fn();
    }, fallback);
  };

  function rememberNavigation(entry: WorkspaceEntry | OmnibarRecentEntry) {
    const nextEntry = {
      kind: entry.kind,
      path: entry.path,
      lastOpenedAt: new Date().toISOString(),
    } satisfies OmnibarRecentEntry;
    const nextRecents = rememberOmnibarRecent(loadOmnibarRecents(), nextEntry);
    saveOmnibarRecents(nextRecents);
    setRecentNavigation(nextRecents);
  }

  function navigateToEntry(entry: WorkspaceEntry | OmnibarRecentEntry) {
    onOpenChange(false);
    rememberNavigation(entry);
    navigateToDocHash(entry.path);
  }

  const showRecentNavigation =
    !isTagMode && trimmedDeferredQuery === '' && visibleRecents.length > 0;
  const visibleSearchResults = computeVisibleSearchResults({
    searchResults,
    fallbackSearchResults,
    searchStatus,
  });
  const showNavigation = !isTagMode && visibleSearchResults.length > 0;
  const showSearchLoading =
    !isTagMode && trimmedDeferredQuery !== '' && searchStatus === 'loading' && !showNavigation;
  const showCreateFile =
    !isTagMode && matchesCommandQuery('New file', deferredQuery, ['create file']);
  const showCreateFolder =
    !isTagMode && matchesCommandQuery('New folder', deferredQuery, ['create folder']);
  const showGraphCommand =
    !isTagMode &&
    activeDocName !== null &&
    matchesCommandQuery('Open graph', deferredQuery, ['graph panel network']);
  const showInitializeStarterPack =
    !isTagMode &&
    matchesCommandQuery('Initialize starter pack', deferredQuery, [
      'scaffold',
      'seed',
      'pack',
      'starter',
    ]);
  const showProjectOpenFolder =
    !isTagMode &&
    bridge !== null &&
    matchesCommandQuery('Open folder on disk', deferredQuery, ['project']);
  const showProjectSwitch =
    !isTagMode &&
    bridge !== null &&
    matchesCommandQuery('Switch Project', deferredQuery, ['switch project navigator projects']);
  const showSettings =
    !isTagMode && matchesCommandQuery('Settings', deferredQuery, ['preferences config']);
  const showInstallClaudeDesktop =
    !isTagMode &&
    matchesCommandQuery('Install for Claude Chat & Cowork (Desktop App)', deferredQuery, [
      'claude desktop install cowork',
    ]);
  const showProjectRecents =
    !isTagMode &&
    bridge !== null &&
    switchableProjects.length > 0 &&
    (trimmedDeferredQuery === '' ||
      switchableProjects.some((row) =>
        matchesCommandQuery(`${row.name} ${row.path}`, deferredQuery, ['recent project']),
      ));
  const showAgentGroup =
    !isTagMode &&
    handoffInput !== null &&
    (trimmedDeferredQuery === '' ||
      KNOWN_TARGETS.some((target) =>
        matchesCommandQuery(`Open in ${target.displayName}`, deferredQuery, [
          target.id,
          'agent handoff',
        ]),
      ));
  const tagListItems =
    paletteMode.kind === 'tag-list' ? filterTagList(tagsList, paletteMode.query) : [];
  const showTagListEmpty =
    paletteMode.kind === 'tag-list' && tagsListStatus !== 'loading' && tagListItems.length === 0;
  const showTagDocsEmpty =
    paletteMode.kind === 'tag-docs' && tagDocsStatus === 'success' && tagDocs.length === 0;

  const hasAnyResults =
    isTagMode ||
    showRecentNavigation ||
    showNavigation ||
    showSearchLoading ||
    showCreateFile ||
    showCreateFolder ||
    showGraphCommand ||
    showInitializeStarterPack ||
    showProjectOpenFolder ||
    showProjectSwitch ||
    showSettings ||
    showInstallClaudeDesktop ||
    showProjectRecents ||
    showAgentGroup;

  function navigateToTagDocs(tagName: string) {
    setQuery(`${TAG_QUERY_PREFIX}${tagName}`);
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Workspace Command Palette"
        description="Search files, folders, and commands for the current workspace."
        className="sm:max-w-2xl"
        commandProps={{
          shouldFilter: false,
          className:
            '[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4',
        }}
      >
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Search files, folders, or commands"
        />
        {/* Filter-pills row — Slack-style. Always visible so the
            available filters are discoverable without typing a magic
            prefix. Active pills highlight when their filter is in
            effect; clicking a highlighted pill exits the filter. */}
        <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setQuery(isTagMode ? '' : TAG_QUERY_PREFIX);
              inputRef.current?.focus();
            }}
            data-testid="command-palette-filter-tag"
            data-active={isTagMode}
            aria-pressed={isTagMode}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              isTagMode
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Hash className="size-3.5" />
            <span>By tag</span>
          </button>
        </div>
        <CommandList ref={listRef} className="subtle-scrollbar">
          {showSearchLoading && !showNavigation ? <CommandEmpty>Searching</CommandEmpty> : null}
          {!hasAnyResults ? (
            <CommandEmpty>
              {searchStatus === 'error' ? 'Search failed.' : 'No matching commands.'}
            </CommandEmpty>
          ) : null}

          {paletteMode.kind === 'tag-list' ? (
            <CommandGroup
              heading={paletteMode.query ? `Tags matching "${paletteMode.query}"` : 'All tags'}
            >
              {tagsListStatus === 'loading' ? <CommandEmpty>Loading tags</CommandEmpty> : null}
              {tagsListStatus === 'error' ? (
                <CommandEmpty>Failed to load tags. Press Escape and re-open to retry.</CommandEmpty>
              ) : null}
              {showTagListEmpty ? (
                <CommandEmpty>
                  {paletteMode.query
                    ? `No tags match "${paletteMode.query}".`
                    : 'No tags yet — author `#tagname` in any doc to populate the index.'}
                </CommandEmpty>
              ) : null}
              {tagListItems.map((tag) => (
                <CommandItem
                  key={`tag:${tag.name}`}
                  value={`tag ${tag.name}`}
                  onSelect={() => navigateToTagDocs(tag.name)}
                  data-testid={`command-palette-tag-${tag.name}`}
                >
                  <Hash />
                  <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {tag.count} {tag.count === 1 ? 'doc' : 'docs'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {paletteMode.kind === 'tag-docs' ? (
            <CommandGroup heading={`Docs tagged #${paletteMode.tagName}`}>
              {tagDocsStatus === 'loading' ? <CommandEmpty>Loading docs</CommandEmpty> : null}
              {tagDocsStatus === 'error' ? (
                <CommandEmpty>Failed to load docs. Press Escape and re-open to retry.</CommandEmpty>
              ) : null}
              {showTagDocsEmpty ? (
                <CommandEmpty>{`No docs registered under #${paletteMode.tagName}.`}</CommandEmpty>
              ) : null}
              {tagDocs.map((doc) => {
                const title = doc.title || doc.docName.split('/').pop() || doc.docName;
                return (
                  <CommandItem
                    key={`tag-doc:${doc.docName}`}
                    value={`tag-doc ${doc.docName}`}
                    onSelect={() => {
                      onOpenChange(false);
                      navigateToDocHash(doc.docName);
                    }}
                    data-testid={`command-palette-tag-doc-${doc.docName}`}
                    className="items-start"
                  >
                    <FileText className="mt-0.5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-medium">{title}</span>
                      <span className="truncate text-muted-foreground text-xs">{doc.docName}</span>
                      {doc.matchingTags.length > 0 &&
                      doc.matchingTags.some((t) => t !== paletteMode.tagName) ? (
                        <span className="truncate text-muted-foreground text-[11px]">
                          via{' '}
                          {doc.matchingTags
                            .filter((t) => t !== paletteMode.tagName)
                            .map((t) => `#${t}`)
                            .join(', ')}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {showRecentNavigation ? (
            <CommandGroup heading="Recently opened">
              {visibleRecents.map((entry) => (
                <NavigationItem
                  key={makeOmnibarRecentKey(entry.kind, entry.path)}
                  entry={entry}
                  onSelect={() => navigateToEntry(entry)}
                />
              ))}
            </CommandGroup>
          ) : null}

          {showCreateFile || showCreateFolder || showGraphCommand || showInitializeStarterPack ? (
            <CommandGroup heading="Commands">
              {showCreateFile ? (
                <CommandItem
                  value="new file create file"
                  onSelect={() => {
                    onOpenChange(false);
                    setCreateDialogKind('file');
                  }}
                  data-testid="command-palette-new-file"
                >
                  <FilePlus2 />
                  <span>New file</span>
                </CommandItem>
              ) : null}
              {showCreateFolder ? (
                <CommandItem
                  value="new folder create folder"
                  onSelect={() => {
                    onOpenChange(false);
                    setCreateDialogKind('folder');
                  }}
                  data-testid="command-palette-new-folder"
                >
                  <FolderPlus />
                  <span>New folder</span>
                </CommandItem>
              ) : null}
              {showGraphCommand ? (
                <CommandItem
                  value="open graph graph panel network"
                  onSelect={() => {
                    if (!activeDocName) return;
                    onOpenChange(false);
                    requestDocPanelTab('graph');
                  }}
                  data-testid="command-palette-open-graph"
                >
                  <Network />
                  <span>Open graph</span>
                </CommandItem>
              ) : null}
              {showInitializeStarterPack ? (
                <CommandItem
                  value="initialize starter pack scaffold seed"
                  onSelect={() => {
                    onOpenChange(false);
                    setSeedDialogOpen(true);
                  }}
                  data-testid="command-palette-initialize-starter-pack"
                >
                  <Sparkles />
                  <span>Initialize starter pack</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}

          {showAgentGroup ? (
            <CommandGroup heading="Open in agent">
              {KNOWN_TARGETS.filter((target) =>
                matchesCommandQuery(`Open in ${target.displayName}`, deferredQuery, [
                  target.id,
                  'agent handoff',
                ]),
              ).map((target) => {
                const installState = installStates[target.id];
                const enabled = installState.installed === true && handoffInput !== null;
                const hint =
                  installState.installed === null
                    ? 'Detecting'
                    : installState.installed === false
                      ? 'Not installed'
                      : null;
                const accessibleLabel = hint
                  ? `Open in ${target.displayName}, ${hint}`
                  : `Open in ${target.displayName}`;

                return (
                  <CommandItem
                    key={target.id}
                    value={`open in ${target.displayName} ${target.id} agent`}
                    disabled={!enabled}
                    onSelect={() => {
                      if (!enabled || !handoffInput) return;
                      onOpenChange(false);
                      void dispatchHandoff(target.id, handoffInput);
                    }}
                    data-testid={`command-palette-open-in-${target.id}`}
                    aria-label={accessibleLabel}
                  >
                    <span className="flex-1">Open in {target.displayName}</span>
                    {hint ? (
                      <span aria-hidden="true" className="ml-auto text-muted-foreground text-xs">
                        {hint}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {showProjectOpenFolder ||
          showProjectSwitch ||
          showSettings ||
          showInstallClaudeDesktop ||
          showProjectRecents ? (
            <CommandGroup heading="Project">
              {showProjectOpenFolder && bridge ? (
                <CommandItem
                  value="open folder on disk project"
                  onSelect={() =>
                    runAction(async () => {
                      const path = await bridge.dialog.openFolder();
                      if (!path) return;
                      await bridge.project.open({
                        path,
                        target: 'new-window',
                        entryPoint: 'pick-existing',
                      });
                    })
                  }
                  data-testid="command-palette-open-folder"
                >
                  <FolderOpen />
                  <span>Open folder on disk</span>
                  <CommandShortcut>⌘O</CommandShortcut>
                </CommandItem>
              ) : null}
              {showProjectSwitch && bridge ? (
                <CommandItem
                  value="switch-project navigator projects"
                  onSelect={() =>
                    runAction(() => bridge.navigator.open(), 'Failed to open Project Navigator.')
                  }
                  data-testid="command-palette-switch-project"
                >
                  <LayoutGrid />
                  <span>Switch Project</span>
                  <CommandShortcut>⌘⇧N</CommandShortcut>
                </CommandItem>
              ) : null}
              {showSettings ? (
                <CommandItem
                  value="settings preferences config"
                  onSelect={() => {
                    onOpenChange(false);
                    if (window.location.hash !== SETTINGS_OPEN_HASH) {
                      window.location.hash = SETTINGS_OPEN_HASH;
                    }
                  }}
                  data-testid="command-palette-settings"
                >
                  <Settings />
                  <span>Settings</span>
                  <CommandShortcut>⌘,</CommandShortcut>
                </CommandItem>
              ) : null}
              {showInstallClaudeDesktop ? (
                <CommandItem
                  value="install claude desktop cowork app"
                  onSelect={() => {
                    onOpenChange(false);
                    window.location.hash = '#install-claude-desktop';
                  }}
                  data-testid="command-palette-install-claude-desktop"
                >
                  <Download />
                  <span>Install for Claude Chat & Cowork (Desktop App)</span>
                </CommandItem>
              ) : null}
              {showProjectRecents && bridge
                ? switchableProjects
                    .filter((row) =>
                      matchesCommandQuery(`${row.name} ${row.path}`, deferredQuery, [
                        'recent project',
                      ]),
                    )
                    .slice(0, 10)
                    .map((row) => (
                      <CommandItem
                        key={row.path}
                        value={`${row.name} ${row.path} recent project`}
                        disabled={row.missing}
                        onSelect={() =>
                          runAction(
                            () =>
                              bridge.project.open({
                                path: row.path,
                                target: 'new-window',
                                entryPoint: 'recents',
                              }),
                            'Failed to open project.',
                          )
                        }
                        data-testid={`command-palette-recent-${row.path}`}
                      >
                        <Sparkles />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{row.name}</span>
                          <span className="truncate text-muted-foreground text-xs">
                            {row.path}
                            {row.missing ? '  (missing)' : ''}
                          </span>
                        </div>
                      </CommandItem>
                    ))
                : null}
            </CommandGroup>
          ) : null}

          {showNavigation ? (
            <CommandGroup heading="Search">
              {visibleSearchResults.map((entry) => (
                <NavigationItem
                  key={makeOmnibarRecentKey(entry.kind, entry.path)}
                  entry={entry}
                  query={trimmedDeferredQuery}
                  onSelect={() => navigateToEntry(entry)}
                />
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>

      <NewItemDialog
        open={createDialogKind === 'file'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="file"
        initialDir={initialCreateDir}
      />
      <NewItemDialog
        open={createDialogKind === 'folder'}
        onOpenChange={(next) => {
          if (!next) setCreateDialogKind(null);
        }}
        kind="folder"
        initialDir={initialCreateDir}
      />
      <SeedDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen} />
    </>
  );
}
