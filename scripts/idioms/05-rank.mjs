// 熟語の確認（フェーズ8）その5：数えた回数から、候補の頻度（100万語あたり）を出して並べる。
// 基準：映画字幕で100万語あたり1回以上（その意味で使われる割合を掛けたもの）、かつ Tatoeba に実在の文が1つ以上。
// 2026-10-09：判定には意味が複数ある。見出しの頻度は「熟語の意味で使われた文の割合（意味の合計）」を掛けて出す。
// 書き言葉（Wikipedia の取得済み分、Google Books の上位一覧）は基準に使わず、使う場面の札の参考にだけ残す。
// 出力：eigo-data/work/ranking.json、eigo-data/work/ranking-dropped.json（外した数と理由）
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA = join(homedir(), 'eigo-data')
const WORK = join(DATA, 'work')
const load = (name) => (existsSync(join(WORK, `count-${name}.json`)) ? JSON.parse(readFileSync(join(WORK, `count-${name}.json`), 'utf8')) : null)
const tat = load('tatoeba')
const sub = load('subtitles')
const wiki = load('wikipedia')

// Google Books の上位一覧（2010〜2019年の英語の本、2〜5語）。見出しの形だけで引く
const GB_TOKENS = 283_795_232_871
const gbooks = new Map()
for (const n of [2, 3, 4, 5]) {
  const f = join(DATA, 'raw', 'gbooks', `${n}grams_english.csv`)
  if (!existsSync(f)) continue
  for (const l of readFileSync(f, 'utf8').trim().split('\n').slice(1)) {
    const i = l.lastIndexOf(',')
    gbooks.set(l.slice(0, i).toLowerCase(), Math.round((Number(l.slice(i + 1)) / GB_TOKENS) * 1e6 * 100) / 100)
  }
}

const judgments = new Map(existsSync(join(WORK, 'judgments.jsonl'))
  ? readFileSync(join(WORK, 'judgments.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((j) => [j.key, j]) : [])

const isLiteralSense = (g) => /^(Used other than figuratively or idiomatically|Used literally|Literally)/i.test(g)
const pm = (corpus, key) => {
  if (!corpus) return null
  const v = corpus.counts[key]
  const n = typeof v === 'number' ? v : v?.n ?? 0
  return Math.round((n / corpus.tokens) * 1e6 * 100) / 100
}

const cands = readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const dropped = {}
const drop = (reason) => { dropped[reason] = (dropped[reason] ?? 0) + 1 }
const rows = []
for (const c of cands) {
  const key = `${c.word}|${c.type}`
  if (!c.senses.some((s) => !isLiteralSense(s.gloss))) { drop('文字どおりの用法の項しかない（熟語ではない）'); continue }
  const t = pm(tat, key)
  if (!t) { drop('Tatoeba に実在の文がない'); continue }
  const s = pm(sub, key)
  const w = pm(wiki, key)
  const g = gbooks.get(c.word.toLowerCase()) ?? null
  const raw = s !== null ? s : t
  const j = judgments.get(key)
  if (j?.offensive) { drop('下品・攻撃的と受け取られる言い方（学習用には載せない）'); continue }
  if (j?.duplicate) { drop('別の見出しと同じ表現（同じ文が数えられているので1つにまとめた）'); continue }
  if (j?.transparent) { drop('意味が語の組み合わせどおり（熟語ではない。実在の文を読んで判定）'); continue }
  if (j && !j.senses.length) { drop('その意味で使われた実在の文がない（実在の文を読んで判定）'); continue }
  const share = j ? j.senses.reduce((a, x) => a + x.k, 0) / j.n : null
  if (s !== null && s * (share ?? 1) < 1) { drop('頻度が基準に届かない（映画字幕で100万語あたり1回未満）'); continue }
  rows.push({ key, word: c.word, type: c.type, tatoeba: t, subtitles: s, wikipedia: w, gbooks: g, raw, share, freq: share !== null ? raw * share : raw })
}
rows.sort((a, b) => b.freq - a.freq)
rows.forEach((r, i) => { r.rank = i + 1 })
writeFileSync(join(WORK, 'ranking.json'), JSON.stringify(rows))
writeFileSync(join(WORK, 'ranking-dropped.json'), JSON.stringify(dropped, null, 2))
console.log(`並べた候補 ${rows.length}`, dropped)
