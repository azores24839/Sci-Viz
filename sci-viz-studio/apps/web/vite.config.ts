/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [react()],
  server: {
    port: 5178,
    proxy: { '/api': 'http://127.0.0.1:3011' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
