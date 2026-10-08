import type { Card } from '../db/schema'

/**
 * 復習カードの束（デッキ）。
 * - word（単語）：見出し語のカード（NGSL、ビジネス語彙）。学習時間は「言語の学習」
 * - expr（表現）：2語以上のまとまりや文のカード（旅の手帳の表現、今後の熟語など）。学習時間は「アウトプット」
 * - gram（文法）：文法の修行の問題（語の id が gram-）。学習時間は「言語の学習」（フェーズ9）
 * どの束かは語の id で決まる（カードに印を付けないので、取り込み済みの表現のカードも記録を保ったまま表現の側に入る）。
 */
export type Deck = 'word' | 'expr' | 'gram'

/** 表現の束に入る語の id の頭。熟語を追加するときは 'idiom-' を使う */
export const EXPR_PREFIXES = ['phrase-', 'idiom-']

/** 文法の束に入る語の id の頭 */
export const GRAM_PREFIX = 'gram-'

export function deckOf(itemId: string): Deck {
  if (itemId.startsWith(GRAM_PREFIX)) return 'gram'
  return EXPR_PREFIXES.some((p) => itemId.startsWith(p)) ? 'expr' : 'word'
}

export function inDeck(card: Pick<Card, 'itemId'>, deck: Deck): boolean {
  return deckOf(card.itemId) === deck
}

export const DECK_LABELS: Record<Deck, string> = { word: '単語', expr: '表現', gram: '文法' }
