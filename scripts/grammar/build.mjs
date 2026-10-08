// 文法（フェーズ9）：scripts/grammar/content の中身を確かめて、アプリのデータ（public/data/grammar.json）を作る。
//   node scripts/grammar/build.mjs
// 確かめること（1つでも通らなければ書き出さずに止まる）：
// - Tatoeba の例文：番号の文が実在し、英文が一致し、英語を母語とする投稿者の文で、日本語訳があること
// - 正しい英文（自作の例文、解説の英文、○の文、△の文、問題の答え・手本、自分のことの見本）：LanguageTool（PC の中で動かす）で指摘がないこと
// - ✕ の文：LanguageTool が誤りと判定し、かつ dict の形が Wiktionary の活用形にあること（判定の記録をデータに残す）
// - 並べ替え：認める答えがすべて、示す語をちょうど1回ずつ使っていること
// - 穴埋め：答えが選択肢にあること。各項目の最後の問題が「口頭で即答」であること
// 必要なもの：eigo-data/work/tatoeba-en.tsv、eigo-data/work/grammar-forms.json（scripts/grammar/forms.mjs）、
//            eigo-data/tools の Java と LanguageTool
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DATA = join(homedir(), 'eigo-data')
const OUT = join(here, '..', '..', 'public', 'data', 'grammar.json')

// 中身を読む（content/items-*.mjs の順）
const items = []
for (const f of readdirSync(join(here, 'content')).filter((f) => /^items-.*\.mjs$/.test(f)).sort()) {
  items.push(...(await import(pathToFileURL(join(here, 'content', f)).href)).default)
}

const problems = []
const fail = (id, msg) => problems.push(`${id}: ${msg}`)

// Tatoeba
const sent = new Map()
for (const l of readFileSync(join(DATA, 'work', 'tatoeba-en.tsv'), 'utf8').split('\n')) {
  if (!l) continue
  const [id, en, , native, jaId, ja] = l.split('\t')
  sent.set(Number(id), { en, native: native === '1', jaId: jaId ? Number(jaId) : undefined, ja: ja || '' })
}

// Wiktionary の活用形
const forms = JSON.parse(readFileSync(join(DATA, 'work', 'grammar-forms.json'), 'utf8'))

// 文の正規化（並べ替えの語の比べ方。大文字小文字・文末の記号は問わない）
const words = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[.?!,]/g, ' ').split(/\s+/).filter(Boolean)

// LanguageTool に通す文を集める
const good = new Map() // 文 → どこで使うか
const bad = new Map()
const addGood = (s, where) => good.set(s, [...(good.get(s) ?? []), where])
for (const it of items) {
  for (const p of it.points) for (const s of p.en ?? []) addGood(s.replace(/’/g, "'"), `${it.id} 解説`)
  for (const e of it.examples) if (!e.tatoeba) addGood(e.en, `${it.id} 例文`)
  for (const m of it.mistakes) {
    if (m.kind === 'error') bad.set(m.wrong, `${it.id} ✕`)
    else addGood(m.wrong, `${it.id} △`)
    addGood(m.right, `${it.id} ○`)
  }
  it.exercises.forEach((x, i) => {
    const w = `${it.id} 問題${i + 1}`
    if (x.type === 'fill') for (const a of x.answers) addGood(x.text.replace(/___/, a), w)
    else for (const a of x.answers) addGood(a, w)
    if (x.type === 'rewrite') addGood(x.from, w)
  })
  for (const s of it.myself.samples) for (const part of s.split(' — ')) addGood(part, `${it.id} 自分のこと`)
}

// 1文ずつ LanguageTool に通す（空行で区切る。別々の文をまとめて通すので、文をまたぐ文体の指摘「同じ語で始まる文が3つ続く」は使わない）
function languageTool(list) {
  const tools = join(DATA, 'tools')
  const java = join(tools, readdirSync(tools).find((d) => d.startsWith('jdk')), 'bin', 'java.exe')
  const lt = join(tools, readdirSync(tools).find((d) => d.startsWith('LanguageTool-')), 'languagetool-commandline.jar')
  const dir = mkdtempSync(join(tmpdir(), 'gram-'))
  const text = list.map((s) => s).join('\n\n')
  const file = join(dir, 'in.txt')
  writeFileSync(file, text)
  const json = execFileSync(java, ['-Dfile.encoding=UTF-8', '-jar', lt, '-l', 'en-US', '--json', '--disable', 'ENGLISH_WORD_REPEAT_BEGINNING_RULE', file], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })
  const res = JSON.parse(json.slice(json.indexOf('{')))
  const starts = []
  let pos = 0
  for (const s of list) { starts.push(pos); pos += s.length + 2 }
  const out = list.map(() => [])
  for (const m of res.matches) {
    let i = starts.length - 1
    while (i > 0 && starts[i] > m.offset) i--
    out[i].push({ rule: m.rule.id, message: m.message })
  }
  return out
}

const goodList = [...good.keys()]
const badList = [...bad.keys()]
const checked = languageTool([...goodList, ...badList])
const ltBad = new Map()
goodList.forEach((s, i) => {
  // 人名などのつづりの指摘（Ziri など）は Tatoeba の例文では起きないので、自作の文では誤りとして扱う
  if (checked[i].length) fail(good.get(s).join('・'), `LanguageTool の指摘「${s}」：${checked[i].map((m) => `${m.rule} ${m.message}`).join(' / ')}`)
})
badList.forEach((s, i) => {
  const r = checked[goodList.length + i]
  if (!r.length) fail(bad.get(s), `✕ の文を LanguageTool が誤りと判定しない「${s}」（✕ にできない）`)
  ltBad.set(s, r)
})

// 項目ごとに確かめて、アプリのデータにする
const outItems = items.map((it, n) => {
  const examples = it.examples.map((e) => {
    if (!e.tatoeba) return { en: e.en, ja: e.ja, source: 'self' }
    const t = sent.get(e.tatoeba)
    if (!t) { fail(it.id, `Tatoeba #${e.tatoeba} がない`); return null }
    if (t.en !== e.en) fail(it.id, `Tatoeba #${e.tatoeba} の英文が違う：「${t.en}」`)
    if (!t.native) fail(it.id, `Tatoeba #${e.tatoeba} は英語を母語とする投稿者の文ではない`)
    if (!t.ja) fail(it.id, `Tatoeba #${e.tatoeba} に日本語訳がない`)
    return { en: t.en, ja: t.ja, source: 'tatoeba', enId: e.tatoeba, jaId: t.jaId }
  }).filter(Boolean)

  const mistakes = it.mistakes.map((m) => {
    if (m.kind !== 'error') return m
    const d = m.dict
    const list = forms[`${d.lemma}|${d.pos}`] ?? []
    const ok = list.some((f) => f.form === d.form && d.tags.every((t) => f.tags.includes(t)))
    if (!ok) fail(it.id, `辞書で確かめられない：${d.lemma} の ${d.tags.join(' ')} が ${d.form}`)
    const lt = ltBad.get(m.wrong) ?? []
    return { ...m, proof: { languageTool: lt.map((x) => `${x.rule}：${x.message}`), dictionary: `Wiktionary：${d.form} は ${d.lemma} の ${d.tags.join('・')}` } }
  })

  const exercises = it.exercises.map((x, i) => {
    const id = `gram-${it.id}-${i + 1}`
    if (x.type === 'order') {
      const want = words(x.tokens.join(' ')).sort().join(' ')
      for (const a of x.answers) if (words(a).sort().join(' ') !== want) fail(id, `並べ替えの答え「${a}」が示す語と合わない`)
    }
    if (x.type === 'fill') for (const a of x.answers) if (!x.choices.includes(a)) fail(id, `穴埋めの答え「${a}」が選択肢にない`)
    return { id, ...x }
  })
  if (exercises.at(-1)?.type !== 'oral') fail(it.id, '最後の問題が「口頭で即答」ではない')
  for (const t of ['fill', 'order', 'rewrite', 'oral']) if (!exercises.some((x) => x.type === t)) fail(it.id, `「${t}」の問題がない`)

  return { id: it.id, no: n + 1, title: it.title, stage: it.stage, sources: it.sources, points: it.points.map((p) => ({ ...p, check: !!p.check })), examples, mistakes, exercises, myself: it.myself }
})

if (problems.length) {
  console.error(`確かめられなかった点 ${problems.length} 件。書き出しません。\n` + problems.map((p) => `- ${p}`).join('\n'))
  process.exit(1)
}
const version = Number(new Date().toISOString().slice(0, 10).replace(/-/g, '') + '1')
writeFileSync(OUT, JSON.stringify({ version, license: '解説・問題：自作。例文：Tatoeba（CC BY 2.0 FR）', items: outItems }, null, 1))
console.log({ 項目: outItems.length, 問題: outItems.reduce((s, x) => s + x.exercises.length, 0), LanguageToolに通した正しい文: goodList.length, '✕の文': badList.length })
