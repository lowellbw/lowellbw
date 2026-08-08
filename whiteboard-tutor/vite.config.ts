import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Excalidraw reads process.env.NODE_ENV in a few places
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
});
