import { db, type EigoDB, type Item, type MyWord } from '../db/schema'
import { introduce } from '../srs/store'
import { saveGloss } from './edits'
import { phraseItem, phraseItemId } from '../notes/store'
import { dayKey } from '../today/menu'

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
/** 語として認める英語：英字で始まり、英字・空白・ハイフン・アポストロフィ・ピリオド・（ ）・／だけ。60文字まで */
const ENGLISH = /^[A-Za-z][A-Za-z\s'’.()/-]{0,59}$/

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
    // 熟語の「〜」の印（look forward to ~ など）は外す
    const en = english.replace(/’/g, "'").replace(/[~〜～…]|\.{3}/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.]+$/, '')
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

/**
 * 分け方（2026-10-14 利用者の依頼「リストに熟語が混ざるので見分けて分けたい」）：
 * - idiom：アプリの熟語集（300個）の見出しと同じ → その熟語のカード（いちばんよく使う意味）。表現の束
 * - listed：単語集（NGSL・ビジネス語彙）の語 → その語のカード。単語の束
 * - phrase：熟語集にない2語以上の語句 → 旅の手帳に入れてカードを作る（自分の訳）。表現の束
 * - custom：単語集にない1語 → 自分の訳でカードを作る。単語の束
 * - reviewing：すでに復習中（何もしない。訳を付けた単語集の語だけ書き直す）
 * custom と phrase は、確認の画面で利用者が入れ替えられる（自動の分け方が違うとき）。
 */
export type PlanKind = 'listed' | 'idiom' | 'reviewing' | 'custom' | 'phrase'

export interface PlanRow {
  english: string
  /** 付けた訳（なければ空） */
  japanese: string
  kind: PlanKind
  /** 単語の束か表現の束か */
  deck: 'word' | 'expr'
  /** listed・idiom・reviewing のとき：単語集・熟語集・旅の手帳の語 */
  item?: Item
  /** 加える（加えた）カードの語の id。phrase で新しく作るときは、加えるときに決まる */
  itemId: string
}

export const customId = (english: string) => `my:${english.toLowerCase()}`
const PHRASE_SCENE = '自分のリスト'

/**
 * 熟語の見出しと比べる形：大文字小文字、~ 〜 … や（ ）の中、sb・sth などの置き換えの語、
 * my・your など（熟語集では one's）の違いは問わない
 */
export function idiomKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\([^)]*\)|（[^）]*）/g, ' ')
    .replace(/[~〜～…]|\.{3}/g, ' ')
    .replace(/\b(?:sb|sth|somebody|something|someone|one)\b(?!')/g, ' ')
    .replace(/\b(?:my|your|his|her|its|our|their|someone's|somebody's)\b/g, "one's")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 貼り付けた語を分ける。単語集の語は見出し語が同じものを先に、なければ活用形（studies → study など）で探す。
 * 熟語集の熟語は idiomKey で比べ、意味が複数あるものは1つ目（いちばんよく使う意味）のカードにする。
 */
export async function planWords(words: PastedWord[], database: EigoDB = db): Promise<PlanRow[]> {
  const byLemma = new Map<string, Item>()
  const byForm = new Map<string, Item>()
  for (const it of await database.items.where('kind').equals('word').toArray()) {
    if (!byLemma.has(it.english.toLowerCase())) byLemma.set(it.english.toLowerCase(), it)
    for (const f of it.forms ?? []) if (!byForm.has(f.toLowerCase())) byForm.set(f.toLowerCase(), it)
  }
  const idioms = new Map<string, Item>()
  const phrases = new Map<string, Item>()
  for (const it of await database.items.where('kind').equals('chunk').toArray()) {
    // 意味が複数ある熟語は id が idiom-〜--2 のようになる。1つ目の意味（-- のないもの）を優先する
    if (it.id.startsWith('idiom-')) { const k = idiomKey(it.english); if (!idioms.has(k) || !it.id.includes('--')) idioms.set(k, it) }
    else if (it.id.startsWith('phrase-')) phrases.set(it.english.toLowerCase(), it)
  }
  const carded = new Set((await database.cards.orderBy('itemId').keys()).map(String))
  return words.map((w): PlanRow => {
    const key = w.english.toLowerCase()
    const idiom = idioms.get(idiomKey(w.english))
    const word = byLemma.get(key) ?? byForm.get(key)
    const note = phrases.get(key)
    const item = idiom ?? word ?? note
    if (item) {
      const deck = word && !idiom ? 'word' : 'expr'
      const kind: PlanKind = carded.has(item.id) ? 'reviewing' : idiom ? 'idiom' : word ? 'listed' : 'phrase'
      return { english: w.english, japanese: w.japanese, kind, deck, item, itemId: item.id }
    }
    // 2語以上は表現（旅の手帳）、1語は新しい単語
    return /\s/.test(w.english.trim())
      ? { english: w.english, japanese: w.japanese, kind: 'phrase', deck: 'expr', itemId: '' }
      : { english: w.english, japanese: w.japanese, kind: 'custom', deck: 'word', itemId: customId(w.english) }
  })
}

/** 確認の画面で、新しく作る語を「単語」と「表現」の間で入れ替える */
export function switchDeck(r: PlanRow): PlanRow {
  if (r.kind === 'custom') return { ...r, kind: 'phrase', deck: 'expr', itemId: '' }
  if (r.kind === 'phrase' && !r.item) return { ...r, kind: 'custom', deck: 'word', itemId: customId(r.english) }
  return r
}

/** 新しく作る語（自分の訳が必ず要る）か */
export const needsMeaning = (r: PlanRow) => (r.kind === 'custom' || (r.kind === 'phrase' && !r.item))

/** 自分で作った語の items の形（例文はなし。答えでは自分の訳を出す） */
export function customItem(w: Pick<MyWord, 'itemId' | 'english' | 'japanese'>): Item {
  return { id: w.itemId, kind: 'word', english: w.english, japanese: w.japanese, forms: [w.english], examples: [] }
}

/**
 * 計画どおりに復習へ加える。すでに復習中のものはそのまま（訳を付けた単語集の語だけ書き直す）。
 * 単語集の語で「知っている語」、熟語で「もう知っている」にしていたものは、それを外して復習に入れる。
 * 返り値：単語・表現それぞれ新しく加えたカードの数
 */
export async function addWords(rows: PlanRow[], now = Date.now(), database: EigoDB = db): Promise<{ word: number; expr: number }> {
  const added = { word: 0, expr: 0 }
  for (const r of rows) {
    const meaning = r.japanese.trim()
    if (needsMeaning(r) && !meaning) continue
    let itemId = r.itemId
    if (r.kind === 'phrase' && !r.item) {
      // 旅の手帳に入れる（出どころは「自分のリスト」）
      const id = await database.phrases.add({ at: now, day: dayKey(new Date(now)), expression: r.english, meaning, example: '', scene: PHRASE_SCENE, source: 'other', used: 0 })
      const p = await database.phrases.get(id)
      await database.items.put(phraseItem(p!))
      itemId = phraseItemId(id as number)
    }
    const mine: MyWord = { itemId, english: r.item?.english ?? r.english, japanese: meaning, custom: r.kind === 'custom', addedAt: now }
    if (r.kind === 'custom') await database.items.put(customItem(mine))
    else if (r.deck === 'word' && meaning && meaning !== r.item?.japanese) await saveGloss(itemId, meaning, database)
    const existing = await database.myWords.get(itemId)
    await database.myWords.put(existing ? { ...existing, japanese: meaning || existing.japanese } : mine)
    if (r.kind !== 'reviewing') {
      await database.knownWords.delete(itemId)
      await database.hiddenItems.delete(itemId)
      await introduce(itemId, now, database)
      added[r.deck]++
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
  await database.transaction('rw', [database.myWords, database.cards, database.reviews, database.items, database.phrases], async () => {
    const cards = await database.cards.where('itemId').equals(itemId).toArray()
    for (const c of cards) await database.reviews.where('cardId').equals(c.id!).delete()
    await database.cards.where('itemId').equals(itemId).delete()
    await database.myWords.delete(itemId)
    if (itemId.startsWith('my:')) await database.items.delete(itemId)
    // このリストから旅の手帳に入れた表現は、旅の手帳からも外す（添削から入れた表現は残す）
    if (itemId.startsWith('phrase-')) {
      const id = Number(itemId.slice('phrase-'.length))
      if ((await database.phrases.get(id))?.scene === PHRASE_SCENE) {
        await database.phrases.delete(id)
        await database.items.delete(itemId)
      }
    }
  })
}
