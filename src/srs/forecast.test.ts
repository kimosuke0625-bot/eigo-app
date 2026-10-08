import { describe, expect, it } from 'vitest'
import { dailyReviewsAt, reviewForecast, reviewOffsets } from './forecast'

describe('復習の量の見込み', () => {
  it('1枚の復習は間がだんだん空く（当日の出し直しを含む）', () => {
    const o = reviewOffsets(0.9, 120)
    expect(o[0]).toBe(0)
    for (let i = 2; i < o.length; i++) expect(o[i] - o[i - 1]).toBeGreaterThan(o[i - 1] - o[i - 2])
  })
  it('1日の枚数に比例し、日がたつほど減らない', () => {
    expect(dailyReviewsAt(28, 20, 0.9)).toBe(2 * dailyReviewsAt(28, 10, 0.9))
    const f = reviewForecast(20, 0.9, 8, [1, 2, 4, 8])
    for (let i = 1; i < f.length; i++) expect(f[i].reviews).toBeGreaterThanOrEqual(f[i - 1].reviews)
    expect(f[0].minutes).toBe(Math.round((f[0].reviews * 8) / 60))
  })
})
