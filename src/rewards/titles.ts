import { db, type EigoDB } from '../db/schema'
import { loadStreak } from '../habit/streak'
import { MATURE_DAYS } from '../progress/stats'
import { State } from '../srs/fsrs'

/**
 * 称号と、解放される配色テーマ・効果音セット。
 * 点数やごほうびは「正解数」ではなく「思い出そうとした回数」と「やり遂げた練習」に付ける（SPEC 8.4）。
 */

export interface Stats {
  reviews: number
  /** 覚え始めたカードの数 */
  cards: number
  /** 定着した語（安定度21日以上） */
  mature: number
  streak: number
  bestStreak: number
  practiceDays: number
  facts: number
  rareFacts: number
  phase: number
  assessments: number
  recordings: number
  journal: number
  /** 朝6時より前に練習した日がある */
  earlyBird: boolean
  /** 夜23時より後に練習した日がある */
  nightOwl: boolean
  /** ディクテーションで一致率100%の文がある */
  perfectDictation: boolean
  conversation: number
  /** 倒した週のボスの数 */
  bosses: number
  /** 取り込んだ添削の数 */
  feedback: number
  /** 旅の手帳の表現を作文・音声日記で使えた回数の合計 */
  phrasesUsed: number
}

export interface Unlock {
  kind: 'theme' | 'soundSet'
  key: string
}

export interface TitleDef {
  key: string
  name: string
  desc: string
  hidden?: boolean
  unlock?: Unlock
  test: (s: Stats) => boolean
}

/**
 * 配色テーマ（RPG 風）。ボタンの色（btn）と、見出し・数字の色（accent）を、明るい配色と暗い配色で変える。
 * primary は RPG 風の窓の外（グラフなど）で使う色。
 */
export interface ThemeDef {
  name: string
  primary: string
  primaryDark: string
  btn: string
  btnDark: string
  accent: string
  accentDark: string
}
export const THEMES: Record<string, ThemeDef> = {
  indigo: { name: '冒険者（最初の色）', primary: '#a33d1f', primaryDark: '#818cf8', btn: '#a33d1f', btnDark: '#2c3a99', accent: '#8a3b12', accentDark: '#ffd86b' },
  ocean: { name: '海の旅', primary: '#0e7490', primaryDark: '#22d3ee', btn: '#0e6f8a', btnDark: '#0e5a74', accent: '#0b5566', accentDark: '#7dd3fc' },
  forest: { name: '森の旅', primary: '#15803d', primaryDark: '#4ade80', btn: '#2f7a3a', btnDark: '#1f5c2c', accent: '#1f5c2c', accentDark: '#a7f3a0' },
  sunset: { name: '夕焼けの旅', primary: '#c2410c', primaryDark: '#fb923c', btn: '#c2410c', btnDark: '#9a3412', accent: '#9a3412', accentDark: '#fdba74' },
  sakura: { name: '桜の旅', primary: '#be185d', primaryDark: '#f472b6', btn: '#b8326a', btnDark: '#8a1f52', accent: '#9d174d', accentDark: '#f9a8d4' },
  night: { name: '真夜中の旅', primary: '#4338ca', primaryDark: '#a5b4fc', btn: '#4338ca', btnDark: '#3730a3', accent: '#3730a3', accentDark: '#c7d2fe' },
  gold: { name: '黄金の旅（ボス討伐）', primary: '#a16207', primaryDark: '#facc15', btn: '#a16207', btnDark: '#854d0e', accent: '#854d0e', accentDark: '#fde047' },
}

export const SOUND_SETS: Record<string, string> = {
  classic: 'チャイム（最初の音）',
  bells: 'ベル',
  marimba: 'マリンバ',
  arcade: 'ゲーム風',
}

export const TITLES: TitleDef[] = [
  { key: 'first-step', name: 'はじめの一歩', desc: '初めて復習カードで思い出そうとした', test: (s) => s.reviews >= 1 },
  { key: 'try-100', name: '思い出し100回', desc: '思い出そうとした回数が100回', test: (s) => s.reviews >= 100, unlock: { kind: 'soundSet', key: 'bells' } },
  { key: 'try-1000', name: '思い出し1000回', desc: '思い出そうとした回数が1000回', test: (s) => s.reviews >= 1000, unlock: { kind: 'theme', key: 'night' } },
  { key: 'try-5000', name: '記憶の職人', desc: '思い出そうとした回数が5000回', test: (s) => s.reviews >= 5000 },
  { key: 'cards-100', name: '100語に挑戦', desc: '覚え始めた語が100語', test: (s) => s.cards >= 100, unlock: { kind: 'theme', key: 'ocean' } },
  { key: 'cards-500', name: '500語に挑戦', desc: '覚え始めた語が500語', test: (s) => s.cards >= 500 },
  { key: 'cards-1000', name: '1000語に挑戦', desc: '覚え始めた語が1000語', test: (s) => s.cards >= 1000, unlock: { kind: 'soundSet', key: 'marimba' } },
  { key: 'mature-100', name: '定着100語', desc: `安定度${MATURE_DAYS}日以上の語が100語`, test: (s) => s.mature >= 100, unlock: { kind: 'theme', key: 'forest' } },
  { key: 'mature-500', name: '定着500語', desc: `安定度${MATURE_DAYS}日以上の語が500語`, test: (s) => s.mature >= 500 },
  { key: 'streak-7', name: '1週間つづけた', desc: '連続7日', test: (s) => s.bestStreak >= 7 },
  { key: 'streak-30', name: '習慣の芽', desc: '連続30日', test: (s) => s.bestStreak >= 30, unlock: { kind: 'theme', key: 'sunset' } },
  { key: 'streak-66', name: '習慣になった', desc: '連続66日（習慣が身につく目安の日数）', test: (s) => s.bestStreak >= 66 },
  { key: 'streak-100', name: '100日の道', desc: '連続100日', test: (s) => s.bestStreak >= 100, unlock: { kind: 'soundSet', key: 'arcade' } },
  { key: 'streak-365', name: '1年の旅', desc: '連続365日', test: (s) => s.bestStreak >= 365, unlock: { kind: 'theme', key: 'sakura' } },
  { key: 'phase-2', name: 'Phase 2 到達', desc: 'Phase 2 に上がった', test: (s) => s.phase >= 2 },
  { key: 'phase-3', name: 'Phase 3 到達', desc: 'Phase 3 に上がった', test: (s) => s.phase >= 3 },
  { key: 'phase-4', name: 'Phase 4 到達', desc: 'Phase 4 に上がった', test: (s) => s.phase >= 4 },
  { key: 'facts-50', name: '雑学コレクター', desc: '雑学を50個集めた', test: (s) => s.facts >= 50 },
  { key: 'facts-365', name: '雑学博士', desc: '雑学を365個集めた', test: (s) => s.facts >= 365 },
  { key: 'measure-1', name: '自分を測った', desc: '4週間ごとの測定を初めて受けた', test: (s) => s.assessments >= 1 },
  { key: 'measure-6', name: '半年の記録', desc: '4週間ごとの測定を6回受けた', test: (s) => s.assessments >= 6 },
  { key: 'voice-10', name: '声の記録', desc: '録音を10回した', test: (s) => s.recordings >= 10 },
  { key: 'journal-10', name: '書く習慣', desc: '音声日記・作文を10回した', test: (s) => s.journal >= 10 },
  { key: 'talk-5', name: '会話の扉', desc: 'Claude との会話練習を5回した', test: (s) => s.conversation >= 5 },
  { key: 'boss-1', name: '初めてのボス討伐', desc: '週のボスを初めて倒した', test: (s) => s.bosses >= 1 },
  { key: 'boss-4', name: 'ボスハンター', desc: '週のボスを4回倒した', test: (s) => s.bosses >= 4, unlock: { kind: 'theme', key: 'gold' } },
  { key: 'boss-12', name: '週末の英雄', desc: '週のボスを12回倒した', test: (s) => s.bosses >= 12 },
  { key: 'boss-52', name: '一年の覇者', desc: '週のボスを52回倒した', test: (s) => s.bosses >= 52 },
  { key: 'letter-1', name: '師匠の手紙', desc: '添削を初めて取り込んだ', test: (s) => s.feedback >= 1 },
  { key: 'letter-20', name: '弟子の心得', desc: '添削を20回取り込んだ', test: (s) => s.feedback >= 20 },
  { key: 'phrase-10', name: '表現の使い手', desc: '旅の手帳の表現を10回使えた', test: (s) => s.phrasesUsed >= 10 },
  // 隠し称号（条件は表示しない）
  { key: 'early-bird', name: '朝の英語', desc: '朝6時より前に練習した', hidden: true, test: (s) => s.earlyBird },
  { key: 'night-owl', name: '夜ふかしの英語', desc: '夜23時より後に練習した', hidden: true, test: (s) => s.nightOwl },
  { key: 'perfect-ear', name: '完璧な耳', desc: 'ディクテーションで1文を完全に書き取った', hidden: true, test: (s) => s.perfectDictation },
  { key: 'rare-3', name: 'レアハンター', desc: 'レア雑学を3つ集めた', hidden: true, test: (s) => s.rareFacts >= 3 },
]

export async function loadStats(phase: number, rareIds: Set<string>, database: EigoDB = db): Promise<Stats> {
  const [reviews, cards, facts, assessments, recordings, journal, sessions, streak, bosses, feedback, phrases] = await Promise.all([
    database.reviews.count(), database.cards.toArray(), database.facts.toArray(),
    database.assessments.where('kind').equals('periodic').count(), database.recordings.count(),
    database.journal.count(), database.sessions.toArray(), loadStreak(database),
    database.bosses.filter((b) => b.defeated === 1).count(), database.feedback.count(), database.phrases.toArray(),
  ])
  const owned = facts.filter((f) => f.acquiredAt)
  const hours = sessions.filter((s) => s.seconds >= 60).map((s) => new Date(s.at).getHours())
  return {
    reviews,
    cards: cards.length,
    mature: cards.filter((c) => c.fsrs.state === State.Review && c.fsrs.stability >= MATURE_DAYS).length,
    streak: streak.current,
    bestStreak: streak.best,
    practiceDays: streak.totals.size,
    facts: owned.length,
    rareFacts: owned.filter((f) => rareIds.has(f.id)).length,
    phase,
    assessments,
    recordings,
    journal,
    earlyBird: hours.some((h) => h < 6),
    nightOwl: hours.some((h) => h >= 23),
    perfectDictation: sessions.some((s) => s.kind === 'dictation' && (s.result?.dictation ?? 0) >= 0.999),
    conversation: sessions.filter((s) => s.kind === 'conversation').length,
    bosses,
    feedback,
    phrasesUsed: phrases.reduce((sum, p) => sum + p.used, 0),
  }
}

/** まだ持っていない称号のうち、条件を満たしたもの */
export function newTitles(stats: Stats, owned: Set<string>): TitleDef[] {
  return TITLES.filter((t) => !owned.has(t.key) && t.test(stats))
}

/** 称号を記録し、ついてくる解放（テーマ・効果音セット）も記録する */
export async function grantTitles(titles: TitleDef[], database: EigoDB = db) {
  const now = Date.now()
  for (const t of titles) {
    await database.rewards.add({ kind: 'title', key: t.key, acquiredAt: now })
    if (t.unlock) await database.rewards.add({ kind: t.unlock.kind, key: t.unlock.key, acquiredAt: now })
  }
}
