// 熟語の確認（フェーズ8）その8：答え合わせ。私たちの方法で選んだ熟語が、研究者の熟語リストとどれくらい重なるかを数える。
// 研究者のリスト（PHaVE List、PHRASE List）は利用条件が明示されていないため、アプリにもリポジトリにも入れない。
// PC の eigo-data/ref/ に置いたものを読み、数だけを eigo-data/work/overlap-report.json に書く。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(homedir(), 'eigo-data')
const WORK = join(DATA, 'work')
const idioms = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data', 'idioms.json'), 'utf8')).items
const cands = readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const ranking = JSON.parse(readFileSync(join(WORK, 'ranking.json'), 'utf8'))
const judgments = new Map(readFileSync(join(WORK, 'judgments.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((j) => [j.key, j]))

/** 見比べるための形：小文字、「sth」「sb」「(…)」を外す、one's などをそろえる */
const norm = (s) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\b(sth|sb|something|someone|somebody|one's|oneself|be)\b/g, ' ').replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
/** 「there is/are」のような書き方は、それぞれの形に分ける */
const variants = (s) => {
  const m = s.match(/^(.*?)(\S+)\/(\S+)(.*)$/)
  return m ? [`${m[1]}${m[2]}${m[4]}`, `${m[1]}${m[3]}${m[4]}`] : [s]
}

const ours = new Map(idioms.map((d) => [norm(d.en), d]))
const candByNorm = new Map()
for (const c of cands) if (!candByNorm.has(norm(c.word))) candByNorm.set(norm(c.word), c)
const rankByNorm = new Map(ranking.map((r) => [norm(r.word), r]))

const result = {}
for (const [name, file, top] of [['PHaVE List（句動詞150）', 'phave.txt', 150], ['PHRASE List（熟語）', 'phrase-list.txt', 300]]) {
  const f = join(DATA, 'ref', file)
  if (!existsSync(f)) continue
  const list = readFileSync(f, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)
  const head = list.slice(0, top)
  const r = { リストの数: list.length, 見比べた上位: head.length, 私たちの300個に入った: 0, Wiktionaryに見出しなし: 0, 判定で外した_組み合わせどおり: 0, 判定で外した_その意味の文なし: 0, 字幕の頻度が基準未満など: 0, まだ判定していない: 0 }
  for (const x of head) {
    const forms = variants(x).map(norm)
    if (forms.some((k) => ours.has(k))) { r.私たちの300個に入った++; continue }
    const c = forms.map((k) => candByNorm.get(k)).find(Boolean)
    if (!c) { r.Wiktionaryに見出しなし++; continue }
    const j = judgments.get(`${c.word}|${c.type}`)
    if (j?.transparent) r.判定で外した_組み合わせどおり++
    else if (j && j.k === 0) r.判定で外した_その意味の文なし++
    else if (!forms.some((k) => rankByNorm.has(k))) r.字幕の頻度が基準未満など++
    else r.まだ判定していない++
  }
  r.重なりの割合 = `${Math.round((r.私たちの300個に入った / head.length) * 100)}%`
  // 私たちの300個のうち、相手のリスト（全体）に入っているもの
  const theirs = new Set(list.flatMap((x) => variants(x).map(norm)))
  r.私たちの300個のうちリストにもある = idioms.filter((d) => theirs.has(norm(d.en))).length
  result[name] = r
}
writeFileSync(join(WORK, 'overlap-report.json'), JSON.stringify(result, null, 2))
console.log(result)
