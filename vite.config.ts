import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // GitHub Pages のサブパスでも動くよう相対パスで出力する
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
