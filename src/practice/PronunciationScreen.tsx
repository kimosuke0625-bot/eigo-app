import { useEffect, useMemo, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { speak, speechSupported, useEnglishVoices } from '../speech/voices'
import { MicGate, PlayBlobButton, RecordButton, SelfRating } from './SpeakParts'
import { buildTrials, PAIR_GROUPS, weakestGroup, type Trial } from './speaking'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { playCorrect, playTry } from '../rewards/sound'

const TRIALS = 16
const groupOf = (key: string) => PAIR_GROUPS.find((g) => g.key === key)!

/** これまでの聞き分けの結果（グループごと） */
async function loadPairStats(): Promise<Map<string, { ok: number; all: number }>> {
  const stats = new Map<string, { ok: number; all: number }>()
  for (const s of await db.sessions.where('kind').equals('pronunciation').toArray()) {
    for (const g of PAIR_GROUPS) {
      const all = s.result?.[`n_${g.key}`] ?? 0
      if (!all) continue
      const cur = stats.get(g.key) ?? { ok: 0, all: 0 }
      stats.set(g.key, { ok: cur.ok + (s.result?.[`ok_${g.key}`] ?? 0), all: cur.all + all })
    }
  }
  return stats
}

/** 発音・聞き分けドリル（1回5分）：聞き分け16問 → 苦手な組を言ってみる */
export function PronunciationScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const [mic, setMic] = useState<boolean | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => { void loadPairStats().then((s) => setFocus(weakestGroup(s))) }, [])
  if (!speechSupported()) {
    return (
      <section className="card stack">
        <h2>発音・聞き分けドリル</h2>
        <p>この端末のブラウザは読み上げに対応していないため、このドリルはできません。</p>
        <button className="btn secondary block" onClick={onExit}>戻る</button>
      </section>
    )
  }
  return (
    <div>
      <div className="practice-top"><HelpButton k="pronunciation" settings={settings} /></div>
      {mic === null || !focus ? (
        <>
          <MicGate title="発音・聞き分けドリル（5分）"
            lead={`似た音の聞き分け${TRIALS}問のあと、苦手な組を自分で言ってみます。${focus ? `今回は「${groupOf(focus).label}」から始めます。` : ''}`}
            onReady={setMic} />
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </>
      ) : <Drill settings={settings} mic={mic} focus={focus} onExit={onExit} />}
    </div>
  )
}

function Drill({ settings, mic, focus, onExit }: { settings: Settings; mic: boolean; focus: string; onExit: () => void }) {
  const result = useSessionTimer('pronunciation', 'language')
  const trials = useMemo<Trial[]>(() => buildTrials(focus, TRIALS), [focus])
  const voices = useEnglishVoices()
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<(0 | 1)[]>([])
  const [voiceURI, setVoiceURI] = useState(settings.voiceURI)
  const [stage, setStage] = useState<'listen' | 'say' | 'done'>('listen')

  // 複数の声で出題する（端末に入っている英語の声から毎回選ぶ）
  const playTrial = (t: Trial) => {
    const v = voices.length ? voices[Math.floor(Math.random() * voices.length)].voiceURI : settings.voiceURI
    setVoiceURI(v)
    speak(t.pair[t.answer], v, t.rate)
  }

  const trial = trials[i]
  const answered = answers.length > i
  const choose = (c: 0 | 1) => {
    if (answered) return
    const next = [...answers, c]
    setAnswers(next)
    const ok = c === trial.answer
    if (ok) playCorrect(1)
    else playTry()
    // グループごとの正答数を記録
    result.current[`n_${trial.group}`] = (result.current[`n_${trial.group}`] ?? 0) + 1
    result.current[`ok_${trial.group}`] = (result.current[`ok_${trial.group}`] ?? 0) + (ok ? 1 : 0)
    result.current.discrimination = next.filter((a, k) => a === trials[k].answer).length / next.length
  }

  // この回でいちばん間違えたグループ（なければ最初の組）
  const sessionWeak = useMemo(() => {
    const miss = new Map<string, number>()
    answers.forEach((a, k) => { if (a !== trials[k].answer) miss.set(trials[k].group, (miss.get(trials[k].group) ?? 0) + 1) })
    return [...miss].sort((a, b) => b[1] - a[1])[0]?.[0] ?? focus
  }, [answers, trials, focus])

  const correct = answers.filter((a, k) => a === trials[k].answer).length

  return (
    <div>
      <Steps steps={['聞き分ける', '言ってみる']} current={stage === 'listen' ? 0 : stage === 'say' ? 1 : 2}
        guide={stage === 'listen'
          ? (answered ? '答えを確かめたら、次へ進みましょう。両方の音を聞き比べてもOK。' : '🔊で聞いて、聞こえた語を選びましょう。何度聞いてもOK。')
          : stage === 'say' ? 'ヒントを読み、手本を聞いてから、2つの語を順番に言って録音しましょう。' : 'おつかれさまでした。1日2回（朝と夜など）に分けると効果的です。'} />

      {stage === 'listen' && trial && (
        <section className="card stack" style={{ textAlign: 'center' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">{i + 1} / {trials.length}</span>
            <span className="tag">{groupOf(trial.group).label}</span>
          </div>
          <button className="btn block big-play" onClick={() => playTrial(trial)}>🔊 聞く</button>
          <p className="muted">声と速さは毎回変わります（{trial.rate}倍）</p>
          <div className="pair-choices">
            {trial.pair.map((w, k) => {
              const state = !answered ? '' : k === trial.answer ? 'right' : answers[i] === k ? 'wrong' : ''
              return <button key={w} className={`option ${state}`} onClick={() => choose(k as 0 | 1)}>{w}{state === 'right' && ' ✓'}{state === 'wrong' && ' ✗'}</button>
            })}
          </div>
          {answered && (
            <>
              <p>{answers[i] === trial.answer ? '正解！' : `正解は「${trial.pair[trial.answer]}」`}</p>
              <p className="muted">{groupOf(trial.group).hint}</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                {trial.pair.map((w) => <button key={w} className="btn secondary" onClick={() => speak(w, voiceURI, 0.8)}>🔊 {w}</button>)}
              </div>
              <button className="btn block" onClick={() => {
                if (i + 1 < trials.length) { setI(i + 1); playTrial(trials[i + 1]) } else setStage('say')
              }}>{i + 1 < trials.length ? '次へ（すぐに音が出ます）' : '聞き分けの結果へ'}</button>
            </>
          )}
        </section>
      )}

      {stage === 'say' && (
        <SayPair group={sessionWeak} settings={settings} mic={mic} correct={correct} total={trials.length} onDone={() => setStage('done')} />
      )}

      {stage === 'done' && (
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h2>聞き分け {correct} / {trials.length}</h2>
          <button className="btn block" onClick={onExit}>今日の画面に戻る</button>
        </section>
      )}
      {stage !== 'done' && <button className="btn secondary block" onClick={onExit}>ここでやめる</button>}
    </div>
  )
}

function SayPair({ group, settings, mic, correct, total, onDone }: {
  group: string
  settings: Settings
  mic: boolean
  correct: number
  total: number
  onDone: () => void
}) {
  const g = groupOf(group)
  const pair = useMemo(() => g.pairs[Math.floor(Math.random() * g.pairs.length)], [g])
  const [blob, setBlob] = useState<Blob | null>(null)
  const [rated, setRated] = useState(false)
  return (
    <section className="card stack">
      <p className="banner ok">聞き分け：{total}問中 {correct}問 正解</p>
      <h2>言ってみる：{g.label}</h2>
      <p>{g.hint}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        {pair.map((w) => <button key={w} className="btn secondary" onClick={() => speak(w, settings.voiceURI, 0.8)}>🔊 {w}</button>)}
      </div>
      <p className="center"><strong>{pair[0]}</strong> → <strong>{pair[1]}</strong> の順に、はっきり言いましょう。</p>
      {mic ? (
        !blob ? (
          <RecordButton maxSeconds={8} label="🎙 録音する（2つ言ったら止める）" onDone={(b) => setBlob(b)} />
        ) : !rated ? (
          <SelfRating question="先に自分で評価：2つの音を言い分けられましたか？" onRate={async (v) => {
            setRated(true)
            await db.recordings.add({ sessionId: 0, audio: blob, at: Date.now(), kind: 'pronunciation', ref: g.key, text: pair.join(' / '), self: v })
          }} />
        ) : (
          <div className="stack">
            <div className="row">
              <button className="btn secondary" onClick={() => { speak(pair[0], settings.voiceURI, 0.8); window.setTimeout(() => speak(pair[1], settings.voiceURI, 0.8), 1200) }}>▶ 手本</button>
              <PlayBlobButton blob={blob} />
            </div>
            <p className="muted">手本と自分の声を聞き比べて、口の形や舌の位置の違いを確かめましょう。</p>
            <div className="row">
              <button className="btn secondary" style={{ flex: 1 }} onClick={() => { setBlob(null); setRated(false) }}>もう一度</button>
              <button className="btn" style={{ flex: 1 }} onClick={onDone}>終える</button>
            </div>
          </div>
        )
      ) : (
        <>
          <p className="muted">録音できない端末なので、手本をまねて声に出してから自己評価しましょう。</p>
          <SelfRating question="2つの音を言い分けられましたか？" onRate={onDone} />
        </>
      )}
    </section>
  )
}
