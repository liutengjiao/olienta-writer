import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        codeSplitting: true,
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('@codemirror/view')) return 'vendor-editor-view'
          if (id.includes('@codemirror/state')) return 'vendor-editor-state'
          if (id.includes('@codemirror/lang-markdown') || id.includes('@codemirror/language')) return 'vendor-editor-language'
          if (id.includes('@codemirror/commands') || id.includes('@codemirror/search') || id.includes('@codemirror/autocomplete')) return 'vendor-editor-tools'
          if (id.includes('@codemirror') || id.includes('codemirror') || id.includes('@lezer')) return 'vendor-editor-core'
          if (id.includes('@tauri-apps')) return 'vendor-tauri'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: false,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
