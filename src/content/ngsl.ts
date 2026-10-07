import { useEffect, useState } from 'react'
import { db, type EigoDB, type Example, type Item } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'

/** public/data/ngsl.json の1語分（scripts/build-ngsl.mjs が作る） */
export interface NgslWord {
  id: string
  rank: number
  lemma: string
  forms: string[]
  ja: string
  def: string
  ex: Example[]
}

export interface NgslData {
  version: number
  words: NgslWord[]
}

export function toItem(w: NgslWord): Item {
  return {
    id: w.id,
    kind: 'word',
    english: w.lemma,
    japanese: w.ja,
    definition: w.def || undefined,
    forms: w.forms,
    examples: w.ex,
    ngslRank: w.rank,
  }
}

/** 語彙データを items テーブルに取り込む。版が変わったときだけ入れ直す */
export async function syncItems(data: NgslData, database: EigoDB = db) {
  const s = await getSettings(database)
  if (s.contentVersion === data.version && (await database.items.count()) >= data.words.length) return
  await database.items.bulkPut(data.words.map(toItem))
  await updateSettings({ contentVersion: data.version }, database)
}

let cache: Promise<NgslData> | null = null

export function loadNgsl(): Promise<NgslData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/ngsl.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`語彙データを読み込めませんでした（${r.status}）`)
      return r.json() as Promise<NgslData>
    })
    .then(async (data) => {
      await syncItems(data)
      return data
    })
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

/** ビジネス語彙（BSL）の順位は、基本語（NGSL）のあとに続く順位として保存する */
export const BSL_OFFSET = 3000

export const isBsl = (id: string) => id.startsWith('bsl:')

/** 「NGSL 120位」「ビジネス 25位」のような順位の表示 */
export function rankLabel(item: Pick<Item, 'id' | 'ngslRank'>): string {
  if (item.ngslRank === undefined) return ''
  return isBsl(item.id) ? `ビジネス ${item.ngslRank - BSL_OFFSET}位` : `NGSL ${item.ngslRank}位`
}

/** ビジネス語彙を items テーブルに取り込む。版が変わったときだけ入れ直す */
export async function syncBsl(data: NgslData, database: EigoDB = db) {
  const s = await getSettings(database)
  if (s.bslVersion === data.version) return
  await database.items.bulkPut(data.words.map((w) => toItem({ ...w, rank: BSL_OFFSET + w.rank })))
  await updateSettings({ bslVersion: data.version }, database)
}

let bslCache: Promise<void> | null = null

export function loadBsl(): Promise<void> {
  bslCache ??= fetch(`${import.meta.env.BASE_URL}data/bsl.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`ビジネス語彙を読み込めませんでした（${r.status}）`)
      return r.json() as Promise<NgslData>
    })
    .then((data) => syncBsl(data))
    .catch((e) => {
      bslCache = null
      throw e
    })
  return bslCache
}

export function useNgsl():{ data?: NgslData; error?: string } {
  const [state, setState] = useState<{ data?: NgslData; error?: string }>({})
  useEffect(() => {
    let alive = true
    loadNgsl().then(
      (data) => alive && setState({ data }),
      (e: Error) => alive && setState({ error: e.message }),
    )
    return () => { alive = false }
  }, [])
  return state
}
