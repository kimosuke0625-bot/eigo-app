// 熟語の確認（フェーズ8）その7：判定を通った熟語を、頻度の高い順に上から選び、アプリのデータ（public/data/idioms.json）を作る。
//   node scripts/idioms/07-build.mjs [個数（初期値 300）]
// - 並びは ranking.json（05-rank.mjs）の順。上から順に見て、まだ判定していない候補に当たったら止まる（頻度の順を飛ばさないため）。
// - 意味は判定で選んだ1つ（最もよく使われていた意味）。日本語の意味は判定の根拠に書いた「」の中。
// - 例文は、その意味で使われていた Tatoeba の文から選ぶ（英語を母語とする投稿者・日本語訳つき・短い文を優先）。
// - 要確認：その意味の実在の文が1文だけ／母語話者の文がない／日本語訳つきの文がない。
// - 使う場面の札：Wiktionary の用法ラベルと、話し言葉（字幕）と書き言葉（Wikipedia の取得済み分）の回数の比べ（目安）。
// 出力：public/data/idioms.json（CC BY-SA 4.0）、eigo-data/work/build-report.json（外した数と理由など）
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORK = join(homedir(), 'eigo-data', 'work')
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data', 'idioms.json')
const want = Number(process.argv[2] ?? 300)

const isLiteralSense = (g) => /^(Used other than figuratively or idiomatically|Used literally|Literally)/i.test(g)
const cands = new Map(readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((c) => [`${c.word}|${c.type}`, c]))
const ranking = JSON.parse(readFileSync(join(WORK, 'ranking.json'), 'utf8'))
const judgments = new Map(readFileSync(join(WORK, 'judgments.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((j) => [j.key, j]))

const sent = new Map()
for (const l of readFileSync(join(WORK, 'tatoeba-en.tsv'), 'utf8').split('\n')) {
  if (!l) continue
  const [id, en, , native, jaId, ja] = l.split('\t')
  sent.set(Number(id), { en, native: native === '1', jaId: jaId ? Number(jaId) : undefined, ja: ja || '' })
}

const TYPE_LABEL = { phrasal: '句動詞', idiom: '熟語', phrase: '決まり文句' }
const stars = (pm) => (pm >= 100 ? 5 : pm >= 30 ? 4 : pm >= 10 ? 3 : pm >= 3 ? 2 : 1)
const slug = (w) => w.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** 使う場面の札 */
function scenesOf(c, sense, r) {
  const tags = new Set([...(sense.tags ?? [])])
  const out = []
  if (tags.has('informal') || tags.has('colloquial')) out.push('くだけた言い方')
  if (tags.has('formal')) out.push('改まった言い方')
  if (c.business) out.push('ビジネス')
  // 話し言葉（映画字幕）と書き言葉（Wikipedia の取得済み分）の100万語あたりの回数を比べる。目安
  // Wikipedia の回数には文字どおりの用法も含まれるので、差がはっきりしたものだけ札を変える：
  //   Wikipedia のほうが多い → 書き言葉向き、Wikipedia でほとんど使われない（100万語あたり1回未満）→ 会話向き、ほかは両方
  //   Google Books の上位一覧（本。小説の会話も含む）に載っていれば補助に使い、本と字幕の多い少ないが逆なら「両方」にする
  if (r.subtitles !== null && r.wikipedia !== null) {
    const books = r.gbooks
    let label = r.wikipedia >= r.subtitles ? '書き言葉向き（目安）' : r.wikipedia < 1 ? '会話向き（目安）' : '会話・書き言葉の両方（目安）'
    if (books !== null && books !== undefined) {
      if (label.startsWith('書き言葉') && books < r.subtitles) label = '会話・書き言葉の両方（目安）'
      if (label.startsWith('会話向き') && books >= r.subtitles) label = '会話・書き言葉の両方（目安）'
    }
    out.push(label)
  }
  return out
}


const items = []
const report = { 選んだ数: 0, 要確認: 0, 要確認の理由: {}, 判定で外した数: {}, 止まった順位: null }
const count = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
for (const r of ranking) {
  if (items.length >= want) break
  const j = judgments.get(r.key)
  if (!j) { report.止まった順位 = { 順位: r.rank, 見出し: r.word, 理由: 'まだ判定していない' }; break }
  const c = cands.get(r.key)
  const senses = c.senses.filter((s) => !isLiteralSense(s.gloss))
  const sense = senses[j.sense - 1]
  const ja = (j.note.match(/「([^」]+)」/) ?? [])[1]
  if (!sense || !ja) throw new Error(`${r.key}：意味の番号か日本語の意味がない`)
  const ex = j.ids.map((id) => ({ id, ...sent.get(id) })).filter((s) => s.en)
  ex.sort((a, b) => Number(b.native) - Number(a.native) || Number(!!b.ja) - Number(!!a.ja) || a.en.split(' ').length - b.en.split(' ').length)
  const reasons = []
  if (j.k < 2) reasons.push('この意味で使われた実在の文が1文だけ')
  if (!ex.some((s) => s.native)) reasons.push('英語を母語とする投稿者の例文がない')
  if (!ex.some((s) => s.ja)) reasons.push('日本語訳つきの例文がない')
  reasons.forEach((x) => count(report.要確認の理由, x))
  const pick = ex.slice(0, 2)
  items.push({
    id: `idiom-${slug(c.word)}`,
    rank: items.length + 1,
    en: c.word,
    ja,
    type: TYPE_LABEL[c.type] ?? c.type,
    gloss: sense.gloss,
    wiktionary: `https://en.wiktionary.org/wiki/${encodeURIComponent(c.word.replace(/ /g, '_'))}`,
    read: j.n,
    matched: j.k,
    perMillion: Math.round(r.freq * 10) / 10,
    stars: stars(r.freq),
    scenes: scenesOf(c, sense, r),
    ex: pick.map((s) => ({ en: s.en, ja: s.ja, enId: s.id, jaId: s.jaId, native: s.native })),
    needsCheck: reasons.length > 0,
    checkReasons: reasons,
  })
}
const ids = new Set()
for (const d of items) { if (ids.has(d.id)) throw new Error(`id が重なった：${d.id}`); ids.add(d.id) }
report.選んだ数 = items.length
report.要確認 = items.filter((d) => d.needsCheck).length
writeFileSync(OUT, JSON.stringify({ version: Number(new Date().toISOString().slice(0, 10).replace(/-/g, '')), license: 'CC BY-SA 4.0（見出しと意味の元：Wiktionary。例文：Tatoeba CC BY 2.0 FR）', items }))
writeFileSync(join(WORK, 'build-report.json'), JSON.stringify(report, null, 2))
console.log(report)
