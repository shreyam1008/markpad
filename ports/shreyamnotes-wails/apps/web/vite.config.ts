import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function rendererManualChunk(id: string): string | undefined {
  const normalizedId = id.split('\\').join('/')
  const isNodePackage = (packageName: string) =>
    normalizedId.includes(`/node_modules/${packageName}/`)

  if (
    normalizedId === '\0vite/preload-helper.js' ||
    normalizedId.includes('vite/preload-helper')
  ) {
    return 'vite-preload-helper'
  }
  if (normalizedId.endsWith('/packages/app-core/src/lib/wikilinks.ts')) {
    return 'app-wikilinks'
  }
  if (!normalizedId.includes('node_modules')) return undefined

  if (
    normalizedId.includes('/zustand/') ||
    normalizedId.includes('/use-sync-external-store/')
  ) {
    return 'vendor-zustand'
  }

  if (
    isNodePackage('react') ||
    isNodePackage('react-dom') ||
    isNodePackage('scheduler')
  ) {
    return 'vendor-react'
  }

  if (
    normalizedId.includes('/@codemirror/') ||
    normalizedId.includes('/codemirror/') ||
    normalizedId.includes('/@lezer/') ||
    normalizedId.includes('/@replit/codemirror-vim/')
  ) {
    return 'vendor-editor'
  }


  if (normalizedId.includes('/highlight.js/')) {
    return 'vendor-highlight'
  }

  if (normalizedId.includes('/dompurify/')) {
    return 'vendor-sanitize'
  }

  if (
    normalizedId.includes('/mermaid/') ||
    normalizedId.includes('/cytoscape/') ||
    normalizedId.includes('/dagre/')
  ) {
    return 'vendor-mermaid'
  }

  if (normalizedId.includes('/jsxgraph/')) {
    return 'vendor-jsxgraph'
  }

  if (normalizedId.includes('/function-plot/')) {
    return 'vendor-function-plot'
  }

  if (normalizedId.includes('/d3')) {
    return 'vendor-d3'
  }

  return undefined
}

export default defineConfig({
  root: __dirname,
  // Emit relative paths in index.html so the same bundle works at the
  // domain root and under a reverse-proxy subpath (e.g. /zennotes/).
  // Runtime API + WebSocket calls derive the prefix from
  // window.__ZN_BASE_PATH__, which the Go server injects into the SPA
  // shell when ZENNOTES_BASE_PATH is set.
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^react$/, replacement: resolve(__dirname, '../../node_modules/react/index.js') },
      {
        find: /^react\/jsx-runtime$/,
        replacement: resolve(__dirname, '../../node_modules/react/jsx-runtime.js')
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: resolve(__dirname, '../../node_modules/react/jsx-dev-runtime.js')
      },
      { find: /^react-dom$/, replacement: resolve(__dirname, '../../node_modules/react-dom/index.js') },
      {
        find: /^react-dom\/client$/,
        replacement: resolve(__dirname, '../../node_modules/react-dom/client.js')
      },
      { find: '@renderer', replacement: resolve(__dirname, '../../packages/app-core/src') },
      { find: '@shared', replacement: resolve(__dirname, '../../packages/shared-domain/src') },
      { find: '@bridge-contract', replacement: resolve(__dirname, '../../packages/bridge-contract/src') }
    ]
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true,
        ws: true
      },
      '/vault': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/fs': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/notes': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/comments': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/folders': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/assets': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/search': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/tasks': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/demo': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/watch': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true,
        ws: true
      },
      '/capabilities': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/version': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/platform': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/healthz': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      },
      '/assets-data': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: true
      }
    }
  },
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3500,
    modulePreload: false,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: rendererManualChunk
            }
          ]
        }
      }
    }
  }
})
