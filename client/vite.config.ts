import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [basicSsl(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
