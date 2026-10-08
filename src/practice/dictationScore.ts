/** ディクテーションの自動採点。語の単位で手本と答えを比べ、差分を色分けできる形で返す */

export type DiffKind = 'ok' | 'missing' | 'extra'
export interface DiffToken {
  text: string
  kind: DiffKind
}

const NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
}

/** 比較用に語を正規化する（大文字小文字・句読点などの記号・数字の書き方・アポストロフィの種類の違いは問わない） */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘ʼ`´′]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((w) => NUMBERS[w] ?? w)
}

/** 表示用の語に分ける（ハイフン・スラッシュ・ダッシュでも区切り、記号だけのものは除く） */
function splitShown(text: string): string[] {
  return text.split(/[\s\-‐–—/]+/).filter((w) => normalizeWords(w).length > 0)
}

/** 最長共通部分列で手本と答えの語を対応づける */
export function diffWords(reference: string, answer: string): { tokens: DiffToken[]; score: number; matched: number; total: number } {
  const refShown = splitShown(reference)
  const ref = refShown.map((w) => normalizeWords(w).join(' '))
  const hypShown = splitShown(answer)
  const hyp = hypShown.map((w) => normalizeWords(w).join(' '))
  const n = ref.length
  const m = hyp.length
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ref[i] && ref[i] === hyp[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const tokens: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && ref[i] && ref[i] === hyp[j]) {
      tokens.push({ text: refShown[i], kind: 'ok' })
      i++
      j++
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      tokens.push({ text: hypShown[j], kind: 'extra' })
      j++
    } else {
      tokens.push({ text: refShown[i], kind: 'missing' })
      i++
    }
  }
  const total = ref.filter(Boolean).length
  const matched = dp[0][0]
  return { tokens, score: total ? matched / total : 0, matched, total }
}
