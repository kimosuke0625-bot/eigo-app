// 内蔵の音声ファイル（人の録音と、PC で作った高品質な合成音声）を再生する。
// iPhone では、画面をタップして一度再生を始めた audio 要素なら、その後は続けて再生できるので、1つの要素を使い回す。
import { setBeforeSpeak, speak } from './voices'

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
// 端末の声で読む前に、鳴っている音声ファイルを止める（iPhone で同時に鳴らすと読み上げが聞こえないことがある）
setBeforeSpeak(() => { if (el && !el.paused) el.pause() })

/** アプリに内蔵した音声ファイルを再生する（public/audio/ からの相対パス） */
export function playFile(file: string, rate = 1, onEnd?: () => void): () => void {
  return playUrl(base() + file, rate, onEnd)
}

/**
 * 音声を再生する。終わったら（失敗しても）onEnd を呼ぶ。止める関数を返す。
 * onError を渡すと、読み込めなかったときは onEnd の代わりにそれを呼ぶ（端末の声に切り替えるため）
 */
export function playUrl(url: string, rate = 1, onEnd?: () => void, onError?: () => void): () => void {
  const a = audioEl()
  a.onended = null
  a.onerror = null
  a.pause()
  a.src = url
  a.playbackRate = rate
  // 速さを変えても音の高さは変えない
  ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
  let done = false
  const finish = () => { if (!done) { done = true; onEnd?.() } }
  const fail = () => { if (!done) { done = true; if (onError) onError(); else onEnd?.() } }
  a.onended = finish
  a.onerror = fail
  void a.play().catch((e: Error) => (e?.name === 'NotAllowedError' ? finish() : fail()))
  return () => { done = true; a.pause() }
}

export function stopAudio() {
  if (el && !el.paused) el.pause()
  // 鳴っていないときは cancel しない（iPhone で、cancel の直後にマイクを開くと止まることがあるため）
  if ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel()
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
  /** くり返し（none：1回だけ、all：全体を最初から、one：いまの1文）。再生中に変えてもすぐ効くよう、その都度読む */
  repeat?: () => RepeatMode
  /** 全体をくり返すとき、最後の文まで聞き終えるたびに呼ぶ */
  onLoop?: () => void
}): () => void {
  let stopped = false
  let stopCurrent = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let startedAt = 0
  const play = (i: number) => {
    if (stopped) return
    if (i >= opts.sentences.length) { opts.onEnd(); return }
    opts.onIndex(i)
    startedAt = Date.now()
    const file = opts.clips?.[opts.sentences[i]]
    if (file) {
      stopCurrent = playFile(file, opts.rate, () => after(i))
    } else {
      const ok = speak(opts.sentences[i], opts.voiceURI, opts.rate, () => after(i))
      if (!ok) { stopped = true; opts.onEnd() }
    }
  }
  // 1文を読み終えた後：くり返しの設定で、同じ文・最初の文・次の文を選ぶ。
  // すぐに終わった（再生できなかった）ときは、くり返さずに先へ進む（無音のまま回り続けないように）
  const after = (i: number) => {
    if (stopped) return
    const mode = opts.repeat?.() ?? 'none'
    const played = Date.now() - startedAt > REPEAT_MIN_MS
    if (mode === 'one' && played) { timer = setTimeout(() => play(i), REPEAT_GAP_MS); return }
    if (i + 1 >= opts.sentences.length && mode === 'all' && played) {
      opts.onLoop?.()
      timer = setTimeout(() => play(0), REPEAT_GAP_MS * 2)
      return
    }
    play(i + 1)
  }
  stopAudio()
  play(opts.from)
  return () => {
    stopped = true
    clearTimeout(timer)
    stopCurrent()
    stopAudio()
  }
}

export type RepeatMode = 'none' | 'all' | 'one'
/** くり返すときの間（ミリ秒）。全体のくり返しはこの2倍あける */
export const REPEAT_GAP_MS = 700
/** これより短く終わった文は「再生できなかった」とみなす */
const REPEAT_MIN_MS = 300

/** 素材の音声（なければ undefined）。声の説明も返す */
export async function materialClips(materialId: string): Promise<MaterialAudio | undefined> {
  return (await loadMaterialAudio())[materialId]
}
