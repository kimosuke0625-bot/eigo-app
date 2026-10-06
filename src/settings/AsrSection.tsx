import { useState } from 'react'
import type { Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { loadAsr, useAsrStatus } from '../speech/asr'

/** 音声認識（Whisper）の設定。モデルの取得は利用者が選んだときだけ行う */
export function AsrSection({ settings }: { settings: Settings }) {
  const status = useAsrStatus()
  const [error, setError] = useState('')
  const enable = async () => {
    setError('')
    await updateSettings({ asrEnabled: true })
    try {
      await loadAsr()
    } catch (e) {
      setError(`準備できませんでした：${(e as Error).message}。通信できる場所でもう一度試してください。`)
    }
  }
  return (
    <section className="card stack">
      <h2>音声認識（Whisper）</h2>
      <p className="muted">
        シャドーイングの「手本との一致率」と、4/3/2スピーチの「1分あたりの語数」を自動で出すのに使います。
        音声はこの端末の中で文字にするだけで、外には送りません。使わなくても、録音と自己評価ですべての練習ができます。
      </p>
      {status.state === 'unsupported' && <p className="banner warn">この端末・ブラウザでは音声認識を使えません。</p>}
      {status.state !== 'unsupported' && !settings.asrEnabled && (
        <>
          <p className="muted">最初の1回だけ、Hugging Face から英語用の最小モデル（whisper-tiny.en、約41MB）を取得します。Wi-Fi のある所で行ってください。</p>
          <button className="btn block" onClick={() => void enable()}>音声認識を有効にする（約41MB）</button>
        </>
      )}
      {settings.asrEnabled && (
        <>
          {status.state === 'loading' && (
            <div>
              <p>モデルを準備中… {status.total ? `${Math.round((status.loaded / status.total) * 100)}%` : ''}</p>
              <div className="progress"><div style={{ width: `${status.total ? (status.loaded / status.total) * 100 : 5}%` }} /></div>
            </div>
          )}
          {status.state === 'ready' && <p className="banner ok">✓ 音声認識を使えます</p>}
          {status.state === 'idle' && <p className="muted">有効です。練習を開くと自動で準備します。</p>}
          {status.state === 'error' && <p className="banner warn">エラー：{status.message}</p>}
          <div className="row">
            {status.state !== 'ready' && status.state !== 'loading' && <button className="btn secondary" onClick={() => void enable()}>いま準備する</button>}
            <button className="btn secondary" onClick={() => void updateSettings({ asrEnabled: false })}>無効にする</button>
          </div>
        </>
      )}
      {error && <p className="banner warn">{error}</p>}
    </section>
  )
}
