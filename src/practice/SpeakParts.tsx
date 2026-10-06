import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../db/schema'
import { micSupported, playBlob, startRecording, unlockAudioAndMic, type Recording } from '../speech/recorder'
import { loadAsr, transcribeSafe, useAsrStatus, type TranscribeResult } from '../speech/asr'
import { SELF_RATINGS } from './speaking'

/**
 * 練習の開始画面。最初のタップでマイクと音声の再生を一度に許可してもらう（iPhone はタップの後でないと使えない）。
 * マイクが使えなくても、自己評価で練習を続けられる。
 */
export function MicGate({ title, lead, onReady }: { title: string; lead: string; onReady: (mic: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <section className="card stack" style={{ textAlign: 'center' }}>
      <h2>{title}</h2>
      <p>{lead}</p>
      <p className="muted">🎧 イヤホンを使うと、手本の音が録音に入らず聞き比べやすくなります。</p>
      <button className="btn block" disabled={busy} onClick={async () => {
        setBusy(true)
        const { mic } = await unlockAudioAndMic()
        onReady(mic)
      }}>🎙 マイクと音声を許可して始める</button>
      {!micSupported() && <p className="muted">この端末・ブラウザは録音に対応していません。録音なし（自己評価）で練習できます。</p>}
    </section>
  )
}

/** 録音ボタン。録音中は経過時間を表示する。maxSeconds を過ぎると自動で止める */
export function RecordButton({ onDone, maxSeconds, label = '🎙 録音する', disabled, onStart }: {
  onDone: (blob: Blob, seconds: number) => void
  maxSeconds?: number
  label?: string
  disabled?: boolean
  onStart?: () => void
}) {
  const rec = useRef<Recording | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => () => rec.current?.cancel(), [])
  useEffect(() => {
    if (elapsed === null) return
    const t = window.setInterval(() => {
      const s = (Date.now() - (rec.current?.startedAt ?? Date.now())) / 1000
      setElapsed(s)
      if (maxSeconds && s >= maxSeconds) void stop()
    }, 250)
    return () => window.clearInterval(t)
  })

  const stop = async () => {
    const r = rec.current
    if (!r) return
    rec.current = null
    const seconds = (Date.now() - r.startedAt) / 1000
    setElapsed(null)
    onDone(await r.stop(), seconds)
  }

  if (elapsed !== null) {
    return (
      <button className="btn danger block recording" onClick={() => void stop()}>
        ⏹ 止める（{Math.floor(elapsed)}秒{maxSeconds ? ` / ${maxSeconds}秒` : ''}）
      </button>
    )
  }
  return (
    <>
      <button className="btn block" disabled={disabled} onClick={async () => {
        setError('')
        try {
          rec.current = await startRecording()
          setElapsed(0)
          onStart?.()
        } catch {
          setError('マイクを使えませんでした。設定アプリでこのアプリのマイクを許可してください。')
        }
      }}>{label}</button>
      {error && <p className="banner warn">{error}</p>}
    </>
  )
}

/** 録音を再生するボタン */
export function PlayBlobButton({ blob, label = '▶ 自分の録音' }: { blob: Blob; label?: string }) {
  const [playing, setPlaying] = useState(false)
  const stopRef = useRef<() => void>(() => {})
  useEffect(() => () => stopRef.current(), [])
  return (
    <button className="btn secondary" onClick={() => {
      if (playing) { stopRef.current(); return }
      setPlaying(true)
      stopRef.current = playBlob(blob, () => setPlaying(false))
    }}>{playing ? '⏸ 止める' : label}</button>
  )
}

/** 自己評価（先に自分の耳で判断する） */
export function SelfRating({ question, onRate }: { question: string; onRate: (v: number) => void }) {
  return (
    <div className="stack">
      <p><strong>{question}</strong></p>
      <div className="seg">
        {SELF_RATINGS.map((r) => <button key={r.label} onClick={() => onRate(r.value)}>{r.label}</button>)}
      </div>
    </div>
  )
}

/**
 * 録音を文字にする。設定で音声認識を有効にしていなければ何もしない（null）。
 * 失敗しても練習は続けられるよう、例外にせず理由つきの結果を返す。
 */
export function useTranscriber(settings: Settings) {
  const status = useAsrStatus()
  const enabled = settings.asrEnabled && status.state !== 'unsupported'
  useEffect(() => {
    // 練習を開いたら裏で準備しておく（2回目以降はブラウザのキャッシュから読むので速い）
    if (enabled) loadAsr().catch(() => {})
  }, [enabled])
  return {
    enabled,
    status,
    run: async (blob: Blob): Promise<TranscribeResult | null> => (enabled ? transcribeSafe(blob) : null),
  }
}
