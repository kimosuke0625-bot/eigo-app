import { db, type EigoDB, type Item } from '../db/schema'
import { startOfDay } from '../srs/queue'
import { tokenize } from '../content/knownRatio'
import { writeSnapshot } from '../progress/stats'
import type { Level } from './claudePrompts'

export interface Target {
  lemma: string
  forms: string[]
  ja?: string
}

/**
 * 今日の語：今日覚え始めたカードと、今日復習したカードの語（覚え始めた語を先に）。
 * 作文や音声日記では、この中から3つ以上を使う。
 */
export async function todaysTargets(now = Date.now(), database: EigoDB = db, limit = 8): Promise<Target[]> {
  const since = startOfDay(now)
  const introduced = await database.cards.where('introducedAt').aboveOrEqual(since).toArray()
  const reviews = await database.reviews.where('at').aboveOrEqual(since).toArray()
  const reviewedCards = await database.cards.bulkGet([...new Set(reviews.map((r) => r.cardId))])
  const itemIds = [...new Set([...introduced.map((c) => c.itemId), ...reviewedCards.flatMap((c) => (c ? [c.itemId] : []))])]
  const items = (await database.items.bulkGet(itemIds)).filter((i): i is Item => !!i)
  return items.slice(0, limit).map((i) => ({ lemma: i.english, forms: i.forms ?? [i.english], ja: i.japanese }))
}

/** 英文の中で使った「今日の語」（活用形も数える） */
export function usedTargets(text: string, targets: Target[]): string[] {
  const words = new Set(tokenize(text).map((t) => t.lower))
  return targets.filter((t) => t.forms.some((f) => words.has(f.toLowerCase()))).map((t) => t.lemma)
}

/** 語数と、使った語の種類の数（固有名詞・数字を除く） */
export function wordStats(text: string): { words: number; types: number } {
  const tokens = tokenize(text).filter((t) => !t.number)
  return { words: tokens.length, types: new Set(tokens.map((t) => t.lower)).size }
}

/** Claude に伝えるレベル（Phase と、知っている語＋定着した語の数） */
export async function currentLevel(phase: number, database: EigoDB = db): Promise<Level> {
  const snap = await writeSnapshot(database)
  return { phase, vocab: snap.known + snap.mature }
}

export interface DiaryPrompt {
  en: string
  ja: string
  minPhase: number
}

/** 日記・作文のテーマ（日によって変わる） */
export const OUTPUT_PROMPTS: DiaryPrompt[] = [
  { en: 'What did you do today?', ja: '今日したこと', minPhase: 1 },
  { en: 'What was the best part of your day?', ja: '今日いちばんよかったこと', minPhase: 1 },
  { en: 'What did you eat today? Did you like it?', ja: '今日食べたものと感想', minPhase: 1 },
  { en: 'What are you going to do tomorrow?', ja: '明日の予定', minPhase: 1 },
  { en: 'Who did you talk to today? What did you talk about?', ja: '今日話した人と、その話題', minPhase: 1 },
  { en: 'What did you learn today?', ja: '今日学んだこと', minPhase: 1 },
  { en: 'Was there a problem today? How did you deal with it?', ja: '今日あった問題と、その対処', minPhase: 2 },
  { en: 'Describe something you saw or read today and give your opinion.', ja: '今日見たもの・読んだものと、自分の意見', minPhase: 2 },
  { en: 'What is one thing you want to improve this week, and how?', ja: '今週よくしたいこと1つと、その方法', minPhase: 2 },
  { en: 'Explain your work or studies today to a colleague who was absent.', ja: '休んでいた同僚に、今日の仕事や勉強を説明する', minPhase: 3 },
  { en: 'Write a short report of today: what you finished, what is left, and any risks.', ja: '今日の報告：終えたこと・残っていること・心配な点', minPhase: 3 },
  { en: 'Give your opinion on a recent change at work, school, or in society, with reasons.', ja: '最近の変化についての意見と理由', minPhase: 3 },
]

export function promptForDay(phase: number, day: string): DiaryPrompt {
  const list = OUTPUT_PROMPTS.filter((p) => p.minPhase <= phase)
  let h = 0
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return list[h % list.length]
}
