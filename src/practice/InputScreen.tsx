import { useEffect, useMemo, useRef, useState } from 'react'
import type { Settings } from '../db/schema'
import { useMaterials, useReadLog, KIND_LABELS, type Mat } from '../content/materials'
import { fitDistance } from '../content/knownRatio'
import { splitSentences } from '../speech/sentences'
import { playSentences } from '../speech/clips'
import { speechSupported } from '../speech/voices'
import { FitBadge, MaterialText, QuestionsPanel, ratioOf, useKnowledge } from './ReadingParts'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { ClaudePromptBox } from './ClaudePromptBox'
import { summaryPrompt, type Level } from './claudePrompts'
import { currentLevel } from './output'
import { mmss, useMaterialAudio, useWholeAudio, VoiceNote, type MaterialAudio } from './AudioParts'

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
      <Steps steps={[]} current={0} guide="まず素材を1つ選びましょう。上にあるものほど今のあなたにちょうどよい難しさです。" />
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

type Stage = 'preview' | 'listen' | 'read' | 'answer' | 'done'

const STAGE_LABELS: Record<Exclude<Stage, 'done'>, string> = {
  preview: '問いを見る',
  listen: '聞く',
  read: '読む',
  answer: '答える',
}

/**
 * 多聴・多読の1回分。段階を順に進める。
 * 問いを先に見る設定なら：1 問いを見る → 2 聞く → 3 読む → 4 答える
 * 後で見る設定なら：1 聞く → 2 読む → 3 答える
 * 読み上げが使えない端末では「聞く」を飛ばす。
 */
interface SessionProps {
  material: Mat
  settings: Settings
  index: Map<string, string>
  ratio: number
  onExit: () => void
  onBack: () => void
  onDictation: () => void
}

/** 素材の内蔵音声の読み込みが終わってから、段階（「聞く」を入れるか）を決めて始める */
function InputSession(props: SessionProps) {
  const audio = useMaterialAudio(props.material.id)
  if (audio === undefined) return <p className="muted">音声を準備中…</p>
  return <InputSessionBody {...props} audio={audio} />
}

function InputSessionBody({ material, settings, index, ratio, onExit, onBack, onDictation, audio }: SessionProps & { audio: MaterialAudio | null }) {
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
  // 素材全体の音声ファイル（人の朗読・取り込んだ音声）→ 文ごとの内蔵音声（高品質な合成音声）→ 端末の声 の順に使う
  const whole = useWholeAudio(material.audioFile ?? material.audioBlob)
  const tts = !!whole || !!audio || speechSupported()
  const stages = useMemo(() => {
    const s: Exclude<Stage, 'done'>[] = []
    if (settings.questionsFirst && material.questions) s.push('preview')
    if (tts) s.push('listen')
    s.push('read', 'answer')
    return s
  }, [settings.questionsFirst, material.questions, tts])
  const [stage, setStage] = useState<Stage>(stages[0])
  const [rate, setRate] = useState(settings.phase <= 1 ? 0.8 : 1)
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [heard, setHeard] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const stop = useRef<() => void>(() => {})

  useEffect(() => () => stop.current(), [])

  useEffect(() => { if (whole?.ended) setHeard(true) }, [whole?.ended])

  const play = (from = Math.max(0, current)) => {
    if (whole) {
      whole.play(rate)
      return
    }
    stop.current()
    setPlaying(true)
    stop.current = playSentences({
      clips: audio?.clips,
      sentences, from, rate, voiceURI: settings.voiceURI,
      onIndex: setCurrent,
      onEnd: () => { setPlaying(false); setCurrent(-1); setHeard(true) },
    })
  }
  const pause = () => { whole?.pause(); stop.current(); setPlaying(false) }
  const next = () => {
    pause()
    const i = stages.indexOf(stage as Exclude<Stage, 'done'>)
    setStage(stages[i + 1] ?? 'done')
    window.scrollTo({ top: 0 })
  }

  const stepIndex = stage === 'done' ? stages.length : stages.indexOf(stage)
  const questionsFirst = stages.includes('preview')
  const guide: Record<Stage, string> = {
    preview: '聞く前に：この2つの答えを探しながら聞いてください',
    listen: questionsFirst
      ? '文字を見ずに、音声だけで聞きましょう。さっきの問いの答えを探しながら。'
      : '文字を見ずに、音声だけで聞きましょう。だいたいの内容がつかめればOK。',
    read: '今度は文字を読んで、聞き取れなかった所を確かめましょう。わからない語はタップ。',
    answer: material.questions ? '問いに答えましょう。' : 'どのくらい理解できたかを選びましょう。',
    done: 'おつかれさまでした。続けてディクテーションもできます。',
  }

  const questionsPeek = material.questions && (
    <div>
      <button className="link-btn" onClick={() => setShowQuestions(!showQuestions)}>
        {showQuestions ? '問いを隠す' : '問いをもう一度見る'}
      </button>
      {showQuestions && material.questions.map((q, i) => <p key={i} className="preview-q"><strong>Q{i + 1}.</strong> {q.q}</p>)}
    </div>
  )

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="link-btn" onClick={() => { pause(); onBack() }}>← 素材を選び直す</button>
        <FitBadge ratio={ratio} />
      </div>
      <Steps steps={stages.map((s) => STAGE_LABELS[s])} current={stepIndex} guide={guide[stage]} />

      <section className="card stack">
        <h2>{material.title}</h2>

        {stage === 'preview' && material.questions && (
          <>
            {material.questions.map((q, i) => (
              <div key={i} className="preview-q">
                <p><strong>Q{i + 1}.</strong> {q.q}</p>
                <p className="muted">選択肢：{q.options.join(' ／ ')}</p>
              </div>
            ))}
            <p className="muted">ここではまだ答えません。最後の「答える」で選びます。</p>
            <button className="btn block" onClick={next}>問いを覚えた → {STAGE_LABELS[stages[1]]}</button>
          </>
        )}

        {stage === 'listen' && whole && (
          <>
            <div className="row">
              {whole.playing
                ? <button className="btn" style={{ flex: 1 }} onClick={pause}>⏸ 一時停止</button>
                : <button className="btn" style={{ flex: 1 }} onClick={() => whole.play(rate)}>▶ {whole.time.now > 0 && !whole.ended ? '続きから' : heard ? 'もう一度聞く' : '再生'}</button>}
              <button className="btn secondary" onClick={() => whole.restart(rate)}>⏮ 最初から</button>
            </div>
            <div className="seg" aria-label="速さ">
              {RATES.map((r) => (
                <button key={r} aria-pressed={rate === r} onClick={() => { setRate(r); whole.setRate(r) }}>{r}倍</button>
              ))}
            </div>
            <p className="muted">{mmss(whole.time.now)}{whole.time.total ? ` / ${mmss(whole.time.total)}` : ''}・{material.wordCount}語</p>
            <p className="muted voice-note">🔈 声：{material.narrator ? `${material.narrator}（人の朗読）` : '取り込んだ音声'}</p>
            {questionsPeek}
            <button className={`btn block ${heard ? '' : 'secondary'}`} onClick={next}>
              {heard ? '聞き終えた → 読む' : '聞かずに読む →'}
            </button>
          </>
        )}

        {stage === 'listen' && !whole && (
          <>
            <div className="row">
              {playing
                ? <button className="btn" style={{ flex: 1 }} onClick={pause}>⏸ 一時停止</button>
                : <button className="btn" style={{ flex: 1 }} onClick={() => play()}>▶ {current > 0 ? '続きから' : heard ? 'もう一度聞く' : '再生'}</button>}
              <button className="btn secondary" onClick={() => play(0)}>⏮ 最初から</button>
            </div>
            <div className="seg" aria-label="速さ">
              {RATES.map((r) => (
                <button key={r} aria-pressed={rate === r} onClick={() => { setRate(r); if (playing) pause() }}>{r}倍</button>
              ))}
            </div>
            <p className="muted">{current >= 0 ? `${current + 1} / ${sentences.length} 文目` : `${sentences.length}文・${material.wordCount}語`}</p>
            <VoiceNote audio={audio} />
            {questionsPeek}
            <button className={`btn block ${heard ? '' : 'secondary'}`} onClick={next}>
              {heard ? '聞き終えた → 読む' : '聞かずに読む →'}
            </button>
          </>
        )}

        {stage === 'read' && (
          <>
            {tts && (
              <div className="row">
                <button className="btn secondary" onClick={() => ((whole ? whole.playing : playing) ? pause() : play())}>{(whole ? whole.playing : playing) ? '⏸ 止める' : '🔊 読みながら聞く'}</button>
                {!whole && <span className="muted">文をダブルタップするとそこから再生</span>}
              </div>
            )}
            <MaterialText sentences={sentences} breaks={breaks} current={current} index={index} settings={settings}
              onSentence={tts && !whole ? (i) => play(i) : undefined} />
            {material.moral && <p className="moral">Moral: {material.moral}</p>}
            {questionsPeek}
            <button className="btn block" onClick={next}>読み終えた → 答える</button>
          </>
        )}

        {stage === 'answer' && (
          material.questions ? (
            <QuestionsPanel questions={material.questions} onDone={(score) => {
              result.current.comprehension = score
              setTimeout(() => setStage('done'), 1200)
            }} />
          ) : (
            <div className="stack">
              <p>取り込んだ素材には問いがありません。どのくらい理解できましたか？</p>
              <div className="seg">
                {['ほぼ全部', '大体', '半分くらい', 'ほとんど分からない'].map((label, i) => (
                  <button key={label} onClick={() => {
                    // 自己評価は内容確認の正答率とは別に記録する（グラフには含めない）
                    result.current.selfUnderstanding = 1 - i / 3
                    setStage('done')
                  }}>{label}</button>
                ))}
              </div>
            </div>
          )
        )}

        {stage === 'done' && (
          <div className="stack">
            {material.questions && (
              <p className="banner ok">内容確認：{Math.round((result.current.comprehension ?? 0) * material.questions.length)} / {material.questions.length} 問 正解</p>
            )}
            <p className="muted">出典：{material.source}{material.sourceUrl && <> （<a href={material.sourceUrl} target="_blank" rel="noreferrer">元の文章</a>・{material.license}）</>}</p>
            <SummaryCheck material={material} settings={settings} />
            <button className="btn block" onClick={onDictation}>✍️ この素材でディクテーション（3文）</button>
            <button className="btn secondary block" onClick={() => setStage('read')}>もう一度読む</button>
            <button className="btn secondary block" onClick={onExit}>今日の画面に戻る</button>
          </div>
        )}
      </section>
      {stage !== 'done' && <button className="btn secondary block" onClick={() => { pause(); onExit() }}>ここでやめる</button>}
    </div>
  )
}

/** 内容を英語で2〜3文に要約し、Claude に理解が合っているかを確かめてもらう（取り込んだ素材は問いがないので特に） */
function SummaryCheck({ material, settings }: { material: Mat; settings: Settings }) {
  const [open, setOpen] = useState(material.kind === 'mine')
  const [summary, setSummary] = useState('')
  const [level, setLevel] = useState<Level | null>(null)
  useEffect(() => { void currentLevel(settings.phase).then(setLevel) }, [settings.phase])
  if (!open) return <button className="btn secondary block" onClick={() => setOpen(true)}>📝 英語で要約して Claude に確かめてもらう</button>
  return (
    <div className="stack">
      <label className="field">
        <span>内容を英語で2〜3文に要約しましょう</span>
        <textarea className="paste-area" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="This text is about ..." />
      </label>
      {summary.trim().split(/\s+/).length >= 5 && level && (
        <ClaudePromptBox label="要約を Claude に確かめてもらう（依頼文をコピー）"
          prompt={summaryPrompt({ level, title: material.title, body: material.body, summary })} />
      )}
    </div>
  )
}
