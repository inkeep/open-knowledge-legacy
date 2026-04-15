/**
 * build-registry.ts — Extracts PropDef arrays from fumadocs-ui TypeScript
 * source types via react-docgen-typescript and writes them to
 * packages/core/src/generated/components.ts.
 *
 * Usage: bun run scripts/build-registry.ts
 *
 * The generated file supplements the hand-authored PropDef arrays in
 * built-ins.ts. Hand-authored overrides take precedence for components
 * where react-docgen-typescript extraction fails (known issues with
 * ForwardRefExoticComponent, Omit<>/Pick<>, generic <T>).
 *
 * FR-28: Emits structured diagnostic warnings when extraction produces
 * an empty PropDef array for a component whose source contains a
 * non-trivial Props interface.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { withDefaultConfig } from 'react-docgen-typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'generated', 'components.ts');

/**
 * Resolve a .d.ts path inside a package using require.resolve on package.json
 * (always exportable) to find the package root, then constructing the relative path.
 * This avoids ERR_PACKAGE_PATH_NOT_EXPORTED from modern packages with exports maps.
 */
function resolveDts(packageName: string, relativePath: string): string {
  const pkgJsonPath = require.resolve(`${packageName}/package.json`);
  const pkgDir = path.dirname(pkgJsonPath);
  return path.join(pkgDir, relativePath);
}

/** Map react-docgen-typescript type names to our PropDef type discriminant. */
function mapType(rdtType: string): 'string' | 'boolean' | 'number' | 'enum' | 'reactnode' | null {
  const t = rdtType.toLowerCase().trim();
  if (t === 'string') return 'string';
  if (t === 'boolean' || t === 'bool') return 'boolean';
  if (t === 'number') return 'number';
  if (t === 'reactnode' || t === 'reactelement' || t === 'react.reactnode') return 'reactnode';
  // Enum detection: union of string literals e.g. '"info" | "warn" | "error"'
  if (rdtType.includes('|') && rdtType.includes('"')) return 'enum';
  return null;
}

/** Extract enum values from a union type string like '"info" | "warn" | "error"'. */
function extractEnumValues(rdtType: string): string[] {
  const matches = rdtType.match(/"([^"]+)"/g);
  return matches ? matches.map((m) => m.replace(/"/g, '')) : [];
}

// Configure the parser per §9.9 critical correctness detail
const parser = withDefaultConfig({
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  skipChildrenPropWithoutDoc: false,
  propFilter: (prop) => {
    // Filter ONLY @types/react and node_modules/react/ — NOT blanket node_modules.
    // Blanket node_modules filter DROPS fumadocs-ui's OWN props (they live under
    // node_modules/fumadocs-ui/dist/*.d.ts). This is the single most important line.
    if (prop.parent?.fileName.includes('@types/react')) return false;
    if (prop.parent?.fileName.includes('node_modules/react/')) return false;
    // Callback signatures — no UI control
    if (prop.type.name.startsWith('(')) return false;
    return true;
  },
});

// Component sources to extract
interface ComponentSource {
  name: string;
  file: string;
  exportName?: string;
}

const sources: ComponentSource[] = [
  { name: 'Callout', file: resolveDts('fumadocs-ui', 'dist/components/callout.d.ts') },
  { name: 'Card', file: resolveDts('fumadocs-ui', 'dist/components/card.d.ts') },
  { name: 'Cards', file: resolveDts('fumadocs-ui', 'dist/components/card.d.ts') },
  { name: 'Steps', file: resolveDts('fumadocs-ui', 'dist/components/steps.d.ts') },
  { name: 'Step', file: resolveDts('fumadocs-ui', 'dist/components/steps.d.ts') },
  { name: 'Tabs', file: resolveDts('fumadocs-ui', 'dist/components/tabs.d.ts') },
  { name: 'Tab', file: resolveDts('fumadocs-ui', 'dist/components/tabs.d.ts') },
  {
    name: 'Accordions',
    file: resolveDts('fumadocs-ui', 'dist/components/accordion.d.ts'),
  },
  {
    name: 'Accordion',
    file: resolveDts('fumadocs-ui', 'dist/components/accordion.d.ts'),
  },
  { name: 'Files', file: resolveDts('fumadocs-ui', 'dist/components/files.d.ts') },
  { name: 'Folder', file: resolveDts('fumadocs-ui', 'dist/components/files.d.ts') },
  { name: 'File', file: resolveDts('fumadocs-ui', 'dist/components/files.d.ts') },
  {
    name: 'ImageZoom',
    file: resolveDts('fumadocs-ui', 'dist/components/image-zoom.d.ts'),
  },
  { name: 'Banner', file: resolveDts('fumadocs-ui', 'dist/components/banner.d.ts') },
  {
    name: 'TypeTable',
    file: resolveDts('fumadocs-ui', 'dist/components/type-table.d.ts'),
  },
  {
    name: 'InlineTOC',
    file: resolveDts('fumadocs-ui', 'dist/components/inline-toc.d.ts'),
  },
];

/**
 * FR-28: Emit diagnostic warnings for known react-docgen-typescript extraction failures.
 */
function emitExtractionDiagnostic(
  componentName: string,
  sourceFile: string,
  extractedCount: number,
): void {
  if (extractedCount > 0) return;

  let source: string;
  try {
    source = fs.readFileSync(sourceFile, 'utf8');
  } catch {
    return;
  }

  // Only warn if the source declares a non-trivial Props interface
  if (!/\b(interface|type)\s+\w+Props\b/.test(source)) return;

  const suspectedReasons: string[] = [];
  if (/\bforwardRef\s*</.test(source) || /ForwardRefExoticComponent/.test(source)) {
    suspectedReasons.push('forwardRef wrapper (Storybook Issue #15334 — partial extraction)');
  }
  if (/\b(Omit|Pick)\s*</.test(source)) {
    suspectedReasons.push(
      'Omit<>/Pick<> utility types (Storybook Issue #14798 — props may be silently dropped)',
    );
  }
  if (/<\s*T\s*[,>]/.test(source)) {
    suspectedReasons.push(
      'generic <T> parameter (community-confirmed unresolvable without instantiation hints)',
    );
  }

  console.warn(
    JSON.stringify({
      event: 'component-extraction-empty',
      component: componentName,
      sourceFile,
      suspectedReasons: suspectedReasons.length > 0 ? suspectedReasons : ['unknown'],
      suggestion:
        'Hand-author a PropDef[] override in packages/core/src/registry/built-ins.ts ' +
        'for this component. Empty auto-extraction registers an empty PropPanel, which ' +
        'is typically a misconfiguration signal rather than intentional.',
    }),
  );
}

// Extract and generate
interface GeneratedProp {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string | boolean | number;
  enumValues?: string[];
}

const results: Record<string, GeneratedProp[]> = {};

for (const src of sources) {
  try {
    const docs = parser.parse(src.file);
    const match = docs.find((d) => d.displayName === src.name);

    if (!match) {
      emitExtractionDiagnostic(src.name, src.file, 0);
      results[src.name] = [];
      continue;
    }

    const props: GeneratedProp[] = [];
    for (const [propName, propInfo] of Object.entries(match.props)) {
      const mappedType = mapType(propInfo.type.name);
      if (!mappedType) continue;

      const prop: GeneratedProp = {
        name: propName,
        type: mappedType,
        required: propInfo.required,
        description: propInfo.description || '',
      };

      if (propInfo.defaultValue?.value !== undefined) {
        const raw = propInfo.defaultValue.value;
        // Coerce string representations to proper types
        if (mappedType === 'boolean') {
          prop.defaultValue = raw === 'true' || raw === true;
        } else if (mappedType === 'number') {
          prop.defaultValue = Number(raw);
        } else {
          prop.defaultValue = raw;
        }
      }

      if (mappedType === 'enum') {
        prop.enumValues = extractEnumValues(propInfo.type.name);
      }

      props.push(prop);
    }

    emitExtractionDiagnostic(src.name, src.file, props.length);
    results[src.name] = props;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'component-extraction-error',
        component: src.name,
        error: String(err),
      }),
    );
    results[src.name] = [];
  }
}

// Write output
const lines: string[] = [
  '// Auto-generated by packages/core/scripts/build-registry.ts',
  '// Do not edit manually. Re-run: bun run build-registry',
  '//',
  `// Source components: ${sources.length}`,
  '',
  'import type { PropDef } from "../registry/types.ts";',
  '',
];

for (const [name, props] of Object.entries(results)) {
  lines.push(`export const ${name}Props: PropDef[] = ${JSON.stringify(props, null, 2)};`);
  lines.push('');
}

lines.push('export const generatedComponentProps: Record<string, PropDef[]> = {');
for (const name of Object.keys(results)) {
  lines.push(`  ${name}: ${name}Props,`);
}
lines.push('};');
lines.push('');

fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
console.log(`✓ Generated ${OUTPUT} with ${Object.keys(results).length} component definitions`);
