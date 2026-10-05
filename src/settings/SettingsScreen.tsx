import { useRef, useState } from 'react'
import type { BlockId, EffectsLevel, Settings, ThemeMode } from '../db/schema'
import { updateSettings } from '../db/settings'
import { backupFileName, exportAll, importAll, parseBackup, type BackupFile } from '../db/backup'
import { BLOCK_LABELS } from '../today/menu'
import { speak, speechSupported, useEnglishVoices } from '../speech/voices'

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

export function SettingsScreen({ settings }: { settings: Settings }) {
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

      <BackupSection />
    </div>
  )
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  const doExport = async () => {
    const data = await exportAll()
    const name = backupFileName()
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
    // iPhone のホーム画面アプリでは共有シートから「ファイルに保存」する
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name })
      } catch {
        return // 共有シートを閉じた
      }
    } else {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    await updateSettings({ lastBackupAt: Date.now() })
    setMessage({ kind: 'ok', text: `${name} を書き出しました。` })
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
