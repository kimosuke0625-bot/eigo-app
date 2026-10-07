import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { newFsrsCard } from '../srs/fsrs'
import { lastWeekSummary } from './weekly'

describe('週のまとめ', () => {
  it('先週の学習時間・練習日数・思い出そうとした回数・よく思い出せた語', async () => {
    const database = new EigoDB('weekly-1')
    // 今日は 2026-10-14（水）→ 先週は 10/5〜10/11
    const at = (d: number, h = 9) => new Date(2026, 9, d, h).getTime()
    await database.sessions.bulkAdd([
      { at: at(6), day: '2026-10-06', kind: 'review', pillar: 'language', seconds: 600 },
      { at: at(7), day: '2026-10-07', kind: 'review', pillar: 'language', seconds: 1200 },
      { at: at(8), day: '2026-10-08', kind: 'facts', pillar: 'input', seconds: 300 },
      { at: at(1), day: '2026-10-01', kind: 'review', pillar: 'language', seconds: 900 },
    ])
    await database.items.put({ id: 'w', kind: 'word', english: 'decide', examples: [] })
    const card = await database.cards.add({ itemId: 'w', fsrs: newFsrsCard(0), due: 0, introducedAt: at(6) })
    await database.reviews.bulkAdd([
      { cardId: card!, at: at(6), rating: 3, state: 2, answerMs: 1, mode: 'word' },
      { cardId: card!, at: at(7), rating: 4, state: 2, answerMs: 1, mode: 'word' },
      { cardId: card!, at: at(13), rating: 3, state: 2, answerMs: 1, mode: 'word' },
    ])
    const s = await lastWeekSummary('2026-10-14', database)
    expect(s).toMatchObject({ week: '2026-10-05', minutes: 35, days: 2, attempts: 2, newCards: 1, bestWord: 'decide', prevMinutes: 15 })
  })

  it('先週に練習していなければまとめを出さない', async () => {
    expect(await lastWeekSummary('2026-10-14', new EigoDB('weekly-2'))).toBeUndefined()
  })
})
