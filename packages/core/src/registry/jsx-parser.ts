/**
 * JSX parser using acorn + acorn-jsx.
 *
 * Parses a raw JSX string into structured { componentName, props, childrenString }.
 * Returns null when the JSX contains non-primitive expression props (arrow functions,
 * variables, nested JSX in props) — those fall back to the unregistered void renderer.
 */
import * as acorn from 'acorn';
import acornJsx from 'acorn-jsx';

const jsxParser = acorn.Parser.extend(acornJsx());

export interface ParsedJsx {
  componentName: string;
  props: Record<string, string | boolean | number>;
  childrenString: string;
}

/**
 * Parse a raw JSX string into structured data.
 *
 * Returns null if:
 * - The input is not valid JSX
 * - Any prop has a non-primitive expression value (arrow functions, variables, etc.)
 */
export function parseJsx(source: string): ParsedJsx | null {
  // biome-ignore lint/suspicious/noExplicitAny: acorn AST is untyped
  let ast: any;
  try {
    ast = jsxParser.parse(source, {
      ecmaVersion: 2020,
      sourceType: 'module',
    });
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    console.error('[parseJsx] Unexpected parser error:', err);
    return null;
  }

  const body = ast.body;
  if (!body || body.length === 0) return null;

  const stmt = body[0];
  if (stmt.type !== 'ExpressionStatement') return null;

  const expr = stmt.expression;
  if (expr.type !== 'JSXElement') return null;

  const opening = expr.openingElement;
  if (!opening.name || opening.name.type !== 'JSXIdentifier') return null;

  const componentName = opening.name.name;
  const props: Record<string, string | boolean | number> = {};

  for (const attr of opening.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    if (!attr.name || attr.name.type !== 'JSXIdentifier') continue;

    const name = attr.name.name;

    // Boolean shorthand: <Component fullWidth>
    if (attr.value === null || attr.value === undefined) {
      props[name] = true;
      continue;
    }

    // String literal: <Component type="warning">
    if (attr.value.type === 'Literal' || attr.value.type === 'StringLiteral') {
      const v = attr.value.value;
      if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
        props[name] = v;
        continue;
      }
      // Non-primitive literal (null, RegExp, bigint) → void fallback
      return null;
    }

    // Expression container: <Component count={42}>
    if (attr.value.type === 'JSXExpressionContainer') {
      const exprValue = attr.value.expression;

      // Primitive literal: {42}, {true}, {"string"}
      if (exprValue.type === 'Literal') {
        const v = exprValue.value;
        if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
          props[name] = v;
          continue;
        }
        // Non-primitive literal (null, RegExp, bigint) → void fallback
        return null;
      }

      // Unary expression for negative numbers: {-1}
      if (
        exprValue.type === 'UnaryExpression' &&
        exprValue.operator === '-' &&
        exprValue.argument.type === 'Literal' &&
        typeof exprValue.argument.value === 'number'
      ) {
        props[name] = -exprValue.argument.value;
        continue;
      }

      // Any other expression (arrow fn, variable, nested JSX, etc.)
      // → this component should fall back to unregistered
      return null;
    }
  }

  // Extract children string from source positions
  let childrenString = '';
  if (!opening.selfClosing && expr.closingElement) {
    childrenString = source.slice(opening.end, expr.closingElement.start);
  }

  return { componentName, props, childrenString };
}
