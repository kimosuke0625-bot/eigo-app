import { useEffect, useState } from 'react'
import { loadWordAudio, type WordClip } from '../speech/clips'

/**
 * 聞き分けドリルの単語の音声の出典。人の録音（Wikimedia Commons）は、ファイルごとに
 * 話者（作者）・ライセンス・元のページを示す（CC BY・CC BY-SA の表示義務のため）。
 */
export function AudioCredits() {
  const [words, setWords] = useState<Record<string, WordClip[]>>({})
  useEffect(() => { void loadWordAudio().then(setWords) }, [])
  const human = Object.entries(words).flatMap(([w, list]) => list.filter((c) => c.kind === 'human').map((c) => ({ w, c })))
  const tts = Object.values(words).flat().filter((c) => c.kind === 'tts').length
  return (
    <div className="stack">
      <p>
        <strong>聞き分けドリルの単語の音声</strong>：人の録音 {human.length}件（Wikimedia Commons。Lingua Libre の英語の母語話者と、
        Wiktionary で使われている英語発音ファイル）と、PC で作った合成音声 {tts}件（Kokoro-82M、Apache-2.0）。
      </p>
      <details>
        <summary>人の録音の一覧（話者・ライセンス・元のページ）</summary>
        <ul className="credits">
          {human.map(({ w, c }) => (
            <li key={c.file}>
              <strong>{w}</strong>：{c.speaker}（{c.origin}）<span className="tag">{c.license}</span>
              <br />
              <a href={c.source} target="_blank" rel="noreferrer">{decodeURIComponent(c.source.replace('https://commons.wikimedia.org/wiki/', ''))}</a>
              {c.licenseUrl && <> ・<a href={c.licenseUrl} target="_blank" rel="noreferrer">ライセンス</a></>}
            </li>
          ))}
        </ul>
        <p className="muted">mp3 は Wikimedia Commons が配布している変換版を使用しています（音の内容は変えていません）。</p>
      </details>
      <p>
        <strong>多聴・多読・シャドーイング・ディクテーションの内蔵素材の音声</strong>：PC で作った合成音声（Kokoro-82M、Apache-2.0）。
        素材ごとに6種類の声（アメリカ英語・イギリス英語、男性・女性）を使い分けています。
      </p>
    </div>
  )
}
