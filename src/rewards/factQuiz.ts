import type { Fact } from '../db/schema'

/** 数日前に読んだ雑学から、英文の穴うめクイズを1問作る */
export interface FactQuiz {
  factId: string
  /** 穴をあけた英文（____ の所） */
  sentence: string
  answer: string
  options: string[]
}

const STOP = new Set(['about', 'after', 'again', 'because', 'before', 'being', 'could', 'every', 'their', 'there', 'these', 'think', 'those', 'through', 'which', 'while', 'would', 'where', 'other', 'still', 'thing', 'things'])
const contentWords = (text: string) =>
  [...text.matchAll(/\b([a-z]{5,})\b/g)].map((m) => m[1]).filter((w) => !STOP.has(w))

/** 穴にする語：文中の内容語（5文字以上・小文字で始まる語）から1つ。まぎらわしい選択肢を他の雑学から2つ */
export function buildFactQuiz(factId: string, english: string, others: string[], rand: () => number = Math.random): FactQuiz | undefined {
  const words = [...new Set(contentWords(english))]
  if (!words.length) return undefined
  const answer = words[Math.floor(rand() * words.length)]
  const pool = [...new Set(others.flatMap(contentWords))].filter((w) => w !== answer && !english.includes(w))
  // 長さの近い語を選ぶと、つづりだけで当てられにくい
  pool.sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length) || rand() - 0.5)
  const distractors = pool.slice(0, 6).sort(() => rand() - 0.5).slice(0, 2)
  if (distractors.length < 2) return undefined
  const options = [answer, ...distractors].sort(() => rand() - 0.5)
  const sentence = english.replace(new RegExp(`\\b${answer}\\b`), '____')
  return { factId, sentence, answer, options }
}

/** クイズに出す雑学：3〜14日前に手に入れて、まだクイズに出していないもの（古いものから） */
export function quizCandidate(states: Fact[], now = Date.now()): Fact | undefined {
  const day = 86_400_000
  return states
    .filter((f) => f.acquiredAt && !f.quizzedAt && now - f.acquiredAt >= 3 * day && now - f.acquiredAt <= 14 * day)
    .sort((a, b) => a.acquiredAt! - b.acquiredAt!)[0]
}
