import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { setExcluded, useFacts, type FactContent } from './facts'
import { FactCard } from './FactCard'
import { useSessionTimer } from '../practice/useSessionTimer'

/** 雑学を読む時間は学習時間（インプット）に数えるが、1日10分まで */
const FACT_MINUTES_PER_DAY = 10

export function CollectionScreen({ settings }: { settings: Settings }) {
  useSessionTimer('facts', 'input', FACT_MINUTES_PER_DAY * 60)
  const data = useFacts()
  const states = useLiveQuery(() => db.facts.toArray(), [], [])
  const [tab, setTab] = useState<'owned' | 'review'>('owned')
  const [category, setCategory] = useState<string | null>(null)
  const [open, setOpen] = useState<FactContent | null>(null)

  if (!data) return <p className="muted">読み込み中…</p>
  const byId = new Map(states.map((s) => [s.id, s]))
  const owned = data.facts.filter((f) => byId.get(f.id)?.acquiredAt)
  const total = data.facts.filter((f) => !byId.get(f.id)?.excluded).length

  return (
    <div>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button aria-pressed={tab === 'owned'} onClick={() => setTab('owned')}>集めた雑学</button>
        <button aria-pressed={tab === 'review'} onClick={() => setTab('review')}>雑学の確認（全{data.facts.length}件）</button>
      </div>

      {tab === 'owned' && (
        <>
          <section className="card">
            <h2>集めた雑学 {owned.length} / {total}</h2>
            <p className="muted">毎日、最低ライン（5分）を終えると1枚届きます。まれにレア雑学も出ます。</p>
            <div className="cat-grid">
              {data.categories.map((c) => {
                const all = data.facts.filter((f) => f.category === c.key && !byId.get(f.id)?.excluded)
                const got = all.filter((f) => byId.get(f.id)?.acquiredAt).length
                const emoji = all[0]?.emoji ?? '📘'
                return (
                  <button key={c.key} className="cat-tile" aria-pressed={category === c.key}
                    onClick={() => setCategory(category === c.key ? null : c.key)}>
                    <span className="cat-emoji">{emoji}</span>
                    <span>{c.ja}</span>
                    <span className="muted">{got}/{all.length}</span>
                    <span className="progress"><span style={{ width: `${all.length ? (got / all.length) * 100 : 0}%` }} /></span>
                  </button>
                )
              })}
            </div>
          </section>
          {open && (
            <div className="card">
              <FactCard fact={open} data={data} settings={settings} autoSpeak />
              <button className="btn secondary block" style={{ marginTop: 8 }} onClick={() => setOpen(null)}>閉じる</button>
            </div>
          )}
          <ul className="fact-list">
            {owned
              .filter((f) => !category || f.category === category)
              .sort((a, b) => (byId.get(b.id)!.acquiredAt ?? 0) - (byId.get(a.id)!.acquiredAt ?? 0))
              .map((f) => (
                <li key={f.id}>
                  <button onClick={() => { setOpen(f); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                    <span>{f.emoji}</span>
                    <span className="fact-line">{f.ja}</span>
                    {f.rare && <span className="tag rare-tag">レア</span>}
                  </button>
                </li>
              ))}
          </ul>
          {!owned.length && <p className="muted">まだ雑学がありません。今日の練習を5分終えると最初の1枚が届きます。</p>}
        </>
      )}

      {tab === 'review' && (
        <section className="card">
          <h2>雑学の確認</h2>
          <p className="muted">
            前回アプリの雑学365個を点検し、誤りの修正、根拠の弱いものと重複の削除（42個）、新しい雑学の追加（42個）をしました。
            英語版はこのアプリで作成しています。気になるものは「外す」で出ないようにできます。
          </p>
          <ul className="review-list">
            {data.facts.map((f) => {
              const excluded = !!byId.get(f.id)?.excluded
              return (
                <li key={f.id} className={excluded ? 'excluded' : ''}>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                    <span className="tag">{f.emoji} {data.categories.find((c) => c.key === f.category)?.ja}</span>
                    <button className="mini-btn" onClick={() => void setExcluded(f, !excluded)}>{excluded ? '戻す' : '外す'}</button>
                  </div>
                  <p>{f.ja}</p>
                  <p className="muted">{f.easy}</p>
                  <p className="muted">{f.std}</p>
                  <a className="source" href={f.source} target="_blank" rel="noreferrer">出典</a>
                  {f.origin === 'new' && <span className="tag" style={{ marginLeft: 6 }}>新規</span>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
