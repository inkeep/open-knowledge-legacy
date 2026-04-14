# Evidence: ProseMirror instanceof Dedup

**Dimension:** ProseMirror `instanceof` dedup patterns
**Date:** 2026-04-13
**Sources:** prosemirror-model source, tiptap issues, prosemirror discuss

---

## Key files / pages referenced

- `prosemirror-model/src/fragment.ts` — `Fragment.from()` error origin
- [TipTap Issue #577](https://github.com/ueberdosis/tiptap/issues/577) — original report
- [TipTap Issue #5239](https://github.com/ueberdosis/tiptap/issues/5239) — version skew variant
- [ProseMirror Issue #1070](https://github.com/ProseMirror/prosemirror/issues/1070) — canonical upstream issue

---

## Findings

### Finding: Fragment.from() detects duplication via nodesBetween heuristic
**Confidence:** CONFIRMED
**Evidence:** `prosemirror-model/src/fragment.ts`:
```typescript
static from(nodes) {
  // ...
  throw new RangeError("Can not convert " + nodes + " to a Fragment" +
    (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""))
}
```

### Finding: Error is about different module instances, not different versions
**Confidence:** CONFIRMED
**Evidence:** Same version (1.25.4) loaded from two physical paths produces two `Fragment` constructors. `instanceof` is identity-based (prototype chain comparison), fails across module instances.

**Implications:** The fix is about module identity (one physical file = one constructor), not version pinning.

---

## Gaps / follow-ups

- The @tiptap/pm re-export adds one more resolution hop but doesn't duplicate — it's a pass-through
