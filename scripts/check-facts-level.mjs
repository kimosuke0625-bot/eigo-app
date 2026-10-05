// 雑学の「やさしい版」が NGSL 上位1,000語でどれだけ書けているかを調べる
// 実行: node scripts/check-facts-level.mjs
import { readFileSync } from 'node:fs'

const ngsl = JSON.parse(readFileSync(new URL('../public/data/ngsl.json', import.meta.url), 'utf8'))
const facts = JSON.parse(readFileSync(new URL('../public/data/facts.json', import.meta.url), 'utf8'))

const rankOf = new Map()
for (const w of ngsl.words) for (const f of w.forms) if (!rankOf.has(f) || rankOf.get(f) > w.rank) rankOf.set(f, w.rank)

const LIMIT = 1000
// NGSL は数詞と単位を含まないので、既知として扱う
const NUMBERS = new Set(('zero two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty ' +
  'sixty seventy eighty ninety hundred hundreds thousand thousands million millions billion billions trillion trillions ' +
  'km cm kg meter meters kilometer kilometers kilogram kilograms ton tons degrees percent').split(' '))
for (const n of NUMBERS) rankOf.set(n, 0)
const offList = new Map()
let total = 0
let inList = 0
const perFact = facts.facts.map((f) => {
  // 大文字で始まる語（文頭以外）は固有名詞とみなして数えない
  const words = f.easy.replace(/[’']s\b/g, '').match(/[A-Za-z]+/g) ?? []
  let n = 0
  let ok = 0
  words.forEach((w, i) => {
    const lower = w.toLowerCase()
    if (i > 0 && /^[A-Z]/.test(w) && lower !== 'i') return
    n++
    const r = rankOf.get(lower)
    if (r !== undefined && r <= LIMIT) ok++
    else offList.set(lower, (offList.get(lower) ?? 0) + 1)
  })
  total += n
  inList += ok
  return { id: f.id, ratio: n ? ok / n : 1 }
})

console.log(`やさしい版の語のうち NGSL 上位${LIMIT}語：${((inList / total) * 100).toFixed(1)}%`)
console.log('90%未満の雑学:', perFact.filter((f) => f.ratio < 0.9).length, '/', perFact.length)
console.log('よく出る範囲外の語:', [...offList].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, c]) => `${w}(${c})`).join(' '))
