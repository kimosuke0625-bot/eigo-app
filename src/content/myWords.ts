import { db, type EigoDB, type Item, type MyWord } from '../db/schema'
import { introduce } from '../srs/store'
import { saveGloss } from './edits'

/**
 * 自分で選んだ語のリストを貼り付けて、単語の復習に加える（2026-10-14 利用者の依頼）。
 * - 1行に1語（または語句）。「英語 - 訳」「英語：訳」「英語<タブ>訳」「英語 訳」のように訳を付けてもよい。
 *   訳のない行が「apple, banana, cherry」のようにコンマで区切られていれば、1語ずつに分ける。
 * - 単語集（NGSL・ビジネス語彙）にある語は、その訳と実在の例文を使う。訳を付けたときは、その訳に書き直す。
 * - 単語集にない語は、自分の訳で新しいカードを作る（語の id は my:<小文字の英語>。単語の束に入る）。訳は必ず要る。
 */

export interface PastedWord {
  english: string
  japanese: string
}

/** 日本語の文字（ひらがな・カタカナ・漢字・全角の記号） */
const JA = /[　-ヿ㐀-鿿豈-﫿！-｠]/
/** 行の頭の箇条書きの印・番号 */
const BULLET = /^\s*(?:[-*・•●◦]|\d+\s*[.)．、]|\(\d+\)|（\d+）)\s*/
/** 英語と訳の間の区切り */
const SEP = /[\s\t]*(?:[-–—=:：＝,，、→]|->)?[\s\t]*$/
/** 語として認める英語：英字で始まり、英字・空白・ハイフン・アポストロフィ・ピリオドだけ。60文字まで */
const ENGLISH = /^[A-Za-z][A-Za-z\s'’.-]{0,59}$/

export interface ParseResult {
  words: PastedWord[]
  /** 英語として読めなかった行 */
  skipped: string[]
}

export function parseWordList(text: string): ParseResult {
  const words: PastedWord[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  const push = (english: string, japanese: string, raw: string) => {
    const en = english.replace(/’/g, "'").replace(/\s+/g, ' ').trim().replace(/[.]+$/, '')
    if (!ENGLISH.test(en)) { if (raw.trim()) skipped.push(raw.trim()); return }
    const key = en.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    words.push({ english: en, japanese: japanese.trim() })
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(BULLET, '').trim()
    if (!line) continue
    const j = line.search(JA)
    if (j < 0) {
      // 訳のない行。タブかコンマで区切られていれば1語ずつ
      const parts = line.split(/\t|[,，;]/).map((s) => s.trim()).filter(Boolean)
      for (const p of parts) push(p, '', p)
      continue
    }
    const english = line.slice(0, j).replace(SEP, '')
    // 全角の区切り（：＝，、）は日本語の文字の範囲に入るので、訳の頭から外す
    push(english, line.slice(j).replace(/^[\s：＝，、　:=,-]+/, ''), raw)
  }
  return { words, skipped }
}

export type PlanKind = 'listed' | 'reviewing' | 'custom'

export interface PlanRow {
  english: string
  /** 付けた訳（なければ空） */
  japanese: string
  kind: PlanKind
  /** listed・reviewing のとき：単語集の語 */
  item?: Item
  /** custom のとき：作る語の id */
  itemId: string
}

export const customId = (english: string) => `my:${english.toLowerCase()}`

/**
 * 貼り付けた語を、単語集の語・すでに復習中の語・新しく作る語に分ける。
 * 単語集の語は、見出し語が同じものを先に、なければ活用形（studies → study など）で探す。
 */
export async function planWords(words: PastedWord[], database: EigoDB = db): Promise<PlanRow[]> {
  const items = (await database.items.where('kind').equals('word').toArray())
  const byLemma = new Map<string, Item>()
  const byForm = new Map<string, Item>()
  for (const it of items) {
    if (!byLemma.has(it.english.toLowerCase())) byLemma.set(it.english.toLowerCase(), it)
    for (const f of it.forms ?? []) if (!byForm.has(f.toLowerCase())) byForm.set(f.toLowerCase(), it)
  }
  const carded = new Set((await database.cards.orderBy('itemId').keys()).map(String))
  return words.map((w) => {
    const key = w.english.toLowerCase()
    const item = byLemma.get(key) ?? byForm.get(key)
    const itemId = item?.id ?? customId(w.english)
    const kind: PlanKind = carded.has(itemId) ? 'reviewing' : item ? 'listed' : 'custom'
    return { english: w.english, japanese: w.japanese, kind, item, itemId }
  })
}

/** 自分で作った語の items の形（例文はなし。答えでは自分の訳を出す） */
export function customItem(w: Pick<MyWord, 'itemId' | 'english' | 'japanese'>): Item {
  return { id: w.itemId, kind: 'word', english: w.english, japanese: w.japanese, forms: [w.english], examples: [] }
}

/**
 * 計画どおりに単語の復習へ加える。すでに復習中の語はそのまま（訳を付けたときだけ書き直す）。
 * 単語集の語で「知っている語」になっていたものは、知っている語から外して復習に入れる。
 * 返り値：新しく加えたカードの数
 */
export async function addWords(rows: PlanRow[], now = Date.now(), database: EigoDB = db): Promise<number> {
  let added = 0
  for (const r of rows) {
    if (r.kind === 'custom' && !r.japanese.trim()) continue
    const mine: MyWord = { itemId: r.itemId, english: r.item?.english ?? r.english, japanese: r.japanese.trim(), custom: r.kind === 'custom', addedAt: now }
    if (r.kind === 'custom') await database.items.put(customItem(mine))
    else if (mine.japanese && mine.japanese !== r.item?.japanese) await saveGloss(r.itemId, mine.japanese, database)
    const existing = await database.myWords.get(r.itemId)
    await database.myWords.put(existing ? { ...existing, japanese: mine.japanese || existing.japanese } : mine)
    if (r.kind !== 'reviewing') {
      await database.knownWords.delete(r.itemId)
      await introduce(r.itemId, now, database)
      added++
    }
  }
  return added
}

/** 起動時：自分で作った語を items に入れ直す（items はバックアップに含めないため） */
export async function syncMyWordItems(database: EigoDB = db) {
  const list = (await database.myWords.toArray()).filter((w) => w.custom)
  if (list.length) await database.items.bulkPut(list.map(customItem))
}

/** 自分で加えた語を外す（カードと復習の記録も消す。単語集の語は単語集に戻り、また新しいカードとして出られる） */
export async function removeMyWord(itemId: string, database: EigoDB = db) {
  await database.transaction('rw', [database.myWords, database.cards, database.reviews, database.items], async () => {
    const cards = await database.cards.where('itemId').equals(itemId).toArray()
    for (const c of cards) await database.reviews.where('cardId').equals(c.id!).delete()
    await database.cards.where('itemId').equals(itemId).delete()
    await database.myWords.delete(itemId)
    if (itemId.startsWith('my:')) await database.items.delete(itemId)
  })
}
