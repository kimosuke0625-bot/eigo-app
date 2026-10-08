import { useState } from 'react'
import { db } from '../db/schema'
import { dictionaryLinks, starText, type Idiom } from '../content/idioms'

const REPORT_KINDS = ['日本語の意味・訳', '例文', '使う場面の札', 'その他']

/** 札の色分け（会話向き・書き言葉向き・どちらでも は字幕と Wikipedia の回数から出した目安） */
const labelClass = (s: string) =>
  s === '会話向き' ? 'talk' : s === '書き言葉向き' ? 'write' : s === 'どちらでも' ? 'both' : s === 'ビジネス向き' ? 'biz' : 'style'

/** 答えを見た後、英語のすぐ下に出す：よく使う度（星）と使う場面の札。どの熟語にも札は必ず1つ以上ある */
export function IdiomLabels({ idiom }: { idiom: Idiom }) {
  const scenes = idiom.scenes.length ? idiom.scenes : ['どちらでも']
  return (
    <div className="idiom-labels">
      <span className="idiom-stars" aria-label={`よく使う度 5段階の${idiom.stars}`}>{starText(idiom.stars)}</span>
      {scenes.map((s) => <span key={s} className={`scene-chip ${labelClass(s)}`}>{s}</span>)}
      {idiom.needsCheck && <span className="scene-chip check">要確認</span>}
    </div>
  )
}

/**
 * 熟語の詳しい情報：出典、頻度の目安、意味を選んだ根拠、辞書へのリンク。
 * 「この表現・訳に疑問がある」は端末に記録するだけ（外へは送らない）。設定の「疑問の記録」で一覧を見られ、
 * バックアップに含まれるので、次の作業で Claude が確かめる。
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
      <button className="btn secondary small" onClick={() => setOpen((o) => !o)}>{open ? '詳しい情報を閉じる' : '詳しい情報（出典・根拠）'}</button>
      {open && (
        <div className="stack idiom-more">
          <p className="muted">種類：{idiom.type}。映画字幕で100万語あたり約{idiom.perMillion < 10 ? idiom.perMillion.toFixed(1) : Math.round(idiom.perMillion)}回（この意味で使われる割合を掛けた目安）。</p>
          <p className="muted">場面の札のうち「会話向き・書き言葉向き・どちらでも」は、映画字幕と Wikipedia で数えた回数を比べた目安です。ほかの札は辞書（Wiktionary）の用法の説明によります。</p>
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
        </div>
      )}

      <div className="doubt-box">
        {sent && <p className="banner ok">記録しました。設定の「疑問の記録」で一覧を見られます。</p>}
        {reporting ? (
          <div className="stack">
            <p className="muted">どこに疑問がありますか？</p>
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
          <>
            <button className="btn secondary small" onClick={() => { setReporting(true); setSent(false) }}>この表現・訳に疑問がある</button>
            <p className="muted doubt-hint">意味や訳が違うと感じたら記録できます。後で見直しに使います（記録は端末の中だけに残ります）。</p>
          </>
        )}
      </div>
    </div>
  )
}
