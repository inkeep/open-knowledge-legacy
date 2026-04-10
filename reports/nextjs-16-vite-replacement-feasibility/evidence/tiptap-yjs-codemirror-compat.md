# Evidence: TipTap / Y.js / CodeMirror Compatibility

**Dimension:** D3 — TipTap / Y.js / CodeMirror compatibility with Next.js
**Date:** 2026-04-08
**Sources:** TipTap docs, GitHub issues, community guides

---

## Key sources referenced

- https://tiptap.dev/docs/editor/getting-started/install/nextjs — Official TipTap Next.js guide
- https://github.com/ueberdosis/tiptap/issues/5856 — SSR detection bug
- https://tiptap.dev/docs/hocuspocus/getting-started/overview — HocuspocusProvider docs

---

## Findings

### Finding: TipTap has an official Next.js installation guide with `"use client"` + `immediatelyRender: false`
**Confidence:** CONFIRMED
**Evidence:** TipTap docs show the recommended pattern:

```javascript
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const Tiptap = () => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Hello World!</p>',
    immediatelyRender: false,
  })
  return <EditorContent editor={editor} />
}
```

**Implications:** Basic TipTap works in Next.js with these two workarounds. But the current app uses significantly more complex setup (collaboration extensions, y-prosemirror, CodeMirror source mode).

### Finding: Issue #5856 was caused by API misuse, not a framework bug — but subtle SSR risks remain
**Confidence:** CONFIRMED
**Evidence:** D3 agent investigated: Issue #5856 was closed as COMPLETED. Root cause was the reporter using both `useEditor()` and `EditorProvider` simultaneously (mutually exclusive APIs). `immediatelyRender: false` is sufficient when used correctly.

However, a critical subtlety: **`"use client"` does NOT prevent SSR.** Next.js still pre-renders client components on the server for initial HTML. Component code runs in Node during SSR — only hooks (`useEffect`, `useState`) are deferred to the client. Any browser API access outside hooks will crash.

The current `TiptapEditor.tsx` has a module-level singleton that accesses `window.location` — this would crash during SSR:
```ts
let singletonProvider: HocuspocusProvider | null = null;
function getProvider(): HocuspocusProvider {
  singletonProvider = new HocuspocusProvider({
    url: `ws://${window.location.host}/collab`, // crashes in Node
  });
}
```

**Implications:** The editor must either use `next/dynamic({ ssr: false })` to fully skip server rendering, or refactor all browser API access into `useEffect` hooks. This is a significant migration effort for the current codebase.

### Finding: y-prosemirror and y-codemirror.next access browser APIs at initialization
**Confidence:** INFERRED
**Evidence:** y-prosemirror creates ProseMirror plugins that interact with DOM Selection API. y-codemirror.next binds to CodeMirror's EditorView which requires a DOM element. Both libraries expect a browser environment. They don't guard against server-side execution.

**Implications:** Must use `next/dynamic({ ssr: false })` or ensure these modules are only imported in client components. In Vite, this is a non-issue because there's no server rendering path.

### Finding: HocuspocusProvider creates WebSocket connections — must be client-only
**Confidence:** CONFIRMED
**Evidence:** HocuspocusProvider connects to a WebSocket URL on instantiation. Running this during SSR or build would fail or create orphaned connections.

**Implications:** The entire editor + collaboration layer must be wrapped in client-only boundaries. This is a large surface area of the app.

### Finding: CodeMirror 6 works in Next.js with `"use client"` boundary
**Confidence:** INFERRED
**Evidence:** CodeMirror 6 is a browser-only library that creates an EditorView attached to a DOM element. Multiple community examples show it working in Next.js with `"use client"`. No SSR-specific issues beyond the standard client-only pattern.

**Implications:** Works, but adds another component that needs client-only wrapping.

### Finding: HMR with collaborative editing state is fragile regardless of bundler
**Confidence:** INFERRED
**Evidence:** TipTap editor state, Y.Doc connections, and awareness cursors are long-lived. Hot module replacement that destroys and recreates components risks disconnecting from the collaboration session. This is a concern with both Vite and Turbopack, but the current Vite setup has been debugged for this (e.g., module-level watcher subscription that survives HMR in the plugin).

**Implications:** Migration to Next.js would require re-solving HMR stability for the collaboration layer. The current Vite setup has already solved this.

---

### Finding: Turbopack HMR has a known bug affecting `"use client"` components
**Confidence:** CONFIRMED
**Evidence:** Next.js issue #85883 reports that after upgrading to 15.5+/16.x, HMR frequently fails with "Could not find the module in the React Client Manifest" for `"use client"` components. Turbopack-specific regression persisting in 16.0.x.

**Implications:** Development experience may be degraded for an app where 100% of components are `"use client"`.

### Finding: Liveblocks has a production-proven CodeMirror + Yjs + Next.js pattern
**Confidence:** CONFIRMED
**Evidence:** Liveblocks collaborative CodeMirror + Yjs + Next.js guide uses `"use client"` + `useEffect` pattern without `next/dynamic`. Y.Doc, provider, and yCollab binding all created within useEffect with cleanup.

**Implications:** The pattern works in production, but requires the editor initialization to be refactored from the current module-level singleton approach to a hook-based approach.

---

## Gaps / follow-ups

* Whether `@tiptap/y-tiptap` (the specific binding used in this app) has Next.js-specific issues
* Whether Turbopack HMR bug #85883 has been resolved in Next.js 16.1+
