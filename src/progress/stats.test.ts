import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { State } from '../srs/fsrs'
import { newFsrsCard } from '../srs/fsrs'
import { fillDaily, suggestPhase, weeklyMetric, weeklyPillars, weeklyRecall, writeSnapshot } from './stats'

const TODAY = '2026-10-14' // 水曜

describe('進捗の集計', () => {
  it('柱ごとの学習時間を週に分けて集計する', () => {
    const rows = weeklyPillars([
      { day: '2026-10-12', pillar: 'language', seconds: 600 },
      { day: '2026-10-14', pillar: 'input', seconds: 900 },
      { day: '2026-10-06', pillar: 'language', seconds: 300 },
      { day: '2025-01-01', pillar: 'output', seconds: 999 },
    ], TODAY, 3)
    expect(rows.map((r) => r.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
    expect(rows[2].minutes).toEqual({ language: 10, input: 15, fluency: 0, output: 0 })
    expect(rows[1].minutes.language).toBe(5)
  })

  it('正答率は復習中のカードだけで計算し、少ない週は空にする', () => {
    const at = new Date(2026, 9, 13, 9).getTime()
    const reviews = [
      ...Array.from({ length: 8 }, () => ({ at, rating: 3, state: State.Review })),
      ...Array.from({ length: 2 }, () => ({ at, rating: 1, state: State.Review })),
      ...Array.from({ length: 5 }, () => ({ at, rating: 1, state: State.Learning })),
    ]
    const w = weeklyRecall(reviews, TODAY, 2)
    expect(w[1]).toMatchObject({ rate: 0.8, count: 10 })
    expect(w[0].rate).toBeNull()
  })

  it('練習結果の数値を週ごとに平均する', () => {
    const w = weeklyMetric([
      { day: '2026-10-12', result: { dictation: 0.6 } },
      { day: '2026-10-13', result: { dictation: 0.8 } },
      { day: '2026-10-13', result: { wpm: 100 } },
    ], 'dictation', TODAY, 2)
    expect(w[1].value).toBeCloseTo(0.7)
    expect(w[0].value).toBeNull()
  })

  it('記録のない日は前日の値で埋める', () => {
    const filled = fillDaily([
      { day: '2026-10-11', mature: 5, cards: 20, known: 100 },
      { day: '2026-10-13', mature: 8, cards: 25, known: 100 },
    ], TODAY)
    expect(filled.map((f) => f.mature)).toEqual([5, 5, 8, 8])
  })

  it('安定度21日以上の復習カードを定着した語彙として数える', async () => {
    const database = new EigoDB('snap-1')
    const card = (stability: number, state: number) => ({ ...newFsrsCard(0), stability, state })
    await database.cards.bulkAdd([
      { itemId: 'a', due: 0, introducedAt: 0, fsrs: card(30, State.Review) },
      { itemId: 'b', due: 0, introducedAt: 0, fsrs: card(5, State.Review) },
      { itemId: 'c', due: 0, introducedAt: 0, fsrs: card(40, State.Relearning) },
    ])
    await database.knownWords.put({ itemId: 'x', source: 'self', at: 0 })
    expect(await writeSnapshot(database, TODAY)).toEqual({ day: TODAY, mature: 1, cards: 3, known: 1, exprMature: 0, exprCards: 0 })
  })
})

describe('Phase の自動切り替え', () => {
  it('語彙数の目安で上げる', () => {
    expect(suggestPhase({ vocab: 999, listening: null, current: 1 })).toBe(1)
    expect(suggestPhase({ vocab: 1000, listening: null, current: 1 })).toBe(2)
    expect(suggestPhase({ vocab: 2100, listening: null, current: 2 })).toBe(3)
  })
  it('聞き取りが70%未満なら Phase 3 に上げない', () => {
    expect(suggestPhase({ vocab: 2100, listening: 0.6, current: 2 })).toBe(2)
    expect(suggestPhase({ vocab: 2100, listening: 0.75, current: 2 })).toBe(3)
  })
  it('自動では下げない', () => {
    expect(suggestPhase({ vocab: 100, listening: null, current: 3 })).toBe(3)
  })
})
