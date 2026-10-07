import { db, type EigoDB } from '../db/schema'
import { addDays, NOT_PRACTICE, weekStart } from '../habit/streak'

export interface WeekSummary {
  week: string
  minutes: number
  days: number
  attempts: number
  newCards: number
  /** その週に一番よく思い出せた語（「思い出せた」「簡単」が多かった語） */
  bestWord?: string
  facts: number
  titles: string[]
  /** 前の週の学習時間（比べるため） */
  prevMinutes: number
}

const toMs = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** 先週（today の前の週）のまとめ。練習していなければ undefined */
export async function lastWeekSummary(today: string, database: EigoDB = db): Promise<WeekSummary | undefined> {
  const week = addDays(weekStart(today), -7)
  const from = toMs(week)
  const to = toMs(weekStart(today))
  const prevFrom = toMs(addDays(week, -7))
  // 学習時間は雑学を読む時間も含める（練習した日数は練習だけで数える）
  const sessions = await database.sessions.where('at').between(prevFrom, to).toArray()
  const inWeek = sessions.filter((s) => s.at >= from)
  const minutes = Math.round(inWeek.reduce((a, s) => a + s.seconds, 0) / 60)
  if (!minutes) return undefined
  const prevMinutes = Math.round(sessions.filter((s) => s.at < from).reduce((a, s) => a + s.seconds, 0) / 60)
  const days = new Set(inWeek.filter((s) => !NOT_PRACTICE.has(s.kind) && s.seconds > 0).map((s) => s.day)).size
  const reviews = await database.reviews.where('at').between(from, to).toArray()
  const goodByCard = new Map<number, number>()
  for (const r of reviews) if (r.rating >= 3) goodByCard.set(r.cardId, (goodByCard.get(r.cardId) ?? 0) + 1)
  const bestCard = [...goodByCard].sort((a, b) => b[1] - a[1])[0]?.[0]
  const card = bestCard !== undefined ? await database.cards.get(bestCard) : undefined
  const item = card ? await database.items.get(card.itemId) : undefined
  const newCards = await database.cards.where('introducedAt').between(from, to).count()
  const facts = (await database.facts.toArray()).filter((f) => f.acquiredAt && f.acquiredAt >= from && f.acquiredAt < to).length
  const titles = (await database.rewards.where('kind').equals('title').toArray()).filter((r) => r.acquiredAt >= from && r.acquiredAt < to).map((r) => r.key)
  return { week, minutes, days, attempts: reviews.length, newCards, bestWord: item?.english, facts, titles, prevMinutes }
}
