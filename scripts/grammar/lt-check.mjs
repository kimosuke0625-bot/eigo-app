// 文法（フェーズ9）：✕ にする候補の文を LanguageTool に通して、誤りと判定されるかを一覧にする（PC の作業用）。
//   node scripts/grammar/lt-check.mjs "文1" "文2" ...
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const list = process.argv.slice(2)
const tools = join(homedir(), 'eigo-data', 'tools')
const java = join(tools, readdirSync(tools).find((d) => d.startsWith('jdk')), 'bin', 'java.exe')
const lt = join(tools, readdirSync(tools).find((d) => d.startsWith('LanguageTool-')), 'languagetool-commandline.jar')
const file = join(mkdtempSync(join(tmpdir(), 'ltc-')), 'in.txt')
writeFileSync(file, list.join('\n\n'))
const json = execFileSync(java, ['-Dfile.encoding=UTF-8', '-jar', lt, '-l', 'en-US', '--json', '--disable', 'ENGLISH_WORD_REPEAT_BEGINNING_RULE', file], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })
const res = JSON.parse(json.slice(json.indexOf('{')))
const starts = []
let pos = 0
for (const s of list) { starts.push(pos); pos += s.length + 2 }
const out = list.map(() => [])
for (const m of res.matches) {
  let i = starts.length - 1
  while (i > 0 && starts[i] > m.offset) i--
  out[i].push(m.rule.id)
}
list.forEach((s, i) => console.log(`${out[i].length ? '検出' : '----'}\t${s}\t${out[i].join(',')}`))
