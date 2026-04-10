# Marksman LSP — Wikilink & Reference Resolution Source Code Evidence

## Three-Layer Symbol Model

### CST Layer (concrete, with positions)
**File:** `Marksman/Cst.fs:35-101`
- `WikiLink = { doc: option<WikiEncodedNode>; heading: option<WikiEncodedNode> }`
- `MdLink` — four variants: `IL` (inline), `RF` (reference full), `RC` (collapsed), `RS` (shortcut)

**File:** `Marksman/Cst.fs:238-245`
- `Element` discriminated union: `H | WL | ML | MLD | T | YML`

### AST Layer (simplified, position-free)
**File:** `Marksman/Ast.fs:17-56`
- `WikiLink = { doc: option<string>; heading: option<string> }`
- `MdLink = { text: string; url: option<string>; anchor: option<string> }`

### Symbol Layer (canonical abstraction for graph)
**File:** `Marksman/Syms.fs:9-79`
- `Ref = IntraRef (IntraSection | IntraLinkDef) | CrossRef (CrossDoc | CrossSection)`
- `Def = Doc | Title of string | Header of int * string | LinkDef of LinkLabel`

**File:** `Marksman/Ast.fs:113-172`
- `Element.toSym` — maps AST to Sym (e.g., `WikiLink { doc = Some "foo" }` → `CrossRef(CrossDoc "foo")`)

## Connection Graph (Backlink Index)

### `Conn` — the central cross-document index
**File:** `Marksman/Conn.fs:122-130`
```fsharp
type Conn = {
    refs: MMap<Scope, Ref>
    defs: Defs
    tags: MMap<Scope, Tag>
    resolved: Graph<ScopedSym>       // UNDIRECTED graph of resolved ref->def edges
    unresolved: Graph<Unresolved>    // unresolved refs (diagnostics)
    refDeps: Graph<Scope * CrossRef> // dependency graph for composite refs
    lastTouched: Set<ScopedSym>      // symbols affected by last update
}
```

### `Graph<'V>` — undirected graph as multimap
**File:** `Marksman/Graph.fs:7`
```fsharp
type Graph<'V> = { edges: MMap<'V, 'V> }
```

### `MMap<'K, 'V>` — multimap backed by `Map<'K, Set<'V>>`
**File:** `Marksman/MMap.fs:5-6`

### `Defs` — dual-indexed definitions
**File:** `Marksman/Conn.fs:84-87`
```fsharp
type Defs = {
    byScope: MMap<Scope, Def>
    bySlug: MMap<ScopeSlug, Scope * Def>
}
```

### Query: `Conn.Query.resolve` — single entry point
**File:** `Marksman/Conn.fs:519-523`
```fsharp
let resolve (scopedSym: ScopedSym) (conn: Conn) : Set<ScopedSym> =
    conn.resolved.edges |> MMap.tryFind scopedSym |> Option.defaultValue Set.empty
```

## Reference Resolution (LSP handlers)

### "Find All References" — the backlink query
**File:** `Marksman/Server.fs:855-881`
- `TextDocumentReferences` handler

**File:** `Marksman/Refs.fs:312-327`
- `Dest.findElementRefs` dispatches on symbol type

**File:** `Marksman/Refs.fs:227-291`
- `findDefRefs` — core backlink lookup for definitions. For titles, collects Doc + all title defs + all header defs, then queries Conn graph for all refs pointing at them.

### "Go to Definition"
**File:** `Marksman/Server.fs:797-822`
- `TextDocumentDefinition` handler → `Dest.tryResolveSym` → `Conn.Query.resolve`

## Incremental Update Strategy

### Config-controlled: `coreIncrementalReferences` (default: false)
**File:** `Marksman/Folder.fs:549-607`
- `Folder.withDoc` method

**File:** `Marksman/Folder.fs:574-605`
- Line 586: incremental vs full rebuild decision

### Incremental `Conn.update` algorithm
**File:** `Marksman/Conn.fs:248-488`
1. Process removed tags/refs/defs → queue affected refs for re-resolution
2. Process added symbols → add refs to queue, invalidate affected resolved refs
3. Run resolution queue through Oracle
4. Update both `resolved` and `unresolved` graphs

### Paranoid mode: validates incremental == full rebuild
**File:** `Marksman/Folder.fs:591-601`

### FolderLookup incrementally maintained
**File:** `Marksman/Folder.fs:124-154`
- `withoutDoc` / `withDoc` update slug map + suffix tree without rebuild
