import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { getSettings } from '../db/settings'
import { chooseQuests, openChest, QUESTS, todaysQuests, CHEST_XP } from './quests'
import { bossQuestions, claimComeback, COMEBACK_XP, daysAway, defeatBoss, firstGloss, isBossDay, loadVersus } from './boss'
import { ensureTeaser, openPack } from './packs'
import type { FactContent } from './facts'
import { addXp } from './xp'

describe('今日のクエスト', () => {
  it('毎日3つ。4日で4つの柱が同じ回数ずつ出る', () => {
    const count: Record<string, number> = {}
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']) {
      const qs = chooseQuests(d, { fixes: true, phrases: true })
      expect(qs).toHaveLength(3)
      expect(new Set(qs.map((q) => q.pillar)).size).toBe(3)
      for (const q of qs) count[q.pillar] = (count[q.pillar] ?? 0) + 1
    }
    expect(count).toEqual({ language: 3, input: 3, fluency: 3, output: 3 })
  })

  it('直しや表現がまだないときは、それを使うクエストを出さない', () => {
    for (let i = 1; i <= 28; i++) {
      const d = `2026-11-${String(i).padStart(2, '0')}`
      for (const q of chooseQuests(d, { fixes: false, phrases: false })) expect(q.needs).toBeUndefined()
    }
  })

  it('その日のうちは同じクエスト。3つ達成で宝箱（経験値と雑学パック）、2回は開かない', async () => {
    const database = new EigoDB('quest-1')
    const day = '2026-10-08'
    const first = await todaysQuests(day, database)
    await database.fixes.add({ feedbackId: 1, at: 0, day, original: 'a', corrected: 'b', type: '時制', note: '', practiced: 0 })
    const again = await todaysQuests(day, database)
    expect(again.quests.map((q) => q.def.key)).toEqual(first.quests.map((q) => q.def.key))
    expect(await openChest(day, database)).toBe(false)
    // 3つとも達成した状態を作る
    const at = new Date(`${day}T09:00:00`).getTime()
    for (const q of first.quests) {
      const kind = q.def.start
      await database.sessions.add({ at, day, kind, pillar: q.def.pillar, seconds: 1800, result: { retold: 9 } })
    }
    for (let i = 0; i < 20; i++) await database.reviews.add({ cardId: i, at, rating: 3, state: 2, answerMs: 2000, mode: 'word' })
    for (let i = 0; i < 6; i++) await database.cards.add({ itemId: `w${i}`, fsrs: {} as never, due: at, introducedAt: at })
    await database.journal.add({ at, day, kind: 'write', text: '', targets: [], used: [], words: 0, types: 0, prompt: '', phrasesUsed: [1] })
    const done = await todaysQuests(day, database)
    expect(done.quests.every((q) => q.done)).toBe(true)
    expect(await openChest(day, database)).toBe(true)
    expect(await openChest(day, database)).toBe(false)
    expect((await getSettings(database)).xpTotal).toBe(CHEST_XP)
    expect(await database.packs.where('day').equals(day).count()).toBe(1)
  })

  it('クエストの課題はすべて、どれかの柱に属する', () => {
    expect(new Set(QUESTS.map((q) => q.pillar))).toEqual(new Set(['language', 'input', 'fluency', 'output']))
  })
})

describe('週のボス戦', () => {
  it('週末だけ出る', () => {
    expect(isBossDay(new Date(2026, 9, 10))).toBe(true) // 土
    expect(isBossDay(new Date(2026, 9, 11))).toBe(true) // 日
    expect(isBossDay(new Date(2026, 9, 8))).toBe(false) // 木
  })

  it('その週に覚えた語から出題し、選択肢は4つで正解を1つ含む', async () => {
    const database = new EigoDB('boss-1')
    const at = new Date(2026, 9, 6, 9).getTime() // 火曜
    const words = ['decide', 'travel', 'enjoy', 'borrow', 'arrive', 'explain']
    for (const [i, w] of words.entries()) {
      await database.items.put({ id: w, kind: 'word', english: w, japanese: `意味${i}、べつの意味`, examples: [], ngslRank: i + 1 })
      await database.cards.add({ itemId: w, fsrs: {} as never, due: at, introducedAt: at })
    }
    const qs = await bossQuestions('2026-10-10', database)
    expect(qs).toHaveLength(6)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(q.options).toContain(q.answer)
      expect(new Set(q.options).size).toBe(4)
    }
    expect(firstGloss('決める、決心する')).toBe('決める')
    // 前の週の語しかなければ出ない（4語未満）
    expect(await bossQuestions('2026-10-24', database)).toEqual([])
  })

  it('倒すと経験値と雑学パック。同じ週は1回だけ', async () => {
    const database = new EigoDB('boss-2')
    await defeatBoss(8, '2026-10-10', database)
    await defeatBoss(8, '2026-10-11', database)
    expect(await database.bosses.count()).toBe(1)
    expect(await database.packs.count()).toBe(1)
    expect((await getSettings(database)).xpTotal).toBe(200)
  })
})

describe('おかえりボーナスと過去の自分', () => {
  it('2日以上休んで戻った日に1回だけ', async () => {
    const database = new EigoDB('back-1')
    await database.settings.put({ ...(await getSettings(database)) })
    expect(await claimComeback('2026-10-08', database)).toBe(false) // 初めての人
    await database.sessions.add({ at: 0, day: '2026-10-06', kind: 'input', pillar: 'input', seconds: 300 })
    expect(await daysAway('2026-10-08', database)).toBe(2)
    expect(await claimComeback('2026-10-08', database)).toBe(false) // 1日休んだだけ
    expect(await claimComeback('2026-10-09', database)).toBe(true)
    expect(await claimComeback('2026-10-09', database)).toBe(false)
    expect((await getSettings(database)).xpTotal).toBe(COMEBACK_XP)
  })

  it('先週の同じ曜日・同じ時点と比べる', async () => {
    const database = new EigoDB('versus-1')
    await addXp(100, {}, database, '2026-09-29') // 先週の火
    await addXp(50, {}, database, '2026-10-01') // 先週の木
    await addXp(120, {}, database, '2026-10-05') // 今週の月
    await addXp(70, {}, database, '2026-10-08') // 今週の木（今日）
    expect(await loadVersus('2026-10-08', database)).toEqual({ today: 70, lastWeekDay: 50, thisWeek: 190, lastWeekSoFar: 150 })
  })
})

describe('明日の雑学の予告', () => {
  const fact = (id: string): FactContent => ({ id, category: 'animals', emoji: '', ja: id, easy: 'a', std: 'a', source: '', rare: false, origin: 'new' })
  const facts = ['a', 'b', 'c', 'd'].map(fact)

  it('予告した雑学が翌日の最初のパックに入る。届くまでは同じものを予告する', async () => {
    const database = new EigoDB('teaser-1')
    const t = await ensureTeaser({ facts, liked: new Set(), phase: 1, rand: () => 0.99 }, database, '2026-10-07')
    expect(t).toBeTruthy()
    // 翌日はパックを開けないまま夜になった：同じ雑学をもう一度予告する
    expect((await ensureTeaser({ facts, liked: new Set(), phase: 1, rand: () => 0 }, database, '2026-10-08'))?.id).toBe(t!.id)
    const pack = { id: await database.packs.add({ at: 0, day: '2026-10-09', source: 'input', xp: 0, opened: 0, notified: 0 }) as number, at: 0, day: '2026-10-09', source: 'input', xp: 0, opened: 0 as const, notified: 0 as const }
    const r = await openPack(pack, { facts, reviewedWords: new Set(), liked: new Set(), phase: 1, rand: () => 0 }, database, '2026-10-09')
    expect(r.fact?.id).toBe(t!.id)
    expect((await getSettings(database)).teaserFactId).toBe('')
  })
})
