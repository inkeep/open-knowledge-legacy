# Vestigial Client Observer Cleanup — Spec

**Status:** Scoping — not started
**Owner(s):** Nick Gomez
**Baseline commit:** follow-on to the server-authoritative observer bridge merge (commit TBD after PR merges).
**Builds on:** `specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md` (precedent #14 LOCKED — cross-CRDT sync is single-writer, server-side)

---

## 1. Problem statement (SCR)

**Situation.** After the server-authoritative observer bridge ship, the client `packages/app/src/editor/observers.ts` still contains observer scaffolding that no longer performs work:

- `Observer A` (`runObserverASync`) fires on XmlFragment changes but only maintains `lastSyncedXmlMd` — no cross-CRDT write. Its 50ms debounce, origin guards, and Bug-B conditional-baseline-refresh logic execute on every local user edit, consuming tick budget to update a baseline string that no other code reads.
- `Observer B` (`runObserverBSync`) fires on Y.Text changes. The body still does parse + early-exit + frontmatter update via `doc.transact(..., ORIGIN_TEXT_TO_TREE)`. The parse is used only for the body-comparison early-exit; no cross-CRDT mutation happens from it.
- `REMOTE_TREE_SYNC_GRACE_MS` (150ms) still defers Observer B after remote tree-only updates — relevant when Observer B wrote XmlFragment, now irrelevant.
- `markUserTyping` + the typing-defer state (`TYPING_DEFER_MS = 300`) are called from `TiptapEditor.tsx:148`, `SourceEditor.tsx:87`, and 4 test files — but Observer B no longer uses typing-defer to gate a write (it gates a parse that's also vestigial).
- `ORIGIN_TREE_TO_TEXT` + `ORIGIN_TEXT_TO_TREE` origin constants remain exported. They're still in `attachBridgeInvariantWatcher`'s enforcing set (`test-harness.ts:210`) as structural assertions, but the client never fires transactions under them anymore.

**Complication.** The server-authoritative ship's FR-7 deleted the cross-CRDT writes but consciously preserved the surrounding scaffolding under G3 ("Preserve bidirectional observer API. `setupObservers(...)` keeps exported, callers unchanged"). The preservation was correct at ship time — the cleanup surface was broad enough that an in-scope removal would have risked the core architectural change.

Under greenfield precedent #7 ("Remove broken capabilities rather than shipping them"), the remaining scaffolding is a broken capability — observer callbacks that fire and accomplish nothing — and should be deleted. But the cleanup deserves its own reasoning pass because:

1. **Scope.** ~200 LOC across `observers.ts`, touching ~8 import sites (tests, TiptapEditor, SourceEditor, provider-pool, test-harness, observer-sync.test.ts, bridge-matrix.test.ts, bug-c-real-reachability.test.ts).
2. **Origin-guard subtlety.** If `ORIGIN_TREE_TO_TEXT` + `ORIGIN_TEXT_TO_TREE` are deleted, `attachBridgeInvariantWatcher`'s enforcing set (`test-harness.ts:210`) changes — we need to decide whether those origins remain reserved (for future client-side observer work) or go entirely.
3. **Baseline-refresh future use.** `lastSyncedXmlMd`'s Bug-B conditional-refresh logic (`observers.ts:290-300`) was preserved in case a future feature needs it. The cleanup should either commit to "we'll never need client-side baseline reasoning" or document when the pattern might return.
4. **Test churn.** `observers.test.ts` + `observer-sync.test.ts` already have 53 `test.skip`'d tests from US-006. Cleanup needs to either delete the skips (if the observer itself is gone) or justify why they still exist.

**Resolution.** A dedicated spec that:
- Audits every caller of `setupObservers`, `markUserTyping`, `ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE`.
- Decides whether `observers.ts` becomes a stub (exports G3-preserved names, no-op implementations), deletes entirely, or retains a minimal read-side baseline function for potential future consumers.
- Updates CLAUDE.md + AGENTS.md precedent #14 to reflect the final state.
- Deletes the 53 skipped tests in `observers.test.ts` / `observer-sync.test.ts` if their subjects no longer exist.
- Removes `markUserTyping` call sites from TiptapEditor/SourceEditor if the typing-defer is gone, OR keeps them as cheap no-ops if useful for future sync-indicator work.

## 2. Why not in-scope for the server-authoritative ship

- **FR-7 was the minimum viable removal.** It deleted the cross-CRDT write paths and left the scaffolding because deleting the scaffolding would have risked conflating "move observer writes to server" with "delete observer client surface entirely." Two separate architectural decisions; two separate specs.
- **G3 explicitly required preservation.** "Preserve bidirectional observer API. `packages/app/src/editor/observers.ts` keeps `setupObservers(...)` exported, callers unchanged, `ORIGIN_TREE_TO_TEXT` and `ORIGIN_TEXT_TO_TREE` origins remain for client-side local-only observer firings." A cleanup spec needs to renegotiate that constraint (or confirm it).
- **53 test.skip'd tests need justification.** A spec-level decision: keep them as historical markers (valuable for future archaeology), delete them (dead code is dead), or migrate them to server-side tests where applicable.

## 3. Trigger

Create this spec (rename this file from SPEC.md — or rescue/expand — into a full SPEC) when one of:

- A new feature would touch `observers.ts` and would benefit from a clean surface rather than vestigial scaffolding to navigate around.
- A PR review flags the dead code with enough specificity to force the cleanup.
- Someone asks "what is `observers.ts` actually doing now?" — which is the question this spec answers.

## 4. Non-goals

- Not re-litigating precedent #14 (server-authoritative cross-CRDT sync).
- Not changing the server observer (`server-observers.ts`) — this is client-only cleanup.
- Not touching the V0-14 agent-undo handoff (separate spec).

## 5. Handoff note

This file is a SPEC-SEED. It should be expanded into a full `/spec`-grade SPEC.md (§6 requirements, §7 solution, §9 decisions) when the trigger fires. Until then, this document exists to prevent the cleanup from being forgotten and to ensure a future implementer has the context the server-authoritative ship generated about WHY the scaffolding was preserved and what's required to remove it correctly.
