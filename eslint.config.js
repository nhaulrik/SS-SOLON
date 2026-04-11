import js from '@eslint/js';
import globals from 'globals';

export default [
  // All server code
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console':     'off'   // server logging is intentional
    }
  },

  // Test files get vitest globals in addition to node
  {
    files: ['server/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it:       'readonly',
        expect:   'readonly',
        beforeAll: 'readonly',
        afterAll:  'readonly',
        beforeEach: 'readonly'
      }
    }
  }
];
