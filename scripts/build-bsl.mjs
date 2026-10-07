// ビジネス語彙 Business Service List 1.20（BSL、1,744語、CC BY-SA 4.0）を、復習カード用のデータにする。
// 例文は NGSL と同じく Tatoeba の英日対訳から選ぶ（NGSL と BSL の語だけでできた、直訳に近い訳の文を優先）。
// 出力：public/data/bsl.json
// 実行: node scripts/fetch-raw.mjs（Tatoeba）→ BSL の CSV を scripts/raw/ に取得 → node scripts/build-bsl.mjs
//   BSL の公式ページ：https://www.newgeneralservicelist.com/business-service-list
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const here = (p) => new URL(p, import.meta.url)
const raw = (p) => here('./raw/' + p)

// ---- 語の一覧と語形 ----
const ngsl = JSON.parse(readFileSync(here('../public/data/ngsl.json'), 'utf8')).words
const bslRows = readFileSync(raw('BSL_120_stats.csv'), 'utf8').replace(/^\s+/, '').trim().split(/\r?\n/).slice(1).map((l) => l.split(','))
const bsl = bslRows.map(([w, r]) => ({ lemma: w, rank: Number(r) }))
const formsByLemma = new Map()
for (const line of readFileSync(raw('BSL_120_lemmatized_for_teaching.csv'), 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('##')) continue
  const forms = line.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  formsByLemma.set(forms[0], forms)
}
const gloss = new Map(readFileSync(here('./bsl-ja-gloss.tsv'), 'utf8').trim().split(/\r?\n/).map((l) => l.split('\t')))

// 語形 → 難しさ（NGSL は順位そのまま、BSL は NGSL のあとに続く順位）
const formRank = new Map()
for (const w of ngsl) for (const f of w.forms) if (!formRank.has(f) || formRank.get(f) > w.rank) formRank.set(f, w.rank)
const BSL_OFFSET = 3000
for (const w of bsl) for (const f of formsByLemma.get(w.lemma) ?? [w.lemma]) if (!formRank.has(f)) formRank.set(f, BSL_OFFSET + w.rank)

const NAMES = new Set(['tom', 'mary', 'john', 'alice', 'bob', 'jim', 'mike', 'ken', 'jack', 'emily', 'jane', 'paul'])
const CONTRACTIONS = { "n't": 'not', "'re": 'be', "'m": 'be', "'ll": 'will', "'ve": 'have', "'d": 'would', "'s": '' }
function tokenize(text) {
  const out = []
  for (let t of text.toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z0-9'-]+/)) {
    t = t.replace(/^['-]+|['-]+$/g, '')
    if (!t) continue
    if (t === "can't") { out.push('can', 'not'); continue }
    if (t === "won't") { out.push('will', 'not'); continue }
    const suffix = Object.keys(CONTRACTIONS).find((s) => t.endsWith(s) && t.length > s.length)
    if (suffix) { out.push(t.slice(0, -suffix.length)); if (CONTRACTIONS[suffix]) out.push(CONTRACTIONS[suffix]) }
    else out.push(...(formRank.has(t) ? [t] : t.split('-')))
  }
  return out.filter(Boolean)
}
const tokenRank = (t) => (/^\d+$/.test(t) || NAMES.has(t) ? 0 : t === 'i' ? 1 : formRank.get(t) ?? Infinity)

// ---- Tatoeba ----
async function readTsv(file, onRow) {
  const rl = createInterface({ input: createReadStream(raw(file)), crlfDelay: Infinity })
  for await (const line of rl) onRow(line.split('\t'))
}
const engToJpn = new Map()
await readTsv('eng-jpn_links.tsv', ([e, j]) => { if (!engToJpn.has(e)) engToJpn.set(e, []); engToJpn.get(e).push(j) })
const jpn = new Map()
await readTsv('jpn_sentences_detailed.tsv', ([id, , text]) => jpn.set(id, text))

const toHalfWidth = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
const digits = (t) => (toHalfWidth(t).match(/\d+/g) ?? []).sort().join(',')
const LITERAL_RATIO = 2.6
const jaRatio = (ja, tokens) => ja.replace(/[、。！？!?「」『』（）()\s]/g, '').length / tokens.length
const PROVERB = /ことわざ|諺|格言|急がば|石の上|猿も|三文|百聞|千里|井の中|手習い|鬼に|花より|案ずるより|雨降って|覆水|郷に入って/
function loosePenalty(ja, tokens) {
  const r = jaRatio(ja, tokens)
  let p = 0
  if (r < 1.2) p += 1200
  else if (r < 1.6) p += 500
  if (r > 5.5) p += 300
  if (PROVERB.test(ja)) p += 1500
  return p
}

const bslForms = new Set(bsl.flatMap((w) => formsByLemma.get(w.lemma) ?? [w.lemma]))
const candidates = new Map()
await readTsv('eng_sentences_detailed.tsv', ([id, , text, owner]) => {
  const ja = engToJpn.get(id)
  if (!ja || !text) return
  const tokens = tokenize(text)
  if (tokens.length < 4 || tokens.length > 20) return
  if (!tokens.some((t) => bslForms.has(t))) return
  const ranks = tokens.map(tokenRank)
  const unknown = ranks.filter((r) => r === Infinity).length
  if (unknown > 2) return
  const pick = ja.map((j) => [j, jpn.get(j)]).filter(([, t]) => t && digits(t) === digits(text))
    .sort((a, b) => Math.abs(jaRatio(a[1], tokens) - LITERAL_RATIO) - Math.abs(jaRatio(b[1], tokens) - LITERAL_RATIO))[0]
  if (!pick) return
  const s = { id: Number(id), en: text, ja: pick[1], jaId: Number(pick[0]), tokens, ranks, native: owner === 'CK', strict: unknown === 0 && tokens.length <= 13, loose: loosePenalty(pick[1], tokens) }
  for (const t of new Set(tokens)) if (bslForms.has(t)) { if (!candidates.has(t)) candidates.set(t, []); candidates.get(t).push(s) }
})

// Tatoeba に適した例文がない語のために、このアプリで作成した例文
const ownExamples = new Map()
for (const line of readFileSync(here('./bsl-own-examples.tsv'), 'utf8').trim().split(/\r?\n/)) {
  const [lemma, en, ja] = line.split('\t')
  if (!ownExamples.has(lemma)) ownExamples.set(lemma, [])
  ownExamples.get(lemma).push({ en, ja })
}

const SHOWN = 3
const SPARE = 3
const used = new Map()
const words = bsl.map(({ lemma, rank }) => {
  const forms = formsByLemma.get(lemma) ?? [lemma]
  const pool = new Map()
  for (const f of forms) for (const s of candidates.get(f) ?? []) pool.set(s.id, s)
  const scored = [...pool.values()].map((s) => {
    const others = s.ranks.filter((r, i) => !forms.includes(s.tokens[i]))
    const hardest = Math.max(0, ...others)
    // ビジネス語彙の例文は、ほかの語が NGSL（基本語）だけの文を優先
    const unknownCount = s.ranks.filter((r) => r === Infinity).length
    const score = (s.strict ? 0 : 5000) + unknownCount * 1500 + (s.tokens.length > 16 ? 800 : 0) +
      (hardest <= 2809 ? 0 : 1000 + Math.min(hardest, 6000) / 10) +
      Math.abs(s.tokens.length - 8) * 20 + (s.native ? 0 : 60) + s.loose + (used.get(s.id) ?? 0) * 400
    return { s, score }
  }).sort((a, b) => a.score - b.score || a.s.id - b.s.id)
  const picked = []
  const seen = new Set()
  for (const { s } of scored) {
    const key = s.en.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(s)
    if (picked.length <= SHOWN) used.set(s.id, (used.get(s.id) ?? 0) + 1)
    if (picked.length === SHOWN + SPARE) break
  }
  const ex = picked.map((s) => ({ en: s.en, ja: s.ja, enId: s.id, jaId: s.jaId }))
  // Tatoeba に例文がない語は、このアプリで作成したビジネス場面の例文を先頭に置く
  for (const own of ownExamples.get(lemma) ?? []) ex.unshift(own)
  return { id: `bsl:${lemma}`, rank, lemma, forms, ja: gloss.get(lemma) ?? '', def: '', ex }
})

writeFileSync(here('../public/data/bsl.json'), JSON.stringify({ version: 1, words }))
const noEx = words.filter((w) => !w.ex.length)
console.log(`BSL ${words.length}語、日本語訳なし ${words.filter((w) => !w.ja).length}、例文なし ${noEx.length}、例文1つ以下 ${words.filter((w) => w.ex.length < 2).length}`)
console.log('例文なしの例:', noEx.slice(0, 40).map((w) => w.lemma).join(' '))
