// 聞き分けドリルの単語を、人が録音した無料公開の音声から集める（Wikimedia Commons）
// - Lingua Libre の録音：Lingua Libre のデータベースで英語の「母語話者（native）」と登録された話者だけ
// - Commons の英語発音ファイル（En-us-〇〇.ogg、En-uk-〇〇.ogg など。Wiktionary の発音に使われているもの）
// ライセンスはファイルごとに Commons の公式メタデータで確認し、CC0・パブリックドメイン・CC BY・CC BY-SA だけを使う。
// 出力：public/audio/words/*.mp3 と scripts/raw/word-audio-human.json（build-word-audio.mjs が使う）
// 実行: node scripts/fetch-word-audio.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const here = (p) => new URL(p, import.meta.url)
const UA = { 'User-Agent': 'eigo-app (personal English study app; https://github.com/kimosuke0625-bot/eigo-app)' }
const groups = JSON.parse(readFileSync(here('../src/practice/pairs.json'), 'utf8'))
const words = [...new Set(groups.flatMap((g) => g.pairs.flat()))].sort()
const MAX_PER_WORD = 3
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, init) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } })
    if (r.status === 429) { await sleep(5000 * (i + 1)); continue }
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    return r.json()
  }
  throw new Error(`429 が続きました: ${url}`)
}

// 1. Lingua Libre：英語（Q22）の録音で、話者が英語の母語話者（Q15）のもの
const values = words.map((w) => JSON.stringify(w)).join(' ')
const sparql = `SELECT ?file ?transcription ?speakerLabel WHERE {
  VALUES ?transcription { ${values} }
  ?record prop:P2 entity:Q2 ; prop:P4 entity:Q22 ; prop:P3 ?file ; prop:P7 ?transcription ; prop:P5 ?speaker .
  ?speaker rdfs:label ?speakerLabel ; llp:P4 ?lang .
  ?lang llv:P4 entity:Q22 ; llq:P16 entity:Q15 .
  FILTER(LANG(?speakerLabel) = "en")
}`
const ll = await getJson('https://lingualibre.org/bigdata/namespace/wdq/sparql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
  body: new URLSearchParams({ query: sparql }),
})
const candidates = new Map(words.map((w) => [w, []]))
for (const b of ll.results.bindings) {
  const title = 'File:' + decodeURIComponent(b.file.value.split('Special:FilePath/')[1]).replace(/_/g, ' ')
  const list = candidates.get(b.transcription.value)
  if (list && !list.some((c) => c.title === title)) list.push({ title, speaker: b.speakerLabel.value, origin: 'Lingua Libre（母語話者）' })
}

// 2. Commons の英語発音ファイル
for (const w of words) {
  for (const [prefix, accent] of [['En-us', 'アメリカ英語'], ['En-uk', 'イギリス英語'], ['En-au', 'オーストラリア英語']]) {
    candidates.get(w).push({ title: `File:${prefix}-${w}.ogg`, origin: `Commons 英語発音（${accent}）` })
  }
}

// 3. ファイルごとのライセンス・作者・mp3 版の URL を確認する（50件ずつ）
const all = [...candidates.values()].flat()
const info = new Map()
for (let i = 0; i < all.length; i += 50) {
  const chunk = all.slice(i, i + 50)
  const q = new URLSearchParams({
    action: 'query', format: 'json', prop: 'imageinfo|videoinfo', iiprop: 'url|extmetadata', viprop: 'derivatives',
    titles: chunk.map((c) => c.title).join('|'),
  })
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`)
  const norm = new Map((j.query.normalized ?? []).map((n) => [n.to, n.from]))
  for (const p of Object.values(j.query.pages)) {
    if (p.missing !== undefined || !p.imageinfo) continue
    const meta = p.imageinfo[0].extmetadata ?? {}
    const mp3 = (p.videoinfo?.[0]?.derivatives ?? []).find((d) => d.type === 'audio/mpeg')?.src
    info.set(norm.get(p.title) ?? p.title, {
      license: meta.LicenseShortName?.value ?? '',
      licenseUrl: meta.LicenseUrl?.value ?? '',
      artist: (meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(),
      page: p.imageinfo[0].descriptionurl,
      mp3,
    })
  }
  await sleep(1000)
}

const OK_LICENSE = /^(CC0|Public domain|CC BY(-SA)? [\d.]+)/i
const out = {}
mkdirSync(here('../public/audio/words/'), { recursive: true })
for (const w of words) {
  const usable = candidates.get(w)
    .map((c) => ({ ...c, ...info.get(c.title) }))
    .filter((c) => c.page && c.mp3 && OK_LICENSE.test(c.license))
  // 話者が重ならないように選ぶ。Lingua Libre の母語話者を優先し、Commons の発音ファイルで補う
  const picked = []
  for (const c of usable) {
    const who = c.speaker ?? c.artist
    if (picked.some((p) => (p.speaker ?? p.artist) === who)) continue
    picked.push(c)
    if (picked.length === MAX_PER_WORD) break
  }
  out[w] = []
  for (const [n, c] of picked.entries()) {
    const file = `words/${w}-h${n + 1}.mp3`
    const dest = here(`../public/audio/${file}`)
    if (!existsSync(dest)) {
      // Wikimedia のサーバーに負担をかけないよう、ゆっくり取得し、混雑（429）のときは待ってからやり直す
      let ok = false
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        const r = await fetch(c.mp3, { headers: UA })
        if (r.status === 429) { await sleep(15000 * (attempt + 1)); continue }
        if (!r.ok) { console.log('取得失敗', w, c.title, r.status); break }
        writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
        ok = true
      }
      if (!ok) continue
      await sleep(2500)
    }
    out[w].push({ file, kind: 'human', speaker: c.speaker ?? c.artist, origin: c.origin, license: c.license, licenseUrl: c.licenseUrl, source: c.page })
  }
}
writeFileSync(here('./raw/word-audio-human.json'), JSON.stringify(out, null, 1))
const counts = Object.values(out).map((v) => v.length)
console.log(`単語 ${words.length}：人の録音 合計 ${counts.reduce((a, b) => a + b, 0)}件、0件の語 ${counts.filter((c) => !c).length}、1件の語 ${counts.filter((c) => c === 1).length}`)
console.log('人の録音がない語:', words.filter((w) => !out[w].length).join(' '))
