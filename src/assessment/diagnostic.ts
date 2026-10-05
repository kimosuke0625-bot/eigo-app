import type { NgslWord } from '../content/ngsl'

/** NGSL の順位帯。各帯から同じ数の語を出して、帯ごとの既知率を推定する */
export const BANDS: [number, number][] = [
  [1, 500],
  [501, 1000],
  [1001, 1500],
  [1501, 2000],
  [2001, 2809],
]
export const PER_BAND = 10
/** 診断テストに出さず、受けたら知っている語として扱う最上位の語数 */
export const TOP_KNOWN = 100

/**
 * 実在しない英単語。「知っている」と答えた割合で、知っているつもりの分を差し引く。
 * Tatoeba の英文約150万文に1度も出てこないことを確認済み。
 */
export const PSEUDOWORDS = [
  'brastle', 'frelt', 'plimsy', 'sterrand', 'cralid', 'trintle', 'morphane', 'gleave',
  'pandock', 'sparrice', 'drelling', 'contrivial', 'rebasive', 'marbility', 'porlent',
]
export const PSEUDO_COUNT = 10

export interface DiagnosticQuestion {
  word: string
  /** 実在語なら NGSL の順位、偽の単語なら null */
  rank: number | null
  itemId?: string
}

export interface DiagnosticAnswer extends DiagnosticQuestion {
  known: boolean
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildDiagnostic(words: NgslWord[], rand: () => number = Math.random): DiagnosticQuestion[] {
  const qs: DiagnosticQuestion[] = []
  for (const [lo, hi] of BANDS) {
    // 最上位の機能語（the, be など）は誰でも知っているので除く
    const pool = words.filter((w) => w.rank >= Math.max(lo, TOP_KNOWN + 1) && w.rank <= hi && w.lemma.length > 2)
    for (const w of shuffle(pool, rand).slice(0, PER_BAND)) qs.push({ word: w.lemma, rank: w.rank, itemId: w.id })
  }
  for (const p of shuffle(PSEUDOWORDS, rand).slice(0, PSEUDO_COUNT)) qs.push({ word: p, rank: null })
  return shuffle(qs, rand)
}

export interface DiagnosticResult {
  /** 帯ごとの既知率（偽の単語への「知っている」で補正済み） */
  bandRates: number[]
  falseAlarmRate: number
  /** 推定語彙数（NGSL の範囲内） */
  vocabSize: number
  phase: 1 | 2 | 3 | 4
  /** 新しいカードをこの順位から始める（それより上の帯はほぼ知っているとみなす） */
  startRank: number
}

export function scoreDiagnostic(answers: DiagnosticAnswer[]): DiagnosticResult {
  const pseudo = answers.filter((a) => a.rank === null)
  const f = pseudo.length ? pseudo.filter((a) => a.known).length / pseudo.length : 0
  const bandRates = BANDS.map(([lo, hi]) => {
    const inBand = answers.filter((a) => a.rank !== null && a.rank >= lo && a.rank <= hi)
    if (!inBand.length) return 0
    const h = inBand.filter((a) => a.known).length / inBand.length
    if (f >= 1) return 0
    return Math.min(1, Math.max(0, (h - f) / (1 - f)))
  })
  const vocabSize = Math.round(BANDS.reduce((s, [lo, hi], i) => s + (hi - lo + 1) * bandRates[i], 0))
  const firstWeak = bandRates.findIndex((r) => r < 0.9)
  const startRank = firstWeak === -1 ? BANDS[BANDS.length - 1][1] + 1 : BANDS[firstWeak][0]
  const phase: DiagnosticResult['phase'] =
    vocabSize < 1000 ? 1 : vocabSize < 2000 ? 2 : vocabSize < 2700 ? 3 : 4
  return { bandRates, falseAlarmRate: f, vocabSize, phase, startRank }
}
