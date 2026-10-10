import { useEffect, useMemo, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { loadWordAudio, playFile, type WordClip } from '../speech/clips'
import { MicGate, PlayBlobButton, RecordButton, SelfRating } from './SpeakParts'
import { buildTrials, PAIR_GROUPS, weakestGroup, type Trial } from './speaking'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { playCorrect, playTry } from '../rewards/sound'

const TRIALS = 16
const groupOf = (key: string) => PAIR_GROUPS.find((g) => g.key === key)!
/**
 * 単語の音声を再生する。人の録音（Wikimedia Commons）を第一候補に、なければ PC で作った高品質な合成音声。
 * clipIndex でどの話者の声かを選ぶ（同じ問題を聞き直すときは同じ声）。
 * 聞き分けは音が正確でないと練習にならないので、端末の声は使わない（音声ファイルがない語は鳴らさない）。
 */
function playWord(audio: Record<string, WordClip[]>, word: string, clipIndex: number, rate: number): WordClip | undefined {
  const clips = audio[word] ?? []
  const clip = clips[clipIndex % Math.max(1, clips.length)]
  if (clip) playFile(clip.file, rate)
  return clip
}

function speakerLabel(c?: WordClip) {
  if (!c) return '音声ファイルがありません'
  return c.kind === 'human' ? `人の録音（${c.speaker}、${c.origin}）` : `合成音声（${c.speaker}）`
}
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
  const [audio, setAudio] = useState<Record<string, WordClip[]> | null>(null)
  useEffect(() => { void loadWordAudio().then(setAudio) }, [])
  if (!audio) return <p className="muted">音声を準備中…</p>
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
      ) : <Drill mic={mic} focus={focus} audio={audio} onExit={onExit} />}
    </div>
  )
}

function Drill({ mic, focus, audio, onExit }: { mic: boolean; focus: string; audio: Record<string, WordClip[]>; onExit: () => void }) {
  const result = useSessionTimer('pronunciation', 'language')
  const trials = useMemo<Trial[]>(() => buildTrials(focus, TRIALS), [focus])
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<(0 | 1)[]>([])
  // どの話者の声で出題したか（同じ問題の聞き直し・聞き比べは同じ声で）
  const [clipIndex, setClipIndex] = useState(0)
  const [clip, setClip] = useState<WordClip | undefined>()
  const [stage, setStage] = useState<'listen' | 'say' | 'done'>('listen')

  // 複数の話者の声で出題する（問題ごとに話者を選び直す）
  const playTrial = (t: Trial, newVoice = false) => {
    const idx = newVoice ? Math.floor(Math.random() * 3) : clipIndex
    if (newVoice) setClipIndex(idx)
    setClip(playWord(audio, t.pair[t.answer], idx, t.rate))
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
          <button className="btn block big-play" onClick={() => playTrial(trial, !clip)}>🔊 聞く</button>
          <p className="muted">話者と速さは毎回変わります（{trial.rate}倍）{clip !== undefined || answered ? `・声：${speakerLabel(clip)}` : ''}</p>
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
                {trial.pair.map((w) => <button key={w} className="btn secondary" onClick={() => playWord(audio, w, clipIndex, 0.9)}>🔊 {w}</button>)}
              </div>
              <button className="btn block" onClick={() => {
                if (i + 1 < trials.length) { setI(i + 1); playTrial(trials[i + 1], true) } else setStage('say')
              }}>{i + 1 < trials.length ? '次へ（すぐに音が出ます）' : '聞き分けの結果へ'}</button>
            </>
          )}
        </section>
      )}

      {stage === 'say' && (
        <SayPair group={sessionWeak} audio={audio} mic={mic} correct={correct} total={trials.length} onDone={() => setStage('done')} />
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

function SayPair({ group, audio, mic, correct, total, onDone }: {
  group: string
  audio: Record<string, WordClip[]>
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
        {pair.map((w) => <button key={w} className="btn secondary" onClick={() => playWord(audio, w, 0, 0.9)}>🔊 {w}</button>)}
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
              <button className="btn secondary" onClick={() => { playWord(audio, pair[0], 0, 0.9); window.setTimeout(() => playWord(audio, pair[1], 0, 0.9), 1300) }}>▶ 手本</button>
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
          <p className="muted">録音を使えない状態なので、手本をまねて声に出してから自己評価しましょう。</p>
          <SelfRating question="2つの音を言い分けられましたか？" onRate={onDone} />
        </>
      )}
    </section>
  )
}
