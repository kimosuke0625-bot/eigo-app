// 熟語の確認（フェーズ8）その6：判定表を読んで書いた判定（judge-notes-*.txt）を、judgments.jsonl にまとめる。
// 2026-10-09 から、1つの見出しに意味を3つまで記録する書き方にした（意味は番号ではなく Wiktionary の説明の文で保存する）。
//
// 1行の書き方：
//   見出し|種類 ; 判定した文の数 ; 印 ; S<番号>=<その意味の文の数>「日本語の意味」id,id,... / S<番号>=... ; 根拠
//   印：- （熟語）、T（語の組み合わせどおり）、D（別の見出しと同じなのでまとめる）、V（下品・攻撃的なので載せない）
//       に加えて、B（仕事の場面でも使いやすい）、X（くだけすぎていて仕事では避けたほうがよい）を「-B」「-X」のように付けられる
//       （意味ごとに付けるときは、その意味の id の後ろに「 B」「 X」と書く）
//
// 以前（v1）の判定は eigo-data/work/v1/judgments-gloss.jsonl にある。意味が1つだけの記録なので、
// 熟語として採用した見出しは判定し直す。外した判定（T・D・V・その意味の文なし）は、候補の意味が変わっていなければ引き継ぐ。
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORK = join(homedir(), 'eigo-data', 'work')
const isLiteralSense = (g) => /^(Used other than figuratively or idiomatically|Used literally|Literally)/i.test(g)
const cands = new Map(readFileSync(join(WORK, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((c) => [`${c.word}|${c.type}`, c]))
const oldCands = new Map(readFileSync(join(WORK, 'v1', 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((c) => [`${c.word}|${c.type}`, c]))
const glossesOf = (c) => c.senses.filter((s) => !isLiteralSense(s.gloss)).map((s) => s.gloss)

const out = new Map()
// 以前の判定のうち、外したものだけを引き継ぐ（候補の意味の一覧が同じときだけ）
const v1File = join(WORK, 'v1', 'judgments-gloss.jsonl')
if (existsSync(v1File)) {
  for (const l of readFileSync(v1File, 'utf8').trim().split('\n')) {
    const j = JSON.parse(l)
    const excluded = j.transparent || j.duplicate || j.offensive || !j.senses.length
    const c = cands.get(j.key)
    const o = oldCands.get(j.key)
    if (!excluded || !c || !o || glossesOf(c).join('\n') !== glossesOf(o).join('\n')) continue
    out.set(j.key, { ...j, v: 1 })
  }
}

let n2 = 0
for (const f of readdirSync(WORK).filter((x) => /^judge-notes-\d+\.txt$/.test(x)).sort()) {
  for (const line of readFileSync(join(WORK, f), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const parts = line.split(';')
    const [key, nText, flag, sensesText] = parts.slice(0, 4).map((x) => (x ?? '').trim())
    const note = parts.slice(4).join(';').trim()
    const c = cands.get(key)
    if (!c) throw new Error(`${f}：候補にない見出し「${key}」`)
    const glosses = glossesOf(c)
    const senses = []
    for (const s of (sensesText ?? '').split(/ \/ (?=S\d+=)/).map((x) => x.trim()).filter(Boolean)) {
      const m = s.match(/^S(\d+)=(\d+)\s*「([^」]*)」\s*([\d,]*)\s*([BX]?)$/)
      if (!m) throw new Error(`${f}：読めない意味の書き方「${s}」（${key}）`)
      const gloss = glosses[Number(m[1]) - 1]
      if (!gloss) throw new Error(`${f}：意味の番号が範囲外「${s}」（${key}）`)
      senses.push({ gloss, k: Number(m[2]), ja: m[3], ids: m[4] ? m[4].split(',').map(Number) : [], business: m[5] === 'B', avoidAtWork: m[5] === 'X' })
    }
    senses.sort((a, b) => b.k - a.k)
    out.set(key, {
      key, word: c.word, n: Number(nText),
      transparent: flag.startsWith('T'), duplicate: flag.startsWith('D'), offensive: flag.startsWith('V'),
      business: flag.includes('B'), avoidAtWork: flag.includes('X'),
      senses, note, file: f, v: 2,
    })
    n2++
  }
}
writeFileSync(join(WORK, 'judgments.jsonl'), [...out.values()].map((j) => JSON.stringify(j)).join('\n') + '\n')
console.log('判定', out.size, '（新しい書き方', n2, '）')
