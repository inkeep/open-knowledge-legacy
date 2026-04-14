---
name: sidebar-collapse-state
description: Root-cause evidence for why folders don't re-expand on activeDocName change, and the derive-don't-store pattern chosen to fix it.
sources:
  - packages/app/src/components/FileSidebar.tsx
  - packages/app/src/components/WikiLinkSuggestionMenu.tsx
  - packages/app/src/editor/extensions/SlashCommandMenu.tsx
  - packages/app/src/globals.css
baseline-commit: 496a06d
---

# Root cause — `collapsed` state is mount-only

## The code

`FileSidebar.tsx:78-82`:

```tsx
const FileTreeNode: FC<{ ... selectedPath: string | null; ... }> = ({ node, selectedPath, ... }) => {
  const isFile = node.kind === 'file';
  const [collapsed, setCollapsed] = useState(() => {
    if (!selectedPath || isFile) return true;
    return !selectedPath.startsWith(`${node.path}/`) && selectedPath !== node.path;
  });
```

The initializer function runs **once per component mount**. React does not re-run `useState` initializers when props change.

`FileSidebar.tsx:413` — how `selectedPath` is threaded:

```tsx
<FileTreeNode
  key={node.path}
  node={node}
  selectedPath={activeDocName}     // reactive, updates on every activation
  ...
/>
```

Because `key={node.path}` is stable across renders (the same folder retains identity as long as it exists in the tree), React does **not** remount the component when `activeDocName` changes. It updates props. The `collapsed` state keeps its initial value indefinitely.

## The symptom

Every activation path that changes `activeDocName` to a doc inside a currently-collapsed folder leaves that folder collapsed. The active row exists in the virtual tree and is marked `isActive={true}` (so `isActive` styling is applied), but it is not rendered in the DOM because its parent folder short-circuits rendering at `FileTreeNode:206`:

```tsx
{node.children.length > 0 && !collapsed && (
  <SidebarMenuSub ...>
    {node.children.map((child) => <FileTreeNode ... />)}
  </SidebarMenuSub>
)}
```

If `collapsed` is true, children are not rendered. The user sees an unchanged sidebar.

## Rejected alternatives

**Per-node `useEffect(() => setCollapsed(...), [selectedPath])`.** Tempting, but:

1. **Unmount on collapse.** When a user collapses a folder, child `FileTreeNode` instances **unmount** (because `!collapsed &&` short-circuits rendering). On re-expansion, a fresh `FileTreeNode` mounts — there is no local state to sync.
2. **User-intent vs derived-intent conflict.** If a user manually collapses a folder, the effect shouldn't re-expand when `selectedPath` doesn't actually change. Expressing two-input behavior in a leaf `useEffect` gets tangled.
3. **Scroll-into-view coordination.** Per-node effects don't know the scroll container.

**Lifted `Set<string>` + `useEffect` unioning ancestors on activation.** Explored and rejected for two reasons:

1. **Stale entries.** Rename a folder while a doc inside is active → `handleRename` (line 290–321) writes a new hash; reveal unions new ancestors into the Set. The old ancestor paths stay in the Set forever. If a folder of the same name is later recreated, it renders pre-expanded — an off-by-history bug.
2. **Scroll-before-children race.** The ancestor union runs in `useEffect` → `setState`. React schedules a re-render. The scroll `useLayoutEffect` keyed on `[activeDocName]` may run **before** the second render, targeting a DOM that hasn't yet mounted the active row's children, making `activeRowRef.current` null.

Both classes of bugs disappear with the chosen pattern below.

## Chosen pattern — derive, don't store (D4)

```tsx
export function FileSidebar() {
  const { activeDocName } = useDocumentContext();
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [userExpanded, setUserExpanded] = useState<Set<string>>(new Set());
  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(new Set());
  const activeRowRef = useRef<HTMLElement | null>(null);

  // Clear user-collapse intent on every activation (D1: activation overrides)
  useEffect(() => {
    setUserCollapsed(new Set());
  }, [activeDocName]);

  // Scroll the active row into view on activation. Native no-op when visible.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeDocName]);                                  // Deps: activeDocName only (D6)

  // Per-render derivation (no setState round-trip)
  const tree = buildTree(documents);
  const folderPaths = collectFolderPaths(tree);         // Set<string> of folder paths
  const ancestors = computeAncestors(activeDocName);    // string[] of ancestor folder paths

  const expandedPaths = new Set<string>();
  for (const a of ancestors) if (folderPaths.has(a)) expandedPaths.add(a);
  for (const p of userExpanded) if (folderPaths.has(p)) expandedPaths.add(p);
  for (const p of userCollapsed) expandedPaths.delete(p);

  // FileTreeNode reads expandedPaths.has(node.path) as a prop
  // Toggle handler:
  //   if (ancestors.includes(path))  setUserCollapsed(s => new Set(s).add(path))
  //   else                            setUserExpanded(s => toggle(s, path))
}
```

**Why this dissolves the two rejected-alternative bugs:**

- **Stale entries:** `userExpanded`/`userCollapsed` are filtered by `folderPaths.has(...)` on every render. Entries for deleted folders are simply ignored and never cause visual effects. Recreated folders render collapsed (default).
- **Scroll-before-children race:** Expansion is synchronous with render. By the time the scroll `useEffect` runs (React's post-render phase), children are already mounted and `activeRowRef.current` points at a real element.

**Why `scrollIntoView` uses no `behavior` option (D7):**

The repo honors `prefers-reduced-motion` in `globals.css:191,602,644`. Sibling components (`WikiLinkSuggestionMenu.tsx:51`, `SlashCommandMenu.tsx:35`) call `scrollIntoView({ block: 'nearest' })` with no `behavior` override. Default scroll is instant, which implicitly honors reduced-motion preferences without extra wiring. One less decision, aligned with existing code.

**Why scroll effect deps are `[activeDocName]` only (D6):**

Poll ticks, `userExpanded` toggles, and rename/delete of other docs should not trigger a re-scroll. Transitive ancestor renames (folder `a` → `a'` while `a/b/c.md` is active) are handled because `handleRename` writes a new hash, which updates `activeDocName` and naturally re-fires the scroll.

**Accessibility (D9):**

- Active row: `aria-current="page"` and `tabIndex={0}`.
- All other rows: `tabIndex={-1}` (roving tabindex).
- No `.focus()` call on activation — focus stays at the originating interaction.
- Screen-reader announcement of newly-revealed ancestors: rely on native `aria-expanded` transitions (already on the folder buttons at `FileTreeNode:161-166`). No separate `aria-live` region.
