import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Assessment } from '../db/schema'
import { ASSESSMENT_INTERVAL_DAYS, METRICS } from './periodic'

/** 4週間ごとの測定の記録（新しい順に並べて比べる） */
export function AssessmentHistory({ onStart }: { onStart: () => void }) {
  const list = useLiveQuery(() => db.assessments.where('kind').equals('periodic').sortBy('at'), [], [] as Assessment[])
  const last = list.at(-1)
  const days = last ? Math.floor((Date.now() - last.at) / 86_400_000) : null
  return (
    <div className="stack">
      {!list.length && <p className="muted">まだ測定していません。約20分で、語彙・聞き取り・速読・スピーチ・作文を測ります。</p>}
      {list.length > 0 && (
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead>
              <tr><th>項目</th>{list.slice(-4).map((a) => <th key={a.at}>{new Date(a.at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</th>)}</tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  {list.slice(-4).map((a) => <td key={a.at}>{typeof a[m.key] === 'number' ? m.format(a[m.key]!) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {days !== null && <p className="muted">前回の測定から{days}日（{ASSESSMENT_INTERVAL_DAYS}日ごとがおすすめ）</p>}
      <button className="btn block" onClick={onStart}>いま測定する（約20分）</button>
    </div>
  )
}
