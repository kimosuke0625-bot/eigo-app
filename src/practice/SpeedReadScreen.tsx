import { useMemo, useState } from 'react'
import type { Settings } from '../db/schema'
import { useMaterials, useReadLog, KIND_LABELS, type Mat } from '../content/materials'
import { FitBadge, QuestionsPanel, ratioOf, useKnowledge } from './ReadingParts'
import { useSessionTimer } from './useSessionTimer'

/** これより速い記録は、本文を読まずに押した可能性が高いので残さない */
const MAX_WPM = 500

/**
 * 速読（流暢さの訓練）。知っている語がほぼ100%の、やさしい素材をいつもより速く読む。
 * 読み終えたら1分あたりの語数（WPM）を出し、内容確認で理解できているかを確かめる。
 */
export function SpeedReadScreen({ settings, materialId, onExit }: { settings: Settings; materialId?: string; onExit: () => void }) {
  const materials = useMaterials()
  const knowledge = useKnowledge()
  const log = useReadLog()
  const [chosen, setChosen] = useState<string | undefined>(materialId)

  const candidates = useMemo(() => {
    if (!materials || !knowledge) return []
    return materials
      .filter((m) => m.questions)
      .map((m) => ({ m, r: ratioOf(m, knowledge).ratio }))
      // やさしい順。速読は一度読んだ素材でもよい
      .sort((a, b) => b.r - a.r)
  }, [materials, knowledge])

  if (!materials || !knowledge) return <p className="muted">素材を準備中…</p>
  const material = materials.find((m) => m.id === chosen)
  if (material) return <SpeedRead key={material.id} material={material} settings={settings} onExit={onExit} />

  return (
    <div>
      <section className="card">
        <h2>速読</h2>
        <p className="muted">知っている語がほぼすべての、やさしい素材を使います。いつもより少し速く、戻り読みをせずに読みましょう。</p>
        <p className="muted">4/3/2スピーチは録音の練習と一緒に開発フェーズ5で追加します。</p>
      </section>
      {candidates.slice(0, 6).map(({ m, r }) => (
        <button key={m.id} className="menu-item as-button" onClick={() => setChosen(m.id)}>
          <div className="body">
            <div className="name">{m.title}</div>
            <div style={{ marginTop: 4 }}>
              <FitBadge ratio={r} />
              <span className="tag">{KIND_LABELS[m.kind]}</span>
              <span className="tag">{m.wordCount}語</span>
              {log.has(m.id) && <span className="tag done">済</span>}
            </div>
          </div>
          <span className="min">▶</span>
        </button>
      ))}
      <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onExit}>戻る</button>
    </div>
  )
}

function SpeedRead({ material, settings, onExit }: { material: Mat; settings: Settings; onExit: () => void }) {
  const result = useSessionTimer('fluency', 'fluency', undefined, material.id)
  const [startedAt, setStartedAt] = useState(0)
  const [wpm, setWpm] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  void settings

  if (!startedAt) {
    return (
      <section className="card stack" style={{ textAlign: 'center' }}>
        <h2>{material.title}</h2>
        <p>{material.wordCount}語。「読み始める」を押すと本文が出て、時間を計ります。</p>
        <button className="btn block" onClick={() => setStartedAt(Date.now())}>▶ 読み始める</button>
        <button className="btn secondary block" onClick={onExit}>やめる</button>
      </section>
    )
  }

  if (wpm === null) {
    return (
      <div>
        <section className="card">
          <h2>{material.title}</h2>
          <div className="speed-text">
            {material.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </section>
        <button className="btn block sticky-bottom" onClick={() => {
          const minutes = (Date.now() - startedAt) / 60000
          const v = Math.round(material.wordCount / Math.max(minutes, 0.05))
          setWpm(v)
          // 1分に500語を超えるのは、ざっと見ただけの可能性が高いので記録しない
          if (v <= MAX_WPM) result.current.readingWpm = v
        }}>読み終えた</button>
      </div>
    )
  }

  return (
    <section className="card stack">
      <h2>1分あたり {wpm} 語</h2>
      {wpm > MAX_WPM && (
        <div className="banner warn">とても速すぎるため、今回の速さは記録しませんでした。本文をすべて読んでから「読み終えた」を押してください。</div>
      )}
      <p className="muted">目安：ゆっくり読むと100語前後、母語話者は200〜300語。内容が分かったうえで速くなるのが目標です。</p>
      {material.questions && (
        <QuestionsPanel questions={material.questions} onDone={(score) => {
          result.current.readingAccuracy = score
          // 内容確認の正答率のグラフにも含める
          result.current.comprehension = score
          setDone(true)
        }} />
      )}
      {done && <button className="btn block" onClick={onExit}>今日の画面に戻る</button>}
    </section>
  )
}
