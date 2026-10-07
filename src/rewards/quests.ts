import { db, type EigoDB, type Pillar, type Session } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'
import { dayKey } from '../today/menu'
import { startOfDay } from '../srs/queue'
import { addXp } from './xp'

/**
 * 今日のクエスト（フェーズ6.5）。毎日3つの小さな課題を、4つの柱のうち3つから1つずつ出す。
 * 外す柱は日ごとに順番に替わるので、4日で4つの柱すべてが同じ回数ずつ出る。
 * 3つとも達成すると宝箱（経験値と雑学パック）。
 * 課題は「やり遂げた練習」と「思い出そうとした回数」で数え、正解数では数えない。
 */

export interface DayData {
  sessions: Session[]
  /** 今日思い出そうとした回数（復習カード） */
  reviews: number
  /** 今日覚え始めたカードの数 */
  introduced: number
  /** 今日、旅の手帳の表現を使えた数 */
  phrasesUsed: number
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
  { key: 'review-15', pillar: 'language', label: '言葉の魔物と15回戦う', goal: 15, unit: '回', start: 'review', measure: (d) => d.reviews },
  { key: 'new-5', pillar: 'language', label: '新しいカードを5枚覚える', goal: 5, unit: '枚', start: 'addCards', measure: (d) => d.introduced },
  { key: 'pron-3', pillar: 'language', label: '発音・聞き分けを3分', goal: 3, unit: '分', start: 'pronunciation', measure: (d) => minutes(d, 'pronunciation') },
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
  { key: 'phrase-1', pillar: 'output', label: '旅の手帳の表現を1つ使う', goal: 1, unit: 'つ', start: 'output', needs: 'phrases', measure: (d) => d.phrasesUsed },
  { key: 'talk-1', pillar: 'output', label: 'Claude と会話練習をする', goal: 1, unit: '回', start: 'conversation', measure: (d) => finished(d, 'conversation', 60) },
]

const PILLAR_ORDER: Pillar[] = ['language', 'input', 'fluency', 'output']

/** 日付から決まる数（同じ日なら何度計算しても同じ） */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** その日のクエスト3つを選ぶ。外す柱は日ごとに替わり、各柱の中の課題も日ごとに替わる */
export function chooseQuests(day: string, available: { fixes: boolean; phrases: boolean }): QuestDef[] {
  const n = dayNumber(day)
  const skip = PILLAR_ORDER[n % 4]
  return PILLAR_ORDER.filter((p) => p !== skip).map((p) => {
    const list = QUESTS.filter((q) => q.pillar === p && (!q.needs || available[q.needs]))
    return list[Math.floor(n / 4) % list.length]
  })
}

export async function loadDayData(day = dayKey(), database: EigoDB = db): Promise<DayData> {
  const since = startOfDay(new Date(`${day}T00:00:00`).getTime())
  const [sessions, reviews, introduced, journal] = await Promise.all([
    database.sessions.where('day').equals(day).toArray(),
    database.reviews.where('at').aboveOrEqual(since).count(),
    database.cards.where('introducedAt').aboveOrEqual(since).count(),
    database.journal.where('day').equals(day).toArray(),
  ])
  return { sessions, reviews, introduced, phrasesUsed: journal.reduce((a, j) => a + (j.phrasesUsed?.length ?? 0), 0) }
}

export interface QuestState { def: QuestDef; value: number; done: boolean }

/** 今日のクエストを選ぶ（まだなら）。選んだクエストは設定に残し、その日のうちは替えない */
async function questDefs(day: string, database: EigoDB, persist: boolean): Promise<QuestDef[]> {
  const s = await getSettings(database)
  const saved = s.questDay === day ? s.questKeys.map((k) => QUESTS.find((q) => q.key === k)).filter((q): q is QuestDef => !!q) : []
  if (saved.length === 3) return saved
  const available = { fixes: (await database.fixes.count()) > 0, phrases: (await database.phrases.count()) > 0 }
  const defs = chooseQuests(day, available)
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

/** 3つとも達成したら宝箱を開ける：経験値と雑学パック1つ */
export async function openChest(day = dayKey(), database: EigoDB = db): Promise<boolean> {
  const { quests, chestOpened } = await todaysQuests(day, database)
  if (chestOpened || !quests.every((q) => q.done)) return false
  await updateSettings({ chestDay: day }, database)
  await addXp(CHEST_XP, {}, database, day)
  await database.packs.add({ at: Date.now(), day, source: 'chest', xp: CHEST_XP, opened: 0, notified: 0 })
  return true
}
