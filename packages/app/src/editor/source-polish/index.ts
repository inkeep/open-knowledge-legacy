import type { Extension } from '@codemirror/state';
import { brokenRefField } from './broken-ref-field';
import { sourcePolishViewPlugin } from './view-plugin';

/** Array is valid as `Extension` per @codemirror/state's recursive type
 * (`type Extension = { extension: Extension } | readonly Extension[]`).
 * Single-return matches the `createXxxSourceExtension()` convention used by
 * sibling plugins (wiki-link-source, md-link-source, agent-flash-source). */
export function createSourcePolishExtension(): Extension {
  return [sourcePolishViewPlugin, brokenRefField];
}
