/**
 * Dev-time script: extract prop schemas from built-in component .d.ts/.tsx files
 * via react-docgen-typescript and write the manifest to packages/core/src/generated/components.ts.
 *
 * Run: bun run build-registry (from repo root or packages/core)
 * Never imported at runtime. Lives in packages/core/devDependencies only.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { withDefaultConfig } from 'react-docgen-typescript';
import { BUILT_INS } from '../src/registry/built-ins.ts';
import type { ComponentMeta, PropDef } from '../src/registry/types.ts';

const parser = withDefaultConfig({
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  skipChildrenPropWithoutDoc: false, // CRITICAL: include children (A1)
  propFilter: (prop) => {
    // Filter ONLY @types/react inherited DOM props, NOT all node_modules.
    // A blanket `node_modules` filter would drop fumadocs-ui's own props
    // because they live in node_modules/fumadocs-ui/dist/*.d.ts.
    if (prop.parent?.fileName.includes('@types/react')) return false;
    if (prop.parent?.fileName.includes('node_modules/react/')) return false;
    // Hide callback props (onClick, onChange, etc.)
    if (prop.type.name.startsWith('(')) return false;
    return true;
  },
});

/**
 * Map a react-docgen-typescript type string to our simplified PropDef type system.
 */
function mapType(
  typeName: string,
  values?: { value: string }[],
): { type: PropDef['type']; enumValues?: string[] } | null {
  // ReactNode / React.ReactNode
  if (typeName === 'ReactNode' || typeName === 'React.ReactNode') {
    return { type: 'reactnode' };
  }

  // Enum unions: "a" | "b" | "c"
  if (values && values.length > 0) {
    return {
      type: 'enum',
      enumValues: values.map((v) => v.value.replace(/^["']|["']$/g, '')),
    };
  }

  // Primitives
  if (typeName === 'string') return { type: 'string' };
  if (typeName === 'boolean') return { type: 'boolean' };
  if (typeName === 'number') return { type: 'number' };

  // Everything else is hidden from the panel
  return null;
}

// Collect unique source files (some entries share a file, e.g. Card + Cards)
const uniqueFiles = [...new Set(BUILT_INS.map((entry) => entry.sourceFile))];

// Parse all source files
const allDocs = parser.parse(uniqueFiles);

// Build the manifest
const manifest: Record<string, ComponentMeta> = {};

for (const entry of BUILT_INS) {
  // Find the extracted doc matching this component name
  const doc = allDocs.find((d) => d.displayName === entry.name);

  if (!doc) {
    console.warn(
      `WARNING: No react-docgen-typescript output for "${entry.name}" from ${entry.sourceFile}. ` +
        `Component will have zero props in manifest.`,
    );
  }

  // Build PropDef array from extracted props
  const props: PropDef[] = [];
  if (doc) {
    for (const [propName, propInfo] of Object.entries(doc.props)) {
      const mapped = mapType(
        propInfo.type.name,
        propInfo.type.value as { value: string }[] | undefined,
      );
      if (!mapped) continue; // Skip complex types

      const propDef: PropDef = {
        name: propName,
        type: mapped.type,
        required: propInfo.required,
      };

      if (propInfo.defaultValue?.value != null) {
        const dv = propInfo.defaultValue.value;
        if (mapped.type === 'boolean') {
          propDef.defaultValue = dv === 'true';
        } else if (mapped.type === 'number') {
          propDef.defaultValue = Number(dv);
        } else {
          propDef.defaultValue = String(dv).replace(/^["']|["']$/g, '');
        }
      }

      if (mapped.enumValues) {
        propDef.enumValues = mapped.enumValues;
      }

      if (propInfo.description) {
        propDef.description = propInfo.description;
      }

      props.push(propDef);
    }
  }

  manifest[entry.name] = {
    props,
    displayName: entry.displayName,
    category: entry.category,
    ...(entry.icon ? { icon: entry.icon } : {}),
  };
}

// Serialize as a TypeScript file
const output = `// GENERATED FROM packages/core/src/registry/built-ins.ts + react-docgen-typescript.
// Do not edit by hand. Run \`bun run build-registry\` to regenerate.
import type { ComponentMeta } from '../registry/types.ts';

export const componentManifest: Record<string, ComponentMeta> = ${JSON.stringify(manifest, null, 2)};
`;

const outPath = path.join(import.meta.dir, '../src/generated/components.ts');
writeFileSync(outPath, output);
console.log(`Wrote ${Object.keys(manifest).length} components to ${outPath}`);

// Report summary
for (const [name, meta] of Object.entries(manifest)) {
  const propSummary = meta.props.map((p) => `${p.name}:${p.type}`).join(', ');
  console.log(`  ${name}: ${propSummary || '(no extractable props)'}`);
}
