// 人の朗読の素材：LibriVox「The Aesop for Children」（パブリックドメインの朗読）から数話分を取得し、
// アプリに内蔵する大きさ（モノラル 32kbps）に変換する。本文は Project Gutenberg 版（scripts/raw/materials/jacobs.txt）。
// LibriVox の録音はすべてパブリックドメイン：https://librivox.org/pages/public-domain/
// 出力：public/audio/human/aesop-<区切り番号>.mp3
// 実行: node scripts/fetch-human-audio.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ffmpeg from 'ffmpeg-static'
import { HUMAN_SECTIONS } from './materials/human.mjs'

const here = (p) => new URL(p, import.meta.url)
mkdirSync(here('./raw/librivox/'), { recursive: true })
mkdirSync(here('../public/audio/human/'), { recursive: true })

for (const s of HUMAN_SECTIONS) {
  const raw = here(`./raw/librivox/${s.file}`)
  if (!existsSync(raw)) {
    const res = await fetch(s.url)
    if (!res.ok) throw new Error(`${s.url}: ${res.status}`)
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()))
  }
  const out = here(`../public/audio/human/aesop-${String(s.section).padStart(2, '0')}.mp3`)
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', fileURLToPath(raw), '-ac', '1', '-ar', '22050', '-b:a', '32k', fileURLToPath(out)])
  console.log(`区切り ${s.section}（${s.reader}）`)
}
