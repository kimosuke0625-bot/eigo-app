import { useEffect, useState } from 'react'

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * 高品質な声か。
 * - iPhone・Mac：「拡張（enhanced）」「プレミアム（premium）」の声
 * - Windows の Edge：Natural（ニューラル）の声
 * - Chrome：Google の声
 * ※ iPhone の Safari は、利用者が追加した声を Web アプリに見せないことがある。見えている一覧は設定画面で確認できる。
 */
export function isHighQualityVoice(v: Pick<SpeechSynthesisVoice, 'voiceURI' | 'name'>): boolean {
  const id = `${v.voiceURI} ${v.name}`
  if (/com\.apple\./i.test(id)) return /\.(enhanced|premium)\./i.test(id) || /\((enhanced|premium|拡張|プレミアム)\)/i.test(id)
  return /natural|neural|premium|enhanced|google/i.test(id)
}

/** Mac・iPhone の、聞き取りの練習に向かない遊びの声やかなり古い声 */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|princess|eloquence|rocko|shelley|sandy|grandma|grandpa|eddy|flo|reed/i

/**
 * 声のよさの順位（大きいほどよい）。高品質な声 > ふつうの英語の声 > 古い声・遊びの声。
 * 同じ段階では、端末の中で動く声、アメリカ・イギリス英語を優先する。
 */
export function voiceScore(v: Pick<SpeechSynthesisVoice, 'voiceURI' | 'name' | 'lang' | 'localService'>): number {
  let s = 0
  if (isHighQualityVoice(v)) s += 100
  if (NOVELTY.test(`${v.voiceURI} ${v.name}`)) s -= 100
  if (/^en[-_](us|gb)/i.test(v.lang)) s += 10
  if (v.localService) s += 2
  return s
}

function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
}

/** 使える英語の声を、よい順に並べたもの */
export function rankedVoices(): SpeechSynthesisVoice[] {
  return englishVoices().sort((a, b) => voiceScore(b) - voiceScore(a))
}

export function highQualityVoices(): SpeechSynthesisVoice[] {
  return englishVoices().filter(isHighQualityVoice)
}

/** 端末から見えている英語の声（よい順）。読み込みが遅い端末にも対応 */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!speechSupported()) return
    const load = () => setVoices(rankedVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

/** 高品質な声が見つからなかったことを、一度だけ小さく知らせる（App が表示する） */
export const NO_HQ_VOICE_EVENT = 'eigo:no-hq-voice'
let notified = false

/** 選んだ声。選んでいなければ、使える中で一番よい英語の声。英語の声が1つも見えなければ undefined */
export function pickVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
  const ranked = rankedVoices()
  return ranked.find((v) => v.voiceURI === voiceURI) ?? ranked[0]
}

/**
 * 英文を読み上げる。音は止めない：高品質な声がなくても、使える中で一番よい英語の声で必ず読む。
 * 英語の声が一覧に1つも見えないときも、言語だけ英語にして端末の標準の声で読む。
 */
export function speak(text: string, voiceURI: string, rate = 1, onEnd?: () => void): boolean {
  if (!speechSupported()) { onEnd?.(); return false }
  const voice = pickVoice(voiceURI)
  if (!notified && !(voice && isHighQualityVoice(voice))) {
    notified = true
    window.dispatchEvent(new Event(NO_HQ_VOICE_EVENT))
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-US'
  u.rate = rate
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd }
  speechSynthesis.speak(u)
  return true
}
