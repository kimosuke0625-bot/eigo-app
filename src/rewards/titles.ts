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

export const THEMES: Record<string, { name: string; primary: string; primaryDark: string }> = {
  indigo: { name: 'インディゴ（最初の色）', primary: '#6366f1', primaryDark: '#818cf8' },
  ocean: { name: 'オーシャン', primary: '#0e7490', primaryDark: '#22d3ee' },
  forest: { name: 'フォレスト', primary: '#15803d', primaryDark: '#4ade80' },
  sunset: { name: 'サンセット', primary: '#c2410c', primaryDark: '#fb923c' },
  sakura: { name: 'さくら', primary: '#be185d', primaryDark: '#f472b6' },
  night: { name: 'ミッドナイト', primary: '#4338ca', primaryDark: '#a5b4fc' },
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
  // 隠し称号（条件は表示しない）
  { key: 'early-bird', name: '朝の英語', desc: '朝6時より前に練習した', hidden: true, test: (s) => s.earlyBird },
  { key: 'night-owl', name: '夜ふかしの英語', desc: '夜23時より後に練習した', hidden: true, test: (s) => s.nightOwl },
  { key: 'perfect-ear', name: '完璧な耳', desc: 'ディクテーションで1文を完全に書き取った', hidden: true, test: (s) => s.perfectDictation },
  { key: 'rare-3', name: 'レアハンター', desc: 'レア雑学を3つ集めた', hidden: true, test: (s) => s.rareFacts >= 3 },
]

export async function loadStats(phase: number, rareIds: Set<string>, database: EigoDB = db): Promise<Stats> {
  const [reviews, cards, facts, assessments, recordings, journal, sessions, streak] = await Promise.all([
    database.reviews.count(), database.cards.toArray(), database.facts.toArray(),
    database.assessments.where('kind').equals('periodic').count(), database.recordings.count(),
    database.journal.count(), database.sessions.toArray(), loadStreak(database),
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
