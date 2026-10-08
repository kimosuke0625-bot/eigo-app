// 文法（フェーズ9）：例文の候補を Tatoeba の実在の文から探す（PC の作業用。英語を母語とする投稿者・日本語訳つき・短い文）。
//   node scripts/grammar/find.mjs "<正規表現>" [最大語数=9] [件数=25]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const re = new RegExp(process.argv[2])
const maxWords = Number(process.argv[3] ?? 9)
const limit = Number(process.argv[4] ?? 25)
const out = []
for (const l of readFileSync(join(homedir(), 'eigo-data', 'work', 'tatoeba-en.tsv'), 'utf8').split('\n')) {
  if (!l) continue
  const [id, en, , native, jaId, ja] = l.split('\t')
  if (native !== '1' || !ja || !re.test(en)) continue
  const w = en.split(/\s+/).length
  if (w > maxWords || w < 3) continue
  out.push({ id, en, ja, jaId, w })
}
out.sort((a, b) => a.w - b.w || Number(a.id) - Number(b.id))
for (const x of out.slice(0, limit)) console.log(`${x.id}\t${x.jaId}\t${x.en}\t${x.ja}`)
console.error(`該当 ${out.length} 文`)
