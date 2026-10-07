// 内蔵の多読・多聴素材 public/data/materials.json を作る
// - scripts/materials/graded.json：このアプリで作成した段階別の読み物（日常・仕事の場面）
// - Simple English Wikipedia の記事冒頭の抜粋（CC BY-SA 4.0）
// - The Aesop for Children（1919年、訳者名なし）のイソップ寓話。Project Gutenberg 版からライセンス部分を除いて本文だけを使う
// 内容確認の質問はすべてこのアプリで作成。
// 実行: node scripts/fetch-materials.mjs && node scripts/build-materials.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { HUMAN_SECTIONS } from './materials/human.mjs'

const here = (p) => new URL(p, import.meta.url)
const graded = JSON.parse(readFileSync(here('./materials/graded.json'), 'utf8'))
const external = JSON.parse(readFileSync(here('./materials/external.json'), 'utf8'))
const wiki = JSON.parse(readFileSync(here('./raw/materials/simplewiki.json'), 'utf8'))
const aesop = readFileSync(here('./raw/materials/jacobs.txt'), 'utf8').replace(/\r\n/g, '\n')

const words = (t) => (t.match(/[A-Za-z']+/g) ?? []).length
const materials = []

for (const g of graded) {
  materials.push({ ...g, kind: 'graded', source: 'このアプリで作成', sourceUrl: '', license: 'CC BY-SA 4.0', wordCount: words(g.body) })
}

// ビジネスの読み物と、ビジネス場面の対話（このアプリで作成）
const readJson = (f) => JSON.parse(readFileSync(here(`./materials/${f}`), 'utf8'))
for (const b of [...readJson('business1.json'), ...readJson('business2.json')]) {
  materials.push({ ...b, kind: 'business', source: 'このアプリで作成', sourceUrl: '', license: 'CC BY-SA 4.0', wordCount: words(b.body) })
}
for (const d of [...readJson('dialogues1.json'), ...readJson('dialogues2.json')]) {
  for (const [who] of d.lines) if (!d.speakers[who]) throw new Error(`${d.id}: 話者が speakers にない: ${who}`)
  // 本文は「話者: せりふ」を1行ずつ段落にしたもの（読む・聞く・シャドーイングでそのまま使える）
  const body = d.lines.map(([who, text]) => `${who}: ${text}`).join('\n\n')
  materials.push({
    id: d.id, title: d.title, scene: d.scene, speakers: d.speakers, lines: d.lines, body, questions: d.questions,
    kind: 'dialogue', source: 'このアプリで作成', sourceUrl: '', license: 'CC BY-SA 4.0',
    wordCount: words(d.lines.map(([, t]) => t).join(' ')),
  })
}

const pages = Object.values(wiki.query.pages)
for (const w of external.wiki) {
  const page = pages.find((p) => p.title === w.page)
  if (!page) throw new Error(`記事がありません: ${w.page}`)
  // 文の途中で改行されている所（末尾が句読点でない行）は次の行とつなぐ
  const paras = page.extract.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    .reduce((acc, p) => {
      if (acc.length && !/[.!?"”)]$/.test(acc.at(-1))) acc[acc.length - 1] += ` ${p}`
      else acc.push(p)
      return acc
    }, [])
    .slice(0, w.paragraphs)
  const body = paras.join('\n\n').replace(/ {2,}/g, ' ')
  const rev = page.revisions[0].revid
  materials.push({
    id: w.id, title: page.title, body, questions: w.questions, kind: 'wiki',
    source: `Simple English Wikipedia「${page.title}」（版 ${rev} の冒頭を抜粋）`,
    sourceUrl: `https://simple.wikipedia.org/w/index.php?oldid=${rev}`,
    license: 'CC BY-SA 4.0', wordCount: words(body),
  })
}

/** Gutenberg 版から寓話1話の本文と教訓を取り出す（目次ではなく本文の見出し＝行全体が見出しの最後の出現を使う） */
function fable(heading) {
  const lines = aesop.split('\n')
  const start = lines.map((l, i) => [l.trim(), i]).filter(([l]) => l === heading).at(-1)?.[1]
  if (start === undefined) throw new Error(`寓話が見つかりません: ${heading}`)
  const rest = []
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Z][A-Z ,'-]+$/.test(line.trim()) && rest.some((l) => l.trim())) break
    if (/^\s*\[Illustration/.test(line)) continue
    rest.push(line)
  }
  const paras = rest.join('\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  // 斜体（_..._）で書かれた最後の教訓は本文と分けて持つ
  const moral = paras.length && /^_.*_$/.test(paras.at(-1)) ? paras.pop().replace(/^_|_$/g, '') : ''
  return { body: paras.join('\n\n'), moral }
}

for (const f of external.fables) {
  const { body, moral } = fable(f.heading)
  materials.push({
    id: f.id, title: f.title, body, moral, questions: f.questions, kind: 'fable',
    source: 'The Aesop for Children（1919年）', sourceUrl: 'https://www.gutenberg.org/ebooks/19994',
    license: 'パブリックドメイン', wordCount: words(body),
  })
}

// 人の朗読つきの素材：LibriVox の録音1つ（寓話4話）と、同じ4話の本文
const SMALL = new Set(['and', 'the', 'of', 'his', 'a', 'in'])
const titleCase = (h) => h.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ')
for (const s of HUMAN_SECTIONS) {
  const parts = s.headings.map((h) => {
    const { body, moral } = fable(h)
    return [titleCase(h), body, moral ? `Moral: ${moral}` : ''].filter(Boolean).join('\n\n')
  })
  const body = parts.join('\n\n').replace(/_/g, '')
  materials.push({
    id: `h-aesop-${String(s.section).padStart(2, '0')}`,
    title: `Aesop: ${s.headings.map(titleCase).join(' / ')}`,
    body, questions: s.questions, kind: 'human',
    audioFile: `human/aesop-${String(s.section).padStart(2, '0')}.mp3`, narrator: s.reader,
    source: `朗読：${s.reader}（LibriVox「The Aesop for Children」区切り${s.section}）／本文：The Aesop for Children（1919年）`,
    sourceUrl: 'https://librivox.org/the-aesop-for-children-by-aesop/',
    license: 'パブリックドメイン', wordCount: words(body),
  })
}

for (const [i, m] of materials.entries()) {
  if (m.kind !== 'business' && m.kind !== 'dialogue') continue
  m.questions = m.questions.map((q, j) => {
    const target = (i * 2 + j) % q.options.length
    const shift = (target - q.answer + q.options.length) % q.options.length
    const options = q.options.map((_, k) => q.options[(k - shift + q.options.length) % q.options.length])
    return { ...q, options, answer: target }
  })
}

for (const m of materials) {
  if (m.questions.length !== 2) throw new Error(`${m.id}: 内容確認の質問は2問`)
  for (const q of m.questions) if (!(q.answer >= 0 && q.answer < q.options.length)) throw new Error(`${m.id}: 正解の番号が不正`)
}
writeFileSync(here('../public/data/materials.json'), JSON.stringify({ version: 1, materials }))
console.log(materials.map((m) => `${m.id} ${m.wordCount}語`).join('\n'))
console.log('素材', materials.length)
