import { db, type EigoDB, type Item } from '../db/schema'
import { State } from '../srs/fsrs'

export interface Token {
  text: string
  lower: string
  /** 文の途中で大文字から始まる語（人名・地名などとみなして数えない） */
  proper: boolean
  number: boolean
}

/** 英文を語に分ける。's や n't は語の一部として扱い、後で取り除く */
export function tokenize(text: string): Token[] {
  const out: Token[] = []
  const re = /([A-Za-z]+(?:['’][A-Za-z]+)*)|(\d[\d,.]*)|([.!?]+)/g
  let sentenceStart = true
  for (const m of text.matchAll(re)) {
    if (m[3]) { sentenceStart = true; continue }
    if (m[2]) { out.push({ text: m[2], lower: m[2], proper: false, number: true }); sentenceStart = false; continue }
    const word = m[1]
    const lower = word.toLowerCase().replace(/['’](s|t|re|ve|ll|d|m)$/, '').replace(/n$/, (n) => (word.toLowerCase().endsWith("n't") || word.toLowerCase().endsWith('n’t') ? '' : n))
    const proper = !sentenceStart && /^[A-Z]/.test(word) && word !== 'I'
    out.push({ text: word, lower, proper, number: false })
    sentenceStart = false
  }
  return out
}

/** 語形（活用形を含む）→ NGSL の語。同じ語形が複数あれば順位の高い語 */
export function buildFormIndex(items: Pick<Item, 'id' | 'english' | 'forms' | 'ngslRank'>[]): Map<string, string> {
  const index = new Map<string, { id: string; rank: number }>()
  for (const it of items) {
    const rank = it.ngslRank ?? 99999
    for (const f of it.forms ?? [it.english]) {
      const key = f.toLowerCase()
      const cur = index.get(key)
      if (!cur || cur.rank > rank) index.set(key, { id: it.id, rank })
    }
  }
  return new Map([...index].map(([k, v]) => [k, v.id]))
}

export interface RatioResult {
  /** 既知語率（固有名詞と数字を除いた語のうち、知っている語の割合） */
  ratio: number
  counted: number
  /** 知らない語（NGSL にある語は itemId つき） */
  unknown: { word: string; itemId?: string }[]
}

export function knownRatio(text: string, index: Map<string, string>, known: Set<string>): RatioResult {
  let counted = 0
  let ok = 0
  const unknown = new Map<string, { word: string; itemId?: string }>()
  for (const t of tokenize(text)) {
    if (t.proper || t.number) continue
    counted++
    const id = index.get(t.lower)
    if (id && known.has(id)) ok++
    else if (!unknown.has(t.lower)) unknown.set(t.lower, { word: t.lower, itemId: id })
  }
  return { ratio: counted ? ok / counted : 1, counted, unknown: [...unknown.values()] }
}

/** 多読・多聴に向く既知語率は 95〜98% */
export type Fit = 'easy' | 'just' | 'stretch' | 'hard'
export function fitOf(ratio: number): Fit {
  if (ratio >= 0.98) return 'easy'
  if (ratio >= 0.95) return 'just'
  if (ratio >= 0.9) return 'stretch'
  return 'hard'
}
export const FIT_LABELS: Record<Fit, string> = {
  easy: 'やさしい（速読向き）',
  just: 'ちょうどよい',
  stretch: 'やや難しい',
  hard: '難しい',
}

/** おすすめ順：ちょうどよい（96.5%前後）に近いものから */
export function fitDistance(ratio: number) {
  return Math.abs(ratio - 0.965)
}

/** 利用者が知っている語：診断テストや「もう知っている」で登録した語と、復習中のカード */
export async function loadKnownSet(database: EigoDB = db): Promise<Set<string>> {
  const known = new Set(await database.knownWords.toCollection().primaryKeys())
  await database.cards.each((c) => {
    if (c.fsrs.state === State.Review) known.add(c.itemId)
  })
  return known
}

let indexCache: Promise<Map<string, string>> | null = null
export function loadFormIndex(database: EigoDB = db): Promise<Map<string, string>> {
  indexCache ??= database.items.toArray().then(buildFormIndex)
  return indexCache
}
