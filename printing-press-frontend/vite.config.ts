import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@modules': path.resolve(__dirname, '../modules'),
      '@core': path.resolve(__dirname, 'src'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
      '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query'),
      'axios': path.resolve(__dirname, 'node_modules/axios'),
      'qrcode.react': path.resolve(__dirname, 'node_modules/qrcode.react'),
      'socket.io-client': path.resolve(__dirname, 'node_modules/socket.io-client'),
    },
  },
  server: {
    host: true, // Listen on all local IPs
    fs: {
      allow: ['..'] // Allow serving files outside of printing-press-frontend
    },
    proxy: {
      '/api': {
        target: 'http://localhost:28',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:28',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:28',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})

