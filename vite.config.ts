import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

import { createSecurityHeaders, readPolicySources } from './scripts/security-headers.ts';

const routerPlugin = tanstackRouter({
  target: 'react',
  routesDirectory: './src/app/routes',
  generatedRouteTree: './src/app/router/route-tree.gen.ts',
  routeFileIgnorePattern: '\\.test\\.tsx?$',
  autoCodeSplitting: true,
  quoteStyle: 'single',
  semicolons: true,
});

function createPreviewSecurityHeaders(mode: string): Record<string, string> {
  const { VITE_API_BASE_URL } = loadEnv(mode, import.meta.dirname, 'VITE_');

  return createSecurityHeaders(
    readPolicySources({
      indexHtmlPath: path.join(import.meta.dirname, 'dist', 'index.html'),
      apiBaseUrl: VITE_API_BASE_URL,
    }),
  );
}

export default defineConfig(({ mode, isPreview = false }) => ({
  plugins: [...(mode === 'test' ? [] : [routerPlugin]), react(), tailwindcss()],
  server: {
    proxy: {
      '/v1': 'http://localhost:8000',
    },
  },
  preview: isPreview ? { headers: createPreviewSecurityHeaders(mode) } : {},
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
