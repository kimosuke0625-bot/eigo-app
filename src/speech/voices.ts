import { useEffect, useState } from 'react'

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** 端末に入っている英語の声の一覧（読み込みが遅い端末にも対応） */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!speechSupported()) return
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en')))
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

export function speak(text: string, voiceURI: string, rate = 1) {
  if (!speechSupported()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-US'
  u.rate = rate
  speechSynthesis.speak(u)
}
