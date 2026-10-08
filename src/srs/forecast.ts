import { newFsrsCard, rate, Rating } from './fsrs'

const DAY = 86_400_000

/**
 * 新しいカードを1枚覚えたとき、覚えた日から何日目に復習が来るか（FSRS で毎回「思い出せた」と答えた場合）。
 * 覚えた当日の出し直しは0日目として数える。
 */
export function reviewOffsets(retention: number, horizonDays: number): number[] {
  const start = Date.UTC(2026, 0, 1)
  let card = newFsrsCard(start)
  card = rate(card, Rating.Good, start, retention)
  const out: number[] = []
  for (let i = 0; i < 200; i++) {
    const day = Math.floor((card.due - start) / DAY)
    if (day > horizonDays) break
    out.push(day)
    card = rate(card, Rating.Good, card.due, retention)
  }
  return out
}

/**
 * 毎日 newPerDay 枚ずつ覚え続けたとき、始めてから day 日目の1日の復習の枚数の見込み。
 * 覚えた日ごとに、その日に来る復習を足し合わせる（＝ 1枚の復習のうち day 日目までに来る回数 × 1日の枚数）。
 * 忘れたカードの出し直しは含まない（実際はこれより多くなる）。
 */
export function dailyReviewsAt(day: number, newPerDay: number, retention: number): number {
  return newPerDay * reviewOffsets(retention, day).length
}

export interface Forecast { weeks: number; reviews: number; minutes: number }

/** 2・4・8週間後の、1日の復習の見込み（枚数と、1枚あたり secondsPerCard 秒としたときの分数） */
export function reviewForecast(newPerDay: number, retention: number, secondsPerCard: number, weeks = [2, 4, 8]): Forecast[] {
  return weeks.map((w) => {
    const reviews = Math.round(dailyReviewsAt(w * 7, newPerDay, retention))
    return { weeks: w, reviews, minutes: Math.round((reviews * secondsPerCard) / 60) }
  })
}
