import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'off',
  },
  options: {
    typeAware: true,
  },
  jsPlugins: ['oxlint-plugin-eslint'],
  rules: {
    'unicorn/no-useless-fallback-in-spread': 'error',
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
