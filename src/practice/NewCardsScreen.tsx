import { useEffect, useState } from 'react'
import type { Item, Settings } from '../db/schema'
import { introduce, markKnown, newCardsRemaining, nextNewItems } from '../srs/store'
import { AnswerFace } from './WordParts'
import { useSessionTimer } from './useSessionTimer'

/** 新しいカードを覚える。1枚ずつ意味と例文を確かめ、聞いて、声に出してからカードにする */
export function NewCardsScreen({ settings, onExit, onReview }: {
  settings: Settings
  onExit: () => void
  onReview: () => void
}) {
  const result = useSessionTimer('addCards', 'language')
  const [items, setItems] = useState<Item[] | null>(null)
  const [index, setIndex] = useState(0)
  const [added, setAdded] = useState(0)
  const [showJa, setShowJa] = useState(false)
  const [extra, setExtra] = useState(0)

  useEffect(() => {
    void (async () => {
      const n = await newCardsRemaining()
      setItems(await nextNewItems(n + extra))
    })()
  }, [extra])

  if (!items) return <p className="muted">読み込み中…</p>

  const item = items[index]
  const next = () => { setIndex((i) => i + 1); setShowJa(false) }

  const learn = async () => {
    await introduce(item.id)
    setAdded((a) => a + 1)
    result.current.added = (result.current.added ?? 0) + 1
    next()
  }
  const known = async () => {
    await markKnown([item.id], 'self')
    result.current.known = (result.current.known ?? 0) + 1
    // 知っていた語のかわりに1語足す
    setItems([...items, ...(await nextNewItems(items.length + 1)).filter((x) => !items.some((y) => y.id === x.id)).slice(0, 1)])
    next()
  }

  if (!item) {
    return (
      <section className="card stack" style={{ textAlign: 'center' }}>
        <h2>{added ? `${added}枚のカードを追加しました` : '今日の新しいカードはおしまいです'}</h2>
        <p className="muted">
          覚えたてのカードは数分後にもう一度出ます。夜に覚えたカードは、翌朝の復習で最初に確認します。
        </p>
        {added > 0 && <button className="btn block" onClick={onReview}>▶ すぐに復習する</button>}
        <button className="btn secondary block" onClick={() => setExtra((x) => x + 5)}>あと5枚だけ覚える</button>
        <button className="btn secondary block" onClick={onExit}>今日の画面に戻る</button>
      </section>
    )
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="muted">{index + 1} / {items.length}</span>
        <span className="tag">NGSL {item.ngslRank}位</span>
      </div>
      <section className="card flashcard">
        <AnswerFace item={item} phase={settings.phase} voiceURI={settings.voiceURI}
          showJa={showJa} onToggleJa={() => setShowJa(true)} />
        <p className="muted" style={{ marginTop: 12 }}>
          🔊で聞いて、例文を一度声に出して読んでから「覚える」を押しましょう。
        </p>
      </section>
      <div className="row">
        <button className="btn secondary" style={{ flex: 1 }} onClick={() => void known()}>もう知っている</button>
        <button className="btn" style={{ flex: 2 }} onClick={() => void learn()}>覚える</button>
      </div>
      <button className="btn secondary block" style={{ marginTop: 16 }} onClick={onExit}>ここでやめる</button>
    </div>
  )
}
