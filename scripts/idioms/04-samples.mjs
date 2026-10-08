// 熟語の確認（フェーズ8）その4：意味の判定のための「判定表」を作る。
// 候補ごとに、Wiktionary の意味（文字どおりの用法の項は除く）と、Tatoeba の実在の文を最大15文並べる。
// 文は、英語の母語話者が書いた・日本語訳がある・短いものを優先する（並びは文の id で決まり、毎回同じ）。
// この表を読んで、どの文がどの意味で使われているかを意味ごとに数え、judge-notes-*.txt に書く（06-judgments.mjs）。
//   node scripts/idioms/04-samples.mjs <種類：phrasal | idiom | phrase | all> <件数>
// 2026-10-09：種類ごとに頻度順で選ぶ方式（案A）にしたので、種類を指定できるようにした。以前の判定のメモも参考に出す。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORK = join(homedir(), 'eigo-data', 'work')
const type = process.argv[2] ?? 'all'
const size = Number(process.argv[3] ?? 40)
const SAMPLE = 15

const isLiteralSense = (g) => /^(Used other than figuratively or idiomatically|Used literally|Literally)/i.test(g)
const cands = new Map(readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((c) => [`${c.word}|${c.type}`, c]))
const tat = JSON.parse(readFileSync(join(WORK, 'count-tatoeba.json'), 'utf8'))
const ranking = JSON.parse(readFileSync(join(WORK, 'ranking.json'), 'utf8'))
const v1 = new Map(existsSync(join(WORK, 'v1', 'judgments-gloss.jsonl'))
  ? readFileSync(join(WORK, 'v1', 'judgments-gloss.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((j) => [j.key, j]) : [])

const sent = new Map()
for (const l of readFileSync(join(WORK, 'tatoeba-en.tsv'), 'utf8').split('\n')) {
  if (!l) continue
  const [id, en, , native, , ja] = l.split('\t')
  sent.set(Number(id), { en, native: native === '1', ja })
}

const out = []
for (const r of ranking.filter((x) => x.share === null && (type === 'all' || x.type === type)).slice(0, size)) {
  const c = cands.get(r.key)
  const senses = c.senses.filter((s) => !isLiteralSense(s.gloss))
  const ids = (tat.counts[r.key]?.ids ?? []).map((id) => ({ id, ...sent.get(id) })).filter((s) => s.en)
  ids.sort((a, b) => Number(b.native) - Number(a.native) || Number(!!b.ja) - Number(!!a.ja)
    || a.en.split(' ').length - b.en.split(' ').length || a.id - b.id)
  const pick = ids.filter((s) => s.en.split(' ').length <= 16).slice(0, SAMPLE)
  out.push(`### ${r.rank}. ${c.word}  [${c.type}]  字幕 ${r.subtitles ?? '-'} / Wikipedia ${r.wikipedia ?? '-'} / Tatoeba ${r.tatoeba}  （${pick.length}文）`)
  senses.forEach((s, i) => out.push(`  S${i + 1}: ${s.gloss.slice(0, 110)}${s.tags.length ? `  {${s.tags.join(',')}}` : ''}`))
  const old = v1.get(r.key)
  if (old?.note) out.push(`  （以前の判定：${old.note}）`)
  pick.forEach((s) => out.push(`    #${s.id}${s.native ? '' : ' (母語話者以外)'} ${s.en}${s.ja ? `  ／${s.ja}` : ''}`))
  out.push('')
}
const file = join(WORK, 'judge-sheet.txt')
writeFileSync(file, out.join('\n'))
console.log(file, out.filter((l) => l.startsWith('###')).length)
