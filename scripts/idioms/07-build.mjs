// 熟語の確認（フェーズ8）その7：判定を通った熟語から、アプリのデータ（public/data/idioms.json）を作る。
//   node scripts/idioms/07-build.mjs [種類ごとの個数（初期値 100）]
// 2026-10-09 の変更（利用者の判断）：
// - 句動詞・熟語・決まり文句を、種類ごとに頻度の高い順で選ぶ（最初は100個ずつ）。上から順に見て、まだ判定していない候補に当たったら止まる。
// - よく使う意味が複数あるときは、実在の文で裏付けられる意味を3つまで、別々のカードにする。
//   2つ目以降の意味は、判定した文のうち2文以上でその意味が使われ、字幕での頻度（割合を掛けたもの）が100万語あたり1回以上のものだけ。
// - 使う場面の札：会話向き／書き言葉向き／どちらでも（字幕と Wikipedia の回数、Google Books で確かめ）、
//   くだけた言い方・改まった言い方（Wiktionary の用法ラベル）、ビジネス向き・仕事では避ける（判定のときの印と根拠）。
// - 例文は、その意味で使われていた Tatoeba の文から選ぶ（英語を母語とする投稿者・日本語訳つき・短い文を優先）。
// - 要確認：その意味の実在の文が1文だけ／母語話者の文がない／日本語訳つきの文がない。
// 出力：public/data/idioms.json（CC BY-SA 4.0）、eigo-data/work/build-report.json（外した数と理由など）
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORK = join(homedir(), 'eigo-data', 'work')
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data', 'idioms.json')
const want = Number(process.argv[2] ?? 100)
const MAX_SENSES = 3

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
// 初期設定で「知っている」扱いにする基本のあいさつ・お礼（利用者の決定 2026-10-09：1つ目の意味のカードだけ。2つ目以降は通常どおり出題）
const BASIC = new Set(['thank you', 'thank you very much', 'good morning', 'good afternoon', 'good evening', 'good night', 'nice to meet you',
  'how are you', "I'm fine", 'see you', 'see you later', 'see you tomorrow', "I'm sorry", 'excuse me', "you're welcome", 'no, thanks',
  'no thank you', 'happy birthday', 'merry Christmas', 'good luck', 'me too', 'of course'])
const stars = (pm) => (pm >= 100 ? 5 : pm >= 30 ? 4 : pm >= 10 ? 3 : pm >= 3 ? 2 : 1)
const slug = (w) => w.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** 使う場面の札（見出し全体の札と、その意味の用法ラベル） */
function scenesOf(c, sense, r, j, js) {
  const tags = new Set(sense.tags ?? [])
  const out = []
  // 話し言葉（映画字幕）と書き言葉（Wikipedia の取得済み分）の100万語あたりの回数を比べる。目安
  //   Wikipedia のほうが多い → 書き言葉向き、Wikipedia でほとんど使われない（100万語あたり1回未満）→ 会話向き、ほかは どちらでも
  //   Google Books の上位一覧（本。小説の会話も含む）に載っていれば補助に使い、本と字幕の多い少ないが逆なら「どちらでも」にする
  let label = 'どちらでも'
  if (r.subtitles !== null && r.wikipedia !== null) {
    label = r.wikipedia >= r.subtitles ? '書き言葉向き' : r.wikipedia < 1 ? '会話向き' : 'どちらでも'
    if (r.gbooks !== null && r.gbooks !== undefined) {
      if (label === '書き言葉向き' && r.gbooks < r.subtitles) label = 'どちらでも'
      if (label === '会話向き' && r.gbooks >= r.subtitles) label = 'どちらでも'
    }
  }
  out.push(label)
  const casual = tags.has('informal') || tags.has('colloquial') || tags.has('slang')
  if (casual) out.push('くだけた言い方')
  if (tags.has('formal')) out.push('改まった言い方')
  // 仕事では避ける：判定で「くだけすぎ」と印を付けたもの、または Wiktionary で俗語（slang）とされる意味
  const avoid = j.avoidAtWork || js.avoidAtWork || tags.has('slang')
  if (avoid) out.push('仕事では避ける')
  // ビジネス向き：判定で「仕事の場面でも使いやすい」と印を付けたもの（根拠は判定のメモ）、または Wiktionary のビジネスの分野の語
  else if (j.business || js.business || c.business) out.push('ビジネス向き')
  return out
}

const cards = []
const report = { 見出しの数: {}, カードの数: 0, 意味が2つ以上の見出し: 0, 要確認: 0, 要確認の理由: {}, 止まった順位: {} }
const count = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
for (const type of ['phrasal', 'idiom', 'phrase']) {
  let taken = 0
  for (const r of ranking.filter((x) => x.type === type)) {
    if (taken >= want) break
    const j = judgments.get(r.key)
    if (!j) { report.止まった順位[TYPE_LABEL[type]] = { 順位: r.rank, 見出し: r.word, 理由: 'まだ判定していない' }; break }
    const c = cands.get(r.key)
    const senseMap = new Map(c.senses.map((s) => [s.gloss, s]))
    // 意味ごとのカード：1つ目は最もよく使われた意味、2つ目以降は2文以上かつ字幕の頻度が基準以上のもの
    const chosen = j.senses.filter((s, i) => i === 0 || (s.k >= 2 && (r.subtitles === null || (r.subtitles * s.k) / j.n >= 1))).slice(0, MAX_SENSES)
    if (!chosen.length) continue
    taken++
    count(report.見出しの数, TYPE_LABEL[type])
    if (chosen.length > 1) report.意味が2つ以上の見出し++
    chosen.forEach((s, i) => {
      const sense = senseMap.get(s.gloss) ?? { tags: [] }
      const ex = s.ids.map((id) => ({ id, ...sent.get(id) })).filter((x) => x.en)
      ex.sort((a, b) => Number(b.native) - Number(a.native) || Number(!!b.ja) - Number(!!a.ja) || a.en.split(' ').length - b.en.split(' ').length)
      const reasons = []
      if (s.k < 2) reasons.push('この意味で使われた実在の文が1文だけ')
      if (!ex.some((x) => x.native)) reasons.push('英語を母語とする投稿者の例文がない')
      if (!ex.some((x) => x.ja)) reasons.push('日本語訳つきの例文がない')
      reasons.forEach((x) => count(report.要確認の理由, x))
      const freq = r.subtitles !== null ? (r.subtitles * s.k) / j.n : r.raw * (s.k / j.n)
      cards.push({
        id: i === 0 ? `idiom-${slug(c.word)}` : `idiom-${slug(c.word)}--${i + 1}`,
        rank: 0,
        typeRank: taken,
        en: c.word,
        ja: s.ja,
        type: TYPE_LABEL[type] ?? type,
        sense: i + 1,
        senseCount: chosen.length,
        gloss: s.gloss,
        wiktionary: `https://en.wiktionary.org/wiki/${encodeURIComponent(c.word.replace(/ /g, '_'))}`,
        read: j.n,
        matched: s.k,
        perMillion: Math.round(freq * 10) / 10,
        stars: stars(freq),
        scenes: scenesOf(c, sense, r, j, s),
        basic: i === 0 && BASIC.has(c.word),
        ex: ex.slice(0, 2).map((x) => ({ en: x.en, ja: x.ja, enId: x.id, jaId: x.jaId, native: x.native })),
        needsCheck: reasons.length > 0,
        checkReasons: reasons,
      })
    })
  }
}
// 加える順：カードの頻度の高い順（3つの種類が混ざる）
cards.sort((a, b) => b.perMillion - a.perMillion)
cards.forEach((d, i) => { d.rank = i + 1 })
const ids = new Set()
for (const d of cards) { if (ids.has(d.id)) throw new Error(`id が重なった：${d.id}`); ids.add(d.id) }
report.カードの数 = cards.length
report.要確認 = cards.filter((d) => d.needsCheck).length
writeFileSync(OUT, JSON.stringify({ version: Number(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '2'), license: 'CC BY-SA 4.0（見出しと意味の元：Wiktionary。例文：Tatoeba CC BY 2.0 FR）', items: cards }))
writeFileSync(join(WORK, 'build-report.json'), JSON.stringify(report, null, 2))
console.log(report)
