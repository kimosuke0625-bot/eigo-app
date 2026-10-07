import type { FeedbackSource } from '../db/schema'
import { normalizeType } from './errorTypes'

/**
 * Claude の返事から「アプリ取り込み用のまとめ」を読み取る。
 * 決まった形式（1行に1項目、「項目名：内容」）を前提にするが、形式が崩れていても読める所は読む。
 * - まとめの印が見つからなければ、返事全体から探す
 * - 見出し（■直し 1 など）がなくても、項目名から直しか表現かを判断する
 * - 「元の表現 → 直した表現 → 理由」の行や、表（| で区切る）も直しとして読む
 * - 読めなかった行は leftovers に残し、画面で手入力の参考にする
 */

export const SUMMARY_START = '【アプリ取り込み用のまとめ】'
export const SUMMARY_END = '【まとめ ここまで】'

export interface ParsedFix { original: string; corrected: string; type: string; note: string }
export interface ParsedPhrase { expression: string; meaning: string; example: string; scene: string }

export interface ParseResult {
  /** まとめの印が見つかったか */
  found: boolean
  source?: FeedbackSource
  fixes: ParsedFix[]
  phrases: ParsedPhrase[]
  /** まとめの中で読み取れなかった行 */
  leftovers: string[]
}

type FixField = keyof ParsedFix
type PhraseField = keyof ParsedPhrase
type Field = { kind: 'fix'; key: FixField } | { kind: 'phrase'; key: PhraseField }

// 項目名（空白を除いた形）→ 入れる所
const LABELS: Record<string, Field> = {
  元の文: { kind: 'fix', key: 'original' },
  元の英文: { kind: 'fix', key: 'original' },
  元の表現: { kind: 'fix', key: 'original' },
  原文: { kind: 'fix', key: 'original' },
  元: { kind: 'fix', key: 'original' },
  直した文: { kind: 'fix', key: 'corrected' },
  直した英文: { kind: 'fix', key: 'corrected' },
  直した表現: { kind: 'fix', key: 'corrected' },
  修正後: { kind: 'fix', key: 'corrected' },
  修正文: { kind: 'fix', key: 'corrected' },
  正しい文: { kind: 'fix', key: 'corrected' },
  直し: { kind: 'fix', key: 'corrected' },
  間違いの種類: { kind: 'fix', key: 'type' },
  誤りの種類: { kind: 'fix', key: 'type' },
  解説: { kind: 'fix', key: 'note' },
  理由: { kind: 'fix', key: 'note' },
  説明: { kind: 'fix', key: 'note' },
  表現: { kind: 'phrase', key: 'expression' },
  新しい表現: { kind: 'phrase', key: 'expression' },
  意味: { kind: 'phrase', key: 'meaning' },
  例文: { kind: 'phrase', key: 'example' },
  使う場面: { kind: 'phrase', key: 'scene' },
  場面: { kind: 'phrase', key: 'scene' },
}

const SOURCES: [RegExp, FeedbackSource][] = [
  [/音声日記|日記/, 'diary'],
  [/作文|英作文/, 'write'],
  [/スピーチ/, 'speech'],
  [/会話|ロールプレイ|役割/, 'conversation'],
]

/** 行の飾り（箇条書きの記号、太字、引用、番号）を外す */
function clean(line: string): string {
  return line
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:>\s*)+/, '')
    .replace(/^\s*(?:[-*・•]|\d+[.)．])\s+/, '')
    .trim()
}

/** 値の前後のかっこ・引用符を外す */
function unquote(v: string): string {
  const t = v.trim()
  // 依頼文の形式の例（「（私の文）」など）のままの所は空にする
  if (/^（[^（）]*）$/.test(t)) return ''
  const m = t.match(/^[「『"“](.*)[」』"”]$/)
  return (m ? m[1] : t).trim()
}

type Block = { kind: 'fix'; data: ParsedFix; last?: FixField } | { kind: 'phrase'; data: ParsedPhrase; last?: PhraseField }

const emptyFix = (): ParsedFix => ({ original: '', corrected: '', type: '', note: '' })
const emptyPhrase = (): ParsedPhrase => ({ expression: '', meaning: '', example: '', scene: '' })
const ARROW = /\s*(?:→|->|⇒|=>)\s*/

export function parseFeedback(text: string): ParseResult {
  const all = text.replace(/\r\n?/g, '\n')
  // 返事の中でまとめに触れていることもあるので、最後に出てくる印から読む
  const bracketed = all.lastIndexOf(SUMMARY_START)
  const start = bracketed >= 0 ? bracketed : all.lastIndexOf('アプリ取り込み用のまとめ')
  const found = start >= 0
  let region = found ? all.slice(all.indexOf('\n', start) === -1 ? all.length : all.indexOf('\n', start)) : all
  const end = region.search(/【?\s*まとめ\s*ここまで\s*】?/)
  if (end >= 0) region = region.slice(0, end)

  const blocks: Block[] = []
  const leftovers: string[] = []
  let source: FeedbackSource | undefined
  let cur: Block | null = null
  const open = (kind: 'fix' | 'phrase'): Block => {
    const b: Block = kind === 'fix' ? { kind, data: emptyFix() } : { kind, data: emptyPhrase() }
    blocks.push(b)
    cur = b
    return b
  }
  // 1行で完結した直し（矢印や表の行）。後ろの行を続きとみなさない
  const addFix = (data: ParsedFix) => {
    blocks.push({ kind: 'fix', data })
    cur = null
  }

  for (const rawLine of region.split('\n')) {
    if (/^\s*```/.test(rawLine)) continue
    const line = clean(rawLine)
    // 空行のあとは前の項目の続きとみなさない
    if (!line) { if (cur) (cur as Block).last = undefined; continue }
    if (/^[-=_|:\s]+$/.test(line)) continue

    // 見出し（■直し 1、### 新しい表現 2 など。「：」を含まない行）
    const head = line.replace(/^[■◆□◇●○#\s]+/, '')
    if (!/[:：]/.test(line) && (/^[■◆□◇●○#]/.test(line) || /^(直し|添削|修正|新しい表現|表現)\s*[0-9０-９]*\s*$/.test(head))) {
      if (/表現/.test(head)) open('phrase')
      else if (/直し|添削|修正/.test(head)) open('fix')
      else cur = null
      continue
    }

    // 「項目名：内容」
    const kv = line.match(/^([^:：]{1,12})[:：]\s*(.*)$/)
    if (kv) {
      const label = kv[1].replace(/[\s　]/g, '')
      const value = unquote(kv[2])
      // まとめの先頭の「種類：音声日記」は練習の種類。直しの中の「種類：時制」は間違いの種類
      const c0 = cur as Block | null
      if (label === '種類' && c0?.kind !== 'fix') {
        const s = SOURCES.find(([re]) => re.test(value))
        if (s) { source = s[1]; continue }
      }
      const field = label === '種類' ? ({ kind: 'fix', key: 'type' } as Field) : LABELS[label]
      if (field) {
        let b = cur as Block | null
        // 違う種類の項目、または同じ項目がもう埋まっていたら、新しいまとまりを始める
        if (!b || b.kind !== field.kind || (b.data as unknown as Record<string, string>)[field.key]) b = open(field.kind)
        ;(b.data as unknown as Record<string, string>)[field.key] = value
        b.last = field.key as never
        continue
      }
    }

    // 「元の表現 → 直した表現 → 理由」
    const parts = line.split(ARROW)
    if (parts.length >= 2 && parts[0] && parts[1]) {
      addFix({ original: unquote(parts[0]), corrected: unquote(parts[1]), type: '', note: unquote(parts.slice(2).join(' ')) })
      continue
    }

    // 表の行（| 元 | 直し | 種類 | 解説 |）
    if (line.includes('|')) {
      const cells = line.split('|').map((c) => unquote(c)).filter((c, i, arr) => !(c === '' && (i === 0 || i === arr.length - 1)))
      const isHeader = cells.some((c) => /^(元の|直した|間違い|解説|表現|意味)/.test(c))
      if (!isHeader && cells.length >= 2) {
        addFix(cells.length >= 4
          ? { original: cells[0], corrected: cells[1], type: cells[2], note: cells[3] }
          : { original: cells[0], corrected: cells[1], type: '', note: cells[2] ?? '' })
      }
      continue
    }

    // 前の項目の続き（解説が2行にわたったときなど）
    const c = cur as Block | null
    if (c && c.last) {
      const d = c.data as unknown as Record<string, string>
      d[c.last] = d[c.last] ? `${d[c.last]} ${line}` : line
      continue
    }
    if (found) leftovers.push(line)
  }

  const fixes = blocks.flatMap((b) => (b.kind === 'fix' && (b.data.original || b.data.corrected)
    ? [{ ...b.data, type: normalizeType(b.data.type) }] : []))
  const phrases = blocks.flatMap((b) => (b.kind === 'phrase' && b.data.expression ? [b.data] : []))
  return { found, source, fixes, phrases, leftovers }
}
