import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'

/**
 * 疑問の記録：熟語のカードの「この表現・訳に疑問がある」で記録したものの一覧。
 * 端末の中だけに残り、バックアップに含まれる（次の作業で Claude が確かめて、データを直す）。
 */
export function ReportsSection() {
  const list = useLiveQuery(() => db.reports.orderBy('at').reverse().toArray(), [], [])
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const fmt = (t: number) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })

  return (
    <section className="card">
      <h2>疑問の記録（{list.length}件）</h2>
      <p className="muted">熟語のカードで「この表現・訳に疑問がある」を押して記録したものです。バックアップに含まれるので、書き出したファイルを Claude に渡すと、まとめて確かめてデータを直します。</p>
      {list.length === 0 ? (
        <p className="muted">まだ記録はありません。</p>
      ) : (
        <ul className="report-list">
          {list.map((r) => (
            <li key={r.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong lang="en">{r.english}</strong>
                <span className="muted">{fmt(r.at)}</span>
              </div>
              <div className="muted">訳：{r.japanese}</div>
              <div><span className="tag">{r.what}</span>{r.note}</div>
              {confirmId === r.id ? (
                <div className="row" style={{ marginTop: 4 }}>
                  <button className="btn small" onClick={() => { void db.reports.delete(r.id!); setConfirmId(null) }}>消す</button>
                  <button className="btn secondary small" onClick={() => setConfirmId(null)}>やめる</button>
                </div>
              ) : (
                <button className="btn secondary small" style={{ marginTop: 4 }} onClick={() => setConfirmId(r.id!)}>この記録を消す</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
