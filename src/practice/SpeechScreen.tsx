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

const STEPS = ['話題と準備', '4分', '3分', '2分', 'ふり返り']
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

interface Take {
  blob: Blob | null
  seconds: number
  transcript?: string | null
  wpm?: number
}

/** 4/3/2スピーチ：同じ話を4分 → 3分 → 2分で3回話す */
export function SpeechScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const [mic, setMic] = useState<boolean | null>(null)
  return (
    <div>
      <div className="practice-top"><HelpButton k="speech" settings={settings} /></div>
      {mic === null ? (
        <>
          <MicGate title="4/3/2スピーチ" lead="同じ話を4分 → 3分 → 2分と、時間を縮めて3回話します。全部で10分ほどです。" onReady={setMic} />
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </>
      ) : <Speech settings={settings} mic={mic} onExit={onExit} />}
    </div>
  )
}

function Speech({ settings, mic, onExit }: { settings: Settings; mic: boolean; onExit: () => void }) {
  const topics = useMemo(() => TOPICS.filter((t) => t.minPhase <= settings.phase), [settings.phase])
  const [topic, setTopic] = useState<Topic>(() => topics[Math.floor(Math.random() * topics.length)])
  const result = useSessionTimer('fluency', 'fluency', undefined, `speech:${topic.id}`)
  const [step, setStep] = useState(0)
  const [takes, setTakes] = useState<Take[]>([])
  const [self, setSelf] = useState<number | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const transcriber = useTranscriber(settings)

  const finishRound = (take: Take) => {
    const next = [...takes, take]
    setTakes(next)
    playChime()
    setStep(step + 1)
    window.scrollTo({ top: 0 })
  }

  const rate = async (v: number) => {
    setSelf(v)
    result.current.speechSelf = v
    // 録音を保存し、音声認識が使えれば語数を数えて1分あたりの語数を出す
    setAnalyzing(true)
    const analyzed: Take[] = []
    for (const [i, t] of takes.entries()) {
      let transcript: string | null = null
      if (t.blob && t.blob.size) {
        transcript = await transcriber.run(t.blob)
        await db.recordings.add({
          sessionId: 0, audio: t.blob, at: Date.now(), kind: 'speech', ref: topic.id, text: topic.en,
          self: v, seconds: t.seconds, round: i + 1, transcript: transcript ?? undefined,
        })
      }
      analyzed.push({ ...t, transcript, wpm: transcript ? wordsPerMinute(transcript, t.seconds) : undefined })
    }
    setTakes(analyzed)
    const last = analyzed.at(-1)
    if (last?.wpm) result.current.speakingWpm = last.wpm
    setAnalyzing(false)
  }

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
            <SelfRating question="先に自分で評価：3回目（2分）は、1回目よりなめらかに話せましたか？" onRate={(v) => void rate(v)} />
          ) : (
            <>
              {analyzing && <p className="muted">録音を保存し、文字にしています…（長い録音は少し時間がかかります）</p>}
              <table className="viz-table">
                <thead><tr><th>回</th><th>話した時間</th><th>1分あたりの語数</th><th>録音</th></tr></thead>
                <tbody>
                  {takes.map((t, i) => (
                    <tr key={i}>
                      <td>{['4分', '3分', '2分'][i]}</td>
                      <td>{fmt(t.seconds)}</td>
                      <td>{t.wpm ?? (transcriber.enabled ? (analyzing ? '…' : '—') : '—')}</td>
                      <td>{t.blob && t.blob.size > 0 ? <PlayBlobButton blob={t.blob} label="▶" /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!transcriber.enabled && <p className="muted">設定で音声認識を有効にすると、1分あたりの語数を自動で数えます。</p>}
              {takes.some((t) => t.transcript) && (
                <details>
                  <summary>3回目に話した内容（音声認識の結果）</summary>
                  <p className="muted">{takes.at(-1)?.transcript}</p>
                </details>
              )}
              <p className="muted">回を重ねて語数が増えていれば、流暢さが伸びています。Claude に添削してもらう依頼文は開発フェーズ6で追加します。</p>
              {!analyzing && <button className="btn block" onClick={onExit}>今日の画面に戻る</button>}
            </>
          )}
        </section>
      )}
    </div>
  )
}

/** 1回分：残り時間を表示しながら録音する。時間になったら自動で止める */
function Round({ seconds, mic, topic, onDone }: { seconds: number; mic: boolean; topic: Topic; onDone: (t: Take) => void }) {
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
    onDone({ blob, seconds: elapsed })
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
