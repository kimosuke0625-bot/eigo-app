// 文法（フェーズ9）：scripts/grammar/content の中身を確かめて、アプリのデータ（public/data/grammar.json）を作る。
//   node scripts/grammar/build.mjs
// 確かめること（1つでも通らなければ書き出さずに止まる）：
// - Tatoeba の例文：番号の文が実在し、英文が一致し、英語を母語とする投稿者の文で、日本語訳があること
// - 正しい英文（自作の例文、解説の英文、○の文、△の文、問題の答え・手本、自分のことの見本）：LanguageTool（PC の中で動かす）で指摘がないこと
// - ✕ の文（2026-10-09 から利用者の決めた基準）：学習指導要領解説と辞書の両方で確かめられる典型的な誤りだけ。
//   basis の語句（正しい形を示す解説の例文・説明）が解説の本文（eigo-data/ref/mext の chu.txt・sho.txt）のその頁にあること、
//   かつ dict の形・語義が Wiktionary にあること。LanguageTool の判定は参考として記録する（検出しなくてもよい）
// - △（正式な場面では避ける）の文：くだけた会話では母語話者も使う言い方。Wiktionary が口語・非標準・方言などの札を付けて載せていること。
//   映画字幕での回数（spoken）も記録する
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

// 学習指導要領解説の本文（頁は改頁文字で区切られている。空白・改行を除いて照らし合わせる）
const squeeze = (s) => s.replace(/[\s　]+/g, '')
const kaisetsu = {
  中: readFileSync(join(DATA, 'ref', 'mext', 'chu.txt'), 'utf8').split('\f'),
  小: readFileSync(join(DATA, 'ref', 'mext', 'sho.txt'), 'utf8').split('\f'),
  // 高等学校学習指導要領（平成30年告示）解説 外国語編 英語編（文部科学省 https://www.mext.go.jp/content/1407073_09_1_2.pdf を pdftotext -enc UTF-8 -layout）
  高: readFileSync(join(DATA, 'ref', 'mext', 'kou.txt'), 'utf8').split('\f'),
}
// basis の語句が、印刷された頁番号 page の頁にあるか（頁の中に、その番号が数字だけで書かれている）
function findInKaisetsu(b) {
  const pages = kaisetsu[b.doc.includes('高等学校') ? '高' : b.doc.includes('中学校') ? '中' : '小']
  const want = squeeze(b.find)
  return pages.some((p) => squeeze(p).includes(want) && new RegExp(`(^|[^0-9０-９])${b.page}([^0-9０-９]|$)`).test(p.replace(/[\s　]+/g, ' ')))
}

// CEFR-J Grammar Profile の項目一覧（ITEM LIST。scripts/grammar/xlsx2tsv.py で Excel から書き出した 00.tsv）。
// 学習指導要領の範囲外の項目（フェーズ11）の ✕ は、解説の代わりに項目の定義（英語名とパターン略記）の正しい形と照らし合わせる（2026-10-10 利用者の決定：案B）
const cefrjItems = new Map()
for (const l of readFileSync(join(DATA, 'ref', 'cefrj', 'tsv', '00.tsv'), 'utf8').split('\n')) {
  const c = l.split('\t')
  if (/^\d+(-\d+)?$/.test(c[0])) cefrjItems.set(c[0], { name: c[4] ?? '', pattern: c[7] ?? '' })
}
// basis.item の項目の英語名かパターン略記に basis.find があるか
function findInCefrj(b) {
  const it = cefrjItems.get(String(b.item))
  return it ? `${it.name} ${it.pattern}`.includes(b.find) ? it : null : null
}

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
    else if (m.kind === 'meaning') addGood(m.wrong, `${it.id} △`)
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
// ✕ の文の LanguageTool の判定は参考として残す（検出しない典型的な誤りがあるため、✕ にする条件にはしない）
badList.forEach((s, i) => ltBad.set(s, checked[goodList.length + i]))

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

  // CEFR-J の項目（c01〜）の △ には、仕事の場面で使ってよいかの一言（work）を必ず付ける（2026-10-10 利用者の条件3）
  const needWork = it.id.startsWith('c')
  for (const m of it.mistakes) if (needWork && m.kind !== 'error' && !m.work) fail(it.id, `△ に「仕事の場面で使ってよいか」の一言（work）がない「${m.wrong}」`)
  const mistakes = it.mistakes.map((m) => {
    if (m.kind === 'meaning') return m
    if (m.kind === 'informal') {
      // 口語・非標準などの札：活用形の札（form と tags）か、札の付いた語義（label と gloss）
      const d = m.dict
      const entry = forms[`${d.lemma}|${d.pos}`] ?? { forms: [], labeled: [] }
      let dictionary
      if (d.gloss) {
        const hit = (entry.labeled ?? []).find((s) => s.tags.includes(d.label) && s.gloss.includes(d.gloss))
        if (!hit) fail(it.id, `辞書で確かめられない：${d.lemma}（${d.pos}）に札 ${d.label} の語義「${d.gloss}」がない`)
        dictionary = `Wiktionary：${d.lemma}（${d.pos}）の語義「${d.gloss}」に札「${d.label}」`
      } else {
        if (!entry.forms.some((f) => f.form === d.form && d.tags.every((t) => f.tags.includes(t)))) fail(it.id, `辞書で確かめられない：${d.lemma} の ${d.tags.join(' ')} が ${d.form}`)
        dictionary = `Wiktionary：${d.form} は ${d.lemma} の ${d.tags.join('・')}`
      }
      const s = m.spoken
      if (!(s?.wrongCount > 0 && s?.rightCount > 0)) fail(it.id, `△（正式な場面では避ける）に字幕の回数がない「${m.wrong}」`)
      return { kind: 'informal', wrong: m.wrong, right: m.right, note: m.note, ...(m.work ? { work: m.work } : {}), proof: { dictionary, spoken: `映画字幕（OpenSubtitles 英語）：「${s.wrong}」${s.wrongCount.toLocaleString()}回、「${s.right}」${s.rightCount.toLocaleString()}回` } }
    }
    if (m.kind !== 'error') { fail(it.id, `まちがいの種類が不明：${m.kind}`); return m }
    // 解説の該当箇所（正しい形を示す例文・説明）
    const b = m.basis
    let kaisetsuNote = ''
    if (b?.item !== undefined) {
      // CEFR-J Grammar Profile の項目の定義
      const ci = findInCefrj(b)
      if (!ci) fail(it.id, `CEFR-J の項目の定義で確かめられない「${m.wrong}」：項目${b.item}に「${b.find}」がない`)
      else kaisetsuNote = `${b.doc} 項目${b.item}「${ci.name}」（パターン：${ci.pattern}）`
    } else {
      if (!b || !findInKaisetsu(b)) fail(it.id, `解説で確かめられない「${m.wrong}」：${b ? `p.${b.page}に「${b.find}」がない` : 'basis がない'}`)
      kaisetsuNote = b ? `${b.doc} p.${b.page}「${b.find}」` : ''
    }
    // 辞書の確かめ方は2つ：活用形（form と tags）か、語義の説明（gloss の文字列がその見出しの説明にある）
    const d = m.dict
    const entry = forms[`${d.lemma}|${d.pos}`] ?? { forms: [], glosses: [] }
    let dictionary
    if (d.gloss) {
      if (!entry.glosses.some((g) => g.includes(d.gloss))) fail(it.id, `辞書で確かめられない：${d.lemma}（${d.pos}）の語義に「${d.gloss}」がない`)
      dictionary = `Wiktionary：${d.lemma}（${d.pos}）の語義「${d.gloss}」`
    } else {
      if (!entry.forms.some((f) => f.form === d.form && d.tags.every((t) => f.tags.includes(t)))) fail(it.id, `辞書で確かめられない：${d.lemma} の ${d.tags.join(' ')} が ${d.form}`)
      dictionary = `Wiktionary：${d.form} は ${d.lemma} の ${d.tags.join('・')}`
    }
    const lt = ltBad.get(m.wrong) ?? []
    return { kind: 'error', wrong: m.wrong, right: m.right, note: m.note, proof: { kaisetsu: kaisetsuNote, dictionary, languageTool: lt.map((x) => `${x.rule}：${x.message}`) } }
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
