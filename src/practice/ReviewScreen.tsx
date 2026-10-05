import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Card, type Item, type Settings } from '../db/schema'
import { GRADES, GRADE_LABELS, formatInterval, previewIntervals, type Grade } from '../srs/fsrs'
import { chooseMode, nextCard, type PresentMode } from '../srs/queue'
import { recordReview, todaysQueue } from '../srs/store'
import { speak, speechSupported } from '../speech/voices'
import { AnswerFace, Highlight, SpeakButton } from './WordParts'
import { useSessionTimer } from './useSessionTimer'

type Current = { card: Card; item: Item; mode: PresentMode; shownAt: number }

const MODE_PROMPT: Record<PresentMode, string> = {
  word: 'この語の意味を声に出して言ってみましょう',
  chunk: '太字の語の意味を、文の中で考えて声に出しましょう',
  listen: '音声だけを聞いて、何の語か・意味を言ってみましょう',
}

export function ReviewScreen({ settings, onExit, onAddCards }: {
  settings: Settings
  onExit: () => void
  onAddCards: () => void
}) {
  const result = useSessionTimer('review', 'language')
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [current, setCurrent] = useState<Current | null>(null)
  // 答えを見た時刻（0 = まだ）。ボタンに出す次回までの間隔もこの時刻で計算する
  const [revealedAt, setRevealedAt] = useState(0)
  const revealed = revealedAt > 0
  const [showJa, setShowJa] = useState(false)
  const [done, setDone] = useState({ total: 0, recalled: 0 })
  const answerMs = useRef(0)
  const tts = speechSupported()

  useEffect(() => {
    todaysQueue().then(setQueue)
  }, [])

  const present = useCallback(async (q: Card[]) => {
    const card = nextCard(q, Date.now())
    if (!card) { setCurrent(null); return }
    const item = await db.items.get(card.itemId)
    if (!item) { setQueue(q.filter((c) => c.id !== card.id)); return }
    const mode = chooseMode(card, { tts, hasExample: item.examples.length > 0 })
    setCurrent({ card, item, mode, shownAt: Date.now() })
    setRevealedAt(0)
    setShowJa(false)
    if (mode === 'listen') speak(item.examples[0]?.en ?? item.english, settings.voiceURI)
  }, [tts, settings.voiceURI])

  useEffect(() => {
    if (queue) void present(queue)
  }, [queue, present])

  const reveal = useCallback(() => {
    if (!current || revealed) return
    const now = Date.now()
    answerMs.current = now - current.shownAt
    setRevealedAt(now)
  }, [current, revealed])

  const grade = useCallback(async (g: Grade) => {
    if (!current || !queue) return
    const updated = await recordReview(current.card, g, { answerMs: answerMs.current, mode: current.mode })
    const recalled = g >= 2
    setDone((d) => ({ total: d.total + 1, recalled: d.recalled + (recalled ? 1 : 0) }))
    result.current.reviews = (result.current.reviews ?? 0) + 1
    result.current.recalled = (result.current.recalled ?? 0) + (recalled ? 1 : 0)
    // 学習中のカードはこの回のうちにもう一度出す（20分以内に期日が来るもの）
    const rest = queue.filter((c) => c.id !== current.card.id)
    setQueue(updated.due <= Date.now() + 20 * 60 * 1000 ? [...rest, updated] : rest)
  }, [current, queue, result])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal() }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) void grade(Number(e.key) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, reveal, grade])

  if (!queue) return <p className="muted">読み込み中…</p>

  if (!current) {
    return (
      <section className="card stack" style={{ textAlign: 'center' }}>
        <h2>{done.total ? '今日の復習はここまで！' : '今日復習するカードはありません'}</h2>
        {done.total > 0 && (
          <p>{done.total}回思い出そうとしました（思い出せた {done.recalled}回）</p>
        )}
        <button className="btn block" onClick={onAddCards}>＋ 新しいカードを覚える</button>
        <button className="btn secondary block" onClick={onExit}>今日の画面に戻る</button>
      </section>
    )
  }

  const { card, item, mode } = current
  const intervals = revealed ? previewIntervals(card.fsrs, revealedAt, settings.retention) : null
  const remaining = queue.filter((c) => c.due <= current.shownAt).length

  return (
    <div className="review">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="muted">残り {remaining} 枚・済み {done.total}</span>
        <span className="tag">{mode === 'word' ? '単語' : mode === 'chunk' ? '例文' : '聞き取り'}</span>
      </div>

      <section className="card flashcard" onClick={reveal}>
        <p className="muted prompt">{MODE_PROMPT[mode]}</p>
        {mode === 'word' && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <span className="headword">{item.english}</span>
            <SpeakButton text={item.english} voiceURI={settings.voiceURI} />
          </div>
        )}
        {mode === 'chunk' && (
          <p className="front-sentence"><Highlight text={item.examples[0].en} forms={item.forms ?? [item.english]} /></p>
        )}
        {mode === 'listen' && (
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <SpeakButton big text={item.examples[0]?.en ?? item.english} voiceURI={settings.voiceURI} label="もう一度聞く" />
            <SpeakButton big text={item.examples[0]?.en ?? item.english} voiceURI={settings.voiceURI} rate={0.8} label="ゆっくり" />
          </div>
        )}

        {revealed ? (
          <AnswerFace item={item} phase={settings.phase} voiceURI={settings.voiceURI}
            showJa={showJa} onToggleJa={() => setShowJa(true)} hideHeadword={mode === 'word'} />
        ) : (
          <button className="btn block" style={{ marginTop: 16 }} onClick={(e) => { e.stopPropagation(); reveal() }}>
            答えを見る
          </button>
        )}
      </section>

      {revealed && intervals && (
        <div className="grade-row">
          {GRADES.map((g, i) => (
            <button key={g} className={`grade g${g}`} onClick={() => void grade(g)}>
              <span className="label">{GRADE_LABELS[g]}</span>
              <span className="interval">{formatInterval(intervals[g])}後</span>
              <span className="key">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn secondary block" style={{ marginTop: 16 }} onClick={onExit}>ここでやめる</button>
    </div>
  )
}
