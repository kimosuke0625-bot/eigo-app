import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { updateSettings } from '../db/settings'
import { deckOf } from './deck'
import { newFsrsCard } from './fsrs'
import { dueCounts, introduceIdioms, introducePhrases, newCardsRemaining, recordReview, todaysQueue, waitingIdioms, waitingPhrases } from './store'

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

  it('表現は1日2回まで（覚えたてでも同じ表現が何度も続かない）。単語には上限なし', async () => {
    const database = await setup('deck-3')
    const expr = (await todaysQueue('expr', NOW, database))[0]
    const word = (await todaysQueue('word', NOW, database))[0]
    for (let i = 0; i < 2; i++) {
      await database.reviews.add({ cardId: expr.id!, at: NOW - 1000, rating: 1, state: 0, answerMs: 3000, mode: 'expr' })
      await database.reviews.add({ cardId: word.id!, at: NOW - 1000, rating: 1, state: 0, answerMs: 3000, mode: 'word' })
    }
    expect((await todaysQueue('expr', NOW, database)).map((c) => c.id)).not.toContain(expr.id)
    expect((await todaysQueue('word', NOW, database)).map((c) => c.id)).toContain(word.id)
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

  it('熟語は旅の手帳の表現と別に数え、頻度の順（渡した順）に加える', async () => {
    const database = new EigoDB('deck-4')
    const order = ['idiom-give-up', 'idiom-at-least', 'idiom-kind-of', 'idiom-as-if']
    for (const id of order) await database.items.put({ id, kind: 'chunk', english: id.slice(6), examples: [] })
    const pid = await database.phrases.add({ at: 1, day: '2026-10-08', expression: 'ex', meaning: '', example: '', scene: '', source: 'write', used: 0 }) as number
    await database.items.put({ id: `phrase-${pid}`, kind: 'chunk', english: 'ex', examples: [] })
    await updateSettings({ idiomNewPerDay: 2, exprNewPerDay: 1 }, database)
    expect(await introduceIdioms(order, NOW, database)).toBe(2)
    expect(await introduceIdioms(order, NOW, database)).toBe(0)
    // 熟語を加えても、旅の手帳の表現の枠は残る
    expect(await introducePhrases(NOW, database)).toBe(1)
    const carded = (await database.cards.toArray()).map((c) => c.itemId)
    expect(carded).toEqual(expect.arrayContaining(['idiom-give-up', 'idiom-at-least']))
    expect(carded).not.toContain('idiom-kind-of')
    expect(await waitingIdioms(order, database)).toBe(2)
    expect(await todaysQueue('expr', NOW, database)).toHaveLength(3)
  })
})
