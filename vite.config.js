import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.VITE_OUT_DIR || 'dist-build';
const distDir = join(rootDir, outDir);
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:18888';

function copyLegacyRuntime() {
  const entries = ['index.html', 'login.html', 'css', 'js', 'pages', 'images'];

  return {
    name: 'copy-legacy-runtime',
    closeBundle() {
      mkdirSync(distDir, { recursive: true });

      for (const entry of entries) {
        const from = join(rootDir, entry);
        if (!existsSync(from)) continue;
        cpSync(from, join(distDir, entry), { recursive: true });
      }
    }
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [copyLegacyRuntime()],
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: 'js/bootstrap.js'
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': apiProxyTarget
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/api': apiProxyTarget
    }
  }
});
