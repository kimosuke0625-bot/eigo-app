import { db, type Card, type EigoDB, type Item } from '../db/schema'
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
  const out: Item[] = []
  await database.items.orderBy('ngslRank').until(() => out.length >= limit).each((item) => {
    if (!taken.has(item.id) && out.length < limit) out.push(item)
  })
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
