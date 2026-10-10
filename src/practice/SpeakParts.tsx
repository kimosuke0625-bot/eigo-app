import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../db/schema'
import { micSupported, playBlob, startRecording, unlockAudioAndMic, micProblemOf, type MicProblem, type MicResult, type Recording } from '../speech/recorder'
import { loadAsr, transcribeSafe, useAsrStatus, type TranscribeResult } from '../speech/asr'
import { SELF_RATINGS } from './speaking'

/**
 * 練習の開始画面。最初のタップでマイクと音声の再生を一度に許可してもらう（iPhone はタップの後でないと使えない）。
 * マイクが使えなくても、自己評価で練習を続けられる。
 */
export function MicGate({ title, lead, onReady }: { title: string; lead: string; onReady: (mic: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  // マイクが使えなかったとき：理由と直し方を出し、もう一度試すか、録音なしで続けるかを選んでもらう
  const [failed, setFailed] = useState<MicResult | null>(null)
  const tryMic = async () => {
    setBusy(true)
    const r = await unlockAudioAndMic()
    setBusy(false)
    if (r.mic) onReady(true)
    else setFailed(r)
  }
  return (
    <section className="card stack" style={{ textAlign: 'center' }}>
      <h2>{title}</h2>
      <p>{lead}</p>
      <p className="muted">🎧 イヤホンを使うと、手本の音が録音に入らず聞き比べやすくなります。</p>
      {!failed && <button className="btn block" disabled={busy} onClick={() => void tryMic()}>🎙 マイクと音声を許可して始める</button>}
      {failed && <MicTrouble result={failed} busy={busy} onRetry={() => void tryMic()} onSkip={() => onReady(false)} />}
      {!failed && !micSupported() && <p className="muted">この端末・ブラウザは録音に対応していません。録音なし（自己評価）で練習できます。</p>}
    </section>
  )
}

const MIC_PROBLEM_TEXT: Record<MicProblem, string> = {
  denied: 'マイクの使用が許可されていません。',
  notfound: 'マイクが見つかりませんでした。',
  busy: 'ほかのアプリ（通話・録音・ビデオ会議など）がマイクを使っているため、使えませんでした。',
  insecure: '安全な接続（https）で開いていないため、マイクを使えません。',
  unsupported: 'この端末・ブラウザは録音に対応していません。',
  other: 'マイクを使い始められませんでした。',
}

/** マイクが使えなかった理由と、iPhone での直し方 */
function MicTrouble({ result, busy, onRetry, onSkip }: { result: MicResult; busy: boolean; onRetry: () => void; onSkip: () => void }) {
  const p = result.problem ?? 'other'
  return (
    <div className="stack" style={{ textAlign: 'left' }}>
      <p className="banner warn">{MIC_PROBLEM_TEXT[p]}</p>
      {p === 'denied' && (
        <div className="muted">
          <p>iPhone での直し方：</p>
          <ol>
            <li>許可を求める表示が出たら「許可」を押します。</li>
            <li>表示が出ないときは、iPhone の「設定」→「アプリ」→「Safari」→「マイク」を「確認」か「許可」にします（古い iOS では「設定」→「Safari」→「マイク」）。</li>
            <li>ホーム画面から開いている場合は、アプリを一度完全に閉じて（下から上へはらって消す）開き直し、もう一度試します。</li>
          </ol>
        </div>
      )}
      {p === 'busy' && <p className="muted">電話・ほかの録音アプリを終えてから、もう一度試してください。</p>}
      {p === 'other' && <p className="muted">アプリを一度完全に閉じて開き直してから、もう一度試してください。</p>}
      {result.detail && <p className="muted" style={{ fontSize: '0.85em' }}>詳しい理由（不具合の報告用）：{result.detail}</p>}
      {p !== 'unsupported' && p !== 'insecure' && <button className="btn block" disabled={busy} onClick={onRetry}>🎙 もう一度試す</button>}
      <button className="btn secondary block" disabled={busy} onClick={onSkip}>録音なし（自己評価）で続ける</button>
    </div>
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
        } catch (e) {
          const err = e as { name?: string; message?: string }
          const p = micProblemOf(e)
          setError(`${MIC_PROBLEM_TEXT[p]}${p === 'denied' ? 'iPhone の「設定」→「アプリ」→「Safari」→「マイク」を「確認」か「許可」にしてから、アプリを開き直してください。' : ''}（詳しい理由：${[err?.name, err?.message].filter(Boolean).join('：') || '不明'}）`)
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
