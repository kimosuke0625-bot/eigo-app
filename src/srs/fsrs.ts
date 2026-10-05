import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs'
import type { StoredFsrs } from '../db/schema'

export { Rating, State }
export type { Grade }

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

export const GRADE_LABELS: Record<Grade, string> = {
  [Rating.Again]: '忘れた',
  [Rating.Hard]: '難しい',
  [Rating.Good]: '思い出せた',
  [Rating.Easy]: '簡単',
}

export function toStored(c: FsrsCard): StoredFsrs {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
  }
}

export function fromStored(s: StoredFsrs): FsrsCard {
  return {
    ...s,
    due: new Date(s.due),
    state: s.state as State,
    last_review: s.last_review === undefined ? undefined : new Date(s.last_review),
  }
}

export function newFsrsCard(now: number): StoredFsrs {
  return toStored(createEmptyCard(new Date(now)))
}

/** 目標定着率ごとにスケジューラを作る（設定 85〜95%） */
export function scheduler(retention: number) {
  return fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }))
}

export function rate(card: StoredFsrs, grade: Grade, now: number, retention: number): StoredFsrs {
  return toStored(scheduler(retention).next(fromStored(card), new Date(now), grade).card)
}

/** 各ボタンを押したときの次回までの間隔（ミリ秒） */
export function previewIntervals(card: StoredFsrs, now: number, retention: number): Record<Grade, number> {
  const preview = scheduler(retention).repeat(fromStored(card), new Date(now))
  const out = {} as Record<Grade, number>
  for (const g of GRADES) out[g] = preview[g].card.due.getTime() - now
  return out
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min}分`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours}時間`
  const days = Math.round(hours / 24)
  if (days < 31) return `${days}日`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}か月`
  return `${(days / 365).toFixed(1)}年`
}
