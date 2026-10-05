// 教材の元データを公式サイトから scripts/raw/ に取得する
// NGSL 1.2（CC BY-SA 4.0）: https://www.newgeneralservicelist.com/new-general-service-list
// Tatoeba（CC BY 2.0 FR）: https://tatoeba.org/ja/downloads
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const RAW = new URL('./raw/', import.meta.url)
mkdirSync(RAW, { recursive: true })

const files = [
  ['NGSL_12_stats.csv', 'https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv'],
  ['NGSL_12_lemmatized_for_teaching.csv', 'https://www.newgeneralservicelist.com/s/NGSL_12_lemmatized_for_teaching.csv'],
  ['NGSL_12_with_English_definitions.xlsx', 'https://www.newgeneralservicelist.com/s/NGSL_12_with_English_definitions.xlsx'],
  ['eng_sentences_detailed.tsv.bz2', 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2'],
  ['jpn_sentences_detailed.tsv.bz2', 'https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2'],
  ['eng-jpn_links.tsv.bz2', 'https://downloads.tatoeba.org/exports/per_language/eng/eng-jpn_links.tsv.bz2'],
]

for (const [name, url] of files) {
  const path = new URL(name, RAW).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const unpacked = path.replace(/\.bz2$/, '')
  if (existsSync(unpacked)) continue
  console.log('取得中:', name)
  execSync(`curl -sSL -o "${path}" "${url}"`)
  if (path.endsWith('.bz2')) execSync(`bunzip2 -f "${path}"`)
}
console.log('完了')
