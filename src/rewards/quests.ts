import { db, type EigoDB, type Pillar, type Session } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'
import { dayKey } from '../today/menu'
import { startOfDay } from '../srs/queue'
import { addXp } from './xp'
import { deckOf } from '../srs/deck'

/**
 * 今日のクエスト（フェーズ6.5）。毎日の小さな課題を、4つの柱から偏りなく出す。
 * 数は1日の目標時間で決まる（2026-10-09 利用者の依頼）：60分で3つ、90分で4つ、120分で5つ（questCount）。
 * - 3つのとき：4つの柱のうち3つから1つずつ。外す柱は日ごとに順番に替わるので、4日で4つの柱すべてが同じ回数ずつ出る
 * - 4つのとき：4つの柱から1つずつ。5つのとき：さらに1つ。追加の柱も日ごとに順番に替わる
 * 全部達成すると宝箱（経験値と雑学パック）。宝箱の後は、やってもやらなくてもよい「追加の依頼」がある（acceptExtra）。
 * 課題は「やり遂げた練習」と「思い出そうとした回数」で数え、正解数では数えない。
 */

export interface DayData {
  sessions: Session[]
  /** 今日思い出そうとした回数（単語の復習） */
  reviews: number
  /** 今日、表現の復習で言ってみた回数 */
  exprReviews: number
  /** 今日覚え始めた単語のカードの数 */
  introduced: number
  /** 今日、旅の手帳の表現を使えた数 */
  phrasesUsed: number
  /** 今日、文法の問題を解いた数（修行と復習） */
  gramAnswered: number
}

export interface QuestDef {
  key: string
  pillar: Pillar
  label: string
  goal: number
  unit: string
  /** 練習を始めるときの種類 */
  start: string
  /** 出してよいか（直しや表現がまだないときに出さないものなど） */
  needs?: 'fixes' | 'phrases'
  measure: (d: DayData) => number
}

const secondsOf = (d: DayData, kind: string) => d.sessions.filter((s) => s.kind === kind).reduce((a, s) => a + s.seconds, 0)
const finished = (d: DayData, kind: string, min = 120) => d.sessions.filter((s) => s.kind === kind && s.seconds >= min).length
const minutes = (d: DayData, kind: string) => Math.floor(secondsOf(d, kind) / 60)

export const QUESTS: QuestDef[] = [
  // 言語の学習
  { key: 'review-15', pillar: 'language', label: '単語の復習で15回戦う', goal: 15, unit: '回', start: 'review', measure: (d) => d.reviews },
  { key: 'new-5', pillar: 'language', label: '新しい単語のカードを5枚覚える', goal: 5, unit: '枚', start: 'addCards', measure: (d) => d.introduced },
  { key: 'pron-3', pillar: 'language', label: '発音・聞き分けを3分', goal: 3, unit: '分', start: 'pronunciation', measure: (d) => minutes(d, 'pronunciation') },
  { key: 'grammar-5', pillar: 'language', label: '文法の問題を5問解く（修行か復習）', goal: 5, unit: '問', start: 'grammar', measure: (d) => d.gramAnswered },
  { key: 'retell-3', pillar: 'language', label: '過去の自分の文を3つ言い直す', goal: 3, unit: '文', start: 'retell', needs: 'fixes',
    measure: (d) => d.sessions.filter((s) => s.kind === 'retell').reduce((a, s) => a + (s.result?.retold ?? 0), 0) },
  // インプット
  { key: 'input-1', pillar: 'input', label: '多聴・多読を1本やり遂げる', goal: 1, unit: '本', start: 'input', measure: (d) => finished(d, 'input') },
  { key: 'input-10', pillar: 'input', label: '多聴・多読を10分', goal: 10, unit: '分', start: 'input', measure: (d) => minutes(d, 'input') },
  { key: 'dict-3', pillar: 'input', label: 'ディクテーションを3分', goal: 3, unit: '分', start: 'dictation', measure: (d) => minutes(d, 'dictation') },
  // 流暢さ
  { key: 'shadow-5', pillar: 'fluency', label: 'シャドーイングを5分', goal: 5, unit: '分', start: 'shadowing', measure: (d) => minutes(d, 'shadowing') },
  { key: 'fluency-1', pillar: 'fluency', label: '4/3/2スピーチか速読を1回', goal: 1, unit: '回', start: 'fluency', measure: (d) => finished(d, 'fluency') },
  { key: 'shadow-1', pillar: 'fluency', label: 'シャドーイングを1本やり遂げる', goal: 1, unit: '本', start: 'shadowing', measure: (d) => finished(d, 'shadowing') },
  // アウトプット
  { key: 'output-1', pillar: 'output', label: '音声日記か作文を1つ', goal: 1, unit: 'つ', start: 'output', measure: (d) => finished(d, 'output', 60) },
  { key: 'roleplay-1', pillar: 'output', label: '対話の役割練習を1本', goal: 1, unit: '本', start: 'roleplay', measure: (d) => finished(d, 'roleplay') },
  // 表現の復習には熟語がいつもあるので、旅の手帳の表現がなくても出す
  { key: 'expr-5', pillar: 'output', label: '表現の復習で5回言ってみる', goal: 5, unit: '回', start: 'exprReview', measure: (d) => d.exprReviews },
  { key: 'phrase-1', pillar: 'output', label: '旅の手帳の表現を1つ使う', goal: 1, unit: 'つ', start: 'output', needs: 'phrases', measure: (d) => d.phrasesUsed },
  { key: 'talk-1', pillar: 'output', label: 'Claude と会話練習をする', goal: 1, unit: '回', start: 'conversation', measure: (d) => finished(d, 'conversation', 60) },
]

const PILLAR_ORDER: Pillar[] = ['language', 'input', 'fluency', 'output']

/** 日付から決まる数（同じ日なら何度計算しても同じ） */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** クエストの数の下限と上限 */
export const QUEST_MIN = 3
export const QUEST_MAX = 5

/** 1日の目標時間からクエストの数を決める（60分まで3つ、90分から4つ、120分から5つ） */
export function questCount(targetMinutes: number): number {
  return Math.min(QUEST_MAX, Math.max(QUEST_MIN, QUEST_MIN + Math.floor((targetMinutes - 60) / 30)))
}

/**
 * その日のクエストを count 個選ぶ。外す柱・追加の柱は日ごとに替わり、各柱の中の課題も日ごとに替わる。
 * count を増やしたときは、少ないときのクエストをそのまま含む（その日の途中で目標時間を増やしても入れ替わらない）。
 */
export function chooseQuests(day: string, available: { fixes: boolean; phrases: boolean }, count = QUEST_MIN): QuestDef[] {
  const n = dayNumber(day)
  const skip = PILLAR_ORDER[n % 4]
  const slots: Pillar[] = [...PILLAR_ORDER.filter((p) => p !== skip), skip, PILLAR_ORDER[(n + 1) % 4]].slice(0, Math.min(QUEST_MAX, count))
  const used = new Set<string>()
  return slots.map((p) => {
    const list = QUESTS.filter((q) => q.pillar === p && (!q.needs || available[q.needs]))
    const start = Math.floor(n / 4) % list.length
    for (let k = 0; k < list.length; k++) {
      const q = list[(start + k) % list.length]
      if (!used.has(q.key)) { used.add(q.key); return q }
    }
    return list[start]
  })
}

export async function loadDayData(day = dayKey(), database: EigoDB = db): Promise<DayData> {
  const since = startOfDay(new Date(`${day}T00:00:00`).getTime())
  const [sessions, reviews, introduced, journal, cards] = await Promise.all([
    database.sessions.where('day').equals(day).toArray(),
    database.reviews.where('at').aboveOrEqual(since).toArray(),
    database.cards.where('introducedAt').aboveOrEqual(since).toArray(),
    database.journal.where('day').equals(day).toArray(),
    database.cards.toArray(),
  ])
  const expr = new Set(cards.filter((c) => deckOf(c.itemId) === 'expr').map((c) => c.id))
  const gram = new Set(cards.filter((c) => deckOf(c.itemId) === 'gram').map((c) => c.id))
  return {
    sessions,
    // 単語の復習の数（表現と文法の問題は数えない）
    reviews: reviews.filter((r) => !expr.has(r.cardId) && !gram.has(r.cardId)).length,
    exprReviews: reviews.filter((r) => expr.has(r.cardId)).length,
    gramAnswered: reviews.filter((r) => gram.has(r.cardId)).length,
    introduced: introduced.filter((c) => deckOf(c.itemId) === 'word').length,
    phrasesUsed: journal.reduce((a, j) => a + (j.phrasesUsed?.length ?? 0), 0),
  }
}

export interface QuestState { def: QuestDef; value: number; done: boolean }

/**
 * 今日のクエストを選ぶ（まだなら）。選んだクエストは設定に残し、その日のうちは替えない。
 * その日の途中で目標時間を増やしたら、選んだものはそのままで足りない分だけ加える（減らしたら後ろから減らす）。
 */
async function questDefs(day: string, database: EigoDB, persist: boolean): Promise<QuestDef[]> {
  const s = await getSettings(database)
  const count = questCount(s.targetMinutes)
  const saved = s.questDay === day ? s.questKeys.map((k) => QUESTS.find((q) => q.key === k)).filter((q): q is QuestDef => !!q) : []
  if (saved.length >= count) return saved.slice(0, count)
  const available = { fixes: (await database.fixes.count()) > 0, phrases: (await database.phrases.count()) > 0 }
  const chosen = chooseQuests(day, available, count)
  const defs = [...saved, ...chosen.filter((q) => !saved.some((x) => x.key === q.key))].slice(0, count)
  if (persist) await updateSettings({ questDay: day, questKeys: defs.map((q) => q.key) }, database)
  return defs
}

/** 今日のクエストと進み具合（読むだけ。画面の自動更新の中で使う） */
export async function readQuests(day = dayKey(), database: EigoDB = db): Promise<{ quests: QuestState[]; chestOpened: boolean }> {
  const defs = await questDefs(day, database, false)
  const data = await loadDayData(day, database)
  const quests = defs.map((def) => {
    const value = def.measure(data)
    return { def, value, done: value >= def.goal }
  })
  return { quests, chestOpened: (await getSettings(database)).chestDay === day }
}

/** 今日のクエストを決めて（設定に残して）、進み具合を返す */
export async function todaysQuests(day = dayKey(), database: EigoDB = db): Promise<{ quests: QuestState[]; chestOpened: boolean }> {
  await questDefs(day, database, true)
  return readQuests(day, database)
}

/** 宝箱の中身 */
export const CHEST_XP = 100

/** 全部達成したら宝箱を開ける：経験値と雑学パック1つ */
export async function openChest(day = dayKey(), database: EigoDB = db): Promise<boolean> {
  const { quests, chestOpened } = await todaysQuests(day, database)
  if (chestOpened || !quests.every((q) => q.done)) return false
  await updateSettings({ chestDay: day }, database)
  await addXp(CHEST_XP, {}, database, day)
  await database.packs.add({ at: Date.now(), day, source: 'chest', xp: CHEST_XP, opened: 0, notified: 0 })
  return true
}

/**
 * 追加の依頼（2026-10-09 利用者の依頼）。その日のクエストを全部終えて宝箱を開けた後に、1つずつ受けられる（1日 EXTRA_MAX 個まで）。
 * やらなくても連続記録や報酬で損はしない。達成すると追加の経験値と雑学パック。
 * 課題は今日のクエストと別のものを、柱を順番に替えて選ぶ。受けた時点から増えた分で数える。
 */
export const EXTRA_MAX = 3
export const EXTRA_XP = 50

export interface ExtraState { def: QuestDef; value: number; done: boolean }

function extraDef(day: string, used: string[], index: number, available: { fixes: boolean; phrases: boolean }): QuestDef | undefined {
  const n = dayNumber(day)
  for (let k = 0; k < 4; k++) {
    const p = PILLAR_ORDER[(n + index + k) % 4]
    const q = QUESTS.find((x) => x.pillar === p && !used.includes(x.key) && (!x.needs || available[x.needs]))
    if (q) return q
  }
  return undefined
}

/** 追加の依頼の今の状態（受けていなければ current はない） */
export async function readExtra(day = dayKey(), database: EigoDB = db): Promise<{ current?: ExtraState; claimed: number; max: number }> {
  const s = await getSettings(database)
  const today = s.extraDay === day
  const claimed = today ? s.extraClaimed : 0
  const def = today && s.extraKey ? QUESTS.find((q) => q.key === s.extraKey) : undefined
  if (!def) return { claimed, max: EXTRA_MAX }
  const value = Math.max(0, def.measure(await loadDayData(day, database)) - s.extraBase)
  return { current: { def, value, done: value >= def.goal }, claimed, max: EXTRA_MAX }
}

/** 追加の依頼を受ける（宝箱を開けた後だけ。受けている途中なら何もしない） */
export async function acceptExtra(day = dayKey(), database: EigoDB = db): Promise<boolean> {
  const s = await getSettings(database)
  if (s.chestDay !== day) return false
  const today = s.extraDay === day
  const claimed = today ? s.extraClaimed : 0
  if ((today && s.extraKey) || claimed >= EXTRA_MAX) return false
  const usedBefore = today ? s.extraUsed : []
  const used = [...(s.questDay === day ? s.questKeys : []), ...usedBefore]
  const available = { fixes: (await database.fixes.count()) > 0, phrases: (await database.phrases.count()) > 0 }
  const def = extraDef(day, used, claimed, available)
  if (!def) return false
  const base = def.measure(await loadDayData(day, database))
  await updateSettings({ extraDay: day, extraKey: def.key, extraBase: base, extraClaimed: claimed, extraUsed: [...usedBefore, def.key] }, database)
  return true
}

/** 達成した追加の依頼の報酬を受け取る：経験値と雑学パック1つ */
export async function claimExtra(day = dayKey(), database: EigoDB = db): Promise<boolean> {
  const { current, claimed } = await readExtra(day, database)
  if (!current?.done) return false
  await updateSettings({ extraKey: '', extraClaimed: claimed + 1 }, database)
  await addXp(EXTRA_XP, {}, database, day)
  await database.packs.add({ at: Date.now(), day, source: 'extra', xp: EXTRA_XP, opened: 0, notified: 0 })
  return true
}
