// 言い換え問題の答えに、短縮形と元の形の両方を加える（2026-10-14 利用者の指摘「表記は合っているのに間違いとされる」への対応）。
// 手で打つ問題で I'm / I am、don't / do not のどちらで書いても正解にするため。
// 意味が1つに決まるものだけを使う。's（is と has）、'd（would と had）、've（have の本動詞）のように
// どちらの意味か決められない短縮形は、間違った答えを正解にしないよう、元の形に戻さない（is → 's、would → 'd の向きだけ）。
// 作った答えは build.mjs が LanguageTool に通し、指摘のあったものは加えない。

/** [元の形, 短縮形]。どちら向きにも書き換えてよいもの */
const BOTH = [
  ['I am', "I'm"], ['you are', "you're"], ['we are', "we're"], ['they are', "they're"],
  ['I will', "I'll"], ['you will', "you'll"], ['he will', "he'll"], ['she will', "she'll"], ['it will', "it'll"], ['we will', "we'll"], ['they will', "they'll"],
  ['do not', "don't"], ['does not', "doesn't"], ['did not', "didn't"],
  ['is not', "isn't"], ['are not', "aren't"], ['was not', "wasn't"], ['were not', "weren't"],
  ['have not', "haven't"], ['has not', "hasn't"], ['had not', "hadn't"],
  ['will not', "won't"], ['would not', "wouldn't"], ['could not', "couldn't"], ['should not', "shouldn't"],
  ['cannot', "can't"], ['must not', "mustn't"],
]
/** 元の形 → 短縮形の向きだけ（短縮形からは意味が決められないもの） */
const ONE_WAY = [
  ['he is', "he's"], ['she is', "she's"], ['it is', "it's"], ['that is', "that's"], ['there is', "there's"], ['what is', "what's"], ['where is', "where's"], ['who is', "who's"], ['here is', "here's"],
  ['I would', "I'd"], ['you would', "you'd"], ['he would', "he'd"], ['she would', "she'd"], ['we would', "we'd"], ['they would', "they'd"],
]

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\']/g, (c) => (c === "'" ? "['’]" : `\\${c}`))
/** 語の切れ目で、大文字小文字を問わずに置き換える（文頭の大文字は保つ） */
function swap(text, from, to) {
  // 疑問の形（isn't he?・Don't you 〜?）の n't は元の形に戻さない（is not he? は誤り）
  const notBeforeSubject = /n't$/.test(from) ? "(?!\\s+(?:I|you|he|she|it|we|they|there)\\b)" : ''
  return text.replace(new RegExp(`\\b${esc(from)}(?![\\w'’])${notBeforeSubject}`, 'gi'), (m) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to))
}

/** 1つの答えから、短縮形・元の形を入れ替えた答えを作る（1か所ずつと、全部まとめての両方） */
export function contractionVariants(answer) {
  const out = new Set()
  const rules = [...BOTH.map(([a, b]) => [a, b]), ...BOTH.map(([a, b]) => [b, a]), ...ONE_WAY]
  let allShort = answer
  let allLong = answer
  for (const [from, to] of rules) {
    const v = swap(answer, from, to)
    if (v !== answer) out.add(v)
  }
  for (const [a, b] of [...BOTH, ...ONE_WAY]) allShort = swap(allShort, a, b)
  for (const [a, b] of BOTH) allLong = swap(allLong, b, a)
  out.add(allShort)
  out.add(allLong)
  out.delete(answer)
  return [...out]
}
