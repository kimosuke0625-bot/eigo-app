import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Phrase, type Settings } from '../db/schema'
import { SpeakButton } from '../practice/WordParts'
import { PixelIcon } from '../ui/PixelIcon'
import { deletePhrase, SOURCE_LABELS } from './store'

type Sort = 'new' | 'old' | 'abc' | 'used'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'new', label: '新しい順' },
  { key: 'old', label: '古い順' },
  { key: 'abc', label: 'ABC順' },
  { key: 'used', label: '使った回数' },
]

/** 旅の手帳（表現ノート）：添削で教わった表現。一覧・検索・並べ替え・読み上げ */
export function NotebookScreen({ settings, onImport }: { settings: Settings; onImport: () => void }) {
  const list = useLiveQuery(() => db.phrases.toArray(), [], [] as Phrase[])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [confirm, setConfirm] = useState<number | null>(null)

  const query = q.trim().toLowerCase()
  const shown = list
    .filter((p) => !query || [p.expression, p.meaning, p.example, p.scene].some((s) => s.toLowerCase().includes(query)))
    .sort((a, b) => sort === 'new' ? b.at - a.at
      : sort === 'old' ? a.at - b.at
        : sort === 'abc' ? a.expression.localeCompare(b.expression, 'en', { sensitivity: 'base' })
          : b.used - a.used || b.at - a.at)

  return (
    <div className="notes">
      <section className="card stack">
        <h2 className="win-title">旅の手帳</h2>
        <p>添削で教わった表現を書き留めた手帳です。<strong className="num">{list.length}</strong> 個。ここにある表現は復習カードにも出てきます。</p>
        <input type="search" className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="表現・意味・例文で探す" aria-label="表現を探す" />
        <div className="seg">
          {SORTS.map((s) => <button key={s.key} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>)}
        </div>
      </section>
      {!list.length && (
        <section className="card stack">
          <p>まだ表現がありません。作文・音声日記・会話練習の添削を Claude に頼み、返事を「添削を取り込む」で読み込むと、ここに書き込まれます。</p>
          <button className="btn block" onClick={onImport}>添削を取り込む</button>
        </section>
      )}
      {list.length > 0 && !shown.length && <p className="muted">「{q}」に当てはまる表現はありません。</p>}
      <ul className="phrase-list">
        {shown.map((p) => (
          <li key={p.id} className="card phrase">
            <div className="row phrase-head">
              <PixelIcon name="book" size={18} />
              <strong className="phrase-en">{p.expression}</strong>
              <SpeakButton text={p.expression} voiceURI={settings.voiceURI} />
            </div>
            {p.meaning && <p className="phrase-ja">{p.meaning}</p>}
            {p.example && (
              <div className="row phrase-ex">
                <span className="en">{p.example}</span>
                <SpeakButton text={p.example} voiceURI={settings.voiceURI} />
              </div>
            )}
            <p className="muted">
              {p.day.replace(/-/g, '/')}・{SOURCE_LABELS[p.source]}{p.scene && `・場面：${p.scene}`}
              {p.used > 0 && <>・使えた <span className="num">{p.used}</span> 回</>}
            </p>
            {confirm === p.id ? (
              <div className="row">
                <button className="btn danger" onClick={() => { void deletePhrase(p.id!); setConfirm(null) }}>消す（復習カードも消えます）</button>
                <button className="btn secondary" onClick={() => setConfirm(null)}>やめる</button>
              </div>
            ) : (
              <button className="mini-btn" onClick={() => setConfirm(p.id!)}>手帳から消す</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
