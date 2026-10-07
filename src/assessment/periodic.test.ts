import { describe, expect, it } from 'vitest'
import type { Mat } from '../content/materials'
import { assessmentDue, declineReasons, pickUnseenReading, pickUnseenSentences } from './periodic'

const mat = (id: string, body: string, questions = true): Mat => ({
  id, title: id, body, kind: 'graded', source: '', sourceUrl: '', license: '', wordCount: 0,
  questions: questions ? [{ q: 'q', options: ['a', 'b'], answer: 0 }] : undefined,
})

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

describe('4週間ごとの測定', () => {
  it('前回の測定か使い始めから28日たったら時期', () => {
    const day = 86_400_000
    expect(assessmentDue(undefined, 0, 27 * day)).toBe(false)
    expect(assessmentDue(undefined, 0, 28 * day)).toBe(true)
    expect(assessmentDue(30 * day, 0, 40 * day)).toBe(false)
  })

  it('ディクテーションは使っていない素材の文を、素材ごとに1文ずつ選ぶ', () => {
    const ms = ['a', 'b', 'c', 'd'].map((id) => mat(id, `This is a short sentence from ${id}. Another sentence comes here now.`))
    const used = new Map([['a', 1], ['b', 2]])
    const picked = pickUnseenSentences(ms, used, 2, seeded(1))
    expect(new Set(picked.map((p) => p.materialId))).toEqual(new Set(['c', 'd']))
  })

  it('速読は使っていない、ディクテーションで使わなかった素材から選ぶ', () => {
    const list = [{ m: mat('a', 'x'), ratio: 0.97 }, { m: mat('b', 'x'), ratio: 0.97 }, { m: mat('c', 'x'), ratio: 0.8 }]
    expect(pickUnseenReading(list, new Map([['a', 1]]), new Set(['b']))?.id).toBe('c')
  })

  it('下がった項目に原因の候補を出し、誤差（5%未満）は無視する', () => {
    const weeks = [{ week: 'w', minutes: { language: 300, input: 20, fluency: 10, output: 0 } }]
    const r = declineReasons(
      { at: 1, kind: 'periodic', dictation: 0.6, readingWpm: 98, vocabSize: 1000 },
      { at: 0, kind: 'periodic', dictation: 0.8, readingWpm: 100, vocabSize: 900 },
      weeks, 12,
    )
    expect(r.map((x) => x.key)).toEqual(['dictation'])
    expect(r[0].reasons.join(' ')).toContain('12日')
    expect(r[0].reasons.join(' ')).toContain('多聴・多読')
  })
})
