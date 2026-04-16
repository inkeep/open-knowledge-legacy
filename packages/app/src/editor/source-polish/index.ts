import type { Extension } from '@codemirror/state';
import { brokenRefField } from './broken-ref-field';
import { sourcePolishViewPlugin } from './view-plugin';

export function sourcePolishExtensions(): Extension[] {
  return [sourcePolishViewPlugin, brokenRefField];
}
