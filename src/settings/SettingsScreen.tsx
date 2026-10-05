import { useRef, useState } from 'react'
import type { BlockId, EffectsLevel, Settings, ThemeMode } from '../db/schema'
import { updateSettings } from '../db/settings'
import { backupFileName, exportAll, importAll, parseBackup, type BackupFile } from '../db/backup'
import { BLOCK_LABELS } from '../today/menu'
import { speak, speechSupported, useEnglishVoices } from '../speech/voices'
import { Credits } from './Credits'

function Seg<T extends string | number>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

export function SettingsScreen({ settings, onDiagnostic }: { settings: Settings; onDiagnostic: () => void }) {
  const set = (patch: Partial<Settings>) => updateSettings(patch)
  const voices = useEnglishVoices()

  const moveBlock = (i: number, dir: -1 | 1) => {
    const order = [...settings.blockOrder]
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    set({ blockOrder: order })
  }

  return (
    <div>
      <section className="card">
        <h2>学習の目標</h2>
        <label className="field">
          <span>1日の目標時間：{settings.targetMinutes}分</span>
          <input type="range" min={15} max={120} step={5} value={settings.targetMinutes}
            onChange={(e) => set({ targetMinutes: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>復習カードの目標定着率：{Math.round(settings.retention * 100)}%</span>
          <input type="range" min={85} max={95} step={1} value={Math.round(settings.retention * 100)}
            onChange={(e) => set({ retention: Number(e.target.value) / 100 })} />
          <small className="muted">高くすると復習の回数が増え、低くすると減ります（初期値90%）。</small>
        </label>
        <label className="field">
          <span>1日の復習の上限：{settings.reviewCap}枚</span>
          <input type="range" min={50} max={400} step={10} value={settings.reviewCap}
            onChange={(e) => set({ reviewCap: Number(e.target.value) })} />
          <small className="muted">長く休んだ後も、期日の古いカードから少しずつ戻します。</small>
        </label>
        <label className="field">
          <span>きっかけの一文（if-thenプラン）</span>
          <input type="text" value={settings.cue} placeholder="朝コーヒーを淹れたら復習カードを開く"
            onChange={(e) => set({ cue: e.target.value })} />
        </label>
      </section>

      <section className="card">
        <h2>ブロックの順番</h2>
        <ul className="order-list">
          {settings.blockOrder.map((b: BlockId, i) => (
            <li key={b}>
              <span>{i + 1}. {BLOCK_LABELS[b]}</span>
              <button className="icon-btn" aria-label="上へ" disabled={i === 0} onClick={() => moveBlock(i, -1)}>↑</button>
              <button className="icon-btn" aria-label="下へ" disabled={i === settings.blockOrder.length - 1} onClick={() => moveBlock(i, 1)}>↓</button>
            </li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>朝が終わる時刻</span>
            <select value={settings.morningEnd}
              onChange={(e) => set({ morningEnd: Number(e.target.value), noonEnd: Math.max(settings.noonEnd, Number(e.target.value) + 1) })}>
              {hours(5, 14).map((h) => <option key={h} value={h}>{h}時</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: 1, marginBottom: 0 }}>
            <span>昼が終わる時刻</span>
            <select value={settings.noonEnd} onChange={(e) => set({ noonEnd: Number(e.target.value) })}>
              {hours(settings.morningEnd + 1, 22).map((h) => <option key={h} value={h}>{h}時</option>)}
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          今日の画面の「いま」の表示に使います。朝 〜{settings.morningEnd}時、昼 〜{settings.noonEnd}時、夜 それ以降。
        </p>
      </section>

      <section className="card">
        <h2>Phase</h2>
        <div className="field">
          <Seg value={settings.phase} onChange={(v) => set({ phase: v, phaseAuto: false })}
            options={[1, 2, 3, 4].map((p) => ({ value: p as 1 | 2 | 3 | 4, label: `Phase ${p}` }))} />
        </div>
        <label className="row">
          <input type="checkbox" checked={settings.phaseAuto} onChange={(e) => set({ phaseAuto: e.target.checked })} />
          語彙数と聞き取りの結果で自動的に切り替える
        </label>
      </section>

      <section className="card">
        <h2>声と演出</h2>
        <label className="field">
          <span>読み上げの声</span>
          {speechSupported() ? (
            <div className="row">
              <select value={settings.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })} style={{ flex: 1 }}>
                <option value="">端末の標準（英語）</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}（{v.lang}）</option>
                ))}
              </select>
              <button className="btn secondary" type="button"
                onClick={() => speak('Nice to meet you. Shall we get started?', settings.voiceURI)}>
                ▶ 試聴
              </button>
            </div>
          ) : (
            <p className="muted">このブラウザは読み上げに対応していません。</p>
          )}
        </label>
        <div className="field">
          <span>演出の量</span>
          <Seg<EffectsLevel> value={settings.effects} onChange={(v) => set({ effects: v })}
            options={[{ value: 'low', label: '少なめ' }, { value: 'medium', label: 'ふつう' }, { value: 'high', label: '多め' }]} />
        </div>
        <div className="field">
          <span>効果音</span>
          <Seg value={settings.sound ? 'on' : 'off'} onChange={(v) => set({ sound: v === 'on' })}
            options={[{ value: 'on', label: 'オン' }, { value: 'off', label: 'オフ' }]} />
        </div>
        <div className="field">
          <span>画面の色</span>
          <Seg<ThemeMode> value={settings.theme} onChange={(v) => set({ theme: v })}
            options={[{ value: 'system', label: '端末に合わせる' }, { value: 'light', label: 'ライト' }, { value: 'dark', label: 'ダーク' }]} />
        </div>
      </section>

      <section className="card stack">
        <h2>診断テスト</h2>
        <p className="muted">
          {settings.diagnosedAt > 0
            ? `${new Date(settings.diagnosedAt).toLocaleDateString('ja-JP')} に受けました。受け直すと、知っている語の登録が追加されます。`
            : 'まだ受けていません。'}
        </p>
        <button className="btn secondary block" onClick={onDiagnostic}>診断テストを受ける</button>
      </section>

      <BackupSection />
      <Credits />
    </div>
  )
}

function isAppleMobile() {
  // iPadOS の Safari は Mac と名乗るため、タッチ対応かどうかでも判定する
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function download(file: File, name: string) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const doExport = async () => {
    try {
      const data = await exportAll()
      const name = backupFileName()
      const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
      // iPhone のホーム画面アプリではダウンロードが使えないため、共有シートから「ファイルに保存」する。
      // PC の Chrome も canShare を true と返すが共有に失敗するので、iPhone・iPad に限る
      if (isAppleMobile() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name })
        } catch (err) {
          if ((err as Error).name === 'AbortError') return // 共有シートを閉じた
          download(file, name)
        }
      } else {
        download(file, name)
      }
      await updateSettings({ lastBackupAt: Date.now() })
      setMessage({ kind: 'ok', text: `${name} を書き出しました。` })
    } catch (err) {
      setMessage({ kind: 'warn', text: `書き出しに失敗しました：${(err as Error).message}` })
    }
  }

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setPending(parseBackup(await f.text()))
      setMessage(null)
    } catch (err) {
      setMessage({ kind: 'warn', text: (err as Error).message })
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    await importAll(pending)
    setPending(null)
    setMessage({ kind: 'ok', text: '読み込みが完了しました。' })
  }

  return (
    <section className="card stack">
      <h2>データの書き出しと読み込み</h2>
      <p className="muted">学習記録と録音はこの端末の中だけに保存されます。週に1回は書き出して、PCとスマホの間で移すときにも使ってください。</p>
      <button className="btn block" onClick={doExport}>⬇ データを書き出す</button>
      <button className="btn secondary block" onClick={() => fileRef.current?.click()}>⬆ ファイルから読み込む</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onPick} />
      {pending && (
        <div className="banner warn">
          {new Date(pending.exportedAt).toLocaleString('ja-JP')} に書き出したデータです。
          いまの端末のデータはすべて置き換わります。よろしいですか？
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn danger" onClick={confirmImport}>置き換える</button>
            <button className="btn secondary" onClick={() => setPending(null)}>やめる</button>
          </div>
        </div>
      )}
      {message && <div className={`banner ${message.kind}`}>{message.text}</div>}
    </section>
  )
}
