import { describe, expect, it } from 'vitest'
import { isHighQualityVoice } from './voices'

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
