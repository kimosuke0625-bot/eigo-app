import { describe, expect, it } from 'vitest'
import { isBannedVoice, isHighQualityVoice, voiceScore } from './voices'

const v = (voiceURI: string, name = voiceURI) => ({ voiceURI, name })

describe('声の判定', () => {
  it('iPhone・Mac の高品質な声は拡張・プレミアム', () => {
    expect(isHighQualityVoice(v('com.apple.voice.enhanced.en-US.Evan', 'Evan (Enhanced)'))).toBe(true)
    expect(isHighQualityVoice(v('com.apple.voice.premium.en-US.Zoe', 'Zoe (Premium)'))).toBe(true)
    expect(isHighQualityVoice(v('com.apple.voice.super-compact.en-US.Samantha', 'Samantha'))).toBe(false)
  })
  it('PC は Edge の Natural と Chrome の Google の声', () => {
    expect(isHighQualityVoice(v('Microsoft Aria Online (Natural) - English (United States)'))).toBe(true)
    expect(isHighQualityVoice(v('Google US English'))).toBe(true)
    expect(isHighQualityVoice(v('Microsoft Zira - English (United States)'))).toBe(false)
  })
  it('遊び用の声と Eloquence の声は使わない', () => {
    expect(isBannedVoice(v('com.apple.speech.synthesis.voice.Bahh'))).toBe(true)
    expect(isBannedVoice(v('com.apple.speech.synthesis.voice.Deranged'))).toBe(true)
    expect(isBannedVoice(v('com.apple.eloquence.en-US.Rocko'))).toBe(true)
    expect(isBannedVoice(v('com.apple.voice.super-compact.en-US.Samantha'))).toBe(false)
  })
})

describe('使う声の順位', () => {
  const voice = (voiceURI: string, lang: string) => ({ voiceURI, name: voiceURI, lang, localService: true })
  it('iPhone の super-compact の声では、アメリカ英語 > イギリス英語 > ほかの地域', () => {
    const list = [
      voice('com.apple.voice.super-compact.en-IN.Rishi', 'en-IN'),
      voice('com.apple.voice.super-compact.en-GB.Daniel', 'en-GB'),
      voice('com.apple.voice.super-compact.en-AU.Karen', 'en-AU'),
      voice('com.apple.voice.super-compact.en-US.Samantha', 'en-US'),
    ]
    const ranked = [...list].sort((a, b) => voiceScore(b) - voiceScore(a)).map((x) => x.lang)
    expect(ranked.slice(0, 2)).toEqual(['en-US', 'en-GB'])
  })
  it('高品質な声が最優先', () => {
    expect(voiceScore(voice('Microsoft Libby Online (Natural)', 'en-GB'))).toBeGreaterThan(voiceScore(voice('com.apple.voice.super-compact.en-US.Samantha', 'en-US')))
  })
})

describe('音声ファイルの名前', () => {
  it('Windows で使えない名前（con など）を避ける', async () => {
    const { headKey } = await import('./audioKey')
    expect(headKey('con')).toBe('con_w')
    expect(headKey('Aux')).toBe('aux_w')
    expect(headKey('console')).toBe('console')
    expect(headKey('ice cream')).toBe('ice_cream')
  })
})
