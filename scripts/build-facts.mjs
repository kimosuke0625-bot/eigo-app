// 前回アプリの雑学（old/english_learning_todo.html の FUN_FACTS）を点検した結果と、新しく作った雑学をまとめて
// public/data/facts.json を作る。
// - scripts/facts/facts1〜5.jsonl：前回の雑学の番号（i）ごとの修正版の日本語・英語2種・出典
//   （番号が抜けているものは、誤り・根拠不足・重複のため外した）
// - scripts/facts/facts6-new.jsonl：外した分を補う新しい雑学
// 実行: node scripts/build-facts.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const here = (p) => new URL(p, import.meta.url)

// 前回アプリから分野と絵文字を取り出す
const html = readFileSync(here('../old/english_learning_todo.html'), 'utf8')
const start = html.indexOf('const FUN_FACTS = [')
const body = html.slice(start, html.indexOf('];', start))
const old = []
let category = ''
for (const line of body.split('\n')) {
  const c = line.match(/\/\/ === (.+?) ===/)
  if (c) { category = c[1].replace('追加: ', ''); continue }
  const f = line.match(/\{emoji:'(.*?)', text:'/)
  if (f) old.push({ category, emoji: f[1] })
}
if (old.length !== 365) throw new Error(`前回の雑学が365個ではありません（${old.length}）`)

const CATEGORIES = [
  ['科学・宇宙', 'science'], ['動物・自然', 'nature'], ['歴史', 'history'], ['人体・医学', 'body'],
  ['食べ物・料理', 'food'], ['心理学・脳科学', 'mind'], ['テクノロジー', 'tech'], ['スポーツ', 'sports'],
  ['数学', 'math'], ['地理', 'geography'], ['芸術・音楽', 'arts'], ['英語・言語', 'language'], ['雑学・不思議', 'wonder'],
]
const catKey = new Map(CATEGORIES)

// 珍しさや意外さが特に大きいものを「レア」にする（低い確率で出る）
const RARE = new Set([3, 7, 8, 12, 25, 44, 46, 52, 59, 70, 140, 151, 157, 162, 221, 239, 245, 255, 291, 303, 314, 316, 340, 362, 363, 'n03', 'n07', 'n23', 'n25'])

const facts = []
const dir = here('./facts/')
for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
  for (const line of readFileSync(new URL(file, dir), 'utf8').trim().split(/\r?\n/)) {
    const r = JSON.parse(line)
    const isOld = r.i !== undefined
    const cat = isOld ? old[r.i].category : r.cat
    const key = catKey.get(cat)
    if (!key) throw new Error(`分野が不明です: ${cat}`)
    for (const f of ['ja', 'easy', 'std', 'src']) if (!r[f]) throw new Error(`${file} ${r.i ?? r.id}: ${f} がありません`)
    facts.push({
      id: isOld ? `f${String(r.i).padStart(3, '0')}` : r.id,
      category: key,
      emoji: isOld ? old[r.i].emoji : r.emoji,
      ja: r.ja,
      easy: r.easy,
      std: r.std,
      source: r.src,
      rare: RARE.has(isOld ? r.i : r.id),
      origin: isOld ? 'old' : 'new',
    })
  }
}

const ids = new Set(facts.map((f) => f.id))
if (ids.size !== facts.length) throw new Error('雑学の番号が重複しています')

writeFileSync(
  here('../public/data/facts.json'),
  JSON.stringify({ version: 1, categories: CATEGORIES.map(([ja, key]) => ({ key, ja })), facts }),
)
const removed = 365 - facts.filter((f) => f.origin === 'old').length
console.log(`雑学 ${facts.length}個（前回から ${365 - removed}、外した ${removed}、新規 ${facts.filter((f) => f.origin === 'new').length}、レア ${facts.filter((f) => f.rare).length}）`)
