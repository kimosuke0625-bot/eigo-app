import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { grantTitles, newTitles, TITLES, type Stats } from './titles'

const base: Stats = {
  reviews: 0, cards: 0, mature: 0, streak: 0, bestStreak: 0, practiceDays: 0, facts: 0, rareFacts: 0, phase: 1,
  assessments: 0, recordings: 0, journal: 0, earlyBird: false, nightOwl: false, perfectDictation: false, conversation: 0,
}

describe('称号', () => {
  it('正解数ではなく、思い出そうとした回数で称号が付く', () => {
    const got = newTitles({ ...base, reviews: 120 }, new Set()).map((t) => t.key)
    expect(got).toEqual(['first-step', 'try-100'])
  })
  it('持っている称号はもう出さない', () => {
    expect(newTitles({ ...base, reviews: 120 }, new Set(['first-step', 'try-100']))).toEqual([])
  })
  it('称号といっしょに配色テーマ・効果音セットが解放される', async () => {
    const database = new EigoDB('titles-1')
    await grantTitles(TITLES.filter((t) => t.key === 'streak-30'), database)
    const rows = await database.rewards.toArray()
    expect(rows.map((r) => `${r.kind}:${r.key}`)).toEqual(['title:streak-30', 'theme:sunset'])
  })
  it('称号の鍵は重ならない', () => {
    expect(new Set(TITLES.map((t) => t.key)).size).toBe(TITLES.length)
  })
})
