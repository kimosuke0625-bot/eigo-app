// 熟語の確認（フェーズ8）その4：意味の判定のための「判定表」を作る。
// 候補ごとに、Wiktionary の意味（文字どおりの用法の項は除く）と、Tatoeba の実在の文を最大12文並べる。
// 文は、英語の母語話者が書いた・日本語訳がある・短いものを優先する（並びは文の id で決まり、毎回同じ）。
// この表を読んで、どの文がどの意味で使われているかを数え、judgments.jsonl に根拠として残す。
//   node scripts/idioms/04-samples.mjs <開始の順位> <件数>
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORK = join(homedir(), 'eigo-data', 'work')
const from = Number(process.argv[2] ?? 0)
const size = Number(process.argv[3] ?? 50)

/** 文字どおりの用法の項（Wiktionary が「熟語ではない用法」と書いているもの） */
export const isLiteralSense = (g) => /^(Used other than figuratively or idiomatically|Used literally|Literally)/i.test(g)

const cands = readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const tat = JSON.parse(readFileSync(join(WORK, 'count-tatoeba.json'), 'utf8'))
const ranking = JSON.parse(readFileSync(join(WORK, 'ranking.json'), 'utf8'))

// Tatoeba の文（id → 英文・母語話者・日本語訳）
const sent = new Map()
for (const l of readFileSync(join(WORK, 'tatoeba-en.tsv'), 'utf8').split('\n')) {
  if (!l) continue
  const [id, en, user, native, , ja] = l.split('\t')
  sent.set(Number(id), { en, user, native: native === '1', ja })
}

const byKey = new Map(cands.map((c) => [`${c.word}|${c.type}`, c]))
const out = []
// まだ判定していない候補を、頻度の高い順に
for (const r of ranking.filter((x) => x.share === null).slice(from, from + size)) {
  const c = byKey.get(r.key)
  const senses = c.senses.filter((s) => !isLiteralSense(s.gloss))
  const ids = (tat.counts[r.key]?.ids ?? []).map((id) => ({ id, ...sent.get(id) })).filter((s) => s.en)
  ids.sort((a, b) => Number(b.native) - Number(a.native) || Number(!!b.ja) - Number(!!a.ja)
    || a.en.split(' ').length - b.en.split(' ').length || a.id - b.id)
  const pick = ids.filter((s) => s.en.split(' ').length <= 14).slice(0, 10)
  out.push(`### ${r.rank}. ${c.word}  [${c.type}]  頻度(100万語あたり) 字幕 ${r.subtitles ?? '-'} / Wikipedia ${r.wikipedia ?? '-'} / Tatoeba ${r.tatoeba}`)
  senses.forEach((s, i) => out.push(`  S${i + 1}: ${s.gloss.slice(0, 110)}${s.tags.length ? `  {${s.tags.join(',')}}` : ''}`))
  pick.forEach((s) => out.push(`    #${s.id}${s.native ? '' : ' (母語話者以外)'} ${s.en}${s.ja ? `  ／${s.ja}` : ''}`))
  out.push('')
}
const file = join(WORK, `judge-${String(from).padStart(4, '0')}.txt`)
writeFileSync(file, out.join('\n'))
console.log(file, existsSync(file))
