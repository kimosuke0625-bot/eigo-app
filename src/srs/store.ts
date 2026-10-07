import { db, type Card, type EigoDB, type Item } from '../db/schema'
import { BSL_OFFSET } from '../content/ngsl'
import { getSettings } from '../db/settings'
import { newFsrsCard, rate, type Grade } from './fsrs'
import { buildQueue, newCardsToday, startOfDay } from './queue'

const WEEK = 7 * 24 * 60 * 60 * 1000

/** 今日の復習の一覧（上限つき） */
export async function todaysQueue(now = Date.now(), database: EigoDB = db): Promise<Card[]> {
  const s = await getSettings(database)
  const cards = await database.cards.where('due').belowOrEqual(now).toArray()
  const reviewedToday = await database.reviews.where('at').aboveOrEqual(startOfDay(now)).count()
  return buildQueue(cards, now, s.reviewCap - reviewedToday)
}

/** 今日あと何枚、新しいカードを覚えるか */
export async function newCardsRemaining(now = Date.now(), database: EigoDB = db): Promise<number> {
  const recentReviews = await database.reviews.where('at').aboveOrEqual(now - WEEK).toArray()
  const introducedToday = await database.cards.where('introducedAt').aboveOrEqual(startOfDay(now)).count()
  const backlog = await database.cards.where('due').belowOrEqual(now).count()
  return newCardsToday({ recentReviews, introducedToday, backlog })
}

/** まだカードにも「知っている語」にもなっていない語を、順位の高い順に返す */
export async function nextNewItems(limit: number, database: EigoDB = db): Promise<Item[]> {
  if (limit <= 0) return []
  const taken = new Set<string>([
    ...(await database.cards.orderBy('itemId').keys()).map(String),
    ...(await database.knownWords.toCollection().primaryKeys()),
  ])
  const pick = async (lower: number, upper: number, n: number) => {
    const out: Item[] = []
    if (n <= 0) return out
    await database.items.where('ngslRank').between(lower, upper, true, false).until(() => out.length >= n).each((item) => {
      if (!taken.has(item.id) && out.length < n) out.push(item)
    })
    return out
  }
  const { bslMode } = await getSettings(database)
  if (bslMode !== 'mix') {
    const basic = await pick(0, BSL_OFFSET, limit)
    return [...basic, ...(await pick(BSL_OFFSET, Infinity, limit - basic.length))]
  }
  // 基本語2：ビジネス語1 の割合で交互に並べる（どちらかが尽きたら残りで埋める）
  const basic = await pick(0, BSL_OFFSET, limit)
  const business = await pick(BSL_OFFSET, Infinity, limit)
  const out: Item[] = []
  while (out.length < limit && (basic.length || business.length)) {
    const next = (out.length % 3 === 2 && business.length) || !basic.length ? business.shift() : basic.shift()
    out.push(next!)
  }
  return out
}

export async function introduce(itemId: string, now = Date.now(), database: EigoDB = db) {
  if (await database.cards.where('itemId').equals(itemId).count()) return
  await database.cards.add({ itemId, fsrs: newFsrsCard(now), due: now, introducedAt: now })
}

export async function markKnown(itemIds: string[], source: 'diagnostic' | 'self', now = Date.now(), database: EigoDB = db) {
  await database.knownWords.bulkPut(itemIds.map((itemId) => ({ itemId, source, at: now })))
}

export async function recordReview(
  card: Card,
  grade: Grade,
  opts: { answerMs: number; mode: string; now?: number },
  database: EigoDB = db,
): Promise<Card> {
  const now = opts.now ?? Date.now()
  const s = await getSettings(database)
  const fsrs = rate(card.fsrs, grade, now, s.retention)
  const updated: Card = { ...card, fsrs, due: fsrs.due }
  await database.transaction('rw', database.cards, database.reviews, async () => {
    await database.cards.put(updated)
    await database.reviews.add({
      cardId: card.id!,
      at: now,
      rating: grade,
      state: card.fsrs.state,
      answerMs: opts.answerMs,
      mode: opts.mode,
    })
  })
  return updated
}
