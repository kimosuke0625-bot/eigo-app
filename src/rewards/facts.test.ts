import { describe, expect, it } from 'vitest'
import { pickFact, type FactContent } from './facts'

const fact = (id: string, easy: string, extra: Partial<FactContent> = {}): FactContent => ({
  id, category: 'science', emoji: '', ja: '', easy, std: easy, source: '', rare: false, origin: 'old', ...extra,
})

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

describe('今日の雑学を選ぶ', () => {
  it('持っている雑学と外した雑学は出さない', () => {
    const facts = [fact('a', 'x'), fact('b', 'y'), fact('c', 'z')]
    const owned = new Map([
      ['a', { id: 'a', category: 'science', acquiredAt: 1 }],
      ['b', { id: 'b', category: 'science', excluded: true }],
    ])
    for (let i = 0; i < 20; i++) {
      expect(pickFact({ facts, owned, reviewedWords: new Set(), liked: new Set(), phase: 1, rand: seeded(i + 1) })?.id).toBe('c')
    }
  })

  it('全部持っていれば何も出さない', () => {
    const owned = new Map([['a', { id: 'a', category: 'science', acquiredAt: 1 }]])
    expect(pickFact({ facts: [fact('a', 'x')], owned, reviewedWords: new Set(), liked: new Set(), phase: 1 })).toBeUndefined()
  })

  it('今日復習した単語を含む雑学と、好きな分野を出やすくし、レアは出にくくする', () => {
    const facts = [
      fact('plain', 'nothing here'),
      fact('word', 'the moon moves away', {}),
      fact('liked', 'nothing here', { category: 'history' }),
      fact('rare', 'nothing here', { rare: true }),
    ]
    const count: Record<string, number> = {}
    const rand = seeded(42)
    for (let i = 0; i < 4000; i++) {
      const f = pickFact({ facts, owned: new Map(), reviewedWords: new Set(['moon', 'away']), liked: new Set(['history']), phase: 1, rand })!
      count[f.id] = (count[f.id] ?? 0) + 1
    }
    expect(count.word).toBeGreaterThan(count.plain * 2)
    expect(count.liked).toBeGreaterThan(count.plain * 1.5)
    expect(count.rare).toBeLessThan(count.plain * 0.5)
  })
})
