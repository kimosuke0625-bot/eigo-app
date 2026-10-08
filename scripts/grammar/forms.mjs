// 文法（フェーズ9）：✕ の文を辞書で確かめるため、Wiktionary（kaikki.org の機械可読版）から動詞などの活用形を取り出す（PC の作業用）。
//   node scripts/grammar/forms.mjs 見出し1 見出し2 ...   → eigo-data/work/grammar-forms.json に足す
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'eigo-data', 'work', 'grammar-forms.json')
const want = new Set(process.argv.slice(2))
const out = {}
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
for (const [k, v] of Object.entries(old)) if (!want.has(k.split('|')[0])) out[k] = v
const rl = createInterface({ input: createReadStream(join(homedir(), 'eigo-data', 'raw', 'kaikki.org-dictionary-English.jsonl')) })
for await (const line of rl) {
  // "word" は意味の説明の中にも出るので、見出しの候補がある行だけを読んで確かめる
  if (![...line.matchAll(/"word": "([^"]+)"/g)].some((m) => want.has(m[1]))) continue
  const j = JSON.parse(line)
  if (!want.has(j.word) || j.lang_code !== 'en' || !['verb', 'noun', 'pron'].includes(j.pos)) continue
  const key = `${j.word}|${j.pos}`
  const forms = (j.forms ?? []).filter((f) => f.tags && !f.tags.includes('obsolete') && !f.tags.includes('archaic')).map((f) => ({ form: f.form, tags: f.tags }))
  out[key] = [...(out[key] ?? []), ...forms]
}
writeFileSync(OUT, JSON.stringify(out, null, 1))
console.log(Object.keys(out).join(', '))
