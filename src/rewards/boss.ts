import { db, type EigoDB, type Item } from '../db/schema'
import { addDays, dayTotals, weekStart } from '../habit/streak'
import { dayKey } from '../today/menu'
import { addXp } from './xp'
import { deckOf } from '../srs/deck'

/**
 * 週のボス戦（フェーズ6.5）。週末（土・日）に、その週に学んだ単語をまとめて出題する（対象は単語の束だけ。表現は出さない）。
 * 意味を4つから選ぶ形にして、復習カード（FSRS）の記録には入れない（復習の間隔を乱さない）。
 * 間違えた語は後ろに回ってもう一度出る。全部答えきるとボスを倒せる（罰はない）。
 */

export const BOSS_XP = 200
/** 1問答えるごとの経験値（正解でなくても入る） */
export const BOSS_HIT_XP = 5
export const BOSS_MAX_WORDS = 12
export const BOSS_MIN_WORDS = 4

export function isBossDay(date = new Date()): boolean {
  const d = date.getDay()
  return d === 6 || d === 0
}

/** 次の土曜日までの日数（週末なら0） */
export function daysToBoss(date = new Date()): number {
  return isBossDay(date) ? 0 : 6 - date.getDay()
}

export interface BossQuestion {
  itemId: string
  english: string
  answer: string
  options: string[]
}

/** 日本語訳の最初の意味（「、」などで区切られた最初のもの） */
export function firstGloss(ja: string): string {
  return ja.split(/[、,;；／/]/)[0].replace(/[（(].*?[）)]/g, '').trim()
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** その週に学んだ語（覚え始めた語を先に。足りなければその週に復習した語、さらに足りなければ直近2週間に復習した語） */
export async function bossItems(today = dayKey(), database: EigoDB = db): Promise<Item[]> {
  const since = new Date(`${weekStart(today)}T00:00:00`).getTime()
  const ids: string[] = (await database.cards.where('introducedAt').aboveOrEqual(since).toArray()).map((c) => c.itemId).filter((id) => deckOf(id) === 'word')
  for (const from of [since, since - 7 * 86_400_000]) {
    if (ids.length >= BOSS_MAX_WORDS) break
    const reviewed = await database.reviews.where('at').aboveOrEqual(from).toArray()
    const cards = await database.cards.bulkGet([...new Set(reviewed.map((r) => r.cardId))])
    for (const c of cards) if (c && deckOf(c.itemId) === 'word' && !ids.includes(c.itemId)) ids.push(c.itemId)
  }
  const items = (await database.items.bulkGet(ids)).filter((i): i is Item => !!i && !!i.japanese && !!firstGloss(i.japanese))
  return items.slice(0, BOSS_MAX_WORDS)
}

/** 出題を作る。まちがいの選択肢は、ほかの語の意味から選ぶ */
export async function bossQuestions(today = dayKey(), database: EigoDB = db, rand: () => number = Math.random): Promise<BossQuestion[]> {
  const items = shuffle(await bossItems(today, database), rand)
  if (items.length < BOSS_MIN_WORDS) return []
  const pool = new Set(items.map((i) => firstGloss(i.japanese!)))
  // 選択肢を増やすため、基本語からも意味を集める
  const offset = Math.floor(rand() * 1500)
  const extra = await database.items.where('ngslRank').between(offset, offset + 120).toArray()
  for (const i of extra) if (i.japanese) pool.add(firstGloss(i.japanese))
  const glosses = [...pool].filter(Boolean)
  return items.map((item) => {
    const answer = firstGloss(item.japanese!)
    const wrong = shuffle(glosses.filter((g) => g !== answer), rand).slice(0, 3)
    return { itemId: item.id, english: item.english, answer, options: shuffle([answer, ...wrong], rand) }
  })
}

/** ボスを倒した記録と、ごほうび（経験値と雑学パック） */
export async function defeatBoss(words: number, today = dayKey(), database: EigoDB = db) {
  const week = weekStart(today)
  if ((await database.bosses.get(week))?.defeated) return
  await database.bosses.put({ week, at: Date.now(), words, defeated: 1 })
  await addXp(BOSS_XP, {}, database, today)
  await database.packs.add({ at: Date.now(), day: today, source: 'boss', xp: BOSS_XP, opened: 0, notified: 0 })
}

/* ---- おかえりボーナス ---- */

export const COMEBACK_XP = 100
/** この日数以上あいてから戻った日にボーナスを出す（2日以上休んだ＝3日ぶり以上） */
export const COMEBACK_GAP = 3

function dayDiff(a: string, b: string): number {
  const t = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }
  return Math.round((t(b) - t(a)) / 86_400_000)
}

/** 前に練習した日（今日より前）から今日まで何日あいたか（初めての人は 0） */
export async function daysAway(today = dayKey(), database: EigoDB = db): Promise<number> {
  const days = [...(await dayTotals(database)).entries()].filter(([, s]) => s > 0).map(([d]) => d).sort()
  const before = days.filter((d) => d < today)
  if (!before.length) return 0
  return dayDiff(before[before.length - 1], today)
}

export async function claimComeback(today = dayKey(), database: EigoDB = db): Promise<boolean> {
  const s = await database.settings.get('main')
  if (s?.comebackDay === today) return false
  if ((await daysAway(today, database)) < COMEBACK_GAP) return false
  await database.settings.update('main', { comebackDay: today })
  await addXp(COMEBACK_XP, {}, database, today)
  await database.packs.add({ at: Date.now(), day: today, source: 'comeback', xp: COMEBACK_XP, opened: 0, notified: 0 })
  return true
}

/* ---- 過去の自分との対戦 ---- */

export interface VersusData {
  today: number
  /** 先週の同じ曜日 */
  lastWeekDay: number
  /** 今週の合計（今日まで） */
  thisWeek: number
  /** 先週の同じ時点までの合計 */
  lastWeekSoFar: number
}

export async function loadVersus(today = dayKey(), database: EigoDB = db): Promise<VersusData> {
  const ws = weekStart(today)
  const n = dayDiff(ws, today)
  const lastWs = addDays(ws, -7)
  const xp = async (d: string) => (await database.xpDays.get(d))?.xp ?? 0
  let thisWeek = 0
  let lastWeekSoFar = 0
  for (let i = 0; i <= n; i++) {
    thisWeek += await xp(addDays(ws, i))
    lastWeekSoFar += await xp(addDays(lastWs, i))
  }
  return { today: await xp(today), lastWeekDay: await xp(addDays(today, -7)), thisWeek, lastWeekSoFar }
}
