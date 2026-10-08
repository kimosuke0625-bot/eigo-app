// 熟語の確認（フェーズ8）その3：大きな公開データで、候補が実際に何回使われているかを数える。
//   node scripts/idioms/03-count.mjs tatoeba     … Tatoeba の英文（文の id も残し、例文選びに使う）
//   node scripts/idioms/03-count.mjs subtitles   … OpenSubtitles（話し言葉。数えるだけで文は残さない）
//   node scripts/idioms/03-count.mjs wikipedia   … Wikipedia 英語版（書き言葉。数えるだけで文は残さない）
// 活用形（gave up など）は Wiktionary の活用形の一覧で数える。someone・something は1〜3語の何か、one's は所有格に当てはめる。
// 1行ずつ読み、数だけを持つので、大きなデータでもメモリは増えない。
// 出力：eigo-data/work/count-<名前>.json（総語数、候補ごとの回数。tatoeba は文の id も）
import { createReadStream, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA = join(homedir(), 'eigo-data')
const WORK = join(DATA, 'work')
const corpus = process.argv[2]

const POSS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their', "one's"])
const REFL = new Set(['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves', 'oneself'])
const ANY = 'ANY'
const tokenize = (s) => s.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)*/g) ?? []

/** 候補の見出し・活用形を、数えるための型にする（語の並び。ANY は1〜3語の何か） */
function toPattern(form) {
  const toks = tokenize(form.replace(/\([^)]*\)/g, ' '))
  if (!toks.length) return null
  return toks.map((t) => (['someone', 'somebody', 'something', 'sb', 'sth', 'someplace', 'somewhere'].includes(t) ? ANY
    : t === "one's" ? POSS : t === 'oneself' ? REFL : t))
}

const cands = readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
// 先頭の2語（どちらも決まった語）で引く表と、先頭の1語で引く表
const byTwo = new Map()
const byOne = new Map()
let patterns = 0
cands.forEach((c, id) => {
  const pats = new Map()
  // 活用形は、先頭の動詞だけが変わり、残りが見出しと同じものに限る（語順の違う別の形を数えないため）
  const head = tokenize(c.word)
  const forms = c.forms.filter((f) => {
    if (f === c.word) return true
    if (c.pos !== 'verb') return false
    const t = tokenize(f)
    return t.length === head.length && t.slice(1).join(' ') === head.slice(1).join(' ')
  })
  for (const f of forms) {
    const p = toPattern(f)
    if (!p || p.length < 2 || typeof p[0] !== 'string') continue
    pats.set(p.map((x) => (typeof x === 'string' ? x : x === ANY ? '*' : '#')).join(' '), p)
  }
  for (const p of pats.values()) {
    patterns++
    if (typeof p[1] === 'string') {
      const k = `${p[0]} ${p[1]}`
      if (!byTwo.has(k)) byTwo.set(k, [])
      byTwo.get(k).push({ id, p })
    } else {
      if (!byOne.has(p[0])) byOne.set(p[0], [])
      byOne.get(p[0]).push({ id, p })
    }
  }
})
console.log(`候補 ${cands.length}、数える型 ${patterns}`)

/** toks の i 番目から型 p が当てはまるか */
function match(toks, i, p, j = 0) {
  if (j === p.length) return true
  const s = p[j]
  if (s === ANY) {
    for (let n = 1; n <= 3 && i + n <= toks.length; n++) if (match(toks, i + n, p, j + 1)) return true
    return false
  }
  if (i >= toks.length) return false
  if (typeof s === 'string' ? toks[i] !== s : !s.has(toks[i])) return false
  return match(toks, i + 1, p, j + 1)
}

const counts = new Uint32Array(cands.length)
let tokens = 0
const examples = corpus === 'tatoeba' ? cands.map(() => []) : null

function countLine(text, sentenceId) {
  const toks = tokenize(text)
  tokens += toks.length
  const hit = sentenceId !== undefined ? new Set() : null
  for (let i = 0; i < toks.length - 1; i++) {
    const two = byTwo.get(`${toks[i]} ${toks[i + 1]}`)
    if (two) for (const { id, p } of two) if (match(toks, i, p)) { counts[id]++; hit?.add(id) }
    const one = byOne.get(toks[i])
    if (one) for (const { id, p } of one) if (match(toks, i, p)) { counts[id]++; hit?.add(id) }
  }
  if (hit) for (const id of hit) if (examples[id].length < 400) examples[id].push(sentenceId)
}

function lines(file, how) {
  const input = how === 'bz2' ? spawn('bzip2', ['-dc', file]).stdout
    : how === 'gz' ? createReadStream(file).pipe(createGunzip())
      : createReadStream(file)
  return createInterface({ input, crlfDelay: Infinity })
}

/** Wikipedia の記事の文だけを取り出す（ひな形・表・参照・リンクの記法を外す。厳密でなくてよい：数えるため） */
function wikiText(l) {
  if (!l || /^\s*[{|!=<*#:;]/.test(l) || l.startsWith('[[Category') || l.startsWith('[[File') || l.includes('</text>') && l.length < 30) return ''
  return l
    .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>|&lt;ref.*?(\/&gt;|&lt;\/ref&gt;)/g, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?|&quot;|&amp;|&[a-z]+;|<[^>]+>/g, ' ')
}

// 途中経過：500万行ごとに、回数と読んだ行数を保存する。止まっても、次はそこから続ける（前の行は読み飛ばすだけ）
const PARTIAL = join(WORK, `count-${corpus}.partial.json`)
let skip = 0
if (corpus !== 'tatoeba' && existsSync(PARTIAL)) {
  const p = JSON.parse(readFileSync(PARTIAL, 'utf8'))
  if (p.candidates === cands.length) {
    skip = p.lines
    tokens = p.tokens
    counts.set(p.counts)
    console.log(`途中経過から再開：${skip / 1e6}M 行まで数え済み`)
  }
}
const savePartial = () => writeFileSync(PARTIAL, JSON.stringify({ candidates: cands.length, lines: n, tokens, counts: Array.from(counts), savedAt: new Date().toISOString() }))

const started = Date.now()
let n = 0
const progress = () => {
  if (++n % 1_000_000 === 0) console.log(`${n / 1e6}M 行、${(tokens / 1e9).toFixed(2)}G 語、${Math.round((Date.now() - started) / 60000)}分`)
  if (corpus !== 'tatoeba' && n % 5_000_000 === 0) savePartial()
}
if (corpus === 'tatoeba') {
  for await (const l of lines(join(WORK, 'tatoeba-en.tsv'))) {
    const [id, text] = l.split('\t')
    countLine(text, Number(id))
    progress()
  }
} else if (corpus === 'subtitles') {
  for await (const l of lines(join(DATA, 'raw', 'en.txt.gz'), 'gz')) {
    if (n < skip) { n++; continue }
    countLine(l)
    progress()
  }
} else if (corpus === 'wikipedia') {
  // 記事の名前空間（ns 0）の本文だけを数える
  let inArticle = false
  for await (const l of lines(join(DATA, 'raw', 'enwiki-latest-pages-articles.xml.bz2'), 'bz2')) {
    if (l.includes('<ns>')) { inArticle = l.includes('<ns>0</ns>'); continue }
    if (!inArticle) continue
    if (n < skip) { n++; continue }
    const t = wikiText(l.replace(/^\s*<text[^>]*>/, ''))
    if (t) countLine(t)
    progress()
  }
} else {
  throw new Error('tatoeba / subtitles / wikipedia のどれかを指定してください')
}

const result = { corpus, tokens, finishedAt: new Date().toISOString(), counts: {} }
cands.forEach((c, id) => {
  if (counts[id]) result.counts[`${c.word}|${c.type}`] = examples ? { n: counts[id], ids: examples[id] } : counts[id]
})
writeFileSync(join(WORK, `count-${corpus}.json`), JSON.stringify(result))
if (existsSync(PARTIAL)) rmSync(PARTIAL)
console.log(`${corpus}：${(tokens / 1e6).toFixed(1)}M 語、使われていた候補 ${Object.keys(result.counts).length}、${Math.round((Date.now() - started) / 60000)}分`)
