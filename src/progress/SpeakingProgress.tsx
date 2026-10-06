import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Recording } from '../db/schema'
import { PlayBlobButton } from '../practice/SpeakParts'

const pct = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 100)}%`)
const date = (t: number) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
const KIND: Record<string, string> = { shadowing: 'シャドーイング', speech: '4/3/2スピーチ', pronunciation: '発音' }

/** シャドーイング：素材の部分ごとに、初回と最新の自己評価・一致率を並べる */
export function ShadowingTable() {
  const recs = useLiveQuery(() => db.recordings.where('kind').equals('shadowing').sortBy('at'), [], [] as Recording[])
  const byRef = new Map<string, Recording[]>()
  for (const r of recs) byRef.set(r.ref, [...(byRef.get(r.ref) ?? []), r])
  if (!byRef.size) return <p className="muted">シャドーイングで録音すると、素材ごとに初回と最新を比べられます。</p>
  return (
    <div className="viz-table-wrap">
      <table className="viz-table">
        <thead><tr><th>素材（部分）</th><th>回数</th><th>初回 自己/一致</th><th>最新 自己/一致</th><th>聞き比べ</th></tr></thead>
        <tbody>
          {[...byRef].map(([ref, list]) => {
            const first = list[0]
            const last = list.at(-1)!
            const [id, part] = ref.split('#')
            return (
              <tr key={ref}>
                <td>{id}（{Number(part) + 1}文目〜）</td>
                <td>{list.length}</td>
                <td>{pct(first.self)} / {pct(first.match)}</td>
                <td>{pct(last.self)} / {pct(last.match)}</td>
                <td className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                  <PlayBlobButton blob={first.audio} label="初回" />
                  {list.length > 1 && <PlayBlobButton blob={last.audio} label="最新" />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 録音の一覧。過去の自分の声をいつでも聞ける */
export function RecordingLibrary() {
  const recs = useLiveQuery(() => db.recordings.orderBy('at').reverse().limit(20).toArray(), [], [] as Recording[])
  if (!recs.length) return <p className="muted">まだ録音がありません。</p>
  return (
    <ul className="rec-list">
      {recs.map((r) => (
        <li key={r.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div><span className="tag">{KIND[r.kind] ?? r.kind}</span>{date(r.at)}{r.round ? `・${['4分', '3分', '2分'][r.round - 1]}` : ''}</div>
            {r.text && <div className="muted rec-text">{r.text}</div>}
          </div>
          <PlayBlobButton blob={r.audio} label="▶" />
        </li>
      ))}
    </ul>
  )
}
