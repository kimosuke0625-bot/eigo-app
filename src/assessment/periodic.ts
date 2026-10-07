import type { Assessment } from '../db/schema'
import type { Mat } from '../content/materials'
import { countWords, splitSentences } from '../speech/sentences'
import type { WeekPillars } from '../progress/stats'

/** 測定の間隔（日） */
export const ASSESSMENT_INTERVAL_DAYS = 28
const DAY = 86_400_000

/** 測定の時期か（前回の測定か使い始めから28日以上） */
export function assessmentDue(last: number | undefined, startedAt: number, now = Date.now()): boolean {
  return now - (last ?? startedAt) >= ASSESSMENT_INTERVAL_DAYS * DAY
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 初見の音声のディクテーション用の文：まだ使っていない内蔵素材から、別々の素材の短い文を選ぶ。
 * 使っていない素材が足りなければ、使ったのが古い素材から選ぶ。
 */
export function pickUnseenSentences(materials: Mat[], used: Map<string, number>, n = 5, rand: () => number = Math.random) {
  // 文ごとの音声がない素材（人の朗読）と、文の頭に話者名がつく対話は使わない
  const builtin = materials.filter((m) => m.kind !== 'mine' && m.kind !== 'human' && m.kind !== 'dialogue')
  const ordered = [
    ...shuffle(builtin.filter((m) => !used.has(m.id)), rand),
    ...builtin.filter((m) => used.has(m.id)).sort((a, b) => used.get(a.id)! - used.get(b.id)!),
  ]
  const out: { text: string; materialId: string }[] = []
  for (const m of ordered) {
    const candidates = splitSentences(m.body).filter((s) => { const w = countWords(s); return w >= 5 && w <= 14 })
    if (!candidates.length) continue
    out.push({ text: shuffle(candidates, rand)[0], materialId: m.id })
    if (out.length === n) break
  }
  return out
}

/**
 * 初見の速読用の文章：問いつきで、まだ使っていない素材のうち、知っている語の割合が高い（やさしい）もの。
 * ディクテーションに使った素材は避ける。
 */
export function pickUnseenReading(materials: { m: Mat; ratio: number }[], used: Map<string, number>, avoid: Set<string>) {
  const pool = materials.filter(({ m }) => m.questions && m.kind !== 'mine' && !avoid.has(m.id))
  const fresh = pool.filter(({ m }) => !used.has(m.id))
  const list = (fresh.length ? fresh : pool).sort((a, b) => b.ratio - a.ratio)
  // やさしすぎず難しすぎない（96%前後）ものを優先
  return [...list].sort((a, b) => Math.abs(a.ratio - 0.97) - Math.abs(b.ratio - 0.97))[0]?.m
}

export const ASSESS_TOPICS = [
  'Introduce yourself and talk about what you do every day.',
  'Talk about something you learned recently and why it was interesting.',
  'Describe a place you like and explain why you like it.',
  'Talk about a goal you have this year and how you will reach it.',
]

export const ASSESS_WRITING = [
  'Write about your last weekend. What did you do, and how did you feel?',
  'Write about your job or studies. What do you like, and what is difficult?',
  'Write about a person you respect and explain why.',
  'Write about a problem in your town or school and how to solve it.',
]

export type MetricKey = 'vocabSize' | 'dictation' | 'readingWpm' | 'readingAccuracy' | 'speakingWpm' | 'writingWords' | 'writingTypes'

export const METRICS: { key: MetricKey; label: string; format: (v: number) => string }[] = [
  { key: 'vocabSize', label: '推定語彙数', format: (v) => `${Math.round(v).toLocaleString()}語` },
  { key: 'dictation', label: '聞き取り（ディクテーション一致率）', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'readingWpm', label: '読む速さ（1分あたりの語数）', format: (v) => `${Math.round(v)}` },
  { key: 'readingAccuracy', label: '読んだ内容の理解（正答率）', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'speakingWpm', label: '話す速さ（1分あたりの語数）', format: (v) => `${Math.round(v)}` },
  { key: 'writingWords', label: '5分で書いた語数', format: (v) => `${Math.round(v)}語` },
  { key: 'writingTypes', label: '使った語の種類', format: (v) => `${Math.round(v)}種類` },
]

/** 前回より下がった項目と、その原因の候補（過去4週の練習の記録から） */
export function declineReasons(
  current: Assessment,
  previous: Assessment | undefined,
  weeks: WeekPillars[],
  practiceDays: number,
): { key: MetricKey; label: string; reasons: string[] }[] {
  if (!previous) return []
  const sum = (k: keyof WeekPillars['minutes']) => weeks.reduce((s, w) => s + w.minutes[k], 0)
  const input = sum('input')
  const fluency = sum('fluency')
  const output = sum('output')
  const language = sum('language')
  const total = input + fluency + output + language
  const share = (v: number) => (total ? v / total : 0)
  const out: { key: MetricKey; label: string; reasons: string[] }[] = []
  for (const m of METRICS) {
    const a = current[m.key]
    const b = previous[m.key]
    if (typeof a !== 'number' || typeof b !== 'number') continue
    // 小さな上下は誤差として扱う（5%未満の差は「下がった」としない）
    if (a >= b * 0.95) continue
    const reasons: string[] = []
    if (practiceDays < 20) reasons.push(`この4週間で練習した日が${practiceDays}日でした（28日中）。毎日少しずつが一番効きます。`)
    if (m.key === 'dictation' && share(input) < 0.2) reasons.push('聞く練習（多聴・多読）の時間が全体の2割未満でした。')
    if (m.key === 'dictation' && share(fluency) < 0.15) reasons.push('シャドーイングの時間が少なめでした。')
    if ((m.key === 'readingWpm' || m.key === 'readingAccuracy') && share(input) < 0.2) reasons.push('読む練習（多読・速読）の時間が少なめでした。')
    if (m.key === 'readingWpm' && (current.readingAccuracy ?? 0) > (previous.readingAccuracy ?? 0)) reasons.push('今回は理解の正答率が上がっています。速さより正確さを優先した可能性があります。')
    if (m.key === 'speakingWpm' && share(fluency) < 0.15) reasons.push('話す練習（シャドーイング・4/3/2スピーチ）の時間が少なめでした。')
    if ((m.key === 'writingWords' || m.key === 'writingTypes') && share(output) < 0.1) reasons.push('書く・話す練習（音声日記・作文）の時間が少なめでした。')
    if (m.key === 'vocabSize' && share(language) < 0.25) reasons.push('復習カードの時間が少なめでした。')
    reasons.push('測定の文章やテーマとの相性、その日の体調でも数字は上下します。1回だけで判断せず、次の測定と合わせて見ましょう。')
    out.push({ key: m.key, label: m.label, reasons })
  }
  return out
}
