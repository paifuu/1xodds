import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

const single = process.env.DEMO_SINGLEFILE === '1';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  define: { __DEMO_ONLY__: JSON.stringify(single) },
  build: { outDir: single ? 'dist-demo' : 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/feed': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' } },
});
