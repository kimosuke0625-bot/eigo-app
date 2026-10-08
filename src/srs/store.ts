import { db, type Card, type EigoDB, type Item } from '../db/schema'
import { BSL_OFFSET } from '../content/ngsl'
import { getSettings } from '../db/settings'
import { newFsrsCard, rate, type Grade } from './fsrs'
import { buildQueue, newCardsToday, startOfDay } from './queue'
import { inDeck, type Deck } from './deck'

const WEEK = 7 * 24 * 60 * 60 * 1000

/** その束のカードの id（復習の記録を束ごとに数えるため） */
export async function deckCardIds(deck: Deck, database: EigoDB = db): Promise<Set<number>> {
  const ids = new Set<number>()
  await database.cards.each((c) => { if (inDeck(c, deck)) ids.add(c.id!) })
  return ids
}

/** 今日の復習の一覧（束ごと・上限つき）。上限は単語と表現で別々 */
export async function todaysQueue(deck: Deck = 'word', now = Date.now(), database: EigoDB = db): Promise<Card[]> {
  const s = await getSettings(database)
  const cards = (await database.cards.where('due').belowOrEqual(now).toArray()).filter((c) => inDeck(c, deck))
  const ids = await deckCardIds(deck, database)
  const reviewedToday = (await database.reviews.where('at').aboveOrEqual(startOfDay(now)).toArray()).filter((r) => ids.has(r.cardId)).length
  return buildQueue(cards, now, (deck === 'word' ? s.reviewCap : s.exprReviewCap) - reviewedToday)
}

/** 期日が来ている枚数（束ごと。今日の画面の残り枚数） */
export async function dueCounts(now = Date.now(), database: EigoDB = db): Promise<Record<Deck, number>> {
  const out = { word: 0, expr: 0 }
  for (const c of await database.cards.where('due').belowOrEqual(now).toArray()) out[inDeck(c, 'expr') ? 'expr' : 'word']++
  return out
}

/** 今日あと何枚、新しい単語のカードを覚えるか（正答率で増減し、設定の上限を超えない） */
export async function newCardsRemaining(now = Date.now(), database: EigoDB = db): Promise<number> {
  const s = await getSettings(database)
  const ids = await deckCardIds('word', database)
  const recentReviews = (await database.reviews.where('at').aboveOrEqual(now - WEEK).toArray()).filter((r) => ids.has(r.cardId))
  const introducedToday = (await database.cards.where('introducedAt').aboveOrEqual(startOfDay(now)).toArray()).filter((c) => inDeck(c, 'word')).length
  const backlog = (await database.cards.where('due').belowOrEqual(now).toArray()).filter((c) => inDeck(c, 'word')).length
  const adaptive = newCardsToday({ recentReviews, introducedToday, backlog })
  return Math.max(0, Math.min(adaptive, s.wordNewPerDay - introducedToday))
}

/**
 * 旅の手帳の表現のうち、まだカードにしていないものを、1日に決めた枚数まで表現の束に加える（古いものから）。
 * 表現の復習を始めるときに呼ぶ。加えた枚数を返す。
 */
export function introducePhrases(now = Date.now(), database: EigoDB = db): Promise<number> {
  // 同時に2回呼ばれても（画面の作り直しなど）、同じ表現を二重に加えないよう順番に行う
  const run = introducing.then(() => introducePhrasesNow(now, database))
  introducing = run.catch(() => 0)
  return run
}
let introducing: Promise<number> = Promise.resolve(0)

async function introducePhrasesNow(now: number, database: EigoDB): Promise<number> {
  const s = await getSettings(database)
  const today = (await database.cards.where('introducedAt').aboveOrEqual(startOfDay(now)).toArray()).filter((c) => inDeck(c, 'expr')).length
  let room = s.exprNewPerDay - today
  if (room <= 0) return 0
  const carded = new Set((await database.cards.toArray()).filter((c) => inDeck(c, 'expr')).map((c) => c.itemId))
  let added = 0
  for (const p of await database.phrases.orderBy('at').toArray()) {
    if (room <= 0) break
    const itemId = `phrase-${p.id}`
    if (carded.has(itemId) || !(await database.items.get(itemId))) continue
    await introduce(itemId, now, database)
    room--
    added++
  }
  return added
}

/** まだ表現の束に入っていない旅の手帳の表現の数 */
export async function waitingPhrases(database: EigoDB = db): Promise<number> {
  const carded = new Set((await database.cards.toArray()).filter((c) => inDeck(c, 'expr')).map((c) => c.itemId))
  return (await database.phrases.toArray()).filter((p) => !carded.has(`phrase-${p.id}`)).length
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
