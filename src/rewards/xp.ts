import { db, type EigoDB } from '../db/schema'
import { getSettings } from '../db/settings'
import { NOT_PRACTICE } from '../habit/streak'
import { dayKey } from '../today/menu'

/**
 * 経験値とレベル（フェーズ6.5）。
 * 経験値は「思い出そうとした回数」と「やり遂げた練習」に付ける（正解数には付けない）。
 * 休んでも経験値やレベルは減らない。
 */

/** 1回思い出そうとしたときの経験値 */
export const REVIEW_XP = 10
/** 同じカードをその日2〜3回目に思い出そうとしたとき（学習中のカードの出し直しなど） */
export const REPEAT_XP = 3
/** 同じカードをその日4回目以降 */
export const REPEAT_XP_LATE = 1
/** 答えを見るまでが短すぎるとき（思い出そうとせずに連打したとき） */
export const QUICK_XP = 1
export const QUICK_MS = 800
/** 会心の一撃の確率 */
export const CRIT_CHANCE = 0.05

/** 練習を1つやり遂げたとみなす長さ（秒）。これ以上で雑学パックが届く */
export const FINISH_SECONDS = 120

/** レベル n から n+1 に上がるのに必要な経験値。2年でおよそ Lv 99 になる見込み */
export function xpToNext(level: number): number {
  return Math.round(100 + 25 * Math.pow(level - 1, 1.5))
}

export interface LevelInfo {
  level: number
  /** いまのレベルに入ってからの経験値 */
  into: number
  /** 次のレベルまでに必要な経験値（いまのレベルの幅） */
  need: number
}

export function levelFromXp(total: number): LevelInfo {
  let level = 1
  let rest = Math.max(0, Math.floor(total))
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level)
    level++
  }
  return { level, into: rest, need: xpToNext(level) }
}

/**
 * コンボの段階（0〜4）。段階が上がるほど倍率・音・演出が派手になる。
 * 倍率は最大1.5倍に抑える（「思い出せた」と甘く押したくならないように。利用者の決定 2026-10-08）
 */
export const COMBO_STEPS = [
  { at: 0, mult: 1, name: '' },
  { at: 3, mult: 1.1, name: 'コンボ' },
  { at: 5, mult: 1.2, name: 'グッドコンボ' },
  { at: 10, mult: 1.3, name: 'グレートコンボ' },
  { at: 20, mult: 1.5, name: 'フィーバー' },
] as const

/**
 * 正直ボーナス：「忘れた」を押したときに足す経験値。
 * コンボは途切れるが、正直に評価するほうが得だと感じられるようにする（満額のときだけ。連打は除く）
 */
export const HONEST_XP = 5

/** 正直ボーナスのときに出す前向きな一言 */
export const HONEST_LINES = [
  '忘れたと気づけた語は、次にぐっと覚えやすくなります。',
  '正直な評価が、ちょうどよい復習の間隔を作ります。',
  '思い出せなかった今こそ、記憶が強くなるところです。',
  'ここで答えを見たので、次はきっと思い出せます。',
  '間違えた分だけ、記憶の地図が正確になります。',
  '正直に押せるのは、本物の旅人のしるしです。',
]

export function comboStage(combo: number): number {
  let stage = 0
  COMBO_STEPS.forEach((s, i) => { if (combo >= s.at) stage = i })
  return stage
}

export interface ReviewGain {
  base: number
  mult: number
  /** 会心の一撃の倍率（1 = なし、2 または 3） */
  crit: number
  /** 正直ボーナス（「忘れた」を押したとき） */
  honest: number
  total: number
}

/**
 * 1問ごとの経験値。
 * - その日初めて思い出そうとしたカードは10、同じカードの2〜3回目は3、4回目以降は1
 * - 答えを見るまで0.8秒未満（連打）は1
 * - コンボ倍率は、思い出せた連続回数（combo）で決まる
 * - 会心の一撃は、満額（10）のときだけ5%の確率で出る。2倍（4回に3回）か3倍
 * - 「忘れた」（forgot）を押したときは、満額なら正直ボーナス5を足す
 */
export function reviewXp(opts: { attemptsToday: number; answerMs: number; combo: number; forgot?: boolean; rand?: () => number }): ReviewGain {
  const rand = opts.rand ?? Math.random
  let base = opts.attemptsToday === 0 ? REVIEW_XP : opts.attemptsToday < 3 ? REPEAT_XP : REPEAT_XP_LATE
  if (opts.answerMs < QUICK_MS) base = Math.min(base, QUICK_XP)
  const mult = COMBO_STEPS[comboStage(opts.combo)].mult
  let crit = 1
  if (base === REVIEW_XP && rand() < CRIT_CHANCE) crit = rand() < 0.75 ? 2 : 3
  const honest = opts.forgot && base === REVIEW_XP ? HONEST_XP : 0
  return { base, mult, crit, honest, total: Math.round(base * mult * crit) + honest }
}

/**
 * 練習を1つやり遂げたときの経験値。
 * - 2分以上で、やり遂げたボーナス20
 * - 1分ごとに3（30分まで）。ただし復習カードは1問ごとに付けているので、分ごとの分は付けない
 */
export function practiceXp(kind: string, seconds: number): number {
  if (NOT_PRACTICE.has(kind)) return 0
  const bonus = seconds >= FINISH_SECONDS ? 20 : 0
  const perMinute = kind === 'review' ? 0 : 3 * Math.min(30, Math.floor(seconds / 60))
  return bonus + perMinute
}

/** 経験値を足す。合計（settings）と1日ごとの記録を一緒に更新する */
export async function addXp(amount: number, meta: { crit?: boolean; combo?: number } = {}, database: EigoDB = db, day = dayKey()) {
  if (amount <= 0 && !meta.combo) return
  await database.transaction('rw', database.settings, database.xpDays, async () => {
    const s = await getSettings(database)
    await database.settings.put({ ...s, xpTotal: s.xpTotal + amount })
    const d = await database.xpDays.get(day)
    await database.xpDays.put({
      day,
      xp: (d?.xp ?? 0) + amount,
      crits: (d?.crits ?? 0) + (meta.crit ? 1 : 0),
      maxCombo: Math.max(d?.maxCombo ?? 0, meta.combo ?? 0),
    })
  })
}

/**
 * これまでの記録から経験値を計算する（フェーズ6.5より前の学習を引き継ぐ。1回だけ）。
 * 思い出そうとした回数 × 10 と、やり遂げた練習の経験値。コンボと会心の一撃は含めない。
 */
export async function migrateXp(database: EigoDB = db) {
  const s = await getSettings(database)
  if (s.xpVersion >= 1) return
  const byDay = new Map<string, number>()
  for (const r of await database.reviews.toArray()) {
    const day = dayKey(new Date(r.at))
    byDay.set(day, (byDay.get(day) ?? 0) + REVIEW_XP)
  }
  for (const x of await database.sessions.toArray()) {
    const xp = practiceXp(x.kind, x.seconds)
    if (xp) byDay.set(x.day, (byDay.get(x.day) ?? 0) + xp)
  }
  const total = [...byDay.values()].reduce((a, b) => a + b, 0)
  await database.transaction('rw', database.settings, database.xpDays, async () => {
    const now = await getSettings(database)
    if (now.xpVersion >= 1) return
    for (const [day, xp] of byDay) {
      const d = await database.xpDays.get(day)
      await database.xpDays.put({ day, xp: (d?.xp ?? 0) + xp, crits: d?.crits ?? 0, maxCombo: d?.maxCombo ?? 0 })
    }
    await database.settings.put({ ...now, xpTotal: now.xpTotal + total, xpVersion: 1 })
  })
}
