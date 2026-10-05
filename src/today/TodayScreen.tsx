import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import type { Tab } from '../App'
import { BLOCK_LABELS, PILLAR_LABELS, currentBlock, dayKey, planMenu } from './menu'
import { needsBackupReminder } from '../settings/backupReminder'

// 開発中のフェーズ番号。練習画面ができたら上げる
export const DEV_PHASE = 1

export function TodayScreen({ settings, onNavigate }: { settings: Settings; onNavigate: (t: Tab) => void }) {
  const today = dayKey()
  const doneSeconds = useLiveQuery(
    async () => (await db.sessions.where('day').equals(today).toArray()).reduce((s, x) => s + x.seconds, 0),
    [today],
    0,
  )
  const menu = planMenu(settings.targetMinutes, settings.blockOrder)
  const doneMin = Math.floor(doneSeconds / 60)
  const remaining = Math.max(0, settings.targetMinutes - doneMin)
  const pct = Math.min(100, (doneMin / settings.targetMinutes) * 100)
  const nowBlock = currentBlock(new Date(), settings.morningEnd, settings.noonEnd)

  const date = new Date()
  const dateLabel = date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div>
      {needsBackupReminder(settings) && (
        <div className="banner warn">
          前回のバックアップから1週間以上たちました。
          <button className="btn secondary" style={{ marginTop: 8, width: '100%' }} onClick={() => onNavigate('settings')}>
            設定でデータを書き出す
          </button>
        </div>
      )}

      <section className="card stack">
        <p className="muted">{dateLabel}</p>
        {settings.cue && <p className="cue">{settings.cue}</p>}
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>残り {remaining} 分</strong>
            <span className="muted">{doneMin} / {settings.targetMinutes} 分</span>
          </div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        </div>
        <button className="btn block" onClick={() => onNavigate('practice')}>
          ▶ {BLOCK_LABELS[nowBlock]}のメニューを始める
        </button>
        <p className="muted">最低ラインは「復習カード5分」。これだけでもその日は継続になります。</p>
      </section>

      {settings.blockOrder.map((block) => {
        const items = menu.filter((m) => m.block === block)
        const total = items.reduce((s, m) => s + m.minutes, 0)
        return (
          <section key={block}>
            <h3 className="block-title">
              {BLOCK_LABELS[block]}（{total}分）{block === nowBlock && ' ← いま'}
            </h3>
            {items.map((m) => (
              <div className="menu-item" key={m.kind}>
                <div className="body">
                  <div className="name">{m.label}</div>
                  <div className="muted">{m.detail}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className="tag">{PILLAR_LABELS[m.pillar]}</span>
                    {m.availableFrom > DEV_PHASE && <span className="tag soon">準備中</span>}
                  </div>
                </div>
                <div className="min">{m.minutes}分</div>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
