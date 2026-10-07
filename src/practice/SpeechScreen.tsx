import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { startRecording, type Recording } from '../speech/recorder'
import { speak } from '../speech/voices'
import { MicGate, PlayBlobButton, SelfRating, useTranscriber } from './SpeakParts'
import { SPEECH_ROUNDS, TOPICS, wordsPerMinute, type Topic } from './speaking'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { playChime } from '../rewards/sound'
import { ClaudePromptBox } from './ClaudePromptBox'
import { useWeakFocus } from '../notes/hooks'
import type { FeedbackLink } from '../notes/ImportScreen'
import { correctionPrompt, type Level } from './claudePrompts'
import { currentLevel } from './output'

const STEPS = ['話題と準備', '4分', '3分', '2分', 'ふり返り']
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

interface Take {
  blob: Blob | null
  seconds: number
  /** 音声認識の状態：waiting（順番待ち）・running（計算中）・done・error・off（認識を使わない） */
  status: 'waiting' | 'running' | 'done' | 'error' | 'off'
  transcript?: string
  wpm?: number
  error?: string
}

/** 4/3/2スピーチ：同じ話を4分 → 3分 → 2分で3回話す */
export function SpeechScreen({ settings, onExit, onImport }: { settings: Settings; onExit: () => void; onImport: (link: FeedbackLink) => void }) {
  const focus = useWeakFocus()
  const [mic, setMic] = useState<boolean | null>(null)
  return (
    <div>
      <div className="practice-top"><HelpButton k="speech" settings={settings} /></div>
      {mic === null ? (
        <>
          <MicGate title="4/3/2スピーチ" lead="同じ話を4分 → 3分 → 2分と、時間を縮めて3回話します。全部で10分ほどです。" onReady={setMic} />
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </>
      ) : <Speech settings={settings} mic={mic} onExit={onExit} focus={focus} onImport={onImport} />}
    </div>
  )
}

function Speech({ settings, mic, onExit, focus, onImport }: { settings: Settings; mic: boolean; onExit: () => void; focus: string[]; onImport: (link: FeedbackLink) => void }) {
  const topics = useMemo(() => TOPICS.filter((t) => t.minPhase <= settings.phase), [settings.phase])
  const [topic, setTopic] = useState<Topic>(() => topics[Math.floor(Math.random() * topics.length)])
  const result = useSessionTimer('fluency', 'fluency', undefined, `speech:${topic.id}`)
  const [step, setStep] = useState(0)
  const [takes, setTakes] = useState<Take[]>([])
  const [self, setSelf] = useState<number | null>(null)
  const transcriber = useTranscriber(settings)
  const [level, setLevel] = useState<Level | null>(null)
  useEffect(() => { void currentLevel(settings.phase).then(setLevel) }, [settings.phase])
  const queue = useRef(Promise.resolve())
  const saved = useRef(false)

  const update = (i: number, patch: Partial<Take>) => setTakes((ts) => ts.map((t, k) => (k === i ? { ...t, ...patch } : t)))

  /**
   * 話し終えた回から順に、裏で文字にしていく（自己評価をしている間に計算が進む）。
   * 結果は自己評価の後に表示する（先に自分の耳で判断するため）。
   */
  const analyze = (i: number, take: Take) => {
    queue.current = queue.current.then(async () => {
      if (take.status === 'off') return
      update(i, { status: 'running' })
      const r = await transcriber.run(take.blob!)
      if (r?.ok) update(i, { status: 'done', transcript: r.text, wpm: wordsPerMinute(r.text, take.seconds) })
      else update(i, { status: 'error', error: r && !r.ok ? r.reason : '音声認識が無効です' })
    })
  }

  const finishRound = (blob: Blob | null, seconds: number) => {
    const hasAudio = !!blob && blob.size > 0
    const take: Take = { blob, seconds, status: hasAudio && transcriber.enabled ? 'waiting' : 'off' }
    const i = takes.length
    setTakes((ts) => [...ts, take])
    analyze(i, take)
    playChime()
    setStep(step + 1)
    window.scrollTo({ top: 0 })
  }

  // 自己評価の後、全部の回の計算が終わったら録音を保存し、3回目の語数を記録する
  const allSettled = takes.length === 3 && takes.every((t) => t.status === 'done' || t.status === 'error' || t.status === 'off')
  useEffect(() => {
    if (self === null || !allSettled || saved.current) return
    saved.current = true
    void (async () => {
      for (const [i, t] of takes.entries()) {
        if (!t.blob || !t.blob.size) continue
        await db.recordings.add({
          sessionId: 0, audio: t.blob, at: Date.now(), kind: 'speech', ref: topic.id, text: topic.en,
          self, seconds: t.seconds, round: i + 1, transcript: t.transcript,
        })
      }
      const last = takes[2]
      if (last.wpm) result.current.speakingWpm = last.wpm
    })()
  }, [self, allSettled, takes, topic, result])

  const wpmCell = (t: Take) => {
    if (t.status === 'done') return <strong>{t.wpm}</strong>
    if (t.status === 'running') return <span className="muted">計算中…</span>
    if (t.status === 'waiting') return <span className="muted">順番待ち</span>
    if (t.status === 'error') return <span className="err">失敗</span>
    return <span className="muted">—</span>
  }
  const running = takes.findIndex((t) => t.status === 'running')
  const errors = takes.map((t, i) => (t.status === 'error' ? `${['4分', '3分', '2分'][i]}：${t.error}` : null)).filter(Boolean)

  return (
    <div>
      <Steps steps={STEPS} current={step}
        guide={[
          '話題を決めて、話す内容を1分ほど考えましょう（メモは単語だけ）。',
          '4分間、止まらずに話し続けましょう。',
          '同じ内容を3分で。言い方を短く、なめらかに。',
          '同じ内容を2分で。いちばん速く、なめらかに。',
          '先に自分で評価してから、1回目と3回目を聞き比べましょう。',
        ][step]} />

      {step === 0 && (
        <section className="card stack">
          <p className="topic-en">{topic.en}</p>
          <p className="muted">{topic.ja}</p>
          <div className="row">
            <button className="btn secondary" onClick={() => speak(topic.en, settings.voiceURI)}>🔊 話題を聞く</button>
            <button className="btn secondary" onClick={() => setTopic(topics[(topics.indexOf(topic) + 1) % topics.length])}>別の話題</button>
          </div>
          <p className="muted">話す順番の例：① 結論や全体 ② 理由や具体例を2つ ③ まとめ</p>
          <button className="btn block" onClick={() => setStep(1)}>準備できた → 4分で話す</button>
          <button className="btn secondary block" onClick={onExit}>やめる</button>
        </section>
      )}

      {step >= 1 && step <= 3 && (
        <Round key={step} seconds={SPEECH_ROUNDS[step - 1]} mic={mic} topic={topic} onDone={finishRound} />
      )}

      {step === 4 && (
        <section className="card stack">
          <p className="topic-en">{topic.en}</p>
          {self === null ? (
            <>
              <SelfRating question="先に自分で評価：3回目（2分）は、1回目よりなめらかに話せましたか？" onRate={(v) => { setSelf(v); result.current.speechSelf = v }} />
              {running >= 0 && <p className="muted">（裏で録音を文字にしています：{running + 1} / 3 回目）</p>}
            </>
          ) : (
            <>
              <table className="viz-table">
                <thead><tr><th>回</th><th>話した時間</th><th>1分あたりの語数</th><th>録音</th></tr></thead>
                <tbody>
                  {takes.map((t, i) => (
                    <tr key={i}>
                      <td>{['4分', '3分', '2分'][i]}</td>
                      <td>{fmt(t.seconds)}</td>
                      <td>{wpmCell(t)}</td>
                      <td>{t.blob && t.blob.size > 0 ? <PlayBlobButton blob={t.blob} label="▶" /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {running >= 0 && (
                <p className="banner info">計算中：{running + 1} / 3 回目の録音を文字にしています。1回あたり数十秒かかることがあります。この画面のままお待ちください。</p>
              )}
              {errors.length > 0 && (
                <div className="banner warn">
                  語数を出せなかった回があります。
                  <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
              {!transcriber.enabled && <p className="muted">設定で音声認識を有効にすると、1分あたりの語数を自動で数えます。</p>}
              {!mic && <p className="muted">録音なしで練習したため、語数は数えていません。</p>}
              {takes[2]?.transcript && (
                <details>
                  <summary>3回目に話した内容（音声認識の結果）</summary>
                  <p className="muted">{takes[2].transcript}</p>
                </details>
              )}
              <p className="muted">回を重ねて語数が増えていれば、流暢さが伸びています。</p>
              {takes[2]?.transcript && level && (
                <ClaudePromptBox label="3回目の話を Claude に添削してもらう（依頼文をコピー）"
                  prompt={correctionPrompt({ level, text: takes[2].transcript, kind: 'speech', topic: topic.en, focus })}
                  onImport={() => onImport({ source: 'speech' })} />
              )}
              <button className="btn block" disabled={!allSettled} onClick={onExit}>
                {allSettled ? '今日の画面に戻る' : '計算が終わるまでお待ちください'}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  )
}

/** 1回分：残り時間を表示しながら録音する。時間になったら自動で止める */
function Round({ seconds, mic, topic, onDone }: { seconds: number; mic: boolean; topic: Topic; onDone: (blob: Blob | null, seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  const rec = useRef<Recording | null>(null)
  const done = useRef(false)

  const finish = async () => {
    if (done.current) return
    done.current = true
    const elapsed = Math.min(seconds, (Date.now() - startedAt) / 1000)
    const blob = rec.current ? await rec.current.stop() : null
    rec.current = null
    onDone(blob, elapsed)
  }

  useEffect(() => {
    if (!startedAt) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() - startedAt >= seconds * 1000) void finish()
    }, 250)
    return () => window.clearInterval(t)
  })
  useEffect(() => () => rec.current?.cancel(), [])

  const left = startedAt ? Math.max(0, seconds - (now - startedAt) / 1000) : seconds
  return (
    <section className="card stack" style={{ textAlign: 'center' }}>
      <p className="topic-en">{topic.en}</p>
      <div className={`timer${left < 15 && startedAt ? ' ending' : ''}`}>{fmt(left)}</div>
      {!startedAt ? (
        <button className="btn block" onClick={async () => {
          if (mic) {
            try { rec.current = await startRecording() } catch { rec.current = null }
          }
          const t = Date.now()
          setStartedAt(t)
          setNow(t)
        }}>{mic ? '🎙 話し始める（録音）' : '▶ 話し始める（録音なし）'}</button>
      ) : (
        <>
          {rec.current && <p className="muted rec-dot">● 録音中</p>}
          <button className="btn secondary block" onClick={() => void finish()}>早めに終える</button>
        </>
      )}
    </section>
  )
}
