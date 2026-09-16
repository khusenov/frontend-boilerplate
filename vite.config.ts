import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const routerPlugin = tanstackRouter({
  target: 'react',
  routesDirectory: './src/app/routes',
  generatedRouteTree: './src/app/router/route-tree.gen.ts',
  routeFileIgnorePattern: '\\.test\\.tsx?$',
  autoCodeSplitting: true,
  quoteStyle: 'single',
  semicolons: true,
});

export default defineConfig(({ mode }) => ({
  plugins: [...(mode === 'test' ? [] : [routerPlugin]), react(), tailwindcss()],
  server: {
    proxy: {
      '/v1': 'http://localhost:8000',
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    css: { include: [/theme\.css\?raw$/] },
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Vitest matches these with picomatch `contains: true`, so every pattern is unanchored:
      // one ending `.ts` also matches its `.tsx` sibling. Keep this list minimal and let
      // scripts/verify-coverage-scope.mjs prove nothing escaped.
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', '**/*.d.ts', 'src/app/router/route-tree.gen.ts'],
      thresholds: {
        perFile: true,
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
}));
