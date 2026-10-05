import { useEffect, useMemo, useRef, useState } from 'react'
import type { Settings } from '../db/schema'
import { useMaterials, useReadLog, KIND_LABELS, type Mat } from '../content/materials'
import { fitDistance } from '../content/knownRatio'
import { splitSentences } from '../speech/sentences'
import { speakSentences } from '../speech/reader'
import { speechSupported } from '../speech/voices'
import { FitBadge, MaterialText, QuestionsPanel, ratioOf, useKnowledge } from './ReadingParts'
import { useSessionTimer } from './useSessionTimer'

const RATES = [0.8, 1, 1.2]

/** 多聴・多読。既知語率95〜98%の素材を選び、聞く（文字なし）か読む。最後に内容確認の質問 */
export function InputScreen({ settings, materialId, onExit, onDictation }: {
  settings: Settings
  materialId?: string
  onExit: () => void
  onDictation: (materialId: string) => void
}) {
  const materials = useMaterials()
  const knowledge = useKnowledge()
  const log = useReadLog()
  const [chosen, setChosen] = useState<string | undefined>(materialId)

  const ranked = useMemo(() => {
    if (!materials || !knowledge) return []
    return materials
      .map((m) => ({ m, r: ratioOf(m, knowledge).ratio }))
      // まだ使っていない素材を先に、その中でちょうどよい難しさに近い順
      .sort((a, b) => Number(log.has(a.m.id)) - Number(log.has(b.m.id)) || fitDistance(a.r) - fitDistance(b.r))
  }, [materials, knowledge, log])

  if (!materials || !knowledge) return <p className="muted">素材を準備中…</p>
  const material = materials.find((m) => m.id === chosen)
  if (material) {
    return <InputSession key={material.id} material={material} settings={settings} index={knowledge.index}
      ratio={ratioOf(material, knowledge).ratio} onExit={onExit} onBack={() => setChosen(undefined)}
      onDictation={() => onDictation(material.id)} />
  }

  return (
    <div>
      <section className="card">
        <h2>多聴・多読</h2>
        <p className="muted">知っている語が95〜98%の素材がおすすめです。まず音声だけで聞き、わからなければ文字を見ましょう。</p>
      </section>
      <h3 className="block-title">おすすめ</h3>
      {ranked.slice(0, 6).map(({ m, r }) => (
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
      <p className="muted">ほかの素材や、自分で文章を貼り付けて取り込むのは「素材」タブから。</p>
      <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onExit}>戻る</button>
    </div>
  )
}

function InputSession({ material, settings, index, ratio, onExit, onBack, onDictation }: {
  material: Mat
  settings: Settings
  index: Map<string, string>
  ratio: number
  onExit: () => void
  onBack: () => void
  onDictation: () => void
}) {
  const result = useSessionTimer('input', 'input', undefined, material.id)
  // 段落ごとに文に分け、段落の始まりの文の番号を覚えておく（本文を段落つきで表示するため）
  const { sentences, breaks } = useMemo(() => {
    const list: string[] = []
    const starts = new Set<number>()
    for (const para of material.body.split(/\n\s*\n/)) {
      starts.add(list.length)
      list.push(...splitSentences(para))
    }
    return { sentences: list, breaks: starts }
  }, [material.body])
  const tts = speechSupported()
  const [mode, setMode] = useState<'listen' | 'read'>(tts ? 'listen' : 'read')
  const [showText, setShowText] = useState(!tts)
  const [rate, setRate] = useState(settings.phase <= 1 ? 0.8 : 1)
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState<'content' | 'check' | 'done'>('content')
  const [selfRating, setSelfRating] = useState<number | null>(null)
  const stop = useRef<() => void>(() => {})

  useEffect(() => () => stop.current(), [])

  const play = (from = Math.max(0, current)) => {
    stop.current()
    setPlaying(true)
    stop.current = speakSentences({
      sentences, from, rate, voiceURI: settings.voiceURI,
      onIndex: setCurrent,
      onEnd: () => { setPlaying(false); setCurrent(-1) },
    })
  }
  const pause = () => { stop.current(); setPlaying(false) }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="link-btn" onClick={() => { pause(); onBack() }}>← 素材を選び直す</button>
        <FitBadge ratio={ratio} />
      </div>
      <section className="card stack">
        <h2>{material.title}</h2>
        {step === 'content' && (
          <>
            <div className="seg">
              <button aria-pressed={mode === 'listen'} disabled={!tts} onClick={() => { setMode('listen'); setShowText(false) }}>🎧 聞く</button>
              <button aria-pressed={mode === 'read'} onClick={() => { setMode('read'); setShowText(true); pause() }}>📖 読む</button>
            </div>
            {mode === 'listen' && (
              <div className="stack">
                <div className="row">
                  {playing
                    ? <button className="btn" style={{ flex: 1 }} onClick={pause}>⏸ 一時停止</button>
                    : <button className="btn" style={{ flex: 1 }} onClick={() => play()}>▶ {current > 0 ? '続きから' : '再生'}</button>}
                  <button className="btn secondary" onClick={() => play(0)}>⏮ 最初から</button>
                </div>
                <div className="seg" aria-label="速さ">
                  {RATES.map((r) => (
                    <button key={r} aria-pressed={rate === r} onClick={() => { setRate(r); if (playing) { pause() } }}>{r}倍</button>
                  ))}
                </div>
                <p className="muted">{current >= 0 ? `${current + 1} / ${sentences.length} 文目` : `${sentences.length}文・${material.wordCount}語`}</p>
                <button className="link-btn" onClick={() => setShowText(!showText)}>{showText ? '文字を隠す' : '文字を見る'}</button>
              </div>
            )}
            {showText && (
              <>
                <p className="muted">語をタップすると意味が出ます。{mode === 'listen' && '文をダブルタップするとそこから再生します。'}</p>
                <MaterialText sentences={sentences} breaks={breaks} current={current} index={index} settings={settings}
                  onSentence={mode === 'listen' ? (i) => play(i) : undefined} />
                {material.moral && <p className="moral">Moral: {material.moral}</p>}
              </>
            )}
            <button className="btn block" onClick={() => { pause(); setStep('check') }}>内容を確認する →</button>
          </>
        )}

        {step === 'check' && (
          material.questions ? (
            <QuestionsPanel questions={material.questions} onDone={(score) => {
              result.current.comprehension = score
              setStep('done')
            }} />
          ) : (
            <div className="stack">
              <p>取り込んだ素材には質問がありません。どのくらい理解できましたか？</p>
              <div className="seg">
                {['ほぼ全部', '大体', '半分くらい', 'ほとんど'].map((label, i) => (
                  <button key={label} aria-pressed={selfRating === i} onClick={() => {
                    setSelfRating(i)
                    // 自己評価は内容確認の正答率とは別に記録する（グラフには含めない）
                    result.current.selfUnderstanding = 1 - i / 3
                    setStep('done')
                  }}>{label}</button>
                ))}
              </div>
              <p className="muted">「ほとんど」は「ほとんどわからない」。Claude に要約を確認してもらう機能は開発フェーズ6で追加します。</p>
            </div>
          )
        )}

        {step === 'done' && (
          <div className="stack">
            <p className="muted">出典：{material.source}{material.sourceUrl && <> （<a href={material.sourceUrl} target="_blank" rel="noreferrer">元の文章</a>・{material.license}）</>}</p>
            <button className="btn block" onClick={onDictation}>✍️ この素材でディクテーション（3文）</button>
            <button className="btn secondary block" onClick={() => { setStep('content'); setShowText(true); setMode('read') }}>もう一度読む</button>
            <button className="btn secondary block" onClick={onExit}>今日の画面に戻る</button>
          </div>
        )}
      </section>
      {step !== 'done' && <button className="btn secondary block" onClick={() => { pause(); onExit() }}>ここでやめる</button>}
    </div>
  )
}
