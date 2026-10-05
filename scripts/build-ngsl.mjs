// NGSL 1.2 と Tatoeba の英日対訳から、復習カード用の語彙データ public/data/ngsl.json を作る
// 実行: node scripts/fetch-raw.mjs && node scripts/build-ngsl.mjs
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { unzipSync, strFromU8 } from 'fflate'

const here = (p) => new URL(p, import.meta.url)
const raw = (p) => here('./raw/' + p)

// ---- NGSL ----
// Excel を経由したため true / false が TRUE / FALSE になっているのを戻す
const fixCase = (w) => (w === 'TRUE' || w === 'FALSE' ? w.toLowerCase() : w)

// 先頭の BOM（\s に含まれる）を除いてから行に分ける
const stats = readFileSync(raw('NGSL_12_stats.csv'), 'utf8').replace(/^\s+/, '').trim().split(/\r?\n/).slice(1)
const ranked = stats.map((l) => l.split(',')).map(([w, r]) => ({ lemma: fixCase(w), rank: Number(r) }))
ranked.sort((a, b) => a.rank - b.rank)

const formsByLemma = new Map()
for (const line of readFileSync(raw('NGSL_12_lemmatized_for_teaching.csv'), 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('##')) continue
  const forms = line.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  formsByLemma.set(forms[0] === 'i' ? 'I' : fixCase(forms[0]), forms)
}

// 同じ綴りで別の語がある場合（found = find の過去形 / 設立する）は、見出し語の意味に合う語形だけを例文に使う
const AMBIGUOUS_FORMS = { found: ['founded', 'founding', 'founds'], wound: ['wounded', 'wounds'] }
// 語形だけでは見分けられない語は、文の形で絞り込む
const SENSE_FILTER = {
  left: /\b(on|to|from) (the|your|my|his|her) left\b|\bleft[- ](hand|side|foot|arm|leg|eye|ear|wing)\b|\bturn(ed)? left\b/i,
  rose: /\b(a|the|this|that) rose\b|\broses\b/i,
}

// ---- 英英定義（xlsx） ----
function readDefinitions() {
  const zip = unzipSync(readFileSync(raw('NGSL_12_with_English_definitions.xlsx')))
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const shared = [...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join('')))
  const sheet = strFromU8(zip['xl/worksheets/sheet1.xml'])
  const defs = new Map()
  for (const row of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {}
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g)) {
      const [, col, attrs, v, inline] = c
      cells[col] = /t="s"/.test(attrs) ? shared[Number(v)] : decode(inline ?? v ?? '')
    }
    if (cells.A && cells.B) defs.set(fixCase(cells.A.trim()), cells.B.trim())
  }
  return defs
}
const definitions = readDefinitions()

// ---- 日本語訳（このアプリ用に作成） ----
const gloss = new Map(
  readFileSync(here('./ja-gloss.tsv'), 'utf8').trim().split(/\r?\n/).map((l) => l.split('\t')),
)

// ---- Tatoeba ----
async function readTsv(file, onRow) {
  const rl = createInterface({ input: createReadStream(raw(file)), crlfDelay: Infinity })
  for await (const line of rl) onRow(line.split('\t'))
}

const engToJpn = new Map()
await readTsv('eng-jpn_links.tsv', ([e, j]) => {
  if (!engToJpn.has(e)) engToJpn.set(e, [])
  engToJpn.get(e).push(j)
})
const jpn = new Map()
await readTsv('jpn_sentences_detailed.tsv', ([id, , text]) => jpn.set(id, text))

// 語形 → NGSL 順位（最も高頻度の見出し語）
const formRank = new Map()
const lemmaRank = new Map(ranked.map((r) => [r.lemma, r.rank]))
for (const [lemma, forms] of formsByLemma) {
  const rank = lemmaRank.get(lemma)
  for (const f of forms) if (!formRank.has(f) || formRank.get(f) > rank) formRank.set(f, rank)
}
// Tatoeba によく出る人名は既知語として扱う
const NAMES = new Set(['tom', 'mary', 'john', 'alice', 'bob', 'jim', 'mike', 'ken', 'jack', 'emily', 'jane', 'paul'])
const CONTRACTIONS = { "n't": 'not', "'re": 'be', "'m": 'be', "'ll": 'will', "'ve": 'have', "'d": 'would', "'s": '' }

function tokenize(text) {
  const out = []
  for (let t of text.toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z0-9']+/)) {
    t = t.replace(/^'+|'+$/g, '')
    if (!t) continue
    if (t === "can't") { out.push('can', 'not'); continue }
    if (t === "won't") { out.push('will', 'not'); continue }
    const suffix = Object.keys(CONTRACTIONS).find((s) => t.endsWith(s) && t.length > s.length)
    if (suffix) {
      out.push(t.slice(0, -suffix.length))
      if (CONTRACTIONS[suffix]) out.push(CONTRACTIONS[suffix])
    } else out.push(t)
  }
  return out
}
const tokenRank = (t) => (/^\d+$/.test(t) || NAMES.has(t) ? 0 : t === 'i' ? 1 : formRank.get(t) ?? Infinity)

// 数字が英文と訳文で食い違う対訳（Tatoeba にまれにある誤訳）を除く
const toHalfWidth = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
const digits = (t) => (toHalfWidth(t).match(/\d+/g) ?? []).sort().join(',')

// 候補文を集める：対訳がある、4〜12語でNGSL外の語を含まない（strict）。
// 例文が足りない語のために、16語までで NGSL 外の語1つまでの文（lenient）も残す
const candidates = new Map() // 語形 → 文の配列
await readTsv('eng_sentences_detailed.tsv', ([id, , text, owner]) => {
  const ja = engToJpn.get(id)
  if (!ja || !text) return
  const tokens = tokenize(text)
  if (tokens.length < 4 || tokens.length > 16) return
  const ranks = tokens.map(tokenRank)
  const unknown = ranks.filter((r) => r === Infinity).length
  if (unknown > 1) return
  const strict = unknown === 0 && tokens.length <= 12
  const jaId = ja
    .map((j) => [j, jpn.get(j)])
    .filter(([, t]) => t && digits(t) === digits(text))
    .sort((a, b) => a[1].length - b[1].length)[0]
  if (!jaId) return
  const sentence = { id: Number(id), en: text, ja: jaId[1], jaId: Number(jaId[0]), tokens, ranks, native: owner === 'CK', strict }
  for (const t of new Set(tokens)) {
    if (!candidates.has(t)) candidates.set(t, [])
    candidates.get(t).push(sentence)
  }
})

// Tatoeba に適した例文がない語のために、このアプリで作成した例文
const ownExamples = new Map()
for (const line of readFileSync(here('./own-examples.tsv'), 'utf8').trim().split(/\r?\n/)) {
  const [lemma, en, ja] = line.split('\t')
  if (!ownExamples.has(lemma)) ownExamples.set(lemma, [])
  ownExamples.get(lemma).push({ en, ja })
}

const used = new Map()
const words = ranked.map(({ lemma, rank }) => {
  const forms = AMBIGUOUS_FORMS[lemma] ?? formsByLemma.get(lemma) ?? [lemma.toLowerCase()]
  const pool = new Map()
  for (const f of forms) for (const s of candidates.get(f) ?? []) {
    if (SENSE_FILTER[lemma] && !SENSE_FILTER[lemma].test(s.en)) continue
    pool.set(s.id, s)
  }
  const scored = [...pool.values()].map((s) => {
    // 見出し語以外で一番難しい語の順位。見出し語より易しい語だけの文を優先する
    const others = s.ranks.filter((r, i) => !forms.includes(s.tokens[i]))
    const hardest = Math.max(0, ...others)
    const limit = Math.max(500, rank)
    const score =
      (s.strict ? 0 : 5000) +
      (hardest <= limit ? 0 : 1000 + Math.min(hardest, 3000)) +
      Math.abs(s.tokens.length - 7) * 20 +
      (s.native ? 0 : 60) +
      (used.get(s.id) ?? 0) * 400
    return { s, score }
  })
  scored.sort((a, b) => a.score - b.score || a.s.id - b.s.id)
  const picked = []
  const seenEn = new Set()
  for (const { s } of scored) {
    const key = s.en.toLowerCase()
    if (seenEn.has(key)) continue
    seenEn.add(key)
    picked.push(s)
    used.set(s.id, (used.get(s.id) ?? 0) + 1)
    if (picked.length === 3) break
  }
  return {
    id: `ngsl:${lemma}`,
    rank,
    lemma,
    forms: formsByLemma.get(lemma) ?? [lemma.toLowerCase()],
    ja: gloss.get(lemma) ?? '',
    def: definitions.get(lemma) ?? '',
    ex: picked.length
      ? picked.map((s) => ({ en: s.en, ja: s.ja, enId: s.id, jaId: s.jaId }))
      : (ownExamples.get(lemma) ?? []),
  }
})

const missing = {
  ja: words.filter((w) => !w.ja).map((w) => w.lemma),
  def: words.filter((w) => !w.def).length,
  noExample: words.filter((w) => !w.ex.length).map((w) => w.lemma),
}
mkdirSync(here('../public/data/'), { recursive: true })
writeFileSync(here('../public/data/ngsl.json'), JSON.stringify({ version: 1, words }))
console.log(`語数 ${words.length}、日本語訳なし ${missing.ja.length}、英英定義なし ${missing.def}、例文なし ${missing.noExample.length}`)
console.log('例文なし:', missing.noExample.join(' '))
console.log('例文1つ以下:', words.filter((w) => w.ex.length < 2).length)
