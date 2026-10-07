import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Assessment, type Recording, type Settings } from '../db/schema'
import { useNgsl } from '../content/ngsl'
import { useMaterials, useReadLog, type Mat } from '../content/materials'
import { materialClips, playFile } from '../speech/clips'
import { playText } from '../speech/audioBank'
import { countWords } from '../speech/sentences'
import { diffWords } from '../practice/dictationScore'
import { QuestionsPanel, ratioOf, useKnowledge } from '../practice/ReadingParts'
import { MicGate, PlayBlobButton, RecordButton, useTranscriber } from '../practice/SpeakParts'
import { wordStats } from '../practice/output'
import { useSessionTimer } from '../practice/useSessionTimer'
import { HelpButton } from '../practice/PracticeHelp'
import { Steps } from '../ui/Steps'
import { dayKey } from '../today/menu'
import { weeklyPillars } from '../progress/stats'
import { buildDiagnostic, scoreDiagnostic, type DiagnosticAnswer } from './diagnostic'
import { ASSESS_TOPICS, ASSESS_WRITING, declineReasons, METRICS, pickUnseenReading, pickUnseenSentences } from './periodic'

const STEPS = ['語彙', '聞き取り', '速読', '1分スピーチ', '5分作文', '結果']

/** 4週間ごとの測定（約20分）。毎回同じ形式で、前回と並べて表示する */
export function AssessmentScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const { data } = useNgsl()
  const materials = useMaterials()
  const knowledge = useKnowledge()
  const log = useReadLog()
  const count = useLiveQuery(() => db.assessments.where('kind').equals('periodic').count(), [], 0)
  const [started, setStarted] = useState(false)
  const [mic, setMic] = useState<boolean | null>(null)

  if (!data || !materials || !knowledge) return <p className="muted">準備中…</p>
  if (!started) {
    return (
      <div>
        <div className="practice-top"><HelpButton k="assessment" settings={settings} /></div>
        <Steps steps={STEPS} current={-1} guide="約20分。途中でやめるとこの回は記録されません。静かな場所で、時間に余裕があるときに始めましょう。" />
        <section className="card stack">
          <h2>4週間ごとの測定（{count + 1}回目）</h2>
          <ol className="steps">
            <li>語彙：英単語60個に「知っている・知らない」で答える（約4分）</li>
            <li>聞き取り：初めて聞く英文5文のディクテーション（約4分）</li>
            <li>速読：初めての文章を読んで、内容確認の問いに答える（約3分）</li>
            <li>1分スピーチ：テーマについて1分話して録音（約2分）</li>
            <li>5分作文：テーマについて5分で書く（5分）</li>
          </ol>
          {mic === null
            ? <MicGate title="始める前に" lead="1分スピーチで録音を使います。" onReady={(m) => { setMic(m); setStarted(true) }} />
            : null}
        </section>
        <button className="btn secondary block" onClick={onExit}>戻る</button>
      </div>
    )
  }
  return <Run settings={settings} mic={!!mic} words={data.words} materials={materials} knowledge={knowledge} log={log} round={count} onExit={onExit} />
}

function Run({ settings, mic, words, materials, knowledge, log, round, onExit }: {
  settings: Settings
  mic: boolean
  words: Parameters<typeof buildDiagnostic>[0]
  materials: Mat[]
  knowledge: NonNullable<ReturnType<typeof useKnowledge>>
  log: Map<string, number>
  round: number
  onExit: () => void
}) {
  useSessionTimer('assessment', 'language')
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<Assessment>({ at: Date.now(), kind: 'periodic' })
  const plan = useMemo(() => {
    const sentences = pickUnseenSentences(materials, log, 5)
    const reading = pickUnseenReading(materials.map((m) => ({ m, ratio: ratioOf(m, knowledge).ratio })), log, new Set(sentences.map((s) => s.materialId)))
    return {
      vocab: buildDiagnostic(words),
      sentences,
      reading,
      topic: ASSESS_TOPICS[round % ASSESS_TOPICS.length],
      writing: ASSESS_WRITING[round % ASSESS_WRITING.length],
    }
    // 測定の内容は始めた時点で決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const next = (patch: Partial<Assessment>) => {
    setResult((r) => ({ ...r, ...patch }))
    setStep((s) => s + 1)
    window.scrollTo({ top: 0 })
  }
  const guides = [
    '日本語で意味が言えるなら「知っている」。実在しない単語も混ざっています。',
    '音声を聞いて、聞こえた英文を書きましょう（何度聞いてもOK）。',
    '「読み始める」で時間を計ります。戻り読みせずに読み、問いに答えましょう。',
    'テーマについて1分間、止まらずに話しましょう。',
    'テーマについて5分間で、できるだけたくさん書きましょう。',
    '前回と比べてみましょう。',
  ]
  return (
    <div>
      <Steps steps={STEPS} current={step} guide={guides[step]} />
      {step === 0 && <VocabPart questions={plan.vocab} onDone={(v) => next({ vocabSize: v })} />}
      {step === 1 && <DictationPart sentences={plan.sentences} settings={settings} onDone={(v) => next({ dictation: v })} />}
      {step === 2 && (plan.reading
        ? <ReadingPart material={plan.reading} onDone={(wpm, acc) => next({ readingWpm: wpm, readingAccuracy: acc })} />
        : <section className="card"><p>使える文章がありませんでした。</p><button className="btn" onClick={() => next({})}>次へ</button></section>)}
      {step === 3 && <SpeechPart topic={plan.topic} mic={mic} settings={settings} onDone={(wpm) => next(wpm ? { speakingWpm: wpm } : {})} />}
      {step === 4 && <WritingPart topic={plan.writing} onDone={(w, t) => next({ writingWords: w, writingTypes: t })} />}
      {step === 5 && <Results result={result} onExit={onExit} />}
      {step < 5 && <button className="btn secondary block" onClick={onExit}>やめる（この回は記録しません）</button>}
    </div>
  )
}

function VocabPart({ questions, onDone }: { questions: ReturnType<typeof buildDiagnostic>; onDone: (vocab: number) => void }) {
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([])
  const q = questions[answers.length]
  const answer = (known: boolean) => {
    const next = [...answers, { ...q, known }]
    if (next.length === questions.length) onDone(scoreDiagnostic(next).vocabSize)
    else setAnswers(next)
  }
  if (!q) return null
  return (
    <section className="card stack" style={{ textAlign: 'center' }}>
      <p className="muted">{answers.length + 1} / {questions.length}</p>
      <div className="progress"><div style={{ width: `${(answers.length / questions.length) * 100}%` }} /></div>
      <p className="headword" style={{ margin: '28px 0' }}>{q.word}</p>
      <div className="row">
        <button className="btn secondary" style={{ flex: 1 }} onClick={() => answer(false)}>知らない</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => answer(true)}>知っている</button>
      </div>
    </section>
  )
}

function DictationPart({ sentences, settings, onDone }: { sentences: { text: string; materialId: string }[]; settings: Settings; onDone: (score: number) => void }) {
  const [i, setI] = useState(0)
  const [text, setText] = useState('')
  const [scores, setScores] = useState<number[]>([])
  const [clips, setClips] = useState<Record<string, Record<string, string>>>({})
  useEffect(() => {
    void Promise.all(sentences.map(async (s) => [s.materialId, (await materialClips(s.materialId))?.clips ?? {}] as const))
      .then((list) => setClips(Object.fromEntries(list)))
  }, [sentences])
  const s = sentences[i]
  if (!s) return null
  const listen = (rate: number) => {
    const file = clips[s.materialId]?.[s.text]
    if (file) playFile(file, rate)
    else playText({ text: s.text, voiceURI: settings.voiceURI, rate })
  }
  const submit = () => {
    const next = [...scores, diffWords(s.text, text).score]
    setText('')
    if (next.length === sentences.length) onDone(next.reduce((a, b) => a + b, 0) / next.length)
    else { setScores(next); setI(i + 1) }
  }
  return (
    <section className="card stack">
      <p className="muted">{i + 1} / {sentences.length}（答え合わせは最後にまとめて行います）</p>
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => listen(1)}>🔊 聞く</button>
        <button className="btn secondary" onClick={() => listen(0.8)}>🐢 ゆっくり</button>
      </div>
      <textarea className="dictation-input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="聞こえた英文" />
      <button className="btn block" disabled={!text.trim()} onClick={submit}>{i + 1 < sentences.length ? '次の文へ' : '聞き取りを終える'}</button>
    </section>
  )
}

function ReadingPart({ material, onDone }: { material: Mat; onDone: (wpm: number | undefined, accuracy: number) => void }) {
  const [startedAt, setStartedAt] = useState(0)
  const [wpm, setWpm] = useState<number | null>(null)
  if (!startedAt) {
    return (
      <section className="card stack" style={{ textAlign: 'center' }}>
        <p>{countWords(material.body)}語の文章です。</p>
        <button className="btn block" onClick={() => setStartedAt(Date.now())}>▶ 読み始める</button>
      </section>
    )
  }
  if (wpm === null) {
    return (
      <section className="card stack">
        <h2>{material.title}</h2>
        <div className="speed-text">{material.body.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}</div>
        <button className="btn block" onClick={() => setWpm(Math.round(countWords(material.body) / Math.max((Date.now() - startedAt) / 60000, 0.05)))}>読み終えた</button>
      </section>
    )
  }
  return (
    <section className="card stack">
      <p>1分あたり {wpm} 語</p>
      <QuestionsPanel questions={material.questions!} onDone={(acc) => setTimeout(() => onDone(wpm <= 500 ? wpm : undefined, acc), 1200)} />
    </section>
  )
}

function SpeechPart({ topic, mic, settings, onDone }: { topic: string; mic: boolean; settings: Settings; onDone: (wpm?: number) => void }) {
  const transcriber = useTranscriber(settings)
  const previous = useLiveQuery(() => db.recordings.where('kind').equals('assessment').reverse().sortBy('at'), [], [] as Recording[])
  const [state, setState] = useState<'ready' | 'running' | 'done'>('ready')
  const [info, setInfo] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const wpm = useRef<number | undefined>(undefined)
  const done = async (b: Blob, seconds: number) => {
    setBlob(b)
    setState('running')
    const r = await transcriber.run(b)
    if (r?.ok) {
      wpm.current = Math.round((wordStats(r.text).words / Math.max(seconds, 1)) * 60)
      setInfo(`1分あたり ${wpm.current} 語`)
    } else setInfo(r && !r.ok ? `語数を数えられませんでした：${r.reason}` : '音声認識を有効にすると、1分あたりの語数を数えます。')
    await db.recordings.add({ sessionId: 0, audio: b, at: Date.now(), kind: 'assessment', ref: topic, text: topic, transcript: r?.ok ? r.text : undefined, seconds })
    setState('done')
  }
  return (
    <section className="card stack">
      <p className="topic-en">{topic}</p>
      {state === 'ready' && (mic
        ? <RecordButton maxSeconds={60} label="🎙 話し始める（1分で自動で止まる）" onDone={(b, s) => void done(b, s)} />
        : <><p className="muted">録音できない端末です。1分話してから次へ進みましょう。</p><button className="btn" onClick={() => onDone()}>次へ</button></>)}
      {state === 'running' && <p className="banner info">計算中：録音を文字にしています…</p>}
      {state === 'done' && (
        <>
          <p>{info}</p>
          <div className="row">
            {blob && <PlayBlobButton blob={blob} label="▶ 今回の録音" />}
            {previous[0] && <PlayBlobButton blob={previous[previous.length > 1 ? 1 : 0].audio} label="▶ 前回の録音" />}
          </div>
          <p className="muted">前回の自分の声と聞き比べてみましょう。</p>
          <button className="btn block" onClick={() => onDone(wpm.current)}>次へ</button>
        </>
      )}
    </section>
  )
}

function WritingPart({ topic, onDone }: { topic: string; onDone: (words: number, types: number) => void }) {
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  const [text, setText] = useState('')
  const finished = useRef(false)
  const finish = async () => {
    if (finished.current) return
    finished.current = true
    const s = wordStats(text)
    await db.journal.add({ at: Date.now(), day: dayKey(), kind: 'assessment', text, prompt: topic, targets: [], used: [], words: s.words, types: s.types })
    onDone(s.words, s.types)
  }
  useEffect(() => {
    if (!startedAt) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() - startedAt >= 5 * 60_000) void finish()
    }, 500)
    return () => window.clearInterval(t)
  })
  const left = startedAt ? Math.max(0, 300 - (now - startedAt) / 1000) : 300
  return (
    <section className="card stack">
      <p className="topic-en">{topic}</p>
      <div className="timer" style={{ fontSize: '2rem', textAlign: 'center' }}>{Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')}</div>
      {!startedAt
        ? <button className="btn block" onClick={() => { const t = Date.now(); setStartedAt(t); setNow(t) }}>▶ 書き始める（5分）</button>
        : (
          <>
            <textarea className="paste-area" rows={10} value={text} onChange={(e) => setText(e.target.value)} autoFocus spellCheck={false} />
            <p className="muted">{wordStats(text).words}語</p>
            <button className="btn secondary block" onClick={() => void finish()}>早めに終える</button>
          </>
        )}
    </section>
  )
}

function Results({ result, onExit }: { result: Assessment; onExit: () => void }) {
  const [saved, setSaved] = useState<{ prev?: Assessment; reasons: ReturnType<typeof declineReasons> } | null>(null)
  useEffect(() => {
    void (async () => {
      const prev = (await db.assessments.where('kind').equals('periodic').sortBy('at')).at(-1)
      await db.assessments.add({ ...result, at: Date.now() })
      const today = dayKey()
      const sessions = await db.sessions.toArray()
      const weeks = weeklyPillars(sessions, today, 4)
      const since = Date.now() - 28 * 86_400_000
      const days = new Set(sessions.filter((s) => s.at >= since && s.seconds > 0).map((s) => s.day)).size
      setSaved({ prev, reasons: declineReasons(result, prev, weeks, days) })
    })()
    // 結果は一度だけ保存する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!saved) return <p className="muted">保存中…</p>
  return (
    <section className="card stack">
      <h2>測定の結果</h2>
      <div className="viz-table-wrap">
        <table className="viz-table">
          <thead><tr><th>項目</th><th>前回</th><th>今回</th></tr></thead>
          <tbody>
            {METRICS.map((m) => {
              const a = result[m.key]
              const b = saved.prev?.[m.key]
              const up = typeof a === 'number' && typeof b === 'number' && a > b * 1.05
              return (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td>{typeof b === 'number' ? m.format(b) : '—'}</td>
                  <td>{typeof a === 'number' ? m.format(a) : '—'}{up ? ' ↑' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!saved.prev && <p className="muted">初めての測定です。次の測定（4週間後）から、前回と比べられます。</p>}
      {saved.reasons.map((r) => (
        <div key={r.key} className="banner warn">
          <strong>{r.label}が下がりました。原因の候補：</strong>
          <ul>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ))}
      <button className="btn block" onClick={onExit}>今日の画面に戻る</button>
    </section>
  )
}
