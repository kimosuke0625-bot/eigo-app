import { describe, expect, it } from 'vitest'
import { buildTrials, matchScore, PAIR_GROUPS, shouldShowScore, weakestGroup, wordsPerMinute } from './speaking'

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

describe('フィードバックを減らす', () => {
  it('最初の5回は毎回、その後は3回に1回だけ一致率を見せる', () => {
    const shown = Array.from({ length: 14 }, (_, i) => shouldShowScore(i))
    expect(shown).toEqual([true, true, true, true, true, false, false, true, false, false, true, false, false, true])
  })
})

describe('話す練習の測定', () => {
  it('手本と認識結果の一致率', () => {
    expect(matchScore('I get up at six every morning.', 'I get up at 6 every morning')).toBe(1)
    expect(matchScore('I get up at six every morning.', 'I get at six morning')).toBeCloseTo(5 / 7)
  })
  it('1分あたりの語数', () => {
    expect(wordsPerMinute('one two three four five six', 3)).toBe(120)
    expect(wordsPerMinute('', 60)).toBe(0)
  })
})

describe('聞き分けドリルの出題順', () => {
  it('最初の4問は同じ音のグループ、その後は複数のグループを混ぜる', () => {
    const t = buildTrials('b-v', 20, seeded(3))
    expect(t).toHaveLength(20)
    expect(t.slice(0, 4).every((x) => x.group === 'b-v')).toBe(true)
    expect(new Set(t.slice(4).map((x) => x.group)).size).toBeGreaterThan(3)
    // 同じグループが3回続かない（最初のまとまりの後）
    for (let i = 6; i < t.length; i++) {
      expect(t[i].group === t[i - 1].group && t[i].group === t[i - 2].group).toBe(false)
    }
  })

  it('速さを変えて出題する（変動練習）', () => {
    const rates = new Set(buildTrials('r-l', 30, seeded(9)).map((x) => x.rate))
    expect(rates).toEqual(new Set([0.8, 1, 1.2]))
  })

  it('いちばん正答率の低いグループを選ぶ', () => {
    const stats = new Map(PAIR_GROUPS.map((g) => [g.key, { ok: 9, all: 10 }]))
    stats.set('f-h', { ok: 3, all: 10 })
    expect(weakestGroup(stats)).toBe('f-h')
    expect(weakestGroup(new Map())).toBe('r-l')
  })
})
