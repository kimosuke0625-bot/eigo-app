import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { useMaterials, type Mat } from '../content/materials'
import { dayKey } from '../today/menu'
import { splitSentences } from '../speech/sentences'
import { playSentences } from '../speech/clips'
import { speechSupported } from '../speech/voices'
import { startRecording, type Recording } from '../speech/recorder'
import { ratioOf, useKnowledge } from './ReadingParts'
import { MicGate, PlayBlobButton, SelfRating, useTranscriber } from './SpeakParts'
import { matchScore, shouldShowScore } from './speaking'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { useMaterialAudio, VoiceNote } from './AudioParts'

/** 1回のシャドーイングで扱う文の数（長すぎるとついていけない） */
const SEGMENT = 4
const RATES = [0.8, 1, 1.2]

/**
 * 素材を選ぶ：今日の多聴・多読で使った素材（SPEC：昼に聞いた素材を使う）があればそれ。
 * なければ、知っている語が多い（やさしい）素材。
 */
function useShadowMaterial(): { material?: Mat; fromToday: boolean; loading: boolean } {
  const materials = useMaterials()
  const knowledge = useKnowledge()
  const [todayRef, setTodayRef] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    void db.sessions.where('day').equals(dayKey()).toArray().then((list) => {
      const input = list.filter((s) => s.kind === 'input' && s.ref && s.seconds > 0).sort((a, b) => b.at - a.at)
      setTodayRef(input[0]?.ref ?? null)
    })
  }, [])
  return useMemo(() => {
    if (!materials || !knowledge || todayRef === undefined) return { loading: true, fromToday: false }
    // 全体で1つの音声ファイルの素材（人の朗読・取り込んだ音声）は文ごとに区切れないので使わない
    const usable = (m: Mat) => !m.audioFile && !m.audioBlob
    const today = todayRef ? materials.find((m) => m.id === todayRef && usable(m)) : undefined
    if (today) return { material: today, fromToday: true, loading: false }
    const easiest = materials
      .filter((m) => m.kind !== 'mine' && usable(m))
      .map((m) => ({ m, r: ratioOf(m, knowledge).ratio }))
      .sort((a, b) => b.r - a.r)[0]?.m
    return { material: easiest, fromToday: false, loading: false }
  }, [materials, knowledge, todayRef])
}

export function ShadowingScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const { material, fromToday, loading } = useShadowMaterial()
  const [mic, setMic] = useState<boolean | null>(null)
  if (loading) return <p className="muted">素材を準備中…</p>
  if (!material) return <p className="muted">素材が見つかりませんでした。</p>
  return (
    <div>
      <div className="practice-top"><HelpButton k="shadowing" settings={settings} /></div>
      {mic === null ? (
        <MicGate title="シャドーイング"
          lead={fromToday ? `今日聞いた「${material.title}」を使います。` : `「${material.title}」を使います。`}
          onReady={setMic} />
      ) : (
        <ShadowSession material={material} settings={settings} mic={mic} onExit={onExit} />
      )}
      {mic === null && <button className="btn secondary block" onClick={onExit}>戻る</button>}
    </div>
  )
}

type Stage = 0 | 1 | 2 | 3 | 4
const STAGES = ['聞く', '見ながら重ねる', '見ずに重ねる', '録音して聞き比べ']
const GUIDES = [
  'まず聞いて、内容とリズムをつかみましょう。まだ声は出しません。',
  '文字を見ながら、音声のすぐ後を追いかけて声に出しましょう。',
  '今度は文字を見ずに、音だけを頼りに重ねて言いましょう。',
  '録音しながら重ねて言い、手本と自分の声を聞き比べます。',
  'おつかれさまでした。次の部分に進むか、今日はここまでにしましょう。',
]

function ShadowSession({ material, settings, mic, onExit }: { material: Mat; settings: Settings; mic: boolean; onExit: () => void }) {
  const all = useMemo(() => splitSentences(material.body), [material.body])
  const [offset, setOffset] = useState(0)
  const sentences = all.slice(offset, offset + SEGMENT)
  const ref = `${material.id}#${offset}`
  const result = useSessionTimer('shadowing', 'fluency', undefined, ref)
  const audio = useMaterialAudio(material.id)
  const tts = !!audio || speechSupported()
  const [stage, setStage] = useState<Stage>(0)
  // 変動練習：段階が進むほど速くする（0.8 → 1.0）。自分で変えてもよい
  const [rate, setRate] = useState(0.8)
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const stopTts = useRef<() => void>(() => {})
  const rec = useRef<Recording | null>(null)
  const [recording, setRecording] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [self, setSelf] = useState<number | null>(null)
  const [match, setMatch] = useState<number | null | 'skip' | 'wait'>(null)
  const [asrError, setAsrError] = useState('')
  const transcriber = useTranscriber(settings)

  useEffect(() => () => { stopTts.current(); rec.current?.cancel() }, [])

  const play = (onEnd?: () => void) => {
    stopTts.current()
    setPlaying(true)
    stopTts.current = playSentences({
      clips: audio?.clips,
      sentences, from: 0, rate, voiceURI: settings.voiceURI,
      onIndex: setCurrent,
      onEnd: () => { setPlaying(false); setCurrent(-1); onEnd?.() },
    })
  }
  const stop = () => { stopTts.current(); setPlaying(false); setCurrent(-1) }

  const go = (s: Stage) => {
    stop()
    setStage(s)
    if (s === 2 && rate < 1) setRate(1)
    window.scrollTo({ top: 0 })
  }

  const recordWithModel = async () => {
    setBlob(null); setSelf(null); setMatch(null)
    if (mic) {
      try {
        rec.current = await startRecording()
        setRecording(true)
      } catch {
        rec.current = null
      }
    }
    play(() => {
      // 手本が終わってから少し待って止める（最後の語まで言い終えられるように）
      window.setTimeout(() => void finishRecording(), 1200)
    })
  }
  const finishRecording = async () => {
    stop()
    const r = rec.current
    rec.current = null
    setRecording(false)
    if (r) setBlob(await r.stop())
    else setBlob(new Blob())
  }

  const rate1 = async (value: number) => {
    setSelf(value)
    result.current.shadowSelf = value
    const previous = await db.recordings.where('kind').equals('shadowing').count()
    const text = sentences.join(' ')
    let m: number | undefined
    if (blob && blob.size && transcriber.enabled && shouldShowScore(previous)) {
      setMatch('wait')
      const t = await transcriber.run(blob)
      if (t?.ok) {
        m = matchScore(text, t.text)
        setMatch(m)
        result.current.shadowMatch = m
      } else {
        setMatch('skip')
        setAsrError(t && !t.ok ? t.reason : '')
      }
    } else setMatch('skip')
    if (blob && blob.size) {
      await db.recordings.add({ sessionId: 0, audio: blob, at: Date.now(), kind: 'shadowing', ref, text, self: value, match: m })
    }
  }

  const textVisible = stage === 1 || stage === 4
  return (
    <div>
      <Steps steps={STAGES} current={stage} guide={GUIDES[stage]} />
      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{material.title}</h2>
          <span className="muted">{offset + 1}〜{Math.min(offset + SEGMENT, all.length)}文目 / {all.length}文</span>
        </div>
        {!tts && <p className="banner warn">この端末のブラウザは読み上げに対応していないため、手本を再生できません。</p>}
        <VoiceNote audio={audio} />

        <div className="seg" aria-label="速さ">
          {RATES.map((r) => <button key={r} aria-pressed={rate === r} onClick={() => { setRate(r); stop() }}>{r}倍</button>)}
        </div>

        {(textVisible || stage === 3) && (
          <div className={`shadow-text${stage === 3 && !blob ? ' hidden-text' : ''}`}>
            {sentences.map((s, i) => <p key={i} className={i === current ? 'now' : ''}>{s}</p>)}
          </div>
        )}
        {stage === 2 && <p className="muted center">（文字は隠れています）</p>}

        {stage < 3 && (
          <>
            <button className="btn block" disabled={!tts} onClick={() => (playing ? stop() : play())}>
              {playing ? '⏸ 止める' : stage === 0 ? '▶ 聞く' : '▶ 再生して重ねて言う'}
            </button>
            <button className="btn secondary block" onClick={() => go((stage + 1) as Stage)}>次の段階へ →</button>
          </>
        )}

        {stage === 3 && (
          <div className="stack">
            {!blob && (
              recording || playing
                ? <button className="btn danger block recording" onClick={() => void finishRecording()}>⏹ 止める</button>
                : <button className="btn block" disabled={!tts} onClick={() => void recordWithModel()}>
                    {mic ? '🎙 録音しながら再生する' : '▶ 再生して重ねて言う（録音なし）'}
                  </button>
            )}
            {blob && self === null && (
              <SelfRating question="先に自分で評価：手本にどのくらい重ねて言えましたか？" onRate={(v) => void rate1(v)} />
            )}
            {blob && self !== null && (
              <div className="stack">
                <div className="row">
                  <button className="btn secondary" onClick={() => (playing ? stop() : play())}>{playing ? '⏸ 止める' : '▶ 手本'}</button>
                  {blob.size > 0 && <PlayBlobButton blob={blob} />}
                </div>
                {match === 'wait' && <p className="muted">録音を文字にしています…</p>}
                {typeof match === 'number' && (
                  <p className="banner ok">手本との一致率（語の単位）：<strong>{Math.round(match * 100)}%</strong></p>
                )}
                {asrError && <p className="banner warn">一致率を出せませんでした：{asrError}</p>}
                {match === 'skip' && !asrError && settings.asrEnabled && blob.size > 0 && (
                  <p className="muted">今回は一致率を出しません（慣れてきたら3回に1回だけ表示します）。自分の耳で聞き比べましょう。</p>
                )}
                {!settings.asrEnabled && blob.size > 0 && (
                  <p className="muted">設定で音声認識を有効にすると、手本との一致率も出せます。</p>
                )}
                <div className="row">
                  <button className="btn secondary" style={{ flex: 1 }} onClick={() => { setBlob(null); setSelf(null); setMatch(null); setAsrError('') }}>もう一度録音</button>
                  <button className="btn" style={{ flex: 1 }} onClick={() => go(4)}>終える</button>
                </div>
              </div>
            )}
          </div>
        )}

        {stage === 4 && (
          <div className="stack">
            {offset + SEGMENT < all.length && (
              <button className="btn block" onClick={() => { setOffset(offset + SEGMENT); setStage(0); setRate(0.8); setBlob(null); setSelf(null); setMatch(null) }}>
                次の{SEGMENT}文へ →
              </button>
            )}
            <button className="btn secondary block" onClick={onExit}>今日の画面に戻る</button>
          </div>
        )}
      </section>
      {stage < 4 && <button className="btn secondary block" onClick={() => { stop(); onExit() }}>ここでやめる</button>}
    </div>
  )
}
