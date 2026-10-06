// 内蔵素材（多聴・多読、シャドーイング、速読）の音声を、文ごとの mp3 として作る。
// 端末の読み上げ音声は機械的で聞き取りにくいことがあるため、品質の高い音声合成（Kokoro-82M）で
// PC であらかじめ作ってアプリに内蔵する。素材ごとに声を変え、複数の話者の声に触れられるようにする。
// 出力：public/audio/materials/<素材id>/<番号>.mp3 と public/data/material-audio.json
// 実行: node scripts/build-material-audio.mjs（全30本で30分ほどかかる）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { splitSentences } from '../src/speech/sentences.ts'
import { VOICES, synthToMp3 } from './tts.mjs'

const here = (p) => new URL(p, import.meta.url)
const { materials } = JSON.parse(readFileSync(here('../public/data/materials.json'), 'utf8'))
const manifestPath = here('../public/data/material-audio.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, materials: {} }

let made = 0
for (const [i, m] of materials.entries()) {
  const voice = VOICES[i % VOICES.length]
  const texts = [...m.body.split(/\n\s*\n/).flatMap((p) => splitSentences(p)), ...(m.moral ? [`Moral: ${m.moral}`] : [])]
  const dir = here(`../public/audio/materials/${m.id}/`)
  mkdirSync(dir, { recursive: true })
  const clips = {}
  for (const [n, text] of texts.entries()) {
    const file = `materials/${m.id}/${String(n + 1).padStart(2, '0')}.mp3`
    // 同じ文で同じ声なら作り直さない（素材の文が変わったときだけ作る）
    const prev = manifest.materials[m.id]
    const reuse = prev?.voice === voice.id && prev.clips[text] === file && existsSync(here(`../public/audio/${file}`))
    if (!reuse) { await synthToMp3(text, voice.id, here(`../public/audio/${file}`)); made++ }
    clips[text] = file
  }
  manifest.materials[m.id] = { voice: voice.id, voiceLabel: voice.label, clips }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  console.log(`${m.id}（${voice.id}）${texts.length}文`)
}
console.log(`完了：今回作成 ${made}文`)
