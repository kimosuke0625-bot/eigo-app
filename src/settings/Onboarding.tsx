import { useState } from 'react'
import type { Settings } from '../db/schema'
import { updateSettings } from '../db/settings'

const CUE_EXAMPLES = [
  '朝コーヒーを淹れたら復習カードを開く',
  '昼ごはんを食べ終えたら多聴を始める',
  '夜お風呂から出たらシャドーイングをする',
]

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function Onboarding({ settings }: { settings: Settings }) {
  const [step, setStep] = useState(0)
  const [cue, setCue] = useState(settings.cue)
  const [minutes, setMinutes] = useState(settings.targetMinutes)
  const showInstall = isIOS() && !isStandalone()

  const finish = () => updateSettings({ cue, targetMinutes: minutes, onboarded: true, createdAt: Date.now() })

  return (
    <div className="app" style={{ paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
      <h1 style={{ color: 'var(--primary)', fontSize: '1.3rem', marginBottom: 16 }}>英語マスター 2年計画へようこそ</h1>

      {step === 0 && (
        <section className="card stack">
          <h2>1. 1日の目標時間</h2>
          <p className="muted">朝・昼・夜のブロックに分けて取り組めます。朝のブロックが一番短くなっています。</p>
          <label className="field">
            <span>{minutes}分</span>
            <input type="range" min={15} max={120} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </label>
          <button className="btn block" onClick={() => setStep(1)}>次へ</button>
        </section>
      )}

      {step === 1 && (
        <section className="card stack">
          <h2>2. きっかけを決める</h2>
          <p className="muted">「〇〇したら、△△する」と決めておくと習慣になりやすくなります。今日の画面にいつも表示します。</p>
          <label className="field">
            <span>きっかけの一文</span>
            <input type="text" value={cue} onChange={(e) => setCue(e.target.value)} placeholder={CUE_EXAMPLES[0]} />
          </label>
          <div className="row">
            {CUE_EXAMPLES.map((c) => (
              <button key={c} className="btn secondary" style={{ fontWeight: 400, fontSize: '0.85rem' }} onClick={() => setCue(c)}>{c}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(0)}>戻る</button>
            <button className="btn" style={{ flex: 1 }} disabled={!cue.trim()} onClick={() => setStep(2)}>次へ</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card stack">
          <h2>3. iPhoneで使うときの準備</h2>
          {showInstall ? (
            <div className="banner warn">
              Safariのままだと、しばらく開かないうちに学習データが消されることがあります。必ずホーム画面に追加してから使ってください。
            </div>
          ) : (
            <p className="muted">PCではこのままブラウザで使えます。iPhoneでは次の手順を行ってください。</p>
          )}
          <div>
            <strong>ホーム画面に追加する</strong>
            <ol className="steps">
              <li>Safariでこのページを開く</li>
              <li>画面下の共有ボタン（□に↑）を押す</li>
              <li>「ホーム画面に追加」を選ぶ</li>
              <li>ホーム画面のアイコンから開く</li>
            </ol>
          </div>
          <div>
            <strong>高品質の英語音声を追加する</strong>
            <ol className="steps">
              <li>「設定」アプリ →「アクセシビリティ」→「読み上げコンテンツ」→「声」</li>
              <li>「英語」を選び、好きな声（「拡張」や「高品質」と書かれたもの）をダウンロード</li>
              <li>このアプリの「設定」で声を選んで試聴する</li>
            </ol>
          </div>
          <div className="row">
            <button className="btn secondary" onClick={() => setStep(1)}>戻る</button>
            <button className="btn" style={{ flex: 1 }} onClick={finish}>はじめる</button>
          </div>
          <p className="muted">開始レベルを決める診断テストは、復習カードと一緒に次の段階で追加します。</p>
        </section>
      )}
    </div>
  )
}
