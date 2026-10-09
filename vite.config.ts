import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  preview: { host: true, port: 4173, allowedHosts: true },
  build: { chunkSizeWarningLimit: 1500 },
});
