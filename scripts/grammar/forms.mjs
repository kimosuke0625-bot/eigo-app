// 文法（フェーズ9）：✕ の文を辞書で確かめるため、Wiktionary（kaikki.org の機械可読版）から活用形と語義の説明を取り出す（PC の作業用）。
//   node scripts/grammar/forms.mjs 見出し1 見出し2 ...   → eigo-data/work/grammar-forms.json に足す
// 出力：{ "見出し|品詞": { forms: [{ form, tags }], glosses: [語義の説明（英語）], labeled: [{ tags: [口語・非標準などの札], gloss }] } }
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'eigo-data', 'work', 'grammar-forms.json')
const POS = ['verb', 'noun', 'pron', 'det', 'article', 'prep', 'adj', 'adv', 'conj', 'num', 'contraction', 'phrase', 'intj']
const LABELS = ['colloquial', 'informal', 'nonstandard', 'dialectal', 'proscribed']
const want = new Set(process.argv.slice(2))
const out = {}
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
// 以前の書き方（活用形の配列だけ）も読めるようにする
for (const [k, v] of Object.entries(old)) if (!want.has(k.split('|')[0])) out[k] = Array.isArray(v) ? { forms: v, glosses: [] } : v
const rl = createInterface({ input: createReadStream(join(homedir(), 'eigo-data', 'raw', 'kaikki.org-dictionary-English.jsonl')) })
for await (const line of rl) {
  // "word" は意味の説明の中にも出るので、見出しの候補がある行だけを読んで確かめる
  if (![...line.matchAll(/"word": "([^"]+)"/g)].some((m) => want.has(m[1]))) continue
  const j = JSON.parse(line)
  if (!want.has(j.word) || j.lang_code !== 'en' || !POS.includes(j.pos)) continue
  const key = `${j.word}|${j.pos}`
  const forms = (j.forms ?? []).filter((f) => f.tags && !f.tags.includes('obsolete') && !f.tags.includes('archaic')).map((f) => ({ form: f.form, tags: f.tags }))
  const senses = (j.senses ?? []).filter((s) => !(s.tags ?? []).some((t) => ['obsolete', 'archaic'].includes(t)))
  const glosses = senses.flatMap((s) => s.glosses ?? [])
  // 口語・方言・非標準などの札が付いた語義（△「正式な場面では避ける」の確かめに使う）
  const labeled = senses.filter((s) => (s.tags ?? []).some((t) => LABELS.includes(t))).map((s) => ({ tags: s.tags.filter((t) => LABELS.includes(t)), gloss: (s.glosses ?? []).join(' / ') }))
  const cur = out[key] ?? { forms: [], glosses: [], labeled: [] }
  out[key] = { forms: [...cur.forms, ...forms], glosses: [...cur.glosses, ...glosses], labeled: [...(cur.labeled ?? []), ...labeled] }
}
writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log(Object.keys(out).length, '件')
