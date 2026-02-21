import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import os from 'os'

function networkDiscoveryPlugin(): Plugin {
  return {
    name: 'network-discovery',
    configureServer(server) {
      server.middlewares.use('/api/discovery', (_req, res) => {
        const interfaces = os.networkInterfaces();
        const virtualPrefixes = ['docker', 'br-', 'veth', 'virbr', 'tun', 'tap'];
        const addresses: { ip: string; subnet: string; name: string }[] = [];

        for (const [name, iface] of Object.entries(interfaces)) {
          if (!iface) continue;
          if (virtualPrefixes.some((p) => name.toLowerCase().startsWith(p))) continue;
          for (const info of iface) {
            if (info.family === 'IPv4' && !info.internal) {
              const ipParts = info.address.split('.');
              const maskParts = info.netmask.split('.');
              const subnet = ipParts.map((p, i) => (Number(p) & Number(maskParts[i])).toString()).join('.');
              addresses.push({ ip: info.address, subnet, name });
            }
          }
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ app: 'GestionStore', version: '1.0', port: 5173, addresses }));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    networkDiscoveryPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'GestionStore-logo.png'],
      manifest: {
        name: 'GestionStore - Gestion de Boutique',
        short_name: 'GestionStore',
        description: 'Application de gestion de boutique offline-first',
        theme_color: '#1e40af',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
