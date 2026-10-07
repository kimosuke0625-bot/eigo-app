import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type EigoDB } from '../db/schema'
import { countWords } from '../speech/sentences'

export interface Question {
  q: string
  options: string[]
  answer: number
}

/** 内蔵素材と、利用者が取り込んだ素材を同じ形で扱う */
export interface Mat {
  id: string
  title: string
  body: string
  moral?: string
  questions?: Question[]
  kind: 'graded' | 'business' | 'dialogue' | 'wiki' | 'fable' | 'human' | 'mine'
  /** 人の朗読など、素材全体が1つの音声ファイル（public/audio/ からの相対パス） */
  audioFile?: string
  /** 利用者が取り込んだ音声ファイル */
  audioBlob?: Blob
  /** 朗読者 */
  narrator?: string
  /** 対話の場面（日本語） */
  scene?: string
  /** 対話の話者と性別（f / m） */
  speakers?: Record<string, 'f' | 'm'>
  /** 対話のせりふ [話者, せりふ] */
  lines?: [string, string][]
  source: string
  sourceUrl: string
  license: string
  wordCount: number
}

export const KIND_LABELS: Record<Mat['kind'], string> = {
  graded: '読み物（自作）',
  business: 'ビジネスの読み物',
  dialogue: 'ビジネスの対話',
  wiki: 'Simple Wikipedia',
  fable: 'イソップ寓話',
  human: '人の朗読',
  mine: '取り込んだ素材',
}

let cache: Promise<Mat[]> | null = null
export function loadBuiltinMaterials(): Promise<Mat[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/materials.json`)
    .then((r) => {
      if (!r.ok) throw new Error('素材データを読み込めませんでした')
      return r.json() as Promise<{ materials: Mat[] }>
    })
    .then((d) => d.materials)
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

/** 内蔵素材と取り込んだ素材のすべて */
export function useMaterials(): Mat[] | undefined {
  const [builtin, setBuiltin] = useState<Mat[]>()
  useEffect(() => {
    let alive = true
    loadBuiltinMaterials().then((m) => alive && setBuiltin(m), () => alive && setBuiltin([]))
    return () => { alive = false }
  }, [])
  const mine = useLiveQuery(() => db.materials.toArray(), [])
  if (!builtin || !mine) return undefined
  return [
    ...mine
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .map((m): Mat => ({
        id: m.id, title: m.title, body: m.body, kind: 'mine', source: m.source,
        sourceUrl: '', license: m.license, wordCount: m.wordCount, audioBlob: m.audio,
      })),
    ...builtin,
  ]
}

/** 貼り付けた文章を素材として保存する（端末の中だけ。個人の学習用） */
export async function addMaterial(title: string, body: string, source: string, database: EigoDB = db, audio?: Blob): Promise<string> {
  const text = body.replace(/\r\n/g, '\n').trim()
  if (countWords(text) < 5) throw new Error('英文が短すぎます（5語以上）')
  const id = `mine-${Date.now().toString(36)}`
  await database.materials.add({
    id,
    title: title.trim() || text.split(/\s+/).slice(0, 6).join(' '),
    body: text,
    hasAudio: !!audio,
    ...(audio ? { audio } : {}),
    wordCount: countWords(text),
    source: source.trim() || '自分で取り込み',
    license: '個人の学習用（端末の外には出ません）',
    createdAt: Date.now(),
  })
  return id
}

export function deleteMaterial(id: string, database: EigoDB = db) {
  return database.materials.delete(id)
}

/** 素材ごとに最後に使った日時（多聴・多読と速読） */
export function useReadLog(): Map<string, number> {
  const sessions = useLiveQuery(() => db.sessions.where('kind').anyOf('input', 'fluency').toArray(), [], [])
  const log = new Map<string, number>()
  for (const s of sessions) if (s.ref && s.seconds > 0) log.set(s.ref, Math.max(log.get(s.ref) ?? 0, s.at))
  return log
}
