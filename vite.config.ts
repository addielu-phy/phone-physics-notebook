import { defineConfig } from 'vite';

// GitHub Pages 部署時由 workflow 設定 BASE_PATH=/<repo>/；本機預設為相對路徑。
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  server: { host: true },
  preview: { host: true, port: 4173, allowedHosts: true },
  build: { chunkSizeWarningLimit: 1500 },
});
