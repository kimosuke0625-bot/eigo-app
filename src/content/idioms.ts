import { db, type EigoDB, type Example, type Item } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'

/**
 * 熟語・表現（フェーズ8）。public/data/idioms.json（scripts/idioms/07-build.mjs が作る。CC BY-SA 4.0）。
 * 見出しと意味は Wiktionary、例文は Tatoeba、頻度は映画字幕（OpenSubtitles）で数えた回数。
 * 語の id は idiom-<見出し>。表現の束に入る（srs/deck.ts）。
 */
export interface IdiomExample extends Example {
  /** 英語を母語とする投稿者の文 */
  native: boolean
}

export interface Idiom {
  id: string
  /** 頻度の順位（1 から） */
  rank: number
  en: string
  ja: string
  /** 句動詞・熟語・決まり文句 */
  type: string
  /** 選んだ意味（Wiktionary の説明。英語） */
  gloss: string
  /** Wiktionary の見出しのページ */
  wiktionary: string
  /** 選んだ意味の根拠：読んだ実在の文の数と、その意味で使われていた文の数 */
  read: number
  matched: number
  /** 映画字幕で100万語あたりの回数（その意味で使われる割合を掛けたもの） */
  perMillion: number
  /** 頻度の目安（1〜5） */
  stars: number
  /** 使う場面の札（「会話向き」「書き言葉向き」「くだけた言い方」など）。目安のものは「（目安）」付き */
  scenes: string[]
  ex: IdiomExample[]
  /** 確認が弱い（初期設定では出題しない） */
  needsCheck: boolean
  /** 要確認の理由 */
  checkReasons: string[]
}

export interface IdiomData {
  version: number
  license: string
  items: Idiom[]
}

export const isIdiom = (itemId: string) => itemId.startsWith('idiom-')

export function idiomItem(d: Idiom): Item {
  return { id: d.id, kind: 'chunk', english: d.en, japanese: d.ja, forms: [d.en], examples: d.ex.map(({ en, ja, enId, jaId }) => ({ en, ja, enId, jaId })) }
}

/** 熟語を items テーブルに取り込む。版が変わったときだけ入れ直す */
export async function syncIdioms(data: IdiomData, database: EigoDB = db) {
  const s = await getSettings(database)
  if (s.idiomVersion === data.version && (await database.items.get(data.items[0]?.id ?? ''))) return
  await database.items.bulkPut(data.items.map(idiomItem))
  await updateSettings({ idiomVersion: data.version }, database)
}

let cache: Promise<IdiomData> | null = null
let byId: Map<string, Idiom> | null = null

export function loadIdioms(): Promise<IdiomData> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/idioms.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`熟語のデータを読み込めませんでした（${r.status}）`)
      return r.json() as Promise<IdiomData>
    })
    .then(async (data) => {
      byId = new Map(data.items.map((d) => [d.id, d]))
      await syncIdioms(data)
      return data
    })
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}

/** 読み込み済みの熟語の詳しい情報（読み込む前は undefined） */
export const idiomInfo = (itemId: string): Idiom | undefined => byId?.get(itemId)

/** 頻度の目安の星（★★★☆☆） */
export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

/** 辞書サイトで調べるリンク（見出しを検索するだけで、学習データは送らない） */
export function dictionaryLinks(en: string): { name: string; url: string }[] {
  const q = encodeURIComponent(en)
  const dash = encodeURIComponent(en.toLowerCase().replace(/\s+/g, '-'))
  return [
    { name: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${encodeURIComponent(en.replace(/\s+/g, '_'))}` },
    { name: 'Cambridge', url: `https://dictionary.cambridge.org/dictionary/english/${dash}` },
    { name: 'Merriam-Webster', url: `https://www.merriam-webster.com/dictionary/${q}` },
    { name: 'Weblio', url: `https://ejje.weblio.jp/content/${q}` },
  ]
}
