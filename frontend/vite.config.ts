import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_URL || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // O alias `@/` espelha o `paths` do tsconfig: imports curtos e estáveis.
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Necessário para funcionar atrás de proxies/previews (ex.: *.e2b.app).
    allowedHosts: true,
    proxy: {
      // Toda chamada /api é resolvida pelo servidor de dev: o navegador nunca
      // precisa conhecer o endereço do backend (evita CORS e expõe menos).
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
} as never);
