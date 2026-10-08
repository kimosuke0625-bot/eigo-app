import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { getSettings } from '../db/settings'
import { addXp, comboStage, levelFromXp, migrateXp, practiceXp, reviewXp, xpToNext } from './xp'
import { ensureDailyPack, finishPractice, NEW_FACTS_PER_DAY, openPack } from './packs'
import type { FactContent } from './facts'

const never = () => 0.99
describe('経験値', () => {
  it('レベル：最初は100で上がり、だんだん必要な量が増える', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 100 })
    expect(levelFromXp(99).level).toBe(1)
    expect(levelFromXp(100)).toEqual({ level: 2, into: 0, need: xpToNext(2) })
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(2))
    // 1日約1,300の経験値で、2年（730日）でおよそ Lv 99
    const lv = levelFromXp(1300 * 730).level
    expect(lv).toBeGreaterThan(90)
    expect(lv).toBeLessThan(110)
  })

  it('1問ごと：初めては10、同じカードの出し直しは少なく、連打は1', () => {
    expect(reviewXp({ attemptsToday: 0, answerMs: 3000, combo: 0, rand: never }).total).toBe(10)
    expect(reviewXp({ attemptsToday: 1, answerMs: 3000, combo: 0, rand: never }).total).toBe(3)
    expect(reviewXp({ attemptsToday: 5, answerMs: 3000, combo: 0, rand: never }).total).toBe(1)
    expect(reviewXp({ attemptsToday: 0, answerMs: 300, combo: 0, rand: never }).total).toBe(1)
  })

  it('コンボ倍率と会心の一撃', () => {
    expect(comboStage(2)).toBe(0)
    expect(comboStage(3)).toBe(1)
    expect(comboStage(10)).toBe(3)
    expect(comboStage(50)).toBe(4)
    expect(reviewXp({ attemptsToday: 0, answerMs: 3000, combo: 10, rand: never }).total).toBe(13)
    // 倍率は最大1.5倍
    expect(reviewXp({ attemptsToday: 0, answerMs: 3000, combo: 99, rand: never }).total).toBe(15)
    // 会心の一撃（1回目の乱数 < 5%、2回目の乱数で2倍か3倍）
    const seq = [0.01, 0.5]
    const g = reviewXp({ attemptsToday: 0, answerMs: 3000, combo: 0, rand: () => seq.shift()! })
    expect(g).toMatchObject({ crit: 2, total: 20 })
    // 出し直しのカードでは会心は出ない
    expect(reviewXp({ attemptsToday: 1, answerMs: 3000, combo: 0, rand: () => 0 }).crit).toBe(1)
  })

  it('表現の復習：コンボは少ない回数で上がり、連打の判定はゆるい', () => {
    expect(comboStage(2, 'expr')).toBe(1)
    expect(comboStage(8, 'expr')).toBe(4)
    expect(comboStage(8)).toBe(2)
    expect(reviewXp({ attemptsToday: 0, answerMs: 600, combo: 0, deck: 'expr', rand: never }).total).toBe(10)
    expect(reviewXp({ attemptsToday: 0, answerMs: 600, combo: 0, rand: never }).total).toBe(1)
    expect(practiceXp('exprReview', 600)).toBe(20)
  })

  it('正直ボーナス：「忘れた」を押すと満額のときだけ5を足す（連打・出し直しは除く）', () => {
    expect(reviewXp({ attemptsToday: 0, answerMs: 3000, combo: 0, forgot: true, rand: never })).toMatchObject({ honest: 5, total: 15 })
    expect(reviewXp({ attemptsToday: 0, answerMs: 300, combo: 0, forgot: true, rand: never }).honest).toBe(0)
    expect(reviewXp({ attemptsToday: 2, answerMs: 3000, combo: 0, forgot: true, rand: never }).honest).toBe(0)
  })

  it('練習：2分以上でボーナス、1分ごとに3（復習カードは分ごとの分なし）、雑学を読む時間はなし', () => {
    expect(practiceXp('input', 60)).toBe(3)
    expect(practiceXp('input', 600)).toBe(50)
    expect(practiceXp('input', 3600)).toBe(110)
    expect(practiceXp('review', 600)).toBe(20)
    expect(practiceXp('facts', 600)).toBe(0)
  })

  it('これまでの記録から1回だけ経験値を計算し、その後に足した分も合計に入る', async () => {
    const database = new EigoDB('xp-1')
    const at = new Date(2026, 9, 5, 9).getTime()
    await database.reviews.bulkAdd([1, 2, 3].map((i) => ({ cardId: i, at, rating: 3, state: 2, answerMs: 2000, mode: 'word' })))
    await database.sessions.add({ at, day: '2026-10-05', kind: 'input', pillar: 'input', seconds: 600 })
    await migrateXp(database)
    await migrateXp(database)
    expect((await getSettings(database)).xpTotal).toBe(30 + 50)
    expect((await database.xpDays.get('2026-10-05'))?.xp).toBe(80)
    await addXp(12, { crit: true, combo: 4 }, database, '2026-10-06')
    expect((await getSettings(database)).xpTotal).toBe(92)
    expect(await database.xpDays.get('2026-10-06')).toEqual({ day: '2026-10-06', xp: 12, crits: 1, maxCombo: 4 })
  })
})

const fact = (id: string, extra: Partial<FactContent> = {}): FactContent => ({
  id, category: 'animals', emoji: '', ja: '', easy: 'a cat', std: 'a cat', source: '', rare: false, origin: 'new', ...extra,
})

describe('雑学パック', () => {
  it('2分以上の練習でパックが届き、最低ラインのパックは1日1つ', async () => {
    const database = new EigoDB('pack-1')
    await finishPractice('input', 60, database, '2026-10-07')
    expect(await database.packs.count()).toBe(0)
    await finishPractice('input', 180, database, '2026-10-07')
    expect(await database.packs.count()).toBe(1)
    await ensureDailyPack(database, '2026-10-07')
    expect(await database.packs.count()).toBe(1)
    await ensureDailyPack(database, '2026-10-08')
    expect(await database.packs.count()).toBe(2)
    // 短い練習を重ねて5分に届いた日は、最低ラインのパックが届く
    for (const sec of [100, 100, 100]) {
      await database.sessions.add({ at: 0, day: '2026-10-09', kind: 'review', pillar: 'language', seconds: sec })
      await finishPractice('review', sec, database, '2026-10-09')
    }
    expect((await database.packs.where('day').equals('2026-10-09').toArray()).map((p) => p.source)).toEqual(['daily'])
  })

  it('新しい雑学は1日2つまで。その後はおさらいが入る。レア度は中身で決まる', async () => {
    const database = new EigoDB('pack-2')
    const facts = [fact('r1', { rare: true }), fact('s1', { series: { id: 's', title: 's', part: 1, total: 2 } }), fact('n1')]
    const opts = { facts, reviewedWords: new Set<string>(), liked: new Set<string>(), phase: 1, rand: () => 0 }
    const results = []
    for (let i = 0; i < NEW_FACTS_PER_DAY + 1; i++) {
      await finishPractice('input', 180, database, '2026-10-07')
      const pack = (await database.packs.where('opened').equals(0).toArray())[0]
      results.push(await openPack(pack, opts, database, '2026-10-07'))
    }
    expect(results.slice(0, NEW_FACTS_PER_DAY).every((r) => !r.revisit && r.rarity >= 1)).toBe(true)
    const last = results.at(-1)!
    expect(last.revisit).toBe(true)
    expect(last.rarity).toBe(0)
    expect(await database.facts.where('acquiredDay').equals('2026-10-07').count()).toBe(NEW_FACTS_PER_DAY)
    expect(await database.packs.where('opened').equals(0).count()).toBe(0)
    // レア雑学は rarity 3、連続ものは 2
    const database2 = new EigoDB('pack-3')
    await finishPractice('input', 180, database2, '2026-10-07')
    const p = (await database2.packs.toArray())[0]
    const r = await openPack(p, { ...opts, facts: [fact('r1', { rare: true })] }, database2, '2026-10-07')
    expect(r.rarity).toBe(3)
  })
})
