# Evidence: CodeMirror Binding (loro-codemirror)

**Dimension:** D3 — CodeMirror binding existence and quality
**Date:** 2026-04-07
**Sources:** github.com/loro-dev/loro-codemirror, npm

---

## Key files / pages referenced

- https://github.com/loro-dev/loro-codemirror — Repository (41 stars, 9 forks, 36 commits)
- https://github.com/loro-dev/loro-codemirror/blob/main/src/index.ts — Main entry point

---

## Findings

### Finding: loro-codemirror exists and provides CodeMirror 6 integration
**Confidence:** CONFIRMED
**Evidence:** GitHub repository, source analysis

loro-codemirror v0.3.3 (Oct 7, 2025) provides:
- `LoroSyncPlugin` — document state sync between CodeMirror and Loro
- `LoroEphemeralPlugin` — modern cursor/presence via EphemeralStore
- `LoroAwarenessPlugin` — deprecated legacy Awareness protocol
- `LoroUndoPlugin` — undo/redo via Loro UndoManager
- `LoroExtensions` — composite function bundling all plugins

### Finding: Uses CodeMirror 6 extension system with LoroText
**Confidence:** CONFIRMED
**Evidence:** Source code analysis

Dependencies: `@codemirror/state`, `@codemirror/view` (CodeMirror 6.x)

The binding maps CodeMirror changes to Loro's LoroText type. A `getTextFromDoc` parameter allows custom mapping:
```typescript
getTextFromDoc?: (doc: LoroDoc) => LoroText
```
Default implementation uses `defaultGetTextFromDoc` from utils. This supports both simple single-text documents and complex multi-field documents.

Plain text operations use LoroText's `insert()` / `delete()` methods, which operate on the same Fugue-based CRDT as rich text but without mark operations.

### Finding: Less mature than loro-prosemirror
**Confidence:** CONFIRMED
**Evidence:** Comparative metrics

| Metric | loro-prosemirror | loro-codemirror |
|--------|-----------------|-----------------|
| Version | 0.4.3 | 0.3.3 |
| Stars | 138 | 41 |
| Commits | 93 | 36 |
| Last release | Feb 2026 | Oct 2025 |
| Open issues | 7 | 1 |

loro-codemirror is less actively developed, with the last release 6 months ago. However, CodeMirror bindings are inherently simpler than ProseMirror bindings (plain text vs rich text), so less churn may be appropriate.

### Finding: 1 open issue only
**Confidence:** CONFIRMED
**Evidence:** GitHub issues page

Only 1 open issue, suggesting either low usage or good stability. The simplicity of CodeMirror's text model (flat string) maps cleanly to LoroText without the tree-to-flat mapping complexity of ProseMirror.

---

## Gaps / follow-ups

- No performance benchmarks for large code files
- No documentation on syntax highlighting interaction with Loro sync
- Version compatibility with latest CodeMirror releases not verified
