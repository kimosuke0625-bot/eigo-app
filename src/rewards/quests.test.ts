import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'
import { acceptExtra, chooseQuests, claimExtra, EXTRA_MAX, EXTRA_XP, openChest, questCount, readExtra, readQuests, todaysQuests } from './quests'

const all = { fixes: true, phrases: true }
const days = Array.from({ length: 28 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)

describe('クエストの数と目標時間', () => {
  it('60分で3つ、90分で4つ、120分で5つ。その間は段階的', () => {
    expect([15, 30, 60, 75, 89, 90, 105, 119, 120].map(questCount)).toEqual([3, 3, 3, 3, 3, 4, 4, 4, 5])
  })

  it('4つのときは4つの柱から1つずつ。5つのときも柱に偏りがない（4週間で数えて差は最大でも1日分）', () => {
    for (const d of days) {
      const four = chooseQuests(d, all, 4)
      expect(new Set(four.map((q) => q.pillar)).size).toBe(4)
    }
    const count: Record<string, number> = {}
    for (const d of days) for (const q of chooseQuests(d, all, 5)) count[q.pillar] = (count[q.pillar] ?? 0) + 1
    const n = Object.values(count)
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1)
    expect(n.reduce((a, b) => a + b, 0)).toBe(28 * 5)
  })

  it('数を増やしても前のクエストはそのまま含み、同じ課題は重ならない', () => {
    for (const d of days) {
      const three = chooseQuests(d, all, 3).map((q) => q.key)
      const five = chooseQuests(d, all, 5).map((q) => q.key)
      expect(five.slice(0, 3)).toEqual(three)
      expect(new Set(five).size).toBe(5)
    }
  })

  it('その日の途中で目標時間を増やすと、足りない分だけ加わる', async () => {
    const database = new EigoDB('quest-count')
    const day = '2026-10-09'
    const first = (await todaysQuests(day, database)).quests.map((q) => q.def.key)
    expect(first).toHaveLength(3)
    await updateSettings({ targetMinutes: 120 }, database)
    const more = (await todaysQuests(day, database)).quests.map((q) => q.def.key)
    expect(more).toHaveLength(5)
    expect(more.slice(0, 3)).toEqual(first)
  })
})

describe('追加の依頼', () => {
  it('宝箱の後だけ受けられ、達成すると経験値と雑学パック。やらなくても何も減らない。1日3つまで', async () => {
    const database = new EigoDB('quest-extra')
    const day = '2026-10-09'
    expect(await acceptExtra(day, database)).toBe(false)
    // 宝箱を開けた状態にする
    await todaysQuests(day, database)
    await updateSettings({ chestDay: day }, database)
    const before = await getSettings(database)
    expect(await acceptExtra(day, database)).toBe(true)
    expect(await acceptExtra(day, database)).toBe(false) // 受けている途中は次を受けない
    const st = await readExtra(day, database)
    expect(st.current?.done).toBe(false)
    const { quests } = await readQuests(day, database)
    expect(quests.some((q) => q.def.key === st.current!.def.key)).toBe(false)
    expect(await claimExtra(day, database)).toBe(false)
    // 達成した状態を作る（受けた後に増えた分で数える）
    const at = new Date(`${day}T20:00:00`).getTime()
    const def = st.current!.def
    await database.sessions.add({ at, day, kind: def.start, pillar: def.pillar, seconds: 1800, result: { retold: 9 } })
    const card = await database.cards.add({ itemId: def.start === 'grammar' ? 'gram-g01-1' : def.start === 'exprReview' ? 'idiom-x' : 'w1', fsrs: {} as never, due: at, introducedAt: at })
    for (let i = 0; i < 20; i++) await database.reviews.add({ cardId: card as number, at, rating: 3, state: 2, answerMs: 2000, mode: 'x' })
    await database.journal.add({ at, day, kind: 'write', text: '', targets: [], used: [], words: 0, types: 0, prompt: '', phrasesUsed: [1] })
    for (let i = 0; i < 6; i++) await database.cards.add({ itemId: `n${i}`, fsrs: {} as never, due: at, introducedAt: at })
    expect((await readExtra(day, database)).current?.done).toBe(true)
    expect(await claimExtra(day, database)).toBe(true)
    expect(await claimExtra(day, database)).toBe(false)
    const after = await getSettings(database)
    expect(after.xpTotal - before.xpTotal).toBe(EXTRA_XP)
    expect((await database.packs.toArray()).filter((p) => p.source === 'extra')).toHaveLength(1)
    expect((await readExtra(day, database)).claimed).toBe(1)
    expect(EXTRA_MAX).toBe(3)
  })

  it('宝箱は、選んだ数のクエストを全部終えるまで開かない', async () => {
    const database = new EigoDB('quest-chest')
    await updateSettings({ targetMinutes: 90 }, database)
    const day = '2026-10-10'
    expect((await todaysQuests(day, database)).quests).toHaveLength(4)
    expect(await openChest(day, database)).toBe(false)
  })
})
