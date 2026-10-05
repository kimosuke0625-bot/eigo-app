import type { Card, Review } from '../db/schema'
import { State } from './fsrs'

export type PresentMode = 'word' | 'chunk' | 'listen'

const DAY = 24 * 60 * 60 * 1000

/** その日の0時（端末の現地時間） */
export function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 今日の復習の出題順を決める。
 * 1. 前日に覚え始めたカード（睡眠をはさんだ翌朝の確認）
 * 2. 期日が古い順（長く休んだ後も古いものから少しずつ戻す）
 * 上限を超えた分は翌日以降に回す。
 */
export function buildQueue(cards: Card[], now: number, cap: number): Card[] {
  const today = startOfDay(now)
  const yesterday = today - DAY
  const due = cards.filter((c) => c.due <= now)
  const isSleepCheck = (c: Card) => c.introducedAt >= yesterday && c.introducedAt < today
  due.sort((a, b) => Number(isSleepCheck(b)) - Number(isSleepCheck(a)) || a.due - b.due)
  return due.slice(0, Math.max(0, cap))
}

/**
 * 交互練習：同じカードでも、復習のたびに出題の形を変える。
 * 覚えたての間は単語だけで出し、慣れたら 単語 → 例文 → 聞き取り の順に回す。
 * 同じ日に覚えたカードは復習回数がそろうので、カードごとに開始位置をずらして1回の復習の中でも混ざるようにする。
 */
export function chooseMode(card: Card, opts: { tts: boolean; hasExample: boolean }): PresentMode {
  if (card.fsrs.state !== State.Review) return 'word'
  const cycle: PresentMode[] = ['word', 'chunk', 'listen']
  const mode = cycle[(card.fsrs.reps + (card.id ?? 0)) % cycle.length]
  if (mode === 'listen' && !opts.tts) return opts.hasExample ? 'chunk' : 'word'
  if (mode === 'chunk' && !opts.hasExample) return 'word'
  return mode
}

/** 復習の正答率（「難しい」以上を思い出せたとみなす）。覚えたての学習中のカードは除く */
export function recallRate(reviews: Pick<Review, 'rating' | 'state'>[]): number | null {
  const counted = reviews.filter((r) => r.state === State.Review || r.state === State.Relearning)
  if (counted.length < 20) return null
  return counted.filter((r) => r.rating >= 2).length / counted.length
}

export const NEW_PER_DAY = { base: 10, min: 3, max: 20 }

/**
 * 望ましい困難：直近7日の正答率が85%前後になるよう、新しいカードの数を増減する。
 * 期日を過ぎた復習が多くたまっているときは新しいカードを出さない。
 */
export function newCardsToday(opts: {
  recentReviews: Pick<Review, 'rating' | 'state'>[]
  introducedToday: number
  backlog: number
}): number {
  if (opts.backlog > 100) return 0
  const r = recallRate(opts.recentReviews)
  let n = NEW_PER_DAY.base
  if (r !== null && r > 0.9) n = NEW_PER_DAY.max
  else if (r !== null && r > 0.87) n = 15
  else if (r !== null && r < 0.75) n = NEW_PER_DAY.min
  else if (r !== null && r < 0.8) n = 6
  return Math.max(0, n - opts.introducedToday)
}

/**
 * 学習中のカードを同じ回のうちに出し直すための並べ替え。
 * 期日が来ているものを優先し、残りが学習中だけになったら少し早めでも出す。
 */
export function nextCard(queue: Card[], now: number, learnAheadMs = 20 * 60 * 1000): Card | undefined {
  const ready = queue.filter((c) => c.due <= now).sort((a, b) => a.due - b.due)
  if (ready.length) return ready[0]
  const soon = queue.filter((c) => c.due <= now + learnAheadMs).sort((a, b) => a.due - b.due)
  return soon[0]
}
