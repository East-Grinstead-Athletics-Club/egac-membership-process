/** @type {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray} */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Enforce no unused variables — catches dead code early
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Prevent accidental any — use unknown instead
    '@typescript-eslint/no-explicit-any': 'warn',
    // Require explicit return types on exported functions
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Allow non-null assertions where we've verified the value
    '@typescript-eslint/no-non-null-assertion': 'warn',
    // Standard JS rules
    'no-console': 'off',        // Workers use console for structured logging
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
  },
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.wrangler/',
    '.astro/',
    '*.js',           // Ignore compiled output
  ],
};
