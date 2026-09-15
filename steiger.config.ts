import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    files: [
      './src/features/sign-in/**',
      './src/features/sign-out/**',
      './src/features/switch-locale/**',
      './src/features/update-user-name/**',
    ],
    rules: {
      // Each of these features has exactly one consuming slice, which is what the rule flags.
      // It targets premature slicing; a feature with one genuine host is not that.
      'fsd/insignificant-slice': 'off',
    },
  },
]);
