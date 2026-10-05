// 内蔵素材の元データを取得する（scripts/raw/materials/）
// Simple English Wikipedia（CC BY-SA 4.0）: https://simple.wikipedia.org/
// The Aesop for Children（1919年）: https://www.gutenberg.org/ebooks/19994
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('./raw/materials/', import.meta.url))
mkdirSync(dir, { recursive: true })
const titles = ['Coffee', 'Tea', 'Internet', 'Money', 'Sleep', 'Olympic Games', 'Mount Fuji', 'Email', 'Bicycle', 'Chocolate', 'Telephone', 'Rain', 'Honey', 'Moon', 'Elephant']
const q = new URLSearchParams({
  action: 'query', prop: 'extracts|revisions', rvprop: 'ids', exintro: '1', explaintext: '1', redirects: '1', format: 'json',
  titles: titles.join('|'),
})
execSync(`curl -sS -A "eigo-app (personal study app)" -o "${dir}simplewiki.json" "https://simple.wikipedia.org/w/api.php?${q}"`)
execSync(`curl -sSL -A "Mozilla/5.0" -o "${dir}jacobs.txt" https://www.gutenberg.org/cache/epub/19994/pg19994.txt`)
console.log('完了')
