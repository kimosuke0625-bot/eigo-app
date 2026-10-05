import { speechSupported } from './voices'

/**
 * 文を1つずつ続けて読み上げる。読んでいる文の番号を onIndex で知らせ、止める関数を返す。
 * 1文ずつに分けると、長い文章でも途中で止まりにくく、読んでいる位置を表示できる。
 */
export function speakSentences(opts: {
  sentences: string[]
  from: number
  rate: number
  voiceURI: string
  onIndex: (i: number) => void
  onEnd: () => void
}): () => void {
  if (!speechSupported()) {
    opts.onEnd()
    return () => {}
  }
  let stopped = false
  const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === opts.voiceURI)
  const play = (i: number) => {
    if (stopped) return
    if (i >= opts.sentences.length) { opts.onEnd(); return }
    opts.onIndex(i)
    const u = new SpeechSynthesisUtterance(opts.sentences[i])
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-US'
    u.rate = opts.rate
    u.onend = () => play(i + 1)
    u.onerror = () => { if (!stopped) opts.onEnd() }
    speechSynthesis.speak(u)
  }
  speechSynthesis.cancel()
  play(opts.from)
  return () => {
    stopped = true
    speechSynthesis.cancel()
  }
}
