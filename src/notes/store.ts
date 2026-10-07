import { db, type EigoDB, type Feedback, type FeedbackSource, type Fix, type Item, type Phrase } from '../db/schema'
import { dayKey } from '../today/menu'
import { weekStart, addDays } from '../habit/streak'
import { introduce } from '../srs/store'
import { addXp } from '../rewards/xp'
import { ASR_TYPE } from './errorTypes'
import type { ParsedFix, ParsedPhrase } from './parse'

/**
 * 添削の記録・旅の手帳（表現ノート）・弱点の研究（苦手ノート）のデータの扱い。
 * すべて端末の中だけに保存し、バックアップに含める。
 */

/** 添削を取り込んだときの経験値（Claude に添削を頼んで持ち帰った分） */
export const IMPORT_XP = 20
/** 「今日使ってみる表現」を作文・音声日記で実際に使えたときの経験値（1つにつき） */
export const PHRASE_USE_XP = 30
/** 言い直しの練習1問の経験値 */
export const RETELL_XP = 10

export const SOURCE_LABELS: Record<FeedbackSource, string> = {
  write: '短い作文',
  diary: '音声日記',
  speech: '4/3/2スピーチ',
  conversation: 'Claude と会話練習',
  other: 'そのほか',
}

/** 表現を復習カードにするときの語の id */
export const phraseItemId = (id: number) => `phrase-${id}`

export function phraseItem(p: Phrase): Item {
  return {
    id: phraseItemId(p.id!),
    kind: 'chunk',
    english: p.expression,
    japanese: p.meaning || undefined,
    forms: [p.expression],
    examples: p.example ? [{ en: p.example, ja: '' }] : [],
  }
}

/** 表現の語（items）を作り直す。items はバックアップに含めないので、起動時と読み込み後に呼ぶ */
export async function syncPhraseItems(database: EigoDB = db) {
  const list = await database.phrases.toArray()
  if (list.length) await database.items.bulkPut(list.map(phraseItem))
}

export interface FeedbackDraft {
  source: FeedbackSource
  journalId?: number
  recordingId?: number
  ref?: string
  raw: string
  fixes: ParsedFix[]
  phrases: ParsedPhrase[]
}

/** 取り込んだ添削を保存する。表現は旅の手帳に入れ、復習カードにも加える */
export async function saveFeedback(d: FeedbackDraft, database: EigoDB = db, now = Date.now()): Promise<{ feedbackId: number; phraseIds: number[] }> {
  const day = dayKey(new Date(now))
  const trim = (s: string) => s.trim()
  const fixes = d.fixes.filter((f) => trim(f.original) || trim(f.corrected))
  const phrases = d.phrases.filter((p) => trim(p.expression))
  const result = await database.transaction('rw', [database.feedback, database.fixes, database.phrases, database.items, database.cards], async () => {
    const feedback: Feedback = { at: now, day, source: d.source, raw: d.raw }
    if (d.journalId) feedback.journalId = d.journalId
    if (d.recordingId) feedback.recordingId = d.recordingId
    if (d.ref) feedback.ref = d.ref
    const feedbackId = await database.feedback.add(feedback) as number
    await database.fixes.bulkAdd(fixes.map((f) => ({
      feedbackId, at: now, day, original: trim(f.original), corrected: trim(f.corrected), type: f.type, note: trim(f.note), practiced: 0,
    })))
    const phraseIds: number[] = []
    for (const p of phrases) {
      const row: Phrase = {
        at: now, day, feedbackId, source: d.source, used: 0,
        expression: trim(p.expression), meaning: trim(p.meaning), example: trim(p.example), scene: trim(p.scene),
      }
      const id = await database.phrases.add(row) as number
      phraseIds.push(id)
      await database.items.put(phraseItem({ ...row, id }))
      await introduce(phraseItemId(id), now, database)
    }
    return { feedbackId, phraseIds }
  })
  await addXp(IMPORT_XP, {}, database, day)
  return result
}

/** 表現を旅の手帳から消す（復習カードも消す） */
export async function deletePhrase(id: number, database: EigoDB = db) {
  const itemId = phraseItemId(id)
  await database.transaction('rw', [database.phrases, database.items, database.cards], async () => {
    await database.phrases.delete(id)
    await database.cards.where('itemId').equals(itemId).delete()
    await database.items.delete(itemId)
  })
}

/** 添削の記録を消す（直しも消す。旅の手帳の表現は残す） */
export async function deleteFeedback(id: number, database: EigoDB = db) {
  await database.transaction('rw', [database.feedback, database.fixes], async () => {
    await database.fixes.where('feedbackId').equals(id).delete()
    await database.feedback.delete(id)
  })
}

export interface TypeCount {
  type: string
  total: number
  thisWeek: number
  lastWeek: number
}

/** 間違いの種類ごとの数（多い順）。聞き取りの誤り（音声認識の誤り）は入れない */
export function countTypes(fixes: Pick<Fix, 'type' | 'day'>[], today: string): TypeCount[] {
  const thisWeek = weekStart(today)
  const lastWeek = addDays(thisWeek, -7)
  const map = new Map<string, TypeCount>()
  for (const f of fixes) {
    if (f.type === ASR_TYPE) continue
    const c = map.get(f.type) ?? { type: f.type, total: 0, thisWeek: 0, lastWeek: 0 }
    c.total++
    if (f.day >= thisWeek) c.thisWeek++
    else if (f.day >= lastWeek) c.lastWeek++
    map.set(f.type, c)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || b.thisWeek - a.thisWeek)
}

/** 弱点の上位（次の依頼文の「重点的に見てほしい点」に入れる） */
export async function topWeakTypes(n = 3, database: EigoDB = db, today = dayKey()): Promise<string[]> {
  return countTypes(await database.fixes.toArray(), today).slice(0, n).map((c) => c.type)
}

/** 今日使ってみる表現：使った回数が少なく、しばらく使っていないものから */
export function choosePhrases(list: Phrase[], n = 3): Phrase[] {
  return [...list]
    .sort((a, b) => a.used - b.used || (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0) || a.at - b.at)
    .slice(0, n)
}

// 表現の中の「~」「…」「sb」「something」などは、何が入ってもよい所
const PLACEHOLDER = /(?:~|〜|…|\.\.\.|\(.*?\)|\[.*?\]|\b(?:sb|sth|someone|somebody|something|one's|A|B|X)\b)/g

function wordPattern(w: string): string {
  const e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 活用（-s, -es, -ed, -d, -ing）は許す。make → making のように e が落ちる形も
  const stem = /e$/.test(w) && w.length > 2 ? `(?:${e}|${e.slice(0, -1)}(?=ing))` : e
  return `${stem}(?:s|es|ed|d|ing)?`
}

/** 英文の中で表現を使ったか（大文字・小文字、句読点、活用の違いは気にしない） */
export function usedPhrase(text: string, expression: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'~〜….()[\]\s-]/g, ' ')
  const body = ` ${norm(text).replace(/[.()[\]~〜…]/g, ' ').replace(/\s+/g, ' ')} `
  const segments = norm(expression).replace(/\bing\b/g, ' ').split(PLACEHOLDER)
    .map((s) => s.replace(/[.()[\]]/g, ' ').trim().split(/\s+/).filter(Boolean))
    .filter((ws) => ws.length)
  if (!segments.length) return false
  const re = new RegExp(segments.map((ws) => `\\b${ws.map(wordPattern).join('\\s+')}\\b`).join('.*?'))
  return re.test(body)
}

/** 作文・音声日記で表現を使えたことを記録し、経験値を足す */
export async function markPhrasesUsed(ids: number[], database: EigoDB = db, now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  await database.transaction('rw', database.phrases, async () => {
    for (const id of ids) {
      const p = await database.phrases.get(id)
      if (p) await database.phrases.put({ ...p, used: p.used + 1, lastUsedAt: now })
    }
  })
  const xp = PHRASE_USE_XP * ids.length
  await addXp(xp, {}, database, dayKey(new Date(now)))
  return xp
}

/** 言い直しの練習に出す直し：まだ練習していないもの、言えなかったもの、しばらく練習していないものから */
export async function retellQueue(limit = 10, database: EigoDB = db): Promise<Fix[]> {
  const all = (await database.fixes.toArray())
    .filter((f) => f.type !== ASR_TYPE && f.original && f.corrected && f.original.trim() !== f.corrected.trim())
  return all
    .sort((a, b) => (a.lastResult ?? -1) - (b.lastResult ?? -1) || (a.lastPracticedAt ?? 0) - (b.lastPracticedAt ?? 0) || b.at - a.at)
    .slice(0, limit)
}

export async function recordRetell(fix: Fix, result: 0 | 1 | 2, database: EigoDB = db, now = Date.now()) {
  await database.fixes.update(fix.id!, { practiced: fix.practiced + 1, lastPracticedAt: now, lastResult: result })
  await addXp(RETELL_XP, {}, database, dayKey(new Date(now)))
}
