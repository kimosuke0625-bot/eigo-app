import { useEffect, useState } from 'react'
import { cachedSize, clearCache, loadBankIndex } from '../speech/audioBank'
import { nextNewItems } from '../srs/store'

/** 内蔵の英文の音声（PC で作って音声置き場に置いたもの）の作成状況と、端末に保存した量 */
export function AudioBankSection() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [cached, setCached] = useState<{ files: number; bytes: number } | null>(null)
  const [nextRank, setNextRank] = useState<number | null | undefined>(undefined)
  const [confirm, setConfirm] = useState(false)

  const refresh = () => {
    void loadBankIndex().then((i) => setCounts({ heads: i.heads.size, ex: i.ex.size, facts: i.facts.size, quotes: i.quotes.size }))
    void cachedSize().then(setCached)
  }
  useEffect(() => {
    refresh()
    void nextNewItems(1).then((items) => setNextRank(items[0]?.ngslRank ?? null))
  }, [])

  return (
    <section className="card stack">
      <h2>英文の音声（PC で作った音声）</h2>
      <p className="muted">
        見出し語・カードの例文・雑学・名言は、PC の音声合成（Kokoro-82M）であらかじめ作った音声で再生します。
        まだ作っていない英文は、端末の声で読み上げます。音声は聞いたときに読み込み、一度聞いたものは端末に保存します。
      </p>
      {nextRank !== undefined && (
        <p>次に覚える語：<strong>{nextRank ? `NGSL ${nextRank}位から` : 'NGSL の語はすべて取りかかり済み'}</strong>
          <span className="muted">（音声はこの順番に作っています）</span></p>
      )}
      {counts && (
        <table className="viz-table">
          <tbody>
            <tr><td>見出し語</td><td>{counts.heads.toLocaleString()} / 2,809</td></tr>
            <tr><td>カードの例文</td><td>{counts.ex.toLocaleString()} / 約8,300</td></tr>
            <tr><td>雑学</td><td>{counts.facts.toLocaleString()} / 730</td></tr>
            <tr><td>名言</td><td>{counts.quotes.toLocaleString()} / 60</td></tr>
          </tbody>
        </table>
      )}
      {cached && <p className="muted">この端末に保存した音声：{cached.files.toLocaleString()}件・約{cached.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(cached.bytes / 1024))}KB` : `${(cached.bytes / 1024 / 1024).toFixed(1)}MB`}</p>}
      {!confirm
        ? <button className="btn secondary" onClick={() => setConfirm(true)}>保存した音声を消す</button>
        : (
          <div className="row">
            <button className="btn danger" onClick={() => void clearCache().then(() => { setConfirm(false); refresh() })}>消す（また聞くときに読み込み直します）</button>
            <button className="btn secondary" onClick={() => setConfirm(false)}>やめる</button>
          </div>
        )}
    </section>
  )
}
