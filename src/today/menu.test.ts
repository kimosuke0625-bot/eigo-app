import { describe, expect, it } from 'vitest'
import { BASE_MENU, currentBlock, dayKey, planMenu } from './menu'

const order = ['morning', 'noon', 'night'] as const
const sum = (xs: { minutes: number }[]) => xs.reduce((s, x) => s + x.minutes, 0)

describe('planMenu', () => {
  it('60分では仕様書どおりの分数になる', () => {
    const plan = planMenu(60, [...order])
    expect(plan.map((p) => p.minutes)).toEqual(BASE_MENU.map((m) => m.baseMinutes))
  })

  it.each([15, 30, 45, 75, 90, 120])('%i分でも合計が目標時間に一致する', (t) => {
    const plan = planMenu(t, [...order])
    expect(sum(plan)).toBe(t)
    expect(plan.every((p) => p.minutes >= 1)).toBe(true)
  })

  it('ブロックの順番に並べ替える', () => {
    const plan = planMenu(60, ['night', 'morning', 'noon'])
    expect(plan[0].block).toBe('night')
    expect(plan.at(-1)!.block).toBe('noon')
  })

  it('4つの柱の比率は 言語20・インプット15・流暢さ15・アウトプット10', () => {
    const plan = planMenu(60, [...order])
    const by = (p: string) => sum(plan.filter((x) => x.pillar === p))
    expect([by('language'), by('input'), by('fluency'), by('output')]).toEqual([20, 15, 15, 10])
  })
})

describe('日付とブロック', () => {
  it('現地時間で日付キーを作る', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('時刻からブロックを決める', () => {
    expect(currentBlock(new Date(2026, 0, 1, 7))).toBe('morning')
    expect(currentBlock(new Date(2026, 0, 1, 12))).toBe('noon')
    expect(currentBlock(new Date(2026, 0, 1, 21))).toBe('night')
  })
})
