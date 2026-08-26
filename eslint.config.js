import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import pluginQuery from '@tanstack/eslint-plugin-query';
import pluginRouter from '@tanstack/eslint-plugin-router';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'src/app/router/route-tree.gen.ts'],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/internal-regex': '^@/',
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'vitest.setup.ts'],
    extends: [
      eslintReact.configs['recommended-typescript'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    extends: [vitest.configs.recommended],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...pluginQuery.configs['flat/recommended']],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...pluginRouter.configs['flat/recommended']],
  },
  {
    files: ['src/app/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['eslint.config.js', 'vite.config.ts', 'steiger.config.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // steiger types as `any` here: its .d.ts needs @steiger/toolkit, whose vitest peer stops at 3.
  {
    files: ['steiger.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/shared/(lib|ui)$',
              message: 'Import the group, not the segment: @/shared/lib/<group>.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/{entities,features,widgets,pages,shared}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/shared/api',
              importNames: ['createHttpClient', 'createQueryClient'],
              message:
                'Construct the transport only in the app layer. Reach it with useHttpClient().',
            },
            {
              name: '@tanstack/react-router',
              allowImportNames: ['Link'],
              message:
                'Route state stays in src/app/routes. Below app, take props and callbacks; only <Link> is importable here.',
            },
          ],
          patterns: [
            {
              regex: '^@/shared/(lib|ui)$',
              message: 'Import the group, not the segment: @/shared/lib/<group>.',
            },
            {
              regex: '^@/shared/api/',
              message:
                'Import the segment public API: @/shared/api. steiger skips same-layer imports, so this is the only gate on a shared-to-shared sidestep.',
            },
            {
              regex: '^@tanstack/(react-)?router-core',
              message: 'Route state stays in src/app/routes.',
            },
            {
              regex: '^@tanstack/react-router/',
              message: 'Import the package root. Route state stays in src/app/routes.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/**', '!@/app', './*/**', '../**'],
              message:
                'src/main.tsx sits outside the FSD layer system and steiger cannot analyse it. Import only the app layer public API: @/app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/{routes,router}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/shared/api',
              importNames: ['createHttpClient', 'createQueryClient'],
              message:
                'Route and router modules receive the transport through the router context. Only app/entrypoint constructs clients.',
            },
            {
              name: 'axios',
              message:
                'Only shared/api knows about axios. Route and router modules use the HttpClient port.',
            },
          ],
          patterns: [
            {
              regex: '^@/shared/(lib|ui)$',
              message: 'Import the group, not the segment: @/shared/lib/<group>.',
            },
            {
              regex: '^@/shared/api/',
              message: 'Import the segment public API: @/shared/api.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Program > :not(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration)',
          message:
            'A public API barrel may contain only import and export declarations. src/**/index.ts is excluded from coverage, so logic placed here escapes measurement.',
        },
        {
          selector: 'ExportNamedDeclaration[declaration]',
          message:
            'A public API barrel re-exports, it does not declare. Move the declaration into a module and re-export it from here.',
        },
      ],
    },
  },
  prettier,
);
