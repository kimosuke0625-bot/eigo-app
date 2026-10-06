import { describe, expect, it } from 'vitest'
import { isHighQualityVoice, voiceScore } from './voices'

const v = (voiceURI: string, name = voiceURI) => ({ voiceURI, name })

describe('高品質な声だけを使う', () => {
  it('iPhone・Mac は拡張・プレミアムの声だけ', () => {
    expect(isHighQualityVoice(v('com.apple.voice.enhanced.en-US.Evan', 'Evan (Enhanced)'))).toBe(true)
    expect(isHighQualityVoice(v('com.apple.voice.premium.en-US.Zoe', 'Zoe (Premium)'))).toBe(true)
    expect(isHighQualityVoice(v('com.apple.voice.compact.en-US.Samantha', 'Samantha'))).toBe(false)
    expect(isHighQualityVoice(v('com.apple.speech.synthesis.voice.Albert', 'Albert'))).toBe(false)
    expect(isHighQualityVoice(v('com.apple.eloquence.en-US.Rocko', 'Rocko'))).toBe(false)
  })
  it('PC は Edge の Natural と Chrome の Google の声', () => {
    expect(isHighQualityVoice(v('Microsoft Aria Online (Natural) - English (United States)'))).toBe(true)
    expect(isHighQualityVoice(v('Google US English'))).toBe(true)
    expect(isHighQualityVoice(v('Microsoft Zira - English (United States)'))).toBe(false)
  })
})

describe('高品質な声がないときに使う声の順位', () => {
  const voice = (voiceURI: string, lang = 'en-US', localService = true) => ({ voiceURI, name: voiceURI, lang, localService })
  it('高品質 > ふつうの英語の声 > 遊びの声・古い声', () => {
    const list = [
      voice('com.apple.speech.synthesis.voice.Albert'),
      voice('com.apple.eloquence.en-US.Rocko'),
      voice('com.apple.voice.compact.en-US.Samantha'),
      voice('com.apple.voice.compact.en-IN.Rishi', 'en-IN'),
      voice('com.apple.voice.enhanced.en-GB.Daniel', 'en-GB'),
    ]
    const ranked = [...list].sort((a, b) => voiceScore(b) - voiceScore(a)).map((v) => v.voiceURI)
    expect(ranked[0]).toBe('com.apple.voice.enhanced.en-GB.Daniel')
    expect(ranked[1]).toBe('com.apple.voice.compact.en-US.Samantha')
    expect(ranked.slice(-2).sort()).toEqual(['com.apple.eloquence.en-US.Rocko', 'com.apple.speech.synthesis.voice.Albert'])
  })
})
