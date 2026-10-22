import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ponte = fileURLToPath(new URL('./react-native-web-ponte.js', import.meta.url));
// react-native-svg sul web cerca il registro delle immagini di React Native: sul web è quello di react-native-web.
const registro = fileURLToPath(new URL('./node_modules/react-native-web/dist/modules/AssetRegistry/index.js', import.meta.url));
const sostituzioni = { 'react-native': ponte, '@react-native/assets-registry/registry': registro };

// Versione web dell'app: react-native diventa react-native-web.
// In sviluppo /api va all'API in Docker (porta 3000), così non servono permessi tra domini.
// Prima si cercano i file .web.* (le librerie React Native li usano per la versione web).
const estensioni = ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'];

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(mode),
    global: 'globalThis',
  },
  resolve: {
    alias: [{ find: /^react-native$/, replacement: ponte }, { find: '@react-native/assets-registry/registry', replacement: registro }],
    extensions: estensioni,
  },
  optimizeDeps: {
    include: ['react-native-web', 'react-native-svg', 'lucide-react-native', '@react-navigation/native'],
    rolldownOptions: { resolve: { extensions: estensioni, alias: sostituzioni } },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_INDIRIZZO ?? 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
}));
