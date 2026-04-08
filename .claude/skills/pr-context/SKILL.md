---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — feat/presence-awareness-ux vs main |
| **Author** | Nick Gomez |
| **Base** | `main` |
| **Repo** | inkeep/open-knowledge |
| **Head SHA** | `1214db3065382dfedeee495f4d8c8eb586198c53` |
| **Size** | 16 commits · +1845/-212 · 33 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `inline` — full tracked diff included below |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
5494482 spec: presence & awareness UX (S5 v0)
adcc811 spec: add REACT_FIRST agent constraint
5c35f8f spec: align REACT_FIRST with ~/agents actual patterns
bcb0c5c [US-001] design system foundation — Tailwind v4, CVA, UI primitives
094d327 [US-002] identity system — getIdentity, useIdentity, AwarenessState types
a25cd8d [US-003] awareness state initialization on editor mount
c6b8603 [US-006] agent DirectConnection session model with awareness and 'agent-write' origin
17652f7 [US-007] server-side UndoManager with per-origin undo HTTP endpoints
4f6b122 [US-008] region flash plugin for WYSIWYG — direct DOM approach
ca376a4 [US-009] region flash plugin for Source — CodeMirror StateEffect/StateField
88e9892 [US-010] useVisibilityChange hook + flash-on-refocus in both plugins
e145ec3 [US-011] presence bar — usePresence hook + PresenceBar + PresenceBadge
4e19237 [US-012] agent undo button — useAgentUndo hook + AgentUndoButton component
f296763 [US-013] app layout integration — presence bar, undo button, mode toggle
c897415 [US-014] agent simulator v4 — awareness + activity + undo status logging
1214db3 fix: post-implementation review — diffArrays types, agentId constant, identity hook
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .claude/skills/pr-context/SKILL.md                 | 105 --------
 init_spike/biome.jsonc                             |  21 +-
 init_spike/package.json                            |  10 +
 init_spike/postcss.config.ts                       |   5 +
 init_spike/src/App.tsx                             |  31 ++-
 init_spike/src/components/icons/claude.tsx         |  29 +++
 init_spike/src/components/ui/badge.tsx             |  48 ++++
 init_spike/src/components/ui/button.tsx            |  63 +++++
 init_spike/src/components/ui/tooltip.tsx           |  50 ++++
 init_spike/src/editor/SourceEditor.tsx             |  14 +-
 init_spike/src/editor/TiptapEditor.tsx             |  59 ++++-
 .../src/editor/extensions/jsx-component.test.ts    |  14 +-
 init_spike/src/editor/extensions/jsx-component.ts  |   5 +-
 init_spike/src/editor/observers.test.ts            | 259 +++++++++++++++++++
 init_spike/src/editor/observers.ts                 |  11 +-
 .../src/editor/plugins/agent-flash-source.ts       | 175 +++++++++++++
 .../src/editor/plugins/agent-flash-wysiwyg.ts      | 166 ++++++++++++
 init_spike/src/globals.css                         | 128 ++++++++++
 init_spike/src/lib/utils.ts                        |   6 +
 init_spike/src/main.tsx                            |   1 +
 init_spike/src/presence/AgentUndoButton.tsx        |  89 +++++++
 init_spike/src/presence/PresenceBar.tsx            |  61 +++++
 init_spike/src/presence/identity.test.ts           | 112 ++++++++
 init_spike/src/presence/identity.ts                | 125 +++++++++
 init_spike/src/presence/use-presence.ts            |  56 ++++
 init_spike/src/presence/use-visibility-change.ts   |  17 ++
 init_spike/src/server/agent-sim.ts                 |  73 ++++--
 init_spike/src/server/hocuspocus-plugin.ts         | 284 ++++++++++++++++++---
 init_spike/src/types/diff.d.ts                     |   8 +
 init_spike/tests/e2e/qa-scenarios.spec.ts          |  13 +-
 init_spike/tests/e2e/sync.spec.ts                  |   7 +-
 init_spike/tsconfig.json                           |   6 +-
 init_spike/vite.config.ts                          |   6 +
 33 files changed, 1845 insertions(+), 212 deletions(-)
```

Full file list (including untracked files when present):

```
.claude/skills/pr-context/SKILL.md
init_spike/biome.jsonc
init_spike/package.json
init_spike/postcss.config.ts
init_spike/src/App.tsx
init_spike/src/components/icons/claude.tsx
init_spike/src/components/ui/badge.tsx
init_spike/src/components/ui/button.tsx
init_spike/src/components/ui/tooltip.tsx
init_spike/src/editor/SourceEditor.tsx
init_spike/src/editor/TiptapEditor.tsx
init_spike/src/editor/extensions/jsx-component.test.ts
init_spike/src/editor/extensions/jsx-component.ts
init_spike/src/editor/observers.test.ts
init_spike/src/editor/observers.ts
init_spike/src/editor/plugins/agent-flash-source.ts
init_spike/src/editor/plugins/agent-flash-wysiwyg.ts
init_spike/src/globals.css
init_spike/src/lib/utils.ts
init_spike/src/main.tsx
init_spike/src/presence/AgentUndoButton.tsx
init_spike/src/presence/PresenceBar.tsx
init_spike/src/presence/identity.test.ts
init_spike/src/presence/identity.ts
init_spike/src/presence/use-presence.ts
init_spike/src/presence/use-visibility-change.ts
init_spike/src/server/agent-sim.ts
init_spike/src/server/hocuspocus-plugin.ts
init_spike/src/types/diff.d.ts
init_spike/tests/e2e/qa-scenarios.spec.ts
init_spike/tests/e2e/sync.spec.ts
init_spike/tsconfig.json
init_spike/vite.config.ts
```

## Diff

```diff
diff --git a/.claude/skills/pr-context/SKILL.md b/.claude/skills/pr-context/SKILL.md
deleted file mode 100644
index 04d5c21..0000000
--- a/.claude/skills/pr-context/SKILL.md
+++ /dev/null
@@ -1,105 +0,0 @@
----
-name: pr-context
-description: Local review context generated from git state.
----
-
-# PR Review Context
-
-(!IMPORTANT)
-
-Use this context to:
-1. Get an initial sense of the purpose and scope of the local changes
-2. Review the current branch against the target branch without relying on GitHub APIs
-3. Identify what needs attention before the changes are pushed
-
----
-
-## PR Metadata
-
-| Field | Value |
-|---|---|
-| **PR** | Local review — feat/init-spike vs feat/init-spike |
-| **Author** | Nick Gomez |
-| **Base** | `feat/init-spike` |
-| **Repo** | inkeep/open-knowledge |
-| **Head SHA** | `54685e5b95f155bd8042eed1fa4d52c4c0ce4d44` |
-| **Size** | 0 commits · +0/-78516 · 2 files |
-| **Labels** | _None — local review._ |
-| **Review state** | LOCAL |
-| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
-| **Event** | `local:manual` |
-| **Trigger command** | `local-review` |
-| **Review scope** | `full` — local review uses the full branch diff against the target branch |
-
-## Description
-
-Local review — no PR description is available.
-
-## Linked Issues
-
-_No linked issues in local review mode._
-
-## Commit History
-
-Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.
-
-```
-
-```
-
-## Changed Files
-
-Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:
-
-```
- .claude/pr-diff/full.diff          | 78002 -----------------------------------
- .claude/skills/pr-context/SKILL.md |   514 -
- 2 files changed, 78516 deletions(-)
-```
-
-Full file list (including untracked files when present):
-
-```
-.claude/pr-diff/full.diff
-.claude/skills/pr-context/SKILL.md
-```
-
-## Diff
-
-> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~1824772 bytes across ~2 files) exceeds the inline threshold (~100KB).
-> The full diff is written to `.claude/pr-diff/full.diff`.
->
-> **How to read diffs on-demand:**
-> - Specific file: `git diff 54685e5b95f155bd8042eed1fa4d52c4c0ce4d44 -- path/to/file.ts`
-> - Full diff: read `.claude/pr-diff/full.diff`
-> - Untracked files: inspect the file directly in the working tree
-
-## Changes Since Last Review
-
-_N/A — local review (no prior GitHub review baseline)._
-
-## Prior Feedback
-
-> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.
-
-### Automated Review Comments
-
-_None (local review)._
-
-### Human Review Comments
-
-_None (local review)._
-
-### Previous Review Summaries
-
-_None (local review)._
-
-### PR Discussion
-
-_None (local review)._
-
-## GitHub URL Base (for hyperlinks)
-
-No GitHub PR context is available in local review mode.
-- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
-- External docs may still use standard markdown hyperlinks.
diff --git a/init_spike/biome.jsonc b/init_spike/biome.jsonc
index 610f7f0..aa97dfa 100644
--- a/init_spike/biome.jsonc
+++ b/init_spike/biome.jsonc
@@ -26,7 +26,26 @@
       }
     }
   },
+  "css": {
+    "parser": {
+      "cssModules": false
+    },
+    "linter": {
+      "enabled": false
+    },
+    "formatter": {
+      "enabled": false
+    }
+  },
   "files": {
-    "includes": ["**", "!**/node_modules", "!**/dist", "!**/.turbo", "!**/v7-test", "!**/tmp"]
+    "includes": [
+      "**",
+      "!**/node_modules",
+      "!**/dist",
+      "!**/.turbo",
+      "!**/v7-test",
+      "!**/tmp",
+      "!**/*.css"
+    ]
   }
 }
diff --git a/init_spike/package.json b/init_spike/package.json
index 90d7aa0..8d57f72 100644
--- a/init_spike/package.json
+++ b/init_spike/package.json
@@ -22,8 +22,10 @@
     "@hocuspocus/provider": "4.0.0-rc.1",
     "@hocuspocus/server": "4.0.0-rc.1",
     "@parcel/watcher": "^2.5.6",
+    "@tailwindcss/postcss": "^4.2.2",
     "@tiptap/core": "^3.22.0",
     "@tiptap/extension-collaboration": "^3.20.0",
+    "@tiptap/extension-collaboration-cursor": "^2.26.2",
     "@tiptap/extension-image": "^3.22.0",
     "@tiptap/extension-link": "^3.21.0",
     "@tiptap/extension-table": "^3.20.0",
@@ -33,11 +35,17 @@
     "@tiptap/react": "^3.22.0",
     "@tiptap/starter-kit": "^3.20.0",
     "@tiptap/y-tiptap": "^3.0.2",
+    "class-variance-authority": "^0.7.1",
+    "clsx": "^2.1.1",
     "codemirror": "^6.0.0",
     "diff": "^7.0.0",
+    "lucide-react": "^1.7.0",
+    "radix-ui": "^1.4.3",
     "react": "^19.0.0",
     "react-dom": "^19.0.0",
     "simple-git": "^3.35.0",
+    "tailwind-merge": "^3.5.0",
+    "tailwindcss": "4",
     "ws": "^8.0.0",
     "y-codemirror.next": "^0.3.5",
     "yjs": "^13.6.30"
@@ -49,6 +57,8 @@
     "@types/react-dom": "^19.0.0",
     "@types/ws": "^8.0.0",
     "@vitejs/plugin-react": "^4.0.0",
+    "husky": "^9.1.7",
+    "lint-staged": "^16.4.0",
     "typescript": "^5.7.0",
     "vite": "^6.0.0"
   },
diff --git a/init_spike/postcss.config.ts b/init_spike/postcss.config.ts
new file mode 100644
index 0000000..a34a3d5
--- /dev/null
+++ b/init_spike/postcss.config.ts
@@ -0,0 +1,5 @@
+export default {
+  plugins: {
+    '@tailwindcss/postcss': {},
+  },
+};
diff --git a/init_spike/src/App.tsx b/init_spike/src/App.tsx
index aa92e2c..a5a19b8 100644
--- a/init_spike/src/App.tsx
+++ b/init_spike/src/App.tsx
@@ -1,31 +1,36 @@
 import { useRef, useState } from 'react';
+import { Button } from '@/components/ui/button';
 import { SourceEditor } from './editor/SourceEditor';
 import type { TiptapEditorHandle } from './editor/TiptapEditor';
 import { TiptapEditor } from './editor/TiptapEditor';
+import { AgentUndoButton } from './presence/AgentUndoButton';
+import { PresenceBar } from './presence/PresenceBar';
 
 export function App() {
   const [isSourceMode, setIsSourceMode] = useState(false);
   const editorRef = useRef<TiptapEditorHandle | null>(null);
 
+  const provider = editorRef.current?.getProvider() ?? null;
+
   return (
-    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
-      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
-        <h1 style={{ margin: 0 }}>Open Knowledge</h1>
-        <button
-          type="button"
+    <div className="mx-auto max-w-[800px] p-6">
+      {/* Presence bar */}
+      <PresenceBar provider={provider} />
+
+      {/* Toolbar: mode toggle + agent undo */}
+      <div className="flex items-center gap-3 mb-4">
+        <h1 className="text-lg font-semibold mr-auto">Open Knowledge</h1>
+        <AgentUndoButton />
+        <Button
+          variant={isSourceMode ? 'default' : 'outline'}
+          size="sm"
           onClick={() => setIsSourceMode(!isSourceMode)}
-          style={{
-            padding: '6px 16px',
-            borderRadius: '4px',
-            border: '1px solid #ccc',
-            background: isSourceMode ? '#e8f0fe' : '#fff',
-            cursor: 'pointer',
-          }}
         >
           {isSourceMode ? 'WYSIWYG' : 'Source'}
-        </button>
+        </Button>
       </div>
 
+      {/* Editor area */}
       {isSourceMode && editorRef.current && (
         <SourceEditor
           ytext={editorRef.current.getYText()}
diff --git a/init_spike/src/components/icons/claude.tsx b/init_spike/src/components/icons/claude.tsx
new file mode 100644
index 0000000..942258b
--- /dev/null
+++ b/init_spike/src/components/icons/claude.tsx
@@ -0,0 +1,29 @@
+import type { SVGProps } from 'react';
+
+export function ClaudeIcon(props: SVGProps<SVGSVGElement>) {
+  return (
+    <svg
+      role="img"
+      aria-label="Claude icon"
+      fill="none"
+      height={24}
+      width={24}
+      viewBox="0 0 24 24"
+      xmlns="http://www.w3.org/2000/svg"
+      {...props}
+    >
+      <title>Claude icon</title>
+      <g clipPath="url(#clip0_claude)">
+        <path
+          d="M4.704 15.96L9.432 13.32L9.504 13.08L9.432 12.96H9.192L8.4 12.912L5.712 12.84L3.36 12.72L1.08 12.6L0.504 12.48L0 11.76L0.048 11.4L0.528 11.088L1.224 11.136L2.736 11.256L5.016 11.4L6.672 11.496L9.12 11.784H9.504L9.552 11.616L9.432 11.52L9.336 11.424L6.96 9.84L4.416 8.16L3.072 7.176L2.352 6.696L1.992 6.216L1.848 5.208L2.496 4.488L3.384 4.56L3.6 4.608L4.488 5.304L6.408 6.768L8.88 8.64L9.24 8.928L9.384 8.832L9.408 8.76L9.24 8.496L7.92 6L6.48 3.504L5.832 2.472L5.664 1.848C5.592 1.608 5.568 1.368 5.568 1.128L6.288 0.12L6.72 0L7.728 0.144L8.112 0.48L8.736 1.92L9.72 4.152L11.28 7.176L11.76 8.088L12 8.904L12.072 9.144H12.24V9.024L12.36 7.296L12.6 5.208L12.84 2.52L12.912 1.752L13.296 0.84L14.016 0.36L14.64 0.624L15.12 1.32L15.048 1.752L14.784 3.6L14.16 6.504L13.8 8.472H14.016L14.256 8.208L15.24 6.912L16.896 4.848L17.616 4.008L18.48 3.12L19.032 2.688H20.064L20.808 3.816L20.472 4.992L19.416 6.336L18.528 7.464L17.256 9.168L16.488 10.536L16.56 10.632H16.728L19.608 10.008L21.144 9.744L22.968 9.432L23.808 9.816L23.904 10.2L23.568 11.016L21.6 11.496L19.296 11.976L15.864 12.768L15.816 12.792L15.864 12.864L17.4 13.008L18.072 13.056H19.704L22.728 13.296L23.52 13.776L23.976 14.424L23.904 14.904L22.68 15.528L21.048 15.144L17.208 14.232L15.912 13.92H15.72V14.016L16.824 15.096L18.816 16.896L21.36 19.224L21.48 19.8L21.168 20.28L20.832 20.232L18.624 18.552L17.76 17.832L15.84 16.2H15.72V16.368L16.152 17.016L18.504 20.544L18.624 21.624L18.456 21.96L17.832 22.2L17.184 22.056L15.792 20.136L14.352 17.976L13.224 16.008L13.104 16.104L12.408 23.352L12.096 23.712L11.376 24L10.776 23.52L10.44 22.8L10.776 21.312L11.16 19.392L11.472 17.856L11.76 15.96L11.928 15.336V15.288H11.76L10.32 17.28L8.16 20.232L6.432 22.056L6.024 22.224L5.304 21.864L5.376 21.192L5.76 20.64L8.16 17.568L9.6 15.672L10.56 14.568L10.536 14.448H10.464L4.128 18.576L3 18.72L2.52 18.24L2.568 17.52L2.808 17.28L4.728 15.96H4.704Z"
+          fill="currentColor"
+        />
+      </g>
+      <defs>
+        <clipPath id="clip0_claude">
+          <rect width="24" height="24" fill="white" />
+        </clipPath>
+      </defs>
+    </svg>
+  );
+}
diff --git a/init_spike/src/components/ui/badge.tsx b/init_spike/src/components/ui/badge.tsx
new file mode 100644
index 0000000..9cb003d
--- /dev/null
+++ b/init_spike/src/components/ui/badge.tsx
@@ -0,0 +1,48 @@
+import { cva, type VariantProps } from 'class-variance-authority';
+import { Slot as SlotPrimitive } from 'radix-ui';
+import type * as React from 'react';
+
+import { cn } from '@/lib/utils';
+
+const badgeVariants = cva(
+  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden',
+  {
+    variants: {
+      variant: {
+        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
+        secondary:
+          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
+        primary:
+          'border border-primary/50 text-primary bg-primary/5 rounded-sm p-0.5 px-1.5 font-mono',
+        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
+        code: 'text-xs text-muted-foreground border bg-muted/80 dark:bg-muted/50 rounded-sm p-0.5 px-1.5 font-mono',
+        success:
+          'text-xs border rounded-sm p-0.5 px-1.5 font-mono bg-emerald-50 border-emerald-200 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 uppercase',
+        error:
+          'text-xs border rounded-sm p-0.5 px-1.5 font-mono bg-red-50 border-red-200 text-red-800 dark:border-red-700 dark:text-red-300 dark:bg-red-950/40 uppercase',
+        warning:
+          'text-xs border rounded-sm p-0.5 px-1.5 font-mono bg-amber-50 border-amber-200 text-amber-800 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/40 uppercase',
+        orange:
+          'text-xs border rounded-sm p-0.5 px-1.5 font-mono bg-orange-50 border-orange-200 text-orange-800 dark:border-orange-700 dark:text-orange-300 dark:bg-orange-950/40',
+      },
+    },
+    defaultVariants: {
+      variant: 'default',
+    },
+  },
+);
+
+function Badge({
+  className,
+  variant,
+  asChild = false,
+  ...props
+}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
+  const Comp = asChild ? SlotPrimitive.Slot : 'span';
+
+  return (
+    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
+  );
+}
+
+export { Badge, badgeVariants };
diff --git a/init_spike/src/components/ui/button.tsx b/init_spike/src/components/ui/button.tsx
new file mode 100644
index 0000000..82c51ec
--- /dev/null
+++ b/init_spike/src/components/ui/button.tsx
@@ -0,0 +1,63 @@
+import { cva, type VariantProps } from 'class-variance-authority';
+import { Slot as SlotPrimitive } from 'radix-ui';
+import type * as React from 'react';
+
+import { cn } from '@/lib/utils';
+
+const buttonVariants = cva(
+  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
+  {
+    variants: {
+      variant: {
+        default:
+          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 font-mono uppercase',
+        destructive:
+          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 font-mono uppercase',
+        outline:
+          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 font-mono uppercase',
+        'outline-primary':
+          'border border-primary/50 text-primary bg-background shadow-xs hover:bg-primary/10 hover:text-primary font-mono uppercase',
+        secondary:
+          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 font-mono uppercase',
+        ghost:
+          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 text-muted-foreground dark:text-muted-foreground font-mono uppercase',
+        link: 'text-primary underline-offset-4 hover:underline font-mono uppercase',
+      },
+      size: {
+        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
+        xs: 'h-7 px-3 gap-1.5 py-1.5 has-[>svg]:px-2.5 text-xs',
+        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
+        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
+        icon: 'size-9',
+        'icon-sm': 'size-6',
+      },
+    },
+    defaultVariants: {
+      variant: 'default',
+      size: 'default',
+    },
+  },
+);
+
+function Button({
+  className,
+  variant,
+  size,
+  asChild = false,
+  ...props
+}: React.ComponentProps<'button'> &
+  VariantProps<typeof buttonVariants> & {
+    asChild?: boolean;
+  }) {
+  const Comp = asChild ? SlotPrimitive.Slot : 'button';
+
+  return (
+    <Comp
+      data-slot="button"
+      className={cn(buttonVariants({ variant, size, className }))}
+      {...props}
+    />
+  );
+}
+
+export { Button, buttonVariants };
diff --git a/init_spike/src/components/ui/tooltip.tsx b/init_spike/src/components/ui/tooltip.tsx
new file mode 100644
index 0000000..d0babda
--- /dev/null
+++ b/init_spike/src/components/ui/tooltip.tsx
@@ -0,0 +1,50 @@
+import { Tooltip as TooltipPrimitive } from 'radix-ui';
+import type * as React from 'react';
+
+import { cn } from '@/lib/utils';
+
+function TooltipProvider({
+  delayDuration = 0,
+  ...props
+}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
+  return (
+    <TooltipPrimitive.Provider
+      data-slot="tooltip-provider"
+      delayDuration={delayDuration}
+      {...props}
+    />
+  );
+}
+
+function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
+  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
+}
+
+function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
+  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
+}
+
+function TooltipContent({
+  className,
+  sideOffset = 0,
+  children,
+  ...props
+}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
+  return (
+    <TooltipPrimitive.Portal>
+      <TooltipPrimitive.Content
+        data-slot="tooltip-content"
+        sideOffset={sideOffset}
+        className={cn(
+          'bg-popover text-popover-foreground border border-border shadow-md z-50 w-fit rounded-md px-3 py-1.5 text-xs max-w-xs',
+          className,
+        )}
+        {...props}
+      >
+        {children}
+      </TooltipPrimitive.Content>
+    </TooltipPrimitive.Portal>
+  );
+}
+
+export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
diff --git a/init_spike/src/editor/SourceEditor.tsx b/init_spike/src/editor/SourceEditor.tsx
index 88c3b11..5225fbe 100644
--- a/init_spike/src/editor/SourceEditor.tsx
+++ b/init_spike/src/editor/SourceEditor.tsx
@@ -1,11 +1,12 @@
-import type { HocuspocusProvider } from '@hocuspocus/provider';
 import { markdown } from '@codemirror/lang-markdown';
 import { EditorState } from '@codemirror/state';
 import { EditorView } from '@codemirror/view';
+import type { HocuspocusProvider } from '@hocuspocus/provider';
 import { basicSetup } from 'codemirror';
 import { useEffect, useRef } from 'react';
 import { yCollab } from 'y-codemirror.next';
 import type * as Y from 'yjs';
+import { createAgentFlashSourceExtension } from './plugins/agent-flash-source';
 
 interface SourceEditorProps {
   ytext: Y.Text;
@@ -16,6 +17,16 @@ export function SourceEditor({ ytext, provider }: SourceEditorProps) {
   const containerRef = useRef<HTMLDivElement>(null);
   const viewRef = useRef<EditorView | null>(null);
 
+  // Update awareness mode to 'source' when SourceEditor mounts
+  useEffect(() => {
+    const awareness = provider.awareness;
+    if (!awareness) return;
+    awareness.setLocalStateField('mode', 'source');
+    return () => {
+      awareness.setLocalStateField('mode', 'wysiwyg');
+    };
+  }, [provider]);
+
   useEffect(() => {
     if (!containerRef.current) return;
 
@@ -25,6 +36,7 @@ export function SourceEditor({ ytext, provider }: SourceEditorProps) {
         basicSetup,
         markdown(),
         yCollab(ytext, provider.awareness),
+        createAgentFlashSourceExtension(provider.document),
       ],
     });
 
diff --git a/init_spike/src/editor/TiptapEditor.tsx b/init_spike/src/editor/TiptapEditor.tsx
index dfc4726..f9eb0b1 100644
--- a/init_spike/src/editor/TiptapEditor.tsx
+++ b/init_spike/src/editor/TiptapEditor.tsx
@@ -1,16 +1,41 @@
 import { HocuspocusProvider } from '@hocuspocus/provider';
-import { getSchema } from '@tiptap/core';
+import { Extension, getSchema } from '@tiptap/core';
 import Collaboration from '@tiptap/extension-collaboration';
+import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
 import { MarkdownManager } from '@tiptap/markdown';
 import { EditorContent, useEditor } from '@tiptap/react';
-import type * as Y from 'yjs';
 import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
+import type * as Y from 'yjs';
+import { useIdentity } from '../presence/identity';
 import { prependFrontmatter } from './extensions/frontmatter';
 import { sharedExtensions } from './extensions/shared';
 import { setupObservers } from './observers';
+import { createAgentFlashPlugin } from './plugins/agent-flash-wysiwyg';
 
 const DOC_NAME = 'test-doc';
 
+/** Custom cursor renderer — agents don't get cursors (NG1: no fake cursor animation). */
+function renderCursor(user: Record<string, string>): HTMLElement {
+  const cursor = document.createElement('span');
+
+  // Agents: return invisible element (no cursor per NG1)
+  if (user.type === 'agent') {
+    cursor.style.display = 'none';
+    return cursor;
+  }
+
+  // Humans: colored caret + name label
+  cursor.classList.add('collaboration-cursor__caret');
+  cursor.style.borderColor = user.color;
+
+  const label = document.createElement('div');
+  label.classList.add('collaboration-cursor__label');
+  label.style.backgroundColor = user.color;
+  label.textContent = user.name;
+  cursor.append(label);
+
+  return cursor;
+}
 
 export interface TiptapEditorHandle {
   getMarkdown: () => string;
@@ -68,6 +93,7 @@ function getProvider(): HocuspocusProvider {
 export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor(_props, ref) {
   const frontmatterRef = useRef<string>('');
   const provider = getProvider();
+  const identity = useIdentity();
 
   const mdManager = useMemo(() => new MarkdownManager({ extensions: sharedExtensions }), []);
 
@@ -77,6 +103,21 @@ export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor
       Collaboration.configure({
         document: provider.document,
       }),
+      CollaborationCursor.configure({
+        provider,
+        user: {
+          name: identity.name,
+          color: identity.color,
+          type: 'human',
+        },
+        render: renderCursor,
+      }),
+      Extension.create({
+        name: 'agentFlash',
+        addProseMirrorPlugins() {
+          return [createAgentFlashPlugin(provider.document)];
+        },
+      }),
     ],
   });
 
@@ -97,6 +138,20 @@ export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor
     return () => metaMap.unobserve(observer);
   }, [provider.document]);
 
+  // Set awareness state on mount (user identity + mode)
+  useEffect(() => {
+    const awareness = provider.awareness;
+    if (!awareness) return;
+    awareness.setLocalStateField('user', {
+      name: identity.name,
+      color: identity.color,
+      type: 'human' as const,
+      coeditor: identity.coeditor,
+      tabId: identity.tabId,
+    });
+    awareness.setLocalStateField('mode', 'wysiwyg');
+  }, [provider, identity]);
+
   useImperativeHandle(
     ref,
     () => ({
diff --git a/init_spike/src/editor/extensions/jsx-component.test.ts b/init_spike/src/editor/extensions/jsx-component.test.ts
index 4fd50aa..71b3978 100644
--- a/init_spike/src/editor/extensions/jsx-component.test.ts
+++ b/init_spike/src/editor/extensions/jsx-component.test.ts
@@ -29,9 +29,7 @@ describe('jsx-component renderMarkdown', () => {
   test('serializes content without backticks using 3-backtick fence', () => {
     const json = {
       type: 'doc',
-      content: [
-        { type: 'jsxComponent', attrs: { content: '<Button>Click</Button>' } },
-      ],
+      content: [{ type: 'jsxComponent', attrs: { content: '<Button>Click</Button>' } }],
     };
     const md = mdManager.serialize(json);
     expect(md).toContain('```jsx-component');
@@ -59,16 +57,13 @@ describe('jsx-component round-trip', () => {
     const parsed = mdManager.parse(original);
     const pmNode = schema.nodeFromJSON(parsed);
     expect(pmNode.firstChild?.type.name).toBe('jsxComponent');
-    expect(pmNode.firstChild?.attrs.content).toBe(
-      '<Button variant="primary">Go</Button>',
-    );
+    expect(pmNode.firstChild?.attrs.content).toBe('<Button variant="primary">Go</Button>');
     const serialized = mdManager.serialize(parsed);
     expect(serialized.trim()).toBe(original);
   });
 
   test('content with triple backticks round-trips through parse→serialize', () => {
-    const original =
-      '````jsx-component\ncode:\n```js\nconst x = 1;\n```\n````';
+    const original = '````jsx-component\ncode:\n```js\nconst x = 1;\n```\n````';
     const parsed = mdManager.parse(original);
     const pmNode = schema.nodeFromJSON(parsed);
     expect(pmNode.firstChild?.type.name).toBe('jsxComponent');
@@ -78,8 +73,7 @@ describe('jsx-component round-trip', () => {
   });
 
   test('content with 4 backticks round-trips through parse→serialize', () => {
-    const original =
-      '`````jsx-component\n````example\nstuff\n````\n`````';
+    const original = '`````jsx-component\n````example\nstuff\n````\n`````';
     const parsed = mdManager.parse(original);
     const pmNode = schema.nodeFromJSON(parsed);
     expect(pmNode.firstChild?.type.name).toBe('jsxComponent');
diff --git a/init_spike/src/editor/extensions/jsx-component.ts b/init_spike/src/editor/extensions/jsx-component.ts
index 6109b43..771b4db 100644
--- a/init_spike/src/editor/extensions/jsx-component.ts
+++ b/init_spike/src/editor/extensions/jsx-component.ts
@@ -12,10 +12,7 @@ declare module '@tiptap/core' {
 
 /** Returns a backtick fence that safely wraps `content` — N+1 backticks where N is the longest run in content (minimum 3). */
 export function fenceFor(content: string): string {
-  const maxRun = (content.match(/`+/g) || []).reduce(
-    (max, run) => Math.max(max, run.length),
-    2,
-  );
+  const maxRun = (content.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 2);
   return '`'.repeat(maxRun + 1);
 }
 
diff --git a/init_spike/src/editor/observers.test.ts b/init_spike/src/editor/observers.test.ts
index f1f36c1..b1a6058 100644
--- a/init_spike/src/editor/observers.test.ts
+++ b/init_spike/src/editor/observers.test.ts
@@ -353,6 +353,265 @@ describe('Agent writes through observer chain', () => {
   });
 });
 
+describe('Agent write origin and activity map', () => {
+  test('agent-write origin Y.Text write propagates to XmlFragment via Observer B', async () => {
+    const doc = new Y.Doc();
+    const fragment = doc.getXmlFragment('default');
+    const ytext = doc.getText('source');
+
+    applyMarkdown(doc, fragment, 'Seed content\n');
+    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
+
+    await wait();
+
+    // Simulate the new agent write path: Y.Text write with 'agent-write' origin
+    // + activity map write in the same transaction
+    doc.transact(() => {
+      const currentText = ytext.toString();
+      const insertAt = currentText.length;
+      const separator = currentText.trim() ? '\n\n' : '';
+      ytext.insert(insertAt, `${separator}Agent content via new path\n`);
+
+      const activityMap = doc.getMap('activity');
+      activityMap.set('agent-1', {
+        agentId: 'agent-1',
+        timestamp: Date.now(),
+        type: 'insert',
+        description: 'Added: Agent content via new path',
+      });
+    }, 'agent-write');
+
+    await wait();
+
+    // Observer B should have propagated to XmlFragment
+    const json = yXmlFragmentToProsemirrorJSON(fragment);
+    const md = mdManager.serialize(json);
+    expect(md).toContain('Seed content');
+    expect(md).toContain('Agent content via new path');
+
+    // Activity map should contain the entry
+    const activityMap = doc.getMap('activity');
+    const entry = activityMap.get('agent-1') as Record<string, unknown>;
+    expect(entry).toBeTruthy();
+    expect(entry.agentId).toBe('agent-1');
+    expect(entry.type).toBe('insert');
+    expect(typeof entry.timestamp).toBe('number');
+
+    cleanup();
+  });
+
+  test('activity map entries coexist with content writes in same transaction', async () => {
+    const doc = new Y.Doc();
+    const ytext = doc.getText('source');
+    const activityMap = doc.getMap('activity');
+
+    // Track that both changes arrive in a single transaction
+    let transactionCount = 0;
+    doc.on('afterTransaction', () => {
+      transactionCount++;
+    });
+
+    const beforeCount = transactionCount;
+
+    doc.transact(() => {
+      ytext.insert(0, 'Agent wrote this\n');
+      activityMap.set('agent-1', {
+        agentId: 'agent-1',
+        timestamp: Date.now(),
+        type: 'insert',
+      });
+    }, 'agent-write');
+
+    // Should be exactly one transaction for both writes
+    expect(transactionCount - beforeCount).toBe(1);
+
+    // Both should be present
+    expect(ytext.toString()).toContain('Agent wrote this');
+    expect(activityMap.get('agent-1')).toBeTruthy();
+  });
+});
+
+describe('Per-origin undo (server-side UndoManager)', () => {
+  test('UndoManager with trackedOrigins only captures agent-write transactions', async () => {
+    const doc = new Y.Doc();
+    const ytext = doc.getText('source');
+
+    // Server-side UndoManager tracking only 'agent-write' origin
+    // captureTimeout: 0 ensures each transaction is a separate undo entry
+    const undoManager = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set(['agent-write']),
+      captureTimeout: 0,
+    });
+
+    // Human edit (no tracked origin)
+    doc.transact(() => {
+      ytext.insert(0, 'Human wrote this\n');
+    }, 'user-edit');
+
+    // Agent edit (tracked origin)
+    doc.transact(() => {
+      ytext.insert(ytext.length, 'Agent wrote this\n');
+    }, 'agent-write');
+
+    expect(ytext.toString()).toBe('Human wrote this\nAgent wrote this\n');
+    expect(undoManager.canUndo()).toBe(true);
+
+    // Undo should only reverse the agent edit
+    undoManager.undo();
+
+    expect(ytext.toString()).toBe('Human wrote this\n');
+    expect(undoManager.canUndo()).toBe(false);
+    expect(undoManager.canRedo()).toBe(true);
+  });
+
+  test('interleaved human+agent edits — undo reverses only agent changes in order', async () => {
+    const doc = new Y.Doc();
+    const ytext = doc.getText('source');
+
+    const undoManager = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set(['agent-write']),
+      captureTimeout: 0,
+    });
+
+    // Interleave: human → agent → human → agent
+    doc.transact(() => {
+      ytext.insert(0, 'Human 1\n');
+    }, 'user-edit');
+
+    doc.transact(() => {
+      ytext.insert(ytext.length, 'Agent 1\n');
+    }, 'agent-write');
+
+    doc.transact(() => {
+      ytext.insert(ytext.length, 'Human 2\n');
+    }, 'user-edit');
+
+    doc.transact(() => {
+      ytext.insert(ytext.length, 'Agent 2\n');
+    }, 'agent-write');
+
+    expect(ytext.toString()).toBe('Human 1\nAgent 1\nHuman 2\nAgent 2\n');
+
+    // First undo: removes Agent 2
+    undoManager.undo();
+    expect(ytext.toString()).toBe('Human 1\nAgent 1\nHuman 2\n');
+
+    // Second undo: removes Agent 1
+    undoManager.undo();
+    expect(ytext.toString()).toBe('Human 1\nHuman 2\n');
+
+    // No more agent edits to undo
+    expect(undoManager.canUndo()).toBe(false);
+
+    // Human edits preserved
+    expect(ytext.toString()).toContain('Human 1');
+    expect(ytext.toString()).toContain('Human 2');
+  });
+
+  test('redo restores agent edits', () => {
+    const doc = new Y.Doc();
+    const ytext = doc.getText('source');
+
+    const undoManager = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set(['agent-write']),
+      captureTimeout: 0,
+    });
+
+    doc.transact(() => {
+      ytext.insert(0, 'Agent content\n');
+    }, 'agent-write');
+
+    undoManager.undo();
+    expect(ytext.toString()).toBe('');
+    expect(undoManager.canRedo()).toBe(true);
+
+    undoManager.redo();
+    expect(ytext.toString()).toBe('Agent content\n');
+  });
+
+  test('agent undo propagates through Observer B to XmlFragment', async () => {
+    const doc = new Y.Doc();
+    const fragment = doc.getXmlFragment('default');
+    const ytext = doc.getText('source');
+
+    applyMarkdown(doc, fragment, 'Original content\n');
+    const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });
+
+    await wait();
+
+    const undoManager = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set(['agent-write']),
+      captureTimeout: 0,
+    });
+
+    // Agent writes via Y.Text
+    doc.transact(() => {
+      const insertAt = ytext.length;
+      const separator = ytext.toString().trim() ? '\n\n' : '';
+      ytext.insert(insertAt, `${separator}Agent added this section\n`);
+    }, 'agent-write');
+
+    await wait();
+
+    // Verify agent content is in XmlFragment
+    let json = yXmlFragmentToProsemirrorJSON(fragment);
+    let md = mdManager.serialize(json);
+    expect(md).toContain('Agent added this section');
+
+    // Undo agent edit
+    undoManager.undo();
+
+    await wait();
+
+    // Observer B should propagate the undo to XmlFragment
+    json = yXmlFragmentToProsemirrorJSON(fragment);
+    md = mdManager.serialize(json);
+    expect(md).toContain('Original content');
+    expect(md).not.toContain('Agent added this section');
+
+    cleanup();
+  });
+
+  test('multiple UndoManagers on same Y.Text do not conflict', () => {
+    const doc = new Y.Doc();
+    const ytext = doc.getText('source');
+
+    // Simulates: browser-side UM (TipTap) + server-side UM (agent)
+    const browserUM = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set(['browser-edit']),
+    });
+
+    const agentUM = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set(['agent-write']),
+    });
+
+    doc.transact(() => {
+      ytext.insert(0, 'Browser typed this\n');
+    }, 'browser-edit');
+
+    doc.transact(() => {
+      ytext.insert(ytext.length, 'Agent wrote this\n');
+    }, 'agent-write');
+
+    expect(ytext.toString()).toBe('Browser typed this\nAgent wrote this\n');
+
+    // Agent undo doesn't affect browser edit
+    agentUM.undo();
+    expect(ytext.toString()).toBe('Browser typed this\n');
+
+    // Browser undo doesn't affect (already undone) agent edit
+    browserUM.undo();
+    expect(ytext.toString()).toBe('');
+
+    // Both can redo independently
+    browserUM.redo();
+    expect(ytext.toString()).toBe('Browser typed this\n');
+
+    agentUM.redo();
+    expect(ytext.toString()).toBe('Browser typed this\nAgent wrote this\n');
+  });
+});
+
 describe('Y.Text CRDT foundation', () => {
   test('Y.Text content is accessible after write — simulates collaborative source mode', () => {
     const doc = new Y.Doc();
diff --git a/init_spike/src/editor/observers.ts b/init_spike/src/editor/observers.ts
index 0b494df..ffd31e6 100644
--- a/init_spike/src/editor/observers.ts
+++ b/init_spike/src/editor/observers.ts
@@ -8,11 +8,12 @@
  *   - Observer A writes with origin 'sync-from-tree', Observer B skips those.
  *   - Observer B writes with origin 'sync-from-text', Observer A skips those.
  */
-import type { Schema } from '@tiptap/pm/model';
+
 import type { MarkdownManager } from '@tiptap/markdown';
+import type { Schema } from '@tiptap/pm/model';
 import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
 import { diffLines } from 'diff';
-import * as Y from 'yjs';
+import type * as Y from 'yjs';
 import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
 
 export const ORIGIN_TREE_TO_TEXT = 'sync-from-tree';
@@ -33,11 +34,7 @@ interface ObserverDeps {
  * Apply incremental diff from `currentText` to `newText` on a Y.Text instance.
  * Uses diffLines to minimize CRDT mutations — preserves concurrent source-mode edits.
  */
-function applyIncrementalDiff(
-  ytext: Y.Text,
-  currentText: string,
-  newText: string,
-): void {
+function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
   if (currentText === newText) return;
 
   const changes = diffLines(currentText, newText);
diff --git a/init_spike/src/editor/plugins/agent-flash-source.ts b/init_spike/src/editor/plugins/agent-flash-source.ts
new file mode 100644
index 0000000..331b67f
--- /dev/null
+++ b/init_spike/src/editor/plugins/agent-flash-source.ts
@@ -0,0 +1,175 @@
+/**
+ * Agent Flash Plugin — Source (CodeMirror)
+ *
+ * Observes Y.Map('activity') for new agent write entries and highlights
+ * affected lines with a CSS animation (agent-flash class).
+ *
+ * Uses CodeMirror StateField + StateEffect pattern for flash decorations.
+ * Activity entries older than 30s are auto-evicted on each observation.
+ */
+import { type Extension, StateEffect, StateField } from '@codemirror/state';
+import {
+  Decoration,
+  type DecorationSet,
+  EditorView,
+  ViewPlugin,
+  type ViewUpdate,
+} from '@codemirror/view';
+import type * as Y from 'yjs';
+import type { ActivityEntry } from '../../presence/identity';
+
+const FLASH_DURATION_MS = 2000;
+const FLASH_DEBOUNCE_MS = 500;
+const ACTIVITY_TTL_MS = 30_000;
+
+/** Effect to add flash decorations for a line range */
+const addFlash = StateEffect.define<{ from: number; to: number }>();
+
+/** Effect to remove all flash decorations */
+const removeFlash = StateEffect.define<null>();
+
+const flashDecoration = Decoration.line({ class: 'agent-flash' });
+
+/** StateField that manages flash decorations */
+const flashField = StateField.define<DecorationSet>({
+  create() {
+    return Decoration.none;
+  },
+  update(decorations, tr) {
+    // Map existing decorations through document changes
+    decorations = decorations.map(tr.changes);
+
+    for (const effect of tr.effects) {
+      if (effect.is(addFlash)) {
+        const { from, to } = effect.value;
+        const builder: Array<ReturnType<typeof flashDecoration.range>> = [];
+        // Add decoration to each line in the range
+        for (let pos = from; pos <= to; ) {
+          const line = tr.state.doc.lineAt(pos);
+          builder.push(flashDecoration.range(line.from));
+          pos = line.to + 1;
+        }
+        decorations = decorations.update({ add: builder, sort: true });
+      } else if (effect.is(removeFlash)) {
+        decorations = Decoration.none;
+      }
+    }
+    return decorations;
+  },
+  provide: (f) => EditorView.decorations.from(f),
+});
+
+/**
+ * Auto-evict activity entries older than 30s.
+ */
+function evictStaleEntries(activityMap: Y.Map<unknown>): void {
+  const now = Date.now();
+  for (const [key, value] of activityMap.entries()) {
+    const entry = value as ActivityEntry;
+    if (entry.timestamp && now - entry.timestamp > ACTIVITY_TTL_MS) {
+      activityMap.delete(key);
+    }
+  }
+}
+
+/**
+ * Creates a CodeMirror extension that flashes lines when agent activity is detected.
+ */
+export function createAgentFlashSourceExtension(doc: Y.Doc): Extension {
+  const activityMap = doc.getMap('activity');
+
+  const flashViewPlugin = ViewPlugin.define((view) => {
+    let lastFlashTime = 0;
+    let lastSeenTimestamp = Date.now();
+    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
+
+    function flashAllLines() {
+      const docLength = view.state.doc.length;
+      if (docLength === 0) return;
+      view.dispatch({
+        effects: addFlash.of({ from: 0, to: docLength }),
+      });
+      // Remove flash after duration
+      setTimeout(() => {
+        view.dispatch({
+          effects: removeFlash.of(null),
+        });
+      }, FLASH_DURATION_MS);
+    }
+
+    const activityObserver = (_event: Y.YMapEvent<unknown>) => {
+      evictStaleEntries(activityMap);
+
+      // Check for new entries since last seen
+      let hasNew = false;
+      for (const [, value] of activityMap.entries()) {
+        const entry = value as ActivityEntry;
+        if (entry.timestamp && entry.timestamp > lastSeenTimestamp) {
+          hasNew = true;
+          break;
+        }
+      }
+
+      if (!hasNew) return;
+
+      lastSeenTimestamp = Date.now();
+
+      // Debounce: skip if last flash was too recent
+      const now = Date.now();
+      if (now - lastFlashTime < FLASH_DEBOUNCE_MS) {
+        if (!pendingTimeout) {
+          const delay = FLASH_DEBOUNCE_MS - (now - lastFlashTime);
+          pendingTimeout = setTimeout(() => {
+            pendingTimeout = null;
+            lastFlashTime = Date.now();
+            flashAllLines();
+          }, delay);
+        }
+        return;
+      }
+
+      lastFlashTime = now;
+      flashAllLines();
+    };
+
+    activityMap.observe(activityObserver);
+
+    // Visibility change handler for FR15 (flash on tab refocus)
+    const visibilityHandler = () => {
+      if (document.visibilityState === 'visible') {
+        let hasNew = false;
+        for (const [, value] of activityMap.entries()) {
+          const entry = value as ActivityEntry;
+          if (entry.timestamp && entry.timestamp > lastSeenTimestamp) {
+            hasNew = true;
+            break;
+          }
+        }
+        if (hasNew) {
+          lastSeenTimestamp = Date.now();
+          lastFlashTime = Date.now();
+          flashAllLines();
+        }
+      } else {
+        lastSeenTimestamp = Date.now();
+      }
+    };
+
+    document.addEventListener('visibilitychange', visibilityHandler);
+
+    return {
+      update(_update: ViewUpdate) {
+        // No-op — flash is driven by Y.Map observation, not editor updates
+      },
+      destroy() {
+        activityMap.unobserve(activityObserver);
+        document.removeEventListener('visibilitychange', visibilityHandler);
+        if (pendingTimeout) {
+          clearTimeout(pendingTimeout);
+        }
+      },
+    };
+  });
+
+  return [flashField, flashViewPlugin];
+}
diff --git a/init_spike/src/editor/plugins/agent-flash-wysiwyg.ts b/init_spike/src/editor/plugins/agent-flash-wysiwyg.ts
new file mode 100644
index 0000000..b2c55d8
--- /dev/null
+++ b/init_spike/src/editor/plugins/agent-flash-wysiwyg.ts
@@ -0,0 +1,166 @@
+/**
+ * Agent Flash Plugin — WYSIWYG (ProseMirror)
+ *
+ * Observes Y.Map('activity') for new agent write entries and highlights
+ * affected paragraph nodes with a CSS animation (agent-flash class).
+ *
+ * Uses direct DOM manipulation (not ProseMirror decorations) because
+ * decorations don't survive re-renders (A6 from spec).
+ *
+ * Flash is debounced to max 1 per 500ms for rapid agent writes.
+ * Activity entries older than 30s are auto-evicted on each observation.
+ */
+import { Plugin, PluginKey } from '@tiptap/pm/state';
+import type { EditorView } from '@tiptap/pm/view';
+import type * as Y from 'yjs';
+import type { ActivityEntry } from '../../presence/identity';
+
+const FLASH_DURATION_MS = 2000;
+const FLASH_DEBOUNCE_MS = 500;
+const ACTIVITY_TTL_MS = 30_000;
+
+export const agentFlashPluginKey = new PluginKey('agentFlash');
+
+interface FlashPluginState {
+  lastFlashTime: number;
+  lastSeenTimestamp: number;
+  pendingTimeout: ReturnType<typeof setTimeout> | null;
+}
+
+/**
+ * Auto-evict activity entries older than 30s.
+ */
+function evictStaleEntries(activityMap: Y.Map<unknown>): void {
+  const now = Date.now();
+  for (const [key, value] of activityMap.entries()) {
+    const entry = value as ActivityEntry;
+    if (entry.timestamp && now - entry.timestamp > ACTIVITY_TTL_MS) {
+      activityMap.delete(key);
+    }
+  }
+}
+
+/**
+ * Apply agent-flash class to all top-level paragraph-like nodes in the editor.
+ * Since agent writes are batch diffs (not character-level), we flash all
+ * paragraphs that were affected. For v0, we flash all visible paragraphs
+ * when an activity entry arrives — the activity map doesn't carry position info
+ * (D10: flash plugin resolves position via observation).
+ */
+function applyFlash(view: EditorView): void {
+  const dom = view.dom;
+  // Find all top-level block nodes (paragraphs, headings, etc.)
+  const blocks = dom.querySelectorAll(':scope > *');
+  for (const block of blocks) {
+    const el = block as HTMLElement;
+    // Remove existing animation so it can restart
+    el.classList.remove('agent-flash');
+    // Force reflow to restart animation
+    void el.offsetHeight;
+    el.classList.add('agent-flash');
+
+    // Remove class after animation completes
+    setTimeout(() => {
+      el.classList.remove('agent-flash');
+    }, FLASH_DURATION_MS);
+  }
+}
+
+export function createAgentFlashPlugin(doc: Y.Doc): Plugin {
+  const activityMap = doc.getMap('activity');
+
+  return new Plugin({
+    key: agentFlashPluginKey,
+
+    state: {
+      init(): FlashPluginState {
+        return {
+          lastFlashTime: 0,
+          lastSeenTimestamp: Date.now(),
+          pendingTimeout: null,
+        };
+      },
+      apply(_tr, value): FlashPluginState {
+        return value;
+      },
+    },
+
+    view(view: EditorView) {
+      const state = agentFlashPluginKey.getState(view.state) as FlashPluginState;
+
+      const activityObserver = (_event: Y.YMapEvent<unknown>) => {
+        evictStaleEntries(activityMap);
+
+        // Check for new entries since last seen
+        let hasNew = false;
+        for (const [, value] of activityMap.entries()) {
+          const entry = value as ActivityEntry;
+          if (entry.timestamp && entry.timestamp > state.lastSeenTimestamp) {
+            hasNew = true;
+            break;
+          }
+        }
+
+        if (!hasNew) return;
+
+        // Update last seen timestamp
+        state.lastSeenTimestamp = Date.now();
+
+        // Debounce: skip if last flash was too recent
+        const now = Date.now();
+        if (now - state.lastFlashTime < FLASH_DEBOUNCE_MS) {
+          // Schedule a delayed flash if not already pending
+          if (!state.pendingTimeout) {
+            const delay = FLASH_DEBOUNCE_MS - (now - state.lastFlashTime);
+            state.pendingTimeout = setTimeout(() => {
+              state.pendingTimeout = null;
+              state.lastFlashTime = Date.now();
+              applyFlash(view);
+            }, delay);
+          }
+          return;
+        }
+
+        state.lastFlashTime = now;
+        applyFlash(view);
+      };
+
+      activityMap.observe(activityObserver);
+
+      // Visibility change handler for FR15 (flash on tab refocus)
+      const visibilityHandler = () => {
+        if (document.visibilityState === 'visible') {
+          // Check for activity entries newer than lastSeenTimestamp
+          let hasNew = false;
+          for (const [, value] of activityMap.entries()) {
+            const entry = value as ActivityEntry;
+            if (entry.timestamp && entry.timestamp > state.lastSeenTimestamp) {
+              hasNew = true;
+              break;
+            }
+          }
+          if (hasNew) {
+            state.lastSeenTimestamp = Date.now();
+            state.lastFlashTime = Date.now();
+            applyFlash(view);
+          }
+        } else {
+          // Tab hidden — update timestamp
+          state.lastSeenTimestamp = Date.now();
+        }
+      };
+
+      document.addEventListener('visibilitychange', visibilityHandler);
+
+      return {
+        destroy() {
+          activityMap.unobserve(activityObserver);
+          document.removeEventListener('visibilitychange', visibilityHandler);
+          if (state.pendingTimeout) {
+            clearTimeout(state.pendingTimeout);
+          }
+        },
+      };
+    },
+  });
+}
diff --git a/init_spike/src/globals.css b/init_spike/src/globals.css
new file mode 100644
index 0000000..54f46eb
--- /dev/null
+++ b/init_spike/src/globals.css
@@ -0,0 +1,128 @@
+@import "tailwindcss";
+
+@theme {
+  /* Color tokens */
+  --color-background: #ffffff;
+  --color-foreground: #0a0a0a;
+  --color-muted: #f5f5f5;
+  --color-muted-foreground: #737373;
+  --color-popover: #ffffff;
+  --color-popover-foreground: #0a0a0a;
+  --color-border: #e5e5e5;
+  --color-input: #e5e5e5;
+  --color-ring: #3784FF;
+
+  /* Primary: Azure */
+  --color-primary: #3784FF;
+  --color-primary-foreground: #ffffff;
+
+  /* Secondary */
+  --color-secondary: #f5f5f5;
+  --color-secondary-foreground: #171717;
+
+  /* Accent */
+  --color-accent: #f5f5f5;
+  --color-accent-foreground: #171717;
+
+  /* Destructive */
+  --color-destructive: #ef4444;
+
+  /* Agent terracotta */
+  --color-agent: #D97757;
+  --color-agent-foreground: #ffffff;
+
+  /* Radius tokens */
+  --radius-sm: 0.25rem;
+  --radius-md: 0.375rem;
+  --radius-lg: 0.5rem;
+
+  /* Font tokens */
+  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
+  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
+
+  /* Agent flash animation */
+  @keyframes agent-flash {
+    0% { background: rgba(217, 119, 87, 0.2); }
+    100% { background: transparent; }
+  }
+
+  --animate-agent-flash: agent-flash 2s ease-out forwards;
+}
+
+/* Base styles */
+@layer base {
+  *,
+  *::before,
+  *::after {
+    border-color: var(--color-border);
+  }
+
+  body {
+    background-color: var(--color-background);
+    color: var(--color-foreground);
+    font-family: var(--font-sans);
+  }
+}
+
+/* Agent flash utility class */
+.agent-flash {
+  animation: agent-flash 2s ease-out forwards;
+}
+
+/* Collaboration cursor styles (WYSIWYG — TipTap) */
+.collaboration-cursor__caret {
+  position: relative;
+  margin-left: -1px;
+  margin-right: -1px;
+  border-left: 2px solid;
+  border-right: 0;
+  word-break: normal;
+  pointer-events: none;
+}
+
+.collaboration-cursor__label {
+  position: absolute;
+  top: -1.4em;
+  left: -1px;
+  padding: 1px 6px;
+  border-radius: 6px;
+  font-family: var(--font-mono);
+  font-size: 11px;
+  font-weight: 500;
+  line-height: 1.4;
+  color: #fff;
+  white-space: nowrap;
+  user-select: none;
+  pointer-events: none;
+}
+
+/* CodeMirror cursor styles (Source mode) */
+.cm-ySelectionCaret {
+  position: relative;
+  border-left: 2px solid;
+  margin-left: -1px;
+  margin-right: -1px;
+  pointer-events: none;
+  word-break: normal;
+}
+
+.cm-ySelectionInfo {
+  position: absolute;
+  top: -1.4em;
+  left: -1px;
+  padding: 1px 6px;
+  border-radius: 6px;
+  font-family: var(--font-mono);
+  font-size: 11px;
+  font-weight: 500;
+  line-height: 1.4;
+  color: #fff;
+  white-space: nowrap;
+  user-select: none;
+  pointer-events: none;
+  z-index: 10;
+}
+
+.cm-ySelection {
+  opacity: 0.3;
+}
diff --git a/init_spike/src/lib/utils.ts b/init_spike/src/lib/utils.ts
new file mode 100644
index 0000000..9ad0df4
--- /dev/null
+++ b/init_spike/src/lib/utils.ts
@@ -0,0 +1,6 @@
+import { type ClassValue, clsx } from 'clsx';
+import { twMerge } from 'tailwind-merge';
+
+export function cn(...inputs: ClassValue[]) {
+  return twMerge(clsx(inputs));
+}
diff --git a/init_spike/src/main.tsx b/init_spike/src/main.tsx
index 88c5c0f..414c9a1 100644
--- a/init_spike/src/main.tsx
+++ b/init_spike/src/main.tsx
@@ -1,5 +1,6 @@
 import { StrictMode } from 'react';
 import { createRoot } from 'react-dom/client';
+import './globals.css';
 import { App } from './App';
 
 const root = document.getElementById('root');
diff --git a/init_spike/src/presence/AgentUndoButton.tsx b/init_spike/src/presence/AgentUndoButton.tsx
new file mode 100644
index 0000000..cf8b9b2
--- /dev/null
+++ b/init_spike/src/presence/AgentUndoButton.tsx
@@ -0,0 +1,89 @@
+import { Undo2 } from 'lucide-react';
+import { useCallback, useEffect, useState } from 'react';
+import { Button } from '@/components/ui/button';
+
+interface AgentUndoState {
+  canUndo: boolean;
+  canRedo: boolean;
+  isPending: boolean;
+  undo: () => Promise<void>;
+  redo: () => Promise<void>;
+}
+
+function useAgentUndo(): AgentUndoState {
+  const [canUndo, setCanUndo] = useState(false);
+  const [canRedo, setCanRedo] = useState(false);
+  const [isPending, setIsPending] = useState(false);
+
+  // Poll status every 2s
+  useEffect(() => {
+    let active = true;
+    const poll = async () => {
+      try {
+        const res = await fetch('/api/agent-undo-status');
+        if (!active) return;
+        if (res.ok) {
+          const data = (await res.json()) as { canUndo: boolean; canRedo: boolean };
+          setCanUndo(data.canUndo);
+          setCanRedo(data.canRedo);
+        }
+      } catch {
+        // Silently ignore fetch errors
+      }
+    };
+
+    poll();
+    const interval = setInterval(poll, 2000);
+    return () => {
+      active = false;
+      clearInterval(interval);
+    };
+  }, []);
+
+  const undo = useCallback(async () => {
+    setIsPending(true);
+    try {
+      const res = await fetch('/api/agent-undo', { method: 'POST' });
+      if (res.ok) {
+        const data = (await res.json()) as { ok: boolean; canUndo: boolean; canRedo: boolean };
+        setCanUndo(data.canUndo);
+        setCanRedo(data.canRedo);
+      }
+    } finally {
+      setIsPending(false);
+    }
+  }, []);
+
+  const redo = useCallback(async () => {
+    setIsPending(true);
+    try {
+      const res = await fetch('/api/agent-redo', { method: 'POST' });
+      if (res.ok) {
+        const data = (await res.json()) as { ok: boolean; canUndo: boolean; canRedo: boolean };
+        setCanUndo(data.canUndo);
+        setCanRedo(data.canRedo);
+      }
+    } finally {
+      setIsPending(false);
+    }
+  }, []);
+
+  return { canUndo, canRedo, isPending, undo, redo };
+}
+
+export function AgentUndoButton() {
+  const { canUndo, isPending, undo } = useAgentUndo();
+
+  return (
+    <Button
+      variant="outline"
+      size="sm"
+      disabled={!canUndo || isPending}
+      onClick={undo}
+      className="border-agent/50 text-agent hover:bg-agent/10 disabled:opacity-40"
+    >
+      <Undo2 className="size-3.5" />
+      <span>Undo Agent Edit</span>
+    </Button>
+  );
+}
diff --git a/init_spike/src/presence/PresenceBar.tsx b/init_spike/src/presence/PresenceBar.tsx
new file mode 100644
index 0000000..fc5ff00
--- /dev/null
+++ b/init_spike/src/presence/PresenceBar.tsx
@@ -0,0 +1,61 @@
+import type { HocuspocusProvider } from '@hocuspocus/provider';
+import { ClaudeIcon } from '@/components/icons/claude';
+import { Badge } from '@/components/ui/badge';
+import { cn } from '@/lib/utils';
+import { type Participant, usePresence } from './use-presence';
+
+function PresenceBadge({ user, mode }: { user: Participant['user']; mode: Participant['mode'] }) {
+  if (user.type === 'agent') {
+    return (
+      <Badge
+        variant="outline"
+        className={cn(
+          'gap-1.5 border-agent/50 text-agent font-mono text-[11px] uppercase tracking-wide',
+        )}
+      >
+        <ClaudeIcon width={14} height={14} className="text-agent" />
+        <span>{user.name}</span>
+        <span className="text-muted-foreground">{mode === 'editing' ? 'editing' : 'idle'}</span>
+      </Badge>
+    );
+  }
+
+  return (
+    <Badge variant="outline" className="gap-1.5 font-mono text-[11px] uppercase tracking-wide">
+      <span
+        className="inline-block size-2 rounded-full shrink-0"
+        style={{ backgroundColor: user.color }}
+      />
+      <span>{user.name}</span>
+      <span className="text-muted-foreground">{mode}</span>
+    </Badge>
+  );
+}
+
+export function PresenceBar({ provider }: { provider: HocuspocusProvider | null }) {
+  const participants = usePresence(provider);
+
+  if (!provider) {
+    return (
+      <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
+        <span className="text-xs text-muted-foreground font-mono uppercase">Connecting...</span>
+      </div>
+    );
+  }
+
+  if (participants.length === 0) {
+    return (
+      <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5">
+        <span className="text-xs text-muted-foreground font-mono uppercase">No participants</span>
+      </div>
+    );
+  }
+
+  return (
+    <div data-slot="presence-bar" className="flex items-center gap-2 px-1 py-1.5 flex-wrap">
+      {participants.map((p) => (
+        <PresenceBadge key={p.clientId} user={p.user} mode={p.mode} />
+      ))}
+    </div>
+  );
+}
diff --git a/init_spike/src/presence/identity.test.ts b/init_spike/src/presence/identity.test.ts
new file mode 100644
index 0000000..55909da
--- /dev/null
+++ b/init_spike/src/presence/identity.test.ts
@@ -0,0 +1,112 @@
+import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
+import { generateRandomColor, generateRandomName, getIdentity, HUMAN_COLORS } from './identity';
+
+// --- Stub browser globals for bun test environment ---
+
+const storage = new Map<string, string>();
+const localStorageStub = {
+  getItem: (key: string) => storage.get(key) ?? null,
+  setItem: (key: string, value: string) => storage.set(key, value),
+  removeItem: (key: string) => storage.delete(key),
+  clear: () => storage.clear(),
+  get length() {
+    return storage.size;
+  },
+  key: (_index: number) => null,
+};
+
+beforeEach(() => {
+  storage.clear();
+  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
+  (globalThis as Record<string, unknown>).window = {
+    location: { search: '' },
+  };
+});
+
+afterEach(() => {
+  storage.clear();
+});
+
+describe('generateRandomName', () => {
+  test('returns a two-word name (adjective + animal)', () => {
+    const name = generateRandomName();
+    const parts = name.split(' ');
+    expect(parts.length).toBe(2);
+    expect(parts[0].length).toBeGreaterThan(0);
+    expect(parts[1].length).toBeGreaterThan(0);
+  });
+});
+
+describe('generateRandomColor', () => {
+  test('returns a color from the palette', () => {
+    const color = generateRandomColor();
+    expect((HUMAN_COLORS as readonly string[]).includes(color)).toBe(true);
+  });
+});
+
+describe('getIdentity', () => {
+  test('returns expected shape', () => {
+    const identity = getIdentity();
+    expect(identity).toHaveProperty('name');
+    expect(identity).toHaveProperty('color');
+    expect(identity).toHaveProperty('coeditor');
+    expect(identity).toHaveProperty('tabId');
+    expect(typeof identity.name).toBe('string');
+    expect(typeof identity.color).toBe('string');
+    expect(typeof identity.coeditor).toBe('string');
+    expect(typeof identity.tabId).toBe('string');
+  });
+
+  test('generates UUID tabId', () => {
+    const identity = getIdentity();
+    expect(identity.tabId).toMatch(
+      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
+    );
+  });
+
+  test('tabId is unique per call', () => {
+    const a = getIdentity();
+    const b = getIdentity();
+    expect(a.tabId).not.toBe(b.tabId);
+  });
+
+  test('persists name to localStorage', () => {
+    const identity = getIdentity();
+    expect(localStorage.getItem('ok-user-name')).toBe(identity.name);
+  });
+
+  test('persists color to localStorage', () => {
+    const identity = getIdentity();
+    expect(localStorage.getItem('ok-user-color')).toBe(identity.color);
+  });
+
+  test('reads persisted name from localStorage', () => {
+    localStorage.setItem('ok-user-name', 'Test User');
+    const identity = getIdentity();
+    expect(identity.name).toBe('Test User');
+  });
+
+  test('reads persisted color from localStorage', () => {
+    localStorage.setItem('ok-user-color', '#FF0000');
+    const identity = getIdentity();
+    expect(identity.color).toBe('#FF0000');
+  });
+
+  test('defaults coeditor to standalone', () => {
+    const identity = getIdentity();
+    expect(identity.coeditor).toBe('standalone');
+  });
+
+  test('reads coeditor from query param', () => {
+    (globalThis as Record<string, unknown>).window = {
+      location: { search: '?coeditor=cursor' },
+    };
+    const identity = getIdentity();
+    expect(identity.coeditor).toBe('cursor');
+  });
+
+  test('color is from the curated palette on first generation', () => {
+    const identity = getIdentity();
+    expect((HUMAN_COLORS as readonly string[]).includes(identity.color)).toBe(true);
+  });
+});
diff --git a/init_spike/src/presence/identity.ts b/init_spike/src/presence/identity.ts
new file mode 100644
index 0000000..940217b
--- /dev/null
+++ b/init_spike/src/presence/identity.ts
@@ -0,0 +1,125 @@
+import { useState } from 'react';
+
+// --- Types ---
+
+export interface AwarenessUser {
+  name: string;
+  color: string;
+  type: 'human' | 'agent';
+  coeditor?: string;
+  tabId: string;
+}
+
+export interface AwarenessState {
+  user: AwarenessUser;
+  mode: 'wysiwyg' | 'source' | 'idle';
+  cursor?: {
+    anchor: unknown;
+    head: unknown;
+  };
+}
+
+/** Entry in Y.Map('activity') side-channel for agent write attribution. */
+export interface ActivityEntry {
+  agentId: string;
+  timestamp: number;
+  type: 'insert' | 'replace' | 'delete';
+  description?: string;
+}
+
+export interface Identity {
+  name: string;
+  color: string;
+  coeditor: string;
+  tabId: string;
+}
+
+// --- Constants ---
+
+const HUMAN_COLORS = [
+  '#3784FF', // azure
+  '#7C3AED', // violet
+  '#10B981', // emerald
+  '#F43F5E', // rose
+  '#F59E0B', // amber
+  '#06B6D4', // cyan
+  '#4F46E5', // indigo
+  '#EC4899', // pink
+] as const;
+
+const ADJECTIVES = [
+  'Curious',
+  'Brave',
+  'Clever',
+  'Swift',
+  'Gentle',
+  'Bright',
+  'Wise',
+  'Bold',
+  'Calm',
+  'Keen',
+] as const;
+
+const ANIMALS = [
+  'Otter',
+  'Fox',
+  'Hawk',
+  'Bear',
+  'Wolf',
+  'Lynx',
+  'Crane',
+  'Deer',
+  'Owl',
+  'Hare',
+] as const;
+
+const LS_NAME_KEY = 'ok-user-name';
+const LS_COLOR_KEY = 'ok-user-color';
+
+// --- Helpers ---
+
+function randomElement<T>(arr: readonly T[]): T {
+  return arr[Math.floor(Math.random() * arr.length)];
+}
+
+function generateRandomName(): string {
+  return `${randomElement(ADJECTIVES)} ${randomElement(ANIMALS)}`;
+}
+
+function generateRandomColor(): string {
+  return randomElement(HUMAN_COLORS);
+}
+
+// --- Core ---
+
+export function getIdentity(): Identity {
+  const params = new URLSearchParams(window.location.search);
+  const coeditor = params.get('coeditor') || 'standalone';
+  const tabId = crypto.randomUUID();
+
+  let name = localStorage.getItem(LS_NAME_KEY);
+  let color = localStorage.getItem(LS_COLOR_KEY);
+
+  if (!name) {
+    name = generateRandomName();
+    localStorage.setItem(LS_NAME_KEY, name);
+  }
+  if (!color) {
+    color = generateRandomColor();
+    localStorage.setItem(LS_COLOR_KEY, color);
+  }
+
+  return { name, color, coeditor, tabId };
+}
+
+// --- React hook ---
+
+export function useIdentity(): Identity {
+  // Lazy initializer — identity is derived once per component mount (stable per tab).
+  // useState(() => ...) runs the initializer once and caches it for the component lifetime.
+  const [identity] = useState(getIdentity);
+  return identity;
+}
+
+// --- Exported for testing ---
+export { generateRandomColor, generateRandomName, HUMAN_COLORS };
diff --git a/init_spike/src/presence/use-presence.ts b/init_spike/src/presence/use-presence.ts
new file mode 100644
index 0000000..37a797a
--- /dev/null
+++ b/init_spike/src/presence/use-presence.ts
@@ -0,0 +1,56 @@
+import type { HocuspocusProvider } from '@hocuspocus/provider';
+import { useEffect, useState } from 'react';
+
+export interface Participant {
+  clientId: number;
+  user: {
+    name: string;
+    color: string;
+    type: 'human' | 'agent';
+    icon?: string;
+    coeditor?: string;
+    tabId?: string;
+  };
+  mode: 'wysiwyg' | 'source' | 'idle' | 'editing';
+}
+
+/**
+ * Watches awareness.on('change') and returns an array of participants
+ * with clientId, user info, and mode.
+ */
+export function usePresence(provider: HocuspocusProvider | null): Participant[] {
+  const [participants, setParticipants] = useState<Participant[]>([]);
+
+  useEffect(() => {
+    if (!provider) return;
+
+    const awareness = provider.awareness;
+    if (!awareness) return;
+
+    const handler = () => {
+      const entries = Array.from(awareness.getStates().entries());
+      const result: Participant[] = [];
+      for (const [clientId, state] of entries) {
+        const s = state as Record<string, unknown>;
+        if (s.user && typeof s.user === 'object') {
+          result.push({
+            clientId,
+            user: s.user as Participant['user'],
+            mode: (s.mode as Participant['mode']) ?? 'wysiwyg',
+          });
+        }
+      }
+      setParticipants(result);
+    };
+
+    // Initial read
+    handler();
+
+    awareness.on('change', handler);
+    return () => {
+      awareness.off('change', handler);
+    };
+  }, [provider]);
+
+  return participants;
+}
diff --git a/init_spike/src/presence/use-visibility-change.ts b/init_spike/src/presence/use-visibility-change.ts
new file mode 100644
index 0000000..12b6f7d
--- /dev/null
+++ b/init_spike/src/presence/use-visibility-change.ts
@@ -0,0 +1,17 @@
+import { useEffect } from 'react';
+
+/**
+ * Hook wrapping document.addEventListener('visibilitychange') with cleanup.
+ * Calls the callback whenever the page visibility state changes.
+ */
+export function useVisibilityChange(callback: (state: DocumentVisibilityState) => void): void {
+  useEffect(() => {
+    const handler = () => {
+      callback(document.visibilityState);
+    };
+    document.addEventListener('visibilitychange', handler);
+    return () => {
+      document.removeEventListener('visibilitychange', handler);
+    };
+  }, [callback]);
+}
diff --git a/init_spike/src/server/agent-sim.ts b/init_spike/src/server/agent-sim.ts
index 200a069..013c122 100644
--- a/init_spike/src/server/agent-sim.ts
+++ b/init_spike/src/server/agent-sim.ts
@@ -1,8 +1,13 @@
 /**
- * V3: Agent simulator — triggers DirectConnection writes via HTTP API.
+ * V4: Agent simulator — triggers DirectConnection writes via HTTP API.
+ *
+ * The agent write endpoints (/api/agent-write, /api/agent-write-md) now:
+ * - Set agent awareness (name: Claude, color: #D97757, type: agent)
+ * - Write Y.Map('activity') entry alongside content for flash plugins
+ * - Use 'agent-write' origin for per-origin undo tracking
  *
  * Usage:
- *   bun run src/server/agent-sim.ts                    # single raw Y.XmlElement write
+ *   bun run src/server/agent-sim.ts                    # single raw write
  *   bun run src/server/agent-sim.ts --rapid 5          # 5 rapid writes (100ms apart)
  *   bun run src/server/agent-sim.ts --markdown         # single markdown write (unified path)
  *   bun run src/server/agent-sim.ts --markdown --rapid 5
@@ -31,34 +36,72 @@ async function agentWriteMarkdown(
   return (await res.json()) as { ok: boolean; timestamp?: string; error?: string };
 }
 
+async function checkUndoStatus(): Promise<{ canUndo: boolean; canRedo: boolean } | null> {
+  try {
+    const res = await fetch(`${BASE_URL}/api/agent-undo-status`);
+    if (res.ok) return (await res.json()) as { canUndo: boolean; canRedo: boolean };
+  } catch {
+    // Server not running or endpoint not available
+  }
+  return null;
+}
+
 const args = process.argv.slice(2);
 const useMarkdown = args.includes('--markdown');
 const rapidIndex = args.indexOf('--rapid');
 const count = rapidIndex >= 0 ? Number.parseInt(args[rapidIndex + 1] || '5', 10) : 1;
 
-async function doWrite() {
+async function doWrite(index: number) {
   const timestamp = new Date().toISOString();
-  if (useMarkdown) {
-    return agentWriteMarkdown(`Agent markdown write at ${timestamp}`, 'append');
+  try {
+    let result: { ok: boolean; timestamp?: string; error?: string };
+    if (useMarkdown) {
+      result = await agentWriteMarkdown(`Agent markdown write at ${timestamp}`, 'append');
+    } else {
+      result = await agentWriteRaw();
+    }
+
+    if (result.ok) {
+      console.log(
+        `  [write ${index}] OK — awareness: editing→idle, activity map updated, origin: agent-write`,
+      );
+    } else {
+      console.error(`  [write ${index}] FAIL — ${result.error ?? 'unknown error'}`);
+    }
+    return result;
+  } catch (e) {
+    const message = e instanceof Error ? e.message : String(e);
+    console.error(`  [write ${index}] ERROR — ${message}`);
+    console.error('    Is the dev server running? (bun run dev)');
+    return { ok: false, error: message };
   }
-  return agentWriteRaw();
 }
 
+console.log(`\n--- Agent Simulator (v4) ---`);
+console.log(`Mode: ${useMarkdown ? 'markdown' : 'raw'}`);
+console.log(`Writes: ${count}${count > 1 ? ' (rapid, 100ms apart)' : ''}`);
+console.log(`Presence: Agent connects with awareness (Claude, #D97757, type: agent)`);
+console.log(`Activity: Y.Map('activity') updated per write for flash plugins`);
+console.log(`Undo: writes tracked with 'agent-write' origin\n`);
+
 if (count > 1) {
-  console.log(`Rapid mode: ${count} writes, 100ms apart (${useMarkdown ? 'markdown' : 'raw'})\n`);
   for (let i = 0; i < count; i++) {
-    const result = await doWrite();
-    console.log(
-      `  Write ${i + 1}/${count}: ${result.ok ? 'OK' : 'FAIL'} ${result.timestamp ?? result.error}`,
-    );
+    await doWrite(i + 1);
     if (i < count - 1) {
       await new Promise((r) => setTimeout(r, 100));
     }
   }
 } else {
-  console.log(`Single agent write (${useMarkdown ? 'markdown' : 'raw'})...`);
-  const result = await doWrite();
-  console.log(`  Result: ${result.ok ? 'OK' : 'FAIL'} ${result.timestamp ?? result.error}`);
+  await doWrite(1);
+}
+
+// Check undo status after writes
+const undoStatus = await checkUndoStatus();
+if (undoStatus) {
+  console.log(`\nUndo status: canUndo=${undoStatus.canUndo}, canRedo=${undoStatus.canRedo}`);
 }
 
-console.log('\nDone. Check the browser editor for new paragraph(s).');
+console.log('\nDone. Check the browser for:');
+console.log('  - Agent in presence bar (Claude badge)');
+console.log('  - Region flash on new content');
+console.log('  - "Undo Agent Edit" button enabled');
diff --git a/init_spike/src/server/hocuspocus-plugin.ts b/init_spike/src/server/hocuspocus-plugin.ts
index 96d0f0c..e23d9ef 100644
--- a/init_spike/src/server/hocuspocus-plugin.ts
+++ b/init_spike/src/server/hocuspocus-plugin.ts
@@ -1,5 +1,10 @@
 import { resolve } from 'node:path';
-import { Hocuspocus, type LocalTransactionOrigin } from '@hocuspocus/server';
+import {
+  type DirectConnection,
+  type Document,
+  Hocuspocus,
+  type LocalTransactionOrigin,
+} from '@hocuspocus/server';
 import { getSchema } from '@tiptap/core';
 import { MarkdownManager } from '@tiptap/markdown';
 import { updateYFragment } from '@tiptap/y-tiptap';
@@ -11,6 +16,16 @@ import { sharedExtensions } from '../editor/extensions/shared';
 import { startWatcher } from './file-watcher';
 import { createPersistenceExtension } from './persistence';
 
+/**
+ * The DirectConnection class exposes `.document` at runtime but the exported
+ * interface only declares `transact()` and `disconnect()`. We extend the
+ * interface so we can access `document` (needed for `dc.document.transact()`
+ * with a custom origin string and for awareness).
+ */
+interface AgentDirectConnection extends DirectConnection {
+  document: Document;
+}
+
 const MAX_BODY_BYTES = 1_048_576; // 1 MB
 const CONTENT_DIR = resolve(
   import.meta.dirname ?? new URL('.', import.meta.url).pathname,
@@ -27,6 +42,100 @@ export const hocuspocus = new Hocuspocus({
   extensions: [createPersistenceExtension()],
 });
 
+// --- Persistent agent session model ---
+// DirectConnections stay open for the agent's session lifetime.
+// Awareness persists between transactions.
+const agentSessions = new Map<string, AgentDirectConnection>();
+
+/** Agent write origin — tracked by server-side UndoManager (US-007). */
+export const AGENT_WRITE_ORIGIN = 'agent-write';
+
+/** Default agent identity. Key used in Y.Map('activity') per D11. */
+const DEFAULT_AGENT_ID = 'claude-1';
+
+// --- Server-side UndoManager for per-origin undo (US-007) ---
+// Tracks only 'agent-write' origin on Y.Text('source').
+// captureTimeout: 0 ensures each agent transaction is a separate undo entry.
+const agentUndoManagers = new Map<string, Y.UndoManager>();
+
+/**
+ * Get or create a server-side UndoManager for agent writes on a document.
+ * Created alongside the agent session — tracks Y.Text('source') with origin 'agent-write'.
+ */
+function getAgentUndoManager(dc: AgentDirectConnection): Y.UndoManager {
+  const docName = dc.document.name;
+  let um = agentUndoManagers.get(docName);
+  if (!um) {
+    const ytext = dc.document.getText('source');
+    um = new Y.UndoManager(ytext, {
+      trackedOrigins: new Set([AGENT_WRITE_ORIGIN]),
+      captureTimeout: 0,
+    });
+    agentUndoManagers.set(docName, um);
+    console.log(`[agent-undo] Created UndoManager for: ${docName}`);
+  }
+  return um;
+}
+
+/**
+ * Get or create a persistent agent DirectConnection for a document.
+ * Sets agent awareness (name, color, type) on first open.
+ */
+async function getAgentSession(docName: string): Promise<AgentDirectConnection> {
+  let dc = agentSessions.get(docName);
+  if (!dc) {
+    // Cast: the runtime DirectConnection class has `.document` but the
+    // exported interface doesn't declare it. See AgentDirectConnection type above.
+    dc = (await hocuspocus.openDirectConnection(docName)) as AgentDirectConnection;
+    // Set agent presence (persists across transactions)
+    dc.document.awareness.setLocalState({
+      user: {
+        name: 'Claude',
+        color: '#D97757',
+        type: 'agent',
+        icon: 'claude',
+        tabId: `agent-${Date.now()}`,
+      },
+      mode: 'idle',
+    });
+    agentSessions.set(docName, dc);
+    // Initialize the UndoManager alongside the session
+    getAgentUndoManager(dc);
+    console.log(`[agent-session] Created persistent session for: ${docName}`);
+  }
+  return dc;
+}
+
+/**
+ * Disconnect and remove an agent session. Clears awareness before disconnect.
+ */
+async function closeAgentSession(docName: string): Promise<void> {
+  const dc = agentSessions.get(docName);
+  if (dc) {
+    // Destroy UndoManager before disconnecting
+    const um = agentUndoManagers.get(docName);
+    if (um) {
+      um.destroy();
+      agentUndoManagers.delete(docName);
+      console.log(`[agent-undo] Destroyed UndoManager for: ${docName}`);
+    }
+    dc.document.awareness.setLocalState(null);
+    await dc.disconnect();
+    agentSessions.delete(docName);
+    console.log(`[agent-session] Closed session for: ${docName}`);
+  }
+}
+
+/**
+ * Close all agent sessions. Used during test reset.
+ */
+async function closeAllAgentSessions(): Promise<void> {
+  const entries = [...agentSessions.keys()];
+  for (const docName of entries) {
+    await closeAgentSession(docName);
+  }
+}
+
 export function hocuspocusPlugin(): Plugin {
   return {
     name: 'hocuspocus',
@@ -53,6 +162,7 @@ export function hocuspocusPlugin(): Plugin {
       });
 
       // HTTP API for agent-sim DirectConnection writes
+      // Migrated: XmlFragment → Y.Text writes (audit C2), conn.transact → dc.document.transact
       server.middlewares.use('/api/agent-write', async (req, res) => {
         if (req.method !== 'POST') {
           res.writeHead(405);
@@ -61,21 +171,35 @@ export function hocuspocusPlugin(): Plugin {
         }
 
         try {
-          const conn = await hocuspocus.openDirectConnection('test-doc');
+          const dc = await getAgentSession('test-doc');
           const timestamp = new Date().toISOString();
+          const content = `Hello from the agent! ${timestamp}`;
 
-          try {
-            await conn.transact((doc) => {
-              const fragment = doc.getXmlFragment('default');
-              const paragraph = new Y.XmlElement('paragraph');
-              const text = new Y.XmlText();
-              text.applyDelta([{ insert: `Hello from the agent! ${timestamp}` }]);
-              paragraph.insert(0, [text]);
-              fragment.push([paragraph]);
+          // Set awareness to 'editing' during write
+          dc.document.awareness.setLocalStateField('mode', 'editing');
+
+          // Use dc.document.transact() with 'agent-write' origin — NOT conn.transact()
+          // which hardcodes origin to { source: 'local' }.
+          // Write to Y.Text (not XmlFragment) — Observer B propagates to tree.
+          dc.document.transact(() => {
+            const ytext = dc.document.getText('source');
+            const currentText = ytext.toString();
+            const insertAt = currentText.length;
+            const separator = currentText.trim() ? '\n\n' : '';
+            ytext.insert(insertAt, `${separator}${content}\n`);
+
+            // Activity map write INSIDE the same transaction (F1/C3 fix)
+            const activityMap = dc.document.getMap('activity');
+            activityMap.set(DEFAULT_AGENT_ID, {
+              agentId: DEFAULT_AGENT_ID,
+              timestamp: Date.now(),
+              type: 'insert',
+              description: `Added: ${content.slice(0, 50)}`,
             });
-          } finally {
-            await conn.disconnect();
-          }
+          }, AGENT_WRITE_ORIGIN);
+
+          // Set awareness back to 'idle' after write
+          dc.document.awareness.setLocalStateField('mode', 'idle');
 
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ ok: true, timestamp }));
@@ -88,6 +212,7 @@ export function hocuspocusPlugin(): Plugin {
       });
 
       // HTTP API for agent-sim markdown writes (unified write path)
+      // Migrated: conn.transact → dc.document.transact with 'agent-write' origin
       server.middlewares.use('/api/agent-write-md', async (req, res) => {
         if (req.method !== 'POST') {
           res.writeHead(405);
@@ -132,28 +257,38 @@ export function hocuspocusPlugin(): Plugin {
           }
 
           const position = pos === 'prepend' ? 'prepend' : 'append';
-          const conn = await hocuspocus.openDirectConnection('test-doc');
+          const dc = await getAgentSession('test-doc');
           const timestamp = new Date().toISOString();
 
-          try {
-            // Direct Y.Text insertion — Observer B handles the tree update.
-            // Simpler than serialize→splice→parse→updateYFragment, and preserves
-            // per-character CRDT IDs in the inserted text.
-            await conn.transact((doc) => {
-              const ytext = doc.getText('source');
-              const currentText = ytext.toString();
-
-              if (position === 'prepend') {
-                ytext.insert(0, `${markdown.trim()}\n\n`);
-              } else {
-                const insertAt = currentText.length;
-                const separator = currentText.trim() ? '\n\n' : '';
-                ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
-              }
+          // Set awareness to 'editing' during write
+          dc.document.awareness.setLocalStateField('mode', 'editing');
+
+          // Use dc.document.transact() with 'agent-write' origin — NOT conn.transact()
+          // Direct Y.Text insertion — Observer B handles the tree update.
+          dc.document.transact(() => {
+            const ytext = dc.document.getText('source');
+            const currentText = ytext.toString();
+
+            if (position === 'prepend') {
+              ytext.insert(0, `${markdown.trim()}\n\n`);
+            } else {
+              const insertAt = currentText.length;
+              const separator = currentText.trim() ? '\n\n' : '';
+              ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
+            }
+
+            // Activity map write INSIDE the same transaction (F1/C3 fix)
+            const activityMap = dc.document.getMap('activity');
+            activityMap.set(DEFAULT_AGENT_ID, {
+              agentId: DEFAULT_AGENT_ID,
+              timestamp: Date.now(),
+              type: 'insert',
+              description: `Added: ${markdown.trim().slice(0, 50)}`,
             });
-          } finally {
-            await conn.disconnect();
-          }
+          }, AGENT_WRITE_ORIGIN);
+
+          // Set awareness back to 'idle' after write
+          dc.document.awareness.setLocalStateField('mode', 'idle');
 
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ ok: true, timestamp }));
@@ -165,6 +300,77 @@ export function hocuspocusPlugin(): Plugin {
         }
       });
 
+      // --- Agent undo/redo endpoints (US-007) ---
+      server.middlewares.use('/api/agent-undo-status', async (req, res) => {
+        if (req.method !== 'GET') {
+          res.writeHead(405);
+          res.end('Method not allowed');
+          return;
+        }
+        try {
+          const dc = await getAgentSession('test-doc');
+          const um = getAgentUndoManager(dc);
+          res.writeHead(200, { 'Content-Type': 'application/json' });
+          res.end(JSON.stringify({ canUndo: um.canUndo(), canRedo: um.canRedo() }));
+        } catch (e) {
+          const message = e instanceof Error ? e.message : String(e);
+          res.writeHead(500, { 'Content-Type': 'application/json' });
+          res.end(JSON.stringify({ error: message }));
+        }
+      });
+
+      server.middlewares.use('/api/agent-undo', async (req, res) => {
+        if (req.method !== 'POST') {
+          res.writeHead(405);
+          res.end('Method not allowed');
+          return;
+        }
+        try {
+          const dc = await getAgentSession('test-doc');
+          const um = getAgentUndoManager(dc);
+          if (!um.canUndo()) {
+            res.writeHead(200, { 'Content-Type': 'application/json' });
+            res.end(JSON.stringify({ ok: false, canUndo: false, canRedo: um.canRedo() }));
+            return;
+          }
+          um.undo();
+          console.log('[agent-undo] Undo performed');
+          res.writeHead(200, { 'Content-Type': 'application/json' });
+          res.end(JSON.stringify({ ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() }));
+        } catch (e) {
+          console.error('[agent-undo]', e);
+          const message = e instanceof Error ? e.message : String(e);
+          res.writeHead(500, { 'Content-Type': 'application/json' });
+          res.end(JSON.stringify({ ok: false, error: message }));
+        }
+      });
+
+      server.middlewares.use('/api/agent-redo', async (req, res) => {
+        if (req.method !== 'POST') {
+          res.writeHead(405);
+          res.end('Method not allowed');
+          return;
+        }
+        try {
+          const dc = await getAgentSession('test-doc');
+          const um = getAgentUndoManager(dc);
+          if (!um.canRedo()) {
+            res.writeHead(200, { 'Content-Type': 'application/json' });
+            res.end(JSON.stringify({ ok: false, canUndo: um.canUndo(), canRedo: false }));
+            return;
+          }
+          um.redo();
+          console.log('[agent-undo] Redo performed');
+          res.writeHead(200, { 'Content-Type': 'application/json' });
+          res.end(JSON.stringify({ ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() }));
+        } catch (e) {
+          console.error('[agent-redo]', e);
+          const message = e instanceof Error ? e.message : String(e);
+          res.writeHead(500, { 'Content-Type': 'application/json' });
+          res.end(JSON.stringify({ ok: false, error: message }));
+        }
+      });
+
       // --- Test reset endpoint: unload document for E2E test isolation ---
       server.middlewares.use('/api/test-reset', async (req, res) => {
         if (req.method !== 'POST') {
@@ -173,6 +379,8 @@ export function hocuspocusPlugin(): Plugin {
           return;
         }
         try {
+          // Close agent sessions before closing connections
+          await closeAllAgentSessions();
           hocuspocus.closeConnections('test-doc');
           const doc = hocuspocus.documents.get('test-doc');
           if (doc) await hocuspocus.unloadDocument(doc);
@@ -221,11 +429,13 @@ export function hocuspocusPlugin(): Plugin {
         }
       }
 
-      startWatcher(CONTENT_DIR, handleExternalChange).then((subscription) => {
-        server.httpServer?.on('close', () => subscription.unsubscribe());
-      }).catch((err) => {
-        console.error('[hocuspocus] Disk bridge watcher failed to start:', err);
-      });
+      startWatcher(CONTENT_DIR, handleExternalChange)
+        .then((subscription) => {
+          server.httpServer?.on('close', () => subscription.unsubscribe());
+        })
+        .catch((err) => {
+          console.error('[hocuspocus] Disk bridge watcher failed to start:', err);
+        });
 
       console.log('[hocuspocus] WebSocket server ready on /collab');
       console.log('[hocuspocus] Agent write API at POST /api/agent-write');
diff --git a/init_spike/src/types/diff.d.ts b/init_spike/src/types/diff.d.ts
index 4573d04..2ef098c 100644
--- a/init_spike/src/types/diff.d.ts
+++ b/init_spike/src/types/diff.d.ts
@@ -6,5 +6,13 @@ declare module 'diff' {
     count?: number;
   }
 
+  interface ArrayChange<T> {
+    value: T[];
+    added?: boolean;
+    removed?: boolean;
+    count?: number;
+  }
+
   export function diffLines(oldStr: string, newStr: string): Change[];
+  export function diffArrays<T>(oldArr: T[], newArr: T[]): ArrayChange<T>[];
 }
diff --git a/init_spike/tests/e2e/qa-scenarios.spec.ts b/init_spike/tests/e2e/qa-scenarios.spec.ts
index ed5456e..a0d7c0a 100644
--- a/init_spike/tests/e2e/qa-scenarios.spec.ts
+++ b/init_spike/tests/e2e/qa-scenarios.spec.ts
@@ -5,7 +5,7 @@
  * scenarios from SPEC.md Section 7 not covered by sync.spec.ts.
  */
 
-import { readFile, writeFile, unlink } from 'node:fs/promises';
+import { readFile, unlink, writeFile } from 'node:fs/promises';
 import { dirname, resolve } from 'node:path';
 import { fileURLToPath } from 'node:url';
 import { expect, type Page, test } from '@playwright/test';
@@ -31,12 +31,7 @@ async function openEditor(page: Page) {
   await page.waitForTimeout(2000);
 }
 
-async function expectContent(
-  page: Page,
-  selector: string,
-  expected: string,
-  timeout = 15_000,
-) {
+async function expectContent(page: Page, selector: string, expected: string, timeout = 15_000) {
   await expect(async () => {
     const text = await page.locator(selector).innerText();
     expect(text).toContain(expected);
@@ -121,9 +116,7 @@ test.describe('QA-002: W02 — Two tabs typing simultaneously, different paragra
 });
 
 test.describe('QA-003: T33 — Cross-mode concurrent editing', () => {
-  test('WYSIWYG and source editing non-conflicting areas — both survive', async ({
-    browser,
-  }) => {
+  test('WYSIWYG and source editing non-conflicting areas — both survive', async ({ browser }) => {
     const page1 = await browser.newPage();
     await openEditor(page1);
     await resetDoc(page1);
diff --git a/init_spike/tests/e2e/sync.spec.ts b/init_spike/tests/e2e/sync.spec.ts
index 8d8e1ff..2920411 100644
--- a/init_spike/tests/e2e/sync.spec.ts
+++ b/init_spike/tests/e2e/sync.spec.ts
@@ -37,12 +37,7 @@ async function openEditor(page: Page) {
 }
 
 /** Poll until content appears (Playwright best practice for async sync). */
-async function expectContent(
-  page: Page,
-  selector: string,
-  expected: string,
-  timeout = 15_000,
-) {
+async function expectContent(page: Page, selector: string, expected: string, timeout = 15_000) {
   await expect(async () => {
     const text = await page.locator(selector).innerText();
     expect(text).toContain(expected);
diff --git a/init_spike/tsconfig.json b/init_spike/tsconfig.json
index f42f52c..ce4d9c0 100644
--- a/init_spike/tsconfig.json
+++ b/init_spike/tsconfig.json
@@ -12,7 +12,11 @@
     "sourceMap": true,
     "isolatedModules": true,
     "verbatimModuleSyntax": true,
-    "jsx": "react-jsx"
+    "jsx": "react-jsx",
+    "baseUrl": ".",
+    "paths": {
+      "@/*": ["./src/*"]
+    }
   },
   "include": ["src"],
   "exclude": ["node_modules", "dist", "src/v7-test"]
diff --git a/init_spike/vite.config.ts b/init_spike/vite.config.ts
index 6a7443a..aa4e0d6 100644
--- a/init_spike/vite.config.ts
+++ b/init_spike/vite.config.ts
@@ -1,7 +1,13 @@
+import path from 'node:path';
 import react from '@vitejs/plugin-react';
 import { defineConfig } from 'vite';
 import { hocuspocusPlugin } from './src/server/hocuspocus-plugin';
 
 export default defineConfig({
   plugins: [react(), hocuspocusPlugin()],
+  resolve: {
+    alias: {
+      '@': path.resolve(__dirname, './src'),
+    },
+  },
 });
```

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
