// 熟語の確認（フェーズ8）その6：判定表を読んで書いた判定（judge-notes-*.txt）を、judgments.jsonl にまとめる。
// 1行の書き方：見出し|種類 ; S<意味の番号> <一致した文の数>/<判定した文の数> ; T（語の組み合わせどおり）か D（別の見出しと同じなのでまとめる）か V（下品・攻撃的なので載せない）か - ; 一致した文の id ; 根拠
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORK = join(homedir(), 'eigo-data', 'work')
const out = []
const seen = new Set()
for (const f of readdirSync(WORK).filter((x) => /^judge-notes-\d+\.txt$/.test(x)).sort()) {
  for (const line of readFileSync(join(WORK, f), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    // 区切りは「;」（id が空の行「- ; ; 根拠」も読めるように）。根拠の中の「;」はそのまま残す
    const parts = line.split(';')
    const [key, sense, t, ids] = parts.slice(0, 4).map((x) => (x ?? '').trim())
    const note = parts.slice(4).join(';').trim()
    const m = sense.match(/^S(\d+) (\d+)\/(\d+)$/)
    if (!m) throw new Error(`${f}：読めない行「${line}」`)
    if (seen.has(key)) continue
    seen.add(key)
    const [, s, k, n] = m.map(Number)
    out.push({ key, sense: s, k, n, share: n ? k / n : 0, transparent: t === 'T', duplicate: t === 'D', offensive: t === 'V', ids: ids ? ids.split(',').map(Number) : [], note, file: f })
  }
}
writeFileSync(join(WORK, 'judgments.jsonl'), out.map((j) => JSON.stringify(j)).join('\n') + '\n')
console.log('判定', out.length)
