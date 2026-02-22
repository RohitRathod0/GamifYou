import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        exclude: ['@mediapipe/selfie_segmentation'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        https: {
            key: fs.readFileSync('./certs/key.pem'),
            cert: fs.readFileSync('./certs/cert.pem'),
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://localhost:8000',
                ws: true,
                changeOrigin: true,
            },
            '/replicate-api': {
                target: 'https://api.replicate.com',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/replicate-api/, ''),
            },
        },
    },
})