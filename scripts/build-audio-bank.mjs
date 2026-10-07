// 内蔵の英文（見出し語・カードの例文・雑学・名言）を、PC の音声合成（Kokoro-82M）であらかじめ音声ファイルにし、
// 音声置き場のリポジトリ（../eigo-audio、GitHub Pages で公開）に、できた分から順に公開する。
//
// - 作る順番：利用者がこれから学ぶ順（start-rank.txt の順位から NGSL を上へ）。最初の200語のあとに雑学と名言、
//   続けて残りの語、ビジネス語彙（BSL）、最後に開始位置より上の語（すでに知っている語）
// - 途中で止まっても、作成済みのファイルは飛ばすので、もう一度実行すれば続きから再開する
// - 300ファイルごと、または20分ごとに index.json を更新して GitHub に送る（アプリはそれを見て音声を使う）
//
// 実行: node scripts/build-audio-bank.mjs   （止めるときは Ctrl+C。scripts/run-audio-bank.cmd でも起動できる）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { VOICES, synthToMp3 } from './tts.mjs'
import { headKey, textKey, voiceIndex } from '../src/speech/audioKey.ts'

const here = (p) => new URL(p, import.meta.url)
const BANK = fileURLToPath(here('../../eigo-audio/'))
const LOG = `${BANK}build.log`
const log = (msg) => {
  const line = `[${new Date().toLocaleString('ja-JP')}] ${msg}`
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

const ngsl = JSON.parse(readFileSync(here('../public/data/ngsl.json'), 'utf8')).words
// ビジネス語彙（BSL）は、基本語のこれから学ぶ語のあとに作る
const bsl = JSON.parse(readFileSync(here('../public/data/bsl.json'), 'utf8')).words
const facts = JSON.parse(readFileSync(here('../public/data/facts.json'), 'utf8')).facts
const quotes = JSON.parse(readFileSync(here('../public/data/quotes.json'), 'utf8')).quotes

/** 開始位置（診断テストで決まった、新しいカードを始める順位）。作成中に書き換えても次の区切りから反映する */
function startRank() {
  const f = `${BANK}start-rank.txt`
  const n = existsSync(f) ? Number(readFileSync(f, 'utf8').trim()) : NaN
  return Number.isFinite(n) && n >= 1 ? n : 101
}

/** 作る順番のリスト（毎回作り直し、作成済みは飛ばす） */
function plan() {
  const start = startRank()
  const byRank = [...ngsl].sort((a, b) => a.rank - b.rank)
  const ahead = byRank.filter((w) => w.rank >= start)
  const behind = byRank.filter((w) => w.rank < start)
  const wordJobs = (w) => [
    { kind: 'heads', key: headKey(w.lemma), text: w.lemma, bitrate: '48k', label: `${w.list ?? ''}${w.rank}位 ${w.lemma}` },
    ...w.ex.slice(0, 3).map((e) => ({ kind: 'ex', key: textKey(e.en), text: e.en, bitrate: '32k', label: `${w.list ?? ''}${w.rank}位の例文` })),
  ]
  const factJobs = facts.flatMap((f) => [
    { kind: 'facts', key: `${f.id}-e`, text: f.easy, bitrate: '32k', label: `雑学 ${f.id}（やさしい版）` },
    { kind: 'facts', key: `${f.id}-s`, text: f.std, bitrate: '32k', label: `雑学 ${f.id}（標準版）` },
  ])
  const quoteJobs = quotes.map((q) => ({ kind: 'quotes', key: textKey(q.en), text: q.en, bitrate: '32k', label: '名言' }))
  return [
    ...ahead.slice(0, 200).flatMap(wordJobs),
    ...quoteJobs,
    ...factJobs,
    ...ahead.slice(200).flatMap(wordJobs),
    ...bsl.map((w) => ({ ...w, list: 'ビジネス' })).flatMap(wordJobs),
    ...behind.flatMap(wordJobs),
  ]
}

const fileOf = (j) => `${j.kind}/${j.key}.mp3`

function writeIndex() {
  const index = { version: 1, updatedAt: new Date().toISOString(), heads: [], ex: [], facts: [], quotes: [] }
  const seen = new Set()
  for (const j of plan()) {
    const id = `${j.kind}/${j.key}`
    if (seen.has(id)) continue
    seen.add(id)
    if (existsSync(BANK + fileOf(j))) index[j.kind].push(j.key)
  }
  writeFileSync(`${BANK}index.json`, JSON.stringify(index))
  return index
}

function publish() {
  const index = writeIndex()
  const git = (...args) => execFileSync('git', args, { cwd: BANK, stdio: 'pipe' }).toString()
  // 保存に失敗しても作成は止めない（失敗の理由をログに残し、次の区切りでやり直す）
  try {
    git('add', '-A')
    if (!git('status', '--porcelain').trim()) return
    git('commit', '-q', '-m', `音声を追加（見出し語 ${index.heads.length}、例文 ${index.ex.length}、雑学 ${index.facts.length}、名言 ${index.quotes.length}）`)
  } catch (e) {
    log(`保存（git）に失敗。作成は続けます：${String(e.stderr || e.message).split(String.fromCharCode(10)).filter(Boolean).slice(0, 2).join(' / ')}`)
    return
  }
  for (let i = 0; i < 5; i++) {
    try { git('push', '-q'); log(`公開：見出し語 ${index.heads.length}、例文 ${index.ex.length}、雑学 ${index.facts.length}、名言 ${index.quotes.length}`); return }
    catch (e) { log(`送信に失敗（${i + 1}回目）。少し待ってやり直します：${e.message.split('\n')[0]}`); execFileSync('powershell', ['-Command', 'Start-Sleep -Seconds 60']) }
  }
}

for (const d of ['heads', 'ex', 'facts', 'quotes']) mkdirSync(BANK + d, { recursive: true })
let made = 0
let sincePublish = 0
let lastPublish = Date.now()
const done = new Set()
log(`開始：開始位置 ${startRank()}位`)
// 区切りごとに順番を作り直す（開始位置の書き換えを反映するため）
for (;;) {
  const jobs = plan().filter((j) => !done.has(fileOf(j)) && !existsSync(BANK + fileOf(j)))
  if (!jobs.length) break
  for (const j of jobs.slice(0, 50)) {
    const file = fileOf(j)
    try {
      await synthToMp3(j.text, VOICES[voiceIndex(j.key, VOICES.length)].id, BANK + file, { bitrate: j.bitrate })
      made++
      sincePublish++
    } catch (e) {
      log(`作成に失敗（飛ばします）：${j.label}「${j.text.slice(0, 40)}」${e.message}`)
    }
    done.add(file)
  }
  if (sincePublish >= 300 || Date.now() - lastPublish > 20 * 60_000) {
    publish()
    sincePublish = 0
    lastPublish = Date.now()
    log(`今回作成 ${made} ファイル、残り ${plan().filter((j) => !existsSync(BANK + fileOf(j))).length}`)
  }
}
publish()
log(`完了：今回作成 ${made} ファイル`)
