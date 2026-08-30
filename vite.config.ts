import { defineConfig } from 'vite';
import ts from 'typescript';

export default defineConfig({
  root: 'ui',
  server: {
    port: 4173,
    host: 'localhost'
  },
  build: {
    outDir: '../dist/ui'
  },
  clearScreen: false
});
