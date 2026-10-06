import { useEffect, useState } from 'react'

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * 高品質な声か。機械的で聞き取りにくい声は使わない。
 * - iPhone・Mac：「拡張（enhanced）」「プレミアム（premium）」の声だけ
 * - Windows の Edge：Natural（ニューラル）の声
 * - Chrome：Google の声
 */
export function isHighQualityVoice(v: Pick<SpeechSynthesisVoice, 'voiceURI' | 'name'>): boolean {
  const id = `${v.voiceURI} ${v.name}`
  if (/com\.apple\./i.test(id)) return /\.(enhanced|premium)\./i.test(id) || /\((enhanced|premium|拡張|プレミアム)\)/i.test(id)
  return /natural|neural|premium|enhanced|google/i.test(id)
}

function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
}

/** 使ってよい（高品質な）英語の声 */
export function highQualityVoices(): SpeechSynthesisVoice[] {
  return englishVoices().filter(isHighQualityVoice)
}

/** 端末に入っている高品質な英語の声の一覧（読み込みが遅い端末にも対応） */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!speechSupported()) return
    const load = () => setVoices(highQualityVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

/** 高品質な声が入っていないときに知らせる（App が案内を表示する） */
export const NO_HQ_VOICE_EVENT = 'eigo:no-hq-voice'

/** 選んだ声（なければ最初の高品質な声）。高品質な声が1つもなければ undefined */
export function pickVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
  const hq = highQualityVoices()
  return hq.find((v) => v.voiceURI === voiceURI) ?? hq[0]
}

/**
 * 英文を読み上げる。高品質な声がなければ読み上げず、案内を出して false を返す。
 * （聞き取りの練習なので、機械的な声で間違った音を覚えないようにする）
 */
export function speak(text: string, voiceURI: string, rate = 1, onEnd?: () => void): boolean {
  if (!speechSupported()) return false
  const voice = pickVoice(voiceURI)
  if (!voice) {
    window.dispatchEvent(new Event(NO_HQ_VOICE_EVENT))
    onEnd?.()
    return false
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = rate
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd }
  speechSynthesis.speak(u)
  return true
}
