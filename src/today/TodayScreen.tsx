import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { BLOCK_LABELS, PILLAR_LABELS, currentBlock, dayKey, planMenu, type PracticeKind } from './menu'
import { DEV_PHASE } from './devPhase'
import { needsBackupReminder } from '../settings/backupReminder'
import { updateSettings } from '../db/settings'
import { loadStreak } from '../habit/streak'

export function TodayScreen({ settings, dueCount, onSettings, onStart, onDiagnostic }: {
  settings: Settings
  dueCount: number
  onSettings: () => void
  onStart: (k: PracticeKind) => void
  onDiagnostic: () => void
}) {
  const today = dayKey()
  const doneByKind = useLiveQuery(
    async () => {
      const out: Partial<Record<string, number>> = {}
      for (const s of await db.sessions.where('day').equals(today).toArray()) out[s.kind] = (out[s.kind] ?? 0) + s.seconds
      return out
    },
    [today],
    {} as Partial<Record<string, number>>,
  )
  // 練習の記録が変わるたびに連続日数を計算し直す
  const streak = useLiveQuery(() => loadStreak(), [])
  const menu = planMenu(settings.targetMinutes, settings.blockOrder)
  const doneSeconds = Object.values(doneByKind).reduce<number>((s, x) => s + (x ?? 0), 0)
  const doneMin = Math.floor(doneSeconds / 60)
  const remaining = Math.max(0, settings.targetMinutes - doneMin)
  const pct = Math.min(100, (doneMin / settings.targetMinutes) * 100)
  const nowBlock = currentBlock(new Date(), settings.morningEnd, settings.noonEnd)
  const ready = (k: PracticeKind) => (menu.find((m) => m.kind === k)?.availableFrom ?? 99) <= DEV_PHASE
  // いまのブロックで使える練習のうち最初のもの。なければ復習カード
  const startKind = menu.find((m) => m.block === nowBlock && ready(m.kind))?.kind ?? 'review'

  const dateLabel = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div>
      {settings.diagnosedAt <= 0 && (
        <div className="banner info">
          <strong>最初に診断テスト（約4分）</strong>を受けると、ちょうどよい難しさから始められます。
          <button className="btn block" style={{ marginTop: 8 }} onClick={onDiagnostic}>診断テストを受ける</button>
        </div>
      )}
      {needsBackupReminder(settings) && (
        <div className="banner warn">
          前回のバックアップから1週間以上たちました。
          <button className="btn secondary" style={{ marginTop: 8, width: '100%' }} onClick={onSettings}>
            設定でデータを書き出す
          </button>
        </div>
      )}

      {settings.phaseNotice > 0 && (
        <div className="banner ok">
          🎉 語彙が増えたので <strong>Phase {settings.phaseNotice}</strong> に上がりました。カードの答えの形や素材が変わります。
          <button className="btn secondary block" style={{ marginTop: 8 }} onClick={() => void updateSettings({ phaseNotice: 0 })}>
            わかった
          </button>
        </div>
      )}

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{dateLabel}</span>
          {streak && (
            <span className="streak">
              🔥 連続 <strong>{streak.current}</strong>日{streak.todayDone ? ' ✓' : ''}
              {streak.ticketLeft && <span className="muted" title="今週のお休み券"> 🎫</span>}
            </span>
          )}
        </div>
        {settings.cue && <p className="cue">{settings.cue}</p>}
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>残り {remaining} 分</strong>
            <span className="muted">{doneMin} / {settings.targetMinutes} 分</span>
          </div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        </div>
        <button className="btn block" onClick={() => onStart(startKind)}>
          ▶ {BLOCK_LABELS[nowBlock]}のメニューを始める
        </button>
        {streak && !streak.todayDone ? (
          <button className="btn secondary block" onClick={() => onStart('review')}>
            ⏱ 今日は5分だけ（復習カードの最低ライン）
          </button>
        ) : (
          <p className="muted">✓ 今日の最低ライン（5分）は達成済み。今日の雑学は図鑑に入っています。</p>
        )}
        <p className="muted">5分練習すればその日は「継続」（雑学を読む時間は含みません）。週に1回はお休み券で、休んでも連続日数が途切れません。</p>
      </section>

      {settings.blockOrder.map((block) => {
        const items = menu.filter((m) => m.block === block)
        const total = items.reduce((s, m) => s + m.minutes, 0)
        return (
          <section key={block}>
            <h3 className="block-title">
              {BLOCK_LABELS[block]}（{total}分）{block === nowBlock && ' ← いま'}
            </h3>
            {items.map((m) => {
              const doneM = Math.floor((doneByKind[m.kind] ?? 0) / 60)
              return (
                <button className="menu-item as-button" key={m.kind} disabled={!ready(m.kind)} onClick={() => onStart(m.kind)}>
                  <div className="body">
                    <div className="name">
                      {m.label}
                      {m.kind === 'review' && dueCount > 0 && <span className="badge">{dueCount}</span>}
                    </div>
                    <div className="muted">{m.detail}</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="tag">{PILLAR_LABELS[m.pillar]}</span>
                      {!ready(m.kind) && <span className="tag soon">準備中</span>}
                      {doneM > 0 && <span className="tag done">{doneM}分 済み</span>}
                    </div>
                  </div>
                  <div className="min">{m.minutes}分</div>
                </button>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
