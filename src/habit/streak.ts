import { db, type EigoDB } from '../db/schema'
import { dayKey } from '../today/menu'

/** 最低ライン：その日に5分以上練習すれば「継続」 */
export const MIN_SECONDS = 5 * 60

/** 日付キー（YYYY-MM-DD）を1日ずつ進める */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

/** その日を含む週の月曜日の日付キー */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const offset = (date.getDay() + 6) % 7 // 月曜 = 0
  return dayKey(new Date(y, m - 1, d - offset))
}

export interface StreakResult {
  /** いまの連続日数（今日がまだ未達成でも途切れていない） */
  current: number
  best: number
  /** お休み券を使った日 */
  restDays: Set<string>
  /** 今週のお休み券がまだ残っているか */
  ticketLeft: boolean
  /** 今日、最低ラインを達成したか */
  todayDone: boolean
}

/**
 * 連続日数を計算する。
 * - 最低ラインを達成した日で連続日数が1つ増える
 * - 達成できなかった日は、その週（月〜日）のお休み券が残っていれば自動で使い、連続は途切れない（日数は増えない）
 * - 今日はまだ終わっていないので、未達成でも途切れない
 */
export function computeStreak(achieved: Set<string>, today: string, firstDay: string): StreakResult {
  let current = 0
  let best = 0
  const restDays = new Set<string>()
  const usedWeeks = new Set<string>()
  if (firstDay > today) firstDay = today
  for (let d = firstDay; d <= today; d = addDays(d, 1)) {
    if (achieved.has(d)) {
      current++
    } else if (d === today) {
      // 今日はまだ途中
    } else if (current > 0 && !usedWeeks.has(weekStart(d))) {
      usedWeeks.add(weekStart(d))
      restDays.add(d)
    } else {
      current = 0
    }
    best = Math.max(best, current)
  }
  return { current, best, restDays, ticketLeft: !usedWeeks.has(weekStart(today)), todayDone: achieved.has(today) }
}

/** 日ごとの練習秒数 */
export async function dayTotals(database: EigoDB = db): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  await database.sessions.each((s) => totals.set(s.day, (totals.get(s.day) ?? 0) + s.seconds))
  return totals
}

export async function loadStreak(database: EigoDB = db, today = dayKey()): Promise<StreakResult & { totals: Map<string, number> }> {
  const totals = await dayTotals(database)
  const achieved = new Set([...totals].filter(([, s]) => s >= MIN_SECONDS).map(([d]) => d))
  const firstDay = [...totals.keys()].sort()[0] ?? today
  return { ...computeStreak(achieved, today, firstDay), totals }
}
