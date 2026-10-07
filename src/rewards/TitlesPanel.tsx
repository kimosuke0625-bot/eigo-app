import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Reward } from '../db/schema'
import { TITLES } from './titles'

/** 称号の一覧。隠し称号は手に入れるまで「？？？」 */
export function TitlesPanel() {
  const rows = useLiveQuery(() => db.rewards.where('kind').equals('title').toArray(), [], [] as Reward[])
  const got = new Map(rows.map((r) => [r.key, r.acquiredAt]))
  return (
    <section className="card">
      <h2>称号 {got.size} / {TITLES.length}</h2>
      <p className="muted">思い出そうとした回数や、続けた日数などで手に入ります。配色テーマや効果音が解放されるものもあります。</p>
      <ul className="title-grid">
        {TITLES.map((t) => {
          const at = got.get(t.key)
          const secret = t.hidden && !at
          return (
            <li key={t.key} className={at ? 'got' : ''}>
              <strong>{secret ? '？？？' : t.name}</strong>
              <div className="muted">{secret ? '隠し称号' : t.desc}</div>
              {at && <div className="muted">{new Date(at).toLocaleDateString('ja-JP')}</div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
