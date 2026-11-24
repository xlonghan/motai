import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { modernFontAssets } from './scripts/modern-fonts.mjs';

export default defineConfig({
  plugins: [modernFontAssets(),vue()],
  base: './',
  server: { host: '127.0.0.1', port: 4318, strictPort: true },
  build: {
    chunkSizeWarningLimit: 2200,
    rolldownOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), pdf: fileURLToPath(new URL('./pdf.html', import.meta.url)), splash: fileURLToPath(new URL('./splash.html', import.meta.url)) } },
  },
});
