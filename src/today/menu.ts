import type { BlockId, Pillar } from '../db/schema'

export type PracticeKind =
  | 'review'
  | 'exprReview'
  | 'pronunciation'
  | 'input'
  | 'shadowing'
  | 'fluency'
  | 'output'
  | 'addCards'
  | 'dictation'
  | 'speech'
  | 'conversation'
  | 'assessment'
  | 'roleplay'
  | 'retell'
  | 'importFeedback'
  | 'boss'
  | 'grammar'

export interface MenuItem {
  kind: PracticeKind
  block: BlockId
  label: string
  detail: string
  pillar: Pillar
  /** 60分メニューでの分数 */
  baseMinutes: number
  /** この練習が使えるようになる開発フェーズ */
  availableFrom: number
}

export interface PlannedItem extends MenuItem {
  minutes: number
}

export const BLOCK_LABELS: Record<BlockId, string> = {
  morning: '朝',
  noon: '昼',
  night: '夜',
}

export const PILLAR_LABELS: Record<Pillar, string> = {
  input: 'インプット',
  output: 'アウトプット',
  language: '言語の学習',
  fluency: '流暢さ',
}

// 仕様書 4章「1日60分のメニュー」
export const BASE_MENU: MenuItem[] = [
  // 表現の復習（2026-10-08 利用者の依頼）はアウトプットとして数えるので、4つの柱の比率を保つため音声日記・作文の10分から回す
  // 熟語が加わった時点で 作文6・表現4（利用者の決めた配分）
  // 文法の修行（フェーズ9）は「言語の学習」の20分から回す：単語の復習7・文法の修行5・発音5・新しいカード3（了承済みの計画）
  { kind: 'review', block: 'morning', label: '単語の復習', detail: '見出し語のカード。単語・例文・聞き取りの形で声に出して答える', pillar: 'language', baseMinutes: 7, availableFrom: 2 },
  { kind: 'grammar', block: 'morning', label: '文法の修行', detail: '中学レベルの文法。解説 → 練習 → 口頭で即答 → 自分のことを1文。解いた問題は復習に出る', pillar: 'language', baseMinutes: 5, availableFrom: 2 },
  { kind: 'exprReview', block: 'morning', label: '表現の復習', detail: '熟語と旅の手帳の表現。日本語の意味と場面を見て英語で言い、読み上げをまねる', pillar: 'output', baseMinutes: 4, availableFrom: 2 },
  { kind: 'pronunciation', block: 'morning', label: '発音・聞き分けドリル', detail: '似た音のペアを聞き分ける', pillar: 'language', baseMinutes: 5, availableFrom: 5 },
  { kind: 'input', block: 'noon', label: '多聴・多読', detail: '内容確認の質問2問つき', pillar: 'input', baseMinutes: 15, availableFrom: 4 },
  { kind: 'shadowing', block: 'night', label: 'シャドーイング', detail: '昼に聞いた素材を使う', pillar: 'fluency', baseMinutes: 10, availableFrom: 5 },
  { kind: 'fluency', block: 'night', label: '4/3/2スピーチ・速読', detail: '知っている英語を速く使う', pillar: 'fluency', baseMinutes: 5, availableFrom: 4 },
  { kind: 'output', block: 'night', label: '音声日記・短い作文', detail: '今日覚えた語を3つ以上使う', pillar: 'output', baseMinutes: 6, availableFrom: 6 },
  { kind: 'addCards', block: 'night', label: '新しいカードの追加と振り返り', detail: '夜に追加したカードは翌朝に確認', pillar: 'language', baseMinutes: 3, availableFrom: 2 },
]

export const BASE_TOTAL = BASE_MENU.reduce((s, m) => s + m.baseMinutes, 0)

/**
 * 目標時間を60分より増やしても、時間を増やさない練習（利用者の依頼 2026-10-09）。
 * 新しい単語の追加と単語の復習は、覚える枚数を自動で増やさないので時間も60分のときのまま。
 * 増えた時間は同じ柱の練習（文法の修行・発音）や、ほかの柱の練習に回る。
 */
export const HOLD_ABOVE_BASE: PracticeKind[] = ['review', 'addCards']

/** 実数の配分を整数にする（端数の大きい順に配り、合計を total ぴったりにする。各要素は最低 min） */
function roundShares(raw: number[], total: number, min = 1): number[] {
  const out = raw.map((r) => Math.max(min, Math.floor(r)))
  let rest = total - out.reduce((s, n) => s + n, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k].i]++
  for (let k = order.length - 1, guard = 0; rest < 0 && guard < 1000; k = (k - 1 + order.length) % order.length, guard++) {
    if (out[order[k].i] > min) { out[order[k].i]--; rest++ }
  }
  return out
}

/**
 * 目標時間に合わせて各練習の分数を配り、ブロックの順番に並べる。
 * - まず4つの柱に 20・15・15・10 の比率で配る（比率は目標時間を変えても保つ）
 * - 柱の中では60分のときの分数の比率で配る。ただし60分より多いときは、HOLD_ABOVE_BASE の練習は60分のときの分数のままにし、
 *   残りを同じ柱のほかの練習に配る
 * - 端数は大きい順に配って合計を目標時間ぴったりにする。各練習は最低1分
 */
export function planMenu(targetMinutes: number, blockOrder: BlockId[]): PlannedItem[] {
  const target = Math.max(BASE_MENU.length, Math.round(targetMinutes))
  const pillars = [...new Set(BASE_MENU.map((m) => m.pillar))]
  const items = (p: Pillar) => BASE_MENU.map((m, i) => ({ m, i })).filter(({ m }) => m.pillar === p)
  const baseOf = (p: Pillar) => items(p).reduce((s, { m }) => s + m.baseMinutes, 0)
  const pillarMinutes = roundShares(pillars.map((p) => (baseOf(p) * target) / BASE_TOTAL), target, 1)
  const minutes = new Array<number>(BASE_MENU.length).fill(1)
  pillars.forEach((p, k) => {
    const list = items(p)
    const total = Math.max(list.length, pillarMinutes[k])
    const held = target > BASE_TOTAL ? list.filter(({ m }) => HOLD_ABOVE_BASE.includes(m.kind)) : []
    const heldSum = held.reduce((s, { m }) => s + m.baseMinutes, 0)
    const flex = list.filter((x) => !held.includes(x))
    const flexBase = flex.reduce((s, { m }) => s + m.baseMinutes, 0)
    const raw = list.map(({ m }) => held.some((h) => h.m === m)
      ? m.baseMinutes
      : flex.length && heldSum < total ? (m.baseMinutes * (total - heldSum)) / flexBase : (m.baseMinutes * total) / baseOf(p))
    roundShares(raw, total, 1).forEach((n, j) => { minutes[list[j].i] = n })
  })

  const blockIndex = (b: BlockId) => {
    const i = blockOrder.indexOf(b)
    return i === -1 ? 99 : i
  }
  return BASE_MENU.map((m, i) => ({ ...m, minutes: minutes[i] }))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => blockIndex(a.m.block) - blockIndex(b.m.block) || a.i - b.i)
    .map(({ m }) => m)
}

/** 端末の現地時間での日付キー（YYYY-MM-DD） */
export function dayKey(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** 時刻からいまのブロックを決める（初期値：朝 〜11時、昼 〜17時、夜 それ以降） */
export function currentBlock(date = new Date(), morningEnd = 11, noonEnd = 17): BlockId {
  const h = date.getHours()
  if (h < morningEnd) return 'morning'
  if (h < noonEnd) return 'noon'
  return 'night'
}
