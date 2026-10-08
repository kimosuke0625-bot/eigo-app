// 熟語の確認（フェーズ8）その2：Wiktionary（kaikki.org の機械可読版、CC BY-SA 4.0）から、2語以上の見出しの候補を集める。
// 実在の確認：Wiktionary に見出しがあるものだけを候補にする（思いついた表現は入れない）。
// 同じ見出しが品詞ごとに分かれている（used to の形容詞と動詞など）ので、意味をまとめてから書き出す。
// 2026-10-09 修正：熟語と分類された見出しは、ほかの品詞の項（all right の形容詞「大丈夫」など）の意味もまとめる。
// また、意味の数に上限を設けない（以前は1項目8個・合計12個までで、set up の「設立する」、work out の「うまくいく」が落ちていた）。
// 出力：eigo-data/work/candidates.jsonl（1行1候補）、eigo-data/work/candidates-dropped.json（外した数と理由）
import { createReadStream, mkdirSync, writeFileSync, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA = join(homedir(), 'eigo-data')
const WORK = join(DATA, 'work')
mkdirSync(WORK, { recursive: true })

// 載せない意味（古語・廃用・まれ・標準でない・不快な語など）
const BAD_TAGS = new Set(['archaic', 'obsolete', 'rare', 'nonstandard', 'vulgar', 'offensive', 'derogatory', 'ethnic', 'slur',
  'misspelling', 'form-of', 'alt-of', 'abbreviation', 'initialism', 'historical', 'dialectal', 'humorous', 'nonce-word', 'proscribed', 'eye-dialect'])
// 使う場面の札にする用法ラベル
const SCENE_TAGS = ['informal', 'colloquial', 'slang', 'formal', 'dated', 'idiomatic', 'figuratively', 'US', 'UK', 'British', 'Australia', 'euphemistic']
const BUSINESS = /business|commerce|finance|management|economics|marketing|accounting|employment/i
const IDIOM_CATS = /English idioms|light verb constructions|English set phrases|English phrasebook|modal verbs|auxiliary verbs/i

const catNames = (s) => (s.categories ?? []).map((c) => (typeof c === 'string' ? c : c.name ?? '')).filter(Boolean)

const dropped = {}
const drop = (reason) => { dropped[reason] = (dropped[reason] ?? 0) + 1 }
const all = new Map()

const rl = createInterface({ input: createReadStream(join(DATA, 'raw', 'kaikki.org-dictionary-English.jsonl')), crlfDelay: Infinity })
for await (const line of rl) {
  let e
  try { e = JSON.parse(line) } catch { continue }
  const word = (e.word ?? '').trim()
  if (e.lang_code !== 'en' || !word.includes(' ')) continue
  const pos = e.pos
  // 固有名詞・記号と、a few・a little などの基本の限定詞・代名詞・数詞は熟語として扱わない
  if (['name', 'character', 'symbol', 'det', 'pron', 'num', 'particle', 'article'].includes(pos)) continue
  const senses = e.senses ?? []
  const cats = senses.flatMap(catNames)
  const isPhrasal = cats.some((c) => /phrasal verbs/i.test(c))
  const isIdiom = cats.some((c) => IDIOM_CATS.test(c)) || senses.some((s) => (s.tags ?? []).includes('idiomatic'))
  // 名詞・形容詞などの複合語（ice cream など）は、熟語と分類されているものだけを候補の元にする。
  // ただし、同じ見出しが別の品詞で熟語と分類されていれば、その意味もあとでまとめる（qualifies で区別）
  const qualifies = !(['noun', 'adj', 'verb'].includes(pos) && !isIdiom && !isPhrasal)
  // 活用形の見出し（looking for など）は、元の見出し（look for）の活用形として数えるので、候補にしない
  if (senses.length && senses.every((s) => s.form_of || (s.tags ?? []).includes('form-of'))) { if (qualifies) drop('活用形の見出し（元の見出しにまとめて数える）'); continue }
  if (word.split(' ').length > 7) { if (qualifies) drop('長すぎる（8語以上）'); continue }
  if (/[^A-Za-z' ,.!?-]/.test(word)) { if (qualifies) drop('英字以外を含む'); continue }

  const good = senses.filter((s) => (s.glosses ?? []).length && !(s.tags ?? []).some((t) => BAD_TAGS.has(t)) && !s.form_of && !s.alt_of)
  if (!good.length) { if (qualifies) drop('古い・まれ・不適切な意味しかない'); continue }

  const type = pos === 'proverb' ? 'proverb' : isPhrasal ? 'phrasal' : (pos === 'phrase' || pos === 'intj') ? 'phrase' : 'idiom'
  const key = word.toLowerCase()
  const c = all.get(key) ?? { word, pos, type, forms: new Set([word]), business: false, senses: [], qualifies: false }
  if (all.has(key) && qualifies) drop('同じ見出しの別の品詞（意味をまとめた）')
  // 種類は熟語と分類された項から決める（句動詞が優先）
  if (qualifies && (!c.qualifies || type === 'phrasal')) { c.type = type; c.word = word }
  c.qualifies ||= qualifies
  if (pos === 'verb') c.pos = 'verb'
  for (const f of e.forms ?? []) {
    if (f.form && f.form.includes(' ') && !(f.tags ?? []).some((t) => ['table-tags', 'inflection-template', 'class'].includes(t))) c.forms.add(f.form)
  }
  c.business ||= good.some((s) => BUSINESS.test([...(s.topics ?? []), ...catNames(s)].join(' ')))
  for (const s of good) {
    c.senses.push({
      pos,
      gloss: (s.glosses ?? []).join('; '),
      tags: (s.tags ?? []).filter((t) => SCENE_TAGS.includes(t)),
      examples: (s.examples ?? []).filter((x) => x.text && (x.type ?? 'example') === 'example').slice(0, 3).map((x) => x.text),
    })
  }
  all.set(key, c)
}

const out = createWriteStream(join(WORK, 'candidates.jsonl'))
let kept = 0
for (const c of all.values()) {
  if (!c.qualifies) continue
  kept++
  const { qualifies, ...rest } = c
  out.write(JSON.stringify({ ...rest, forms: [...c.forms] }) + '\n')
}
out.end()
writeFileSync(join(WORK, 'candidates-dropped.json'), JSON.stringify({ kept, dropped }, null, 2))
console.log('候補', kept, '外した', dropped)
