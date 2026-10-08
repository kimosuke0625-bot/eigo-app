import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { updateSettings } from '../db/settings'
import { deckOf } from './deck'
import { newFsrsCard } from './fsrs'
import { dueCounts, introducePhrases, newCardsRemaining, recordReview, todaysQueue, waitingPhrases } from './store'

const NOW = new Date(2026, 9, 8, 9).getTime()

async function setup(name: string) {
  const database = new EigoDB(name)
  const add = (itemId: string) => database.cards.add({ itemId, fsrs: newFsrsCard(NOW - 86_400_000), due: NOW - 1000, introducedAt: NOW - 86_400_000 })
  for (let i = 0; i < 6; i++) await add(`w${i}`)
  for (let i = 1; i <= 3; i++) await add(`phrase-${i}`)
  return database
}

describe('単語と表現の束', () => {
  it('語の id で束が決まる（取り込み済みの表現のカードは表現の側）', () => {
    expect(deckOf('phrase-12')).toBe('expr')
    expect(deckOf('idiom-3')).toBe('expr')
    expect(deckOf('decide')).toBe('word')
    expect(deckOf('bsl:agenda')).toBe('word')
  })

  it('今日の復習と残り枚数は束ごと。上限も別々', async () => {
    const database = await setup('deck-1')
    expect(await dueCounts(NOW, database)).toEqual({ word: 6, expr: 3 })
    expect((await todaysQueue('word', NOW, database)).every((c) => deckOf(c.itemId) === 'word')).toBe(true)
    expect(await todaysQueue('expr', NOW, database)).toHaveLength(3)
    await updateSettings({ reviewCap: 4, exprReviewCap: 2 }, database)
    expect(await todaysQueue('word', NOW, database)).toHaveLength(4)
    expect(await todaysQueue('expr', NOW, database)).toHaveLength(2)
    // 表現を1枚復習しても、単語の上限は減らない
    const [c] = await todaysQueue('expr', NOW, database)
    await recordReview(c, 3, { answerMs: 3000, mode: 'expr', now: NOW }, database)
    expect(await todaysQueue('word', NOW, database)).toHaveLength(4)
    expect(await todaysQueue('expr', NOW, database)).toHaveLength(1)
  })

  it('新しく加える数も別々：表現は1日の数まで、単語は設定の上限まで', async () => {
    const database = new EigoDB('deck-2')
    for (let i = 0; i < 4; i++) {
      const id = await database.phrases.add({ at: i, day: '2026-10-08', expression: `ex ${i}`, meaning: '', example: '', scene: '', source: 'write', used: 0 }) as number
      await database.items.put({ id: `phrase-${id}`, kind: 'chunk', english: `ex ${i}`, examples: [] })
    }
    await updateSettings({ exprNewPerDay: 3, wordNewPerDay: 5 }, database)
    expect(await introducePhrases(NOW, database)).toBe(3)
    expect(await introducePhrases(NOW, database)).toBe(0)
    expect(await waitingPhrases(database)).toBe(1)
    expect(await newCardsRemaining(NOW, database)).toBe(5)
  })
})
