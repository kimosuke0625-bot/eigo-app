/** 文章を文に分ける（Mr. や Ms. などの略語では区切らない）。段落の区切りも文の区切りとして扱う */
export function splitSentences(text: string): string[] {
  const ABBR = /(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e|U\.S|U\.K|No)\.$/i
  const out: string[] = []
  for (const para of text.split(/\n\s*\n/)) {
    let buf = ''
    const parts = para.replace(/\s+/g, ' ').trim().split(/(?<=[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/)
    for (const p of parts) {
      buf = buf ? `${buf} ${p}` : p
      if (!ABBR.test(buf)) {
        out.push(buf)
        buf = ''
      }
    }
    if (buf) out.push(buf)
  }
  return out.filter(Boolean)
}

/** 英文の語数 */
export function countWords(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) ?? []).length
}
