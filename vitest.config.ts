import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));


export default defineConfig({
  root: __dirname,
  test: {
    name: 'tinyland-offer-builder',
    root: __dirname,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
