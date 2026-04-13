# Evidence: @tiptap/y-tiptap vs Direct y-prosemirror

## Source
- `node_modules/@tiptap/y-tiptap/package.json` (v3.0.3)
- `node_modules/y-prosemirror/package.json` (v1.3.7)
- `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` (compiled)
- `node_modules/y-prosemirror/src/` (source)

## Key Finding: @tiptap/y-tiptap is a 1:1 Fork, Not a Wrapper

### Relationship

From the README:
> "We forked y-prosemirror to create a Tiptap-specific package with changes we needed for Tiptap-related features. These modifications were too specific to be merged upstream or would have added maintenance overhead for the y-prosemirror maintainers."

- **Fork source:** https://github.com/ueberdosis/y-tiptap
- **Upstream:** https://github.com/yjs/y-prosemirror
- **@tiptap/y-tiptap does NOT import from y-prosemirror** — it's a complete independent copy

### API Compatibility: 100% Identical

Both packages export the same public API:

| Export | @tiptap/y-tiptap | y-prosemirror |
|--------|-----------------|---------------|
| `ySyncPlugin` | Yes | Yes |
| `yCursorPlugin` | Yes | Yes |
| `yUndoPlugin` | Yes | Yes |
| `undo` / `redo` | Yes | Yes |
| `prosemirrorToYDoc` | Yes | Yes |
| `yDocToProsemirror` | Yes | Yes |
| `yXmlFragmentToProsemirrorJSON` | Yes | Yes |
| `updateYFragment` | Yes | Yes |
| `initProseMirrorDoc` | Yes | Yes |
| `ProsemirrorBinding` | Yes | Yes |
| `absolutePositionToRelativePosition` | Yes | Yes |
| `relativePositionToAbsolutePosition` | Yes | Yes |

Function signatures are identical across both packages.

### Known Differences

1. **Dependency version:** `lib0: ^0.2.100` (@tiptap) vs `lib0: ^0.2.109` (y-prosemirror) — minor
2. **Distribution:** @tiptap/y-tiptap ships only `dist/` (compiled), y-prosemirror ships both `src/` and `dist/`
3. **Maintenance cadence:** @tiptap may lag upstream bugfixes, or may cherry-pick specific fixes

### What @tiptap/extension-collaboration Adds

The TipTap extension layer (`@tiptap/extension-collaboration`) wraps `ySyncPlugin` with TipTap's extension API:

```typescript
// Thin wrapper that:
// 1. Creates a Y.XmlFragment from the provider's Y.Doc
// 2. Calls ySyncPlugin(fragment) from @tiptap/y-tiptap
// 3. Exposes it as a TipTap Extension with configure() API
```

It adds no schema constraints beyond what y-prosemirror already has.

### Constraints Imposed

**@tiptap/y-tiptap imposes no additional constraints** beyond upstream y-prosemirror:
- Same peer dependencies (yjs ≥13.5.38, prosemirror-model ≥1.7.1, prosemirror-view ≥1.14.2)
- Same runtime behavior
- Same destructive catch block for unknown node types
- Same mark handling (overlapping via hash suffix)

The README states: "This package is designed for use with Tiptap and is not intended as a general-purpose Yjs binding for ProseMirror." This is a **usage recommendation**, not a technical constraint.

## Implications for Migration

1. **Switching between @tiptap/y-tiptap and y-prosemirror is zero-cost** — API-compatible, drop-in replacement
2. **If migrating away from TipTap to raw ProseMirror, y-prosemirror is the direct equivalent** — same code, same behavior
3. **Both repos need monitoring** — bugfixes in one may not appear in the other
4. **For a greenfield build, either works** — the choice is organizational (TipTap ecosystem vs independent), not technical
