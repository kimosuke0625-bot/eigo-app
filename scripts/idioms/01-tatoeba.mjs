// 熟語の確認（フェーズ8）その1：Tatoeba の英文を、書いた人が英語の母語話者かどうかと、日本語訳つきで1つのファイルにまとめる。
// 元データ（CC BY 2.0 FR）は C:\Users\<名前>\eigo-data\raw に置く。アプリにも公開の場所にも入れない。
// 出力：eigo-data/work/tatoeba-en.tsv（id、英文、書いた人、母語話者なら1、日本語訳の id、日本語訳）
// メモリを使いすぎないよう、ファイルは1行ずつ読む。
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA = join(homedir(), 'eigo-data')
const RAW = join(DATA, 'raw')
const WORK = join(DATA, 'work')
mkdirSync(WORK, { recursive: true })

/** 1行ずつ読む（.bz2 は bzip2 で展開しながら） */
function lines(file) {
  const input = file.endsWith('.bz2') ? spawn('bzip2', ['-dc', file]).stdout : createReadStream(file)
  return createInterface({ input, crlfDelay: Infinity })
}

// 英語を母語とする人（Tatoeba の言語の水準 5）
const natives = new Set()
for await (const l of lines(join(RAW, 'user_languages.csv'))) {
  const [lang, level, user] = l.split('\t')
  if (lang === 'eng' && level === '5' && user) natives.add(user)
}
console.log('英語の母語話者', natives.size)

// 日本語の文
const ja = new Map()
for await (const l of lines(join(RAW, 'jpn_sentences.tsv.bz2'))) {
  const [id, , text] = l.split('\t')
  ja.set(Number(id), text)
}
console.log('日本語の文', ja.size)

// 英語の文（id → 書いた人）
const en = new Map()
for await (const l of lines(join(RAW, 'eng_sentences_detailed.tsv.bz2'))) {
  const [id, , text, user] = l.split('\t')
  en.set(Number(id), { text, user: user === '\\N' ? '' : user })
}
console.log('英語の文', en.size)

// 英文 → 日本語訳（最初に見つかった1つ）
const toJa = new Map()
for await (const l of lines(join(RAW, 'links.csv'))) {
  const t = l.indexOf('\t')
  const a = Number(l.slice(0, t))
  if (!en.has(a) || toJa.has(a)) continue
  const b = Number(l.slice(t + 1))
  if (ja.has(b)) toJa.set(a, b)
}
console.log('日本語訳のある英文', toJa.size)

const out = createWriteStream(join(WORK, 'tatoeba-en.tsv'))
let native = 0
for (const [id, { text, user }] of en) {
  const jid = toJa.get(id) ?? ''
  const isNative = natives.has(user) ? 1 : 0
  native += isNative
  out.write(`${id}\t${text}\t${user}\t${isNative}\t${jid}\t${jid ? ja.get(jid) : ''}\n`)
}
out.end()
console.log('母語話者の英文', native)
