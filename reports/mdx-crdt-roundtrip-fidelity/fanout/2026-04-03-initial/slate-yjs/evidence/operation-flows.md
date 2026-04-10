---
type: evidence
source: slate-yjs source code analysis
files_analyzed:
  - packages/core/src/plugins/withYjs.ts
  - packages/core/src/applyToYjs/index.ts
  - packages/core/src/applyToYjs/node/setNode.ts
  - packages/core/src/applyToYjs/node/insertNode.ts
  - packages/core/src/applyToSlate/index.ts
  - packages/core/src/applyToSlate/textEvent.ts
date: 2026-04-03
---

# Operation Flow Evidence

## Local Edit Flow: Slate -> Yjs

### Step 1: Slate apply() intercept (withYjs.ts:267-273)

```typescript
e.apply = (op) => {
  if (YjsEditor.connected(e) && YjsEditor.isLocal(e)) {
    YjsEditor.storeLocalChange(e, op);
  }
  apply(op);
};
```

Local ops are buffered in LOCAL_CHANGES along with the current document state snapshot.

### Step 2: Flush on onChange (withYjs.ts:275-281)

```typescript
e.onChange = () => {
  if (YjsEditor.connected(e)) {
    YjsEditor.flushLocalChanges(e);
  }
  onChange();
};
```

### Step 3: flushLocalChanges (withYjs.ts:237-264)

Changes are grouped by origin, then applied in Y.Doc transactions:

```typescript
e.sharedRoot.doc.transact(() => {
  txGroup.forEach((change) => {
    applySlateOp(e.sharedRoot, { children: change.doc }, change.op);
  });
}, txGroup[0].origin);
```

Key: Each op is replayed against the document snapshot at the time it was captured.
The `change.doc` is `editor.children` at the time the op was applied.

### Step 4: applySlateOp dispatch (applyToYjs/index.ts)

```typescript
const opMappers: OpMapper = {
  ...TEXT_MAPPER,    // insert_text, remove_text
  ...NODE_MAPPER,    // insert_node, remove_node, set_node, merge_node, move_node, split_node
  set_selection: NOOP,
};
```

## Remote Edit Flow: Yjs -> Slate

### Step 1: Y.XmlText observeDeep (withYjs.ts:209)

```typescript
e.sharedRoot.observeDeep(handleYEvents);
```

### Step 2: handleYEvents filter (withYjs.ts:185-194)

```typescript
const handleYEvents = (events, transaction) => {
  if (e.isLocalOrigin(transaction.origin)) {
    return;  // Skip our own changes
  }
  YjsEditor.applyRemoteEvents(e, events, transaction.origin);
};
```

### Step 3: applyRemoteEvents (withYjs.ts:173-181)

```typescript
e.applyRemoteEvents = (events, origin) => {
  YjsEditor.flushLocalChanges(e);  // Flush pending local changes first
  Editor.withoutNormalizing(e, () => {
    YjsEditor.withOrigin(e, origin, () => {
      applyYjsEvents(e.sharedRoot, e, events);
    });
  });
};
```

### Step 4: translateYTextEvent (applyToSlate/textEvent.ts:239-280)

Two types of changes in a YTextEvent:

**A. Key changes** (attribute modifications on the Y.XmlText itself):
```typescript
const keyChanges = Array.from(changes.keys.entries());
if (slatePath.length > 0 && keyChanges.length > 0) {
  const newProperties = Object.fromEntries(
    keyChanges.map(([key, info]) => [
      key,
      info.action === 'delete' ? null : target.getAttribute(key),
    ])
  );
  ops.push({ type: 'set_node', newProperties, properties, path: slatePath });
}
```

**B. Delta changes** (content modifications - text inserts/deletes, embed changes):
Processed via `applyDelta()` which generates insert_text, remove_text, insert_node,
remove_node, split_node, and set_node operations.

## setNode operation (Slate -> Yjs, applyToYjs/node/setNode.ts)

For element targets (has yTarget Y.XmlText):
```typescript
if (yTarget) {
  Object.entries(op.newProperties).forEach(([key, value]) => {
    if (value === null) return yTarget.removeAttribute(key);
    yTarget.setAttribute(key, value);
  });
}
```

For text targets (no yTarget, just text in parent):
```typescript
yParent.format(textRange.start, textRange.end - textRange.start, newProperties);
```

## insertNode operation (Slate -> Yjs, applyToYjs/node/insertNode.ts)

```typescript
if (Text.isText(op.node)) {
  return yParent.insert(textRange.start, op.node.text, getProperties(op.node));
}
yParent.insertEmbed(textRange.start, slateElementToYText(op.node));
```

Text nodes: insert string with formatting attributes.
Element nodes: insert embedded Y.XmlText (full recursive conversion via slateElementToYText).
