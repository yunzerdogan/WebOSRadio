import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleProxyRequest } from './server/mediaProxy'

function mediaProxy(): Plugin {
  return {
    name: 'webos-radio-media-proxy',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleProxyRequest(request, response).then((handled) => {
          if (!handled) next()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mediaProxy()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    target: 'es2018',
  },
})
