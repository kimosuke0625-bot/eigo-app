import { useMemo, useState } from 'react'
import { addMaterial, deleteMaterial, KIND_LABELS, useMaterials, useReadLog, type Mat } from './materials'
import { fitOf, FIT_LABELS, type Fit } from './knownRatio'
import { FitBadge, ratioOf, useKnowledge } from '../practice/ReadingParts'

/** 素材の一覧と、文章を貼り付けて取り込む機能 */
export function MaterialsScreen({ onRead, onSpeed }: { onRead: (id: string) => void; onSpeed: (id: string) => void }) {
  const materials = useMaterials()
  const knowledge = useKnowledge()
  const log = useReadLog()
  const [filter, setFilter] = useState<Fit | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!materials || !knowledge) return []
    return materials.map((m) => ({ m, r: ratioOf(m, knowledge).ratio }))
  }, [materials, knowledge])

  if (!materials || !knowledge) return <p className="muted">読み込み中…</p>
  const shown = rows.filter(({ r }) => filter === 'all' || fitOf(r) === filter)

  return (
    <div>
      <section className="card stack">
        <h2>素材</h2>
        <p className="muted">既知語の割合は、診断テストで「知っている」とした語と、復習中のカードから自動で計算します。95〜98%が「ちょうどよい」です。</p>
        {!adding
          ? <button className="btn block" onClick={() => setAdding(true)}>＋ 文章を貼り付けて取り込む</button>
          : <AddForm onDone={(id) => { setAdding(false); if (id) onRead(id) }} />}
      </section>

      <div className="seg" style={{ marginBottom: 8 }}>
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>すべて</button>
        {(['just', 'easy', 'stretch', 'hard'] as Fit[]).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{FIT_LABELS[f].replace(/（.*）/, '')}</button>
        ))}
      </div>

      {shown.map(({ m, r }) => (
        <div key={m.id} className="menu-item">
          <div className="body">
            <div className="name">{m.title}</div>
            <div style={{ marginTop: 4 }}>
              <FitBadge ratio={r} />
              <span className="tag">{KIND_LABELS[m.kind]}</span>
              <span className="tag">{m.wordCount}語</span>
              {log.has(m.id) && <span className="tag done">済</span>}
            </div>
            <Source m={m} />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" onClick={() => onRead(m.id)}>🎧 聞く・読む</button>
              {m.questions && <button className="btn secondary" onClick={() => onSpeed(m.id)}>⏱ 速読</button>}
              {m.kind === 'mine' && (
                confirmDelete === m.id
                  ? <>
                      <button className="btn danger" onClick={() => void deleteMaterial(m.id).then(() => setConfirmDelete(null))}>削除する</button>
                      <button className="btn secondary" onClick={() => setConfirmDelete(null)}>やめる</button>
                    </>
                  : <button className="mini-btn" onClick={() => setConfirmDelete(m.id)}>削除</button>
              )}
            </div>
          </div>
        </div>
      ))}
      {!shown.length && <p className="muted">この条件の素材はありません。</p>}
    </div>
  )
}

function Source({ m }: { m: Mat }) {
  return (
    <p className="muted source-line">
      出典：{m.source}
      {m.sourceUrl && <> ・<a href={m.sourceUrl} target="_blank" rel="noreferrer">元の文章</a></>}
      ・{m.license}
    </p>
  )
}

function AddForm({ onDone }: { onDone: (id?: string) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [audio, setAudio] = useState<File | null>(null)
  const [error, setError] = useState('')
  return (
    <div className="stack">
      <label className="field">
        <span>題名（空なら最初の数語）</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>英文</span>
        <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="ニュース記事や本の一節などを貼り付けてください" className="paste-area" />
      </label>
      <label className="field">
        <span>出典（任意：サイト名やURL）</span>
        <input type="text" value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <label className="field">
        <span>音声ファイル（任意：英文と同じ内容の朗読。mp3・m4a など）</span>
        <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        {audio && <small className="muted">{audio.name}（{(audio.size / 1024 / 1024).toFixed(1)}MB）</small>}
        <small className="muted">音声つきの素材は、多聴・多読でこの音声を再生します（文ごとの区切りはなく、全体を通して再生）。</small>
      </label>
      <p className="muted">取り込んだ文章と音声はこの端末の中だけに保存され、外には送られません。個人の学習用に使ってください。</p>
      {error && <div className="banner warn">{error}</div>}
      <div className="row">
        <button className="btn" style={{ flex: 1 }} disabled={!body.trim()} onClick={() => {
          if (audio && audio.size > 100 * 1024 * 1024) { setError('音声ファイルが大きすぎます（100MBまで）'); return }
          addMaterial(title, body, source, undefined, audio ?? undefined).then(onDone, (e: Error) => setError(e.message))
        }}>取り込んで開く</button>
        <button className="btn secondary" onClick={() => onDone()}>やめる</button>
      </div>
    </div>
  )
}
