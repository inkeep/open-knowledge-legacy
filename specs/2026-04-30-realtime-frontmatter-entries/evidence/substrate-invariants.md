---
date: 2026-04-30
sources:
  - "CLAUDE.md (substrate §1)"
  - "PRECEDENTS.md (#11, #12, #13(a), #13(b), #14, #18(c), #24, #25)"
  - "packages/server/src/server-observers.ts"
  - "packages/app/tests/integration/test-harness.ts (attachBridgeInvariantWatcher)"
type: invariant
---

# Substrate invariants — must continue to hold

The bridge invariants and observer behaviors that govern the editor substrate. The new direction must verify these still hold.

## Bridge invariant (CLAUDE.md substrate §1)

```
stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))
```

**Today:** Observer A composes Y.Text content as `prependFrontmatter(getFrontmatter(doc), serialize(fragment))`. `getFrontmatter` synthesizes YAML from per-key metaMap (with legacy slot fallback).

**After topic:** Observer A composes Y.Text content as `prependFrontmatter(<FM-from-Y.Text-region>, serialize(fragment))`. The FM region IS already in `Y.Text`, so the composition is trivially `ytext.toString()` (assuming nothing else mutated body in the same drain). The invariant continues to hold because:

- `serialize(fragment)` is unchanged — XmlFragment is body-only, no FM. The strip-FM-before-parse pattern in `applyExternalChange`, `Observer B`, and `applyAgentMarkdownWrite` is the same.
- The bridge invariant equality is between `Y.Text` and `prepend(FM, body)`. If FM lives in Y.Text already, this collapses.

**Risk:** Subtle staleness if a Y.Text-region edit fires Observer B (recompute body XmlFragment from Y.Text body), and Observer A's `lastSyncedXmlMd` baseline isn't refreshed for the FM-only edit case. Spec must verify: a pure FM-region edit (no body change) leaves XmlFragment alone and the baseline correct.

## Baseline invariant

Observer A's `lastSyncedXmlMd` matches current XmlFragment state. Staleness → incorrect diffs → bridge content loss.

**Today:** baseline refreshed on every XmlFragment change AND on metaMap deep change (because `getFrontmatter(doc)` is part of the composed-string baseline).

**After topic:** baseline only depends on XmlFragment. Drop the metaMap deep observation. The composed-string baseline becomes `prependFrontmatter(<FM-from-Y.Text>, lastSyncedXmlMd)` — same expression, different FM source.

## Item-preservation invariant

Sync ops must not replace Y.Items whose content already matches at the target position. Preserves UndoManager attribution through bridge cycles.

**Today / After topic:** unchanged — applies to body XmlFragment ↔ Y.Text body bridge, not to FM region. Y.Text region edits are surgical (delete + insert in one transact) and don't touch body Items.

## Paired-write origin discipline (precedent #1 extension, STOP rule)

Origins that atomically mutate BOTH Y.XmlFragment and Y.Text MUST opt in via `context.paired: true`.

`FORM_WRITE_ORIGIN` was non-paired before this topic and stays non-paired. The new binding still touches only Y.Text. Observer A must fire normally on Y.Text-region edits (not short-circuit on the FORM_WRITE_ORIGIN paired check, because it's not paired).

## Settlement dispatcher (precedent #13(b))

One `afterAllTransactions` drain per outermost `doc.transact()`. Observer A runs first, then Observer B.

**Today:** Y.Text-region edits emerging from PropertyPanel touch metaMap → Observer Meta fires → marks `metaDirty` → settlement dispatcher routes to Observer A path (recompose Y.Text from XmlFragment + metaMap).

**After topic:** Y.Text-region edits touch Y.Text directly under `FORM_WRITE_ORIGIN` (non-paired) → Observer B fires (Y.Text → XmlFragment) — but the body inside the YAML region is empty/absent so nothing meaningful happens to XmlFragment. **Spec must verify:** Observer B's normalize gate doesn't loop on FM-only edits.

## Single-writer cross-CRDT (precedent #14)

Cross-CRDT sync is server-side only; client observers do NOT write the derived CRDT.

The new binding writes ONLY `Y.Text`. Client never bridges to XmlFragment. Holds.

## Y.js observers ≠ React effects (precedent #18(c), STOP rule)

Y.js observers fire synchronously and aren't paused by Activity-mount transitions. Bounded subscriptions only.

**Today:** PropertyPanel's `useFrontmatterMap(provider)` does `metaMap.observeDeep` — bounded by `ACTIVITY_MOUNT_LIMIT=3` mounted EditorActivityPool entries.

**After topic:** PropertyPanel does `ytext.observe` — same bound applies. New concern: `ytext.observe` fires on EVERY Y.Text mutation (every body keystroke in source mode, every body edit in WYSIWYG via Observer A bridge). Re-parsing FM region on every body edit is wasteful. Need a content-equality bailout (e.g., snapshot the FM region's prefix bytes and re-parse only when those bytes change) or scope the observer to a region delta.

## Per-session actor identity (precedent #24)

Server-side writes use `session.dc.document.transact(fn, session.origin)`. The per-session frozen origin is mandatory.

`FORM_WRITE_ORIGIN` is browser-stamped, structurally validated server-side. Holds — no change.

## Writer-ID taxonomy (precedent #25)

`agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`.

`FORM_WRITE_ORIGIN` resolves to `principal-<UUID>` via `resolveWriterFromOrigin`. Holds — no change.

## L3 defense-in-depth (predecessor pattern)

L1 client-side schema parse before write; L2 headless writer; L3 server persistence-hook gate.

**Open question (see §11 OQ):** Does L3 still apply when FM lives in Y.Text? The original threat model was "non-binding writers to metaMap insert invalid values." After topic, no metaMap writers exist. But malformed YAML in the Y.Text region (from source-mode hand edits) might still warrant a defense surface — though `setFrontmatterFromYaml`'s "keep last valid" semantics already provide one.
