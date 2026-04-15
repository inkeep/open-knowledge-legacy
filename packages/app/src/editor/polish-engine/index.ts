/**
 * Polish Engine — Public API
 *
 * Exports constructPolishEngine(registry) → Extension[] and the
 * polishCompartment for internal auto-bail reconfiguration.
 *
 * The Compartment is internal-only — no user UI surfaces it.
 * It exists solely for §6.6's auto-bail predicate.
 */

import { Compartment, type Extension } from '@codemirror/state';
import { createAutoBailPlugin } from './auto-bail';
import { blockquoteConstruct } from './constructs/blockquote';
import {
  codeInfoConstruct,
  codeMarkConstruct,
  fencedCodeConstruct,
} from './constructs/fenced-code';
import {
  tableCellConstruct,
  tableContainerConstruct,
  tableHeaderConstruct,
  tableRowConstruct,
} from './constructs/table';
import type { Registry } from './registry';
import { createCrossScanField } from './state-field';
import { createPolishViewPlugin } from './view-plugin';

/** Internal-only Compartment wrapping the engine extensions. */
export const polishCompartment = new Compartment();

/** Default registry of all supported constructs. */
export const defaultRegistry: Registry = [
  blockquoteConstruct,
  tableContainerConstruct,
  tableHeaderConstruct,
  tableRowConstruct,
  tableCellConstruct,
  fencedCodeConstruct,
  codeMarkConstruct,
  codeInfoConstruct,
];

/**
 * Build the polish engine Extension[] from a registry.
 * Returns [ViewPlugin, StateField (if cross-scan configs exist)].
 */
export function constructPolishEngine(registry: Registry): Extension[] {
  const extensions: Extension[] = [];

  // ViewPlugin: shared syntaxTree walk for line/mark/widget-side constructs
  extensions.push(createPolishViewPlugin(registry));

  // StateField: cross-scan for broken-reference detection
  extensions.push(createCrossScanField(registry));

  return extensions;
}

/**
 * Build the full engine extension set including the auto-bail wrapper.
 * This is what SourceEditor.tsx should wire into its extensions array.
 */
export function createPolishEngineExtension(registry?: Registry): Extension[] {
  const reg = registry ?? defaultRegistry;
  return [
    polishCompartment.of(constructPolishEngine(reg)),
    createAutoBailPlugin(polishCompartment),
  ];
}

export type { ConstructConfig, Registry } from './registry';
