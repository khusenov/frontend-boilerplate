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

const SESSION_CONSTRUCTOR_NAMES = [
  'createSessionApi',
  'createSessionEnder',
  'createSessionResolver',
  'createSessionStarter',
  'createSessionStore',
  'createSessionTokenSource',
];

const LOWER_LAYER_IMPORT_PATHS = [
  {
    name: '@/shared/api',
    importNames: ['createHttpClient', 'createQueryClient'],
    message: 'Construct the transport only in the app layer. Reach it with useHttpClient().',
  },
  {
    name: '@tanstack/react-router',
    allowImportNames: ['Link'],
    message:
      'Route state stays in src/app/routes. Below app, take props and callbacks; only <Link> is importable here.',
  },
  {
    name: '@/shared/i18n',
    importNames: ['createI18n'],
    message:
      'Construct the i18n instance only in the app layer. Reach it with useTranslation() or useLocale().',
  },
  {
    name: '@/shared/observability',
    allowTypeImports: true,
    message:
      'Construct the error reporter only in the app layer. Below app, take an ErrorReporter as a prop or a factory argument.',
  },
  {
    name: '@/entities/session',
    importNames: SESSION_CONSTRUCTOR_NAMES,
    message:
      'Construct the session only in the app layer. Read it through SessionObserver, or start one with useSessionStarter().',
  },
];

const LOWER_LAYER_IMPORT_PATTERNS = [
  {
    regex: '^@/shared/(lib|ui)$',
    message: 'Import the group, not the segment: @/shared/lib/<group>.',
  },
  {
    regex: '^@/shared/(lib|ui)/[^/]+/.+',
    message: 'Import the group public API: @/shared/lib/<group>, not a file inside it.',
  },
  {
    regex: '^@/shared/api/',
    message:
      'Import the segment public API: @/shared/api. steiger skips same-layer imports, so this is the only gate on a shared-to-shared sidestep.',
  },
  {
    regex: '^@/shared/observability/',
    message: 'Import the segment public API: @/shared/observability.',
  },
  {
    regex: '^@tanstack/(react-)?router-core',
    message: 'Route state stays in src/app/routes.',
  },
  {
    regex: '^@tanstack/react-router/',
    message: 'Import the package root. Route state stays in src/app/routes.',
  },
];

const I18N_VENDOR_IMPORT_PATHS = [
  {
    name: 'react-i18next',
    message: 'Reach i18n through @/shared/i18n, which re-exports Trans and useTranslation.',
  },
  { name: 'i18next', allowTypeImports: true, message: 'Only shared/i18n knows about i18next.' },
  { name: 'i18next-browser-languagedetector', message: 'Only shared/i18n knows about i18next.' },
  { name: 'i18next-resources-to-backend', message: 'Only shared/i18n knows about i18next.' },
];

const FORM_VENDOR_IMPORT_PATHS = [
  {
    name: '@tanstack/react-form',
    allowTypeImports: true,
    message:
      'Only shared/ui/form knows about TanStack Form. Build forms with useAppForm from @/shared/ui/form.',
  },
];

const FORM_VENDOR_IMPORT_PATTERNS = [
  {
    regex: '^@tanstack/(form-core|react-store)',
    message:
      'Only shared/ui/form knows about TanStack Form. Reaching its internals sidesteps the accessible field components.',
  },
];

const TRANSPORT_VENDOR_IMPORT_PATHS = [
  {
    name: 'axios',
    message:
      'Only shared/api knows about axios. Reach the network through the HttpClient port, which validates every response against a schema.',
  },
];

const ERROR_BOUNDARY_VENDOR_IMPORT_PATHS = [
  {
    name: 'react-error-boundary',
    message:
      'Only shared/ui/error-boundary knows about react-error-boundary. Wrap a subtree with ErrorBoundary from @/shared/ui/error-boundary.',
  },
];

const VALIDATOR_IMPORT_PATTERNS = [
  {
    regex: '^(zod|valibot|arktype|yup|joi|superstruct)(/|$)',
    message:
      'This seam validates through Standard Schema, never a concrete validator. Schemas belong to the consuming slice.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'blob-report',
      'src/app/router/route-tree.gen.ts',
    ],
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
          paths: [...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS],
          patterns: [
            {
              regex: '^@/shared/(lib|ui)$',
              message: 'Import the group, not the segment: @/shared/lib/<group>.',
            },
            {
              regex: '^@/shared/(lib|ui)/[^/]+/.+',
              message: 'Import the group public API: @/shared/lib/<group>, not a file inside it.',
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
            ...LOWER_LAYER_IMPORT_PATHS,
            ...I18N_VENDOR_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...TRANSPORT_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [...LOWER_LAYER_IMPORT_PATTERNS, ...FORM_VENDOR_IMPORT_PATTERNS],
        },
      ],
    },
  },
  {
    files: ['src/{entities,features,widgets,pages}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...LOWER_LAYER_IMPORT_PATHS,
            ...I18N_VENDOR_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...TRANSPORT_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [
            ...LOWER_LAYER_IMPORT_PATTERNS,
            ...FORM_VENDOR_IMPORT_PATTERNS,
            {
              regex: '^@/(entities|features|widgets|pages)/[^/]+/(?!@x/).+',
              message:
                'Import the slice public API: @/<layer>/<slice> — or a relative path within your own slice. Cross-slice imports go through @x.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/i18n/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...LOWER_LAYER_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...TRANSPORT_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [...LOWER_LAYER_IMPORT_PATTERNS, ...FORM_VENDOR_IMPORT_PATTERNS],
        },
      ],
    },
  },
  // Flat config replaces rather than merges no-restricted-imports options, so the four blocks
  // below are order-sensitive. src/shared/api/** must follow the src/{...,shared}/** block to
  // lift the axios ban for the one segment that owns axios; its *.test.* twin must follow that
  // to lift the validator ban for tests; and the form block must stay last among blocks matching
  // src/shared/ui/form/**. A src/shared/** block appended below would silently kill that form
  // exemption, and nothing tests the flat config.
  // The src/shared/ui/error-boundary/** block follows the same rule: it must sit after the
  // src/{...,shared}/** block to lift the react-error-boundary ban for the one group that owns the
  // vendor. Its glob does not overlap src/shared/ui/form/**, so it is safe beside the form block.
  {
    files: ['src/shared/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...LOWER_LAYER_IMPORT_PATHS,
            ...I18N_VENDOR_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [
            ...LOWER_LAYER_IMPORT_PATTERNS,
            ...FORM_VENDOR_IMPORT_PATTERNS,
            ...VALIDATOR_IMPORT_PATTERNS,
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/api/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...LOWER_LAYER_IMPORT_PATHS,
            ...I18N_VENDOR_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [...LOWER_LAYER_IMPORT_PATTERNS, ...FORM_VENDOR_IMPORT_PATTERNS],
        },
      ],
    },
  },
  {
    files: ['src/shared/ui/form/**/*.{ts,tsx}'],
    ignores: ['src/shared/ui/form/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...LOWER_LAYER_IMPORT_PATHS,
            ...I18N_VENDOR_IMPORT_PATHS,
            ...TRANSPORT_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [...LOWER_LAYER_IMPORT_PATTERNS, ...VALIDATOR_IMPORT_PATTERNS],
        },
      ],
    },
  },
  {
    files: ['src/shared/ui/error-boundary/**/*.{ts,tsx}'],
    ignores: ['src/shared/ui/error-boundary/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...LOWER_LAYER_IMPORT_PATHS,
            ...I18N_VENDOR_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...TRANSPORT_VENDOR_IMPORT_PATHS,
          ],
          patterns: [...LOWER_LAYER_IMPORT_PATTERNS, ...FORM_VENDOR_IMPORT_PATTERNS],
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
          paths: [...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS],
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
            {
              name: '@/shared/i18n',
              importNames: ['createI18n'],
              message:
                'Route and router modules receive i18n through the provider tree. Only app/entrypoint constructs instances.',
            },
            {
              name: '@/shared/observability',
              allowTypeImports: true,
              message:
                'Route and router modules receive the error reporter through props or context. Only app/entrypoint constructs one.',
            },
            {
              name: '@/entities/session',
              importNames: SESSION_CONSTRUCTOR_NAMES,
              message:
                'Route and router modules receive the session through the provider tree. Only app/entrypoint constructs one.',
            },
            ...I18N_VENDOR_IMPORT_PATHS,
            ...FORM_VENDOR_IMPORT_PATHS,
            ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
          ],
          patterns: [
            {
              regex: '^@/shared/(lib|ui)$',
              message: 'Import the group, not the segment: @/shared/lib/<group>.',
            },
            {
              regex: '^@/shared/(lib|ui)/[^/]+/.+',
              message: 'Import the group public API: @/shared/lib/<group>, not a file inside it.',
            },
            {
              regex: '^@/shared/api/',
              message: 'Import the segment public API: @/shared/api.',
            },
            {
              regex: '^@/shared/observability/',
              message: 'Import the segment public API: @/shared/observability.',
            },
            {
              regex: '^@/(entities|features|widgets|pages)/[^/]+/(?!@x/).+',
              message:
                'Import the slice public API: @/<layer>/<slice>. Cross-slice imports go through @x.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/**', '**/src/**'],
              message:
                'End-to-end tests observe the running application through the browser, not through its source. Importing src couples the suite to the implementation it exists to verify independently: sharing UserDto would make a wire-shape rename update both sides at once and keep these tests green while production broke.',
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
            'A public API barrel may contain only import and re-export declarations — no export default, no statements. The barrel is the slice public API; logic placed here is unreachable through the slice contract and untestable in isolation.',
        },
        {
          selector: 'ExportNamedDeclaration[declaration]',
          message:
            'A public API barrel re-exports, it does not declare. Move the declaration into a module and re-export it from here.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  prettier,
);
