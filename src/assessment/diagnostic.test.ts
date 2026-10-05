import { describe, expect, it } from 'vitest'
import type { NgslWord } from '../content/ngsl'
import { BANDS, PER_BAND, PSEUDO_COUNT, buildDiagnostic, scoreDiagnostic, type DiagnosticAnswer } from './diagnostic'

const words: NgslWord[] = Array.from({ length: 2809 }, (_, i) => ({
  id: `ngsl:w${i + 1}`, rank: i + 1, lemma: `word${i + 1}`, forms: [], ja: '', def: '', ex: [],
}))

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

describe('診断テスト', () => {
  it('各順位帯から10語ずつと偽の単語10個を混ぜて出す', () => {
    const qs = buildDiagnostic(words, seeded(1))
    expect(qs).toHaveLength(BANDS.length * PER_BAND + PSEUDO_COUNT)
    for (const [lo, hi] of BANDS) {
      expect(qs.filter((q) => q.rank !== null && q.rank >= lo && q.rank <= hi)).toHaveLength(PER_BAND)
    }
    expect(qs.every((q) => q.rank === null || q.rank > 100)).toBe(true)
  })

  const answer = (knownUpTo: number, pseudoYes: number) => {
    const qs = buildDiagnostic(words, seeded(7))
    let p = 0
    return qs.map((q): DiagnosticAnswer => ({ ...q, known: q.rank === null ? p++ < pseudoYes : q.rank <= knownUpTo }))
  }

  it('上位1,000語だけ知っている人は約1,000語・Phase 2・1001位から', () => {
    const r = scoreDiagnostic(answer(1000, 0))
    expect(r.vocabSize).toBe(1000)
    expect(r.phase).toBe(2)
    expect(r.startRank).toBe(1001)
  })

  it('偽の単語に「知っている」と答えるほど、あやふやな帯の推定を下げる', () => {
    // 1001〜1500位の帯は半分だけ知っている
    const halfBand = (pseudoYes: number) => {
      let p = 0
      let b = 0
      return buildDiagnostic(words, seeded(7)).map((q): DiagnosticAnswer => {
        if (q.rank === null) return { ...q, known: p++ < pseudoYes }
        if (q.rank <= 1000) return { ...q, known: true }
        if (q.rank <= 1500) return { ...q, known: b++ % 2 === 0 }
        return { ...q, known: false }
      })
    }
    const honest = scoreDiagnostic(halfBand(0))
    const over = scoreDiagnostic(halfBand(3))
    expect(honest.bandRates[2]).toBeCloseTo(0.5)
    expect(over.falseAlarmRate).toBeCloseTo(0.3)
    expect(over.bandRates[2]).toBeCloseTo((0.5 - 0.3) / 0.7)
    expect(over.vocabSize).toBeLessThan(honest.vocabSize)
  })

  it('全部「知っている」と答えると0語として扱う', () => {
    expect(scoreDiagnostic(answer(9999, 10)).vocabSize).toBe(0)
  })

  it('何も知らなければ Phase 1・1位から', () => {
    const r = scoreDiagnostic(answer(0, 0))
    expect(r).toMatchObject({ vocabSize: 0, phase: 1, startRank: 1 })
  })
})
