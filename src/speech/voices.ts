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
  if (!speechSupported()) {
    reportSpeech({ state: 'fail', reason: 'この端末（ブラウザ）は英文の読み上げに対応していません。' })
    onEnd?.()
    return false
  }
  const voice = pickVoice(voiceURI)
  if (!notified && !isAppleMobile() && !(voice && isHighQualityVoice(voice))) {
    notified = true
    window.dispatchEvent(new Event(NO_HQ_VOICE_EVENT))
  }
  // iPhone で音声ファイル（復習カードなど）を鳴らした後は、その音が読み上げの邪魔をしないよう止めておく
  beforeSpeak?.()
  // iOS 17 以降：消音（マナーモード）のスイッチに関係なく鳴らす（対応していない端末では何もしない）
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session && session.type !== 'playback') session.type = 'playback'
  } catch { /* 対応していない */ }

  const u = new SpeechSynthesisUtterance(text)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-US'
  u.rate = rate
  // Safari は読み上げ中の文を参照し続けないと、途中で消えて鳴らないことがある
  current = u
  let started = false
  let finished = false
  const end = () => { if (finished) return; finished = true; window.clearTimeout(watch); if (current === u) current = null; onEnd?.() }
  u.onstart = () => { started = true; reportSpeech({ state: 'start' }) }
  u.onend = () => { reportSpeech({ state: 'end' }); end() }
  u.onerror = (e) => {
    // 次の読み上げに切り替えたとき（interrupted・canceled）は失敗ではない
    if (e.error !== 'interrupted' && e.error !== 'canceled') reportSpeech({ state: 'fail', reason: speechErrorText(e.error) })
    end()
  }
  // 一定時間たっても始まらないときは、黙ったままにせず理由を出す
  const watch = window.setTimeout(() => {
    if (started || finished) return
    reportSpeech({ state: 'fail', reason: '読み上げが始まりませんでした。もう一度押してください。続くときはアプリを閉じて開き直してください。' })
    speechSynthesis.cancel()
    end()
  }, 4000)

  // 前の読み上げが残っていて止まっているとき（iPhone で画面を切り替えた後など）は、止めてから読む
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
  if (speechSynthesis.paused) speechSynthesis.resume()
  speechSynthesis.speak(u)
  return true
}

let current: SpeechSynthesisUtterance | null = null
let beforeSpeak: (() => void) | null = null
/** 端末の声で読む直前に呼ぶ処理（音声ファイルの再生を止める）。clips.ts が登録する */
export function setBeforeSpeak(fn: () => void) {
  beforeSpeak = fn
}

/** 読み上げの様子（画面に「端末の声で読んでいます」や、鳴らなかった理由を出す） */
export interface SpeechStatus { state: 'start' | 'end' | 'fail'; reason?: string }
export const SPEECH_STATUS_EVENT = 'eigo:speech-status'
function reportSpeech(s: SpeechStatus) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<SpeechStatus>(SPEECH_STATUS_EVENT, { detail: s }))
}

/** 読み上げの失敗の理由（SpeechSynthesisErrorEvent の error）を短い日本語にする */
export function speechErrorText(code: string): string {
  switch (code) {
    case 'not-allowed':
      return '端末が読み上げを止めました。ボタンをもう一度押してください（iPhone は押した直後でないと読めません）。'
    case 'audio-busy':
    case 'audio-hardware':
      return 'ほかの音（音楽や通話など）が使っているため、読み上げられませんでした。'
    case 'language-unavailable':
    case 'voice-unavailable':
      return '英語の声が見つかりませんでした。設定 →「読み上げの声」を確かめてください。'
    case 'text-too-long':
      return '文が長すぎて読み上げられませんでした。'
    case 'network':
      return '通信が必要な声のため、読み上げられませんでした。'
    default:
      return `読み上げに失敗しました（${code || '理由不明'}）。もう一度押してください。`
  }
}
