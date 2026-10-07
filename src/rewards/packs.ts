import { db, type EigoDB, type Fact, type Pack } from '../db/schema'
import { dayKey } from '../today/menu'
import { MIN_SECONDS, NOT_PRACTICE } from '../habit/streak'
import { acquireFact, pickFact, type FactContent } from './facts'
import { addXp, FINISH_SECONDS, practiceXp } from './xp'

/**
 * 雑学パック（フェーズ6.5）。練習を1つやり遂げるたびに1つ届き、タップで開ける。
 * レア度は開けたときに決まる（届いた時点では分からない）。
 */

/** 1日に新しく手に入る雑学の上限。これを超えたパックには、前に集めた雑学（おさらい）が入る */
export const NEW_FACTS_PER_DAY = 2

export const RARITY = [
  { name: 'おさらい', glow: 'bronze', xp: 10 },
  { name: 'ふつう', glow: 'silver', xp: 15 },
  { name: '連続もの', glow: 'gold', xp: 25 },
  { name: 'レア', glow: 'rainbow', xp: 50 },
] as const

export function rarityOf(f: FactContent): number {
  if (f.rare) return 3
  if (f.series) return 2
  return 1
}

/** 練習を終えたときに呼ぶ。経験値を足し、やり遂げた練習なら雑学パックを1つ届ける */
export async function finishPractice(kind: string, seconds: number, database: EigoDB = db, day = dayKey()) {
  const xp = practiceXp(kind, seconds)
  if (xp > 0) await addXp(xp, {}, database, day)
  if (xp > 0 && seconds >= FINISH_SECONDS) {
    await database.packs.add({ at: Date.now(), day, source: kind, xp, opened: 0, notified: 0 })
  } else if (!NOT_PRACTICE.has(kind)) {
    // 短い練習を重ねて最低ラインに届いた日も、パックが少なくとも1つ届く
    const practiced = (await database.sessions.where('day').equals(day).toArray())
      .filter((x) => !NOT_PRACTICE.has(x.kind)).reduce((sum, x) => sum + x.seconds, 0)
    if (practiced >= MIN_SECONDS) await ensureDailyPack(database, day)
  }
}

/** 最低ラインを達成したのに、その日まだパックが届いていなければ1つ届ける */
export async function ensureDailyPack(database: EigoDB = db, day = dayKey()) {
  if (await database.packs.where('day').equals(day).count()) return
  await database.packs.add({ at: Date.now(), day, source: 'daily', xp: 0, opened: 0, notified: 0 })
}

export interface PackResult {
  pack: Pack
  fact?: FactContent
  rarity: number
  /** 前に集めた雑学（おさらい） */
  revisit: boolean
  xp: number
}

/** パックを開ける。中身を決め、雑学を図鑑に入れ、経験値を足す */
export async function openPack(pack: Pack, opts: {
  facts: FactContent[]
  reviewedWords: Set<string>
  liked: Set<string>
  phase: number
  rand?: () => number
}, database: EigoDB = db, day = dayKey()): Promise<PackResult> {
  const rand = opts.rand ?? Math.random
  const states = await database.facts.toArray()
  const owned = new Map<string, Fact>(states.map((f) => [f.id, f]))
  const newToday = states.filter((f) => f.acquiredDay === day).length
  let fact: FactContent | undefined
  let revisit = false
  if (newToday < NEW_FACTS_PER_DAY) {
    fact = pickFact({ facts: opts.facts, owned, reviewedWords: opts.reviewedWords, liked: opts.liked, phase: opts.phase, rand })
  }
  if (fact) {
    await acquireFact(fact, day, database)
  } else {
    // おさらい：前に集めた雑学から1つ（外したものは除く）
    const mine = opts.facts.filter((f) => owned.get(f.id)?.acquiredAt && !owned.get(f.id)?.excluded)
    fact = mine.length ? mine[Math.floor(rand() * mine.length)] : undefined
    revisit = true
  }
  const rarity = !fact || revisit ? 0 : rarityOf(fact)
  const xp = RARITY[rarity].xp
  const done: Pack = { ...pack, opened: 1, notified: 1, openedAt: Date.now(), factId: fact?.id, rarity }
  await database.packs.put(done)
  await addXp(xp, {}, database, day)
  return { pack: done, fact, rarity, revisit, xp }
}
