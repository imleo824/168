import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const config = {
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  build: {
    target: 'es2022',
    minify: 'esbuild' as const,
    cssMinify: true,
    cssCodeSplit: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'react-router-dom', 'scheduler'],
          query: ['@tanstack/react-query'],
          'date-vendor': ['date-fns'],
        },
      },
    },
  },

  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: true as const,
  },
} satisfies UserConfig;

export default defineConfig(({ command }) => {
  if (command === 'build') {
    process.env.NODE_ENV = 'production';
  }
  return config;
});
