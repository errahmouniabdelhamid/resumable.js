import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'js/index.js'),
      name: 'ResumableLivewire',
      formats: ['es', 'umd'],
      fileName: (format) => `resumable-livewire.${format}.js`
    },
    rollupOptions: {
      // Make sure to externalize deps that shouldn't be bundled
      external: [],
      output: {
        exports: 'named',
        // Provide global variables to use in the UMD build
        globals: {}
      }
    },
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },
  server: {
    port: 3000,
  },
});
