import { describe, expect, it } from 'vitest'
import { buildFormIndex, fitOf, knownRatio, tokenize } from './knownRatio'
import { countWords, splitSentences } from '../speech/sentences'
import { diffWords, normalizeWords } from '../practice/dictationScore'

const items = [
  { id: 'go', english: 'go', forms: ['go', 'goes', 'went', 'gone'], ngslRank: 10 },
  { id: 'to', english: 'to', forms: ['to'], ngslRank: 5 },
  { id: 'school', english: 'school', forms: ['school', 'schools'], ngslRank: 100 },
  { id: 'he', english: 'he', forms: ['he'], ngslRank: 8 },
  { id: 'be', english: 'be', forms: ['be', 'is', 'was'], ngslRank: 2 },
  { id: 'not', english: 'not', forms: ['not'], ngslRank: 20 },
  { id: 'happy', english: 'happy', forms: ['happy'], ngslRank: 500 },
]
const index = buildFormIndex(items)

describe('既知語率', () => {
  it('人名と数字は数えず、活用形も見出し語として判定する', () => {
    const r = knownRatio('He went to school with Tom in 2020.', index, new Set(['go', 'to', 'school', 'he']))
    // He went to school with in → with, in は知らない（NGSL外）
    expect(r.counted).toBe(6)
    expect(r.ratio).toBeCloseTo(4 / 6)
    expect(r.unknown.map((u) => u.word)).toEqual(['with', 'in'])
  })

  it("短縮形の 's や n't を取り除いて判定する", () => {
    const t = tokenize("He's happy. Isn't he?")
    expect(t.map((x) => x.lower)).toEqual(['he', 'happy', 'is', 'he'])
  })

  it('文頭の大文字は固有名詞として扱わない', () => {
    const t = tokenize('School is fun. Tom goes.')
    expect(t.map((x) => x.proper)).toEqual([false, false, false, false, false])
  })

  it('95〜98%を「ちょうどよい」とする', () => {
    expect(fitOf(0.99)).toBe('easy')
    expect(fitOf(0.96)).toBe('just')
    expect(fitOf(0.92)).toBe('stretch')
    expect(fitOf(0.8)).toBe('hard')
  })
})

describe('文に分ける', () => {
  it('Mr. などの略語では区切らない', () => {
    expect(splitSentences('Dear Mr. Lee, thank you. See you soon! "Really?" he said.')).toEqual([
      'Dear Mr. Lee, thank you.', 'See you soon!', '"Really?" he said.',
    ])
  })
  it('段落でも区切る', () => {
    expect(splitSentences('One line\n\nTwo lines here.')).toEqual(['One line', 'Two lines here.'])
  })
  it('語数を数える', () => {
    expect(countWords("I don't know 3 things.")).toBe(5)
  })
})

describe('ディクテーションの採点', () => {
  it('大文字小文字・句読点・数字の書き方の違いは問わない', () => {
    expect(normalizeWords('I have Two cats!')).toEqual(['i', 'have', '2', 'cats'])
    expect(diffWords('I have two cats.', 'i have 2 cats').score).toBe(1)
  })

  it('抜けた語と余分な語を見分ける', () => {
    const r = diffWords('She went to the station.', 'she go to station')
    expect(r.matched).toBe(3)
    expect(r.total).toBe(5)
    expect(r.tokens.map((t) => `${t.kind}:${t.text}`)).toEqual([
      'ok:She', 'extra:go', 'missing:went', 'ok:to', 'missing:the', 'ok:station.',
    ])
  })

  it('何も書かなければ0点', () => {
    expect(diffWords('Hello there.', '').score).toBe(0)
  })
})
