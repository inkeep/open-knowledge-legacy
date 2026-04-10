# Evidence: Large File Performance in Obsidian

## Practical Size Limits

| File Size | Behavior |
|---|---|
| Up to ~10,000 lines / few hundred KB | Generally smooth |
| ~40,000+ lines | Noticeable lag begins |
| 7.5 MB+ | Text changes take up to a minute to render, or freeze app |
| 14.1 MB (2.6M words) | Loads but freezes for seconds when editing mid-document |

Sources:
- UI performance with large files: https://forum.obsidian.md/t/ui-performance-issues-with-large-files/13782
- Zsolt's performance test: https://www.zsolt.blog/2021/05/obsidian-performance-test-take-1.html

## Karpathy Workflow Impact
10K-word compiled article (~60 KB) is roughly **100x smaller** than the problem threshold. No issues expected on desktop.

## Performance by Editor Mode

| Mode | Performance with Large Files |
|---|---|
| Source Mode | Fastest — raw markdown, no rendering overhead |
| Live Preview | Slowest — must selectively render/hide syntax around cursor |
| Reading View | Middle — renders full document once (no cursor tracking), read-only |

Large tables specifically cause 5+ second loading in Live Preview.
Source: https://forum.obsidian.md/t/large-tables-slow-to-render-in-live-preview/85013

## CodeMirror 6 Characteristics
- Viewport-based rendering (only visible lines in DOM)
- Progressive highlighting stops after budget to save battery/memory
- Million-line demo: https://codemirror.net/examples/million/
- Single very-long lines (30K+ chars on one line) can cause breakage
- GitHub issue: https://github.com/codemirror/dev/issues/1089

## Specific Pain Points (Worst to Least)
1. **Large tables in Live Preview** — worst offender, 5+ second renders
2. **Embedded base64 images** — inflate file size; devs say unsupported
3. **Scrolling with linked preview pane** — freezes UI on large files
4. **Many internal links on mobile** — crashes app
5. **Community plugins** — per-line processing compounds with file size

Source for mobile crashes: https://forum.obsidian.md/t/obsidian-mobile-app-crashing-android-and-ios-with-file-of-large-number-of-internal-header-links/29827

## Workarounds
- Switch to Source Mode for editing large files
- Disable community plugins when working with big documents
- Use Dataview for large tables (renders dynamically)
- Pin tabs with large files to avoid re-rendering
- Keep column content short in tables
- Use file references instead of base64 images
- Split very large reference docs into smaller linked notes

## Mobile Performance
- Large vaults (50K+ notes) take 30+ seconds to load
- Files with many internal links crash on iOS/Android
- Recommendations: selective sync, disable unneeded plugins, keep app in background

Sources:
- Android large vault: https://forum.obsidian.md/t/android-large-vault-slow-to-load-on-with-all-plugins-disabled/90828
- Mobile tips: https://obsidian.rocks/obsidian-mobile-five-tips-for-success/
