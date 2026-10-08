import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { loadIdioms, unhideIdiom, type Idiom } from '../content/idioms'

/** 知っている熟語：表現の復習で「もう知っている」を押した熟語と、初期設定で外した基本のあいさつの一覧。「戻す」でまた出題されるようになる */
export function KnownIdiomsSection() {
  const hidden = useLiveQuery(() => db.hiddenItems.orderBy('at').reverse().toArray(), [], [])
  const [byId, setById] = useState<Map<string, Idiom>>(new Map())
  useEffect(() => { loadIdioms().then((d) => setById(new Map(d.items.map((x) => [x.id, x])))).catch(() => {}) }, [])

  return (
    <section className="card">
      <h2>知っている熟語（{hidden.length}個）</h2>
      <p className="muted">表現の復習で「もう知っている」を押した熟語と、基本のあいさつ・お礼（thank you など。1つ目の意味だけ。初期設定）は出題されません。「戻す」を押すと、また出題されるようになります（それまでの復習の記録は残っています）。</p>
      {hidden.length === 0 ? (
        <p className="muted">まだありません。</p>
      ) : (
        <ul className="report-list">
          {hidden.map((h) => {
            const d = byId.get(h.itemId)
            return (
              <li key={h.itemId} className="row" style={{ justifyContent: 'space-between' }}>
                <span><strong lang="en">{d?.en ?? h.itemId}</strong>{d ? <span className="muted">　{d.ja}</span> : null}{h.reason === 'basic' ? <span className="muted">（基本のあいさつ）</span> : null}</span>
                <button className="btn secondary small" onClick={() => void unhideIdiom(h.itemId)}>戻す</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
