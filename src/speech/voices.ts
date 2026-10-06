import { useEffect, useState } from 'react'

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** iPhone・iPad（iPadOS の Safari は Mac と名乗るので、タッチ対応でも判定する） */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

/**
 * 高品質な声か。
 * - iPhone・Mac：「拡張（enhanced）」「プレミアム（premium）」の声（ただし iPhone の Safari は Web アプリに見せない）
 * - Windows の Edge：Natural（ニューラル）の声
 * - Chrome：Google の声
 */
export function isHighQualityVoice(v: Pick<SpeechSynthesisVoice, 'voiceURI' | 'name'>): boolean {
  const id = `${v.voiceURI} ${v.name}`
  if (/com\.apple\./i.test(id)) return /\.(enhanced|premium)\./i.test(id) || /\((enhanced|premium|拡張|プレミアム)\)/i.test(id)
  return /natural|neural|premium|enhanced|google/i.test(id)
}

/**
 * どの練習でも絶対に使わない声。
 * Mac・iPhone の遊び用の声（識別子が com.apple.speech.synthesis.voice. で始まる Bahh、Bells、Deranged など）と、
 * 古い Eloquence の声（Rocko、Shelley など）。声の選択肢にも出さない。
 */
export function isBannedVoice(v: Pick<SpeechSynthesisVoice, 'voiceURI'>): boolean {
  return /^com\.apple\.speech\.synthesis\.voice\./i.test(v.voiceURI) || /^com\.apple\.eloquence\./i.test(v.voiceURI)
}

/**
 * 声のよさの順位（大きいほどよい）。
 * 高品質な声 > アメリカ・イギリス英語 > ほかの地域の英語。iPhone では super-compact の声のうちアメリカ・イギリス英語が選ばれる。
 */
export function voiceScore(v: Pick<SpeechSynthesisVoice, 'voiceURI' | 'name' | 'lang' | 'localService'>): number {
  let s = 0
  if (isHighQualityVoice(v)) s += 100
  if (/^en[-_]us/i.test(v.lang)) s += 12
  else if (/^en[-_]gb/i.test(v.lang)) s += 10
  if (v.localService) s += 2
  return s
}

/** 使ってよい英語の声（遊び用の声などを除く） */
function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en') && !isBannedVoice(v))
}

/** 使える英語の声を、よい順に並べたもの */
export function rankedVoices(): SpeechSynthesisVoice[] {
  return englishVoices().sort((a, b) => voiceScore(b) - voiceScore(a))
}

export function highQualityVoices(): SpeechSynthesisVoice[] {
  return englishVoices().filter(isHighQualityVoice)
}

/** 選べる英語の声（よい順）。読み込みが遅い端末にも対応 */
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

/** PC で高品質な声が見つからなかったことを、一度だけ小さく知らせる（iPhone では知らせない：追加しても見えないため） */
export const NO_HQ_VOICE_EVENT = 'eigo:no-hq-voice'
let notified = false

/** 選んだ声。選んでいなければ、使える中で一番よい英語の声。使える声がなければ undefined */
export function pickVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
  const ranked = rankedVoices()
  return ranked.find((v) => v.voiceURI === voiceURI) ?? ranked[0]
}

/**
 * 英文を端末の声で読み上げる。音は止めない：高品質な声がなくても、使える中で一番よい英語の声で必ず読む。
 * 使える英語の声が一覧に見えないときも、言語だけ英語にして端末の標準の声で読む。遊び用の声は使わない。
 */
export function speak(text: string, voiceURI: string, rate = 1, onEnd?: () => void): boolean {
  if (!speechSupported()) { onEnd?.(); return false }
  const voice = pickVoice(voiceURI)
  if (!notified && !isAppleMobile() && !(voice && isHighQualityVoice(voice))) {
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
