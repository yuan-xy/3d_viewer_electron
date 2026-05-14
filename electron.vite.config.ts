import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ficadWeb = path.resolve(__dirname, '../ficad_web')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: 'electron/preload/index.ts',
        formats: ['cjs']
      },
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    root: ficadWeb,
    plugins: [react(), tailwindcss()],
    build: {
      outDir: path.resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: path.join(ficadWeb, 'index.html')
      }
    },
    resolve: {
      alias: {
        '@': path.join(ficadWeb, 'src')
      }
    }
  }
})