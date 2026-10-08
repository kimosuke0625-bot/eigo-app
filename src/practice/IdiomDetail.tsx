import { useState } from 'react'
import { db } from '../db/schema'
import { dictionaryLinks, starText, type Idiom } from '../content/idioms'

const REPORT_KINDS = ['日本語の意味', '例文', '使う場面', 'その他']

/**
 * 熟語の詳しい情報：出典、頻度の目安、使う場面、意味を選んだ根拠、「これは怪しい」の報告、辞書へのリンク。
 * 報告は端末に記録するだけ（外へは送らない）。バックアップに含まれ、次の作業で Claude が確かめる。
 */
export function IdiomDetail({ idiom }: { idiom: Idiom }) {
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [what, setWhat] = useState(REPORT_KINDS[0])
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)

  const report = async () => {
    await db.reports.add({ itemId: idiom.id, english: idiom.en, japanese: idiom.ja, what, note: note.trim(), at: Date.now() })
    setSent(true)
    setReporting(false)
    setNote('')
  }

  return (
    <div className="idiom-detail">
      <p className="idiom-meta">
        <span className="idiom-stars" aria-label={`よく使う度 5段階の${idiom.stars}`}>{starText(idiom.stars)}</span>
        {idiom.scenes.map((s) => <span key={s} className="tag">{s}</span>)}
        {idiom.needsCheck && <span className="tag soon">要確認</span>}
      </p>
      <button className="btn secondary small" onClick={() => setOpen((o) => !o)}>{open ? '詳しい情報を閉じる' : '詳しい情報（出典・根拠）'}</button>
      {open && (
        <div className="stack idiom-more">
          <p className="muted">種類：{idiom.type}。映画字幕で100万語あたり約{idiom.perMillion < 10 ? idiom.perMillion.toFixed(1) : Math.round(idiom.perMillion)}回（この意味で使われる割合を掛けた目安）。</p>
          <p className="muted">意味の根拠：Tatoeba の実在の文を{idiom.read}文読み、{idiom.matched}文がこの意味でした。辞書の説明：<span lang="en">{idiom.gloss}</span></p>
          {idiom.needsCheck && <p className="muted">要確認の理由：{idiom.checkReasons.join('、')}</p>}
          {idiom.ex.map((e) => (
            <p key={e.enId ?? e.en} className="muted">
              例文の出典：Tatoeba{e.enId ? <> <a href={`https://tatoeba.org/ja/sentences/show/${e.enId}`} target="_blank" rel="noreferrer">#{e.enId}</a></> : null}
              {e.native ? '（英語を母語とする投稿者の文）' : '（投稿者の母語は確認できず）'}
            </p>
          ))}
          <p className="muted">見出しと意味：<a href={idiom.wiktionary} target="_blank" rel="noreferrer">Wiktionary</a>（CC BY-SA 4.0）</p>
          <div className="row wrap">
            <span className="muted">辞書で調べる：</span>
            {dictionaryLinks(idiom.en).map((d) => <a key={d.name} href={d.url} target="_blank" rel="noreferrer">{d.name}</a>)}
          </div>
          {sent && <p className="banner ok">報告を記録しました。次の作業で確かめます。</p>}
          {reporting ? (
            <div className="stack">
              <div className="row wrap">
                {REPORT_KINDS.map((k) => <button key={k} className={`chip ${what === k ? 'used' : ''}`} onClick={() => setWhat(k)}>{k}</button>)}
              </div>
              <textarea rows={2} value={note} placeholder="気になった点（書かなくても大丈夫です）" onChange={(e) => setNote(e.target.value)} />
              <div className="row">
                <button className="btn small" onClick={() => void report()}>記録する</button>
                <button className="btn secondary small" onClick={() => setReporting(false)}>やめる</button>
              </div>
            </div>
          ) : (
            <button className="btn secondary small" onClick={() => { setReporting(true); setSent(false) }}>これは怪しい</button>
          )}
        </div>
      )}
    </div>
  )
}
