import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['jspdf', 'jspdf-autotable', 'qrcode'],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Aumentar o limite de aviso para chunks grandes
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Configurar chunking manual para otimização
        manualChunks: {
          // Vendor chunks separados
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@tanstack/react-table', 'framer-motion', 'react-hot-toast'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-calendar': [
            '@fullcalendar/react', 
            '@fullcalendar/daygrid', 
            '@fullcalendar/timegrid', 
            '@fullcalendar/interaction',
            '@fullcalendar/core'
          ],
          'vendor-utils': ['lucide-react', 'sweetalert2', 'lodash'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable', 'qrcode']
        }
      }
    }
  }
});
