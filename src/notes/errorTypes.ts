// 間違いの種類。Claude にはこの一覧から選んでもらい、弱点の研究で種類ごとに数える。

export const ERROR_TYPES = [
  '時制',
  '冠詞',
  '前置詞',
  '単数・複数',
  '主語と動詞の一致',
  '語順',
  '語の選び方',
  '語の形（品詞）',
  '抜けている語',
  '余分な語',
  '自然な言い回し',
  'つづり',
  '聞き取りの誤り',
] as const

/** 一覧のどれにも当てはまらないとき */
export const OTHER_TYPE = 'その他'

/** 音声認識の誤り。自分の英語の誤りではないので、弱点の集計と言い直しの練習には入れない */
export const ASR_TYPE = '聞き取りの誤り'

export const ALL_TYPES: string[] = [...ERROR_TYPES, OTHER_TYPE]

// 書き方の揺れ（「時制の誤り」「Tense」など）を一覧の名前にそろえる。上から順に当てはめる
const ALIASES: [RegExp, string][] = [
  [/聞き取り|音声認識|認識の(誤|間違)|transcri/i, '聞き取りの誤り'],
  [/時制|tense/i, '時制'],
  [/冠詞|article/i, '冠詞'],
  [/前置詞|preposition/i, '前置詞'],
  [/一致|agreement/i, '主語と動詞の一致'],
  [/単数|複数|plural|singular|可算|不可算/i, '単数・複数'],
  [/語順|word order/i, '語順'],
  [/品詞|語の形|語形|活用|word form/i, '語の形（品詞）'],
  [/語の選|語彙|単語の選|word choice|vocabulary/i, '語の選び方'],
  [/抜け|欠落|脱落|不足|missing/i, '抜けている語'],
  [/余分|不要|余計|extra|unnecessary/i, '余分な語'],
  [/言い回し|自然|表現|natural|idiom|collocation/i, '自然な言い回し'],
  [/つづり|綴り|スペル|spelling/i, 'つづり'],
]

export function normalizeType(raw: string): string {
  const t = raw.trim().replace(/[「」"'。.]/g, '')
  if (!t) return OTHER_TYPE
  const exact = ALL_TYPES.find((x) => x === t)
  if (exact) return exact
  for (const [re, name] of ALIASES) if (re.test(t)) return name
  return OTHER_TYPE
}
