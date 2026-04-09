/**
 * Registry type definitions for the component system.
 * Pure TypeScript — no React, no Node-only tools, no browser APIs.
 */

export interface PropDef {
  name: string;
  type: 'string' | 'boolean' | 'enum' | 'number' | 'reactnode';
  required: boolean;
  defaultValue?: string | boolean | number;
  /** For enum type: the allowed values */
  enumValues?: string[];
  /** Human-readable description (from TSDoc or react-docgen) */
  description?: string;
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
