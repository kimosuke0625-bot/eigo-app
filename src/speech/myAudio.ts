// 自分の音声（フェーズ7.5）：旅の手帳の表現と例文を PC の高品質な声で作ったもの（scripts/build-my-audio.mjs）。
// 学習データから作った音声なので、公開の音声置き場には置かず、ファイルで受け取って端末（IndexedDB）にだけ保存する。
import { db, type EigoDB } from '../db/schema'
import { textKey } from './audioKey'

/** 保存済みの英文の鍵 */
const keys = new Set<string>()
/** すぐ再生できるもの（blob の URL）。iPhone は押した瞬間に再生を始める必要があるので、先に用意しておく */
const ready = new Map<string, string>()
let loaded: Promise<void> | null = null

export function loadMyAudioKeys(database: EigoDB = db): Promise<void> {
  loaded ??= database.myAudio.toCollection().primaryKeys()
    .then((ks) => { for (const k of ks) keys.add(String(k)) })
    .catch(() => {})
  return loaded
}
if (typeof indexedDB !== 'undefined') void loadMyAudioKeys()

/** この英文の自分の音声を、押した瞬間に鳴らせるよう用意する（表示したときに呼ぶ） */
export async function prepareMine(text: string, database: EigoDB = db): Promise<void> {
  if (!text) return
  await loadMyAudioKeys(database)
  const key = textKey(text)
  if (!keys.has(key) || ready.has(key)) return
  const row = await database.myAudio.get(key)
  if (row) ready.set(key, URL.createObjectURL(row.audio))
}

/** 用意できている自分の音声の URL（なければ undefined） */
export function mineUrl(text: string): string | undefined {
  return ready.get(textKey(text))
}

export function myAudioCount(): number {
  return keys.size
}

export interface MyAudioFile {
  format: 'eigo-my-audio'
  version: number
  createdAt: number
  clips: { key: string; text: string; mp3: string }[]
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'audio/mpeg' })
}

/** PC で作ったファイルを読み込んで保存する。保存した数を返す（同じ英文は新しいもので置き換える） */
export async function importMyAudio(text: string, database: EigoDB = db): Promise<number> {
  let data: MyAudioFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('ファイルを読み取れませんでした（JSON 形式ではありません）')
  }
  if (data?.format !== 'eigo-my-audio' || !Array.isArray(data.clips)) {
    throw new Error('「自分の音声」のファイルではありません（eigo-my-audio-….json を選んでください）')
  }
  const now = Date.now()
  const rows = data.clips.filter((c) => c.key && c.mp3).map((c) => ({ key: c.key, text: c.text, audio: base64ToBlob(c.mp3), at: now }))
  await database.myAudio.bulkPut(rows)
  for (const r of rows) {
    keys.add(r.key)
    const old = ready.get(r.key)
    if (old) { URL.revokeObjectURL(old); ready.delete(r.key) }
  }
  return rows.length
}

export async function clearMyAudio(database: EigoDB = db) {
  await database.myAudio.clear()
  keys.clear()
  for (const u of ready.values()) URL.revokeObjectURL(u)
  ready.clear()
}
