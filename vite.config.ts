import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

/**
 * オフライン用の Service Worker（dist/sw.js）を書き出す（フェーズ7）。
 * 入れたときに保存するのは、画面・JS・CSS・教材データ・アイコン・書体。
 * 書体（woff2、約1MB）も入れたときに保存する。音声認識のエンジン（.wasm、約27MB）と内蔵の音声は、使ったときに保存する。
 */
function serviceWorker(): Plugin {
  return {
    name: 'eigo-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist'
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (name === '.git') continue
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(dist, p).replace(/\\/g, '/'))
        }
      }
      walk(dist)
      const precache = files.filter((f) =>
        f === 'index.html' || f === 'manifest.webmanifest' || f === 'favicon.svg' || f.startsWith('data/') ||
        (f.startsWith('assets/') && /\.(js|css|woff2)$/.test(f)))
      const hash = createHash('sha256')
      for (const f of precache) hash.update(f).update(readFileSync(join(dist, f)))
      const version = hash.digest('hex').slice(0, 12)
      const list = JSON.stringify(['./', ...precache.map((f) => `./${f}`)])
      const sw = readFileSync('scripts/sw-template.js', 'utf8').replace("const VERSION = '__VERSION__'", `const VERSION = '${version}'`).replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${list}`)
      writeFileSync(join(dist, 'sw.js'), sw)
    },
  }
}

export default defineConfig({
  // GitHub Pages のサブパスでも動くよう相対パスで出力する
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
