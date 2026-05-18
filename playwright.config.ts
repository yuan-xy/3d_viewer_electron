import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './src/test',
  timeout: 60000,
  retries: 0,
  use: {
    viewport: { width: 1280, height: 800 },
  },
})