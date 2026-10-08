import { useRef, useState } from 'react'
import type { BlockId, EffectsLevel, Settings, ThemeMode } from '../db/schema'
import { updateSettings } from '../db/settings'
import { backupFileName, exportAll, importAll, parseBackup, type BackupFile } from '../db/backup'
import { BLOCK_LABELS } from '../today/menu'
import { isAppleMobile, isHighQualityVoice, speak, speechSupported, useEnglishVoices } from '../speech/voices'
import { Credits } from './Credits'
import { AsrSection } from './AsrSection'
import { AudioBankSection } from './AudioBankSection'
import { OfflineSection } from './OfflineSection'
import { MyAudioSection } from './MyAudioSection'
import { ReportsSection } from './ReportsSection'
import { LookSection } from './LookSection'
import { playChime } from '../rewards/sound'
import { VoiceInstallGuide } from './VoiceInstallGuide'
import { VoiceDiagnostics } from './VoiceDiagnostics'
import { syncPhraseItems } from '../notes/store'

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
        <h3 className="block-title">単語の復習</h3>
        <label className="field">
          <span>1日の復習の上限：{settings.reviewCap}枚</span>
          <input type="range" min={50} max={400} step={10} value={settings.reviewCap}
            onChange={(e) => set({ reviewCap: Number(e.target.value) })} />
          <small className="muted">長く休んだ後も、期日の古いカードから少しずつ戻します。</small>
        </label>
        <label className="field">
          <span>1日に新しく覚える単語の上限：{settings.wordNewPerDay}枚</span>
          <input type="range" min={3} max={30} step={1} value={settings.wordNewPerDay}
            onChange={(e) => set({ wordNewPerDay: Number(e.target.value) })} />
          <small className="muted">この上限の中で、正答率が85%前後になるよう自動で増減します（初期値20枚）。</small>
        </label>
        <h3 className="block-title">表現の復習</h3>
        <label className="field">
          <span>1日の復習の上限：{settings.exprReviewCap}枚</span>
          <input type="range" min={10} max={200} step={5} value={settings.exprReviewCap}
            onChange={(e) => set({ exprReviewCap: Number(e.target.value) })} />
          <small className="muted">表現は1枚に時間がかかるので、単語より少なめにしています（初期値60枚）。</small>
        </label>
        <label className="field">
          <span>1日に新しく加える熟語：{settings.idiomNewPerDay}個</span>
          <input type="range" min={0} max={20} step={1} value={settings.idiomNewPerDay}
            onChange={(e) => set({ idiomNewPerDay: Number(e.target.value) })} />
          <small className="muted">熟語を、よく使う順にこの数ずつ表現の復習に加えます（初期値3個。0 にすると加えません）。</small>
        </label>
        <label className="row">
          <input type="checkbox" checked={settings.idiomShowUnverified} onChange={(e) => set({ idiomShowUnverified: e.target.checked })} />
          「要確認」の熟語も出題する（確認が弱いもの。初期設定では出しません）
        </label>
        <label className="field">
          <span>1日に新しく加える旅の手帳の表現：{settings.exprNewPerDay}個</span>
          <input type="range" min={1} max={20} step={1} value={settings.exprNewPerDay}
            onChange={(e) => set({ exprNewPerDay: Number(e.target.value) })} />
          <small className="muted">旅の手帳の表現を、古いものからこの数ずつ表現の復習に加えます（初期値5個）。</small>
        </label>
        <label className="field">
          <span>きっかけの一文（if-thenプラン）</span>
          <input type="text" value={settings.cue} placeholder="朝コーヒーを淹れたら復習カードを開く"
            onChange={(e) => set({ cue: e.target.value })} />
        </label>
      </section>

      <section className="card">
        <h2>ビジネス語彙</h2>
        <div className="field">
          <span>新しいカードに入れる時期</span>
          <Seg value={settings.bslMode} onChange={(v) => set({ bslMode: v })}
            options={[{ value: 'after', label: '基本語のあと' }, { value: 'mix', label: '今から混ぜる' }]} />
          <small className="muted">
            基本語のあと：基本語（NGSL 2,809語）を覚え終えてから、ビジネス語彙（BSL 1,744語）に進む（初期値）。
            今から混ぜる：新しいカード3枚のうち1枚をビジネス語彙にする。
          </small>
        </div>
      </section>

      <section className="card">
        <h2>多聴・多読</h2>
        <div className="field">
          <span>内容確認の問い</span>
          <Seg value={settings.questionsFirst ? 'first' : 'after'} onChange={(v) => set({ questionsFirst: v === 'first' })}
            options={[{ value: 'first', label: '先に見る' }, { value: 'after', label: '後で見る' }]} />
          <small className="muted">
            先に見る：問いを見てから、答えを探しながら聞く（初期値）。後で見る：何も知らずに聞いてから問いに答える。
          </small>
        </div>
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
        <div className="field">
          <span>読み上げの声</span>
          {speechSupported() && voices.length > 0 ? (
            <div className="row">
              <select value={settings.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })} style={{ flex: 1 }}>
                <option value="">自動（使える中で一番よい声）</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{isHighQualityVoice(v) ? '★ ' : ''}{v.name}（{v.lang}）</option>
                ))}
              </select>
              <button className="btn secondary" type="button"
                onClick={() => speak('Nice to meet you. Shall we get started?', settings.voiceURI)}>
                ▶ 試聴
              </button>
            </div>
          ) : (
            <p className="muted">英語の声が見えていません。端末の標準の声で読み上げます。</p>
          )}
          {!isAppleMobile() && !voices.some(isHighQualityVoice) && <div className="banner info" style={{ marginTop: 8 }}><VoiceInstallGuide /></div>}
          <VoiceDiagnostics />
          <small className="muted">
            ★ は高品質な声。遊び用の声は選べません。多聴・多読、シャドーイング、ディクテーションの内蔵素材と、聞き分けドリルの単語は、
            アプリに入っている音声（人の録音と、PC で作った高品質な合成音声）で再生します。端末の声は、復習カードの例文などに使います。
          </small>
        </div>
        <div className="field">
          <span>演出の量</span>
          <Seg<EffectsLevel> value={settings.effects} onChange={(v) => set({ effects: v })}
            options={[{ value: 'low', label: '少なめ' }, { value: 'medium', label: 'ふつう' }, { value: 'high', label: '多め' }]} />
        </div>
        <div className="field">
          <span>効果音</span>
          <Seg value={settings.sound ? 'on' : 'off'} onChange={(v) => set({ sound: v === 'on' })}
            options={[{ value: 'on', label: 'オン' }, { value: 'off', label: 'オフ' }]} />
          {settings.sound && (
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => playChime()}>🔔 試しに鳴らす</button>
          )}
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

      <LookSection settings={settings} />

      <OfflineSection />
      <MyAudioSection />
      <ReportsSection />
      <AudioBankSection />

      <AsrSection settings={settings} />

      <BackupSection />
      <Credits />
    </div>
  )
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
    // 旅の手帳の表現の語（items）はバックアップに入れていないので作り直す
    await syncPhraseItems()
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
