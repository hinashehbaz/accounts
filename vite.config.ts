import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/accounts/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});