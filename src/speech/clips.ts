// 内蔵の音声ファイル（人の録音と、PC で作った高品質な合成音声）を再生する。
// iPhone では、画面をタップして一度再生を始めた audio 要素なら、その後は続けて再生できるので、1つの要素を使い回す。
import { speak } from './voices'

export interface WordClip {
  file: string
  kind: 'human' | 'tts'
  speaker: string
  origin: string
  license: string
  licenseUrl: string
  source: string
}

interface MaterialAudio {
  voice: string
  voiceLabel: string
  /** 文 → 音声ファイル */
  clips: Record<string, string>
}

const base = () => `${import.meta.env.BASE_URL}audio/`

let wordCache: Promise<Record<string, WordClip[]>> | null = null
export function loadWordAudio(): Promise<Record<string, WordClip[]>> {
  wordCache ??= fetch(`${import.meta.env.BASE_URL}data/word-audio.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ words: Record<string, WordClip[]> }>) : { words: {} }))
    .then((d) => d.words)
    .catch(() => { wordCache = null; return {} })
  return wordCache
}

let materialCache: Promise<Record<string, MaterialAudio>> | null = null
export function loadMaterialAudio(): Promise<Record<string, MaterialAudio>> {
  materialCache ??= fetch(`${import.meta.env.BASE_URL}data/material-audio.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ materials: Record<string, MaterialAudio> }>) : { materials: {} }))
    .then((d) => d.materials)
    .catch(() => { materialCache = null; return {} })
  return materialCache
}

let el: HTMLAudioElement | null = null
function audioEl(): HTMLAudioElement {
  el ??= new Audio()
  return el
}

/** 音声ファイルを再生する。終わったら（失敗しても）onEnd を呼ぶ。止める関数を返す */
export function playFile(file: string, rate = 1, onEnd?: () => void): () => void {
  const a = audioEl()
  a.onended = null
  a.onerror = null
  a.pause()
  a.src = base() + file
  a.playbackRate = rate
  // 速さを変えても音の高さは変えない
  ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
  let done = false
  const finish = () => { if (!done) { done = true; onEnd?.() } }
  a.onended = finish
  a.onerror = finish
  void a.play().catch(finish)
  return () => { done = true; a.pause() }
}

export function stopAudio() {
  el?.pause()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}

/**
 * 文を1つずつ続けて読む。内蔵の音声ファイルがある文はそれを、ない文は端末の高品質な声で読む。
 * 読んでいる文の番号を onIndex で知らせ、止める関数を返す。
 */
export function playSentences(opts: {
  sentences: string[]
  clips?: Record<string, string>
  from: number
  rate: number
  voiceURI: string
  onIndex: (i: number) => void
  onEnd: () => void
}): () => void {
  let stopped = false
  let stopCurrent = () => {}
  const play = (i: number) => {
    if (stopped) return
    if (i >= opts.sentences.length) { opts.onEnd(); return }
    opts.onIndex(i)
    const file = opts.clips?.[opts.sentences[i]]
    if (file) {
      stopCurrent = playFile(file, opts.rate, () => play(i + 1))
    } else {
      const ok = speak(opts.sentences[i], opts.voiceURI, opts.rate, () => play(i + 1))
      if (!ok) { stopped = true; opts.onEnd() }
    }
  }
  stopAudio()
  play(opts.from)
  return () => {
    stopped = true
    stopCurrent()
    stopAudio()
  }
}

/** 素材の音声（なければ undefined）。声の説明も返す */
export async function materialClips(materialId: string): Promise<MaterialAudio | undefined> {
  return (await loadMaterialAudio())[materialId]
}
