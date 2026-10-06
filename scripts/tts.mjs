// PC であらかじめ音声ファイルを作るための音声合成（Kokoro-82M、Apache-2.0）
// 作った WAV は ffmpeg で mp3（モノラル 48kbps）に変換してアプリに内蔵する。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpeg from 'ffmpeg-static'
import { KokoroTTS } from 'kokoro-js'

/** 使う声（品質の高いものから、アメリカ・イギリス、男女を混ぜる） */
export const VOICES = [
  { id: 'af_heart', label: 'Kokoro af_heart（アメリカ英語・女性）' },
  { id: 'am_michael', label: 'Kokoro am_michael（アメリカ英語・男性）' },
  { id: 'bf_emma', label: 'Kokoro bf_emma（イギリス英語・女性）' },
  { id: 'bm_george', label: 'Kokoro bm_george（イギリス英語・男性）' },
  { id: 'af_bella', label: 'Kokoro af_bella（アメリカ英語・女性）' },
  { id: 'am_fenrir', label: 'Kokoro am_fenrir（アメリカ英語・男性）' },
]

let tts = null
export async function loadTts() {
  tts ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
  return tts
}

const tmp = mkdtempSync(join(tmpdir(), 'eigo-tts-'))
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }))

/** 英文を読み上げて mp3 に保存する。文の前後の無音は短く切る */
export async function synthToMp3(text, voice, dest, { speed = 1 } = {}) {
  const t = await loadTts()
  const audio = await t.generate(text, { voice, speed })
  const wav = join(tmp, 'out.wav')
  await audio.save(wav)
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', wav,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.15',
    '-ac', '1', '-ar', '24000', '-b:a', '48k', dest instanceof URL ? fileURLToPath(dest) : dest,
  ])
}
