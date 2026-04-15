---
name: updateYFragment is a structural diff, not a destructive replacement
sources:
  - node_modules/@tiptap/y-tiptap/dist/y-tiptap.js:1209-1335
confidence: HIGH
---

# `updateYFragment` walks a structural diff

Source: `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js:1209-1335`.

```js
const updateYFragment = (y, yDomFragment, pNode, meta) => {
  // ... attribute sync ...
  const pChildren = normalizePNodeContent(pNode);
  const yChildren = yDomFragment.toArray();
  let left = 0;
  let right = 0;
  // find number of matching elements from left
  for (; left < minCnt; left++) {
    const leftY = yChildren[left];
    const leftP = pChildren[left];
    if (!mappedIdentity(meta.mapping.get(leftY), leftP)) {
      if (equalYTypePNode(leftY, leftP)) {
        meta.mapping.set(leftY, leftP);  // ← preserves existing Y type!
      } else {
        break
      }
    }
  }
  // find number of matching elements from right (symmetric)
  // ... then in middle, recurse / delete / insert ...
```

## What this means

- Matching **prefix** children are **preserved in place** — their existing Y.js Items are kept.
- Matching **suffix** children are preserved in place.
- Only the **middle (differing region)** gets mutated (recursive `updateYFragment`, delete+insert).
- This is the tree-level analog of `applyByPrefixSuffix` in `observers.ts:148-167`.

## Reframing Bug-A

The prior claim "`syncTextToFragment` is a destructive tree replacement" was inaccurate. `updateYFragment` preserves Items wherever structure matches.

The real root cause of Bug-A: **`syncTextToFragment` uses Y.Text as the authoritative input**, and Y.Text can lag XmlFragment on the server because:
- Client user types → XmlFragment local tx → Observer A's 50ms debounce → eventually syncs to client Y.Text → CRDT propagates to server Y.Text
- Client user types → XmlFragment local tx → immediately propagates via CRDT to server XmlFragment
- So server XmlFragment has the user's content ~50ms before server Y.Text does

When `syncTextToFragment` parses server Y.Text → `updateYFragment(server.XmlFragment, parse(Y.Text))`:
- pChildren = parsed from Y.Text (no user content yet)
- yChildren = server's current XmlFragment (has user content)
- Left/right scan: mostly unmatched because pChildren is shorter
- Result: user's content children get deleted from XmlFragment to make structure match Y.Text

**The fix isn't "make updateYFragment non-destructive" — it's "don't use Y.Text as authoritative when XmlFragment has more-current state."**

## Implication for fix design

Read server's XmlFragment as the baseline (it has all propagated CRDT content), compose the agent's delta at the markdown level, then updateYFragment (which preserves user-content prefix/suffix regions by structural diff), and finally mirror Y.Text. This is a small reordering — no new infrastructure needed.
