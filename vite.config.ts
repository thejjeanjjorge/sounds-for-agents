import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'playground-dist' },
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
});
