import { db, type EigoDB, type Pillar, type Review, type Session, type Snapshot } from '../db/schema'
import { deckOf } from '../srs/deck'
import { State } from '../srs/fsrs'
import { addDays, weekStart } from '../habit/streak'
import { dayKey } from '../today/menu'

/** 定着したとみなす FSRS の安定度（日） */
export const MATURE_DAYS = 21

export const PILLARS: Pillar[] = ['language', 'input', 'fluency', 'output']

export interface WeekPillars {
  week: string
  minutes: Record<Pillar, number>
}

/** 直近 n 週（今週を含む）の、柱ごとの学習時間（分） */
export function weeklyPillars(sessions: Pick<Session, 'day' | 'pillar' | 'seconds'>[], today: string, n = 6): WeekPillars[] {
  const weeks = Array.from({ length: n }, (_, i) => addDays(weekStart(today), -7 * (n - 1 - i)))
  const rows = new Map(weeks.map((w) => [w, { week: w, minutes: { language: 0, input: 0, fluency: 0, output: 0 } }]))
  for (const s of sessions) {
    const row = rows.get(weekStart(s.day))
    if (row) row.minutes[s.pillar] += s.seconds / 60
  }
  return weeks.map((w) => rows.get(w)!)
}

export interface WeekRate {
  week: string
  /** 思い出せた割合（記録が少ない週は null） */
  rate: number | null
  count: number
}

/** 直近 n 週の復習の正答率（覚えたての学習中カードは除く） */
export function weeklyRecall(reviews: Pick<Review, 'at' | 'rating' | 'state'>[], today: string, n = 8, minCount = 10): WeekRate[] {
  const weeks = Array.from({ length: n }, (_, i) => addDays(weekStart(today), -7 * (n - 1 - i)))
  const acc = new Map(weeks.map((w) => [w, { ok: 0, all: 0 }]))
  for (const r of reviews) {
    if (r.state !== State.Review && r.state !== State.Relearning) continue
    const a = acc.get(weekStart(dayKey(new Date(r.at))))
    if (!a) continue
    a.all++
    if (r.rating >= 2) a.ok++
  }
  return weeks.map((w) => {
    const a = acc.get(w)!
    return { week: w, count: a.all, rate: a.all >= minCount ? a.ok / a.all : null }
  })
}

/** 練習結果の数値（ディクテーション一致率など）を週ごとに平均する */
export function weeklyMetric(sessions: Pick<Session, 'day' | 'result'>[], key: string, today: string, n = 8) {
  const weeks = Array.from({ length: n }, (_, i) => addDays(weekStart(today), -7 * (n - 1 - i)))
  const acc = new Map(weeks.map((w) => [w, { sum: 0, count: 0 }]))
  for (const s of sessions) {
    const v = s.result?.[key]
    if (typeof v !== 'number') continue
    const a = acc.get(weekStart(s.day))
    if (!a) continue
    a.sum += v
    a.count++
  }
  return weeks.map((w) => {
    const a = acc.get(w)!
    return { week: w, value: a.count ? a.sum / a.count : null, count: a.count }
  })
}

/** 日ごとの記録を、記録のない日は前日の値で埋めて並べる */
export function fillDaily(snaps: Snapshot[], today: string, days = 90): { day: string; mature: number; known: number; exprMature: number; exprCards: number }[] {
  const sorted = [...snaps].sort((a, b) => a.day.localeCompare(b.day))
  if (!sorted.length) return []
  const first = sorted[0].day > addDays(today, -(days - 1)) ? sorted[0].day : addDays(today, -(days - 1))
  const byDay = new Map(sorted.map((s) => [s.day, s]))
  let last = sorted.filter((s) => s.day <= first).at(-1) ?? sorted[0]
  const out = []
  for (let d = first; d <= today; d = addDays(d, 1)) {
    last = byDay.get(d) ?? last
    out.push({ day: d, mature: last.mature, known: last.known, exprMature: last.exprMature ?? 0, exprCards: last.exprCards ?? 0 })
  }
  return out
}

/** 今日の語彙の記録を書く（1日に何度呼んでも最新の値で上書き） */
export async function writeSnapshot(database: EigoDB = db, today = dayKey()): Promise<Snapshot> {
  // 語彙（Phase の切り替え・旅の地図）は単語の束だけで数え、表現の束は別に数える
  let mature = 0
  let cards = 0
  let exprMature = 0
  let exprCards = 0
  await database.cards.each((c) => {
    const ok = c.fsrs.stability >= MATURE_DAYS && c.fsrs.state === State.Review
    if (deckOf(c.itemId) === 'expr') { exprCards++; if (ok) exprMature++ } else { cards++; if (ok) mature++ }
  })
  const known = await database.knownWords.count()
  const snap = { day: today, mature, cards, known, exprMature, exprCards }
  await database.snapshots.put(snap)
  return snap
}

/**
 * Phase の自動切り替え（上がる方向だけ）。
 * 語彙数（知っている語＋定着したカード）が目安に届き、Phase 3 以上へは聞き取りの成績（直近4週の
 * ディクテーション一致率の平均）が70%以上であること。聞き取りの記録がまだなければ語彙数だけで判断する。
 */
export function suggestPhase(opts: { vocab: number; listening: number | null; current: 1 | 2 | 3 | 4 }): 1 | 2 | 3 | 4 {
  const byVocab: 1 | 2 | 3 | 4 = opts.vocab >= 2700 ? 4 : opts.vocab >= 2000 ? 3 : opts.vocab >= 1000 ? 2 : 1
  let target = byVocab
  if (target >= 3 && opts.listening !== null && opts.listening < 0.7) target = 2
  return target > opts.current ? target : opts.current
}

export const PHASE_LISTENING_KEY = 'dictation'
