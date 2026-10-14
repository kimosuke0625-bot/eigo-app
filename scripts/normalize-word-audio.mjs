// 聞き分けドリルの単語の音声を聞き取りやすくそろえる（2026-10-14 利用者の指摘「聞き取りにくい」への対応）。
// 調べた結果：人の録音（Wikimedia Commons・Lingua Libre）は録音ごとに音量がばらばらで（平均の音量の差が約19dB）、
// 312ファイルのうち85ファイルが平均 -30dB より小さかった。話者は問題ごとに変わるので、急に小さい音になる問題で聞き取りにくい。
// 処理：前後の余分な無音を削る（出だしが切れないよう 0.1秒の間は残す）→ 70Hz 未満の低い雑音を削る →
//       音量を EBU R128 の方法で -16 LUFS（最大 -1.5 dBTP）にそろえる（2回測って一定の倍率で上げ下げするので、音の形は変えない）。
// 端末に保存された古い音声と入れ替わるよう、新しいフォルダ words-v3/ に書き、public/data/word-audio.json の場所を書き換える。
// 実行：node scripts/fetch-word-audio.mjs → node scripts/build-word-audio.mjs → node scripts/normalize-word-audio.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ffmpeg from 'ffmpeg-static'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const DIR = 'words-v3'
const TARGET = { I: -16, TP: -1.5, LRA: 11 }
const jsonPath = here('../public/data/word-audio.json')
const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
mkdirSync(here(`../public/audio/${DIR}/`), { recursive: true })

// 前後の無音を削り、低い雑音を削り、出だしと終わりに短い間を付ける
const trim = [
  // 最初に1チャンネルにまとめる（ステレオのまま adelay を通すと片方だけ遅れ、同じ声が0.1秒ずれて重なる。2026-10-14 の words-v2 の不具合）
  'aformat=channel_layouts=mono',
  'highpass=f=70',
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03',
  'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08', 'areverse',
  'afade=t=in:d=0.01', 'adelay=100', 'apad=pad_dur=0.15',
].join(',')

let n = 0
for (const clips of Object.values(data.words)) {
  for (const c of clips) {
    const src = 'words/' + c.file.split('/').pop()
    const name = src.split('/').pop()
    const out = `${DIR}/${name}`
    const dest = here(`../public/audio/${out}`)
    if (!existsSync(dest)) {
      const input = here(`../public/audio/${src}`)
      // 1回目：音量を測る
      const m = spawnSync(ffmpeg, ['-hide_banner', '-f', 'mp3', '-i', input, '-af', `${trim},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' })
      const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf('{'), m.stderr.lastIndexOf('}') + 1))
      // 2回目：測った値を使って、一定の倍率で音量をそろえる（linear=true）
      const ln = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'mp3', '-i', input, '-af', `${trim},${ln}`, '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', dest])
      n++
    }
    c.file = out
  }
}
data.version = 2
writeFileSync(jsonPath, JSON.stringify(data))
console.log(`音量をそろえた音声：今回 ${n}件（${DIR}/）`)
