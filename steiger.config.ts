import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    files: ['./src/features/update-user-name/**'],
    rules: {
      // The template ships one reference feature on purpose; the rule targets
      // premature slicing, which a deliberate single example is not.
      'fsd/insignificant-slice': 'off',
    },
  },
]);
