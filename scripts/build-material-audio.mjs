// 内蔵素材（多聴・多読、シャドーイング、速読、対話の役割練習）の音声を、文ごとの mp3 として作る。
// 端末の読み上げ音声は機械的で聞き取りにくいことがあるため、品質の高い音声合成（Kokoro-82M）で
// PC であらかじめ作ってアプリに内蔵する。素材ごとに声を変え、複数の話者の声に触れられるようにする。
// 対話（kind: 'dialogue'）は話者ごとに声を変え、「話者: 」の部分は読み上げない。
// 出力：public/audio/materials/<素材id>/<番号>.mp3 と public/data/material-audio.json
// 実行: node scripts/build-material-audio.mjs（作り直しが必要な文だけ作る）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { splitSentences } from '../src/speech/sentences.ts'
import { VOICES, synthToMp3 } from './tts.mjs'

const here = (p) => new URL(p, import.meta.url)
const { materials } = JSON.parse(readFileSync(here('../public/data/materials.json'), 'utf8'))
const manifestPath = here('../public/data/material-audio.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, materials: {} }

const female = VOICES.filter((v) => v.id[1] === 'f')
const male = VOICES.filter((v) => v.id[1] === 'm')

/** 対話の話者に声を割り当てる（同じ性別の話者が2人いれば別の声。対話ごとにずらす） */
function dialogueVoices(m, n) {
  const out = {}
  const used = { f: 0, m: 0 }
  for (const [name, g] of Object.entries(m.speakers)) {
    const pool = g === 'f' ? female : male
    out[name] = pool[(n + used[g]++) % pool.length]
  }
  return out
}

let made = 0
let dialogueNo = 0
for (const [i, m] of materials.entries()) {
  // 人の朗読がある素材は合成音声を作らない
  if (m.kind === 'human') continue
  const dialogue = m.kind === 'dialogue'
  const voiceOf = dialogue ? dialogueVoices(m, dialogueNo++) : null
  // 前に作った素材は前と同じ声のまま（素材を足して並びが変わっても作り直さない）
  const single = VOICES.find((v) => v.id === manifest.materials[m.id]?.voice) ?? VOICES[i % VOICES.length]
  // [読み上げる文（アプリが探す鍵）, 合成する文, 声]
  const items = []
  for (const para of m.body.split(/\n\s*\n/)) {
    const who = dialogue ? para.match(/^([^:]{1,24}): /)?.[1] : undefined
    const voice = who ? voiceOf[who] : single
    for (const [k, s] of splitSentences(para).entries()) items.push([s, k === 0 && who ? s.slice(who.length + 2) : s, voice])
  }
  if (m.moral) items.push([`Moral: ${m.moral}`, `Moral: ${m.moral}`, single])

  const dir = here(`../public/audio/materials/${m.id}/`)
  mkdirSync(dir, { recursive: true })
  const prev = manifest.materials[m.id]
  const clips = {}
  const voices = {}
  for (const [n, [key, text, voice]] of items.entries()) {
    const file = `materials/${m.id}/${String(n + 1).padStart(2, '0')}.mp3`
    // 同じ文で同じ声なら作り直さない（素材の文が変わったときだけ作る）
    const prevVoice = prev?.voices?.[key] ?? prev?.voice
    const reuse = prevVoice === voice.id && prev.clips[key] === file && existsSync(here(`../public/audio/${file}`))
    // 追加した読み物・対話は容量を抑えるため 32kbps（例文と同じ）
    const bitrate = m.kind === 'business' || dialogue ? '32k' : '48k'
    if (!reuse) { await synthToMp3(text, voice.id, here(`../public/audio/${file}`), { bitrate }); made++ }
    clips[key] = file
    voices[key] = voice.id
  }
  manifest.materials[m.id] = dialogue
    ? { voice: 'multi', voiceLabel: Object.entries(voiceOf).map(([name, v]) => `${name}＝${v.label}`).join('、'), clips, voices }
    : { voice: single.id, voiceLabel: single.label, clips }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  console.log(`${m.id}（${dialogue ? '対話' : single.id}）${items.length}文`)
}
console.log(`完了：今回作成 ${made}文`)
