import { describe, expect, it } from 'vitest'
import type { Card } from '../db/schema'
import { formatInterval, fromStored, newFsrsCard, previewIntervals, rate, Rating, State, toStored } from './fsrs'
import { buildQueue, chooseMode, newCardsToday, nextCard, recallRate, startOfDay } from './queue'

const DAY = 86400000
const NOW = new Date(2026, 9, 7, 8, 0).getTime() // 2026-10-07 朝8時

function card(id: number, due: number, introducedAt = 0, state = State.Review, reps = 3): Card {
  return { id, itemId: `w${id}`, due, introducedAt, fsrs: { ...newFsrsCard(0), due, state, reps } }
}

describe('ts-fsrs の包み', () => {
  it('保存形式と往復しても同じ', () => {
    const s = newFsrsCard(NOW)
    expect(toStored(fromStored(s))).toEqual(s)
  })

  it('思い出せたら次回は先に、忘れたら近くなる', () => {
    let c = newFsrsCard(NOW)
    c = rate(c, Rating.Good, NOW, 0.9)
    c = rate(c, Rating.Good, c.due, 0.9)
    expect(c.state).toBe(State.Review)
    const good = rate(c, Rating.Good, c.due, 0.9)
    const again = rate(c, Rating.Again, c.due, 0.9)
    expect(good.due).toBeGreaterThan(again.due)
    expect(good.stability).toBeGreaterThan(c.stability)
  })

  it('目標定着率を上げると間隔が短くなる', () => {
    let c = rate(newFsrsCard(NOW), Rating.Good, NOW, 0.9)
    c = rate(c, Rating.Good, c.due, 0.9)
    const at85 = previewIntervals(c, c.due + 3 * DAY, 0.85)[Rating.Good]
    const at95 = previewIntervals(c, c.due + 3 * DAY, 0.95)[Rating.Good]
    expect(at95).toBeLessThan(at85)
  })

  it('間隔を読みやすく表示する', () => {
    expect(formatInterval(60000)).toBe('1分')
    expect(formatInterval(10 * 60000)).toBe('10分')
    expect(formatInterval(3 * 3600000)).toBe('3時間')
    expect(formatInterval(4 * DAY)).toBe('4日')
    expect(formatInterval(90 * DAY)).toBe('3か月')
  })
})

describe('出題順', () => {
  it('前日に覚えたカード（翌朝の確認）を先に、残りは期日の古い順', () => {
    const yesterdayNight = startOfDay(NOW) - 2 * 3600000
    const cards = [card(1, NOW - 5 * DAY), card(2, NOW - 1000, yesterdayNight, State.Learning), card(3, NOW - 9 * DAY)]
    expect(buildQueue(cards, NOW, 100).map((c) => c.id)).toEqual([2, 3, 1])
  })

  it('期日前のカードは出さず、上限で打ち切る', () => {
    const cards = [card(1, NOW + DAY), ...Array.from({ length: 5 }, (_, i) => card(i + 2, NOW - (i + 1) * DAY))]
    const q = buildQueue(cards, NOW, 3)
    expect(q).toHaveLength(3)
    expect(q.map((c) => c.id)).toEqual([6, 5, 4])
  })

  it('学習中のカードは、他になければ20分以内のものを先に出す', () => {
    const q = [card(1, NOW + 5 * 60000, 0, State.Learning), card(2, NOW + 60 * 60000)]
    expect(nextCard(q, NOW)?.id).toBe(1)
    expect(nextCard([card(2, NOW + 60 * 60000)], NOW)).toBeUndefined()
  })

  it('交互練習：復習のたびに 単語 → 例文 → 聞き取り と形を変える', () => {
    const opts = { tts: true, hasExample: true }
    const modes = [3, 4, 5].map((reps) => chooseMode(card(1, NOW, 0, State.Review, reps), opts))
    expect(new Set(modes)).toEqual(new Set(['word', 'chunk', 'listen']))
    expect(chooseMode(card(1, NOW, 0, State.Learning, 1), opts)).toBe('word')
  })

  it('同じ日に覚えたカード（復習回数が同じ）でも1回の復習の中で形が混ざる', () => {
    const modes = [1, 2, 3].map((id) => chooseMode(card(id, NOW, 0, State.Review, 3), { tts: true, hasExample: true }))
    expect(new Set(modes)).toEqual(new Set(['word', 'chunk', 'listen']))
  })

  it('読み上げや例文が使えない端末・語では出せる形に置き換える', () => {
    const listenCard = [1, 2, 3].map((id) => card(id, NOW, 0, State.Review, 3))
      .find((c) => chooseMode(c, { tts: true, hasExample: true }) === 'listen')!
    expect(chooseMode(listenCard, { tts: false, hasExample: true })).toBe('chunk')
    expect(chooseMode(listenCard, { tts: false, hasExample: false })).toBe('word')
    const chunkCard = [1, 2, 3].map((id) => card(id, NOW, 0, State.Review, 3))
      .find((c) => chooseMode(c, { tts: true, hasExample: true }) === 'chunk')!
    expect(chooseMode(chunkCard, { tts: true, hasExample: false })).toBe('word')
  })
})

describe('新しいカードの数（正答率85%前後をめざす）', () => {
  const reviews = (n: number, ok: number) =>
    Array.from({ length: n }, (_, i) => ({ rating: i < ok ? Rating.Good : Rating.Again, state: State.Review }))

  it('記録が少ないうちは1日10枚', () => {
    expect(recallRate(reviews(10, 10))).toBeNull()
    expect(newCardsToday({ recentReviews: reviews(10, 10), introducedToday: 0, backlog: 0 })).toBe(10)
  })
  it('正答率が高すぎれば増やし、低すぎれば減らす', () => {
    expect(newCardsToday({ recentReviews: reviews(100, 95), introducedToday: 0, backlog: 0 })).toBe(20)
    expect(newCardsToday({ recentReviews: reviews(100, 85), introducedToday: 0, backlog: 0 })).toBe(10)
    expect(newCardsToday({ recentReviews: reviews(100, 70), introducedToday: 0, backlog: 0 })).toBe(3)
  })
  it('今日すでに覚えた分を引き、復習がたまっていれば0', () => {
    expect(newCardsToday({ recentReviews: [], introducedToday: 4, backlog: 0 })).toBe(6)
    expect(newCardsToday({ recentReviews: [], introducedToday: 0, backlog: 101 })).toBe(0)
  })
})
