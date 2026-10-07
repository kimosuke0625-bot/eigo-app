import { useEffect, useState } from 'react'
import { db, type EigoDB, type Fact } from '../db/schema'

export interface FactContent {
  id: string
  category: string
  emoji: string
  ja: string
  easy: string
  std: string
  source: string
  rare: boolean
  origin: 'old' | 'new'
  /** 連続もの（2話目以降は、前の話を手に入れてから出る） */
  series?: { id: string; title: string; part: number; total: number }
}

/** 連続ものの前の話の id（1話目や連続ものでなければ undefined） */
function previousPart(f: FactContent, facts: FactContent[]): string | undefined {
  if (!f.series || f.series.part <= 1) return undefined
  return facts.find((x) => x.series?.id === f.series!.id && x.series.part === f.series!.part - 1)?.id
}

export interface FactsData {
  version: number
  categories: { key: string; ja: string }[]
  facts: FactContent[]
}

let cache: Promise<FactsData> | null = null
export function loadFacts(): Promise<FactsData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/facts.json`)
    .then((r) => {
      if (!r.ok) throw new Error('雑学データを読み込めませんでした')
      return r.json() as Promise<FactsData>
    })
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

export function useFacts(): FactsData | undefined {
  const [data, setData] = useState<FactsData>()
  useEffect(() => {
    let alive = true
    loadFacts().then((d) => alive && setData(d), () => {})
    return () => { alive = false }
  }, [])
  return data
}

/** Phase 1〜2 はやさしい版、Phase 3 以降は標準版の英文を出す */
export function factEnglish(f: FactContent, phase: number): string {
  return phase <= 2 ? f.easy : f.std
}

const WORD = /[a-z]+/g

/**
 * 今日の雑学を選ぶ。
 * - まだ持っていない雑学から、外したものを除いて選ぶ
 * - 今日復習した単語を含む雑学を優先する
 * - 「もっと知りたい」を押した分野を出やすくする
 * - レアは出にくい（重み 0.25）
 */
export function pickFact(opts: {
  facts: FactContent[]
  owned: Map<string, Fact>
  reviewedWords: Set<string>
  liked: Set<string>
  phase: number
  rand?: () => number
}): FactContent | undefined {
  const rand = opts.rand ?? Math.random
  const pool = opts.facts.filter((f) => {
    const s = opts.owned.get(f.id)
    if (s?.acquiredAt || s?.excluded) return false
    const prev = previousPart(f, opts.facts)
    const p = prev ? opts.owned.get(prev) : undefined
    return !prev || !!p?.acquiredAt || !!p?.excluded
  })
  if (!pool.length) return undefined
  const weights = pool.map((f) => {
    const words = new Set(factEnglish(f, opts.phase).toLowerCase().match(WORD) ?? [])
    const hits = [...words].filter((w) => opts.reviewedWords.has(w)).length
    let w = 1 + Math.min(hits, 3)
    if (opts.liked.has(f.category)) w *= 2
    if (f.rare) w *= 0.25
    // 連続ものの続きは、前の話を読んだ翌日以降に出やすくする
    if (f.series && f.series.part > 1) w *= 3
    return w
  })
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rand() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

export async function acquireFact(f: FactContent, day: string, database: EigoDB = db) {
  const current = await database.facts.get(f.id)
  await database.facts.put({ ...current, id: f.id, category: f.category, acquiredAt: Date.now(), acquiredDay: day })
}

export async function setExcluded(f: FactContent, excluded: boolean, database: EigoDB = db) {
  const current = await database.facts.get(f.id)
  await database.facts.put({ ...current, id: f.id, category: f.category, excluded })
}
