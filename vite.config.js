import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'


// Function to resolve the absolute path to a package (for stability)
function resolvePackage(pkg) {
  try {
    return path.resolve(__dirname, 'node_modules', pkg);
  } catch (e) {
    return pkg;
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      'react': resolvePackage('react'),
      'react-dom': resolvePackage('react-dom'),
    },
  },
  server: {
    // CRITICAL FIX: Run on port 5000 to match the backend, eliminating CORS checks.
    host: true,
    port: 5000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000', // <-- CRITICAL: Change to 4000
        changeOrigin: true,
        secure: false,
      }
    }
  }
});

