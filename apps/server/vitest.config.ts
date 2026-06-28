import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@domain':         path.resolve(__dirname, 'src/domain'),
      '@application':    path.resolve(__dirname, 'src/application'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@presentation':   path.resolve(__dirname, 'src/presentation'),
      '@shared':         path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    tsconfig:    './tsconfig.test.json',
  },
});
