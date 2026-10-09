import { db, type EigoDB } from '../db/schema'
import { GRAM_PREFIX } from '../srs/deck'

/**
 * 文法の修行（フェーズ9）。public/data/grammar.json（scripts/grammar/build.mjs が作る）。
 * 解説と問題は自作し、学習指導要領解説の該当箇所と照らし合わせた（項目ごとに出典の箇所を残す）。
 * 例文は Tatoeba の実在の文（英語を母語とする投稿者・日本語訳つき）。自作の文と答えは LanguageTool に通してある。
 * 問題は1問ずつ復習カードになる（語の id は gram-<項目>-<番号>。文法の束）。
 */
export interface GrammarSource { doc: string; where: string; page: string }
export interface GrammarPoint { text: string; en?: string[]; check: boolean }
export interface GrammarExample { en: string; ja?: string; source: 'tatoeba' | 'self'; enId?: number; jaId?: number }
export type GrammarMistake =
  | { kind: 'error'; wrong: string; right: string; note: string; proof: { kaisetsu: string; dictionary: string; languageTool: string[] } }
  | { kind: 'informal'; wrong: string; right: string; note: string; proof: { dictionary: string; spoken: string } }
  | { kind: 'meaning'; wrong: string; intended: string; right: string; note: string }

interface Base { id: string; ja: string; answers: string[] }
export type GrammarExercise =
  | (Base & { type: 'fill'; text: string; choices: string[] })
  | (Base & { type: 'order'; tokens: string[] })
  | (Base & { type: 'rewrite'; from: string })
  | (Base & { type: 'oral' })

export interface GrammarItem {
  id: string
  no: number
  title: string
  stage: string
  sources: GrammarSource[]
  points: GrammarPoint[]
  examples: GrammarExample[]
  mistakes: GrammarMistake[]
  exercises: GrammarExercise[]
  myself: { task: string; samples: string[]; checks: string[] }
}

export interface GrammarData { version: number; license: string; items: GrammarItem[] }

export const EXERCISE_LABELS: Record<GrammarExercise['type'], string> = {
  fill: '穴埋め',
  order: '並べ替え',
  rewrite: '言い換え',
  oral: '口頭で即答',
}

let cache: Promise<GrammarData> | null = null
export function loadGrammar(): Promise<GrammarData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/grammar.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`文法のデータを読み込めませんでした（${r.status}）`)
      return r.json() as Promise<GrammarData>
    })
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

/** 答えを比べる形にする（大文字小文字、文末などの記号、アポストロフィの種類、空白の違いは問わない。語や短縮形の違いは区別する） */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[.,!?;:"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 認める答えのどれかと同じなら正解（用意していない答えは、正しそうでも正解にしない） */
export function isAccepted(answer: string, accepted: string[]): boolean {
  const a = normalizeAnswer(answer)
  return a.length > 0 && accepted.some((x) => normalizeAnswer(x) === a)
}

/** 並べ替えの語を、毎回同じ順で混ぜる（答えの順のままにならないようにする） */
export function shuffledTokens(id: string, tokens: string[]): string[] {
  let seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  for (let tries = 0; tries < 5; tries++) {
    const out = [...tokens]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    if (out.join(' ') !== tokens.join(' ')) return out
  }
  return [...tokens].reverse()
}

/** 項目の修行を終えたか（問題がすべて復習カードになっていれば終えた） */
export async function finishedItems(data: GrammarData, database: EigoDB = db): Promise<Set<string>> {
  const carded = new Set((await database.cards.where('itemId').startsWith(GRAM_PREFIX).toArray()).map((c) => c.itemId))
  return new Set(data.items.filter((it) => it.exercises.every((x) => carded.has(x.id))).map((it) => it.id))
}

/** 問題の id（gram-g01-3）から項目と問題を引く */
export function findExercise(data: GrammarData, exerciseId: string): { item: GrammarItem; ex: GrammarExercise } | undefined {
  for (const item of data.items) {
    const ex = item.exercises.find((x) => x.id === exerciseId)
    if (ex) return { item, ex }
  }
  return undefined
}

/** 「この解説に疑問がある」・「自分の答えも正しいと思う」の記録（端末の中だけ。設定の「疑問の記録」で見られる） */
export async function reportGrammar(item: GrammarItem, what: string, note: string, database: EigoDB = db) {
  await database.reports.add({ itemId: `${GRAM_PREFIX}${item.id}`, english: `文法 ${item.no}. ${item.title}`, japanese: '', what, note: note.trim(), at: Date.now() })
}
