// 旅の手帳の表現（利用者が添削から取り込んだもの）を、PC の高品質な声で音声にする（フェーズ7.5、案A）。
//
// 1. iPhone で「データを書き出す」をしたバックアップ（eigo-backup-YYYYMMDD.json）を PC のダウンロードフォルダに置く
// 2. scripts\run-my-audio.cmd を実行する（いちばん新しいバックアップを自動で選ぶ。ファイルを指定してもよい）
// 3. できた eigo-my-audio-YYYYMMDD.json を iPhone に移し、アプリの 設定 →「自分の音声」から読み込む
//
// 学習データを端末の外に出さないため、作った音声は公開の音声置き場（eigo-audio）には置かない。
// 作った mp3 は C:\Users\<名前>\eigo-my-audio\ に残し、次回は作り直さない（表現が増えた分だけ作る）。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { VOICES, synthToMp3 } from './tts.mjs'
import { textKey, voiceIndex, normalizeText } from '../src/speech/audioKey.ts'

const DOWNLOADS = join(homedir(), 'Downloads')
const STORE = join(homedir(), 'eigo-my-audio')
mkdirSync(STORE, { recursive: true })

/** 読むバックアップ：引数で指定、なければダウンロードフォルダのいちばん新しいもの */
function pickBackup() {
  if (process.argv[2]) return process.argv[2]
  const files = readdirSync(DOWNLOADS).filter((f) => /^eigo-backup-.*\.json$/.test(f))
    .map((f) => join(DOWNLOADS, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (!files.length) throw new Error(`ダウンロードフォルダ（${DOWNLOADS}）に eigo-backup-….json が見つかりません。iPhone で書き出したバックアップを置いてください。`)
  return files[0]
}

const file = pickBackup()
console.log(`バックアップ：${file}`)
const backup = JSON.parse(readFileSync(file, 'utf8'))
if (backup.format !== 'eigo-backup') throw new Error('このアプリのバックアップファイルではありません')
const phrases = backup.tables.phrases ?? []

// 表現と例文（同じ英文は1回だけ）
const texts = new Map()
for (const p of phrases) {
  for (const t of [p.expression, p.example]) {
    const text = normalizeText(t ?? '')
    if (text) texts.set(textKey(text), text)
  }
}
console.log(`旅の手帳の表現 ${phrases.length} 個、読み上げる英文 ${texts.size} 個`)

let made = 0
let failed = 0
const clips = []
for (const [key, text] of texts) {
  const mp3 = join(STORE, `${key}.mp3`)
  if (!existsSync(mp3)) {
    try {
      await synthToMp3(text, VOICES[voiceIndex(key, VOICES.length)].id, mp3, { bitrate: '32k' })
      made++
      process.stdout.write(`\r作成 ${made}`)
    } catch (e) {
      failed++
      console.log(`\n作成に失敗（飛ばします）：「${text.slice(0, 40)}」${e.message}`)
      continue
    }
  }
  clips.push({ key, text, mp3: readFileSync(mp3).toString('base64') })
}

const p2 = (n) => String(n).padStart(2, '0')
const d = new Date()
const out = join(process.env.EIGO_MY_AUDIO_OUT ?? DOWNLOADS, `eigo-my-audio-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.json`)
writeFileSync(out, JSON.stringify({ format: 'eigo-my-audio', version: 1, createdAt: Date.now(), voice: 'Kokoro-82M', clips }))
const mb = (statSync(out).size / 1048576).toFixed(1)
console.log(`\n\n完了：新しく作った ${made} 個、前に作った分 ${clips.length - made} 個、失敗 ${failed} 個`)
console.log(`できたファイル：${out}（${mb}MB）`)
console.log('このファイルを iPhone に移し、アプリの 設定 →「自分の音声（旅の手帳）」から読み込んでください。')
