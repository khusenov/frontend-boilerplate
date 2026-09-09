import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    files: ['./src/features/sign-in/**', './src/features/update-user-name/**'],
    rules: {
      // Each reference feature is consumed by exactly one page, which is what the rule flags.
      // It targets premature slicing; a screen that genuinely has one home is not that.
      'fsd/insignificant-slice': 'off',
    },
  },
]);
