// 聞き分けドリルの単語の音声をそろえる。
// 人の録音（fetch-word-audio.mjs で取得）を第一候補にし、1語につき3つの声になるまで Kokoro の合成音声で補う。
// 出力：public/audio/words/*.mp3 と public/data/word-audio.json
// 実行: node scripts/fetch-word-audio.mjs && node scripts/build-word-audio.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { VOICES, synthToMp3 } from './tts.mjs'

const here = (p) => new URL(p, import.meta.url)
const PER_WORD = 3
const groups = JSON.parse(readFileSync(here('../src/practice/pairs.json'), 'utf8'))
const words = [...new Set(groups.flatMap((g) => g.pairs.flat()))].sort()
const human = existsSync(here('./raw/word-audio-human.json'))
  ? JSON.parse(readFileSync(here('./raw/word-audio-human.json'), 'utf8'))
  : {}

const out = {}
let made = 0
for (const [i, w] of words.entries()) {
  const list = [...(human[w] ?? [])].filter((h) => existsSync(here(`../public/audio/${h.file}`)))
  // 語ごとに声の組み合わせをずらし、全体で6つの声がまんべんなく出るようにする
  for (let k = 0; list.length < PER_WORD; k++) {
    const v = VOICES[(i + k) % VOICES.length]
    const file = `words/${w}-${v.id}.mp3`
    const dest = here(`../public/audio/${file}`)
    if (!existsSync(dest)) { await synthToMp3(w, v.id, dest); made++ }
    list.push({ file, kind: 'tts', speaker: v.label, origin: '音声合成（Kokoro-82M）', license: 'Apache-2.0', licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0', source: 'https://huggingface.co/hexgrad/Kokoro-82M' })
  }
  out[w] = list
}
writeFileSync(here('../public/data/word-audio.json'), JSON.stringify({ version: 1, words: out }))
const all = Object.values(out).flat()
console.log(`単語 ${words.length}：音声 ${all.length}件（人の録音 ${all.filter((a) => a.kind === 'human').length}、合成 ${all.filter((a) => a.kind === 'tts').length}、今回作成 ${made}）`)
