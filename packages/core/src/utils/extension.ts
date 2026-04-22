/**
 * Shared extension-extraction helper used by the client emit path,
 * the wiki-link-embed render path, and the mdast→PM dispatch. Three
 * implementations shipped slightly divergent before consolidation —
 * same-ish behavior for typical inputs, different behavior for
 * `v1.0/README` (image-upload returned `0/README`, the others returned
 * `README`). Consistency matters: the mdast→PM handler and the render
 * path both consume the extension to pick the PM shape, so the two
 * must agree on what "extension" means for a given input.
 *
 * Behavior (covers both filename and path inputs):
 *   - Strip directories first (`subdir/foo.png` → `foo.png`).
 *   - `lastIndexOf('.')` on the remaining basename.
 *   - Trailing dot (`foo.`) counts as no-extension.
 *   - Leading dot on a dotfile (`.gitignore`) counts as no-extension.
 *   - Lowercase the result for case-insensitive matching.
 */
export function extensionOf(filenameOrPath: string): string {
  const basename = filenameOrPath.split('/').pop() ?? filenameOrPath;
  const idx = basename.lastIndexOf('.');
  if (idx <= 0 || idx === basename.length - 1) return '';
  return basename.slice(idx + 1).toLowerCase();
}
