/**
 * Registry type definitions for the component system.
 * Pure TypeScript — no React, no Node-only tools, no browser APIs.
 */

/**
 * A single prop definition on a component. Discriminated union on `type` —
 * the enum variant carries `enumValues` as a required field so illegal states
 * (`type: 'enum'` without `enumValues`) are unrepresentable at the type level.
 */
export type PropDef =
  | PropDefString
  | PropDefBoolean
  | PropDefNumber
  | PropDefEnum
  | PropDefReactNode;

interface PropDefBase {
  name: string;
  required: boolean;
  /** Human-readable description (from TSDoc or react-docgen) */
  description?: string;
}

export interface PropDefString extends PropDefBase {
  type: 'string';
  defaultValue?: string;
}

export interface PropDefBoolean extends PropDefBase {
  type: 'boolean';
  defaultValue?: boolean;
}

export interface PropDefNumber extends PropDefBase {
  type: 'number';
  defaultValue?: number;
}

export interface PropDefEnum extends PropDefBase {
  type: 'enum';
  /** Allowed values for this enum. Required — empty arrays are invalid. */
  enumValues: string[];
  defaultValue?: string;
}

export interface PropDefReactNode extends PropDefBase {
  type: 'reactnode';
  // ReactNode props have no meaningful default (children are structural, not prop values)
}

/** Metadata known at build time, independent of React. */
export interface ComponentMeta {
  /** Auto-extracted prop definitions */
  props: PropDef[];
  /** Display name for slash commands and panels */
  displayName: string;
  /** Category for slash command grouping */
  category: 'content' | 'layout' | 'media' | 'data';
  /** Icon name for slash command menu (resolved to a React icon in app) */
  icon?: string;
}

/**
 * Hand-maintained entry for a built-in component.
 * Lists the component name, where to extract props from, and display metadata.
 * Does NOT import React components — just names + paths.
 */
export interface BuiltInManifestEntry {
  /** Component name as used in JSX (e.g., 'Callout') */
  name: string;
  /** Absolute path to the .d.ts or .tsx file to extract props from */
  sourceFile: string;
  /** Category for slash command grouping */
  category: ComponentMeta['category'];
  /** Display name for slash commands and panels */
  displayName: string;
  /** Icon name for slash command menu */
  icon?: string;
}
