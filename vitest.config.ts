import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tinyland-offer-builder',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
