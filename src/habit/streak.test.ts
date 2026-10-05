import { describe, expect, it } from 'vitest'
import { addDays, computeStreak, weekStart } from './streak'

// 2026-10-05 は月曜日
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))

describe('日付', () => {
  it('月末や年末をまたいで進める', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('週の始まりは月曜日', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
    expect(weekStart('2026-10-11')).toBe('2026-10-05')
    expect(weekStart('2026-10-12')).toBe('2026-10-12')
  })
})

describe('連続日数とお休み券', () => {
  it('毎日達成すれば日数が増える', () => {
    const r = computeStreak(new Set(days('2026-10-05', 5)), '2026-10-09', '2026-10-05')
    expect(r).toMatchObject({ current: 5, best: 5, todayDone: true, ticketLeft: true })
  })

  it('今日がまだ未達成でも途切れない', () => {
    const r = computeStreak(new Set(days('2026-10-05', 4)), '2026-10-09', '2026-10-05')
    expect(r.current).toBe(4)
    expect(r.todayDone).toBe(false)
  })

  it('週に1回休んでも、お休み券で途切れない', () => {
    const achieved = new Set(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'])
    const r = computeStreak(achieved, '2026-10-09', '2026-10-05')
    expect(r.current).toBe(4)
    expect([...r.restDays]).toEqual(['2026-10-07'])
    expect(r.ticketLeft).toBe(false)
  })

  it('同じ週に2回休むと途切れる', () => {
    const achieved = new Set(['2026-10-05', '2026-10-07', '2026-10-09'])
    const r = computeStreak(achieved, '2026-10-09', '2026-10-05')
    expect(r.current).toBe(1)
    expect(r.best).toBe(2)
  })

  it('お休み券は週ごとに新しく付く', () => {
    // 10/7（第1週）と 10/14（第2週）に休む
    const achieved = new Set(days('2026-10-05', 14).filter((d) => d !== '2026-10-07' && d !== '2026-10-14'))
    const r = computeStreak(achieved, '2026-10-18', '2026-10-05')
    expect(r.current).toBe(12)
    expect(r.restDays.size).toBe(2)
  })

  it('始めたばかりで未達成の日はお休み券を使わない', () => {
    const r = computeStreak(new Set(['2026-10-07']), '2026-10-07', '2026-10-05')
    expect(r.current).toBe(1)
    expect(r.restDays.size).toBe(0)
  })
})

describe('最低ラインに数える時間', () => {
  it('雑学を読む時間は継続の判定に含めない', async () => {
    const { EigoDB } = await import('../db/schema')
    const { loadStreak } = await import('./streak')
    const database = new EigoDB('streak-facts')
    await database.sessions.bulkAdd([
      { at: 0, day: '2026-10-06', kind: 'facts', pillar: 'input', seconds: 600 },
      { at: 0, day: '2026-10-07', kind: 'review', pillar: 'language', seconds: 200 },
      { at: 0, day: '2026-10-07', kind: 'facts', pillar: 'input', seconds: 200 },
      { at: 0, day: '2026-10-08', kind: 'review', pillar: 'language', seconds: 300 },
    ])
    const r = await loadStreak(database, '2026-10-08')
    expect(r.totals.get('2026-10-07')).toBe(200)
    expect(r.todayDone).toBe(true)
    expect(r.current).toBe(1)
  })
})
