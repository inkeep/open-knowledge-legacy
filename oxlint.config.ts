import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
  },
  jsPlugins: ['oxlint-plugin-eslint'],
  rules: {
    'eslint-js/no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.name='useEffect'] UnaryExpression[operator='typeof'] > Identifier[name='window']",
        message:
          "Do not use `typeof window !== 'undefined'` inside useEffect; useEffect already runs client-side.",
      },
      {
        selector:
          "CallExpression[callee.name='useLayoutEffect'] UnaryExpression[operator='typeof'] > Identifier[name='window']",
        message:
          "Do not use `typeof window !== 'undefined'` inside useLayoutEffect; useLayoutEffect already runs client-side.",
      },
    ],
    'typescript/no-floating-promises': 'off',
    'eslint/no-unsafe-optional-chaining': 'off',
    'typescript/await-thenable': 'off',
    'typescript/no-implied-eval': 'off',
    'unicorn/no-invalid-fetch-options': 'off',
    'typescript/restrict-template-expressions': 'off',
    'typescript/no-base-to-string': 'off',
    'typescript/unbound-method': 'off',
    'typescript/no-misused-spread': 'off',
    'typescript/no-this-alias': 'off',
    'typescript/no-duplicate-type-constituents': 'off',
    'typescript/no-meaningless-void-operator': 'off',
    'typescript/require-array-sort-compare': 'off',
    'typescript/no-redundant-type-constituents': 'off',
    'unicorn/no-new-array': 'off',
    'eslint/no-shadow-restricted-names': 'off',
    'eslint/no-empty-pattern': 'off',
    'unicorn/no-empty-file': 'off',
    'eslint/no-control-regex': 'off',
    'oxc/erasing-op': 'off',
    'typescript/no-useless-default-assignment': 'off',
    'typescript/prefer-as-const': 'off',
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx}'],
      rules: {
        'typescript/no-deprecated': 'error',
      },
    },
  ],
});
